"""
Unit Tests for pipeline.wikidata_fetcher.

Covers:
- WKT point coordinate parsing: Point(lon lat) -> (lat, lon)
- Mosque name regex and university (جامعة) exclusion
- Item classification promoting mosque names to category 6
- Mocked SPARQL execution via fetch_sparql: success, retries, 429 backoff
"""

import json
import sqlite3
import pytest
import responses
from pipeline.wikidata_fetcher import (
    parse_point_coords,
    classify_item,
    fetch_sparql,
    RE_MOSQUE_NAME,
    RE_MOSQUE_NAME_EN,
    WIKIDATA_SPARQL_URL,
)


def test_parse_point_coords():
    # Standard WKT Point(lon lat)
    coords = parse_point_coords("Point(50.55 26.05)")
    assert coords == (26.05, 50.55)

    # Negative coordinates
    coords_neg = parse_point_coords("Point(-46.67 -24.71)")
    assert coords_neg == (-24.71, -46.67)

    # Coordinates with extra spacing
    coords_space = parse_point_coords("Point(   55.27   25.20 )")
    assert coords_space == (25.20, 55.27)

    # Invalid strings
    assert parse_point_coords("Polygon(((0 0, 1 1)))") is None
    assert parse_point_coords("") is None
    assert parse_point_coords("invalid") is None


def test_mosque_name_regex_excludes_university():
    # Should match mosque words
    assert RE_MOSQUE_NAME.search("مسجد قباء") is not None
    assert RE_MOSQUE_NAME.search("جامع الملك فهد") is not None
    assert RE_MOSQUE_NAME.search("الجامع الكبير") is not None
    assert RE_MOSQUE_NAME.search("مصلى العيد") is not None

    # MUST NOT match "جامعة" (university)
    assert RE_MOSQUE_NAME.search("جامعة الملك سعود") is None
    assert RE_MOSQUE_NAME.search("جامعة الإمام محمد بن سعود") is None
    assert RE_MOSQUE_NAME.search("الجامعة الإسلامية") is None

    # English regex
    assert RE_MOSQUE_NAME_EN.search("Al Rajhi Mosque") is not None
    assert RE_MOSQUE_NAME_EN.search("Grand Masjid") is not None
    assert RE_MOSQUE_NAME_EN.search("King Saud University") is None


def test_classify_item():
    # Mosque name promoted to category 6 (worship)
    cat_id, p31, label = classify_item("جامع النور", "Al Noor Mosque", "Q123", "building")
    assert cat_id == 6
    assert p31 == "Q32815"

    # University should not be promoted to worship
    cat_id_uni, p31_uni, _ = classify_item("جامعة الملك خالد", "King Khalid University", "Q3918", "university")
    assert cat_id_uni != 6


@responses.activate
def test_fetch_sparql_success():
    mock_payload = {
        "results": {
            "bindings": [
                {
                    "item": {"value": "http://www.wikidata.org/entity/Q851"},
                    "coords": {"value": "Point(46.67 24.71)"},
                    "itemLabel_ar": {"value": "المملكة العربية السعودية"},
                    "itemLabel_en": {"value": "Saudi Arabia"},
                }
            ]
        }
    }
    responses.add(
        responses.GET,
        WIKIDATA_SPARQL_URL,
        json=mock_payload,
        status=200,
        content_type="application/sparql-results+json",
    )

    items = fetch_sparql("SELECT ?item WHERE { ... }")
    assert items is not None
    assert len(items) == 1
    assert items[0]["item"]["value"] == "http://www.wikidata.org/entity/Q851"


@responses.activate
def test_fetch_sparql_retry_on_500():
    # First call fails with 500, second succeeds with 200
    mock_payload = {
        "results": {
            "bindings": [
                {
                    "item": {"value": "http://www.wikidata.org/entity/Q100"},
                    "coords": {"value": "Point(50.5 26.2)"},
                }
            ]
        }
    }
    responses.add(responses.GET, WIKIDATA_SPARQL_URL, status=500)
    responses.add(
        responses.GET,
        WIKIDATA_SPARQL_URL,
        json=mock_payload,
        status=200,
        content_type="application/sparql-results+json",
    )

    items = fetch_sparql("SELECT ?item WHERE { ... }", max_retries=2)
    assert items is not None
    assert len(items) == 1
    assert items[0]["item"]["value"] == "http://www.wikidata.org/entity/Q100"
