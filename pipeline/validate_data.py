"""
Sanity checks run after the data update pipeline and before anything is committed or published.

Exits non-zero (which blocks CI and stops git publish) when any dataset:
1. Is missing or unreadable.
2. Violates schema (forward 15-element tuples, reverse QA anomaly dicts).
3. Has shrunk suspiciously compared with the last published git commit (MIN_RATIO = 0.8).
"""

import json
import os
import subprocess
import sys

# Ensure repository root is on sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from typing import List, Tuple
from pipeline.config import BASE_DIR, DATA_DIR, GCC_COUNTRIES
from pipeline.linkable import derive_linkable

# Minimum fraction of the previously published count a dataset may drop to (20% maximum drop)
MIN_RATIO = 0.8

# The public (non-importer) dataset must stay small: every anonymous visitor downloads it.
MAX_LINKABLE_BYTES = {"sa": 2 * 1024 * 1024}
DEFAULT_MAX_LINKABLE_BYTES = 1024 * 1024


def get_git_file_json(rel_path: str) -> dict:
    """Read a JSON file from the HEAD git commit if available."""
    try:
        # Normalize path for git (forward slashes)
        git_path = rel_path.replace("\\", "/")
        out = subprocess.run(
            ["git", "show", f"HEAD:{git_path}"],
            cwd=BASE_DIR,
            capture_output=True,
            text=True,
            encoding="utf-8",
        )
        if out.returncode == 0 and out.stdout.strip():
            return json.loads(out.stdout)
    except Exception:
        pass
    return {}


def validate_forward_dataset(cc: str, path: str) -> Tuple[List[str], int]:
    """Validate schema and structure of a forward dataset (15-element tuples)."""
    errors = []
    if not os.path.exists(path):
        return [f"Forward dataset {path} does not exist"], 0

    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        return [f"Forward dataset {path} is not valid JSON: {e}"], 0

    if data.get("country", "").upper() != cc.upper():
        errors.append(f"{path}: country '{data.get('country')}' does not match expected '{cc.upper()}'")

    items = data.get("items")
    if not isinstance(items, list):
        errors.append(f"{path}: 'items' must be a list")
        return errors, 0

    count = len(items)
    if count == 0:
        errors.append(f"{path}: 'items' is empty (zero records)")

    # Sample and validate 15-element tuple layout
    for idx, item in enumerate(items[:200]):
        if not isinstance(item, list) or len(item) != 15:
            errors.append(f"{path}: item {idx} must be a 15-element list, got length {len(item) if isinstance(item, list) else type(item)}")
            break
        if not isinstance(item[0], int) or item[0] <= 0:
            errors.append(f"{path}: item {idx}[0] must be numeric QID integer > 0, got {item[0]}")
            break
        if not (1 <= item[3] <= 6):
            errors.append(f"{path}: item {idx}[3] must be category 1..6, got {item[3]}")
            break

    return errors, count


def validate_linkable_dataset(cc: str, path: str, full_path: str) -> Tuple[List[str], int]:
    """
    Validate data/<cc>_linkable.json: the import-free public copy of <cc>.json.
    It must contain no status-0 (missing) items, be internally consistent, stay small,
    and equal exactly what derive_linkable() produces from the current full dataset.
    """
    errors, count = validate_forward_dataset(cc, path)
    if not os.path.exists(path):
        return errors, 0

    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return errors, count  # already reported by validate_forward_dataset

    items = data.get("items", [])
    if any(isinstance(it, list) and len(it) > 4 and it[4] not in (1, 2) for it in items):
        errors.append(f"{path}: contains items that are not status 1 (candidate) or 2 (linked)")

    counts = data.get("counts", {})
    if "missing" in counts:
        errors.append(f"{path}: counts must not expose 'missing'")
    if counts.get("total") != count or counts.get("candidates", 0) + counts.get("linked", 0) != count:
        errors.append(f"{path}: counts {counts} are inconsistent with {count:,} items")

    limit = MAX_LINKABLE_BYTES.get(cc, DEFAULT_MAX_LINKABLE_BYTES)
    size = os.path.getsize(path)
    if size > limit:
        errors.append(f"{path}: {size:,} bytes exceeds the {limit:,} byte budget for the public dataset")

    if os.path.exists(full_path):
        try:
            with open(full_path, "r", encoding="utf-8") as f:
                full = json.load(f)
            if derive_linkable(full) != data:
                errors.append(f"{path}: is stale; regenerate with `python update_data.py --derive-linkable`")
        except Exception as e:
            errors.append(f"{path}: could not compare with {full_path}: {e}")

    return errors, count


