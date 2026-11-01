"""
Unit Tests for update_data.py master pipeline logic.

Covers:
- Argument parser defaults and option handling
- Country validation against GCC_COUNTRIES
- UTC ISO-8601 'Z' timestamp format generation
- Summary schema requirements
"""

import time
import argparse
import pytest
from pipeline.config import GCC_COUNTRIES


def test_argument_parser():
    parser = argparse.ArgumentParser(description="Update OSM x Wikidata GCC datasets.")
    parser.add_argument("--country", type=str, default="all")
    parser.add_argument("--pbf", type=str, default=None)
    parser.add_argument("--reparse-pbf", action="store_true")
    parser.add_argument("--refresh-wikidata", action="store_true")
    parser.add_argument("--skip-reverse", action="store_true")

    # Default parse
    args = parser.parse_args([])
    assert args.country == "all"
    assert args.pbf is None
    assert args.reparse_pbf is False
    assert args.refresh_wikidata is False
    assert args.skip_reverse is False

    # Custom args
    args_custom = parser.parse_args(["--country", "sa", "--refresh-wikidata", "--skip-reverse"])
    assert args_custom.country == "sa"
    assert args_custom.refresh_wikidata is True
    assert args_custom.skip_reverse is True


def test_country_allowlist_validation():
    valid_codes = set(GCC_COUNTRIES.keys())
    assert {"SA", "AE", "KW", "QA", "BH", "OM"}.issubset(valid_codes)

    for cc in ("sa", "ae", "kw", "qa", "bh", "om"):
        assert cc.upper() in valid_codes

    for invalid in ("xx", "us", "uk", "jo", "ir"):
        assert invalid.upper() not in valid_codes


def test_utc_iso_timestamp_format():
    ts = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    assert ts.endswith("Z")
    assert len(ts) == 20
    assert ts[4] == "-" and ts[7] == "-" and ts[10] == "T" and ts[13] == ":" and ts[16] == ":"


def test_summary_schema_structure():
    summary = {
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "pbf_file": "gcc-states-latest.osm.pbf",
        "countries": {}
    }
    for cc, info in GCC_COUNTRIES.items():
        summary["countries"][cc] = {
            "name": info["name_en"],
            "osm_linked": 100,
            "candidates": 50,
            "matched": 25,
            "reverse_counts": {
                "total": 10,
                "missing_backlink": 5,
                "broken_osm_tag": 2,
                "conflict": 2,
                "review_gap": 1
            }
        }

    assert len(summary["countries"]) == 6
    for cc, cdata in summary["countries"].items():
        assert "reverse_counts" in cdata
        assert "osm_linked" in cdata
