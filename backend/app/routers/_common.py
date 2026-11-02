"""
Helpers shared by the live-lookup routers (verify, preview).
"""

import re
from typing import Any, List

import httpx
from fastapi import HTTPException, Request

RE_QID = re.compile(r"^Q[1-9][0-9]*$")

# Accepted spellings of an OSM element type -> canonical API name.
OSM_TYPES = {
    "node": "node", "n": "node",
    "way": "way", "w": "way",
    "relation": "relation", "r": "relation",
}


def normalize_osm_type(value: str) -> str:
    """Canonical OSM type for any accepted spelling, or 400 for anything else."""
    norm = OSM_TYPES.get(value.strip().lower())
    if norm is None:
        raise HTTPException(status_code=400, detail="Unsupported osm_type. Expected node, way or relation.")
    return norm


def get_http_client(request: Request) -> httpx.AsyncClient:
    """The shared upstream client created in the app lifespan."""
    client = getattr(request.app.state, "http_client", None)
    if client is None:
        raise HTTPException(status_code=503, detail="Upstream HTTP client not initialized.")
    return client


def claim_values(claims: dict, prop: str) -> List[str]:
    """String values of every claim on `prop` that carries one."""
    vals = []
    for c in claims.get(prop, []):
        try:
            vals.append(str(c["mainsnak"]["datavalue"]["value"]).strip())
        except Exception:
            pass
    return vals


def claim_item_ids(claims: dict, prop: str) -> List[Any]:
    """Item ids (Qxx) of every claim on `prop` whose value is an entity."""
    ids = []
    for c in claims.get(prop, []):
        try:
            ids.append(c["mainsnak"]["datavalue"]["value"]["id"])
        except Exception:
            pass
    return ids
