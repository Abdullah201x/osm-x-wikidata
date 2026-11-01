"""
Unit Tests for pipeline.matcher.

Tests the Forward Conflation engine:
- Direct linked status (status = 2)
- ML Candidate match status (status = 1)
- Clean missing status (status = 0)
- Filtering of non-physical entities
- 15-element tuple layout contract [0..14]
"""

import sqlite3
import pytest
from pipeline.matcher import match_country_items


@pytest.fixture
def test_osm_db(tmp_path, monkeypatch):
    """Creates a temporary OSM cache SQLite database with synthetic candidate & linked data."""
    db_path = tmp_path / "test_osm_cache.db"
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    cur.execute("""
    CREATE TABLE osm_linked (
        osm_type TEXT,
        osm_id INTEGER,
        qid TEXT PRIMARY KEY
    )
    """)
    cur.execute("""
    CREATE TABLE osm_candidates (
        osm_type TEXT,
        osm_id INTEGER,
        lat REAL,
        lon REAL,
        name TEXT,
        name_ar TEXT,
        name_en TEXT,
        main_key TEXT,
        main_val TEXT
    )
    """)

    # Linked item: Q100 linked to node 1000
    cur.execute("INSERT INTO osm_linked VALUES ('node', 1000, 'Q100')")

    # Unlinked candidate: node 2000 near (26.2, 50.5)
    cur.execute("""
    INSERT INTO osm_candidates VALUES
    ('node', 2000, 26.2001, 50.5001, 'مسجد النور', 'مسجد النور', 'Al Noor Mosque', 'amenity', 'place_of_worship')
    """)

    conn.commit()
    conn.close()

    monkeypatch.setattr("pipeline.matcher.OSM_CACHE_DB", str(db_path))
    return db_path


def test_matcher_direct_linked(test_osm_db):
    wd_items = [
        {
            "qid": "Q100",
            "lat": 26.2,
            "lon": 50.5,
            "cat": 6,
            "p31": "Q32815",
            "name_ar": "مسجد الفتح",
            "name_en": "Al Fath Mosque",
        }
    ]

    result = match_country_items("BH", wd_items)
    assert result["country"] == "BH"
    assert result["counts"]["linked"] == 1
    assert len(result["items"]) == 1

    item = result["items"][0]
    assert item[0] == 100     # qid_num
    assert item[4] == 2       # status 2: LINKED
    assert item[8] == "node1000"


def test_matcher_candidate_match(test_osm_db):
    wd_items = [
        {
            "qid": "Q200",
            "lat": 26.2000,
            "lon": 50.5000,
            "cat": 6,
            "p31": "Q32815",
            "name_ar": "مسجد النور",
            "name_en": "Al Noor Mosque",
        }
    ]

    result = match_country_items("BH", wd_items)
    assert result["counts"]["candidates"] == 1
    item = result["items"][0]
    assert item[0] == 200
    assert item[4] == 1       # status 1: CANDIDATE_MATCH
    assert item[8] == "node2000"
    assert "Match" in item[9]


def test_matcher_missing_in_osm(test_osm_db):
    # Remote point with no nearby candidate
    wd_items = [
        {
            "qid": "Q300",
            "lat": 26.0000,
            "lon": 50.0000,
            "cat": 6,
            "p31": "Q32815",
            "name_ar": "مسجد بعيد",
            "name_en": "Remote Mosque",
        }
    ]

    result = match_country_items("BH", wd_items)
    assert result["counts"]["missing"] == 1
    item = result["items"][0]
    assert item[0] == 300
    assert item[4] == 0       # status 0: MISSING_IN_OSM
    assert item[8] == ""


def test_matcher_filters_non_physical(test_osm_db):
    wd_items = [
        {
            "qid": "Q400",
            "lat": 26.2,
            "lon": 50.5,
            "cat": 1,
            "p31": "Q5",  # Human
            "name_ar": "شخصية تاريخية",
            "name_en": "Historical Person",
        }
    ]

    result = match_country_items("BH", wd_items)
    assert result["counts"]["filtered_non_physical"] == 1
    assert len(result["items"]) == 0


def test_matcher_15_tuple_layout(test_osm_db):
    wd_items = [
        {
            "qid": "Q555",
            "lat": 26.22,
            "lon": 50.58,
            "cat": 2,
            "p31": "Q1234",
            "name_ar": "متحف البحرين",
            "name_en": "Bahrain Museum",
            "image": "http://commons/img.jpg",
            "wikipedia_ar": "متحف_البحرين",
            "website": "https://museum.bh",
            "dissolved": "",
            "twitter": "museum_bh"
        }
    ]

    result = match_country_items("BH", wd_items)
    assert len(result["items"]) == 1
    t = result["items"][0]

    # Verify exact 15-element layout
    assert len(t) == 15
    assert t[0] == 555                     # [0] qid_num
    assert t[1] == 26.22                   # [1] lat
    assert t[2] == 50.58                   # [2] lon
    assert t[3] == 2                       # [3] cat_id
    assert t[4] in (0, 1, 2)               # [4] status
    assert t[5] == "متحف البحرين"          # [5] name_ar
    assert t[6] == "Bahrain Museum"        # [6] name_en
    assert t[7] == "Q1234"                 # [7] p31
    assert isinstance(t[8], str)           # [8] osm_ref
    assert isinstance(t[9], str)           # [9] cand_info
    assert t[10] == "http://commons/img.jpg" # [10] image
    assert t[11] == "متحف_البحرين"         # [11] wiki_ar
    assert t[12] == "https://museum.bh"    # [12] website
    assert t[13] == ""                     # [13] dissolved
    assert t[14] == "museum_bh||"          # [14] social_pipe
