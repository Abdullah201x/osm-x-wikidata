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

import httpx
from app.main import app, get_real_client_ip
from app.routers import verify as verify_mod

def _install_mock_upstream(client, handler):
    client.app.state.http_client = httpx.AsyncClient(transport=httpx.MockTransport(handler))

def _wd_entity(qid="Q851"):
    return {"entities": {qid: {"lastrevid": 99, "labels": {"en": {"value": "Saudi Arabia"}},
                               "descriptions": {}, "claims": {}}}}

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

    # Valid QID syntax (Q851) - mocked so it never hits the real network
    _install_mock_upstream(client, lambda req: httpx.Response(200, json=_wd_entity("Q851")))
    r_good = client.get("/api/v1/verify/Q851", headers={"X-Real-IP": "198.51.100.201"})
    assert r_good.status_code == 200
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


# --- verify.py: cache, locks, upstream rate limiting (all offline) ---

@pytest.fixture(autouse=True)
def _clean_verify_state():
    verify_mod._CACHE.clear()
    verify_mod._LOCKS.clear()
    yield
    verify_mod._CACHE.clear()
    verify_mod._LOCKS.clear()


def test_verify_success_is_cached(client):
    calls = []

    def handler(request):
        calls.append(str(request.url))
        return httpx.Response(200, json=_wd_entity())

    _install_mock_upstream(client, handler)
    h = {"X-Real-IP": "198.51.100.90"}
    r1 = client.get("/api/v1/verify/Q851", headers=h)
    r2 = client.get("/api/v1/verify/Q851", headers=h)
    assert r1.status_code == r2.status_code == 200
    assert r1.json()["wikidata"]["name_en"] == "Saudi Arabia"
    assert len(calls) == 1


def test_verify_upstream_429_becomes_503_with_retry_after(client):
    _install_mock_upstream(client, lambda req: httpx.Response(429, headers={"Retry-After": "42"}))
    r = client.get("/api/v1/verify/Q851", headers={"X-Real-IP": "198.51.100.91"})
    assert r.status_code == 503
    assert r.headers["Retry-After"] == "42"
    assert verify_mod._CACHE == {}  # failures are never cached


def test_verify_upstream_429_retry_after_defaults_and_clamps(client):
    _install_mock_upstream(client, lambda req: httpx.Response(429, headers={"Retry-After": "Wed, 21 Oct 2026 07:28:00 GMT"}))
    r = client.get("/api/v1/verify/Q851", headers={"X-Real-IP": "198.51.100.92"})
    assert r.status_code == 503
    assert r.headers["Retry-After"] == str(verify_mod._DEFAULT_RETRY_AFTER)

    _install_mock_upstream(client, lambda req: httpx.Response(429, headers={"Retry-After": "99999"}))
    r = client.get("/api/v1/verify/Q852", headers={"X-Real-IP": "198.51.100.92"})
    assert r.headers["Retry-After"] == str(verify_mod._MAX_RETRY_AFTER)


def test_verify_osm_429_becomes_503(client):
    def handler(request):
        if "wikidata.org" in request.url.host:
            return httpx.Response(200, json=_wd_entity())
        return httpx.Response(429, headers={"Retry-After": "7"})

    _install_mock_upstream(client, handler)
    r = client.get("/api/v1/verify/Q851?osm_type=node&osm_id=1", headers={"X-Real-IP": "198.51.100.93"})
    assert r.status_code == 503
    assert r.headers["Retry-After"] == "7"


def test_cache_is_true_lru_not_clear_all(monkeypatch):
    monkeypatch.setattr(verify_mod, "_CACHE_MAX", 3)
    for k in ("a", "b", "c"):
        verify_mod.cache_put(k, {"k": k})
    assert verify_mod.cache_get("a") == {"k": "a"}  # touch a -> b is now oldest
    verify_mod.cache_put("d", {"k": "d"})
    assert verify_mod.cache_get("b") is None
    assert {k for k in verify_mod._CACHE} == {"a", "c", "d"}


