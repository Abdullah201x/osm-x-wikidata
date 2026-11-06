"""
Honest, held-out evaluation of the ML candidate matcher.

GroupKFold by QID: every pair of one Wikidata item (its positive and its
negatives) stays in the same fold, so a model is never scored on an item it was
trained on. Two numbers matter in production:

- pair metrics at the production threshold (0.60): ROC-AUC, precision, recall, F1;
- the candidate picker: for each held-out item the model scores its full
  production pool (the true element + every untagged POI within 400 m that
  passes the similarity pre-filter) and suggests the top one if it reaches
  0.60. precision_at_top1 = correct suggestions / suggestions;
  recall_at_top1 = correct suggestions / all ground-truth items (including the
  ones the pre-filter makes unreachable).

The same folds are also scored with the pre-2026-11 sampler (legacy) for
comparison. Writes data/matcher_metrics.json; pipeline/validate_data.py blocks a
publish when precision at 0.60 is below MIN_PRECISION or drops more than
MAX_PRECISION_DROP against the committed metrics.

    python pipeline/evaluate_matcher.py
"""

import json
import os
import sys
import time
from typing import Any, Callable, Dict, List, Optional

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import numpy as np  # noqa: E402

from pipeline.config import DATA_DIR  # noqa: E402
from pipeline.ml_matcher import (  # noqa: E402
    MIN_SIM,
    NEG_PER_POS,
    PROD_THRESHOLD,
    build_legacy_pairs,
    build_training_pairs,
    fit_matcher,
    load_training_data,
)

METRICS_FILE = os.path.join(DATA_DIR, "matcher_metrics.json")
N_SPLITS = 5
MIN_PRECISION = 0.90
MAX_PRECISION_DROP = 0.03


def _round(x: Optional[float]) -> Optional[float]:
    return None if x is None else round(float(x), 4)


def _pair_metrics(y: np.ndarray, probs: np.ndarray, threshold: float) -> Dict[str, Any]:
    from sklearn.metrics import roc_auc_score

    pred = probs >= threshold
    tp = int(np.sum(pred & (y == 1)))
    fp = int(np.sum(pred & (y == 0)))
    fn = int(np.sum(~pred & (y == 1)))
    precision = tp / (tp + fp) if (tp + fp) else None
    recall = tp / (tp + fn) if (tp + fn) else None
    f1 = (2 * precision * recall / (precision + recall)) if precision and recall else None
    auc = roc_auc_score(y, probs) if len(set(y.tolist())) > 1 else None
    return {
        "roc_auc": _round(auc),
        "precision": _round(precision),
        "recall": _round(recall),
        "f1": _round(f1),
        "tp": tp,
        "fp": fp,
        "fn": fn,
    }


def cross_validate(
    data: Dict[str, Any],
    n_splits: int = N_SPLITS,
    threshold: float = PROD_THRESHOLD,
    train_sets: Optional[Dict[str, Any]] = None,
    fit: Callable = fit_matcher,
) -> Dict[str, Any]:
    """
    GroupKFold cross-validation on `data` (from build_training_pairs).

    `train_sets` optionally supplies a different training set ({X, y, groups},
    e.g. the legacy sampler); each fold then trains on its rows whose QID is in
    the training groups, and is still scored on `data`'s held-out rows and pools.
    """
    from sklearn.model_selection import GroupKFold

    X, y, groups = data["X"], data["y"], data["groups"]
    train_src = train_sets or data
    pools_by_qid: Dict[str, List] = {}
    for qid, X_pool, true_idx in data["pools"]:
        pools_by_qid.setdefault(qid, []).append((X_pool, true_idx))

    probs = np.zeros(len(y), dtype=float)
    suggested = correct = 0
    folds = GroupKFold(n_splits=n_splits)
    for train_idx, test_idx in folds.split(X, y, groups):
        test_qids = set(groups[test_idx].tolist())
        train_mask = ~np.isin(train_src["groups"], list(test_qids))
        clf = fit(train_src["X"][train_mask], train_src["y"][train_mask])
        probs[test_idx] = clf.predict_proba(X[test_idx])[:, 1]

        for qid in test_qids:
            for X_pool, true_idx in pools_by_qid.get(qid, ()):
                p = clf.predict_proba(X_pool)[:, 1]
                best = int(np.argmax(p))
                if p[best] >= threshold:
                    suggested += 1
                    correct += int(best == true_idx)

    total_items = len(data["pools"]) + data.get("n_unreachable", 0)
    metrics = _pair_metrics(y, probs, threshold)
    metrics.update({
        "precision_at_top1": _round(correct / suggested) if suggested else None,
        "recall_at_top1": _round(correct / total_items) if total_items else None,
        "picker_suggestions": suggested,
        "picker_correct": correct,
    })
    return metrics


def evaluate(compare_legacy: bool = True) -> Dict[str, Any]:
    wd_map, linked_rows, candidates = load_training_data()
    data = build_training_pairs(wd_map, linked_rows, candidates)
    y = data["y"]
    result: Dict[str, Any] = {
        "version": 1,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "method": f"GroupKFold(n_splits={N_SPLITS}) by QID; threshold {PROD_THRESHOLD}; "
                  f"{NEG_PER_POS} negatives per positive from 0-400 m, similarity pre-filter {MIN_SIM}",
        "threshold": PROD_THRESHOLD,
        "data": {
            "ground_truth_items": int(data["n_positive_raw"]),
            "unreachable_items": int(data["n_unreachable"]),
            "pairs": int(len(y)),
            "positives": int(y.sum()),
            "negatives": int((y == 0).sum()),
        },
        "model": cross_validate(data),
    }
    if compare_legacy:
        legacy = build_legacy_pairs(wd_map, linked_rows, candidates)
        result["legacy_sampler"] = cross_validate(data, train_sets=legacy)
    return result


def write_metrics(metrics: Dict[str, Any], path: str = METRICS_FILE) -> str:
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2)
        f.write("\n")
    os.replace(tmp, path)
    return path


def check_metrics(current: Dict[str, Any], previous: Optional[Dict[str, Any]] = None) -> List[str]:
    """Publish gate used by validate_data.py."""
    errors = []
    precision = (current.get("model") or {}).get("precision")
    if precision is None:
        return ["matcher_metrics.json has no model.precision"]
    if precision < MIN_PRECISION:
        errors.append(f"matcher precision at {current.get('threshold', PROD_THRESHOLD)} is {precision:.3f} (< {MIN_PRECISION})")
    prev = ((previous or {}).get("model") or {}).get("precision")
    if prev is not None and precision < prev - MAX_PRECISION_DROP:
        errors.append(f"matcher precision dropped from {prev:.3f} to {precision:.3f} (> {MAX_PRECISION_DROP:.2f})")
    return errors


def main():
    print("[Matcher eval] Building pairs from the local caches and cross-validating (this takes a few minutes)...")
    metrics = evaluate()
    path = write_metrics(metrics)
    m = metrics["model"]
    print(f"[Matcher eval] {metrics['data']}")
    for name in ("model", "legacy_sampler"):
        if name in metrics:
            m = metrics[name]
            print(
                f"  {name:15s} ROC-AUC {m['roc_auc']}  P@{PROD_THRESHOLD} {m['precision']}  R {m['recall']}  F1 {m['f1']}  "
                f"picker P@top1 {m['precision_at_top1']}  R@top1 {m['recall_at_top1']}"
            )
    print(f"[Matcher eval] Wrote {path}")
    errors = check_metrics(metrics)
    if errors:
        print("[Matcher eval] FAIL: " + "; ".join(errors))
        sys.exit(1)


if __name__ == "__main__":
    main()
