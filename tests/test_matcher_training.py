"""
Training-data and evaluation tests for the ML matcher (pipeline/ml_matcher.py,
pipeline/evaluate_matcher.py), on small synthetic ground truth.
"""

import json
import sqlite3
from collections import Counter

import numpy as np
import pytest

import pipeline.ml_matcher as ml
from pipeline import evaluate_matcher as ev
from pipeline.ml_matcher import M_PER_DEG_LAT, build_legacy_pairs, build_training_pairs

DIST, SIM_MAX = 0, 5  # feature indices in extract_pair_features()


def _north(lat, metres):
    return lat + metres / M_PER_DEG_LAT


def synthetic(n_items=40):
    """
    n_items Wikidata items 3 km apart. Each has:
      - its tagged OSM element 0-30 m away (same name)      -> positive
      - 5 untagged POIs at 5, 60, 120, 200, 350 m with partly similar names
      - every 4th item: another element tagged with a DIFFERENT QID and the same name (hard negative)
      - every 10th item: a tagged element whose name shares nothing with the item (unreachable)
    """
    wd_map, linked, cands = {}, [], []
    for i in range(n_items):
        qid = f"Q{1000 + i}"
        lat, lon = 24.0 + i * 0.03, 46.0
        name = f"Alnoor Mosque {i}"
        wd_map[qid] = {"qid": qid, "lat": lat, "lon": lon, "cat": 6, "p31": "Q32815", "name_ar": "", "name_en": name}
        tagged_name = "Xyzzy Plugh" if i % 10 == 9 else name
        linked.append((qid, "n", 10 * i + 1, _north(lat, (i % 4) * 10), lon, tagged_name, "", tagged_name, "amenity", "place_of_worship"))
        for j, d in enumerate((5, 60, 120, 200, 350)):
            cands.append(("n", 100_000 + 10 * i + j, _north(lat, d), lon, f"Alnoor Market {i}{j}", "", f"Alnoor Market {i}{j}", "shop", "supermarket"))
        if i % 4 == 0:
            other = f"Q{9000 + i}"
            wd_map[other] = {"qid": other, "lat": _north(lat, 2000), "lon": lon, "cat": 6, "p31": "Q32815", "name_ar": "", "name_en": name}
            linked.append((other, "w", 10 * i + 2, _north(lat, 80), lon, name, "", name, "amenity", "place_of_worship"))
    return wd_map, linked, cands


@pytest.fixture(scope="module")
def data():
    return build_training_pairs(*synthetic())


def test_negatives_are_capped_per_positive_not_globally(data):
    per_qid = Counter(q for q, label in zip(data["groups"], data["y"]) if label == 0)
    positives = {q for q, label in zip(data["groups"], data["y"]) if label == 1}
    # Every reachable positive gets its own negatives (the old global cap starved later ones)...
    assert all(per_qid[q] >= 1 for q in positives)
    # ...and none gets more than its share.
    assert max(per_qid.values()) <= ml.NEG_PER_POS


def test_no_distance_floor_for_negatives(data):
    neg_dist = data["X"][data["y"] == 0][:, DIST]
    pos_dist = data["X"][data["y"] == 1][:, DIST]
    # Negatives can be as close as positives (5 m POIs are sampled), so distance is not a free label.
    assert neg_dist.min() < 10.0
    assert pos_dist.max() <= ml.MAX_DIST_M and neg_dist.max() <= ml.MAX_DIST_M


def test_hard_negative_shares_the_name_but_not_the_qid(data):
    # Items with a same-name element tagged with another QID get it as a negative.
    for q in (f"Q{1000 + i}" for i in range(0, 40, 4)):
        rows = data["X"][(data["groups"] == q) & (data["y"] == 0)]
        assert rows[:, SIM_MAX].max() >= ml.HARD_NEG_SIM, q


def test_pairs_below_the_production_prefilter_are_unreachable(data):
    assert data["n_unreachable"] == 4  # items 9, 19, 29, 39
    # The "other QID" items sit 2 km from their element, beyond MAX_DIST_M, so only the 40 items count.
    assert data["n_positive_raw"] == 40
    assert (data["X"][:, SIM_MAX] >= ml.MIN_SIM).all()


