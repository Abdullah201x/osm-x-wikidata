"""
Machine Learning Candidate Matcher for OSM x Wikidata Conflation.
Uses HistGradientBoostingClassifier trained on local OSM-Wikidata pairs (0-400 m)
to predict pairwise match probability based on spatial, semantic, and ontological features.

Training data: build_training_pairs(). Held-out evaluation: pipeline/evaluate_matcher.py.

    python -m pipeline.ml_matcher --retrain    # retrain from the local caches and save the model
"""

import os
import math
import sqlite3
import random
import joblib
import numpy as np
from typing import Dict, List, Any, Optional, Tuple

from pipeline.config import PIPELINE_DIR
from pipeline.arabic_normalizer import normalize_arabic, strip_generic_noise, string_similarity
from pipeline.pbf_extractor import OSM_CACHE_DB
from pipeline.wikidata_fetcher import CACHE_DB as WIKIDATA_CACHE_DB

MODEL_FILE = os.path.join(PIPELINE_DIR, "ml_matcher_model.joblib")

MAX_DIST_M = 400.0      # candidate search radius (find_ml_candidate)
MIN_SIM = 0.20          # find_ml_candidate() skips pairs below this name similarity
PROD_THRESHOLD = 0.60   # probability needed to suggest a candidate (matcher.py)
NEG_PER_POS = 3         # negatives sampled per positive
HARD_NEG_SIM = 0.60     # "same name, different QID" hard negatives
GRID_SIZE = 0.05        # spatial index cell (~5 km)

# Reference latitude constants for fast planar distance approximation (centered at 24 deg N)
REF_LAT_RAD = math.radians(24.0)
M_PER_DEG_LAT = 110_574.0
M_PER_DEG_LON = 111_320.0 * math.cos(REF_LAT_RAD)

