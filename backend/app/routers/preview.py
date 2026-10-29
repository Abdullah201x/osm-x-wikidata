"""
Safe Pre-Flight Edit Validation Endpoint (Zero Writes, Zero Tokens).
Validates potential statement additions before client-side submission to Wikidata.
"""

import re
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
import httpx
from fastapi import APIRouter, Request, HTTPException

from app.config import USER_AGENT

router = APIRouter(prefix="/api/v1", tags=["preview"])

RE_QID = re.compile(r"^Q[1-9][0-9]*$")

PROP_MAP = {
    "node": "P11693",
    "n": "P11693",
    "way": "P10689",
    "w": "P10689",
    "relation": "P402",
    "r": "P402"
}

DISALLOWED_P31 = {
    "Q5",         # Human
    "Q4167410",   # Disambiguation page
    "Q13406463",  # Wikimedia list article
    "Q431289",    # Brand
    "Q4830453",   # Enterprise
    "Q16521",     # Taxon
}

class EditPreviewRequest(BaseModel):
    qid: str = Field(..., description="Wikidata Item QID e.g. Q851")
    property: str = Field(..., description="Target property: P11693 (node), P10689 (way), or P402 (relation)")
    osm_type: str = Field(..., description="OSM element type: node, way, or relation")
    osm_id: int = Field(..., gt=0, description="OSM element numeric ID")

@router.post("/edits/preview")
async def preview_edit(request: Request, payload: EditPreviewRequest):
    qid = payload.qid.strip().upper()
    if not RE_QID.match(qid):
        raise HTTPException(status_code=400, detail="Invalid QID format.")

    norm_type = payload.osm_type.lower()
    expected_prop = PROP_MAP.get(norm_type)
    if not expected_prop:
        raise HTTPException(status_code=400, detail=f"Unsupported osm_type: {payload.osm_type}")

    if payload.property != expected_prop:
        raise HTTPException(
            status_code=400,
            detail=f"Property mismatch: osm_type '{norm_type}' requires property '{expected_prop}', but received '{payload.property}'."
        )

    warnings: List[str] = []
    client: httpx.AsyncClient = getattr(request.app.state, "http_client", None)
    if not client:
        client = httpx.AsyncClient(timeout=8.0, headers={"User-Agent": USER_AGENT})

    # 1. Fetch live Wikidata entity
    wd_url = f"https://www.wikidata.org/w/api.php?action=wbgetentities&ids={qid}&props=info|claims&format=json"
    try:
        wd_resp = await client.get(wd_url)
        wd_data = wd_resp.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch Wikidata entity: {e}")

    entities = wd_data.get("entities", {})
    entity = entities.get(qid)
    if not entity or "missing" in entity:
        return {
            "valid": False,
            "status": "missing_entity",
            "warnings": [f"Wikidata entity {qid} does not exist."]
        }

    if "redirects" in wd_data:
        warnings.append(f"Entity {qid} is a redirect.")

    claims = entity.get("claims", {})
    baserevid = entity.get("lastrevid", 0)

    # Check disallowed P31
    p31_ids = []
    for c in claims.get("P31", []):
        try:
            p31_ids.append(c["mainsnak"]["datavalue"]["value"]["id"])
        except Exception:
            pass

    for bad_class in DISALLOWED_P31:
        if bad_class in p31_ids:
            return {
                "valid": False,
                "status": "ineligible_class",
                "warnings": [f"Entity {qid} has class {bad_class} which is not eligible for direct OSM element back-linking."]
            }

    # Check existing statements for target property
    existing_claims = claims.get(payload.property, [])
    existing_vals = []
    for c in existing_claims:
        try:
            existing_vals.append(str(c["mainsnak"]["datavalue"]["value"]).strip())
        except Exception:
            pass

    str_oid = str(payload.osm_id)
    if str_oid in existing_vals:
        return {
            "valid": True,
            "status": "already_linked",
            "baserevid": baserevid,
            "property": payload.property,
            "osm_id": payload.osm_id,
            "warnings": [f"Statement {payload.property}={str_oid} already exists on {qid}."]
        }
    elif existing_vals:
        warnings.append(f"Wikidata already has a different {payload.property} statement: {', '.join(existing_vals)}.")

    # 2. Check live OSM element
    api_type = {"node": "node", "n": "node", "way": "way", "w": "way", "relation": "relation", "r": "relation"}[norm_type]
    osm_url = f"https://api.openstreetmap.org/api/0.6/{api_type}/{payload.osm_id}.json"
    try:
        osm_resp = await client.get(osm_url)
        if osm_resp.status_code == 200:
            osm_elements = osm_resp.json().get("elements", [])
            if osm_elements:
                tags = osm_elements[0].get("tags", {})
                current_wd = tags.get("wikidata", "").strip()
                if current_wd != qid:
                    warnings.append(f"OSM element {api_type}/{payload.osm_id} currently carries 'wikidata={current_wd}' (not '{qid}').")
            else:
                warnings.append(f"OSM element {api_type}/{payload.osm_id} returned empty element list.")
        elif osm_resp.status_code in (404, 410):
            return {
                "valid": False,
                "status": "deleted_in_osm",
                "warnings": [f"OSM element {api_type}/{payload.osm_id} has been deleted from OpenStreetMap."]
            }
    except Exception as e:
        warnings.append(f"Could not reach OpenStreetMap API: {str(e)}")

    statement_json = {
        "mainsnak": {
            "snaktype": "value",
            "property": payload.property,
            "datavalue": {
                "type": "string",
                "value": str(payload.osm_id)
            }
        },
        "type": "statement",
        "rank": "normal"
    }

    return {
        "valid": True,
        "status": "conflict" if existing_vals else "ready",
        "baserevid": baserevid,
        "property": payload.property,
        "osm_id": payload.osm_id,
        "statement_json": statement_json,
        "warnings": warnings
    }

