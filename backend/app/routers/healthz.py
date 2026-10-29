"""
Health Check and Freshness Monitoring Endpoints for UptimeRobot.
Both declare methods=["GET", "HEAD"].
"""

import os
from datetime import datetime, timezone
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.config import MAX_DATASET_AGE_HOURS

router = APIRouter(tags=["health"])

@router.api_route("/api/healthz", methods=["GET", "HEAD"])
def healthz():
    return {"status": "ok"}

@router.api_route("/api/healthz/freshness", methods=["GET", "HEAD"])
def freshness(request: Request):
    """
    Returns 200 when dataset is fresh, 503 when older than MAX_DATASET_AGE_HOURS (default 216h / 9d),
    alerting external monitors if the weekly GitHub Action pipeline fails silently.
    """
    store = getattr(request.app.state, "store", None)
    if not store or not store.summary:
        return JSONResponse(status_code=503, content={"status": "stale", "detail": "Dataset store not loaded."})

    updated_at_str = store.summary.get("updated_at")
    if not updated_at_str:
        return JSONResponse(status_code=503, content={"status": "stale", "detail": "No updated_at timestamp in summary."})

    try:
        # Try parsing ISO or standard date formats: "2026-10-29 20:51:55" or "2026-10-29T20:51:55Z"
        if "T" in updated_at_str:
            clean_str = updated_at_str.replace("Z", "+00:00")
            dt = datetime.fromisoformat(clean_str)
        else:
            dt = datetime.strptime(updated_at_str, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)

        now = datetime.now(timezone.utc)
        age_hours = (now - dt).total_seconds() / 3600.0
        fresh = age_hours <= MAX_DATASET_AGE_HOURS

        return JSONResponse(
            status_code=200 if fresh else 503,
            content={
                "status": "ok" if fresh else "stale",
                "updated_at": updated_at_str,
                "age_hours": round(age_hours, 1),
                "max_allowed_age_hours": MAX_DATASET_AGE_HOURS
            }
        )
    except Exception as e:
        return JSONResponse(status_code=503, content={"status": "error", "detail": f"Could not parse timestamp: {e}"})
