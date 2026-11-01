"""
In-Memory Store for Reverse Datasets and Summary Metadata.
Loads data/summary.json and data/reverse_<cc>.json into memory at startup.
Hot-reloads atomically if summary.json mtime changes (checked at most once per 60s).
"""

import os
import json
import time
from typing import Dict, List, Any, Optional

from app.config import DATA_DIR

class DatasetStore:
    def __init__(self, data_dir: str = DATA_DIR):
        self.data_dir = data_dir
        self.summary: Dict[str, Any] = {}
        self.reverse_datasets: Dict[str, Dict[str, Any]] = {}
        self.last_mtime: float = 0.0
        self.last_check_time: float = 0.0
        self.reload()

    def reload(self):
        summary_path = os.path.join(self.data_dir, "summary.json")
        if not os.path.exists(summary_path):
            self.summary = {"countries": {}, "updated_at": ""}
            self.reverse_datasets = {}
            return

        try:
            mtime = os.path.getmtime(summary_path)
            with open(summary_path, "r", encoding="utf-8") as f:
                new_summary = json.load(f)

            new_reverse = {}
            for cc in ("sa", "ae", "kw", "qa", "bh", "om"):
                rev_path = os.path.join(self.data_dir, f"reverse_{cc}.json")
                if os.path.exists(rev_path):
                    with open(rev_path, "r", encoding="utf-8") as rf:
                        new_reverse[cc] = json.load(rf)

            self.summary = new_summary
            self.reverse_datasets = new_reverse
            self.last_mtime = mtime
            self.last_check_time = time.time()
            print(f"[DatasetStore] Loaded datasets: {list(self.reverse_datasets.keys())} (summary mtime: {mtime})")
        except Exception as e:
            print(f"[DatasetStore ERROR] Failed to reload datasets: {e}")

    def maybe_reload(self):
        now = time.time()
        # Check mtime at most once every 60 seconds
        if now - self.last_check_time < 60:
            return
        self.last_check_time = now

        summary_path = os.path.join(self.data_dir, "summary.json")
        if os.path.exists(summary_path):
            current_mtime = os.path.getmtime(summary_path)
            if current_mtime > self.last_mtime:
                print(f"[DatasetStore] summary.json changed on disk ({current_mtime} > {self.last_mtime}). Reloading...")
                self.reload()

    def query_reverse(
        self,
        country_code: str = "sa",
        kinds: Optional[List[str]] = None,
        subkind: Optional[str] = None,
        min_confidence: Optional[float] = None,
        search_query: Optional[str] = None,
        bbox: Optional[List[float]] = None,
        page: int = 1,
        page_size: int = 50
    ) -> Dict[str, Any]:
        self.maybe_reload()
        cc = country_code.lower()
        dataset = self.reverse_datasets.get(cc)

        if not dataset:
            return {
                "country": cc.upper(),
                "counts_by_kind": {},
                "total": 0,
                "page": page,
                "page_size": page_size,
                "items": []
            }

        all_items = dataset.get("items", [])
        filtered = []

        q_clean = (search_query or "").strip().lower()
        kinds_set = set(k.strip() for k in kinds) if kinds else None

        for it in all_items:
            # 1. Kind filter
            if kinds_set and it.get("kind") not in kinds_set:
                continue

            # 2. Subkind filter
            if subkind and it.get("subkind") != subkind:
                continue

            # 3. Confidence filter
            if min_confidence is not None and it.get("confidence", 0.0) < min_confidence:
                continue

            # 4. Text search (matches QID, OSM ID, Arabic/English name)
            if q_clean:
                qid = it.get("qid", "").lower()
                osm_id_str = str(it.get("osm_id", ""))
                osm_info = it.get("osm") or {}
                wd_info = it.get("wikidata") or {}

                text_corpus = (
                    f"{qid} {osm_id_str} "
                    f"{osm_info.get('name', '')} {osm_info.get('name_ar', '')} {osm_info.get('name_en', '')} "
                    f"{wd_info.get('name_ar', '')} {wd_info.get('name_en', '')}"
                ).lower()

                if q_clean not in text_corpus:
                    continue

            # 5. Bounding box filter [minLon, minLat, maxLon, maxLat]
            if bbox and len(bbox) == 4:
                min_lon, min_lat, max_lon, max_lat = bbox
                osm_info = it.get("osm") or {}
                olat = osm_info.get("lat")
                olon = osm_info.get("lon")
                if olat is not None and olon is not None and (olat != 0.0 or olon != 0.0):
                    if not (min_lat <= olat <= max_lat and min_lon <= olon <= max_lon):
                        continue

            filtered.append(it)

        # Compute breakdown by kind for filtered set
        counts_by_kind: Dict[str, int] = {}
        for it in filtered:
            k = it.get("kind", "unknown")
            counts_by_kind[k] = counts_by_kind.get(k, 0) + 1

        total = len(filtered)
        page = max(1, page)
        page_size = min(max(1, page_size), 200)
        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size
        page_items = filtered[start_idx:end_idx]

        return {
            "country": cc.upper(),
            "counts_by_kind": counts_by_kind,
            "total": total,
            "page": page,
            "page_size": page_size,
            "items": page_items
        }

