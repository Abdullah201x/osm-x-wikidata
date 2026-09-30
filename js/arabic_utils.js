/**
 * Client-Side Arabic NLP Utilities and Fuzzy Search Helper.
 */

const ArabicUtils = {
  // Regex patterns
  reTashkeel: /[\u064B-\u065F\u0670]/g,
  reTatweel: /\u0640/g,
  rePunct: /[^\w\s\u0600-\u06FF]/g,

  /**
   * Normalizes Arabic text for search and comparison.
   */
  normalize(text, stripAl = false) {
    if (!text) return "";
    let s = String(text).trim();

    // Remove tashkeel & tatweel
    s = s.replace(this.reTashkeel, "").replace(this.reTatweel, "");

    // Unify character variants
    s = s.replace(/[أإآٱ]/g, "ا")
         .replace(/ة/g, "ه")
         .replace(/ى/g, "ي")
         .replace(/ؤ/g, "و")
         .replace(/ئ/g, "ي");

    const words = s.split(/\s+/);
    const result = [];
    for (let w of words) {
      let clean = w.replace(this.rePunct, "").toLowerCase();
      if (!clean) continue;

      // Mosque synonym normalization
      if (clean === "جامع" || clean === "مسجد") {
        clean = "مسجد";
      } else if (clean === "مستشفي" || clean === "مشفى") {
        clean = "مستشفى";
      }

      if (stripAl && clean.startsWith("ال") && clean.length > 3) {
        clean = clean.slice(2);
      }
      result.push(clean);
    }
    return result.join(" ");
  },

  // NSI-style Generic Noise Words for POIs & Brands
  genericWords: new Set([
    'فرع', 'محل', 'متجر', 'مكتب', 'صيدلية', 'محطة', 'سوبرماركت', 'تموينات', 'بقالة',
    'مركز', 'شركة', 'مؤسسة', 'بنك', 'صراف', 'جامع', 'مسجد', 'مستشفى', 'مستوصف',
    'فندق', 'شقق', 'حديقة', 'منتزه', 'مدرسة', 'جامعة', 'كلية', 'مطعم', 'كافيه',
    'مقهى', 'معرض', 'وكالة', 'مجمع', 'مول', 'اسواق', 'سوق',
    'branch', 'store', 'shop', 'office', 'pharmacy', 'station', 'supermarket',
    'grocery', 'center', 'centre', 'bank', 'atm', 'company', 'corp', 'hospital',
    'clinic', 'mosque', 'masjid', 'hotel', 'apartments', 'park', 'school',
    'university', 'restaurant', 'cafe', 'showroom', 'mall', 'market'
  ]),

  /**
   * Strips generic noise words leaving behind unique brand/entity stem (NSI stemmer style).
   */
  stripNoise(text) {
    if (!text) return "";
    const norm = this.normalize(text, true);
    const filtered = norm.split(/\s+/).filter(w => !this.genericWords.has(w));
    return filtered.length > 0 ? filtered.join(" ") : norm;
  },

  /**
   * Evaluates if an item matches the user query.
   * Matches against QID, Arabic name, and English name.
   */
  matchesQuery(item, rawQuery) {
    if (!rawQuery) return true;
    const q = rawQuery.trim().toLowerCase();
    if (!q) return true;

    // Direct QID search (e.g. "Q12345" or "12345")
    const qidStr = `Q${item[0]}`.toLowerCase();
    if (qidStr.includes(q) || String(item[0]) === q) {
      return true;
    }

    // English name search
    const nameEn = (item[6] || "").toLowerCase();
    if (nameEn.includes(q)) {
      return true;
    }

    // Arabic name search
    const nameAr = item[5] || "";
    if (nameAr.includes(rawQuery)) {
      return true;
    }

    const normItem = this.normalize(nameAr, true);
    const normQ = this.normalize(rawQuery, true);
    if (normItem.includes(normQ)) {
      return true;
    }

    return false;
  }
};

window.ArabicUtils = ArabicUtils;
