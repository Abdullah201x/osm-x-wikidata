"""
High-Performance Arabic String Normalizer & Fuzzy Matcher.
Specialized for GCC geographic names, POIs, mosques, and settlements.
"""

import re
import unicodedata

# Tashkeel / Harakat regex
RE_TASHKEEL = re.compile(r'[\u064B-\u065F\u0670]')
# Tatweel / Kashida
RE_TATWEEL = re.compile(r'\u0640')
# Non-alphanumeric punctuation
RE_PUNCT = re.compile(r'[^\w\s\u0600-\u06FF]', re.UNICODE)
# Multiple whitespace
RE_MULTI_SPACE = re.compile(r'\s+')

def normalize_arabic(text: str, strip_al: bool = False) -> str:
    """
    Normalizes Arabic text:
    - Removes diacritics (tashkeel) and tatweel (kashida).
    - Unifies Alef variants (أ, إ, آ, ٱ -> ا).
    - Unifies Taa Marbuta (ة -> ه).
    - Unifies Alif Maqsoora (ى -> ي).
    - Optionally strips the definite article 'ال' from words.
    - Lowers ASCII letters for multilingual matching.
    """
    if not text:
        return ""

    s = str(text).strip()

    # Unicode NFKD normalization
    s = unicodedata.normalize('NFKD', s)

    # Remove tashkeel & tatweel
    s = RE_TASHKEEL.sub('', s)
    s = RE_TATWEEL.sub('', s)

    # Character unifications
    s = re.sub(r'[أإآٱ]', 'ا', s)
    s = re.sub(r'ة', 'ه', s)
    s = re.sub(r'ى', 'ي', s)
    s = re.sub(r'ؤ', 'و', s)
    s = re.sub(r'ئ', 'ي', s)

    # Normalize Mosque/Jami synonyms
    # "جامع" and "مسجد" are often interchangeable in GCC POI naming
    words = s.split()
    normalized_words = []
    for w in words:
        # Strip punctuation
        clean_w = RE_PUNCT.sub('', w).lower()
        if not clean_w:
            continue
        if clean_w in ('جامع', 'مسجد'):
            clean_w = 'مسجد'
        elif clean_w in ('مستشفي', 'مشفى'):
            clean_w = 'مستشفى'
        
        if strip_al and clean_w.startswith('ال') and len(clean_w) > 3:
            clean_w = clean_w[2:]
        normalized_words.append(clean_w)

    return ' '.join(normalized_words)

# Generic Noise Words (Arabic & English) inspired by NSI (Name Suggestion Index)
# Used to avoid false positive candidate matches on generic terms (e.g. "فرع" or "branch")
GENERIC_NOISE_WORDS = {
    # Arabic POI & Business noise terms
    'فرع', 'محل', 'متجر', 'مكتب', 'صيدلية', 'محطة', 'سوبرماركت', 'تموينات', 'بقالة',
    'مركز', 'شركة', 'مؤسسة', 'بنك', 'صراف', 'جامع', 'مسجد', 'مستشفى', 'مستوصف',
    'فندق', 'شقق', 'حديقة', 'منتزه', 'مدرسة', 'جامعة', 'كلية', 'مطعم', 'كافيه',
    'مقهى', 'معرض', 'وكالة', 'مجمع', 'مول', 'اسواق', 'سوق',
    # English POI & Business noise terms
    'branch', 'store', 'shop', 'office', 'pharmacy', 'station', 'supermarket',
    'grocery', 'center', 'centre', 'bank', 'atm', 'company', 'corp', 'hospital',
    'clinic', 'mosque', 'masjid', 'hotel', 'apartments', 'park', 'school',
    'university', 'restaurant', 'cafe', 'showroom', 'mall', 'market'
}

def strip_generic_noise(text: str) -> str:
    """
    Removes generic noise words (e.g. 'فرع', 'محل', 'branch', 'store')
    leaving behind the unique brand or entity name, equivalent to NSI's stemmer.
    """
    if not text:
        return ""
    norm = normalize_arabic(text, strip_al=True)
    words = norm.split()
    filtered = [w for w in words if w.lower() not in GENERIC_NOISE_WORDS]
    # If stripping removed everything (e.g. the entire name was "مسجد"), fall back to original normalized
    return ' '.join(filtered) if filtered else norm

def tokenize(text: str, remove_noise: bool = False) -> set:
    """Returns a set of normalized Arabic tokens with 'ال' stripped, optionally removing noise words."""
    norm = strip_generic_noise(text) if remove_noise else normalize_arabic(text, strip_al=True)
    return set(norm.split())

def string_similarity(s1: str, s2: str) -> float:
    """
    Calculates composite similarity between two strings:
    - Exact normalized match = 1.0
    - Exact de-noised match (NSI stemmer style) = 0.95
    - Token Jaccard overlap & containment
    """
    if not s1 or not s2:
        return 0.0

    n1 = normalize_arabic(s1, strip_al=False)
    n2 = normalize_arabic(s2, strip_al=False)

    if n1 == n2:
        return 1.0

    # Try with 'ال' stripped
    n1_no_al = normalize_arabic(s1, strip_al=True)
    n2_no_al = normalize_arabic(s2, strip_al=True)
    if n1_no_al == n2_no_al:
        return 0.95

    # NSI Stemmer Style: Compare with generic noise words stripped
    denoised1 = strip_generic_noise(s1)
    denoised2 = strip_generic_noise(s2)
    if denoised1 and denoised2 and denoised1 == denoised2:
        return 0.93

    # Token overlap without noise
    t1_clean = set(denoised1.split())
    t2_clean = set(denoised2.split())

    if t1_clean and t2_clean:
        clean_intersect = len(t1_clean & t2_clean)
        clean_union = len(t1_clean | t2_clean)
        clean_jaccard = clean_intersect / clean_union if clean_union > 0 else 0.0
        clean_containment = max(clean_intersect / len(t1_clean), clean_intersect / len(t2_clean))
        if clean_jaccard >= 0.6 or clean_containment >= 0.8:
            return max(clean_jaccard, clean_containment * 0.9)

    # Standard token overlap fallback
    t1 = set(n1_no_al.split())
    t2 = set(n2_no_al.split())

    if not t1 or not t2:
        return 0.0

    intersection = len(t1 & t2)
    union = len(t1 | t2)
    jaccard = intersection / union if union > 0 else 0.0

    # If one string is a subset of the other
    containment = max(intersection / len(t1), intersection / len(t2)) if t1 and t2 else 0.0

    # Blended score
    return max(jaccard, containment * 0.85)

