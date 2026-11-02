"""
Live Real-Time Verification Endpoint for Wikidata and Single OSM Objects.
"""

import time
import asyncio
import logging
from collections import OrderedDict
from typing import Optional, Dict, Any, Tuple
import httpx
from fastapi import APIRouter, Request, HTTPException, Query
from app.limiter import limiter
from app.routers._common import RE_QID, OSM_TYPES, get_http_client, claim_values, claim_item_ids

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["verify"])

# In-memory LRU TTL cache: key -> (timestamp, data). Most recently used last.
_CACHE: "OrderedDict[str, Tuple[float, Dict[str, Any]]]" = OrderedDict()
_CACHE_TTL = 300  # 5 minutes
_CACHE_MAX = 2048
_LOCKS: "OrderedDict[str, asyncio.Lock]" = OrderedDict()
_LOCKS_MAX = 4096
_DEFAULT_RETRY_AFTER = 30
_MAX_RETRY_AFTER = 300


def cache_get(key: str) -> Optional[Dict[str, Any]]:
    entry = _CACHE.get(key)
    if entry is None:
        return None
    ts, data = entry
    if time.time() - ts >= _CACHE_TTL:
        del _CACHE[key]
        return None
    _CACHE.move_to_end(key)
    return data


def cache_put(key: str, data: Dict[str, Any]) -> None:
    _CACHE[key] = (time.time(), data)
    _CACHE.move_to_end(key)
    while len(_CACHE) > _CACHE_MAX:
        _CACHE.popitem(last=False)


def get_key_lock(key: str) -> asyncio.Lock:
    lock = _LOCKS.get(key)
    if lock is None:
        lock = _LOCKS[key] = asyncio.Lock()
        # Evict the oldest idle locks; never one that is held or awaited.
        if len(_LOCKS) > _LOCKS_MAX:
            for old_key in list(_LOCKS):
                if len(_LOCKS) <= _LOCKS_MAX:
                    break
                if old_key != key and not _LOCKS[old_key].locked():
                    del _LOCKS[old_key]
    else:
        _LOCKS.move_to_end(key)
    return lock


def retry_after_seconds(resp: httpx.Response) -> int:
    """Seconds from an upstream Retry-After header (delta-seconds form), clamped."""
    try:
        secs = int(resp.headers.get("Retry-After", ""))
    except ValueError:
        return _DEFAULT_RETRY_AFTER
    return max(1, min(secs, _MAX_RETRY_AFTER))


def raise_if_rate_limited(resp: httpx.Response, upstream: str) -> None:
    if resp.status_code == 429:
        secs = retry_after_seconds(resp)
        raise HTTPException(
            status_code=503,
            detail=f"{upstream} is rate limiting this service; retry later.",
            headers={"Retry-After": str(secs)},
        )

