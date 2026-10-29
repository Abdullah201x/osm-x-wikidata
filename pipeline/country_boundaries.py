"""
Country Boundary Extractor & Spatial Matcher for the 6 GCC Countries.
Extracts admin_level=2 relation polygons from GCC PBF and caches them as GeoJSON.
Uses shapely.prepared for microsecond point-in-polygon assignment.
"""

import os
import sys
import json
import time
from typing import Optional, Dict, Tuple, Any

import osmium
from shapely.geometry import Point, LineString, Polygon, MultiPolygon, shape, mapping
from shapely.ops import polygonize, unary_union
from shapely.prepared import prep, PreparedGeometry

from pipeline.config import BASE_DIR, PIPELINE_DIR, GCC_COUNTRIES, QID_TO_COUNTRY_CODE, find_pbf

BOUNDARIES_GEOJSON = os.path.join(PIPELINE_DIR, "gcc_boundaries.geojson")

# Mapping of relation IDs to country codes
GCC_RELATIONS = {
    v["relation_id"]: k for k, v in GCC_COUNTRIES.items()
}

class GCCRelationWayCollector(osmium.SimpleHandler):
    """Pass 1: Identifies outer member ways for GCC country boundary relations."""
    def __init__(self, target_rel_ids: set):
        super().__init__()
        self.target_rel_ids = target_rel_ids
        self.cc_ways: Dict[str, set] = {k: set() for k in GCC_COUNTRIES.keys()}
        self.all_way_ids = set()

    def relation(self, r):
        if r.id in self.target_rel_ids:
            cc = GCC_RELATIONS[r.id]
            for m in r.members:
                if m.type == "w" and m.role == "outer":
                    self.cc_ways[cc].add(m.ref)
                    self.all_way_ids.add(m.ref)

class GCCWayCoordinateCollector(osmium.SimpleHandler):
    """Pass 2: Collects line geometries for the identified boundary ways."""
    def __init__(self, target_way_ids: set):
        super().__init__()
        self.target_way_ids = target_way_ids
        self.way_lines: Dict[int, LineString] = {}

    def way(self, w):
        if w.id in self.target_way_ids:
            coords = []
            try:
                for node in w.nodes:
                    coords.append((node.lon, node.lat))
                if len(coords) >= 2:
                    self.way_lines[w.id] = LineString(coords)
            except osmium.InvalidLocationError:
                pass

def extract_and_cache_gcc_boundaries(pbf_path: Optional[str] = None, force: bool = False) -> str:
    """
    Extracts the 6 GCC country boundary polygons from PBF and writes gcc_boundaries.geojson.
    Skips extraction if the GeoJSON cache is newer than the PBF mtime.
    """
    if not pbf_path:
        pbf_path = find_pbf(BASE_DIR)
    if not pbf_path or not os.path.exists(pbf_path):
        raise FileNotFoundError(f"Could not find valid PBF file to extract boundaries.")

    pbf_mtime = os.path.getmtime(pbf_path)
    if not force and os.path.exists(BOUNDARIES_GEOJSON):
        if os.path.getmtime(BOUNDARIES_GEOJSON) >= pbf_mtime:
            return BOUNDARIES_GEOJSON

    print(f"  [Boundaries] Extracting GCC country boundaries from {os.path.basename(pbf_path)}...")
    t0 = time.time()

    rel_collector = GCCRelationWayCollector(set(GCC_RELATIONS.keys()))
    rel_collector.apply_file(pbf_path)

    coord_collector = GCCWayCoordinateCollector(rel_collector.all_way_ids)
    coord_collector.apply_file(pbf_path, locations=True)

    features = []
    for cc, c_info in GCC_COUNTRIES.items():
        rel_id = c_info["relation_id"]
        way_ids = rel_collector.cc_ways[cc]
        lines = [coord_collector.way_lines[wid] for wid in way_ids if wid in coord_collector.way_lines]

        if not lines:
            print(f"  [Boundaries WARNING] No lines found for {cc} (rel {rel_id})")
            continue

        merged_lines = unary_union(lines)
        polys = list(polygonize(merged_lines))
        if polys:
            final_geom = unary_union(polys)
        else:
            # Fallback if unclosed: convex hull or buffered linestring
            print(f"  [Boundaries WARNING] Could not polygonize lines for {cc}, using convex hull fallback")
            final_geom = merged_lines.convex_hull

        features.append({
            "type": "Feature",
            "properties": {
                "country_code": cc,
                "name_en": c_info["name_en"],
                "name_ar": c_info["name_ar"],
                "relation_id": rel_id,
                "qid": c_info["qid"],
            },
            "geometry": mapping(final_geom)
        })

    fc = {
        "type": "FeatureCollection",
        "features": features
    }

    with open(BOUNDARIES_GEOJSON, "w", encoding="utf-8") as f:
        json.dump(fc, f, ensure_ascii=False)

    print(f"  [Boundaries] Saved {len(features)} country boundaries to {BOUNDARIES_GEOJSON} in {time.time() - t0:.1f}s")
    return BOUNDARIES_GEOJSON

