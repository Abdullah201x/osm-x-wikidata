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
        # Strip the article first so 'الجامع' / 'المسجد' are unified by the synonym step too
        if strip_al and clean_w.startswith('ال') and len(clean_w) > 3:
            clean_w = clean_w[2:]

        # Compare against already-normalized spellings (ى was mapped to ي above)
        if clean_w in ('جامع', 'مسجد'):
            clean_w = 'مسجد'
        elif clean_w in ('مستشفي', 'مشفي'):
            clean_w = 'مستشفي'
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
# Words are compared after normalization (ة -> ه, ى -> ي, 'ال' stripped, ...), so normalize the set too
GENERIC_NOISE_WORDS = {normalize_arabic(w, strip_al=True) for w in GENERIC_NOISE_WORDS}

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



RE_SERIAL_SUFFIX = re.compile(r'\s+[0-9٠-٩]+$')

def strip_serial_suffix(text: str) -> str:
    """Strips trailing serial/batch numbers like 'جامع الرمال 1' -> 'جامع الرمال'."""
    if not text:
        return ""
    return RE_SERIAL_SUFFIX.sub("", text).strip()

_AR_TO_LATIN = {
    'ا': 'a', 'أ': 'a', 'إ': 'i', 'آ': 'aa', 'ٱ': 'a',
    'ب': 'b', 'ت': 't', 'ث': 'th', 'ج': 'j', 'ح': 'h',
    'خ': 'kh', 'د': 'd', 'ذ': 'dh', 'ر': 'r', 'ز': 'z',
    'س': 's', 'ش': 'sh', 'ص': 's', 'ض': 'd', 'ط': 't',
    'ظ': 'z', 'ع': 'a', 'غ': 'gh', 'ف': 'f', 'ق': 'q',
    'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n', 'ه': 'h',
    'ة': 'h', 'و': 'w', 'ي': 'y', 'ى': 'a', 'ء': '',
    'ئ': 'y', 'ؤ': 'w'
}

def transliterate_ar_to_en(text: str) -> str:
    """Simple phonetic transliteration for cross-script name comparison."""
    if not text:
        return ""
    norm = normalize_arabic(strip_serial_suffix(text), strip_al=True)
    out = []
    for ch in norm:
        if ch in _AR_TO_LATIN:
            out.append(_AR_TO_LATIN[ch])
        elif ch.isascii():
            out.append(ch)
    res = "".join(out)
    return RE_MULTI_SPACE.sub(" ", res).strip().lower()

def consonant_skeleton(text: str) -> str:
    """Extracts consonant skeleton for Semitic root matching across Arabic/Latin."""
    if not text:
        return ""
    s = text.lower()
    # Strip common prefixes/suffixes
    s = re.sub(r'\b(al|el)[-\s]', '', s)
    s = re.sub(r'[-\s](al|el)\b', '', s)
    # Strip vowels, weak letters, spaces, and repeated consonants
    s = re.sub(r'[aeiouwy\s]', '', s)
    # Collapse consecutive duplicate consonants (e.g. mm -> m)
    return re.sub(r'(.)\1+', r'\1', s)

def match_names_composite(
    name1_ar: str, name1_en: str,
    name2_ar: str, name2_en: str
) -> float:
    """
    Computes name similarity considering Arabic, English, serial suffix stripping,
    and cross-script phonetic fallback. Returns a score between 0.0 and 1.0.
    """
    scores = []

    # 1. Arabic vs Arabic
    c1_ar = strip_serial_suffix(name1_ar)
    c2_ar = strip_serial_suffix(name2_ar)
    if c1_ar and c2_ar:
        scores.append(string_similarity(c1_ar, c2_ar))

    # 2. English vs English
    c1_en = strip_serial_suffix(name1_en).lower().strip()
    c2_en = strip_serial_suffix(name2_en).lower().strip()
    if c1_en and c2_en:
        w1 = set(re.findall(r'\b\w+\b', c1_en))
        w2 = set(re.findall(r'\b\w+\b', c2_en))
        if w1 and w2:
            inter = len(w1 & w2)
            union = len(w1 | w2)
            jaccard = inter / union if union > 0 else 0.0
            containment = max(inter / len(w1), inter / len(w2))
            scores.append(max(jaccard, containment * 0.9 if containment >= 0.75 else 0.0))

    # 3. Cross-script fallback: transliterate Arabic to English if one side lacks English or Arabic
    if not scores or max(scores) < 0.6:
        t1 = transliterate_ar_to_en(strip_generic_noise(name1_ar)) if name1_ar else strip_generic_noise(c1_en)
        t2 = transliterate_ar_to_en(strip_generic_noise(name2_ar)) if name2_ar else strip_generic_noise(c2_en)
        if t1 and t2:
            # First try word token overlap
            w1 = set(re.findall(r'\b\w+\b', t1))
            w2 = set(re.findall(r'\b\w+\b', t2))
            if w1 and w2:
                inter = len(w1 & w2)
                union = len(w1 | w2)
                if union > 0 and inter > 0:
                    scores.append((inter / union) * 0.85)
            # Consonant skeleton fallback
            sk1 = consonant_skeleton(t1)
            sk2 = consonant_skeleton(t2)
            if sk1 and sk2:
                if sk1 == sk2:
                    scores.append(0.82)
                elif len(sk1) >= 3 and len(sk2) >= 3 and (sk1 in sk2 or sk2 in sk1):
                    scores.append(0.72)

    return max(scores) if scores else 0.0
