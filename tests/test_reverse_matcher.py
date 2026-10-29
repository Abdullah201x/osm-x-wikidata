"""
Comprehensive Unit Tests for Reverse Matcher Engine.
Uses in-memory SQLite fixtures with explicit UTF-8 string encoding.
"""

import json
import sqlite3
import pytest

from pipeline.reverse_matcher import (
    ReverseAnalyzer,
    normalize_malformed_qid,
    haversine_distance_m,
    init_tagged_qid_cache
)
from pipeline.arabic_normalizer import match_names_composite, strip_serial_suffix
from pipeline.country_boundaries import CountryMatcher

@pytest.fixture
def in_memory_dbs():
    osm_conn = sqlite3.connect(":memory:")
    wd_conn = sqlite3.connect(":memory:")

    # OSM tables
    osm_cursor = osm_conn.cursor()
    osm_cursor.execute("""
    CREATE TABLE osm_linked (
        osm_type TEXT NOT NULL,
        osm_id INTEGER NOT NULL,
        lat REAL NOT NULL,
        lon REAL NOT NULL,
        qid TEXT NOT NULL,
        name TEXT,
        name_ar TEXT,
        name_en TEXT,
        main_key TEXT,
        main_val TEXT,
        tags_json TEXT,
        PRIMARY KEY (osm_type, osm_id)
    )
    """)
    osm_cursor.execute("""
    CREATE TABLE osm_relation_members (
        rel_id INTEGER NOT NULL,
        member_type TEXT NOT NULL,
        member_id INTEGER NOT NULL,
        role TEXT,
        PRIMARY KEY (rel_id, member_type, member_id, role)
    )
    """)
    osm_conn.commit()

    # Wikidata tables
    init_tagged_qid_cache(wd_conn)

    yield osm_conn, wd_conn
    osm_conn.close()
    wd_conn.close()

def test_normalize_malformed_qid():
    assert normalize_malformed_qid("Q851") == "Q851"
    assert normalize_malformed_qid("q851") == "Q851"
    assert normalize_malformed_qid("851") == "Q851"
    assert normalize_malformed_qid("https://www.wikidata.org/wiki/Q851") == "Q851"
    assert normalize_malformed_qid("wd:Q851") == "Q851"
    assert normalize_malformed_qid("invalid_string") is None

def test_arabic_serial_suffix_and_transliteration():
    # Disambiguation trailing number stripping
    assert strip_serial_suffix("جامع الرمال 1") == "جامع الرمال"
    assert strip_serial_suffix("مسجد السلام ٢") == "مسجد السلام"

    # Composite name matching
    sim1 = match_names_composite("جامع الرمال 1", "", "جامع الرمال", "")
    assert sim1 >= 0.95

    # Cross-script matching (Arabic vs Latin)
    sim2 = match_names_composite("مسجد الرمال", "", "", "Al Rimal Mosque")
    assert sim2 >= 0.70

def test_missing_backlink_high_confidence(in_memory_dbs):
    osm_conn, wd_conn = in_memory_dbs
    analyzer = ReverseAnalyzer(osm_conn, wd_conn)

    osm_obj = {
        "osm_type": "n",
        "osm_id": 1001,
        "lat": 24.7136,
        "lon": 46.6753,
        "qid": "Q99901",
        "name": "جامع الرمال",
        "name_ar": "جامع الرمال",
        "name_en": "Al Rimal Mosque",
        "main_key": "amenity",
        "main_val": "place_of_worship",
        "tags": {"amenity": "place_of_worship"}
    }
    wd_entity = {
        "qid": "Q99901",
        "status": "exists",
        "labels": {"ar": "جامع الرمال 1", "en": "Al Rimal Mosque"},
        "descriptions": {"ar": "مسجد في الرياض"},
        "p31": ["Q32815"],  # Mosque
        "p17": ["Q851"],
        "lat": 24.7137,
        "lon": 46.6754,
        "p11693": [],
        "p10689": [],
        "p402": []
    }

    findings = analyzer.audit_object(osm_obj, wd_entity, multi_info=None, existing_osm_ids={"n1001"})
    assert len(findings) == 1
    f = findings[0]
    assert f["kind"] == "missing_backlink"
    assert f["subkind"] == "high_confidence"
    assert f["confidence"] >= 0.85
    assert f["suggested_fix"]["property"] == "P11693"
    assert f["suggested_fix"]["value"] == "1001"

