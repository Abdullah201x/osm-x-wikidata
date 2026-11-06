"""
Linkable-only forward datasets.

Wikidata -> OSM feature imports are restricted to approved OSM users, so the public web app
never needs the "missing" items (status 0: in Wikidata, absent from OSM). `<cc>_linkable.json`
carries the same envelope and the same 15-slot item tuples as `<cc>.json`, restricted to
status 1 (candidate: an OSM element probably exists) and status 2 (already linked).

`<cc>.json` itself is untouched: Manara downloads data/sa.json and relies on its layout.
"""

import json
import os
from typing import Any, Dict, Optional

from pipeline.jsonio import write_dataset

STATUS_SLOT = 4
LINKABLE_STATUSES = (1, 2)


def linkable_path(data_dir: str, cc: str) -> str:
    return os.path.join(data_dir, f"{cc.lower()}_linkable.json")


def derive_linkable(data: Dict[str, Any]) -> Dict[str, Any]:
    """Return a copy of a forward dataset with status-0 (missing) items and counts removed."""
    items = [it for it in data["items"] if it[STATUS_SLOT] in LINKABLE_STATUSES]
    counts = {k: v for k, v in data.get("counts", {}).items() if k != "missing"}
    candidates = sum(1 for it in items if it[STATUS_SLOT] == 1)
    linked = sum(1 for it in items if it[STATUS_SLOT] == 2)
    counts.update({"total": len(items), "candidates": candidates, "linked": linked})

    out = {k: v for k, v in data.items() if k not in ("items", "counts")}
    out["counts"] = counts
    out["items"] = items
    return out


def write_linkable(data_dir: str, cc: str, data: Optional[Dict[str, Any]] = None) -> str:
    """Derive and atomically write data/<cc>_linkable.json. Reads <cc>.json when `data` is omitted."""
    if data is None:
        with open(os.path.join(data_dir, f"{cc.lower()}.json"), "r", encoding="utf-8") as f:
            data = json.load(f)
    return write_dataset(linkable_path(data_dir, cc), derive_linkable(data))
