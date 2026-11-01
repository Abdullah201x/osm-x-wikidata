"""Local static server for development and the Playwright smoke tests.

    python serve_ssl.py                 # https://localhost:8000 (needs cert.pem / key.pem)
    python serve_ssl.py --http --csp    # plain HTTP with the production CSP (CI / e2e)

--csp copies the Content-Security-Policy header out of deploy/Caddyfile.container, so
a page that would be blocked in production is blocked here too.
"""
import argparse
import http.server
import json
import re
import ssl
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CADDYFILE = ROOT / "deploy" / "Caddyfile.container"
HOP_BY_HOP = {"connection", "keep-alive", "transfer-encoding", "te", "trailer", "upgrade", "content-length"}


def parse_csp(caddyfile=CADDYFILE):
    """Return the production Content-Security-Policy value from the Caddyfile."""
    text = Path(caddyfile).read_text(encoding="utf-8")
    match = re.search(r'Content-Security-Policy\s+"([^"]+)"', text)
    if not match:
        raise ValueError(f"No Content-Security-Policy header found in {caddyfile}")
    return match.group(1)


class Handler(http.server.SimpleHTTPRequestHandler):
    csp = None        # set by run() when --csp is given
    api_url = None    # set by run() when --api is given
    quiet = False

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def handle(self):
        # Browsers drop keep-alive sockets when a page closes; that is not a server error.
        try:
            super().handle()
        except (ConnectionError, TimeoutError):
            pass

    def end_headers(self):
        # Enable CORS and caching headers for local testing
        self.send_header('Access-Control-Allow-Origin', '*')
        if self.csp:
            self.send_header('Content-Security-Policy', self.csp)
        super().end_headers()

    def log_message(self, fmt, *args):
        if not self.quiet:
            super().log_message(fmt, *args)

    def _path_only(self):
        return self.path.split('?', 1)[0]

    def _send_json(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _proxy_api(self):
        """Forward /api/* to the real backend (--api), or answer 503 when none is configured."""
        if not self.api_url:
            self._send_json(503, {"detail": "No API backend configured (start with --api URL)"})
            return
        length = int(self.headers.get('Content-Length') or 0)
        data = self.rfile.read(length) if length else None
        req = urllib.request.Request(self.api_url.rstrip('/') + self.path, data=data, method=self.command)
        if self.headers.get('Content-Type'):
            req.add_header('Content-Type', self.headers['Content-Type'])
        try:
            resp = urllib.request.urlopen(req, timeout=30)
        except urllib.error.HTTPError as e:
            resp = e
        except OSError as e:
            self._send_json(502, {"detail": f"API backend unreachable: {e}"})
            return
        body = resp.read()
        self.send_response(resp.status if hasattr(resp, 'status') else resp.code)
        for key, value in resp.headers.items():
            if key.lower() not in HOP_BY_HOP:
                self.send_header(key, value)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = self._path_only()
        if path == '/healthz':
            self.send_response(200)
            self.send_header('Content-Length', '0')
            self.end_headers()
        elif path.startswith('/api/'):
            self._proxy_api()
        else:
            super().do_GET()

    def do_POST(self):
        if self._path_only().startswith('/api/'):
            self._proxy_api()
        else:
            self.send_error(405)


def run(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--port', type=int, default=8000)
    parser.add_argument('--http', action='store_true', help='serve plain HTTP (no certificates), e.g. for CI')
    parser.add_argument('--csp', action='store_true', help='send the production Content-Security-Policy header')
    parser.add_argument('--api', metavar='URL', help='proxy /api/* to this backend, e.g. http://127.0.0.1:8010')
    parser.add_argument('--quiet', action='store_true', help='do not log requests')
    args = parser.parse_args(argv)

    Handler.csp = parse_csp() if args.csp else None
    Handler.api_url = args.api
    Handler.quiet = args.quiet

    httpd = http.server.ThreadingHTTPServer(('localhost', args.port), Handler)

    scheme = 'http'
    if not args.http:
        scheme = 'https'
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(certfile=str(ROOT / "cert.pem"), keyfile=str(ROOT / "key.pem"))
        httpd.socket = context.wrap_socket(httpd.socket, server_side=True)

    print(f"[{scheme.upper()}] Local server running at:")
    print(f"URL: {scheme}://localhost:{args.port}/")
    if args.csp:
        print("Production Content-Security-Policy is enforced.")
    print("Press Ctrl+C to stop.\n", flush=True)

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
        sys.exit(0)


if __name__ == '__main__':
    run()
