"""The local/e2e server must enforce exactly the CSP that Caddy ships in production."""
import http.client
import threading
from http.server import ThreadingHTTPServer

import pytest

import serve_ssl


def test_parse_csp_matches_the_production_caddyfile():
    csp = serve_ssl.parse_csp()
    assert csp.startswith("default-src 'self';")
    assert "script-src 'self';" in csp
    assert "object-src 'none'" in csp


def test_parse_csp_fails_loudly_when_the_header_is_missing(tmp_path):
    caddyfile = tmp_path / "Caddyfile"
    caddyfile.write_text(":80 {\n  respond 200\n}\n", encoding="utf-8")
    with pytest.raises(ValueError):
        serve_ssl.parse_csp(caddyfile)


@pytest.fixture
def server(monkeypatch):
    monkeypatch.setattr(serve_ssl.Handler, "csp", serve_ssl.parse_csp())
    monkeypatch.setattr(serve_ssl.Handler, "api_url", None)
    monkeypatch.setattr(serve_ssl.Handler, "quiet", True)
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), serve_ssl.Handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    yield httpd.server_address[1]
    httpd.shutdown()
    httpd.server_close()


def _get(port, path):
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
    conn.request("GET", path)
    resp = conn.getresponse()
    body = resp.read()
    conn.close()
    return resp, body


def test_pages_carry_the_csp_header(server):
    resp, _ = _get(server, "/index.html")
    assert resp.status == 200
    assert resp.getheader("Content-Security-Policy") == serve_ssl.parse_csp()


def test_healthz_mirrors_caddy(server):
    resp, _ = _get(server, "/healthz")
    assert resp.status == 200


def test_api_without_a_backend_is_a_clear_503(server):
    resp, body = _get(server, "/api/v1/reverse?cc=sa")
    assert resp.status == 503
    assert b"No API backend configured" in body