def lat_lon_distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Fast planar approximation of distance in meters for local GCC coordinates."""
    dy = (lat2 - lat1) * M_PER_DEG_LAT
    dx = (lon2 - lon1) * M_PER_DEG_LON
    return math.sqrt(dx * dx + dy * dy)

def compute_category_compatibility(cat_id: int, p31: str, main_k: str, main_v: str) -> float:
    """
    Computes compatibility score between Wikidata entity class/category and OSM primary tag.
    Returns:
       1.0: Strong positive ontological alignment
       0.0: Neutral / Unknown
      -1.0: Contradictory classes (e.g. Mosque matched to Restaurant)
    """
    if not main_k:
        return 0.0

    # Worship (cat 6)
    if cat_id == 6 or p31 in ('Q32815', 'Q16970'):
        if main_k == 'amenity' and main_v in ('place_of_worship', 'mosque'):
            return 1.0
        if main_k in ('shop', 'craft', 'office', 'restaurant', 'cafe', 'bank'):
            return -1.0

    # Heritage & History (cat 2)
    elif cat_id == 2:
        if main_k in ('historic', 'heritage') or (main_k == 'tourism' and main_v in ('museum', 'monument', 'archaeological_site', 'castle')):
            return 1.0
        if main_k in ('shop', 'highway', 'amenity'):
            return -0.5

    # Geography & Nature (cat 3)
    elif cat_id == 3:
        if main_k in ('natural', 'waterway', 'place') and main_v in ('peak', 'wadi', 'island', 'spring', 'water_well'):
            return 1.0
        if main_k in ('building', 'shop', 'office', 'amenity'):
            return -0.8

    # Healthcare & Education (cat 4)
    elif cat_id == 4:
        if main_k in ('amenity', 'healthcare') and main_v in ('hospital', 'clinic', 'pharmacy', 'school', 'university', 'college', 'library', 'aerodrome'):
            return 1.0
        if main_k in ('natural', 'waterway'):
            return -1.0

    # Places & Settlements (cat 1)
    elif cat_id == 1:
        if main_k == 'place' and main_v in ('city', 'town', 'village', 'suburb', 'neighbourhood', 'hamlet', 'isolated_dwelling'):
            return 1.0
        if main_k in ('shop', 'amenity', 'craft'):
            return -0.5

    # Tourism & Commercial (cat 5)
    elif cat_id == 5:
        if main_k in ('tourism', 'shop', 'leisure', 'amenity') and main_v in ('hotel', 'mall', 'supermarket', 'fuel', 'bank', 'restaurant', 'cafe', 'stadium', 'park'):
            return 1.0

    return 0.0

def extract_pair_features(wd_item: Dict[str, Any], osm_cand: Tuple, dist_m: float) -> Tuple[List[float], float]:
    """
    Extracts the feature dimensions for an evaluated (Wikidata, OSM) candidate pair.
    osm_cand schema: (osm_type, osm_id, lat, lon, name, name_ar, name_en, main_key, main_val)
    Returns:
        (feature_list, sim_max)
    """
    log_dist = math.log1p(dist_m)

    name_ar = wd_item.get('name_ar') or ''
    name_en = wd_item.get('name_en') or ''
    c_type, c_id, c_lat, c_lon, c_name, c_name_ar, c_name_en, c_k, c_v = osm_cand

    target_ar = c_name_ar or c_name or ''
    target_en = c_name_en or c_name or ''

    sim_ar = string_similarity(name_ar, target_ar) if name_ar and target_ar else 0.0
    sim_en = string_similarity(name_en, target_en) if name_en and target_en else 0.0

    # Normalized versions
    n_ar1 = normalize_arabic(name_ar, strip_al=True)
    n_ar2 = normalize_arabic(target_ar, strip_al=True)
    exact_ar = 1.0 if (n_ar1 and n_ar2 and n_ar1 == n_ar2) else 0.0

    # Denoised versions (noise terms like جامع / فرع / محل removed)
    denoised1 = strip_generic_noise(name_ar)
    denoised2 = strip_generic_noise(target_ar)
    sim_denoised = string_similarity(denoised1, denoised2) if denoised1 and denoised2 else 0.0

    sim_max = max(sim_ar, sim_en, sim_denoised)

    # Token overlap and containment
    t1 = set(n_ar1.split()) if n_ar1 else set()
    t2 = set(n_ar2.split()) if n_ar2 else set()
    overlap = float(len(t1 & t2))
    containment = (overlap / min(len(t1), len(t2))) if (t1 and t2) else 0.0

    compat = compute_category_compatibility(
        wd_item.get('cat', 5),
        wd_item.get('p31', ''),
        c_k or '',
        c_v or ''
    )

    is_way = 1.0 if c_type == 'w' else 0.0

    feats = [
        dist_m,
        log_dist,
        sim_ar,
        sim_en,
        sim_denoised,
        sim_max,
        exact_ar,
        overlap,
        containment,
        compat,
        is_way
    ]
    return feats, sim_max

def load_training_data() -> Tuple[Dict[str, Dict[str, Any]], List[Tuple], List[Tuple]]:
    """
    Reads the ground truth from the local caches.

    Returns (wd_map, linked_rows, candidates):
      wd_map:      qid -> {qid, lat, lon, cat, p31, name_ar, name_en}
      linked_rows: (qid, osm_type, osm_id, lat, lon, name, name_ar, name_en, main_key, main_val)
                   OSM elements that carry a wikidata=* tag
      candidates:  (osm_type, osm_id, lat, lon, name, name_ar, name_en, main_key, main_val)
                   untagged OSM POIs, the pool find_ml_candidate() searches in production
    """
    conn_osm = sqlite3.connect(OSM_CACHE_DB)
    conn_wd = sqlite3.connect(WIKIDATA_CACHE_DB)
    try:
        wd_map = {}
        for r in conn_wd.execute("SELECT qid, lat, lon, cat_id, p31_qid, name_ar, name_en FROM wikidata_cache"):
            wd_map[r[0]] = {
                'qid': r[0], 'lat': r[1], 'lon': r[2], 'cat': r[3],
                'p31': r[4], 'name_ar': r[5], 'name_en': r[6]
            }
        linked_rows = conn_osm.execute("""
            SELECT qid, osm_type, osm_id, lat, lon, name, name_ar, name_en, main_key, main_val
            FROM osm_linked
        """).fetchall()
        candidates = conn_osm.execute("""
            SELECT osm_type, osm_id, lat, lon, name, name_ar, name_en, main_key, main_val
            FROM osm_candidates
        """).fetchall()
    finally:
        conn_osm.close()
        conn_wd.close()
    return wd_map, linked_rows, candidates


def _grid_index(rows: List[Tuple], lat_i: int, lon_i: int) -> Dict[Tuple[int, int], List[Tuple]]:
    grid: Dict[Tuple[int, int], List[Tuple]] = {}
    for r in rows:
        grid.setdefault((int(r[lat_i] / GRID_SIZE), int(r[lon_i] / GRID_SIZE)), []).append(r)
    return grid


def _nearby(grid: Dict[Tuple[int, int], List[Tuple]], lat: float, lon: float) -> List[Tuple]:
    cell = (int(lat / GRID_SIZE), int(lon / GRID_SIZE))
    out: List[Tuple] = []
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            out.extend(grid.get((cell[0] + dx, cell[1] + dy), ()))
    return out


def build_training_pairs(
    wd_map: Dict[str, Dict[str, Any]],
    linked_rows: List[Tuple],
    candidates: List[Tuple],
    neg_per_pos: int = NEG_PER_POS,
    seed: int = 42,
    min_sim: float = MIN_SIM,
) -> Dict[str, Any]:
    """
    Builds labelled (Wikidata item, OSM element) pairs from the tagged ground truth.

    Positives: each wikidata-tagged OSM element within MAX_DIST_M of its item.
    Negatives, per positive (at most `neg_per_pos`, so every positive gets its
    share instead of a global cap filling up on the first ones):
      - first, up to one HARD negative: an OSM element tagged with a DIFFERENT
        QID whose name is similar (sim >= HARD_NEG_SIM), e.g. another branch;
      - then random elements from the same 0-400 m pool (no 10 m floor, so
        distance is not a free label: positives and negatives share the range).
    Pairs below `min_sim` are dropped on both sides: find_ml_candidate() never
    scores them, so the model should not spend capacity on them either.

    For the candidate-picker evaluation every positive also gets its full
    production pool: the true element plus every untagged candidate within
    MAX_DIST_M and >= min_sim, as find_ml_candidate() would see it.

    Returns {X, y, groups, pools, n_positive_raw, n_unreachable}
      X: feature rows, y: labels, groups: QID per row (for GroupKFold)
      pools: list of (qid, X_pool, true_index)
    """
    rng = random.Random(seed)
    cand_grid = _grid_index(candidates, 2, 3)
    linked_grid = _grid_index(linked_rows, 3, 4)

    X: List[List[float]] = []
    y: List[int] = []
    groups: List[str] = []
    pools: List[Tuple[str, np.ndarray, int]] = []
    n_positive_raw = 0
    n_unreachable = 0

    for r in linked_rows:
        qid = r[0]
        wd_item = wd_map.get(qid)
        if not wd_item:
            continue
        true_cand = (r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8], r[9])
        dist = lat_lon_distance_m(wd_item['lat'], wd_item['lon'], r[3], r[4])
        if dist > MAX_DIST_M:
            continue
        n_positive_raw += 1
        pos_feats, pos_sim = extract_pair_features(wd_item, true_cand, dist)
        if pos_sim < min_sim:
            n_unreachable += 1  # production would never score this pair
            continue

        # Untagged candidates: the production pool and the random-negative pool.
        cand_scored = []
        for c in _nearby(cand_grid, wd_item['lat'], wd_item['lon']):
            d = lat_lon_distance_m(wd_item['lat'], wd_item['lon'], c[2], c[3])
            if d > MAX_DIST_M:
                continue
            feats, sim = extract_pair_features(wd_item, c, d)
            if sim >= min_sim:
                cand_scored.append((feats, sim))

        # Elements tagged with a different QID: certain negatives.
        other_linked = []
        for o in _nearby(linked_grid, wd_item['lat'], wd_item['lon']):
            if o[0] == qid or (o[1] == true_cand[0] and o[2] == true_cand[1]):
                continue
            d = lat_lon_distance_m(wd_item['lat'], wd_item['lon'], o[3], o[4])
            if d > MAX_DIST_M:
                continue
            o_cand = (o[1], o[2], o[3], o[4], o[5], o[6], o[7], o[8], o[9])
            feats, sim = extract_pair_features(wd_item, o_cand, d)
            if sim >= min_sim:
                other_linked.append((feats, sim))

        negatives: List[List[float]] = []
        hard = [f for f, s in other_linked if s >= HARD_NEG_SIM]
        if hard and neg_per_pos > 0:
            negatives.append(rng.choice(hard))
        rest = [f for f, _ in cand_scored] + [f for f, s in other_linked if s < HARD_NEG_SIM]
        need = neg_per_pos - len(negatives)
        if need > 0 and rest:
            negatives.extend(rng.sample(rest, min(need, len(rest))))

        X.append(pos_feats)
        y.append(1)
        groups.append(qid)
        for f in negatives:
            X.append(f)
            y.append(0)
            groups.append(qid)

        pool = [pos_feats] + [f for f, _ in cand_scored]
        pools.append((qid, np.array(pool, dtype=float), 0))

    return {
        "X": np.array(X, dtype=float),
        "y": np.array(y, dtype=int),
        "groups": np.array(groups),
        "pools": pools,
        "n_positive_raw": n_positive_raw,
        "n_unreachable": n_unreachable,
    }


def build_legacy_pairs(wd_map: Dict[str, Dict[str, Any]], linked_rows: List[Tuple], candidates: List[Tuple]) -> Dict[str, Any]:
    """
    The sampler used before 2026-11 (kept only so evaluate_matcher.py can compare
    on the same folds): one GLOBAL negative cap of 3x positives that the first
    positives used up, a 10 m floor for negatives only, and no similarity filter.
    """
    cand_grid = _grid_index(candidates, 2, 3)
    positives = []
    for r in linked_rows:
        wd_item = wd_map.get(r[0])
        if not wd_item:
            continue
        cand = (r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8], r[9])
        d = lat_lon_distance_m(wd_item['lat'], wd_item['lon'], r[3], r[4])
        if d <= MAX_DIST_M:
            positives.append((wd_item, cand, d))

    cap = len(positives) * 3
    negatives = []
    for wd_item, true_cand, _ in positives:
        if len(negatives) >= cap:
            break
        for c in _nearby(cand_grid, wd_item['lat'], wd_item['lon']):
            if c[0] == true_cand[0] and c[1] == true_cand[1]:
                continue
            d = lat_lon_distance_m(wd_item['lat'], wd_item['lon'], c[2], c[3])
            if 10.0 <= d <= MAX_DIST_M:
                negatives.append((wd_item, c, d))
                if len(negatives) >= cap:
                    break

    X, y, groups = [], [], []
    for label, rows in ((1, positives), (0, negatives)):
        for w, c, d in rows:
            X.append(extract_pair_features(w, c, d)[0])
            y.append(label)
            groups.append(w['qid'])
    return {"X": np.array(X, dtype=float), "y": np.array(y, dtype=int), "groups": np.array(groups)}


def fit_matcher(X: np.ndarray, y: np.ndarray) -> Any:
    from sklearn.ensemble import HistGradientBoostingClassifier

    clf = HistGradientBoostingClassifier(max_iter=150, min_samples_leaf=15, random_state=42)
    clf.fit(X, y)
    return clf


def train_matcher_model(save: bool = True) -> Any:
    """
    Trains the classifier on all tagged ground truth and saves it to MODEL_FILE.
    Held-out quality is measured separately by pipeline/evaluate_matcher.py.
    """
    print("  [ML Matcher] Training ML candidate classifier from local ground truth...")
    data = build_training_pairs(*load_training_data())
    X, y = data["X"], data["y"]
    if len(set(y.tolist())) < 2:
        raise RuntimeError("Not enough ground truth to train the matcher (need positives and negatives).")
    clf = fit_matcher(X, y)
    print(
        f"  [ML Matcher] Trained on {len(X):,} pairs ({int(y.sum()):,} positive, {int((y == 0).sum()):,} negative; "
        f"{data['n_unreachable']:,} positives below the similarity pre-filter skipped). "
        "Run `python pipeline/evaluate_matcher.py` for held-out metrics."
    )
    if save:
        os.makedirs(os.path.dirname(MODEL_FILE), exist_ok=True)
        joblib.dump(clf, MODEL_FILE)
        print(f"  [ML Matcher] Saved model to {MODEL_FILE}")
    return clf

def load_or_train_matcher(force_retrain: bool = False) -> Any:
    """Loads existing trained model or trains a new one if missing."""
    if not force_retrain and os.path.exists(MODEL_FILE):
        try:
            return joblib.load(MODEL_FILE)
        except Exception as e:
            print(f"  [ML Matcher] Could not load model ({e}), retraining...")
            return train_matcher_model()
    return train_matcher_model()

def find_ml_candidate(
    clf: Any,
    wd_item: Dict[str, Any],
    nearby_cands: List[Tuple],
    threshold: float = PROD_THRESHOLD
) -> Optional[Tuple[Tuple, float, int]]:
    """
    Evaluates candidate OSM POIs for a given Wikidata item using the ML classifier.
    
    Returns:
        (best_cand_tuple, probability, distance_meters) or None if no match meets threshold.
    """
    if not nearby_cands:
        return None

    wd_lat = wd_item["lat"]
    wd_lon = wd_item["lon"]

    # Filter candidate features within 400m
    valid_cands = []
    features_batch = []
    distances = []

    for c in nearby_cands:
        dist = lat_lon_distance_m(wd_lat, wd_lon, c[2], c[3])
        if dist <= MAX_DIST_M:
            feats, sim_max = extract_pair_features(wd_item, c, dist)
            # High-efficiency pre-filter: candidates with (near) zero name similarity are skipped
            if sim_max < MIN_SIM:
                continue
            valid_cands.append(c)
            features_batch.append(feats)
            distances.append(round(dist))

    if not valid_cands:
        return None

    # Vectorized batch prediction
    X_mat = np.array(features_batch)
    probs = clf.predict_proba(X_mat)[:, 1]

    best_idx = int(np.argmax(probs))
    best_prob = float(probs[best_idx])

    if best_prob >= threshold:
        return valid_cands[best_idx], best_prob, distances[best_idx]

    return None


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Train the OSM x Wikidata candidate matcher.")
    parser.add_argument("--retrain", action="store_true", help="Retrain from the local caches and overwrite the model file.")
    if parser.parse_args().retrain:
        train_matcher_model()
    else:
        parser.print_help()
