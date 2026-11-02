"""
In-Memory Store for Reverse Datasets and Summary Metadata.
Loads data/summary.json and data/reverse_<cc>.json into memory at startup.
Hot-reloads atomically if summary.json mtime changes (checked at most once per 60s).
"""

import os
import json
import logging
import time
from typing import Dict, List, Any, Optional

from app.config import DATA_DIR

logger = logging.getLogger(__name__)

KNOWN_KINDS = frozenset({"missing_backlink", "broken_osm_tag", "conflict", "review_gap"})


def _search_corpus(it: Dict[str, Any]) -> str:
    """Lowercased text matched by the `q` search: QID, OSM id and every name field."""
    osm_info = it.get("osm") or {}
    wd_info = it.get("wikidata") or {}
    return (
        f"{it.get('qid', '')} {it.get('osm_id', '')} "
        f"{osm_info.get('name', '')} {osm_info.get('name_ar', '')} {osm_info.get('name_en', '')} "
        f"{wd_info.get('name_ar', '')} {wd_info.get('name_en', '')}"
    ).lower()

class DatasetStore:
    def __init__(self, data_dir: str = DATA_DIR):
        self.data_dir = data_dir
        self.summary: Dict[str, Any] = {}
        self.reverse_datasets: Dict[str, Dict[str, Any]] = {}
        # id(item) -> search corpus, built once per reload instead of once per request.
        self._corpus: Dict[int, str] = {}
        self.last_mtime: float = 0.0
        self.last_check_time: float = 0.0
        self.reload()

    def reload(self):
        summary_path = os.path.join(self.data_dir, "summary.json")
        if not os.path.exists(summary_path):
            self.summary = {"countries": {}, "updated_at": ""}
            self.reverse_datasets = {}
            self._corpus = {}
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

            new_corpus = {id(it): _search_corpus(it) for ds in new_reverse.values() for it in ds.get("items", [])}

            # Swap all three together so a concurrent request never sees a corpus
            # that does not belong to the datasets it is filtering.
            self.summary = new_summary
            self.reverse_datasets = new_reverse
            self._corpus = new_corpus
            self.last_mtime = mtime
            self.last_check_time = time.time()
            logger.info("Loaded datasets: %s (summary mtime: %s)", list(new_reverse.keys()), mtime)
        except Exception:
            logger.exception("Failed to reload datasets")

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
                logger.info("summary.json changed on disk (%s > %s); reloading", current_mtime, self.last_mtime)
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
        corpus = self._corpus
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
            if q_clean and q_clean not in corpus.get(id(it), ""):
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

