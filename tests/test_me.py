"""
Tests for GET /api/v1/me (OSM identity + import allowlist). Fully offline: OSM is mocked with respx.
"""

import hashlib

import httpx
import pytest

from app.config import get_import_allowlist
from app.routers import me as me_module

OSM_URL = "https://api.openstreetmap.org/api/0.6/user/details.json"
TOKEN = "tok-secret-123"


def osm_user(uid=4242, name="Mapper"):
    return httpx.Response(200, json={"user": {"id": uid, "display_name": name}})


@pytest.fixture(autouse=True)
def clean_identity_cache():
    me_module._IDENTITY_CACHE.clear()
    yield
    me_module._IDENTITY_CACHE.clear()


def auth(token=TOKEN):
    return {"Authorization": f"Bearer {token}"}


def ip(n):
    return {"X-Real-IP": f"203.0.113.{n}"}


def test_allowlist_parsing(monkeypatch):
    monkeypatch.delenv("OSMWD_IMPORT_ALLOWLIST", raising=False)
    assert get_import_allowlist() == frozenset()
    monkeypatch.setenv("OSMWD_IMPORT_ALLOWLIST", " 12, 345 ,abc,,6x, 78 ")
    assert get_import_allowlist() == frozenset({12, 345, 78})


def test_allowlisted_user_can_import(client, respx_mock, monkeypatch):
    monkeypatch.setenv("OSMWD_IMPORT_ALLOWLIST", "4242,7")
    route = respx_mock.get(OSM_URL).mock(return_value=osm_user(4242, "Abdullah"))
    r = client.get("/api/v1/me", headers={**auth(), **ip(1)})
    assert r.status_code == 200
    assert r.json() == {"uid": 4242, "display_name": "Abdullah", "can_import": True}
    assert r.headers["cache-control"] == "no-store"
    # The token is forwarded to OSM and nowhere else.
    assert route.calls.last.request.headers["authorization"] == f"Bearer {TOKEN}"


def test_non_allowlisted_user_cannot_import(client, respx_mock, monkeypatch):
    monkeypatch.setenv("OSMWD_IMPORT_ALLOWLIST", "7")
    respx_mock.get(OSM_URL).mock(return_value=osm_user(4242))
    r = client.get("/api/v1/me", headers={**auth(), **ip(2)})
    assert r.status_code == 200
    assert r.json()["can_import"] is False


def test_empty_allowlist_means_nobody(client, respx_mock, monkeypatch):
    monkeypatch.delenv("OSMWD_IMPORT_ALLOWLIST", raising=False)
    respx_mock.get(OSM_URL).mock(return_value=osm_user(1))
    r = client.get("/api/v1/me", headers={**auth(), **ip(3)})
    assert r.json()["can_import"] is False


def test_missing_or_malformed_authorization_is_401_without_upstream_call(client, respx_mock):
    route = respx_mock.get(OSM_URL).mock(return_value=osm_user())
    for headers in ({}, {"Authorization": "Bearer "}, {"Authorization": "Basic abc"}, {"Authorization": TOKEN}):
        r = client.get("/api/v1/me", headers={**headers, **ip(4)})
        assert r.status_code == 401, headers
    assert route.call_count == 0


@pytest.mark.parametrize("upstream_status", [401, 403])
def test_rejected_token_is_401(client, respx_mock, upstream_status):
    respx_mock.get(OSM_URL).mock(return_value=httpx.Response(upstream_status))
    r = client.get("/api/v1/me", headers={**auth(), **ip(5)})
    assert r.status_code == 401


def test_upstream_429_becomes_503_with_retry_after(client, respx_mock):
    respx_mock.get(OSM_URL).mock(return_value=httpx.Response(429, headers={"Retry-After": "45"}))
    r = client.get("/api/v1/me", headers={**auth(), **ip(6)})
    assert r.status_code == 503
    assert r.headers["retry-after"] == "45"


def test_upstream_5xx_and_network_errors_become_503(client, respx_mock):
    respx_mock.get(OSM_URL).mock(return_value=httpx.Response(500))
    assert client.get("/api/v1/me", headers={**auth("a"), **ip(7)}).status_code == 503
    respx_mock.get(OSM_URL).mock(side_effect=httpx.ConnectError("boom"))
    r = client.get("/api/v1/me", headers={**auth("b"), **ip(7)})
    assert r.status_code == 503
    assert "boom" not in r.text


def test_identity_is_cached_but_allowlist_is_not(client, respx_mock, monkeypatch):
    route = respx_mock.get(OSM_URL).mock(return_value=osm_user(4242))
    monkeypatch.setenv("OSMWD_IMPORT_ALLOWLIST", "")
    assert client.get("/api/v1/me", headers={**auth(), **ip(8)}).json()["can_import"] is False
    monkeypatch.setenv("OSMWD_IMPORT_ALLOWLIST", "4242")
    assert client.get("/api/v1/me", headers={**auth(), **ip(8)}).json()["can_import"] is True
    assert route.call_count == 1


def test_cache_is_keyed_by_token_digest_and_never_holds_the_token(client, respx_mock):
    respx_mock.get(OSM_URL).mock(return_value=osm_user())
    client.get("/api/v1/me", headers={**auth(), **ip(9)})
    assert list(me_module._IDENTITY_CACHE) == [hashlib.sha256(TOKEN.encode()).hexdigest()]
    assert TOKEN not in repr(me_module._IDENTITY_CACHE)


def test_cache_entries_expire(client, respx_mock, monkeypatch):
    route = respx_mock.get(OSM_URL).mock(return_value=osm_user())
    client.get("/api/v1/me", headers={**auth(), **ip(10)})
    key = next(iter(me_module._IDENTITY_CACHE))
    ts, ident = me_module._IDENTITY_CACHE[key]
    me_module._IDENTITY_CACHE[key] = (ts - me_module._CACHE_TTL - 1, ident)
    client.get("/api/v1/me", headers={**auth(), **ip(10)})
    assert route.call_count == 2


def test_cache_is_bounded(monkeypatch):
    monkeypatch.setattr(me_module, "_CACHE_MAX", 3)
    for i in range(10):
        me_module._cache_put(f"k{i}", {"uid": i, "display_name": ""})
    assert list(me_module._IDENTITY_CACHE) == ["k7", "k8", "k9"]


def test_me_rate_limit_is_10_per_minute(client):
    headers = ip(99)  # no Authorization: 401 before any upstream call, but still counted
    statuses = [client.get("/api/v1/me", headers=headers).status_code for _ in range(11)]
    assert statuses[:10] == [401] * 10
    assert statuses[10] == 429
