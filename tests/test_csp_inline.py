"""
Cross-Language Consistency Tests:
CSP Inline Handler & Script Tag Verification.

Verifies:
1. Zero inline event handlers (onclick=, onload=, etc.) in index.html.
2. Zero inline <script> blocks without src= in index.html (violates script-src 'self').
3. Zero template strings generating inline on* handlers in js/*.js.
4. deploy/Caddyfile.container contains strict CSP with script-src 'self'.
"""

import re
from pathlib import Path
import pytest

ROOT_DIR = Path(__file__).resolve().parent.parent
INDEX_HTML = ROOT_DIR / "index.html"
JS_DIR = ROOT_DIR / "js"
CADDYFILE = ROOT_DIR / "deploy" / "Caddyfile.container"

RE_INLINE_EVENT = re.compile(r'\bon[a-z]+\s*=\s*["\']', re.IGNORECASE)


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
