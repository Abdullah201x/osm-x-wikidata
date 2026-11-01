"""
Tests for dataset integrity across all committed GCC datasets.
Validates forward datasets (15-element tuples), reverse datasets (QA anomaly schema),
and summary.json structure to guarantee downstream contracts (Manara, frontend, backend).
"""

import json
import os
import pytest
from pipeline.config import DATA_DIR, GCC_COUNTRIES


def test_upstream_contract_sa_json():
    """
    CRITICAL: Manara's nightly pipeline downloads data/sa.json directly from main.
    The file must exist, be valid JSON, and have 15-element rows [0..14]:
      [0] qid_num (int)
      [1] lat (float)
      [2] lon (float)
      [3] cat_id (int 1..6)
      [4] status (int)
      [5] name_ar (str)
      [6] name_en (str)
      [7] p31 (str)
      [8] osm_ref (str)
      [9] cand_info (str)
      [10] image (str)
      [11] wikipedia_ar (str)
      [12] website (str)
      [13] dissolved (str)
      [14] social_pipe (str)
    """
    sa_path = os.path.join(DATA_DIR, "sa.json")
    assert os.path.exists(sa_path), "data/sa.json must exist in repository root data/ dir"

    with open(sa_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    assert isinstance(data, dict)
    assert "items" in data
    assert len(data["items"]) > 0, "sa.json items must not be empty"

    # Sample first 100 items for rigorous tuple layout check
    for item in data["items"][:100]:
        assert isinstance(item, list)
        assert len(item) == 15, f"Every row in sa.json must have exactly 15 elements, got {len(item)}"
        assert isinstance(item[0], int) and item[0] > 0, f"Item[0] must be numeric QID, got {item[0]}"
        assert isinstance(item[1], (int, float)), f"Item[1] lat must be numeric, got {item[1]}"
        assert isinstance(item[2], (int, float)), f"Item[2] lon must be numeric, got {item[2]}"
        assert isinstance(item[3], int) and 1 <= item[3] <= 6, f"Item[3] must be category 1..6, got {item[3]}"
        assert isinstance(item[4], int), f"Item[4] status must be int, got {item[4]}"
        assert isinstance(item[5], str)  # name_ar
        assert isinstance(item[6], str)  # name_en
        assert isinstance(item[7], str)  # p31
        assert isinstance(item[8], str)  # osm_ref


@pytest.mark.parametrize("cc", ["sa", "ae", "kw", "qa", "bh", "om"])
def test_forward_dataset_schema(cc):
    """Verify all GCC forward datasets adhere to the unified 15-element schema."""
    path = os.path.join(DATA_DIR, f"{cc}.json")
    assert os.path.exists(path), f"Forward dataset missing: {path}"

    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    assert data["country"].upper() == cc.upper()
    assert "country_name_en" in data
    assert "country_name_ar" in data
    assert "center" in data and len(data["center"]) == 2
    assert "zoom" in data and 5 <= data["zoom"] <= 12
    assert "counts" in data
    assert "items" in data
    assert isinstance(data["items"], list)

    # Check row layout for every item
    for item in data["items"]:
        assert len(item) == 15
        assert isinstance(item[0], int)
        assert isinstance(item[1], (int, float))
        assert isinstance(item[2], (int, float))
        assert 1 <= item[3] <= 6


@pytest.mark.parametrize("cc", ["sa", "ae", "kw", "qa", "bh", "om"])
def test_reverse_dataset_schema(cc):
    """Verify all GCC reverse datasets adhere to the QA anomaly schema."""
    path = os.path.join(DATA_DIR, f"reverse_{cc}.json")
    assert os.path.exists(path), f"Reverse dataset missing: {path}"

    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    assert data["country"].upper() == cc.upper()
    assert "country_name_en" in data
    assert "country_name_ar" in data
    assert "generated_at" in data
    assert "counts" in data
    assert "items" in data
    assert isinstance(data["items"], list)

    required_keys = {
        "osm_type", "osm_id", "qid", "kind", "subkind",
        "confidence", "reasons", "suggested_fix", "osm", "wikidata"
    }

    valid_osm_types = {"node", "way", "relation", "n", "w", "r"}

    for item in data["items"]:
        assert isinstance(item, dict)
        assert required_keys.issubset(item.keys())
        assert item["osm_type"] in valid_osm_types
        assert isinstance(item["osm_id"], int)
        assert str(item["qid"]).startswith("Q")
        assert isinstance(item["confidence"], (int, float))
        assert 0.0 <= item["confidence"] <= 1.0
        assert isinstance(item["reasons"], list)
        assert item["suggested_fix"] is None or isinstance(item["suggested_fix"], dict)
        assert item["osm"] is None or isinstance(item["osm"], dict)
        assert item["wikidata"] is None or isinstance(item["wikidata"], dict)


def test_summary_json():
    """Verify summary.json aggregates stats across all 6 GCC countries."""
    summary_path = os.path.join(DATA_DIR, "summary.json")
    assert os.path.exists(summary_path), "data/summary.json must exist"

    with open(summary_path, "r", encoding="utf-8") as f:
        summary = json.load(f)

    assert "updated_at" in summary
    assert "total_items" in summary
    assert "total_missing" in summary
    assert "total_candidates" in summary
    assert "total_linked" in summary
    assert "countries" in summary

    expected_cc = set(GCC_COUNTRIES.keys())
    assert set(summary["countries"].keys()) == expected_cc

    # Aggregate counts sanity check
    sum_items = sum(c["counts"]["total"] for c in summary["countries"].values())
    assert summary["total_items"] == sum_items