def test_broken_osm_tag_malformed(in_memory_dbs):
    osm_conn, wd_conn = in_memory_dbs
    analyzer = ReverseAnalyzer(osm_conn, wd_conn)

    osm_obj = {
        "osm_type": "n",
        "osm_id": 1002,
        "lat": 24.0,
        "lon": 45.0,
        "qid": "q851",
        "name": "Saudi Arabia",
        "name_ar": "",
        "name_en": "",
        "main_key": "",
        "main_val": "",
        "tags": {}
    }

    findings = analyzer.audit_object(osm_obj, None, None, {"n1002"})
    assert len(findings) == 1
    f = findings[0]
    assert f["kind"] == "broken_osm_tag"
    assert f["subkind"] == "malformed_qid"
    assert f["suggested_fix"]["value"] == "Q851"

def test_broken_osm_tag_redirect(in_memory_dbs):
    osm_conn, wd_conn = in_memory_dbs
    analyzer = ReverseAnalyzer(osm_conn, wd_conn)

    osm_obj = {
        "osm_type": "n",
        "osm_id": 1003,
        "lat": 24.0,
        "lon": 45.0,
        "qid": "Q100",
        "name": "Old Entity",
        "name_ar": "",
        "name_en": "",
        "main_key": "",
        "main_val": "",
        "tags": {}
    }
    wd_entity = {
        "qid": "Q100",
        "status": "redirect",
        "redirect_target": "Q200",
        "labels": {},
        "descriptions": {},
        "p31": []
    }

    findings = analyzer.audit_object(osm_obj, wd_entity, None, {"n1003"})
    assert len(findings) == 1
    f = findings[0]
    assert f["kind"] == "broken_osm_tag"
    assert f["subkind"] == "redirected_qid"
    assert f["suggested_fix"]["value"] == "Q200"

def test_wrong_key_migration_human(in_memory_dbs):
    osm_conn, wd_conn = in_memory_dbs
    analyzer = ReverseAnalyzer(osm_conn, wd_conn)

    osm_obj = {
        "osm_type": "w",
        "osm_id": 2001,
        "lat": 24.7,
        "lon": 46.7,
        "qid": "Q500",
        "name": "شارع الملك فهد",
        "name_ar": "شارع الملك فهد",
        "name_en": "King Fahd Road",
        "main_key": "highway",
        "main_val": "primary",
        "tags": {"highway": "primary"}
    }
    wd_entity = {
        "qid": "Q500",
        "status": "exists",
        "labels": {"ar": "فهد بن عبد العزيز", "en": "Fahd of Saudi Arabia"},
        "descriptions": {"ar": "ملك سابق"},
        "p31": ["Q5"],  # Human!
        "p17": ["Q851"]
    }

    findings = analyzer.audit_object(osm_obj, wd_entity, None, {"w2001"})
    assert len(findings) == 1
    f = findings[0]
    assert f["kind"] == "broken_osm_tag"
    assert f["subkind"] == "wrong_wikidata_key"
    assert f["suggested_fix"]["to_tag"] == "name:etymology:wikidata"
    assert f["suggested_fix"]["value"] == "Q500"

def test_wrong_key_migration_brand(in_memory_dbs):
    osm_conn, wd_conn = in_memory_dbs
    analyzer = ReverseAnalyzer(osm_conn, wd_conn)

    osm_obj = {
        "osm_type": "n",
        "osm_id": 1004,
        "lat": 24.7,
        "lon": 46.7,
        "qid": "Q4830453",
        "name": "ستاربكس",
        "name_ar": "ستاربكس",
        "name_en": "Starbucks",
        "main_key": "amenity",
        "main_val": "cafe",
        "tags": {"amenity": "cafe"}
    }
    wd_entity = {
        "qid": "Q4830453",
        "status": "exists",
        "labels": {"ar": "ستاربكس", "en": "Starbucks"},
        "descriptions": {"en": "coffee chain"},
        "p31": ["Q4830453"], # Company / enterprise
        "p17": ["Q30"]
    }

    findings = analyzer.audit_object(osm_obj, wd_entity, None, {"n1004"})
    assert len(findings) == 1
    f = findings[0]
    assert f["kind"] == "broken_osm_tag"
    assert f["subkind"] == "wrong_wikidata_key"
    assert f["suggested_fix"]["to_tag"] == "brand:wikidata"

