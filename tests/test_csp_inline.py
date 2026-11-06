"""
Cross-Language Consistency Tests:
CSP Inline Handler & Script Tag Verification.

Verifies:
1. Zero inline event handlers (onclick=, onload=, etc.) in index.html.
2. Zero inline <script> blocks without src= in index.html (violates script-src 'self').
3. Zero template strings generating inline on* handlers in js/*.js.
4. deploy/Caddyfile.container contains strict CSP with script-src 'self'.
5. Zero inline style="…" attributes in index.html and js/*.js, and a
   style-src without 'unsafe-inline' (inline styles would be blocked).
"""

import re
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
INDEX_HTML = ROOT_DIR / "index.html"
JS_DIR = ROOT_DIR / "js"
CADDYFILE = ROOT_DIR / "deploy" / "Caddyfile.container"

RE_INLINE_EVENT = re.compile(r'\bon[a-z]+\s*=\s*["\']', re.IGNORECASE)
# A style attribute in markup or in an HTML template string. el.style.x = ...
# (CSSOM) is allowed by the CSP and does not match.
RE_INLINE_STYLE = re.compile(r'\sstyle\s*=\s*["\'`$]', re.IGNORECASE)


def test_no_inline_event_handlers_in_html():
    html_text = INDEX_HTML.read_text(encoding="utf-8")
    matches = RE_INLINE_EVENT.findall(html_text)
    assert not matches, f"Found inline event handlers in index.html: {matches}"


def test_no_inline_scripts_in_html():
    html_text = INDEX_HTML.read_text(encoding="utf-8")
    # Find all <script ...> tags
    scripts = re.findall(r'<script([^>]*)>(.*?)</script>', html_text, re.DOTALL | re.IGNORECASE)
    assert len(scripts) >= 5, "Expected at least 5 script tags in index.html"

    for attrs, body in scripts:
        assert "src=" in attrs, f"<script> tag missing src= attribute: <script{attrs}>"
        # Script body should be empty or whitespace only
        assert not body.strip(), f"<script> tag has inline code: {body[:100]}"


def test_no_inline_handlers_in_js_templates():
    js_files = list(JS_DIR.glob("*.js"))
    assert len(js_files) >= 10, f"Expected at least 10 JS files in js/, found {len(js_files)}"

    for js_path in js_files:
        text = js_path.read_text(encoding="utf-8")
        # Look for on*= in string templates like `onclick="foo()"` or 'onclick="foo()"'
        matches = RE_INLINE_EVENT.findall(text)
        assert not matches, f"Found inline handler in {js_path.name}: {matches}"


def test_caddyfile_enforces_script_src_self():
    assert CADDYFILE.exists(), f"Caddyfile missing at {CADDYFILE}"
    caddy_text = CADDYFILE.read_text(encoding="utf-8")

    csp_match = re.search(r'Content-Security-Policy\s+"([^"]+)"', caddy_text)
    assert csp_match, "No Content-Security-Policy header defined in Caddyfile"

    csp = csp_match.group(1)
    assert "script-src 'self'" in csp
    assert "default-src 'self'" in csp
    assert "object-src 'none'" in csp


def test_caddyfile_security_headers():
    caddy_text = CADDYFILE.read_text(encoding="utf-8")
    assert 'Strict-Transport-Security "max-age=31536000; includeSubDomains"' in caddy_text
    assert 'Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=()"' in caddy_text
    assert 'X-Content-Type-Options "nosniff"' in caddy_text
    assert 'X-Frame-Options "SAMEORIGIN"' in caddy_text


def test_no_inline_style_attributes():
    offenders = []
    for path in [INDEX_HTML, *sorted(JS_DIR.glob("*.js"))]:
        for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if RE_INLINE_STYLE.search(line) or "<style" in line.lower():
                offenders.append(f"{path.name}:{lineno}: {line.strip()[:120]}")
    assert not offenders, "Inline styles are blocked by the CSP; use css/style.css classes:\n" + "\n".join(offenders)


def test_caddyfile_style_src_has_no_unsafe_inline():
    caddy_text = CADDYFILE.read_text(encoding="utf-8")
    csp = re.search(r'Content-Security-Policy\s+"([^"]+)"', caddy_text).group(1)
    style_src = re.search(r"style-src([^;]*)", csp)
    assert style_src, "CSP must define style-src"
    assert "'unsafe-inline'" not in style_src.group(1)
    assert "'self'" in style_src.group(1)
