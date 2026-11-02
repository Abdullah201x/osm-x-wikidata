"""
Hardening tests for osmwd-api: error hygiene, input validation, upstream failures.
"""

import json
import os
import sys

import httpx
import pytest
from fastapi.testclient import TestClient

backend_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend")
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.main import app
from app.routers import verify as verify_mod
from app.store import DatasetStore

LEAK = "secret-internal-host:1234 refused"


def _install_mock_upstream(client, handler):
    client.app.state.http_client = httpx.AsyncClient(transport=httpx.MockTransport(handler))


def _wd_entity(qid="Q851"):
    return {"entities": {qid: {"lastrevid": 99, "labels": {"en": {"value": "Saudi Arabia"}},
                               "descriptions": {}, "claims": {}}}}


def _is_wikidata(request):
    return "wikidata.org" in request.url.host


def _raise_connect_error(request):
    raise httpx.ConnectError(LEAK)


def _preview_body(**over):
    body = {"qid": "Q851", "property": "P11693", "osm_type": "node", "osm_id": 1}
    body.update(over)
    return body


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client
    verify_mod._CACHE.clear()
    verify_mod._LOCKS.clear()


# --- preview.py ---

def test_preview_wikidata_failure_does_not_leak_exception_text(client):
    _install_mock_upstream(client, _raise_connect_error)
    r = client.post("/api/v1/edits/preview", json=_preview_body(), headers={"X-Real-IP": "198.51.100.101"})
    assert r.status_code == 502
    assert "secret-internal-host" not in r.text


def test_preview_wikidata_429_becomes_503_with_retry_after(client):
    _install_mock_upstream(client, lambda req: httpx.Response(429, headers={"Retry-After": "11"}))
    r = client.post("/api/v1/edits/preview", json=_preview_body(), headers={"X-Real-IP": "198.51.100.102"})
    assert r.status_code == 503
    assert r.headers["Retry-After"] == "11"


@pytest.mark.parametrize("status,text", [(500, "boom"), (200, "<html>not json</html>")])
def test_preview_wikidata_bad_response_is_502(client, status, text):
    _install_mock_upstream(client, lambda req: httpx.Response(status, text=text))
    r = client.post("/api/v1/edits/preview", json=_preview_body(), headers={"X-Real-IP": "198.51.100.103"})
    assert r.status_code == 502


def test_preview_osm_429_becomes_503(client):
    def handler(request):
        if _is_wikidata(request):
            return httpx.Response(200, json=_wd_entity())
        return httpx.Response(429, headers={"Retry-After": "9"})

    _install_mock_upstream(client, handler)
    r = client.post("/api/v1/edits/preview", json=_preview_body(), headers={"X-Real-IP": "198.51.100.104"})
    assert r.status_code == 503
    assert r.headers["Retry-After"] == "9"


def test_preview_osm_failure_is_a_generic_warning(client):
    def handler(request):
        if _is_wikidata(request):
            return httpx.Response(200, json=_wd_entity())
        raise httpx.ConnectError(LEAK)

    _install_mock_upstream(client, handler)
    r = client.post("/api/v1/edits/preview", json=_preview_body(), headers={"X-Real-IP": "198.51.100.105"})
    assert r.status_code == 200
    assert r.json()["status"] == "ready"
    assert "secret-internal-host" not in r.text


def test_preview_deleted_osm_element(client):
    def handler(request):
        if _is_wikidata(request):
            return httpx.Response(200, json=_wd_entity())
        return httpx.Response(410)

    _install_mock_upstream(client, handler)
    r = client.post("/api/v1/edits/preview", json=_preview_body(), headers={"X-Real-IP": "198.51.100.106"})
    assert r.json()["status"] == "deleted_in_osm"


def test_preview_rejects_unknown_osm_type(client):
    r = client.post("/api/v1/edits/preview", json=_preview_body(osm_type="area"), headers={"X-Real-IP": "198.51.100.107"})
    assert r.status_code == 400


def test_preview_accepts_short_osm_type(client):
    def handler(request):
        if _is_wikidata(request):
            return httpx.Response(200, json=_wd_entity())
        return httpx.Response(200, json={"elements": [{"tags": {"wikidata": "Q851"}}]})

    _install_mock_upstream(client, handler)
    r = client.post("/api/v1/edits/preview", json=_preview_body(osm_type="W", property="P10689"),
                    headers={"X-Real-IP": "198.51.100.108"})
    assert r.status_code == 200
    assert r.json()["status"] == "ready"


# --- verify.py ---

@pytest.mark.parametrize("query", ["osm_type=area&osm_id=1", "osm_type=node&osm_id=0", "osm_type=node&osm_id=-5"])
def test_verify_rejects_junk_osm_params(client, query):
    called = []

    def handler(request):
        called.append(1)
        return httpx.Response(200, json=_wd_entity())

    _install_mock_upstream(client, handler)
    r = client.get(f"/api/v1/verify/Q851?{query}", headers={"X-Real-IP": "198.51.100.109"})
    assert r.status_code in (400, 422)
    assert called == []
    assert verify_mod._CACHE == {}