def test_unmapped_legitimate_classes_no_false_conflict(in_memory_dbs):
    osm_conn, wd_conn = in_memory_dbs
    analyzer = ReverseAnalyzer(osm_conn, wd_conn)

    # Q928830 (metro station), Q11303 (skyscraper), Q66661665 (Saudi governorate)
    for qid, p31_class, name in [
        ("Q928830", "Q928830", "Olaya Metro Station"),
        ("Q11303", "Q11303", "Kingdom Centre"),
        ("Q66661665", "Q66661665", "Al-Diriyah Governorate")
    ]:
        osm_obj = {
            "osm_type": "n",
            "osm_id": 9999,
            "lat": 24.7,
            "lon": 46.7,
            "qid": qid,
            "name": name,
            "name_ar": name,
            "name_en": name,
            "main_key": "amenity",
            "main_val": "public",
            "tags": {}
        }
        wd_entity = {
            "qid": qid,
            "status": "exists",
            "labels": {"en": name},
            "descriptions": {},
            "p31": [p31_class],
            "lat": 24.7,
            "lon": 46.7,
            "p11693": [],
            "p10689": [],
            "p402": []
        }
        findings = analyzer.audit_object(osm_obj, wd_entity, None, {"n9999"})
        # Must NOT be classified as broken_osm_tag or conflict
        assert any(f["kind"] == "missing_backlink" for f in findings)
        assert not any(f.get("subkind") == "class_conflict" for f in findings)

def test_multi_tag_buckets(in_memory_dbs):
    osm_conn, wd_conn = in_memory_dbs
    analyzer = ReverseAnalyzer(osm_conn, wd_conn)

    # Bucket 1: Split linear ways (Wadi Hanifah / highway)
    linear_objects = [
        {"osm_type": "w", "osm_id": 1, "lat": 24.6, "lon": 46.5, "qid": "Q3595382", "main_key": "waterway", "main_val": "river", "tags": {}},
        {"osm_type": "w", "osm_id": 2, "lat": 24.7, "lon": 46.6, "qid": "Q3595382", "main_key": "waterway", "main_val": "river", "tags": {}},
    ]
    multi = analyzer.preclassify_multi_tagged(linear_objects)
    assert multi["Q3595382"]["bucket"] == "split_linear_ways"

    # Bucket 2: Duplicate POI representation (node + way within 150m)
    dup_objects = [
        {"osm_type": "n", "osm_id": 10, "lat": 24.7136, "lon": 46.6753, "qid": "Q123", "main_key": "amenity", "main_val": "hospital", "tags": {}},
        {"osm_type": "w", "osm_id": 20, "lat": 24.7138, "lon": 46.6755, "qid": "Q123", "main_key": "amenity", "main_val": "hospital", "tags": {}},
    ]
    multi_dup = analyzer.preclassify_multi_tagged(dup_objects)
    assert multi_dup["Q123"]["bucket"] == "duplicate_poi_representation"

    # Bucket 3: Parent admin pollution (two distant objects > 500m apart)
    pollution_objects = [
        {"osm_type": "n", "osm_id": 101, "lat": 17.5, "lon": 42.5, "qid": "Q65040815", "main_key": "place", "main_val": "village", "tags": {}},
        {"osm_type": "n", "osm_id": 102, "lat": 18.2, "lon": 43.1, "qid": "Q65040815", "main_key": "natural", "main_val": "peak", "tags": {}},
    ]
    multi_poll = analyzer.preclassify_multi_tagged(pollution_objects)
    assert multi_poll["Q65040815"]["bucket"] == "parent_admin_pollution"

def test_stale_node_to_way_upgrade(in_memory_dbs):
    osm_conn, wd_conn = in_memory_dbs
    analyzer = ReverseAnalyzer(osm_conn, wd_conn)

    # Way 5001 is mapped in OSM
    osm_obj = {
        "osm_type": "w",
        "osm_id": 5001,
        "lat": 24.7,
        "lon": 46.7,
        "qid": "Q777",
        "name": "Building",
        "name_ar": "",
        "name_en": "",
        "main_key": "building",
        "main_val": "yes",
        "tags": {}
    }
    # Wikidata P10689 points to way 4000 (which is absent in OSM)
    wd_entity = {
        "qid": "Q777",
        "status": "exists",
        "labels": {},
        "descriptions": {},
        "p31": ["Q41176"],
        "p10689": ["4000"]
    }

    findings = analyzer.audit_object(osm_obj, wd_entity, None, existing_osm_ids={"w5001"})
    assert len(findings) == 1
    f = findings[0]
    assert f["kind"] == "conflict"
    assert f["subkind"] == "stale_node_to_way_upgrade"