def test_cache_entries_expire(monkeypatch):
    verify_mod.cache_put("x", {"k": "x"})
    ts, data = verify_mod._CACHE["x"]
    verify_mod._CACHE["x"] = (ts - verify_mod._CACHE_TTL - 1, data)
    assert verify_mod.cache_get("x") is None
    assert "x" not in verify_mod._CACHE


def test_lock_table_is_bounded_and_keeps_held_locks(monkeypatch):
    import asyncio

    async def scenario():
        monkeypatch.setattr(verify_mod, "_LOCKS_MAX", 3)
        held = verify_mod.get_key_lock("held")
        await held.acquire()
        for k in ("k1", "k2", "k3", "k4"):
            verify_mod.get_key_lock(k)
        assert len(verify_mod._LOCKS) <= 3
        assert verify_mod._LOCKS["held"] is held
        held.release()

    asyncio.run(scenario())


# --- preview.py: redirects ---

def test_preview_requests_redirects_yes_and_flags_redirect_items(client):
    seen = []

    def handler(request):
        seen.append(request.url)
        return httpx.Response(200, json={"entities": {"Q10000003": {
            "id": "Q7809164", "lastrevid": 5, "claims": {},
            "redirects": {"from": "Q10000003", "to": "Q7809164"}}}})

    _install_mock_upstream(client, handler)
    body = {"qid": "Q10000003", "property": "P11693", "osm_type": "node", "osm_id": 1}
    r = client.post("/api/v1/edits/preview", json=body, headers={"X-Real-IP": "198.51.100.94"})
    assert r.status_code == 200
    data = r.json()
    assert data["valid"] is False
    assert data["status"] == "redirected_entity"
    assert data["redirect_to"] == "Q7809164"
    assert seen[0].params["redirects"] == "yes"
    assert len(seen) == 1  # no OSM lookup for an unwritable item


# --- healthz freshness: both timestamp formats ---

from datetime import datetime, timedelta, timezone
from app.routers.healthz import parse_summary_timestamp


@pytest.mark.parametrize("value", ["2026-10-29T20:51:55Z", "2026-10-29 20:51:55", "2026-10-29T20:51:55"])
def test_parse_summary_timestamp_is_utc(value):
    dt = parse_summary_timestamp(value)
    assert dt == datetime(2026, 10, 29, 20, 51, 55, tzinfo=timezone.utc)


@pytest.mark.parametrize("fmt", ["%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%d %H:%M:%S"])
def test_freshness_accepts_both_formats(client, monkeypatch, fmt):
    fresh = (datetime.now(timezone.utc) - timedelta(hours=1)).strftime(fmt)
    stale = (datetime.now(timezone.utc) - timedelta(hours=500)).strftime(fmt)

    monkeypatch.setattr(client.app.state.store, "summary", {"updated_at": fresh})
    assert client.get("/api/healthz/freshness").status_code == 200

    monkeypatch.setattr(client.app.state.store, "summary", {"updated_at": stale})
    r = client.get("/api/healthz/freshness")
    assert r.status_code == 503 and r.json()["status"] == "stale"


def test_resolve_data_dir_hierarchy(tmp_path, monkeypatch):
    from app.config import resolve_data_dir

    # 1. Custom env var takes precedence
    custom_dir = tmp_path / "custom_data"
    custom_dir.mkdir()
    monkeypatch.setenv("OSMWD_DATA_DIR", str(custom_dir))
    assert resolve_data_dir() == str(custom_dir)

    # 2. When env var is cleared, resolves to existing local dev or container candidate
    monkeypatch.delenv("OSMWD_DATA_DIR", raising=False)
    resolved = resolve_data_dir()
    assert os.path.isdir(resolved)
    assert os.path.exists(os.path.join(resolved, "summary.json"))
