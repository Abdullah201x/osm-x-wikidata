/**
 * Wikidata Edit & Statement Creator.
 * Handles adding OpenStreetMap external ID statements (P402, P10689, P11693) to Wikidata items
 * via Wikibase Action API & REST API with MediaWiki OAuth 2.0 Bearer tokens,
 * EditGroups batch tracking, and optimistic local state management.
 */

const WikidataEdit = {
  // External ID property mappings
  PROPERTY_MAP: {
    relation: "P402",
    way: "P10689",
    node: "P11693"
  },

  // EditGroups session batch identifier (8 hex characters)
  _currentBatchId: null,

  getBatchId() {
    if (!this._currentBatchId) {
      const arr = new Uint8Array(4);
      window.crypto.getRandomValues(arr);
      this._currentBatchId = Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
    }
    return this._currentBatchId;
  },

  resetBatchId() {
    this._currentBatchId = null;
    return this.getBatchId();
  },

  /**
   * Fetches a CSRF token from MediaWiki API.
   */
  async getCsrfToken(accessToken = null) {
    const token = accessToken || await WikidataAuth.ensureAccessToken();
    if (!token) throw new Error("Not authenticated with Wikidata");

    const endpoints = WikidataAuth.getEndpoints();
    // crossorigin=1 (not origin=*) keeps the Bearer-authenticated session on CORS
    // requests; origin=* would silently make them anonymous.
    const url = `${endpoints.wikidataApi}?action=query&meta=tokens&type=csrf&format=json&crossorigin=1`;

    const res = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Api-User-Agent": "OSMxWikidataLinker/2.0 (https://wikidata.saudiosm.org)"
      }
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch CSRF token: HTTP ${res.status}`);
    }

    const data = await res.json();
    const csrfToken = data.query?.tokens?.csrftoken;
    if (!csrfToken || csrfToken === "+\\") {
      // "+\\" indicates anonymous user token on MediaWiki when Bearer token is rejected
      throw new Error("Invalid or anonymous CSRF token. Please log into Wikidata again.");
    }

    return csrfToken;
  },

  // Wikimedia asks write clients to back off when replication lag is high.
  MAXLAG_SECONDS: 5,
  MAX_ATTEMPTS: 4,
  MAX_RETRY_WAIT_SECONDS: 60,

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  /** Seconds to wait before retry: the server's Retry-After if sent, else 5s/10s/20s... */
  _retryDelayMs(res, attempt) {
    const header = parseInt(res.headers?.get?.("Retry-After") ?? "", 10);
    const seconds = Number.isFinite(header) && header > 0 ? header : Math.min(5 * 2 ** attempt, 30);
    return Math.min(seconds, this.MAX_RETRY_WAIT_SECONDS) * 1000;
  },

  /**
   * Action API request that waits and retries on `maxlag` errors and on
   * HTTP 429/503, honouring Retry-After. Resolves the parsed JSON body.
   */
  async _actionApiRequest(url, init) {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(url, init);
      const throttled = res.status === 429 || res.status === 503;
      const json = res.ok ? await res.json() : null;
      const lagged = json?.error?.code === "maxlag";

      if ((throttled || lagged) && attempt < this.MAX_ATTEMPTS - 1) {
        await this._sleep(this._retryDelayMs(res, attempt));
        continue;
      }
      if (throttled || lagged) {
        // Say which signal fired: "busy" alone can't tell lag from a rate limit or an edge 503.
        const detail = lagged
          ? `maxlag: ${json.error.info || "replication lag"}`
          : `HTTP ${res.status}${res.headers?.get?.("Retry-After") ? `, Retry-After ${res.headers.get("Retry-After")}s` : ""}`;
        const body = lagged ? "" : (await res.text().catch(() => "")).slice(0, 500);
        console.warn(`Wikidata write throttled (${detail})`, body);
        const err = new Error(`Wikidata is busy right now. Please try again in a minute. (${detail})`);
        err.busy = true;
        err.detail = detail;
        throw err;
      }
      if (!res.ok) throw new Error(`Wikidata API request failed: HTTP ${res.status}`);
      return json;
    }
  },

  PREVIEW_URL: "/api/v1/edits/preview",
  PREVIEW_MAX_ATTEMPTS: 3,

  /**
   * Asks the backend to dry-run the edit (zero writes). Retries on 429.
   * Throws if the backend is unreachable: the preview is a safety gate, so
   * we refuse to write blind rather than skip it.
   */
  async previewEdit(qid, osmType, osmId, property) {
    const body = JSON.stringify({ qid, property, osm_type: osmType, osm_id: Number(osmId) });

    for (let attempt = 0; ; attempt++) {
      let res;
      try {
        res = await fetch(this.PREVIEW_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body
        });
      } catch (e) {
        throw new Error("Could not run the pre-flight check (backend unreachable); nothing was written. Use QuickStatements as a fallback.");
      }

      if (res.status === 429 && attempt < this.PREVIEW_MAX_ATTEMPTS - 1) {
        await this._sleep(this._retryDelayMs(res, attempt));
        continue;
      }
      if (!res.ok) {
        throw new Error(`Pre-flight check failed (HTTP ${res.status}); nothing was written.`);
      }
      return res.json();
    }
  },

  // The backend only knows production Wikidata, so sandbox (test.wikidata.org)
  // QIDs would all read as missing; sandbox writes skip the preview.
  _previewApplies(endpoints) {
    return endpoints.wikidataBase === "https://www.wikidata.org";
  },

  /**
   * Adds an OpenStreetMap backlink statement to a Wikidata item.
   * Uses Action API wbcreateclaim with fallback to Wikibase REST API v1.
   * 
   * @param {string} qid - Wikidata entity ID (e.g. "Q12345")
   * @param {string} osmType - "node", "way", or "relation"
   * @param {string|number} osmId - OSM identifier
   * @param {string} [batchId] - Optional 8-char EditGroups batch hex
   * @param {Object} [options]
   * @param {number} [options.baserevid] - Revision the edit was prepared against
   * @returns {Promise<Object>} Result object
   */
  async addOsmBacklink(qid, osmType, osmId, batchId = null, options = {}) {
    const token = await WikidataAuth.ensureAccessToken();
    if (!token) {
      throw new Error("Not authenticated with Wikidata. Please sign in via the top bar.");
    }

    const cleanQid = qid.toUpperCase().trim();
    const type = osmType.toLowerCase().trim();
    const idStr = String(osmId).trim();
    const property = this.PROPERTY_MAP[type];

    if (!property) {
      throw new Error(`Unsupported OSM type: ${osmType}. Expected node, way, or relation.`);
    }

    const activeBatch = batchId || this.getBatchId();
    const summary = `Link OpenStreetMap ${type} ${idStr} (${property}) via OSMxWikidata GCC Linker ([[:toolforge:editgroups/b/CB/${activeBatch}|details]])`;
    const endpoints = WikidataAuth.getEndpoints();

    // 0. Pre-flight: dry-run on the backend before anything is written.
    let baserevid = options.baserevid;
    let warnings = [];
    if (this._previewApplies(endpoints)) {
      const preview = await this.previewEdit(cleanQid, type, idStr, property);
      warnings = preview.warnings || [];

      if (!preview.valid) {
        const err = new Error(warnings.join(" ") || `Edit rejected by pre-flight check (${preview.status}).`);
        err.previewStatus = preview.status;
        throw err;
      }
      if (preview.status === "already_linked") {
        this.markReverseResolved(`${type}${idStr}:${cleanQid}:missing_backlink`, {
          qid: cleanQid,
          osm_type: type,
          osm_id: idStr,
          property: property,
          action: "already_linked",
          resolved_at: Date.now()
        });
        return { success: true, skipped: true, method: "already_linked", warnings };
      }
      if (baserevid === undefined && preview.baserevid > 0) baserevid = preview.baserevid;
    }

    let lastError = null;

    // 1. Try Wikibase Action API: wbcreateclaim
    try {
      const csrfToken = await this.getCsrfToken(token);
      const fields = {
        action: "wbcreateclaim",
        format: "json",
        entity: cleanQid,
        property: property,
        snaktype: "value",
        value: JSON.stringify(idStr), // Wikibase requires string value JSON-encoded: "\"12345\""
        summary: summary,
        maxlag: String(this.MAXLAG_SECONDS),
        token: csrfToken
      };
      if (baserevid > 0) fields.baserevid = String(baserevid);

      // crossorigin must be in the URL (it is needed on the CORS preflight), not the body.
      const json = await this._actionApiRequest(`${endpoints.wikidataApi}?crossorigin=1`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Api-User-Agent": "OSMxWikidataLinker/2.0 (https://wikidata.saudiosm.org)",
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams(fields).toString()
      });

      if (json.error) {
        throw new Error(json.error.info || json.error.code || "Wikidata API returned error");
      }
      if (json.claim) {
        const editRecord = {
          id: json.claim.id,
          qid: cleanQid,
          property: property,
          osmType: type,
          osmId: idStr,
          batchId: activeBatch,
          timestamp: Date.now(),
          user: WikidataAuth.getUser()?.username || "You",
          url: `https://www.wikidata.org/wiki/${cleanQid}`
        };
        this.logHistory(editRecord);
        this.markReverseResolved(`${type}${idStr}:${cleanQid}:missing_backlink`, {
          qid: cleanQid,
          osm_type: type,
          osm_id: idStr,
          property: property,
          action: "wikidata_backlink",
          resolved_at: Date.now()
        });
        return { success: true, method: "wbcreateclaim", data: json, warnings };
      }
    } catch (err) {
      // The server asked us to slow down; a second write path would ignore that.
      if (err.busy) throw err;
      console.warn("wbcreateclaim attempt failed, trying REST API v1:", err);
      lastError = err;
    }

    // 2. Fallback to Wikibase REST API v1
    try {
      const restUrl = `${endpoints.wikidataRest}/entities/items/${cleanQid}/statements`;
      const payload = {
        statement: {
          property: { id: property },
          value: {
            type: "value",
            content: idStr
          }
        },
        comment: summary
      };

      const restRes = await fetch(restUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Api-User-Agent": "OSMxWikidataLinker/2.0 (https://wikidata.saudiosm.org)",
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (restRes.ok) {
        const restJson = await restRes.json();
        const editRecord = {
          id: restJson.id || `${cleanQid}$statement`,
          qid: cleanQid,
          property: property,
          osmType: type,
          osmId: idStr,
          batchId: activeBatch,
          timestamp: Date.now(),
          user: WikidataAuth.getUser()?.username || "You",
          url: `https://www.wikidata.org/wiki/${cleanQid}`
        };
        this.logHistory(editRecord);
        this.markReverseResolved(`${type}${idStr}:${cleanQid}:missing_backlink`, {
          qid: cleanQid,
          osm_type: type,
          osm_id: idStr,
          property: property,
          action: "wikidata_backlink",
          resolved_at: Date.now()
        });
        return { success: true, method: "rest_v1", data: restJson, warnings };
      } else {
        const errText = await restRes.text();
        throw new Error(`REST API failed: HTTP ${restRes.status} ${errText}`);
      }
    } catch (restErr) {
      console.error("Both wbcreateclaim and REST API failed:", restErr);
      throw lastError || restErr;
    }
  },

  /**
   * Executes a sequential batch of backlink edits up to max 25 items.
   * Enforces 600ms polite delay between requests.
   * 
   * @param {Array} items - Array of items to process
   * @param {Function} [onProgress] - Callback (current, total, successCount, errorCount, isCancelled)
   * @returns {Promise<Object>} Batch summary
   */
  async addBatchOsmBacklinks(items, onProgress = null) {
    if (!items || items.length === 0) {
      return { total: 0, successful: 0, failed: 0, batchId: null };
    }

    const batch = items.slice(0, 25); // Hard cap 25 items per batch
    const batchId = this.resetBatchId();
    let successful = 0;
    let failed = 0;
    let cancelled = false;

    for (let i = 0; i < batch.length; i++) {
      if (WikidataEdit._cancelBatchRequested) {
        cancelled = true;
        WikidataEdit._cancelBatchRequested = false;
        break;
      }

      const it = batch[i];
      const qid = it.qid || it.wikidata_qid;
      const type = it.osm_type;
      const id = it.osm_id;

      try {
        await this.addOsmBacklink(qid, type, id, batchId);
        successful++;
      } catch (e) {
        console.error(`Batch item failed (${qid}):`, e);
        failed++;
      }

      if (onProgress) {
        onProgress(i + 1, batch.length, successful, failed, cancelled);
      }

      // Polite 600ms delay between edits
      if (i < batch.length - 1) {
        await new Promise(r => setTimeout(r, 600));
      }
    }

    return {
      total: batch.length,
      successful,
      failed,
      cancelled,
      batchId
    };
  },

  cancelBatch() {
    this._cancelBatchRequested = true;
  },

  // -------------------------------------------------------------
  // Optimistic State Management (cross-reload persistence)
  // -------------------------------------------------------------

  getResolvedMap() {
    try {
      const raw = localStorage.getItem("osm_wd_resolved_reverse");
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  },

  isReverseResolved(itemKey) {
    const map = this.getResolvedMap();
    return !!map[itemKey];
  },

  markReverseResolved(itemKey, details) {
    const map = this.getResolvedMap();
    map[itemKey] = {
      ...details,
      resolved_at: Date.now()
    };
    try {
      localStorage.setItem("osm_wd_resolved_reverse", JSON.stringify(map));
    } catch (e) {
      console.warn("Could not save to localStorage:", e);
    }
  },

  unmarkReverseResolved(itemKey) {
    const map = this.getResolvedMap();
    if (map[itemKey]) {
      delete map[itemKey];
      localStorage.setItem("osm_wd_resolved_reverse", JSON.stringify(map));
    }
  },

  pruneOldResolved(pipelineUpdatedAt) {
    if (!pipelineUpdatedAt) return;
    const pipelineTime = new Date(pipelineUpdatedAt).getTime();
    if (isNaN(pipelineTime)) return;

    const map = this.getResolvedMap();
    let changed = false;
    for (const key of Object.keys(map)) {
      if (map[key].resolved_at && map[key].resolved_at < pipelineTime) {
        delete map[key];
        changed = true;
      }
    }
    if (changed) {
      localStorage.setItem("osm_wd_resolved_reverse", JSON.stringify(map));
    }
  },

  // -------------------------------------------------------------
  // Edit History Logging
  // -------------------------------------------------------------

  getEditHistory() {
    try {
      const raw = localStorage.getItem("osm_wd_wikidata_edit_history");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  logHistory(record) {
    const history = this.getEditHistory();
    history.unshift(record);
    // Cap at 300 entries
    const capped = history.slice(0, 300);
    try {
      localStorage.setItem("osm_wd_wikidata_edit_history", JSON.stringify(capped));
    } catch (e) {
      console.warn("Could not persist Wikidata edit history:", e);
    }
  }
};

window.WikidataEdit = WikidataEdit;