class CountryMatcher:
    """
    In-memory spatial country resolver using prepared shapely polygons.
    Implements a 3-tier country assignment waterfall.
    """
    def __init__(self, geojson_path: Optional[str] = None):
        if not geojson_path or not os.path.exists(geojson_path):
            geojson_path = BOUNDARIES_GEOJSON
        if not os.path.exists(geojson_path):
            geojson_path = extract_and_cache_gcc_boundaries()

        self.geoms: Dict[str, Any] = {}
        self.prepared: Dict[str, PreparedGeometry] = {}
        self.buffered_prep: Dict[str, PreparedGeometry] = {}

        with open(geojson_path, "r", encoding="utf-8") as f:
            fc = json.load(f)

        for feat in fc.get("features", []):
            cc = feat["properties"]["country_code"]
            geom = shape(feat["geometry"])
            self.geoms[cc] = geom
            self.prepared[cc] = prep(geom)
            # 2 km (~0.02 deg) buffer for offshore islands, coastal piers, and territorial waters
            buffered = geom.buffer(0.02)
            self.buffered_prep[cc] = prep(buffered)

    def match_point(self, lat: float, lon: float) -> Optional[str]:
        """Matches a (lat, lon) point to one of the 6 GCC countries."""
        if not (12.0 <= lat <= 34.0 and 33.0 <= lon <= 61.0):
            return None
        pt = Point(lon, lat)

        # Pass A: Exact polygon containment (covers 99%+ of land items)
        for cc, p_geom in self.prepared.items():
            if p_geom.contains(pt):
                return cc

        # Pass B: Coastal 2 km buffer (covers offshore piers, reef beacons, lighthouses)
        for cc, b_geom in self.buffered_prep.items():
            if b_geom.contains(pt):
                return cc

        return None

    def resolve_country(
        self,
        lat: float,
        lon: float,
        osm_tags: Optional[Dict[str, str]] = None,
        wd_item: Optional[Dict[str, Any]] = None
    ) -> Optional[str]:
        """
        Three-tier country assignment waterfall:
        1. OSM (lat, lon) != (0, 0) -> Point-in-polygon (or coastal buffer).
           If outside all 6 countries, return None (border bleed cleanly dropped).
        2. OSM tags (ISO3166-1, ISO3166-1:alpha2, addr:country).
        3. Wikidata P625 coords -> point-in-polygon, then Wikidata P17.
        """
        # Tier 1: OSM coordinates
        if lat != 0.0 and lon != 0.0:
            cc = self.match_point(lat, lon)
            if cc:
                return cc
            # Point has nonzero coordinates but lies outside all 6 GCC countries -> border bleed
            return None

        # Tier 2: OSM tags (relations or boundary objects with (0, 0) coords)
        if osm_tags:
            iso = (osm_tags.get("ISO3166-1") or osm_tags.get("ISO3166-1:alpha2") or osm_tags.get("addr:country") or "").upper().strip()
            if iso in GCC_COUNTRIES:
                return iso

        # Tier 3: Wikidata properties
        if wd_item:
            wd_lat = wd_item.get("lat")
            wd_lon = wd_item.get("lon")
            if wd_lat is not None and wd_lon is not None and (wd_lat != 0.0 or wd_lon != 0.0):
                cc = self.match_point(wd_lat, wd_lon)
                if cc:
                    return cc

            # Wikidata P17
            p17_list = wd_item.get("p17", [])
            if isinstance(p17_list, str):
                p17_list = [p17_list]
            for p17_qid in p17_list:
                if p17_qid in QID_TO_COUNTRY_CODE:
                    return QID_TO_COUNTRY_CODE[p17_qid]

        return None

_MATCHER_INSTANCE: Optional[CountryMatcher] = None

def get_country_matcher() -> CountryMatcher:
    global _MATCHER_INSTANCE
    if _MATCHER_INSTANCE is None:
        _MATCHER_INSTANCE = CountryMatcher()
    return _MATCHER_INSTANCE

