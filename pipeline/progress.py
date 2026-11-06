"""
Progress over time: one row per country per pipeline run in data/progress.json.

    {"version": 1, "rows": [{"date": "2026-11-06", "cc": "sa", "linked": 4200, "candidates": 900,
                              "missing_backlink": 1100, "broken": 40, "conflict": 300}, ...]}

Rows come from summary.json after a full run. A re-run on the same day replaces
that day's row, and only the newest MAX_ROWS rows are kept (about two months of
daily runs for six countries). The About panel draws per-country sparklines from it.

    python -m pipeline.progress      # append today's rows from the current data/summary.json
"""

import json
import os
import re
import sys
import time
from typing import Dict, List, Optional

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from pipeline.config import DATA_DIR, GCC_COUNTRIES  # noqa: E402

PROGRESS_FILE = "progress.json"
MAX_ROWS = 400
INT_FIELDS = ("linked", "candidates", "missing_backlink", "broken", "conflict")
RE_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def rows_from_summary(summary: dict, date: str) -> List[Dict]:
    """One progress row per country in summary.json."""
    rows = []
    for cc, info in sorted((summary.get("countries") or {}).items()):
        counts = info.get("counts") or {}
        rev = info.get("reverse_counts") or {}
        rows.append({
            "date": date,
            "cc": cc.lower(),
            "linked": int(counts.get("linked", 0)),
            "candidates": int(counts.get("candidates", 0)),
            "missing_backlink": int(rev.get("missing_backlink", 0)),
            "broken": int(rev.get("broken_osm_tag", 0)),
            "conflict": int(rev.get("conflict", 0)),
        })
    return rows


def load_progress(path: str) -> List[Dict]:
    if not os.path.exists(path):
        return []
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return list(data.get("rows") or [])
    except (OSError, ValueError, AttributeError):
        return []


def merge_rows(existing: List[Dict], new_rows: List[Dict], max_rows: int = MAX_ROWS) -> List[Dict]:
    """Replace rows with the same (date, cc), sort by date then country, keep the newest max_rows."""
    replaced = {(r["date"], r["cc"]) for r in new_rows}
    merged = [r for r in existing if (r.get("date"), r.get("cc")) not in replaced] + list(new_rows)
    merged.sort(key=lambda r: (r["date"], r["cc"]))
    return merged[-max_rows:] if max_rows else merged


def append_progress(data_dir: str, summary: dict, date: Optional[str] = None) -> str:
    """Append this run's rows to data/progress.json (atomic write). Returns the file path."""
    date = date or time.strftime("%Y-%m-%d", time.gmtime())
    path = os.path.join(data_dir, PROGRESS_FILE)
    rows = merge_rows(load_progress(path), rows_from_summary(summary, date))
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        # One row per line: small, readable git diffs as rows accumulate.
        f.write('{"version": 1, "rows": [\n')
        f.write(",\n".join(json.dumps(r, ensure_ascii=False, separators=(",", ":")) for r in rows))
        f.write("\n]}\n")
    os.replace(tmp, path)
    return path


def validate_progress(path: str) -> List[str]:
    """Schema check used by pipeline/validate_data.py."""
    if not os.path.exists(path):
        return [f"{path} does not exist"]
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError) as e:
        return [f"{path} is not valid JSON: {e}"]
    if not isinstance(data, dict) or data.get("version") != 1 or not isinstance(data.get("rows"), list):
        return [f"{path} must be an object with version 1 and a rows list"]

    rows = data["rows"]
    errors = []
    if not rows:
        errors.append(f"{path} has no rows")
    if len(rows) > MAX_ROWS:
        errors.append(f"{path} has {len(rows)} rows (max {MAX_ROWS})")
    valid_cc = {c.lower() for c in GCC_COUNTRIES}
    seen = set()
    for i, r in enumerate(rows):
        if not isinstance(r, dict):
            errors.append(f"{path} row {i} is not an object")
            continue
        if not RE_DATE.match(str(r.get("date", ""))):
            errors.append(f"{path} row {i} has a bad date: {r.get('date')!r}")
        if r.get("cc") not in valid_cc:
            errors.append(f"{path} row {i} has an unknown country: {r.get('cc')!r}")
        for field in INT_FIELDS:
            v = r.get(field)
            if not isinstance(v, int) or isinstance(v, bool) or v < 0:
                errors.append(f"{path} row {i} field {field} must be a non-negative integer, got {v!r}")
        key = (r.get("date"), r.get("cc"))
        if key in seen:
            errors.append(f"{path} has a duplicate row for {key}")
        seen.add(key)
    dates = [str(r.get("date", "")) for r in rows if isinstance(r, dict)]
    if dates != sorted(dates):
        errors.append(f"{path} rows are not sorted by date")
    return errors[:20]


def main():
    summary_path = os.path.join(DATA_DIR, "summary.json")
    with open(summary_path, "r", encoding="utf-8") as f:
        summary = json.load(f)
    # Date the rows by the data, not by when this command runs.
    updated = str(summary.get("updated_at", ""))[:10]
    path = append_progress(DATA_DIR, summary, updated if RE_DATE.match(updated) else None)
    print(f"[Progress] Wrote {path}")


if __name__ == "__main__":
    main()
