"""
Tests for pipeline/pbf_extractor.py
Verifies OSM PBF tag filtering, database schema initialization,
spatial bounding box sanity checks, and entity extraction logic.
"""

import sqlite3
import pytest

from pipeline import pbf_extractor
from pipeline.pbf_extractor import (
    TARGET_TAG_KEYS,
    init_osm_db,
    GCCPbfHandler,
    extract_pbf_to_cache,
)


class MockTag:
    def __init__(self, k: str, v: str):
        self.k = k
        self.v = v


class MockTags:
    def __init__(self, tag_dict: dict):
        self._dict = tag_dict
        self._tags = [MockTag(k, v) for k, v in tag_dict.items()]

    def get(self, key: str, default=None):
        return self._dict.get(key, default)

    def __contains__(self, key: str):
        return key in self._dict

    def __iter__(self):
        return iter(self._tags)

    def __bool__(self):
        return bool(self._dict)


class MockLocation:
    def __init__(self, lat: float, lon: float):
        self.lat = lat
        self.lon = lon


class MockNode:
    def __init__(self, node_id: int, lat: float, lon: float, tags: dict):
        self.id = node_id
        self.location = MockLocation(lat, lon)
        self.tags = MockTags(tags)


class MockWayNode:
    def __init__(self, lat: float, lon: float):
        self.lat = lat
        self.lon = lon


class MockWay:
    def __init__(self, way_id: int, nodes: list, tags: dict):
        self.id = way_id
        self.nodes = nodes
        self.tags = MockTags(tags)


class MockMember:
    def __init__(self, member_type: str, ref: int, role: str):
        self.type = member_type
        self.ref = ref
        self.role = role


class MockRelation:
    def __init__(self, rel_id: int, tags: dict, members: list):
        self.id = rel_id
        self.tags = MockTags(tags)
        self.members = members


def test_target_tag_keys():
    """Verify target tag keys include primary OSM physical and amenity features."""
    assert "amenity" in TARGET_TAG_KEYS
    assert "historic" in TARGET_TAG_KEYS
    assert "tourism" in TARGET_TAG_KEYS
    assert "place" in TARGET_TAG_KEYS
    assert "building" in TARGET_TAG_KEYS
    assert "natural" in TARGET_TAG_KEYS


def test_init_osm_db(tmp_path, monkeypatch):
    """Verify init_osm_db creates all required tables and indexes."""
    test_db = str(tmp_path / "test_osm.db")
    monkeypatch.setattr(pbf_extractor, "OSM_CACHE_DB", test_db)

    init_osm_db()

    conn = sqlite3.connect(test_db)
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = {row[0] for row in cursor.fetchall()}

    assert "meta" in tables
    assert "osm_linked" in tables
    assert "osm_candidates" in tables
    assert "osm_relation_members" in tables

    # Verify column layout for osm_linked
    cursor.execute("PRAGMA table_info(osm_linked)")
    cols = [col[1] for col in cursor.fetchall()]
    assert cols == [
        "osm_type", "osm_id", "lat", "lon", "qid",
        "name", "name_ar", "name_en", "main_key", "main_val", "tags_json"
    ]
    conn.close()


