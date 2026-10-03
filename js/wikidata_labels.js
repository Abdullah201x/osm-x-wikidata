/**
 * Wikidata Class Label Resolver.
 * Turns P31 class QIDs (e.g. Q486972) into human-readable Arabic/English labels.
 * Labels are fetched on demand from the Wikidata API and cached in localStorage.
 */

const WikidataLabels = {
  STORAGE_KEY: "osm_wd_class_labels",
  API_URL: "https://www.wikidata.org/w/api.php",

  _cache: null,
  _pending: {},

  getCache() {
    if (this._cache) return this._cache;
    try {
      this._cache = JSON.parse(localStorage.getItem(this.STORAGE_KEY) || "{}");
    } catch (e) {
      this._cache = {};
    }
    return this._cache;
  },

  _saveCache() {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this._cache));
    } catch (e) {
      console.warn("Could not save class labels to localStorage:", e);
    }
  },

  /**
   * Returns the cached entry { ar, en, descAr, descEn } or null if not fetched yet.
   */
  get(qid) {
    return this.getCache()[qid] || null;
  },

  /**
   * Picks the label in the requested language, falling back to the other one.
   */
  label(entry, lang) {
    if (!entry) return "";
    return lang === "ar" ? (entry.ar || entry.en || "") : (entry.en || entry.ar || "");
  },

  description(entry, lang) {
    if (!entry) return "";
    return lang === "ar" ? (entry.descAr || entry.descEn || "") : (entry.descEn || entry.descAr || "");
  },

  /**
   * Fetches labels for a class QID (deduplicates concurrent requests).
   */
  fetch(qid) {
    const cached = this.get(qid);
    if (cached) return Promise.resolve(cached);
    if (this._pending[qid]) return this._pending[qid];

    const url = `${this.API_URL}?action=wbgetentities&ids=${encodeURIComponent(qid)}` +
      `&props=labels%7Cdescriptions&languages=ar%7Cen&format=json&origin=*`;

    this._pending[qid] = fetch(url)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        const ent = data.entities && data.entities[qid];
        if (!ent || ent.missing !== undefined) throw new Error(`Unknown entity ${qid}`);
        const entry = {
          ar: ent.labels?.ar?.value || "",
          en: ent.labels?.en?.value || "",
          descAr: ent.descriptions?.ar?.value || "",
          descEn: ent.descriptions?.en?.value || ""
        };
        this.getCache()[qid] = entry;
        this._saveCache();
        return entry;
      })
      .finally(() => {
        delete this._pending[qid];
      });

    return this._pending[qid];
  }
};

window.WikidataLabels = WikidataLabels;
