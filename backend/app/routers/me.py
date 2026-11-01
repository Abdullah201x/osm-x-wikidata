"""
Identity + import-permission endpoint.

Wikidata -> OSM feature imports are only allowed for OSM users the maintainer has approved.
The browser sends its OSM OAuth access token; we ask OSM who it belongs to (one call to
/api/0.6/user/details.json) and compare the numeric uid with OSMWD_IMPORT_ALLOWLIST.
The token is used only for that single request: it is never stored or logged, and the
cache is keyed by its SHA-256 digest.
"""

import hashlib
import time
from collections import OrderedDict
from typing import Dict, Optional, Tuple

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

from app.config import USER_AGENT, get_import_allowlist
from app.limiter import limiter
from app.routers.verify import raise_if_rate_limited

router = APIRouter(prefix="/api/v1", tags=["me"])

OSM_USER_DETAILS_URL = "https://api.openstreetmap.org/api/0.6/user/details.json"

# sha256(token) -> (timestamp, {"uid": int, "display_name": str}). Most recently used last.
_IDENTITY_CACHE: "OrderedDict[str, Tuple[float, Dict]]" = OrderedDict()
_CACHE_TTL = 900  # 15 minutes
_CACHE_MAX = 512


def _cache_get(key: str) -> Optional[Dict]:
    entry = _IDENTITY_CACHE.get(key)
    if entry is None:
        return None
    ts, ident = entry
    if time.time() - ts >= _CACHE_TTL:
        del _IDENTITY_CACHE[key]
        return None
    _IDENTITY_CACHE.move_to_end(key)
    return ident


def _cache_put(key: str, ident: Dict) -> None:
    _IDENTITY_CACHE[key] = (time.time(), ident)
    _IDENTITY_CACHE.move_to_end(key)
    while len(_IDENTITY_CACHE) > _CACHE_MAX:
        _IDENTITY_CACHE.popitem(last=False)


def _bearer_token(request: Request) -> str:
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    token = token.strip()
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="Missing OSM bearer token.")
    return token


@router.get("/me")
@limiter.limit("10/minute")
async def me(request: Request):
    token = _bearer_token(request)
    key = hashlib.sha256(token.encode("utf-8")).hexdigest()

    ident = _cache_get(key)
    if ident is None:
        client: httpx.AsyncClient = getattr(request.app.state, "http_client", None)
        if not client:
            client = httpx.AsyncClient(timeout=5.0, headers={"User-Agent": USER_AGENT})
        try:
            resp = await client.get(
                OSM_USER_DETAILS_URL,
                headers={"Authorization": f"Bearer {token}"},
                timeout=5.0,
            )
        except Exception:
            # Never echo exception text: it could contain the request headers.
            raise HTTPException(status_code=503, detail="Could not reach OpenStreetMap.", headers={"Retry-After": "30"})

        raise_if_rate_limited(resp, "OpenStreetMap")
        if resp.status_code in (401, 403):
            raise HTTPException(status_code=401, detail="OSM token was rejected.")
        if resp.status_code != 200:
            raise HTTPException(status_code=503, detail="OpenStreetMap is unavailable.", headers={"Retry-After": "30"})

        try:
            user = resp.json()["user"]
            ident = {"uid": int(user["id"]), "display_name": str(user.get("display_name", ""))}
        except Exception:
            raise HTTPException(status_code=502, detail="Unexpected response from OpenStreetMap.")
        _cache_put(key, ident)

    # The allowlist is evaluated per request (not cached) so a redeploy takes effect immediately.
    return JSONResponse(
        content={**ident, "can_import": ident["uid"] in get_import_allowlist()},
        headers={"Cache-Control": "no-store"},
    )
