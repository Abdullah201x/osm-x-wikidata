"""
Keeps no-op dataset rewrites out of git before the data workflow commits.

A daily refresh rewrites every data/*.json. When a dataset's content is the same
as the committed version apart from its timestamp (`generated_at` / `updated_at`),
the working-tree file is restored to HEAD so it is not committed. summary.json
(the freshness timestamp the API reports), progress.json and
matcher_metrics.json are always kept, so freshness still advances every run.

    python pipeline/publish_filter.py        # run from the repo root before `git add data/*.json`
"""

import glob
import json
import os
import subprocess
import sys
from typing import Any, List, Optional, Tuple

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from pipeline.config import BASE_DIR  # noqa: E402

VOLATILE_KEYS = ("generated_at", "updated_at")
ALWAYS_PUBLISH = {"summary.json", "progress.json", "matcher_metrics.json"}


def strip_volatile(obj: Any) -> Any:
    if isinstance(obj, dict):
        return {k: v for k, v in obj.items() if k not in VOLATILE_KEYS}
    return obj


def same_content(new: Any, old: Any) -> bool:
    return strip_volatile(new) == strip_volatile(old)


def _git_show(rel_path: str) -> Optional[str]:
    out = subprocess.run(
        ["git", "show", f"HEAD:{rel_path}"], cwd=BASE_DIR, capture_output=True, text=True, encoding="utf-8"
    )
    return out.stdout if out.returncode == 0 else None


def filter_unchanged(data_dir: str = os.path.join(BASE_DIR, "data")) -> Tuple[List[str], List[str]]:
    """Restores timestamp-only changes. Returns (restored, changed) relative paths."""
    restored, changed = [], []
    for path in sorted(glob.glob(os.path.join(data_dir, "*.json"))):
        name = os.path.basename(path)
        rel = os.path.relpath(path, BASE_DIR).replace("\\", "/")
        if name in ALWAYS_PUBLISH:
            continue
        old_text = _git_show(rel)
        if old_text is None:
            changed.append(rel)  # new file
            continue
        with open(path, "r", encoding="utf-8") as f:
            new_text = f.read()
        if new_text == old_text:
            continue
        try:
            same = same_content(json.loads(new_text), json.loads(old_text))
        except ValueError:
            same = False
        if same:
            subprocess.run(["git", "checkout", "--", rel], cwd=BASE_DIR, check=True)
            restored.append(rel)
        else:
            changed.append(rel)
    return restored, changed


def main():
    restored, changed = filter_unchanged()
    for rel in restored:
        print(f"[Publish filter] {rel}: only the timestamp changed; keeping the committed version")
    for rel in changed:
        print(f"[Publish filter] {rel}: content changed")
    if not changed:
        print("[Publish filter] No dataset content changed; only summary/progress will be committed.")


if __name__ == "__main__":
    main()
