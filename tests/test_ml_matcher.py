"""
Unit Tests for pipeline.ml_matcher.

Covers:
- Fast planar coordinate distance approximation (lat_lon_distance_m)
- Category and ontology compatibility scoring
- Model loading from committed joblib artifact (ml_matcher_model.joblib)
- Pairwise feature extraction
- Candidate selection and probability ranking
"""

import os
from pipeline.ml_matcher import (
    lat_lon_distance_m,
    compute_category_compatibility,
    load_or_train_matcher,
    extract_pair_features,
    find_ml_candidate,
    MODEL_FILE,
)


def test_lat_lon_distance_planar():
    # Co-located point
    assert lat_lon_distance_m(24.7136, 46.6753, 24.7136, 46.6753) == 0.0

    # 1 km north (~0.00904 degrees)
    d = lat_lon_distance_m(24.7136, 46.6753, 24.72264, 46.6753)
    assert 990.0 < d < 1010.0

    # Symmetry
    d1 = lat_lon_distance_m(24.7, 46.6, 24.8, 46.8)
    d2 = lat_lon_distance_m(24.8, 46.8, 24.7, 46.6)
    assert abs(d1 - d2) < 1e-6


def test_category_compatibility():
    # Worship (cat 6 / Q32815) aligned with place_of_worship
    assert compute_category_compatibility(6, "Q32815", "amenity", "place_of_worship") == 1.0
    # Worship contradicted by restaurant
    assert compute_category_compatibility(6, "Q32815", "restaurant", "fast_food") == -1.0

    # Heritage aligned with historic
    assert compute_category_compatibility(2, "Q123", "historic", "monument") == 1.0
    # Heritage contradicted by highway
    assert compute_category_compatibility(2, "Q123", "highway", "primary") == -0.5

    # Geography aligned with peak/wadi
    assert compute_category_compatibility(3, "Q85", "natural", "peak") == 1.0
    # Geography contradicted by shop
    assert compute_category_compatibility(3, "Q85", "shop", "supermarket") == -0.8

    # Empty main_key is neutral
    assert compute_category_compatibility(1, "Q10", "", "") == 0.0


def test_ml_model_loads_from_joblib():
    assert os.path.exists(MODEL_FILE), f"Committed ML model missing at {MODEL_FILE}"
    clf = load_or_train_matcher()
    assert clf is not None
    assert hasattr(clf, "predict_proba")


def test_extract_pair_features():
    wd_item = {
        "name_ar": "مسجد النور",
        "name_en": "Al Noor Mosque",
        "cat_id": 6,
        "p31_qid": "Q32815",
    }
    # osm_cand: (osm_type, osm_id, lat, lon, name, name_ar, name_en, main_key, main_val)
    osm_cand = ("node", 12345, 24.71, 46.67, "مسجد النور", "مسجد النور", "Al Noor Mosque", "amenity", "place_of_worship")
    features, direct_sim = extract_pair_features(wd_item, osm_cand, dist_m=45.0)

    assert isinstance(features, list)
    assert len(features) >= 5
    assert direct_sim >= 0.90
    assert all(isinstance(f, (int, float)) for f in features)


def test_find_ml_candidate():
    clf = load_or_train_matcher()
    wd_item = {
        "lat": 24.7136,
        "lon": 46.6753,
        "name_ar": "مسجد الملك عبد العزيز",
        "name_en": "King Abdulaziz Mosque",
        "cat_id": 6,
        "p31_qid": "Q32815",
    }
    candidates = [
        # Candidate 1: Close, matching name, place of worship
        ("node", 101, 24.7138, 46.6755, "مسجد الملك عبد العزيز", "مسجد الملك عبد العزيز", "King Abdulaziz Mosque", "amenity", "place_of_worship"),
        # Candidate 2: Far, pharmacy
        ("node", 202, 24.7250, 46.6900, "صيدلية النهدي", "صيدلية النهدي", "Nahdi Pharmacy", "amenity", "pharmacy"),
    ]

    result = find_ml_candidate(clf, wd_item, candidates, threshold=0.5)
    assert result is not None
    chosen_cand, prob, dist_m = result
    assert chosen_cand[1] == 101  # picked node 101
    assert prob >= 0.50
    assert 0 <= dist_m <= 400
