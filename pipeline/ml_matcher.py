"""
Machine Learning Candidate Matcher for OSM x Wikidata Conflation.
Uses HistGradientBoostingClassifier trained on strictly local OSM-Wikidata pairs (10m–400m)
to predict pairwise match probability based on spatial, semantic, and ontological features.
"""

import os
import math
import sqlite3
import random
import joblib
import numpy as np
from typing import Dict, List, Any, Optional, Tuple

from pipeline.config import BASE_DIR, PIPELINE_DIR
from pipeline.arabic_normalizer import normalize_arabic, strip_generic_noise, string_similarity
from pipeline.pbf_extractor import OSM_CACHE_DB
from pipeline.wikidata_fetcher import CACHE_DB as WIKIDATA_CACHE_DB

MODEL_FILE = os.path.join(PIPELINE_DIR, "ml_matcher_model.joblib")

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

def train_matcher_model() -> Any:
    """
    Trains the HistGradientBoostingClassifier using strictly local OSM-Wikidata ground truth.
    Saves the serialized model to MODEL_FILE.
    """
    from sklearn.ensemble import HistGradientBoostingClassifier
    from sklearn.metrics import roc_auc_score

    print("  [ML Matcher] Training ML candidate classifier from strictly local ground truth...")

    conn_osm = sqlite3.connect(OSM_CACHE_DB)
    conn_wd = sqlite3.connect(WIKIDATA_CACHE_DB)

    # Load Wikidata cache
    c_wd = conn_wd.cursor()
    c_wd.execute("""
    SELECT qid, lat, lon, cat_id, p31_qid, name_ar, name_en
    FROM wikidata_cache
    """)
    wd_map = {}
    for r in c_wd.fetchall():
        wd_map[r[0]] = {
            'qid': r[0], 'lat': r[1], 'lon': r[2], 'cat': r[3],
            'p31': r[4], 'name_ar': r[5], 'name_en': r[6]
        }

    # Load linked OSM items (positive pairs)
    c_osm = conn_osm.cursor()
    c_osm.execute("""
    SELECT qid, osm_type, osm_id, lat, lon, name, name_ar, name_en, main_key, main_val
    FROM osm_linked
    """)
    linked_rows = c_osm.fetchall()

    positive_pairs = []
    for r in linked_rows:
        qid = r[0]
        if qid in wd_map:
            wd_item = wd_map[qid]
            osm_cand = (r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8], r[9])
            dist = lat_lon_distance_m(wd_item['lat'], wd_item['lon'], r[3], r[4])
            if dist <= 400.0:
                positive_pairs.append((wd_item, osm_cand, dist))

    # Load candidate POIs for strictly local hard negative sampling
    c_osm.execute("""
    SELECT osm_type, osm_id, lat, lon, name, name_ar, name_en, main_key, main_val
    FROM osm_candidates
    """)
    candidates = c_osm.fetchall()

    GRID_SIZE = 0.05
    grid: Dict[Tuple[int, int], List[Tuple]] = {}
    for c in candidates:
        cell = (int(c[2] / GRID_SIZE), int(c[3] / GRID_SIZE))
        grid.setdefault(cell, []).append(c)

    negative_pairs = []
    random.seed(42)

    # Sample up to 3 hard negatives per positive entity located in the same spatial cell (10m to 400m)
    for wd_item, true_cand, _ in positive_pairs:
        cell = (int(wd_item['lat'] / GRID_SIZE), int(wd_item['lon'] / GRID_SIZE))
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for c in grid.get((cell[0] + dx, cell[1] + dy), []):
                    if c[0] == true_cand[0] and c[1] == true_cand[1]:
                        continue
                    d = lat_lon_distance_m(wd_item['lat'], wd_item['lon'], c[2], c[3])
                    if 10.0 <= d <= 400.0:
                        negative_pairs.append((wd_item, c, d))
                        if len(negative_pairs) >= len(positive_pairs) * 3:
                            break
                if len(negative_pairs) >= len(positive_pairs) * 3:
                    break
            if len(negative_pairs) >= len(positive_pairs) * 3:
                break

    conn_osm.close()
    conn_wd.close()

    # Extract feature matrices
    X = []
    y = []

    for w, c, d in positive_pairs:
        feats, _ = extract_pair_features(w, c, d)
        X.append(feats)
        y.append(1)

    for w, c, d in negative_pairs:
        feats, _ = extract_pair_features(w, c, d)
        X.append(feats)
        y.append(0)

    X_arr = np.array(X)
    y_arr = np.array(y)

    clf = HistGradientBoostingClassifier(max_iter=150, min_samples_leaf=15, random_state=42)
    clf.fit(X_arr, y_arr)

    # Evaluate internal ROC-AUC
    probs = clf.predict_proba(X_arr)[:, 1]
    auc = roc_auc_score(y_arr, probs)
    print(f"  [ML Matcher] Model trained successfully ({len(X_arr):,} local samples, ROC-AUC: {auc:.4f}).")

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
    threshold: float = 0.60
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
        if dist <= 400.0:
            feats, sim_max = extract_pair_features(wd_item, c, dist)
            # High-efficiency pre-filter: candidates with zero similarity (< 0.20) are skipped
            if sim_max < 0.20:
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
