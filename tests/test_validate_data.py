"""
Tests for pipeline/validate_data.py
Verifies dataset shrink guard, schema validation, and error reporting.
"""

import json
from pipeline.validate_data import (
    validate_forward_dataset,
    validate_reverse_dataset,
    validate_all_datasets,
    MIN_RATIO,
)


def test_validate_forward_dataset_valid(tmp_path):
    """Verify forward dataset validation passes on valid 15-element rows."""
    file_path = tmp_path / "valid.json"
    valid_data = {
        "country": "BH",
        "items": [
            [270500, 26.25, 50.60, 1, 1, "المنامة", "Manama", "Q515", "n123", "", "", "", "", "", ""]
        ]
    }
    file_path.write_text(json.dumps(valid_data), encoding="utf-8")

    errors, count = validate_forward_dataset("BH", str(file_path))
    assert errors == []
    assert count == 1


def test_validate_forward_dataset_broken_schema(tmp_path):
    """Verify forward dataset validation catches rows with incorrect element count."""
    file_path = tmp_path / "invalid_schema.json"
    invalid_data = {
        "country": "BH",
        "items": [
            [270500, 26.25, 50.60]  # Only 3 elements instead of 15
        ]
    }
    file_path.write_text(json.dumps(invalid_data), encoding="utf-8")

    errors, count = validate_forward_dataset("BH", str(file_path))
    assert len(errors) > 0
    assert "15-element list" in errors[0]


def test_validate_forward_dataset_empty_records(tmp_path):
    """Verify empty dataset triggers an error."""
    file_path = tmp_path / "empty.json"
    file_path.write_text(json.dumps({"country": "BH", "items": []}), encoding="utf-8")

    errors, count = validate_forward_dataset("BH", str(file_path))
    assert any("empty" in e for e in errors)
    assert count == 0


def test_validate_reverse_dataset_valid(tmp_path):
    """Verify reverse dataset validation passes on valid QA anomalies."""
    file_path = tmp_path / "reverse_valid.json"
    valid_data = {
        "items": [
            {
                "osm_type": "n",
                "osm_id": 12345,
                "qid": "Q999",
                "kind": "missing_backlink",
                "confidence": 0.85,
                "reasons": ["High confidence match"]
            }
        ]
    }
    file_path.write_text(json.dumps(valid_data), encoding="utf-8")

    errors, count = validate_reverse_dataset("BH", str(file_path))
    assert errors == []
    assert count == 1


def test_validate_reverse_dataset_missing_keys(tmp_path):
    """Verify reverse dataset validation catches missing required QA keys."""
    file_path = tmp_path / "reverse_missing_keys.json"
    invalid_data = {
        "items": [
            {
                "osm_type": "n",
                "osm_id": 12345
                # Missing qid, kind, confidence, reasons
            }
        ]
    }
    file_path.write_text(json.dumps(invalid_data), encoding="utf-8")

    errors, count = validate_reverse_dataset("BH", str(file_path))
    assert len(errors) > 0
    assert "missing required QA keys" in errors[0]


def test_validate_all_datasets_on_committed_repo():
    """Verify the real committed repo datasets all pass validate_all_datasets."""
    errors = validate_all_datasets()
    assert errors == [], f"Committed datasets failed validation: {errors}"