@router.get("/verify/{qid}")
@limiter.limit("20/minute")
async def verify_qid(
    request: Request,
    qid: str,
    osm_type: Optional[str] = Query(None, description="Optional OSM element type: node, way, relation (or n, w, r)"),
    osm_id: Optional[int] = Query(None, gt=0, description="Optional OSM element numeric ID")
):
    qid = qid.strip().upper()
    if not RE_QID.match(qid):
        raise HTTPException(status_code=400, detail="Invalid QID format. Expected ^Q[1-9][0-9]*$")

    type_norm = None
    if osm_type is not None:
        type_norm = OSM_TYPES.get(osm_type.strip().lower())
        if type_norm is None:
            raise HTTPException(status_code=400, detail="Unsupported osm_type. Expected node, way or relation.")

    cache_key = f"{qid}:{type_norm}:{osm_id}"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached

    lock = get_key_lock(cache_key)
    async with lock:
        # Check cache again inside lock
        cached = cache_get(cache_key)
        if cached is not None:
            return cached

        client = get_http_client(request)

        # 1. Fetch live Wikidata entity
        wd_url = f"https://www.wikidata.org/w/api.php?action=wbgetentities&ids={qid}&props=info|labels|descriptions|claims|sitelinks&languages=ar|en&format=json"
        try:
            wd_resp = await client.get(wd_url)
        except Exception:
            logger.exception("Wikidata request failed for %s", qid)
            raise HTTPException(status_code=502, detail="Failed to reach Wikidata API.")
        raise_if_rate_limited(wd_resp, "Wikidata")
        try:
            wd_data = wd_resp.json()
        except Exception:
            logger.exception("Invalid Wikidata response for %s", qid)
            raise HTTPException(status_code=502, detail="Invalid response from Wikidata API.")

        entities = wd_data.get("entities", {})
        entity = entities.get(qid)
        if not entity or "missing" in entity:
            res = {
                "qid": qid,
                "exists": False,
                "status": "missing",
                "detail": f"Entity {qid} does not exist or has been deleted from Wikidata."
            }
            cache_put(cache_key, res)
            return res

        # Parse claims
        claims = entity.get("claims", {})
        labels = {k: v["value"] for k, v in entity.get("labels", {}).items() if "value" in v}
        descs = {k: v["value"] for k, v in entity.get("descriptions", {}).items() if "value" in v}

        p31_ids = claim_item_ids(claims, "P31")

        lat, lon = None, None
        for c in claims.get("P625", []):
            try:
                v = c["mainsnak"]["datavalue"]["value"]
                lat = round(float(v["latitude"]), 6)
                lon = round(float(v["longitude"]), 6)
                break
            except Exception:
                pass

        wd_summary = {
            "qid": qid,
            "exists": True,
            "lastrevid": entity.get("lastrevid", 0),
            "name_ar": labels.get("ar", ""),
            "name_en": labels.get("en", ""),
            "desc_ar": descs.get("ar", ""),
            "desc_en": descs.get("en", ""),
            "p31": p31_ids,
            "lat": lat,
            "lon": lon,
            "p11693": claim_values(claims, "P11693"), # node
            "p10689": claim_values(claims, "P10689"), # way
            "p402": claim_values(claims, "P402"),     # relation
        }

        # 2. Check live OSM element if provided
        osm_summary = None
        if type_norm and osm_id:
            osm_url = f"https://api.openstreetmap.org/api/0.6/{type_norm}/{osm_id}.json"
            try:
                osm_resp = await client.get(osm_url)
            except Exception:
                logger.exception("OSM request failed for %s/%s", type_norm, osm_id)
                osm_resp = None
                osm_summary = {"type": type_norm, "id": osm_id, "error": "Could not reach OpenStreetMap API."}
            if osm_resp is not None:
                raise_if_rate_limited(osm_resp, "OpenStreetMap")
                if osm_resp.status_code == 200:
                    try:
                        elements = osm_resp.json().get("elements", [])
                    except Exception:
                        logger.exception("Invalid OSM response for %s/%s", type_norm, osm_id)
                        elements = []
                        osm_summary = {"type": type_norm, "id": osm_id, "error": "Invalid response from OpenStreetMap API."}
                    if elements:
                        el = elements[0]
                        tags = el.get("tags", {})
                        osm_summary = {
                            "type": type_norm,
                            "id": osm_id,
                            "exists": True,
                            "version": el.get("version"),
                            "tags": tags,
                            "current_wikidata": tags.get("wikidata", ""),
                            "matches_requested_qid": (tags.get("wikidata", "").strip() == qid)
                        }
                elif osm_resp.status_code in (404, 410):
                    osm_summary = {
                        "type": type_norm,
                        "id": osm_id,
                        "exists": False,
                        "status": "deleted"
                    }

        result = {
            "qid": qid,
            "verified_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "wikidata": wd_summary,
            "osm": osm_summary
        }

        # Don't pin a transient OSM failure in the cache for the full TTL.
        if not (osm_summary and "error" in osm_summary):
            cache_put(cache_key, result)
        return result