def test_pools_mirror_production_and_put_the_true_element_first(data):
    for qid, X_pool, true_idx in data["pools"]:
        assert true_idx == 0
        assert (X_pool[:, DIST] <= ml.MAX_DIST_M).all()
        assert (X_pool[:, SIM_MAX] >= ml.MIN_SIM).all()


def test_legacy_sampler_reproduces_the_old_biases():
    legacy = build_legacy_pairs(*synthetic())
    neg = legacy["X"][legacy["y"] == 0]
    assert neg[:, DIST].min() >= 10.0  # the 10 m floor
    per_qid = Counter(q for q, label in zip(legacy["groups"], legacy["y"]) if label == 0)
    # The global cap is used up by the first positives in grid order.
    assert len(per_qid) < len({q for q, label in zip(legacy["groups"], legacy["y"]) if label == 1})


def test_cross_validate_reports_held_out_metrics(data):
    m = ev.cross_validate(data, n_splits=5)
    for key in ("roc_auc", "precision", "recall", "f1", "precision_at_top1", "recall_at_top1"):
        assert m[key] is None or 0.0 <= m[key] <= 1.0, key
    assert m["picker_suggestions"] >= m["picker_correct"] >= 0


def test_check_metrics_gate():
    good = {"threshold": 0.6, "model": {"precision": 0.93}}
    assert ev.check_metrics(good) == []
    assert ev.check_metrics(good, {"model": {"precision": 0.95}}) == []  # 2-point drop is allowed
    assert any("dropped" in e for e in ev.check_metrics({"model": {"precision": 0.91}}, {"model": {"precision": 0.95}}))
    assert any("< 0.9" in e for e in ev.check_metrics({"model": {"precision": 0.85}}))
    assert ev.check_metrics({"model": {}})


def _write_fixture_dbs(tmp_path):
    wd_map, linked, cands = synthetic()
    osm_db, wd_db = tmp_path / "osm_cache.db", tmp_path / "wikidata_cache.db"
    c = sqlite3.connect(osm_db)
    c.execute("CREATE TABLE osm_linked (qid, osm_type, osm_id, lat, lon, name, name_ar, name_en, main_key, main_val)")
    c.executemany("INSERT INTO osm_linked VALUES (?,?,?,?,?,?,?,?,?,?)", linked)
    c.execute("CREATE TABLE osm_candidates (osm_type, osm_id, lat, lon, name, name_ar, name_en, main_key, main_val)")
    c.executemany("INSERT INTO osm_candidates VALUES (?,?,?,?,?,?,?,?,?)", cands)
    c.commit()
    c.close()
    c = sqlite3.connect(wd_db)
    c.execute("CREATE TABLE wikidata_cache (qid, lat, lon, cat_id, p31_qid, name_ar, name_en)")
    c.executemany(
        "INSERT INTO wikidata_cache VALUES (?,?,?,?,?,?,?)",
        [(w["qid"], w["lat"], w["lon"], w["cat"], w["p31"], w["name_ar"], w["name_en"]) for w in wd_map.values()],
    )
    c.commit()
    c.close()
    return str(osm_db), str(wd_db)


def test_evaluate_end_to_end_on_sqlite_fixture(tmp_path, monkeypatch):
    osm_db, wd_db = _write_fixture_dbs(tmp_path)
    monkeypatch.setattr(ml, "OSM_CACHE_DB", osm_db)
    monkeypatch.setattr(ml, "WIKIDATA_CACHE_DB", wd_db)

    metrics = ev.evaluate()
    out = ev.write_metrics(metrics, str(tmp_path / "matcher_metrics.json"))
    saved = json.loads(open(out, encoding="utf-8").read())
    assert saved["version"] == 1
    assert saved["data"]["positives"] + saved["data"]["negatives"] == saved["data"]["pairs"]
    assert set(saved) >= {"model", "legacy_sampler", "threshold", "method", "generated_at"}

    # Training on the same fixture saves nothing when save=False and returns a usable model.
    clf = ml.train_matcher_model(save=False)
    assert clf.predict_proba(np.zeros((1, 11))).shape == (1, 2)
