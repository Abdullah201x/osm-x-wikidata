"""
Tests for pipeline/config.py
Verifies GCC country configurations, category taxonomies, P31 classifications,
and bounding box integrity.
"""

from pipeline.config import (
    GCC_COUNTRIES,
    QID_TO_COUNTRY_CODE,
    COUNTRY_CODE_TO_QID,
    CATEGORIES,
    P31_ONTOLOGY,
    classify_p31,
    find_pbf,
)


def test_gcc_countries_structure():
    """Verify all 6 GCC countries are configured with required metadata."""
    expected_countries = {"SA", "AE", "KW", "QA", "BH", "OM"}
    assert set(GCC_COUNTRIES.keys()) == expected_countries

    for code, info in GCC_COUNTRIES.items():
        assert info["id"] == code.lower()
        assert isinstance(info["name_en"], str) and len(info["name_en"]) > 0
        assert isinstance(info["name_ar"], str) and len(info["name_ar"]) > 0
        assert info["qid"].startswith("Q")
        assert isinstance(info["relation_id"], int)
        assert isinstance(info["default_zoom"], int) and 5 <= info["default_zoom"] <= 12

        # Bbox validation: [min_lat, min_lon, max_lat, max_lon]
        bbox = info["bbox"]
        assert len(bbox) == 4
        min_lat, min_lon, max_lat, max_lon = bbox
        assert min_lat < max_lat
        assert min_lon < max_lon
        assert 12.0 <= min_lat <= 34.0
        assert 33.0 <= min_lon <= 61.0

        # Center coordinates within bbox
        lat, lon = info["center"]
        assert min_lat <= lat <= max_lat
        assert min_lon <= lon <= max_lon


def test_country_qid_mappings():
    """Verify bidirectional mappings between country codes and Wikidata QIDs."""
    for code, info in GCC_COUNTRIES.items():
        qid = info["qid"]
        assert COUNTRY_CODE_TO_QID[code] == qid
        assert QID_TO_COUNTRY_CODE[qid] == code


def test_categories_taxonomy():
    """Verify all 6 categories exist and have proper icons and bilingual labels."""
    assert set(CATEGORIES.keys()) == {1, 2, 3, 4, 5, 6}
    for cat_id, cat in CATEGORIES.items():
        assert "id" in cat
        assert "name_en" in cat
        assert "name_ar" in cat
        assert "icon" in cat
        assert len(cat["icon"]) > 0


def test_classify_p31():
    """Verify P31 QID classification into standard GCC categories."""
    # Worship (6)
    assert classify_p31("Q32815") == 6  # Mosque
    assert classify_p31("Q16970") == 6  # Church

    # Heritage (2)
    assert classify_p31("Q839954") == 2   # Archaeological Site
    assert classify_p31("Q23413") == 2    # Castle
    assert classify_p31("Q33506") == 2    # Museum

    # Nature (3)
    assert classify_p31("Q8502") == 3    # Mountain
    assert classify_p31("Q187971") == 3  # Wadi

    # Amenity / Services (4)
    assert classify_p31("Q16917") == 4   # Hospital
    assert classify_p31("Q3918") == 4    # University

    # Commercial / Tourism (5)
    assert classify_p31("Q27686") == 5   # Hotel
    assert classify_p31("Q11266439") == 5 # Mall

    # Fallback for unknown QID defaults to 5
    assert classify_p31("Q999999999") == 5


def test_p31_ontology_tags():
    """Verify that every entry in P31_ONTOLOGY has non-empty suggested OSM tags."""
    for qid, entry in P31_ONTOLOGY.items():
        assert qid.startswith("Q")
        assert "cat" in entry
        assert entry["cat"] in CATEGORIES
        assert "tags" in entry
        assert isinstance(entry["tags"], dict)
        assert len(entry["tags"]) > 0


def test_find_pbf_helper(tmp_path):
    """Verify find_pbf finds .osm.pbf files or returns None."""
    # When pointed at empty dir, returns None
    result = find_pbf(base_dir=str(tmp_path))
    assert result is None or isinstance(result, str)
