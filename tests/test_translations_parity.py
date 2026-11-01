"""
Cross-Language Consistency Tests (Manara test_tags.py pattern):
Translations Parity & HTML Attribute Linkage.

Verifies:
1. Every key defined in TRANSLATIONS['ar'] exists in TRANSLATIONS['en'] (100% key parity).
2. Every key defined in TRANSLATIONS['en'] exists in TRANSLATIONS['ar'].
3. No translation value is empty, None, or whitespace-only.
4. Every data-i18n attribute in index.html references a defined translation key.
"""

import re
from pathlib import Path
import pytest

ROOT_DIR = Path(__file__).resolve().parent.parent
TRANSLATIONS_JS = ROOT_DIR / "js" / "translations.js"
INDEX_HTML = ROOT_DIR / "index.html"


def load_translations():
    text = TRANSLATIONS_JS.read_text(encoding="utf-8")

    ar_match = re.search(r"ar:\s*\{(.*?)\n  \},", text, re.DOTALL)
    en_match = re.search(r"en:\s*\{(.*?)\n  \}", text, re.DOTALL)
    assert ar_match, "Could not extract 'ar' block from js/translations.js"
    assert en_match, "Could not extract 'en' block from js/translations.js"

    ar_block = ar_match.group(1)
    en_block = en_match.group(1)

    ar_pairs = re.findall(r'^\s*([a-zA-Z0-9_]+)\s*:\s*["`\'](.*?)["`\'],?\s*$', ar_block, re.MULTILINE)
    en_pairs = re.findall(r'^\s*([a-zA-Z0-9_]+)\s*:\s*["`\'](.*?)["`\'],?\s*$', en_block, re.MULTILINE)

    ar_dict = {k: v for k, v in ar_pairs}
    en_dict = {k: v for k, v in en_pairs}

    return ar_dict, en_dict


def test_translations_key_parity():
    ar_dict, en_dict = load_translations()

    assert len(ar_dict) >= 150, f"Expected at least 150 translation keys, got {len(ar_dict)}"
    assert len(en_dict) >= 150, f"Expected at least 150 translation keys, got {len(en_dict)}"

    missing_in_en = set(ar_dict.keys()) - set(en_dict.keys())
    missing_in_ar = set(en_dict.keys()) - set(ar_dict.keys())

    assert not missing_in_en, f"Keys in Arabic but missing in English: {missing_in_en}"
    assert not missing_in_ar, f"Keys in English but missing in Arabic: {missing_in_ar}"


def test_no_empty_translation_values():
    ar_dict, en_dict = load_translations()

    for k, v in ar_dict.items():
        assert v and v.strip(), f"Arabic translation for '{k}' is empty"

    for k, v in en_dict.items():
        assert v and v.strip(), f"English translation for '{k}' is empty"


def test_html_data_i18n_keys_exist():
    ar_dict, _ = load_translations()
    html_text = INDEX_HTML.read_text(encoding="utf-8")

    html_keys = set(re.findall(r'data-i18n="([^"]+)"', html_text))
    assert len(html_keys) >= 20, f"Expected at least 20 data-i18n attributes, got {len(html_keys)}"

    missing_keys = html_keys - set(ar_dict.keys())
    assert not missing_keys, f"HTML references undefined data-i18n keys: {missing_keys}"
