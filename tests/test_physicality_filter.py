"""
Unit Tests for pipeline.physicality_filter.

Tests the OpenStreetMap Ground Truth rule enforcement:
- Explicitly non-mappable P31 classes (battles, pandemics, plane crashes, fires, humans)
- English non-physical event keywords in names and descriptions
- Arabic non-physical event keywords in names and descriptions
- Blank GeoNames bot import filtering (unnamed items)
- Valid physical entities (mosques, hospitals, schools, mountains, settlements)
"""

from pipeline.physicality_filter import (
    is_physical_mappable,
    NON_MAPPABLE_P31,
    RE_NON_PHYSICAL_EN,
    RE_NON_PHYSICAL_AR,
)


def test_valid_physical_entity():
    item = {
        "qid": "Q12345",
        "name_ar": "مسجد الهدى",
        "name_en": "Al Huda Mosque",
        "p31_qid": "Q32815",  # mosque
        "desc_en": "mosque in Riyadh",
        "desc_ar": "مسجد في الرياض",
    }
    valid, reason = is_physical_mappable(item)
    assert valid is True
    assert reason == "Valid"


def test_non_mappable_p31_classes():
    # Human (Q5)
    human_item = {"qid": "Q1", "name_ar": "الملك عبد العزيز", "name_en": "King Abdulaziz", "p31_qid": "Q5"}
    valid, reason = is_physical_mappable(human_item)
    assert valid is False
    assert "class" in reason.lower() or "q5" in reason.lower() or "non-physical" in reason.lower()

    # Battle (Q178561)
    battle_item = {"qid": "Q2", "name_ar": "معركة بدر", "name_en": "Battle of Badr", "p31_qid": "Q178561"}
    valid, reason = is_physical_mappable(battle_item)
    assert valid is False

    # Pandemic (Q3241045)
    covid_item = {"qid": "Q3", "name_ar": "جائحة كوفيد-19", "name_en": "COVID-19 pandemic", "p31_qid": "Q3241045"}
    valid, reason = is_physical_mappable(covid_item)
    assert valid is False


def test_english_event_keywords():
    item = {
        "qid": "Q10",
        "name_en": "Plane crash near Jeddah",
        "name_ar": "حادث طائرة",
        "desc_en": "aviation accident in 1980",
        "p31_qid": "Q123",
    }
    valid, reason = is_physical_mappable(item)
    assert valid is False
    assert "event" in reason.lower() or "accident" in reason.lower() or "non-physical" in reason.lower()


def test_arabic_event_keywords():
    item = {
        "qid": "Q20",
        "name_ar": "مجزرة مسجد القديح",
        "name_en": "Qudaih incident",
        "desc_ar": "هجوم إرهابي استهدف المصلين",
        "p31_qid": "Q123",
    }
    valid, reason = is_physical_mappable(item)
    assert valid is False


def test_blank_unnamed_geonames_item():
    item = {
        "qid": "Q30",
        "name_ar": "",
        "name_en": "",
        "desc_en": "human settlement",
        "p31_qid": "Q486972",
    }
    valid, reason = is_physical_mappable(item)
    assert valid is False
    assert "blank" in reason.lower() or "unnamed" in reason.lower() or "name" in reason.lower()


def test_p31_set_contains_core_classes():
    assert "Q5" in NON_MAPPABLE_P31        # human
    assert "Q178561" in NON_MAPPABLE_P31   # battle
    assert "Q3241045" in NON_MAPPABLE_P31  # pandemic
    assert "Q186117" in NON_MAPPABLE_P31   # timeline
    assert "Q198" in NON_MAPPABLE_P31      # war


def test_regex_matching():
    assert RE_NON_PHYSICAL_EN.search("The Battle of Yarmouk") is not None
    assert RE_NON_PHYSICAL_EN.search("Drone attack on Abqaiq") is not None
    assert RE_NON_PHYSICAL_EN.search("Timeline of Saudi history") is not None
    assert RE_NON_PHYSICAL_EN.search("Al Faisaliyah Centre") is None

    assert RE_NON_PHYSICAL_AR.search("معركة اليرموك") is not None
    assert RE_NON_PHYSICAL_AR.search("تفشي مرض الكوليرا") is not None
    assert RE_NON_PHYSICAL_AR.search("مستشفى الملك فيصل التخصصي") is None
