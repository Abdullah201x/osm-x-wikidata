"""
Dataset JSON writing for git-friendly daily refreshes.

Every published dataset is an envelope with an "items" list. Writing one item
per line (still plain, valid JSON; consumers such as Manara parse it unchanged)
means a daily refresh shows up in git as a few changed lines instead of one
rewritten multi-megabyte line, so the repository grows by the real delta.
"""

import json
import os
from typing import Any, Dict, IO

_COMPACT = {"ensure_ascii": False, "separators": (",", ":")}


def dump_items_per_line(obj: Dict[str, Any], f: IO[str], key: str = "items") -> None:
    """Writes `obj` as compact JSON with each element of obj[key] on its own line."""
    head = [(k, v) for k, v in obj.items() if k != key]
    f.write("{")
    for k, v in head:
        f.write(f"{json.dumps(k)}:{json.dumps(v, **_COMPACT)},")
    f.write(f"{json.dumps(key)}:[\n")
    f.write(",\n".join(json.dumps(item, **_COMPACT) for item in obj.get(key) or []))
    f.write("\n]}\n")


def write_dataset(path: str, obj: Dict[str, Any], key: str = "items") -> str:
    """Atomic (tmp + os.replace) write of a dataset envelope, one item per line."""
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="\n") as f:
        dump_items_per_line(obj, f, key)
    os.replace(tmp, path)
    return path