def validate_reverse_dataset(cc: str, path: str) -> Tuple[List[str], int]:
    """Validate schema and structure of a reverse QA dataset."""
    errors = []
    if not os.path.exists(path):
        return [f"Reverse dataset {path} does not exist"], 0

    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        return [f"Reverse dataset {path} is not valid JSON: {e}"], 0

    items = data.get("items")
    if not isinstance(items, list):
        errors.append(f"{path}: 'items' must be a list")
        return errors, 0

    count = len(items)
    required_keys = {"osm_type", "osm_id", "qid", "kind", "confidence", "reasons"}

    for idx, item in enumerate(items[:200]):
        if not isinstance(item, dict) or not required_keys.issubset(item.keys()):
            errors.append(f"{path}: item {idx} missing required QA keys: {required_keys - set(item.keys() if isinstance(item, dict) else [])}")
            break

    return errors, count


def validate_all_datasets() -> List[str]:
    """Runs all checks across forward, reverse, and summary datasets."""
    errors = []
    countries = [c.lower() for c in GCC_COUNTRIES.keys()]

    print("[Validator] Checking GCC forward datasets...")
    for cc in countries:
        rel_path = f"data/{cc}.json"
        full_path = os.path.join(BASE_DIR, rel_path)
        errs, count = validate_forward_dataset(cc, full_path)
        errors.extend(errs)

        # Shrink guard check
        prev_data = get_git_file_json(rel_path)
        prev_count = len(prev_data.get("items", [])) if prev_data else None
        status = "OK"
        if prev_count and count < prev_count * MIN_RATIO:
            errors.append(f"{rel_path}: {count:,} items, down from {prev_count:,} (>20% drop!)")
            status = "SHRUNK"
        print(f"  [{status}] {rel_path}: {count:,} items" + (f" (was {prev_count:,})" if prev_count else ""))

    print("\n[Validator] Checking GCC linkable (public) datasets...")
    for cc in countries:
        rel_path = f"data/{cc}_linkable.json"
        errs, count = validate_linkable_dataset(
            cc, os.path.join(BASE_DIR, rel_path), os.path.join(BASE_DIR, f"data/{cc}.json")
        )
        errors.extend(errs)
        print(f"  [{'FAIL' if errs else 'OK'}] {rel_path}: {count:,} items")

    print("\n[Validator] Checking GCC reverse QA datasets...")
    for cc in countries:
        rel_path = f"data/reverse_{cc}.json"
        full_path = os.path.join(BASE_DIR, rel_path)
        errs, count = validate_reverse_dataset(cc, full_path)
        errors.extend(errs)

        prev_data = get_git_file_json(rel_path)
        prev_count = len(prev_data.get("items", [])) if prev_data else None
        status = "OK"
        if prev_count and count < prev_count * MIN_RATIO:
            errors.append(f"{rel_path}: {count:,} items, down from {prev_count:,} (>20% drop!)")
            status = "SHRUNK"
        print(f"  [{status}] {rel_path}: {count:,} anomalies" + (f" (was {prev_count:,})" if prev_count else ""))

    print("\n[Validator] Checking summary.json...")
    summary_path = os.path.join(DATA_DIR, "summary.json")
    if not os.path.exists(summary_path):
        errors.append("data/summary.json is missing")
    else:
        try:
            with open(summary_path, "r", encoding="utf-8") as f:
                summary = json.load(f)
            if "total_items" not in summary or "countries" not in summary:
                errors.append("data/summary.json missing total_items or countries dict")
        except Exception as e:
            errors.append(f"data/summary.json invalid: {e}")

    return errors


def main():
    errors = validate_all_datasets()
    if errors:
        print("\n[FAIL] Data validation failed! Blocking publish:")
        for e in errors:
            print(f"  - {e}")
        sys.exit(1)
    print("\n[OK] All datasets passed schema and shrink guard validation.")


if __name__ == "__main__":
    main()
