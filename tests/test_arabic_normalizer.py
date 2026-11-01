"""
Unit Tests for pipeline.arabic_normalizer.

Covers:
- Diacritics (tashkeel) and tatweel removal
- Hamza, taa marbuta, and alif maqsoora unification
- Mosque / Jami synonym normalization
- Definite article (ال) stripping
- Consonant skeleton extraction
- English phonetic transliteration (transliterate_ar_to_en)
- Tokenization
- String similarity and composite name matching
- Disambiguation serial suffix stripping
"""

from pipeline.arabic_normalizer import (
    normalize_arabic,
    string_similarity,
    consonant_skeleton,
    tokenize,
    transliterate_ar_to_en,
    match_names_composite,
    strip_serial_suffix,
    strip_generic_noise,
)


def test_tashkeel_and_tatweel_removal():
    raw = "مَسْجِدُ الرَّحْمَـــــنِ"
    normalized = normalize_arabic(raw)
    assert "َ" not in normalized
    assert "ْ" not in normalized
    assert "ـ" not in normalized
    assert "الرحمن" in normalized


def test_alef_variants_unification():
    cases = ["أحمد", "إبراهيم", "آمنة", "ٱبن"]
    for word in cases:
        norm = normalize_arabic(word)
        assert norm.startswith("ا"), f"Failed for {word}: got {norm}"


def test_taa_marbuta_and_alif_maqsoora():
    assert normalize_arabic("روضة") == "روضه"
    assert normalize_arabic("مستشفى") == "مستشفي"
    assert normalize_arabic("فاطمة الكبرى") == "فاطمه الكبري"


def test_waw_and_yaa_hamza():
    assert "لولو" in normalize_arabic("لؤلؤة")
    assert normalize_arabic("شاطئ") == "شاطي"


def test_mosque_synonym_unification():
    # Both "مسجد النور" and "جامع النور" should normalize to matching key terms
    norm_masjid = normalize_arabic("مسجد النور")
    norm_jami = normalize_arabic("جامع النور")
    assert norm_masjid == norm_jami


def test_strip_al_prefix():
    assert normalize_arabic("المملكة", strip_al=True) == "مملكه"
    assert normalize_arabic("الرياض", strip_al=True) == "رياض"
    assert normalize_arabic("الشارقة", strip_al=True) == "شارقه"


def test_consonant_skeleton():
    skel = consonant_skeleton("الرياض")
    assert isinstance(skel, str)
    assert len(skel) > 0


def test_tokenize():
    tokens = tokenize("مسجد الملك عبد العزيز بالرياض")
    assert "مسجد" in tokens or "جامع" in tokens
    assert "الملك" in tokens or "ملك" in tokens


def test_transliterate_ar_to_en():
    trans = transliterate_ar_to_en("مسجد")
    assert isinstance(trans, str)
    assert len(trans) > 0


def test_string_similarity():
    assert string_similarity("جامع الراجحي", "جامع الراجحي") == 1.0
    sim = string_similarity("مسجد النور", "جامع النور")
    assert sim >= 0.95
    assert string_similarity("مستشفى الملك فهد", "جبل طويق") < 0.3


def test_strip_serial_suffix():
    assert strip_serial_suffix("جامع الرمال 1") == "جامع الرمال"
    assert strip_serial_suffix("مسجد السلام 2") == "مسجد السلام"
    assert strip_serial_suffix("جامع الفردوس ١٢") == "جامع الفردوس"
    assert strip_serial_suffix("مسجد النور") == "مسجد النور"


def test_strip_generic_noise():
    res = strip_generic_noise("مسجد الإيمان")
    assert "مسجد" not in res
    assert "ايمان" in res or "الإيمان" in res


def test_match_names_composite():
    score = match_names_composite("جامع الملك عبد العزيز", "King Abdulaziz Mosque", "مسجد الملك عبد العزيز", "King Abdulaziz Mosque")
    assert score >= 0.85

    score_low = match_names_composite("مستشفى", "Hospital", "مطار", "Airport")
    assert score_low < 0.40


def test_empty_and_none_handling():
    assert normalize_arabic("") == ""
    assert normalize_arabic(None) == ""
    assert string_similarity("", "abc") == 0.0
    assert string_similarity(None, None) == 0.0
    assert strip_serial_suffix("") == ""
    assert transliterate_ar_to_en("") == ""
