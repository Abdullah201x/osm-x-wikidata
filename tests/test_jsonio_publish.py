"""Tests for pipeline/jsonio.py (one item per line) and pipeline/publish_filter.py."""

import io
import json
import subprocess

import pipeline.publish_filter as pf
from pipeline.jsonio import dump_items_per_line, write_dataset


def test_items_per_line_is_valid_compact_json():
    obj = {"country": "SA", "name_ar": "السعودية", "counts": {"a": 1}, "items": [[1, 2.5, "x"], [2, 3.0, "ي"]]}
    buf = io.StringIO()
    dump_items_per_line(obj, buf)
    text = buf.getvalue()
    assert json.loads(text) == obj
    lines = text.splitlines()
    assert lines[1:3] == ['[1,2.5,"x"],', '[2,3.0,"ي"]']  # one item per line, Arabic kept as-is
    assert lines[0].endswith('"items":[') and lines[-1] == "]}"


def test_items_per_line_handles_empty_lists(tmp_path):
    path = write_dataset(str(tmp_path / "x.json"), {"country": "BH", "items": []})
    assert json.loads(open(path, encoding="utf-8").read()) == {"country": "BH", "items": []}
    assert not (tmp_path / "x.json.tmp").exists()


def test_committed_datasets_use_one_item_per_line():
    from pipeline.config import DATA_DIR
    import os

    for name in ("sa.json", "sa_linkable.json", "reverse_sa.json"):
        with open(os.path.join(DATA_DIR, name), encoding="utf-8") as f:
            data = json.loads(f.read())
            f.seek(0)
            assert sum(1 for _ in f) == len(data["items"]) + 2, name


def test_same_content_ignores_only_timestamps():
    a = {"generated_at": "2026-11-01T00:00:00Z", "items": [1, 2]}
    assert pf.same_content({"generated_at": "2026-11-06T00:00:00Z", "items": [1, 2]}, a)
    assert pf.same_content({"updated_at": "x", "generated_at": "y", "items": [1, 2]}, {"items": [1, 2]})
    assert not pf.same_content({"generated_at": "2026-11-06T00:00:00Z", "items": [1, 3]}, a)


def _git(repo, *args):
    subprocess.run(["git", *args], cwd=repo, check=True, capture_output=True)


def test_filter_unchanged_restores_timestamp_only_rewrites(tmp_path, monkeypatch):
    repo = tmp_path
    data = repo / "data"
    data.mkdir()
    _git(repo, "init", "-q")
    _git(repo, "config", "user.email", "t@example.org")
    _git(repo, "config", "user.name", "t")
    _git(repo, "config", "core.autocrlf", "false")
    write_dataset(str(data / "reverse_sa.json"), {"generated_at": "2026-11-01", "items": [1]})
    write_dataset(str(data / "sa.json"), {"items": [1]})
    (data / "summary.json").write_text('{"updated_at": "2026-11-01"}', encoding="utf-8")
    _git(repo, "add", ".")
    _git(repo, "commit", "-q", "-m", "init")

    # A refresh: reverse only gets a new timestamp, sa.json really changes, summary always changes.
    write_dataset(str(data / "reverse_sa.json"), {"generated_at": "2026-11-06", "items": [1]})
    write_dataset(str(data / "sa.json"), {"items": [1, 2]})
    write_dataset(str(data / "new.json"), {"items": []})
    (data / "summary.json").write_text('{"updated_at": "2026-11-06"}', encoding="utf-8")

    monkeypatch.setattr(pf, "BASE_DIR", str(repo))
    restored, changed = pf.filter_unchanged(str(data))
    assert restored == ["data/reverse_sa.json"]
    assert changed == ["data/new.json", "data/sa.json"]
    assert json.loads((data / "reverse_sa.json").read_text(encoding="utf-8"))["generated_at"] == "2026-11-01"
    assert json.loads((data / "summary.json").read_text(encoding="utf-8"))["updated_at"] == "2026-11-06"
