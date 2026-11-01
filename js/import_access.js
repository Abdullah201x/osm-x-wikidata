/**
 * Import gate for OSM x Wikidata GCC Linker.
 *
 * Creating OSM features from Wikidata (imports) is only allowed for OSM users the maintainer
 * has approved. Anonymous and non-approved visitors therefore get the "linkable" datasets
 * (candidates + already-linked items) and none of the new-node tooling.
 *
 * Who is approved is decided by the backend (/api/v1/me checks the OSM token against
 * OSMWD_IMPORT_ALLOWLIST). The answer lives in memory only, never in localStorage, so it
 * cannot be granted by editing browser storage. The raw data/<cc>.json files stay public
 * because Manara consumes data/sa.json; this gate controls the app's UI and what it loads.
 */

const ImportAccess = {
  _canImport: false,

  canImport() {
    return this._canImport;
  },

  /** Dataset file for the current access level (same envelope and tuple layout either way). */
  datasetUrl(cc) {
    return this._canImport ? `data/${cc}.json` : `data/${cc}_linkable.json`;
  },

  reset() {
    this._canImport = false;
  },

  /** Asks the backend whether the logged-in OSM user may import. Fails closed. */
  async check() {
    this._canImport = false;
    // Sandbox (dev server) accounts have different ids; only production OSM identities count.
    if (typeof OsmAuth === "undefined" || !OsmAuth.isLoggedIn() || OsmAuth.ENVIRONMENT === "dev") {
      return false;
    }
    try {
      const res = await fetch("/api/v1/me", {
        headers: { Authorization: `Bearer ${localStorage.getItem("osm_access_token")}` },
      });
      if (res.ok) {
        const body = await res.json();
        this._canImport = body.can_import === true;
      }
    } catch (e) {
      console.warn("Could not verify import access:", e);
    }
    return this._canImport;
  },

  /** Shows or hides everything that exists only for importers. */
  applyUI() {
    const allowed = this._canImport;
    const forward = window.currentMode !== "reverse";
    document.querySelectorAll("[data-import-only]").forEach((el) => {
      el.hidden = !allowed;
    });
    // In reverse mode the same stat card shows "missing back-links", which is open to everyone.
    const missingCard = document.getElementById("stat-missing-card");
    if (missingCard) missingCard.hidden = !allowed && forward;
    const note = document.getElementById("import-restricted-note");
    if (note) note.hidden = allowed || !forward;
  },
};
