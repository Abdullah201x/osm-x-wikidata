"""
Cross-Language Consistency Tests:
Asset Cache-Busting Verification.

Verifies:
1. Every local stylesheet <link href="..."> in index.html carries a '?v=' cache-busting token.
2. Every local script <script src="..."> in index.html carries a '?v=' cache-busting token.
3. All local version tokens are non-empty and unified across the app shell.
"""

import re
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
INDEX_HTML = ROOT_DIR / "index.html"


def test_stylesheets_have_cache_bust():
    html = INDEX_HTML.read_text(encoding="utf-8")
    links = re.findall(r'<link\s+[^>]*rel=["\']stylesheet["\'][^>]*href=["\']([^"\']+)["\']', html)
    assert len(links) >= 3, f"Expected at least 3 stylesheet links, got {len(links)}"

    for href in links:
        if href.startswith("http://") or href.startswith("https://") or href.startswith("//"):
            continue  # external CDN or URL
        assert "?v=" in href, f"Local stylesheet missing '?v=' cache-busting parameter: {href}"


def test_scripts_have_cache_bust():
    html = INDEX_HTML.read_text(encoding="utf-8")
    scripts = re.findall(r'<script\s+[^>]*src=["\']([^"\']+)["\']', html)
    assert len(scripts) >= 10, f"Expected at least 10 script tags, got {len(scripts)}"

    for src in scripts:
        if src.startswith("http://") or src.startswith("https://") or src.startswith("//"):
            continue
        assert "?v=" in src, f"Local script missing '?v=' cache-busting parameter: {src}"


def test_unified_cache_bust_version():
    html = INDEX_HTML.read_text(encoding="utf-8")
    versions = set(re.findall(r'(?:href|src)=["\'][^"\']+\?v=([^"\'&]+)["\']', html))
    assert len(versions) == 1, f"Found multiple inconsistent asset version tokens in index.html: {versions}"
    version = versions.pop()
    assert version.strip(), "Version token is empty"
