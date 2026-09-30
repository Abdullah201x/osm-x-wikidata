"""
High-Speed Local PBF Extractor for GCC OSM Data using pyosmium.
Extracts:
1. All OSM entities (nodes & ways) tagged with `wikidata=*`.
2. Candidate POIs (nodes & ways with names and relevant feature tags).
Stores results in local SQLite cache (`pipeline/osm_cache.db`).
"""

import os
import sys
import time
import json
import sqlite3
from typing import Dict, List, Any, Optional, Tuple
import osmium

from pipeline.config import find_pbf, BASE_DIR

OSM_CACHE_DB = os.path.join(BASE_DIR, "pipeline", "osm_cache.db")

TARGET_TAG_KEYS = (
    "amenity", "historic", "tourism", "place", "building",
    "leisure", "natural", "waterway", "aeroway", "man_made", "office",
    "shop", "healthcare", "craft", "boundary", "emergency"
)

def init_osm_db():
    conn = sqlite3.connect(OSM_CACHE_DB)
    cursor = conn.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS osm_linked (
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

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS osm_candidates (
        osm_type TEXT NOT NULL,
        osm_id INTEGER NOT NULL,
        lat REAL NOT NULL,
        lon REAL NOT NULL,
        name TEXT,
        name_ar TEXT,
        name_en TEXT,
        main_key TEXT,
        main_val TEXT,
        PRIMARY KEY (osm_type, osm_id)
    )
    """)

    cursor.execute("CREATE INDEX IF NOT EXISTS idx_linked_qid ON osm_linked(qid)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_linked_lat_lon ON osm_linked(lat, lon)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_cand_lat_lon ON osm_candidates(lat, lon)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_cand_name ON osm_candidates(name)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_cand_name_ar ON osm_candidates(name_ar)")

    conn.commit()
    conn.close()

class GCCPbfHandler(osmium.SimpleHandler):
    """
    Scans the GCC .osm.pbf file and extracts both linked objects and candidate POIs.
    """
    def __init__(self, batch_size: int = 50000):
        super().__init__()
        self.batch_size = batch_size
        self.linked_batch: List[Tuple] = []
        self.candidate_batch: List[Tuple] = []
        self.conn = sqlite3.connect(OSM_CACHE_DB)
        self.cursor = self.conn.cursor()
        self.total_linked = 0
        self.total_candidates = 0

    def _flush(self):
        if self.linked_batch:
            self.cursor.executemany("""
            INSERT OR REPLACE INTO osm_linked VALUES (?,?,?,?,?,?,?,?,?,?,?)
            """, self.linked_batch)
            self.total_linked += len(self.linked_batch)
            self.linked_batch.clear()

        if self.candidate_batch:
            self.cursor.executemany("""
            INSERT OR REPLACE INTO osm_candidates VALUES (?,?,?,?,?,?,?,?,?)
            """, self.candidate_batch)
            self.total_candidates += len(self.candidate_batch)
            self.candidate_batch.clear()

        self.conn.commit()

    def node(self, n):
        tags = n.tags
        if not tags:
            return

        try:
            lon, lat = n.location.lon, n.location.lat
        except osmium.InvalidLocationError:
            return

        # Basic GCC bounding box sanity check: lat 12-34, lon 33-61
        if not (12.0 <= lat <= 34.0 and 33.0 <= lon <= 61.0):
            return

        wd = tags.get('wikidata') or tags.get('brand:wikidata') or tags.get('operator:wikidata')
        name = tags.get('name') or tags.get('brand') or tags.get('operator')
        name_ar = tags.get('name:ar') or tags.get('brand:ar')
        name_en = tags.get('name:en') or tags.get('brand:en')

        # Find primary feature tag
        main_k = ""
        main_v = ""
        for k in TARGET_TAG_KEYS:
            if k in tags:
                main_k = k
                main_v = tags.get(k, "")
                break

        if wd and wd.startswith('Q'):
            # Linked entity
            tags_dict = {t.k: t.v for t in tags}
            self.linked_batch.append((
                'n', n.id, round(lat, 6), round(lon, 6), wd.strip(),
                name or "", name_ar or "", name_en or "",
                main_k, main_v, json.dumps(tags_dict, ensure_ascii=False)
            ))
        elif main_k and (name or name_ar or name_en):
            # Candidate POI without wikidata
            self.candidate_batch.append((
                'n', n.id, round(lat, 6), round(lon, 6),
                name or "", name_ar or "", name_en or "",
                main_k, main_v
            ))

        if len(self.linked_batch) >= self.batch_size or len(self.candidate_batch) >= self.batch_size:
            self._flush()

    def way(self, w):
        tags = w.tags
        if not tags:
            return

        wd = tags.get('wikidata') or tags.get('brand:wikidata') or tags.get('operator:wikidata')
        main_k = ""
        main_v = ""
        for k in TARGET_TAG_KEYS:
            if k in tags:
                main_k = k
                main_v = tags.get(k, "")
                break

        name = tags.get('name') or tags.get('brand') or tags.get('operator')
        name_ar = tags.get('name:ar') or tags.get('brand:ar')
        name_en = tags.get('name:en') or tags.get('brand:en')

        # Only process if it has wikidata or is a candidate POI
        if not (wd and wd.startswith('Q')) and not (main_k and (name or name_ar or name_en)):
            return

        # Compute centroid from way nodes
        try:
            nodes = w.nodes
            n_nodes = len(nodes)
            if n_nodes == 0:
                return
            sum_lat = 0.0
            sum_lon = 0.0
            valid_nodes = 0
            for node in nodes:
                try:
                    sum_lat += node.lat
                    sum_lon += node.lon
                    valid_nodes += 1
                except osmium.InvalidLocationError:
                    pass

            if valid_nodes == 0:
                return

            lat = sum_lat / valid_nodes
            lon = sum_lon / valid_nodes
        except Exception:
            return

        if not (12.0 <= lat <= 34.0 and 33.0 <= lon <= 61.0):
            return

        if wd and wd.startswith('Q'):
            tags_dict = {t.k: t.v for t in tags}
            self.linked_batch.append((
                'w', w.id, round(lat, 6), round(lon, 6), wd.strip(),
                name or "", name_ar or "", name_en or "",
                main_k, main_v, json.dumps(tags_dict, ensure_ascii=False)
            ))
        elif main_k and (name or name_ar or name_en):
            self.candidate_batch.append((
                'w', w.id, round(lat, 6), round(lon, 6),
                name or "", name_ar or "", name_en or "",
                main_k, main_v
            ))

        if len(self.linked_batch) >= self.batch_size or len(self.candidate_batch) >= self.batch_size:
            self._flush()

    def close(self):
        self._flush()
        self.conn.close()

def extract_pbf_to_cache(pbf_path: Optional[str] = None, force_reparse: bool = False) -> Tuple[int, int]:
    """
    Extracts linked entities and candidate POIs from the local PBF file into SQLite.
    Skips extraction if cache is up-to-date with PBF mtime.
    """
    init_osm_db()

    if not pbf_path:
        pbf_path = find_pbf()
    if not pbf_path or not os.path.exists(pbf_path):
        raise FileNotFoundError("Could not find a valid .osm.pbf file in project or 'update osm' directory.")

    pbf_mtime = str(os.path.getmtime(pbf_path))

    conn = sqlite3.connect(OSM_CACHE_DB)
    cursor = conn.cursor()
    cursor.execute("SELECT value FROM meta WHERE key = 'pbf_mtime'")
    row = cursor.fetchone()
    cached_mtime = row[0] if row else None

    cursor.execute("SELECT COUNT(*) FROM osm_linked")
    linked_count = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM osm_candidates")
    cand_count = cursor.fetchone()[0]
    conn.close()

    if not force_reparse and cached_mtime == pbf_mtime and linked_count > 0:
        print(f"  [OSM Cache] Local PBF cache is current ({linked_count:,} linked, {cand_count:,} candidate POIs). Skipping reparse.")
        return linked_count, cand_count

    print(f"  [OSM Parser] Parsing {os.path.basename(pbf_path)} ({os.path.getsize(pbf_path) / (1024*1024):.1f} MB)...")
    start_time = time.time()

    # Clear old records
    conn = sqlite3.connect(OSM_CACHE_DB)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM osm_linked")
    cursor.execute("DELETE FROM osm_candidates")
    conn.commit()
    conn.close()

    handler = GCCPbfHandler()
    handler.apply_file(pbf_path, locations=True)
    handler.close()

    elapsed = time.time() - start_time

    # Record mtime
    conn = sqlite3.connect(OSM_CACHE_DB)
    cursor = conn.cursor()
    cursor.execute("INSERT OR REPLACE INTO meta VALUES ('pbf_mtime', ?)", (pbf_mtime,))
    cursor.execute("INSERT OR REPLACE INTO meta VALUES ('pbf_file', ?)", (os.path.basename(pbf_path),))
    cursor.execute("INSERT OR REPLACE INTO meta VALUES ('last_parsed', ?)", (time.ctime(),))
    conn.commit()

    cursor.execute("SELECT COUNT(*) FROM osm_linked")
    linked_count = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM osm_candidates")
    cand_count = cursor.fetchone()[0]
    conn.close()

    print(f"  [OSM Parser] Finished in {elapsed:.1f}s. Extracted {linked_count:,} linked entities and {cand_count:,} candidates.")
    return linked_count, cand_count