def test_verify_short_and_long_osm_type_share_a_cache_entry(client):
    calls = []

    def handler(request):
        calls.append(str(request.url))
        if _is_wikidata(request):
            return httpx.Response(200, json=_wd_entity())
        return httpx.Response(200, json={"elements": [{"version": 1, "tags": {}}]})

    _install_mock_upstream(client, handler)
    h = {"X-Real-IP": "198.51.100.110"}
    assert client.get("/api/v1/verify/Q851?osm_type=n&osm_id=1", headers=h).status_code == 200
    assert client.get("/api/v1/verify/Q851?osm_type=node&osm_id=1", headers=h).status_code == 200
    assert len(calls) == 2  # one Wikidata + one OSM call; the second request is fully cached


def test_verify_wikidata_failure_does_not_leak_exception_text(client):
    _install_mock_upstream(client, _raise_connect_error)
    r = client.get("/api/v1/verify/Q851", headers={"X-Real-IP": "198.51.100.111"})
    assert r.status_code == 502
    assert "secret-internal-host" not in r.text


def test_verify_osm_failure_is_a_generic_error_and_not_cached(client):
    def handler(request):
        if _is_wikidata(request):
            return httpx.Response(200, json=_wd_entity())
        raise httpx.ConnectError(LEAK)

    _install_mock_upstream(client, handler)
    r = client.get("/api/v1/verify/Q851?osm_type=node&osm_id=1", headers={"X-Real-IP": "198.51.100.113"})
    assert r.status_code == 200
    assert "secret-internal-host" not in r.text
    assert r.json()["osm"]["error"]
    assert verify_mod._CACHE == {}


def test_missing_http_client_is_503(client):
    original = client.app.state.http_client
    client.app.state.http_client = None
    try:
        r = client.get("/api/v1/verify/Q851", headers={"X-Real-IP": "198.51.100.112"})
    finally:
        client.app.state.http_client = original  # the lifespan closes it on shutdown
    assert r.status_code == 503


# --- reverse.py / store.py ---

@pytest.mark.parametrize("query", ["bbox=1,2,3", "bbox=1,2,3,4,5", "bbox=a,b,c,d", "kind=nonsense", "kind=conflict,nonsense"])
def test_reverse_rejects_bad_bbox_and_kind(client, query):
    assert client.get(f"/api/v1/reverse?{query}").status_code == 400


def test_reverse_accepts_every_real_kind(client):
    r = client.get("/api/v1/reverse?cc=sa&kind=missing_backlink,broken_osm_tag,conflict,review_gap")
    assert r.status_code == 200


def test_reverse_rejects_overlong_query(client):
    assert client.get("/api/v1/reverse?q=" + "x" * 101).status_code == 422


def _corpus(item):
    osm = item.get("osm") or {}
    wd = item.get("wikidata") or {}
    return (
        f"{item.get('qid', '')} {item.get('osm_id', '')} "
        f"{osm.get('name', '')} {osm.get('name_ar', '')} {osm.get('name_en', '')} "
        f"{wd.get('name_ar', '')} {wd.get('name_en', '')}"
    ).lower()


def test_reverse_search_matches_the_original_per_request_corpus(client):
    store = client.app.state.store
    items = store.reverse_datasets["sa"]["items"]
    sample = next(i for i in items if (i.get("osm") or {}).get("name_ar") or (i.get("wikidata") or {}).get("name_ar"))
    needle = ((sample.get("osm") or {}).get("name_ar") or sample["wikidata"]["name_ar"])[:3]
    expected = [i for i in items if needle.lower() in _corpus(i)]
    got = store.query_reverse(country_code="sa", search_query=needle, page_size=200)
    assert got["total"] == len(expected) > 0

    by_qid = store.query_reverse(country_code="sa", search_query=sample["qid"].lower(), page_size=200)
    assert sample["qid"] in {i["qid"] for i in by_qid["items"]}


def test_store_reload_rebuilds_search_corpus(tmp_path):
    (tmp_path / "summary.json").write_text(json.dumps({"countries": {}, "updated_at": ""}), encoding="utf-8")
    (tmp_path / "reverse_sa.json").write_text(json.dumps({"items": [
        {"qid": "Q1", "osm_id": 7, "kind": "conflict", "osm": {"name_ar": "مسجد"}, "wikidata": {}},
        {"qid": "Q2", "osm_id": 8, "kind": "conflict", "osm": {}, "wikidata": {"name_en": "Tower"}},
    ]}), encoding="utf-8")
    store = DatasetStore(str(tmp_path))
    assert store.query_reverse(search_query="مسجد")["total"] == 1
    assert store.query_reverse(search_query="tower")["items"][0]["qid"] == "Q2"
    assert store.query_reverse(search_query="q1")["total"] == 1
    assert store.query_reverse(search_query="nothing")["total"] == 0


# --- main.py ---

def test_docs_are_served_outside_production():
    assert app.docs_url == "/api/docs"
    assert app.openapi_url == "/api/openapi.json"


def test_docs_are_disabled_in_production(monkeypatch):
    import importlib
    import app.config as config_mod
    import app.main as main_mod

    monkeypatch.setenv("OSMWD_ENV", "production")
    importlib.reload(config_mod)
    try:
        prod = importlib.reload(main_mod).app
        assert prod.docs_url is None
        assert prod.openapi_url is None
    finally:
        monkeypatch.delenv("OSMWD_ENV")
        importlib.reload(config_mod)
        importlib.reload(main_mod)
