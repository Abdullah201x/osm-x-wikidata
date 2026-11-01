"""
Unit & Integration Tests for osmwd-api FastAPI Backend.
"""

import sys
import os
import pytest
from fastapi.testclient import TestClient

# Add backend directory to sys.path
backend_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend")
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.main import app, get_real_client_ip
from app.store import DatasetStore

@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client

def test_healthz_get_and_head(client):
    r_get = client.get("/api/healthz")
    assert r_get.status_code == 200
    assert r_get.json() == {"status": "ok"}

    r_head = client.head("/api/healthz")
    assert r_head.status_code == 200

def test_healthz_freshness(client):
    r = client.get("/api/healthz/freshness")
    assert r.status_code in (200, 503)
    data = r.json()
    assert "status" in data
    assert "age_hours" in data or "detail" in data

def test_reverse_endpoint_query(client):
    r = client.get("/api/v1/reverse?cc=bh&page=1&page_size=10")
    assert r.status_code == 200
    data = r.json()
    assert data["country"] == "BH"
    assert "counts_by_kind" in data
    assert "total" in data
    assert "items" in data
    assert len(data["items"]) <= 10

def test_reverse_endpoint_filters(client):
    # Filter by kind=missing_backlink
    r = client.get("/api/v1/reverse?cc=bh&kind=missing_backlink&min_confidence=0.70")
    assert r.status_code == 200
    data = r.json()
    for item in data["items"]:
        assert item["kind"] == "missing_backlink"
        assert item["confidence"] >= 0.70

def test_verify_endpoint_validation(client):
    # Invalid QID
    r_bad = client.get("/api/v1/verify/invalid_qid")
    assert r_bad.status_code == 400

    # Valid QID syntax (Q851)
    r_good = client.get("/api/v1/verify/Q851")
    assert r_good.status_code in (200, 502) # 200 if reachable, 502 if live network fails
    if r_good.status_code == 200:
        data = r_good.json()
        assert data["qid"] == "Q851"
        assert "wikidata" in data

def test_preview_endpoint_validation(client):
    # Property mismatch: node with P10689 (which is for ways)
    payload_mismatch = {
        "qid": "Q851",
        "property": "P10689",
        "osm_type": "node",
        "osm_id": 12345
    }
    r = client.post("/api/v1/edits/preview", json=payload_mismatch)
    assert r.status_code == 400
    assert "mismatch" in r.json()["detail"].lower()

def test_get_real_client_ip_header_extraction():
    class DummyClient:
        host = "10.0.0.1"

    class DummyRequest:
        def __init__(self, headers):
            self.headers = headers
            self.client = DummyClient()

    # Case 1: X-Real-IP present
    req1 = DummyRequest({"X-Real-IP": "178.132.22.5"})
    assert get_real_client_ip(req1) == "178.132.22.5"

    # Case 2: Comma-separated X-Real-IP
    req2 = DummyRequest({"X-Real-IP": "178.132.22.5, 10.0.0.2"})
    assert get_real_client_ip(req2) == "178.132.22.5"

    # Case 3: Fallback to X-Forwarded-For
    req3 = DummyRequest({"X-Forwarded-For": "203.0.113.195, 10.0.0.2"})
    assert get_real_client_ip(req3) == "203.0.113.195"

    # Case 4: Fallback to client.host
    req4 = DummyRequest({})
    assert get_real_client_ip(req4) == "10.0.0.1"


def test_verify_rate_limit_returns_429(client):
    # Invalid QIDs return 400 before any upstream call, so this stays offline
    # while still counting against the 20/minute per-route limit.
    headers = {"X-Real-IP": "198.51.100.77"}
    statuses = [client.get("/api/v1/verify/bad", headers=headers).status_code for _ in range(21)]
    assert statuses[:20] == [400] * 20
    assert statuses[20] == 429

    # A different client IP is unaffected.
    other = client.get("/api/v1/verify/bad", headers={"X-Real-IP": "198.51.100.78"})
    assert other.status_code == 400

def test_preview_rate_limit_returns_429(client):
    headers = {"X-Real-IP": "198.51.100.79"}
    bad = {"qid": "Q851", "property": "P10689", "osm_type": "node", "osm_id": 1}
    statuses = [client.post("/api/v1/edits/preview", json=bad, headers=headers).status_code for _ in range(31)]
    assert statuses[:30] == [400] * 30
    assert statuses[30] == 429

def test_preview_body_cap_returns_413(client):
    headers = {"X-Real-IP": "198.51.100.80"}
    big = {"qid": "Q851", "property": "P11693", "osm_type": "node", "osm_id": 1, "pad": "x" * 20000}
    r = client.post("/api/v1/edits/preview", json=big, headers=headers)
    assert r.status_code == 413

def test_preview_body_cap_streamed_without_content_length(client):
    headers = {"X-Real-IP": "198.51.100.81", "Content-Type": "application/json"}
    def chunks():
        yield b'{"qid": "Q851", "pad": "'
        yield b"x" * 20000
        yield b'"}'
    r = client.post("/api/v1/edits/preview", content=chunks(), headers=headers)
    assert r.status_code == 413

def test_reverse_rejects_unknown_country_code(client):
    for bad in ("xx", "../sa", "SA ", ""):
        r = client.get("/api/v1/reverse", params={"cc": bad})
        assert r.status_code == 422, bad
