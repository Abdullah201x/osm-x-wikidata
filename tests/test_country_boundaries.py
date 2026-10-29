"""
Unit Tests for GCC Country Boundary Matcher and Spatial Waterfall.
"""

from pipeline.country_boundaries import get_country_matcher

def test_gcc_country_point_containment():
    m = get_country_matcher()
    test_cases = [
        ("Riyadh", 24.7136, 46.6753, "SA"),
        ("Jeddah", 21.5433, 39.1728, "SA"),
        ("Dubai", 25.2048, 55.2708, "AE"),
        ("Abu Dhabi", 24.4539, 54.3773, "AE"),
        ("Kuwait City", 29.3759, 47.9774, "KW"),
        ("Doha", 25.2854, 51.5310, "QA"),
        ("Manama", 26.2285, 50.5860, "BH"),
        ("Muscat", 23.5880, 58.3829, "OM"),
        ("Salalah", 17.0151, 54.0924, "OM"),
        ("Amman (Jordan outside GCC)", 31.9454, 35.9284, None),
        ("Baghdad (Iraq outside GCC)", 33.3152, 44.3661, None),
    ]
    for name, lat, lon, expected in test_cases:
        res = m.match_point(lat, lon)
        assert res == expected, f"{name}: expected {expected}, got {res}"

def test_waterfall_country_resolution():
    m = get_country_matcher()

    # Tier 1: coordinates
    assert m.resolve_country(24.7136, 46.6753) == "SA"

    # Tier 2: (0, 0) coords but has ISO tag
    assert m.resolve_country(0.0, 0.0, osm_tags={"ISO3166-1": "AE"}) == "AE"
    assert m.resolve_country(0.0, 0.0, osm_tags={"addr:country": "kw"}) == "KW"

    # Tier 3: (0, 0) coords, no tags, but Wikidata P17
    assert m.resolve_country(0.0, 0.0, wd_item={"p17": ["Q851"]}) == "SA"
    assert m.resolve_country(0.0, 0.0, wd_item={"lat": 26.05, "lon": 50.55}) == "BH"
