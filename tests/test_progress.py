"""Tests for pipeline/progress.py (progress-over-time rows in data/progress.json)."""

import json
import os

from pipeline.config import DATA_DIR
from pipeline.progress import (
    MAX_ROWS,
    PROGRESS_FILE,
    append_progress,
    merge_rows,
    rows_from_summary,
    validate_progress,
)

SUMMARY = {
    "countries": {
        "SA": {
            "counts": {"total": 10, "missing": 2, "candidates": 3, "linked": 5},
            "reverse_counts": {"missing_backlink": 7, "broken_osm_tag": 1, "conflict": 2},
        },
        "BH": {"counts": {"total": 1, "missing": 0, "candidates": 0, "linked": 1}},
    }
}


def test_rows_from_summary_one_row_per_country():
    rows = rows_from_summary(SUMMARY, "2026-11-06")
    assert rows == [
        {"date": "2026-11-06", "cc": "bh", "linked": 1, "candidates": 0, "missing_backlink": 0, "broken": 0, "conflict": 0},
        {"date": "2026-11-06", "cc": "sa", "linked": 5, "candidates": 3, "missing_backlink": 7, "broken": 1, "conflict": 2},
    ]


def test_merge_replaces_same_day_and_caps_rows():
    old = [{"date": "2026-11-05", "cc": "sa", "linked": 1}, {"date": "2026-11-06", "cc": "sa", "linked": 2}]
    new = [{"date": "2026-11-06", "cc": "sa", "linked": 3}]
    assert merge_rows(old, new) == [old[0], new[0]]

    many = [{"date": f"2026-01-{d:02d}", "cc": "sa"} for d in range(1, 29)]
    capped = merge_rows(many, [], max_rows=5)
    assert [r["date"] for r in capped] == ["2026-01-24", "2026-01-25", "2026-01-26", "2026-01-27", "2026-01-28"]


def test_append_progress_writes_valid_one_row_per_line_json(tmp_path):
    path = append_progress(str(tmp_path), SUMMARY, "2026-11-05")
    append_progress(str(tmp_path), SUMMARY, "2026-11-06")
    append_progress(str(tmp_path), SUMMARY, "2026-11-06")  # same-day re-run replaces, not duplicates

    with open(path, encoding="utf-8") as f:
        text = f.read()
    data = json.loads(text)
    assert data["version"] == 1
    assert [(r["date"], r["cc"]) for r in data["rows"]] == [
        ("2026-11-05", "bh"), ("2026-11-05", "sa"), ("2026-11-06", "bh"), ("2026-11-06", "sa"),
    ]
    assert len(text.strip().splitlines()) == 2 + 4  # header + rows + footer
    assert validate_progress(path) == []
    assert not os.path.exists(path + ".tmp")


def test_validate_progress_rejects_bad_rows(tmp_path):
    path = tmp_path / "progress.json"
    rows = [
        {"date": "2026-11-06", "cc": "sa", "linked": 1, "candidates": 0, "missing_backlink": 0, "broken": 0, "conflict": 0},
        {"date": "2026-11-06", "cc": "sa", "linked": 1, "candidates": 0, "missing_backlink": 0, "broken": 0, "conflict": 0},
        {"date": "06/11/2026", "cc": "xx", "linked": -1, "candidates": "3", "missing_backlink": 0, "broken": True, "conflict": 0},
    ]
    path.write_text(json.dumps({"version": 1, "rows": rows}), encoding="utf-8")
    errors = " | ".join(validate_progress(str(path)))
    assert "duplicate row" in errors
    assert "bad date" in errors
    assert "unknown country" in errors
    assert "linked must be a non-negative integer" in errors
    assert "candidates must be a non-negative integer" in errors
    assert "broken must be a non-negative integer" in errors

    path.write_text(json.dumps({"rows": []}), encoding="utf-8")
    assert validate_progress(str(path))
    assert validate_progress(str(tmp_path / "missing.json"))


def test_validate_progress_caps_row_count(tmp_path):
    path = tmp_path / "progress.json"
    rows = [
        {"date": f"{2000 + i // 365:04d}-01-01", "cc": cc, "linked": 0, "candidates": 0, "missing_backlink": 0, "broken": 0, "conflict": 0}
        for i, cc in enumerate(["sa", "ae", "kw", "qa", "bh", "om"] * 70)
    ]
    path.write_text(json.dumps({"version": 1, "rows": rows[: MAX_ROWS + 1]}), encoding="utf-8")
    assert any("max" in e for e in validate_progress(str(path)))


def test_committed_progress_file_is_valid():
    assert validate_progress(os.path.join(DATA_DIR, PROGRESS_FILE)) == []
