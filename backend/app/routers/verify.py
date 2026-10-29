"""
Live Real-Time Verification Endpoint for Wikidata and Single OSM Objects.
"""

import re
import time
import asyncio
from typing import Optional, Dict, Any, Tuple
import httpx
from fastapi import APIRouter, Request, HTTPException, Query
from app.config import USER_AGENT

router = APIRouter(prefix="/api/v1", tags=["verify"])

RE_QID = re.compile(r"^Q[1-9][0-9]*$")

# In-memory LRU TTL Cache: (key) -> (timestamp, data)
_CACHE: Dict[str, Tuple[float, Dict[str, Any]]] = {}
_CACHE_TTL = 300  # 5 minutes
_LOCKS: Dict[str, asyncio.Lock] = {}

def get_key_lock(key: str) -> asyncio.Lock:
    if key not in _LOCKS:
        _LOCKS[key] = asyncio.Lock()
    return _LOCKS[key]

@router.get("/verify/{qid}")
async def verify_qid(
    request: Request,
    qid: str,
    osm_type: Optional[str] = Query(None, description="Optional OSM element type: node, way, relation (or n, w, r)"),
    osm_id: Optional[int] = Query(None, description="Optional OSM element numeric ID")
):
    qid = qid.strip().upper()
    if not RE_QID.match(qid):
        raise HTTPException(status_code=400, detail="Invalid QID format. Expected ^Q[1-9][0-9]*$")

    cache_key = f"{qid}:{osm_type}:{osm_id}"
    now = time.time()
    if cache_key in _CACHE:
        ts, cached_data = _CACHE[cache_key]
        if now - ts < _CACHE_TTL:
            return cached_data

    lock = get_key_lock(cache_key)
    async with lock:
        # Check cache again inside lock
        if cache_key in _CACHE:
            ts, cached_data = _CACHE[cache_key]
            if now - ts < _CACHE_TTL:
                return cached_data

        client: httpx.AsyncClient = getattr(request.app.state, "http_client", None)
        if not client:
            client = httpx.AsyncClient(timeout=8.0, headers={"User-Agent": USER_AGENT})

        # 1. Fetch live Wikidata entity
        wd_url = f"https://www.wikidata.org/w/api.php?action=wbgetentities&ids={qid}&props=info|labels|descriptions|claims|sitelinks&languages=ar|en&format=json"
        try:
            wd_resp = await client.get(wd_url)
            wd_data = wd_resp.json()
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Failed to reach Wikidata API: {str(e)}")

        entities = wd_data.get("entities", {})
        entity = entities.get(qid)
        if not entity or "missing" in entity:
            res = {
                "qid": qid,
                "exists": False,
                "status": "missing",
                "detail": f"Entity {qid} does not exist or has been deleted from Wikidata."
            }
            _CACHE[cache_key] = (now, res)
            return res

        # Parse claims
        claims = entity.get("claims", {})
        labels = {k: v["value"] for k, v in entity.get("labels", {}).items() if "value" in v}
        descs = {k: v["value"] for k, v in entity.get("descriptions", {}).items() if "value" in v}

        def get_prop_values(p: str):
            vals = []
            for c in claims.get(p, []):
                try:
                    vals.append(str(c["mainsnak"]["datavalue"]["value"]).strip())
                except Exception:
                    pass
            return vals

        p31_ids = []
        for c in claims.get("P31", []):
            try:
                p31_ids.append(c["mainsnak"]["datavalue"]["value"]["id"])
            except Exception:
                pass

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
            "p11693": get_prop_values("P11693"), # node
            "p10689": get_prop_values("P10689"), # way
            "p402": get_prop_values("P402"),     # relation
        }

        # 2. Check live OSM element if provided
        osm_summary = None
        if osm_type and osm_id:
            type_norm = {"n": "node", "w": "way", "r": "relation"}.get(osm_type.lower(), osm_type.lower())
            if type_norm in ("node", "way", "relation"):
                osm_url = f"https://api.openstreetmap.org/api/0.6/{type_norm}/{osm_id}.json"
                try:
                    osm_resp = await client.get(osm_url)
                    if osm_resp.status_code == 200:
                        osm_json = osm_resp.json()
                        elements = osm_json.get("elements", [])
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
                except Exception as e:
                    osm_summary = {
                        "type": type_norm,
                        "id": osm_id,
                        "error": str(e)
                    }

        result = {
            "qid": qid,
            "verified_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "wikidata": wd_summary,
            "osm": osm_summary
        }

        # Enforce max 2048 entries in memory cache
        if len(_CACHE) > 2048:
            _CACHE.clear()
        _CACHE[cache_key] = (now, result)
        return result