def test_handler_node_linked_vs_candidate(tmp_path, monkeypatch):
    """Verify node extraction differentiates between linked entities and candidate POIs."""
    test_db = str(tmp_path / "test_handler.db")
    monkeypatch.setattr(pbf_extractor, "OSM_CACHE_DB", test_db)
    init_osm_db()

    handler = GCCPbfHandler(batch_size=10)

    # 1. Linked Node (has wikidata=*)
    node_linked = MockNode(101, 24.5, 46.5, {
        "wikidata": "Q12345",
        "name": "King Abdulaziz Center",
        "name:ar": "مركز الملك عبد العزيز",
        "amenity": "cultural_center"
    })
    handler.node(node_linked)

    # 2. Candidate Node (no wikidata, has target tag + name)
    node_cand = MockNode(102, 24.6, 46.6, {
        "amenity": "hospital",
        "name": "Al Noor Hospital",
        "name:ar": "مستشفى النور"
    })
    handler.node(node_cand)

    # 3. Node outside GCC bounds (lat 51.5 in London)
    node_oob = MockNode(103, 51.5, -0.1, {
        "wikidata": "Q84",
        "name": "London Point"
    })
    handler.node(node_oob)

    # 4. Untagged node or node without relevant tags/name
    node_irrelevant = MockNode(104, 24.7, 46.7, {"highway": "traffic_signals"})
    handler.node(node_irrelevant)

    handler.close()

    # Query DB to verify
    conn = sqlite3.connect(test_db)
    cur = conn.cursor()

    cur.execute("SELECT osm_id, qid, main_key, main_val FROM osm_linked")
    linked_rows = cur.fetchall()
    assert len(linked_rows) == 1
    assert linked_rows[0][0] == 101
    assert linked_rows[0][1] == "Q12345"

    cur.execute("SELECT osm_id, main_key, main_val FROM osm_candidates")
    cand_rows = cur.fetchall()
    assert len(cand_rows) == 1
    assert cand_rows[0][0] == 102
    assert cand_rows[0][1] == "amenity"
    assert cand_rows[0][2] == "hospital"

    conn.close()


def test_handler_way_centroid(tmp_path, monkeypatch):
    """Verify way extraction calculates centroid and handles linked vs candidate ways."""
    test_db = str(tmp_path / "test_way.db")
    monkeypatch.setattr(pbf_extractor, "OSM_CACHE_DB", test_db)
    init_osm_db()

    handler = GCCPbfHandler(batch_size=10)

    # Way with 4 corners (forming square around lat 24.0, lon 45.0)
    nodes = [
        MockWayNode(23.9, 44.9),
        MockWayNode(24.1, 44.9),
        MockWayNode(24.1, 45.1),
        MockWayNode(23.9, 45.1),
    ]
    way = MockWay(501, nodes, {
        "wikidata": "Q9876",
        "name": "National Park",
        "leisure": "park"
    })
    handler.way(way)
    handler.close()

    conn = sqlite3.connect(test_db)
    cur = conn.cursor()
    cur.execute("SELECT osm_id, lat, lon, qid FROM osm_linked WHERE osm_type='w'")
    rows = cur.fetchall()
    assert len(rows) == 1
    assert rows[0][0] == 501
    assert pytest.approx(rows[0][1], 0.01) == 24.0
    assert pytest.approx(rows[0][2], 0.01) == 45.0
    assert rows[0][3] == "Q9876"
    conn.close()


def test_handler_relation_members(tmp_path, monkeypatch):
    """Verify relation members are extracted and recorded."""
    test_db = str(tmp_path / "test_rel.db")
    monkeypatch.setattr(pbf_extractor, "OSM_CACHE_DB", test_db)
    init_osm_db()

    handler = GCCPbfHandler(batch_size=10)
    members = [
        MockMember("w", 1001, "outer"),
        MockMember("w", 1002, "inner"),
        MockMember("n", 2001, "admin_centre"),
    ]
    rel = MockRelation(9001, {
        "wikidata": "Q5555",
        "name": "Grand Mosque Complex",
        "amenity": "place_of_worship"
    }, members)
    handler.relation(rel)
    handler.close()

    conn = sqlite3.connect(test_db)
    cur = conn.cursor()
    cur.execute("SELECT member_type, member_id, role FROM osm_relation_members WHERE rel_id=9001 ORDER BY member_id")
    rows = cur.fetchall()
    assert len(rows) == 3
    assert rows[0] == ("w", 1001, "outer")
    assert rows[1] == ("w", 1002, "inner")
    assert rows[2] == ("n", 2001, "admin_centre")
    conn.close()


def test_extract_pbf_file_not_found(tmp_path, monkeypatch):
    """Verify extract_pbf_to_cache raises FileNotFoundError when no PBF exists."""
    test_db = str(tmp_path / "test_fnf.db")
    monkeypatch.setattr(pbf_extractor, "OSM_CACHE_DB", test_db)
    with pytest.raises(FileNotFoundError):
        extract_pbf_to_cache(pbf_path="/nonexistent/path/gcc.osm.pbf")
