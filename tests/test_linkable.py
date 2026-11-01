"""
Tests for pipeline/linkable.py and the linkable checks in pipeline/validate_data.py.
Imports are restricted to approved OSM users, so the public dataset must never carry status-0 items.
"""

import copy
import json

import pytest

from pipeline.linkable import derive_linkable, write_linkable, linkable_path
from pipeline.validate_data import validate_linkable_dataset


def row(qid, status):
    # 15-slot tuple: [qid_num, lat, lon, cat, status, name_ar, name_en, p31, osm_ref, ...]
    return [qid, 26.2, 50.5, 1, status, "اسم", "Name", "Q32815", "n1" if status else "", "", "", "", "", "", ""]


@pytest.fixture
def full():
    return {
        "country": "BH",
        "country_name_en": "Bahrain",
        "center": [26.0, 50.5],
        "zoom": 9,
        "counts": {"total": 5, "missing": 2, "candidates": 2, "linked": 1, "filtered_non_physical": 7},
        "items": [row(1, 0), row(2, 1), row(3, 2), row(4, 0), row(5, 1)],
    }


def test_derive_drops_missing_items_and_counts(full):
    out = derive_linkable(full)
    assert [it[0] for it in out["items"]] == [2, 3, 5]
    assert all(it[4] in (1, 2) for it in out["items"])
    assert out["counts"] == {"total": 3, "candidates": 2, "linked": 1, "filtered_non_physical": 7}
    assert "missing" not in out["counts"]


def test_derive_keeps_envelope_and_does_not_mutate_input(full):
    before = copy.deepcopy(full)
    out = derive_linkable(full)
    assert full == before
    for key in ("country", "country_name_en", "center", "zoom"):
        assert out[key] == full[key]


def test_write_linkable_is_atomic_and_valid(tmp_path, full):
    (tmp_path / "bh.json").write_text(json.dumps(full), encoding="utf-8")
    out = write_linkable(str(tmp_path), "BH")
    assert out == linkable_path(str(tmp_path), "bh")
    assert not list(tmp_path.glob("*.tmp"))
    assert json.loads((tmp_path / "bh_linkable.json").read_text(encoding="utf-8")) == derive_linkable(full)


def write_pair(tmp_path, full, linkable):
    (tmp_path / "bh.json").write_text(json.dumps(full), encoding="utf-8")
    (tmp_path / "bh_linkable.json").write_text(json.dumps(linkable), encoding="utf-8")
    return str(tmp_path / "bh_linkable.json"), str(tmp_path / "bh.json")


def test_validator_accepts_a_correct_linkable_file(tmp_path, full):
    errors, count = validate_linkable_dataset("bh", *write_pair(tmp_path, full, derive_linkable(full)))
    assert errors == []
    assert count == 3


def test_validator_rejects_a_status_zero_item(tmp_path, full):
    bad = derive_linkable(full)
    bad["items"].append(row(9, 0))
    bad["counts"]["total"] = 4
    errors, _ = validate_linkable_dataset("bh", *write_pair(tmp_path, full, bad))
    assert any("not status 1" in e for e in errors)


def test_validator_rejects_exposed_missing_count_and_inconsistent_counts(tmp_path, full):
    bad = derive_linkable(full)
    bad["counts"]["missing"] = 2
    bad["counts"]["total"] = 99
    errors, _ = validate_linkable_dataset("bh", *write_pair(tmp_path, full, bad))
    assert any("must not expose 'missing'" in e for e in errors)
    assert any("inconsistent" in e for e in errors)


def test_validator_rejects_a_stale_linkable_file(tmp_path, full):
    stale = derive_linkable(full)
    full["items"].append(row(6, 2))  # full dataset moved on, linkable was not regenerated
    errors, _ = validate_linkable_dataset("bh", *write_pair(tmp_path, full, stale))
    assert any("stale" in e for e in errors)


def test_validator_enforces_the_size_budget(tmp_path, full, monkeypatch):
    import pipeline.validate_data as vd

    monkeypatch.setattr(vd, "DEFAULT_MAX_LINKABLE_BYTES", 10)
    errors, _ = validate_linkable_dataset("bh", *write_pair(tmp_path, full, derive_linkable(full)))
    assert any("budget" in e for e in errors)


def test_validator_reports_a_missing_file(tmp_path, full):
    errors, count = validate_linkable_dataset("bh", str(tmp_path / "nope.json"), str(tmp_path / "bh.json"))
    assert count == 0
    assert any("does not exist" in e for e in errors)
