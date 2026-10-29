"""
Reverse QA Search and Filter Endpoint.
"""

from typing import Optional, List
from fastapi import APIRouter, Request, Query, HTTPException

router = APIRouter(prefix="/api/v1", tags=["reverse"])

@router.get("/reverse")
def get_reverse_items(
    request: Request,
    cc: str = Query("sa", description="GCC Country Code (sa, ae, kw, qa, bh, om)"),
    kind: Optional[str] = Query(None, description="Comma-separated kinds: missing_backlink, broken_osm_tag, conflict, review_gap"),
    subkind: Optional[str] = Query(None, description="Specific subkind filter"),
    min_confidence: Optional[float] = Query(None, ge=0.0, le=1.0, description="Minimum confidence threshold (0.0 to 1.0)"),
    q: Optional[str] = Query(None, description="Search query matching QID, OSM ID, or Arabic/English name"),
    bbox: Optional[str] = Query(None, description="Bounding box as minLon,minLat,maxLon,maxLat"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(50, ge=1, le=200, description="Page size (max 200)")
):
    store = getattr(request.app.state, "store", None)
    if not store:
        raise HTTPException(status_code=500, detail="Dataset store not initialized.")

    kinds_list = [k.strip() for k in kind.split(",") if k.strip()] if kind else None

    bbox_list = None
    if bbox:
        try:
            parts = [float(x.strip()) for x in bbox.split(",")]
            if len(parts) == 4:
                bbox_list = parts
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid bbox format. Expected minLon,minLat,maxLon,maxLat as floats.")

    return store.query_reverse(
        country_code=cc,
        kinds=kinds_list,
        subkind=subkind,
        min_confidence=min_confidence,
        search_query=q,
        bbox=bbox_list,
        page=page,
        page_size=page_size
    )
