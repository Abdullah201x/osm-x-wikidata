"""
Matcher Engine: Correlates Wikidata Items with Local OSM Data.
Determines status for each item:
- 0: MISSING_IN_OSM (Wikidata entity with no OSM counterpart)
- 1: CANDIDATE_MATCH (ML proximity, semantic & ontology match with unlinked OSM object)
- 2: LINKED (Already has direct wikidata=* tag in OSM)

Applies Machine Learning candidate conflation and filters non-physical entities.
"""

import os
import math
import sqlite3
import json
from typing import Dict, List, Any, Tuple
from pipeline.config import BASE_DIR, DATA_DIR, GCC_COUNTRIES
from pipeline.arabic_normalizer import string_similarity, normalize_arabic
from pipeline.pbf_extractor import OSM_CACHE_DB
from pipeline.physicality_filter import is_physical_mappable
from pipeline.ml_matcher import load_or_train_matcher, find_ml_candidate, lat_lon_distance_m

def match_country_items(country_code: str, wd_items: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Matches Wikidata items for a country against the local OSM database in OSM_CACHE_DB.
    Filters non-physical entities and runs ML candidate conflation.
    Returns the compiled compact dataset and statistics.
    """
    country_code = country_code.upper()
    c_info = GCC_COUNTRIES[country_code]

    # Load / initialize the trained ML candidate matching model
    clf = load_or_train_matcher()

    conn = sqlite3.connect(OSM_CACHE_DB)
    cursor = conn.cursor()

    # Pre-index all linked QIDs for instant O(1) lookup
    cursor.execute("SELECT qid, osm_type, osm_id FROM osm_linked")
    linked_map = {}
    for qid, otype, oid in cursor.fetchall():
        linked_map[qid.strip()] = f"{otype}{oid}"

    # Load candidate POIs for the country's bounding box
    bbox = c_info["bbox"]
    cursor.execute("""
    SELECT osm_type, osm_id, lat, lon, name, name_ar, name_en, main_key, main_val
    FROM osm_candidates
    WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?
    """, (bbox[0] - 0.2, bbox[2] + 0.2, bbox[1] - 0.2, bbox[3] + 0.2))
    candidates = cursor.fetchall()
    conn.close()

    print(f"  [Matcher] Loaded {len(linked_map):,} linked OSM objects and {len(candidates):,} candidate POIs for {country_code}.")

    # Build a spatial grid for candidates (0.05 degree cells ~ 5km)
    GRID_SIZE = 0.05
    grid: Dict[Tuple[int, int], List[Tuple]] = {}
    for c in candidates:
        gx = int(c[2] / GRID_SIZE)
        gy = int(c[3] / GRID_SIZE)
        cell = (gx, gy)
        if cell not in grid:
            grid[cell] = []
        grid[cell].append(c)

    compiled_items = []
    counts = {
        "total": 0,
        "missing": 0,
        "candidates": 0,
        "linked": 0,
        "filtered_non_physical": 0
    }

    for item in wd_items:
        qid = item["qid"]
        lat = item["lat"]
        lon = item["lon"]
        cat_id = item["cat"]
        p31 = item["p31"]
        name_ar = item["name_ar"]
        name_en = item["name_en"]

        # Parse numeric part of QID for compact serialization
        qid_num = int(qid[1:]) if qid.startswith("Q") and qid[1:].isdigit() else 0

        # Check 1: Direct link (always preserve elements already mapped in OSM)
        if qid in linked_map:
            status = 2  # LINKED
            osm_ref = linked_map[qid]
            counts["linked"] += 1
            cand_info = ""
        else:
            # Physicality & Ground Truth Filter:
            # Drop events, disasters, timelines, and blank GeoNames imports from missing queue
            is_valid, filter_reason = is_physical_mappable(item)
            if not is_valid:
                counts["filtered_non_physical"] += 1
                continue

            # Check 2: ML Candidate search within 400m
            gx = int(lat / GRID_SIZE)
            gy = int(lon / GRID_SIZE)

            nearby_cands = []
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    cell = (gx + dx, gy + dy)
                    if cell in grid:
                        nearby_cands.extend(grid[cell])

            # Run ML Candidate Matcher (Threshold = 0.60)
            ml_match = find_ml_candidate(clf, item, nearby_cands, threshold=0.60)

            if ml_match:
                best_cand, prob, dist = ml_match
                status = 1  # CANDIDATE_MATCH
                osm_ref = f"{best_cand[0]}{best_cand[1]}"
                cand_name = best_cand[5] or best_cand[4] or best_cand[6] or ""
                cand_info = f"{int(prob * 100)}% Match | {dist}m | {cand_name}"
                counts["candidates"] += 1
            else:
                status = 0  # MISSING_IN_OSM
                osm_ref = ""
                cand_info = ""
                counts["missing"] += 1

        # Compact tuple schema (NSI-aligned):
        # [0: qid_num, 1: lat, 2: lon, 3: cat_id, 4: status, 5: name_ar, 6: name_en, 7: p31,
        #  8: osm_ref, 9: cand_info, 10: image, 11: wiki_ar, 12: website, 13: dissolution_year, 14: social_pipe]
        twitter = item.get("twitter", "")
        instagram = item.get("instagram", "")
        facebook = item.get("facebook", "")
        social_pipe = f"{twitter}|{instagram}|{facebook}" if (twitter or instagram or facebook) else ""

        compiled_items.append([
            qid_num,
            lat,
            lon,
            cat_id,
            status,
            name_ar,
            name_en,
            p31,
            osm_ref,
            cand_info,
            item.get("image", ""),
            item.get("wikipedia_ar", ""),
            item.get("website", ""),
            item.get("dissolved", ""),
            social_pipe
        ])

    counts["total"] = len(compiled_items)
    print(f"  [Matcher Results {country_code}] Total: {counts['total']:,} | Linked: {counts['linked']:,} | ML Candidates: {counts['candidates']:,} | Clean Missing: {counts['missing']:,} | Filtered Non-Physical: {counts['filtered_non_physical']:,}")

    return {
        "country": country_code,
        "country_name_en": c_info["name_en"],
        "country_name_ar": c_info["name_ar"],
        "center": c_info["center"],
        "zoom": c_info["default_zoom"],
        "counts": counts,
        "items": compiled_items
    }
