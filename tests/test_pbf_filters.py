"""
Tests for the C++ libosmium filters used by the PBF pipeline.
The KeyFilter must pass exactly the objects the Python predicate would keep, and
untagged nodes must still contribute locations to way centroids.
"""

import sqlite3

import osmium
import pytest

from pipeline import pbf_extractor
from pipeline.pbf_extractor import FILTER_KEYS, TARGET_TAG_KEYS, GCCPbfHandler, assert_not_history_file

OPL = """\
n1 v1 x46.0 y24.0 T
n2 v1 x46.0 y24.2 T
n3 v1 x46.2 y24.2 T
n4 v1 x46.5 y24.5 Tamenity=cafe,name=Kept
n5 v1 x46.6 y24.6 Tamenity=cafe
n6 v1 x46.7 y24.7 Twikidata=Q42
n7 v1 x46.8 y24.8 Tname=OnlyName
w10 v1 Tamenity=mosque,name=Mosque Nn1,n2,n3,n1
w11 v1 Thighway=residential Nn1,n2
r20 v1 Twikidata=Q99,name=Rel Mw10@outer
"""


@pytest.fixture
def opl_file(tmp_path):
    p = tmp_path / "tiny.osm.opl"
    p.write_text(OPL, encoding="utf-8")
    return str(p)


def _tagged_ids(path, filters):
    seen = set()
    for obj in osmium.FileProcessor(path).with_locations().with_filter(*filters) if filters else osmium.FileProcessor(path):
        seen.add((obj.type_str(), obj.id))
    return seen


def test_filter_keys_derived_from_target_keys():
    assert FILTER_KEYS == ("wikidata",) + TARGET_TAG_KEYS


def test_key_filter_drops_only_irrelevant_objects(opl_file):
    kept = _tagged_ids(opl_file, [osmium.filter.KeyFilter(*FILTER_KEYS)])
    # n1-n3 untagged, n7 has only a name -> dropped; everything else survives
    assert ("n", 1) not in kept and ("n", 2) not in kept and ("n", 3) not in kept
    assert ("n", 7) not in kept
    assert {("n", 4), ("n", 5), ("n", 6), ("w", 10), ("w", 11), ("r", 20)} <= kept


def test_way_of_untagged_nodes_keeps_centroid(opl_file, tmp_path, monkeypatch):
    db = str(tmp_path / "cache.db")
    monkeypatch.setattr(pbf_extractor, "OSM_CACHE_DB", db)
    pbf_extractor.init_osm_db()

    handler = GCCPbfHandler()
    handler.apply_file(opl_file, locations=True, filters=[osmium.filter.KeyFilter(*FILTER_KEYS)])
    handler.close()

    conn = sqlite3.connect(db)
    way = conn.execute("SELECT lat, lon FROM osm_candidates WHERE osm_type='w' AND osm_id=10").fetchone()
    cands = {r[0] for r in conn.execute("SELECT osm_id FROM osm_candidates WHERE osm_type='n'")}
    linked = {tuple(r) for r in conn.execute("SELECT osm_type, osm_id FROM osm_linked")}
    conn.close()

    assert way is not None, "way with only untagged nodes lost its centroid"
    assert way[0] == pytest.approx((24.0 + 24.2 + 24.2 + 24.0) / 4, abs=1e-6)
    assert way[1] == pytest.approx((46.0 + 46.0 + 46.2 + 46.0) / 4, abs=1e-6)
    assert cands == {4}  # n5 has no name, n7 has no feature key
    assert linked == {("n", 6), ("r", 20)}


def test_filter_matches_unfiltered_output(opl_file, tmp_path, monkeypatch):
    rows = []
    for name, filters in (("plain", None), ("filtered", [osmium.filter.KeyFilter(*FILTER_KEYS)])):
        db = str(tmp_path / f"{name}.db")
        monkeypatch.setattr(pbf_extractor, "OSM_CACHE_DB", db)
        pbf_extractor.init_osm_db()
        h = GCCPbfHandler()
        if filters:
            h.apply_file(opl_file, locations=True, filters=filters)
        else:
            h.apply_file(opl_file, locations=True)
        h.close()
        conn = sqlite3.connect(db)
        rows.append([
            conn.execute(f"SELECT * FROM {t} ORDER BY 1,2,3").fetchall()
            for t in ("osm_linked", "osm_candidates", "osm_relation_members")
        ])
        conn.close()
    assert rows[0] == rows[1]


def test_history_check_accepts_normal_file(tmp_path):
    p = tmp_path / "hist.osh.opl"
    p.write_text("n1 v1 x46.0 y24.0 T\nn1 v2 x46.0 y24.0 Tname=a\n", encoding="utf-8")
    # OPL carries no history header flag, so this only checks the call works on a normal file
    assert_not_history_file(str(p))
