/**
 * OpenStreetMap OAuth 2.0 (PKCE) Client & OSM Notes API.
 * Adapted from user's GCC20260707 implementation.
 */

const OsmAuth = {
  CLIENT_ID: "66V3GYmV7X9ZP9zIimXwk1Pi-R2YWBLz2peCFLjcImE",
  ENVIRONMENT: localStorage.getItem("osm_oauth_environment") || "production",
  NOTE_SIGNATURE: "via أداة ربط OSM و Wikidata (https://abdullah201x.github.io/osm-x-wikidata) #osm-wikidata-gcc",

  getUrls() {
    const isDev = this.ENVIRONMENT === "dev";
    const base = isDev ? "https://master.apis.dev.openstreetmap.org" : "https://www.openstreetmap.org";
    const apiBase = isDev ? "https://master.apis.dev.openstreetmap.org" : "https://api.openstreetmap.org";
    return {
      authUrl: `${base}/oauth2/authorize`,
      tokenUrl: `${base}/oauth2/token`,
      userDetailsUrl: `${apiBase}/api/0.6/user/details.json`,
      notesUrl: `${apiBase}/api/0.6/notes.json`,
      apiBase: apiBase
    };
  },

  getRedirectUri() {
    let uri = window.location.origin + window.location.pathname;
    uri = uri.replace(/\/index\.html$/, "");
    if (!uri.endsWith("/")) {
      uri += "/";
    }
    return uri;
  },

  generateRandomString(length = 64) {
    const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
    const randomValues = new Uint8Array(length);
    window.crypto.getRandomValues(randomValues);
    return Array.from(randomValues).map(val => charset[val % charset.length]).join("");
  },

  async generateChallenge(verifier) {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await window.crypto.subtle.digest("SHA-256", data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  },

  async startLogin(clientId = null) {
    if (clientId) {
      this.CLIENT_ID = clientId;
    } else {
      this.CLIENT_ID = "66V3GYmV7X9ZP9zIimXwk1Pi-R2YWBLz2peCFLjcImE";
    }
    localStorage.setItem("osm_oauth_client_id", this.CLIENT_ID);

    const codeVerifier = this.generateRandomString();
    sessionStorage.setItem("osm_oauth_code_verifier", codeVerifier);

    const state = this.generateRandomString(32);
    sessionStorage.setItem("osm_oauth_state", state);

    const challenge = await this.generateChallenge(codeVerifier);
    const urls = this.getUrls();

    const authUrl = `${urls.authUrl}?response_type=code` +
      `&client_id=${encodeURIComponent(this.CLIENT_ID)}` +
      `&redirect_uri=${encodeURIComponent(this.getRedirectUri())}` +
      `&scope=${encodeURIComponent("read_prefs write_notes write_api")}` +
      `&code_challenge=${challenge}` +
      `&code_challenge_method=S256` +
      `&state=${state}`;

    window.location.href = authUrl;
  },

  async handleCallback() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");

    if (!code) return false;

    const savedState = sessionStorage.getItem("osm_oauth_state");
    const codeVerifier = sessionStorage.getItem("osm_oauth_code_verifier");

    sessionStorage.removeItem("osm_oauth_state");
    sessionStorage.removeItem("osm_oauth_code_verifier");

    // Clean address bar URL
    const cleanUrl = window.location.origin + window.location.pathname + window.location.hash;
    window.history.replaceState({}, document.title, cleanUrl);

    if (state !== savedState || !codeVerifier) {
      console.warn("OAuth state mismatch or missing verifier.");
      return false;
    }

    try {
      const urls = this.getUrls();
      const body = new URLSearchParams({
        grant_type: "authorization_code",
        code: code,
        redirect_uri: this.getRedirectUri(),
        client_id: this.CLIENT_ID,
        code_verifier: codeVerifier
      });

      const response = await fetch(urls.tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body
      });

      if (!response.ok) throw new Error("Failed to exchange code for token");

      const tokenData = await response.json();
      localStorage.setItem("osm_access_token", tokenData.access_token);
      localStorage.setItem("osm_token_scope", tokenData.scope || "");

      await this.fetchUserDetails();
      return true;
    } catch (e) {
      console.error("OAuth exchange failed:", e);
      return false;
    }
  },

  async fetchUserDetails() {
    const token = localStorage.getItem("osm_access_token");
    if (!token) return null;

    try {
      const urls = this.getUrls();
      const res = await fetch(urls.userDetailsUrl, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const user = data.user;
        localStorage.setItem("osm_user_name", user.display_name);
        return user;
      }
    } catch (e) {
      console.error("Failed to fetch OSM user details:", e);
    }
    return null;
  },

  getUserName() {
    return localStorage.getItem("osm_user_name");
  },

  logout() {
    localStorage.removeItem("osm_access_token");
    localStorage.removeItem("osm_token_scope");
    localStorage.removeItem("osm_user_name");
  },

  isLoggedIn() {
    return !!localStorage.getItem("osm_access_token");
  },

  getChangesetUrl(changesetId) {
    const isDev = this.ENVIRONMENT === "dev";
    const base = isDev ? "https://master.apis.dev.openstreetmap.org" : "https://www.openstreetmap.org";
    return `${base}/changeset/${changesetId}`;
  },

  parseOsmRef(osmRef) {
    if (!osmRef) return null;
    const str = String(osmRef).trim();
    if (str.startsWith("n")) return { type: "node", id: str.slice(1) };
    if (str.startsWith("w")) return { type: "way", id: str.slice(1) };
    if (str.startsWith("r")) return { type: "relation", id: str.slice(1) };
    if (str.includes("/")) {
      const parts = str.split("/");
      let t = parts[0].toLowerCase();
      if (t === "n" || t === "node") t = "node";
      else if (t === "w" || t === "way") t = "way";
      else if (t === "r" || t === "relation") t = "relation";
      return { type: t, id: parts[1] };
    }
    if (/^\d+$/.test(str)) {
      return { type: "node", id: str };
    }
    return null;
  },

  _escapeXml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/'/g, "&apos;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  },

  getCountryName(countryCode) {
    const code = (countryCode || "").toLowerCase();
    const map = {
      sa: "Saudi Arabia",
      ae: "United Arab Emirates",
      kw: "Kuwait",
      qa: "Qatar",
      om: "Oman",
      bh: "Bahrain"
    };
    return map[code] || "GCC";
  },

  /**
   * Generates a descriptive, community-compliant changeset comment.
   */
  generateChangesetComment(items, countryCode = "") {
    const list = Array.isArray(items) ? items : [items];
    const country = this.getCountryName(countryCode);
    const count = list.length;

    if (count === 1) {
      const it = list[0];
      const nameAr = it.nameAr || "";
      const nameEn = it.nameEn || "";
      let name = "";
      if (nameAr && nameEn && nameAr !== nameEn) {
        name = `${nameAr} (${nameEn})`;
      } else {
        name = nameAr || nameEn || it.name || it.displayName || it.qid;
      }
      const ref = it.osmRef ? ` on ${it.osmRef}` : "";
      const cleanQid = it.qid.startsWith("Q") ? it.qid : `Q${it.qid}`;
      return `Link "${name}" to Wikidata ${cleanQid}${ref} in ${country} #osm-wikidata-gcc`;
    }

    // Batch comment
    const sampleNames = list
      .slice(0, 3)
      .map(i => i.nameAr || i.nameEn || i.name || i.qid)
      .filter(Boolean);

    if (count <= 3) {
      const namesStr = sampleNames.map(n => `"${n}"`).join(", ");
      return `Link ${count} features (${namesStr}) to Wikidata in ${country} #osm-wikidata-gcc`;
    } else {
      const remaining = count - sampleNames.length;
      return `Link ${count} features (${sampleNames.join(", ")}, +${remaining} more) to Wikidata in ${country} #osm-wikidata-gcc`;
    }
  },

  /**
   * Persistent Changeset History Manager (Stored in LocalStorage)
   */
  getChangesetHistory() {
    try {
      const data = localStorage.getItem("osm_wd_changeset_history");
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.warn("Error reading changeset history:", e);
      return [];
    }
  },

  saveChangesetRecord(record) {
    try {
      const history = this.getChangesetHistory();
      // Add new record at the top
      history.unshift({
        ...record,
        timestamp: record.timestamp || Date.now()
      });
      // Cap at 300 recent changesets
      if (history.length > 300) {
        history.length = 300;
      }
      localStorage.setItem("osm_wd_changeset_history", JSON.stringify(history));
      // Dispatch custom event for real-time UI synchronization
      window.dispatchEvent(new CustomEvent("osm-history-updated", { detail: record }));
      return true;
    } catch (e) {
      console.error("Failed to save changeset record:", e);
      return false;
    }
  },

  clearChangesetHistory() {
    localStorage.removeItem("osm_wd_changeset_history");
    window.dispatchEvent(new CustomEvent("osm-history-updated", { detail: null }));
  },

  exportHistoryCsv() {
    const history = this.getChangesetHistory();
    if (!history || history.length === 0) {
      alert("No changesets recorded in history to export.");
      return;
    }

    const rows = [
      ["Changeset ID", "Changeset URL", "Date & Time", "OSM User", "Type", "Country", "Comment", "Item Name", "Wikidata QID", "OSM Ref", "OSM URL", "New Version", "Status"]
    ];

    for (let cs of history) {
      const dateStr = new Date(cs.timestamp).toISOString();
      const typeStr = cs.isBatch ? `Batch (${cs.itemCount})` : "Single";
      for (let item of (cs.items || [])) {
        rows.push([
          cs.changesetId,
          cs.changesetUrl,
          dateStr,
          cs.user || "",
          typeStr,
          cs.country || "",
          cs.comment || "",
          item.name || item.nameAr || item.nameEn || "",
          item.qid || "",
          item.osmRef || "",
          item.osmRef ? `https://www.openstreetmap.org/${this.parseOsmRef(item.osmRef)?.type || 'node'}/${this.parseOsmRef(item.osmRef)?.id || ''}` : "",
          item.version || "",
          item.status || "success"
        ]);
      }
    }

    const csvContent = "\uFEFF" + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `osm_wikidata_changeset_history_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },

  exportHistoryJson() {
    const history = this.getChangesetHistory();
    const blob = new Blob([JSON.stringify(history, null, 2)], { type: "application/json;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `osm_wikidata_changeset_history_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },

  /**
   * Links a Wikidata QID to an existing OSM element directly via OSM API 0.6.
   * Creates an assisted changeset, updates the element with wikidata=Q..., and closes the changeset.
   */
  async linkOsmElement(osmRef, qid, extraTags = {}, customComment = "", featureName = "", countryCode = "") {
    const token = localStorage.getItem("osm_access_token");
    if (!token) {
      throw new Error("NOT_AUTHENTICATED");
    }

    const ref = this.parseOsmRef(osmRef);
    if (!ref) {
      throw new Error(`Invalid OSM Reference: "${osmRef}"`);
    }

    const urls = this.getUrls();
    const cleanQid = qid.startsWith("Q") ? qid : `Q${qid}`;

    // 1. Fetch current element XML
    const elemUrl = `${urls.apiBase}/api/0.6/${ref.type}/${ref.id}`;
    const elemRes = await fetch(elemUrl);
    if (!elemRes.ok) {
      if (elemRes.status === 404 || elemRes.status === 410) {
        throw new Error(`Element ${ref.type}/${ref.id} was not found on OSM or has been deleted.`);
      }
      throw new Error(`Failed to fetch ${ref.type}/${ref.id}: HTTP ${elemRes.status}`);
    }

    const elemXmlText = await elemRes.text();
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(elemXmlText, "application/xml");
    const elemNode = xmlDoc.querySelector(`${ref.type}`);
    if (!elemNode) {
      throw new Error(`Failed to parse XML response for ${ref.type}/${ref.id}`);
    }

    // 2. Check existing wikidata tag
    let existingWdTag = elemNode.querySelector('tag[k="wikidata"]');
    if (existingWdTag && existingWdTag.getAttribute("v") === cleanQid) {
      return {
        success: true,
        alreadyLinked: true,
        type: ref.type,
        id: ref.id,
        changesetId: null
      };
    }

    // Add or update wikidata tag
    if (existingWdTag) {
      existingWdTag.setAttribute("v", cleanQid);
    } else {
      const newTag = xmlDoc.createElement("tag");
      newTag.setAttribute("k", "wikidata");
      newTag.setAttribute("v", cleanQid);
      elemNode.appendChild(newTag);
    }

    // Optional: Add wikipedia tag if provided and not already on the object
    if (extraTags && extraTags.wikipedia) {
      let existingWikiTag = elemNode.querySelector('tag[k="wikipedia"]');
      if (!existingWikiTag) {
        const newWiki = xmlDoc.createElement("tag");
        newWiki.setAttribute("k", "wikipedia");
        newWiki.setAttribute("v", extraTags.wikipedia);
        elemNode.appendChild(newWiki);
      }
    }

    // 3. Open a Changeset with Improved Comment & Tags
    const defaultComment = this.generateChangesetComment({
      qid: cleanQid,
      osmRef: `${ref.type}/${ref.id}`,
      name: featureName
    }, countryCode);

    const comment = (customComment || defaultComment).trim();

    const changesetXml = `<?xml version="1.0" encoding="UTF-8"?>
<osm version="0.6" generator="OSM x Wikidata GCC Linker">
  <changeset>
    <tag k="created_by" v="OSM x Wikidata GCC Linker (https://abdullah201x.github.io/osm-x-wikidata)"/>
    <tag k="comment" v="${this._escapeXml(comment)}"/>
    <tag k="source" v="Wikidata; OpenStreetMap"/>
    <tag k="wikidata" v="${this._escapeXml(cleanQid)}"/>
    <tag k="conflation" v="assisted_wikidata"/>
    <tag k="hashtags" v="#osm-wikidata-gcc"/>
  </changeset>
</osm>`;

    const csRes = await fetch(`${urls.apiBase}/api/0.6/changeset/create`, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/xml; charset=utf-8"
      },
      body: changesetXml
    });

    if (!csRes.ok) {
      const errText = await csRes.text();
      if (csRes.status === 401 || csRes.status === 403) {
        throw new Error("AUTH_EXPIRED");
      }
      throw new Error(`Failed to open changeset (HTTP ${csRes.status}): ${errText}`);
    }

    const changesetId = (await csRes.text()).trim();

    // 4. Update the element with the changeset ID
    elemNode.setAttribute("changeset", changesetId);

    const serializer = new XMLSerializer();
    const updatedElemXml = `<?xml version="1.0" encoding="UTF-8"?>
<osm version="0.6" generator="OSM x Wikidata GCC Linker">
${serializer.serializeToString(elemNode)}
</osm>`;

    let newVersion = null;

    try {
      const updateRes = await fetch(`${urls.apiBase}/api/0.6/${ref.type}/${ref.id}`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/xml; charset=utf-8"
        },
        body: updatedElemXml
      });

      if (!updateRes.ok) {
        const errText = await updateRes.text();
        throw new Error(`Failed to update ${ref.type}/${ref.id} (HTTP ${updateRes.status}): ${errText}`);
      }

      newVersion = (await updateRes.text()).trim();
    } finally {
      // 5. Always close the changeset cleanly
      try {
        await fetch(`${urls.apiBase}/api/0.6/changeset/${changesetId}/close`, {
          method: "PUT",
          headers: { "Authorization": `Bearer ${token}` }
        });
      } catch (closeErr) {
        console.warn("Failed to close changeset cleanly:", closeErr);
      }
    }

    const changesetUrl = this.getChangesetUrl(changesetId);

    // Save record to persistent history
    this.saveChangesetRecord({
      changesetId: changesetId,
      changesetUrl: changesetUrl,
      timestamp: Date.now(),
      user: this.getUserName() || "OSM User",
      isBatch: false,
      itemCount: 1,
      comment: comment,
      country: countryCode || "gcc",
      items: [
        {
          name: featureName || `${ref.type}/${ref.id}`,
          qid: cleanQid,
          osmRef: `${ref.type}/${ref.id}`,
          version: newVersion,
          status: "success"
        }
      ]
    });

    return {
      success: true,
      changesetId: changesetId,
      version: newVersion,
      type: ref.type,
      id: ref.id,
      url: `https://www.openstreetmap.org/${ref.type}/${ref.id}`,
      changesetUrl: changesetUrl
    };
  },

  /**
   * Links MULTIPLE items within a SINGLE OSM Changeset.
   * Fully conformant with OSM API 0.6 and community batch guidelines.
   *
   * @param {Array} itemsList - Array of { osmRef, qid, nameAr, nameEn, extraTags, country }
   * @param {string} customComment - User provided or edited changeset comment
   * @param {string} countryCode - Active country code
   * @param {Function} onProgress - Callback for real-time progress ({ current, total, item, message })
   */
  async linkOsmElementsBatch(itemsList, customComment = "", countryCode = "", onProgress = null) {
    const token = localStorage.getItem("osm_access_token");
    if (!token) {
      throw new Error("NOT_AUTHENTICATED");
    }

    if (!itemsList || itemsList.length === 0) {
      throw new Error("No items provided for batch linking.");
    }

    const urls = this.getUrls();

    // 1. Generate comprehensive changeset comment
    const defaultComment = this.generateChangesetComment(itemsList, countryCode);
    const comment = (customComment || defaultComment).trim();

    // Collect unique QIDs for changeset tags (up to 20 for tag length safety)
    const uniqueQids = Array.from(new Set(itemsList.map(i => (i.qid.startsWith("Q") ? i.qid : `Q${i.qid}`)))).slice(0, 20).join(", ");

    // 2. Open ONE Changeset for all items
    const changesetXml = `<?xml version="1.0" encoding="UTF-8"?>
<osm version="0.6" generator="OSM x Wikidata GCC Linker">
  <changeset>
    <tag k="created_by" v="OSM x Wikidata GCC Linker (https://abdullah201x.github.io/osm-x-wikidata)"/>
    <tag k="comment" v="${this._escapeXml(comment)}"/>
    <tag k="source" v="Wikidata; OpenStreetMap"/>
    <tag k="wikidata" v="${this._escapeXml(uniqueQids)}"/>
    <tag k="conflation" v="assisted_wikidata"/>
    <tag k="hashtags" v="#osm-wikidata-gcc"/>
  </changeset>
</osm>`;

    if (onProgress) {
      onProgress({ current: 0, total: itemsList.length, status: "opening_changeset", message: "Opening OSM Changeset..." });
    }

    const csRes = await fetch(`${urls.apiBase}/api/0.6/changeset/create`, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/xml; charset=utf-8"
      },
      body: changesetXml
    });

    if (!csRes.ok) {
      const errText = await csRes.text();
      if (csRes.status === 401 || csRes.status === 403) {
        throw new Error("AUTH_EXPIRED");
      }
      throw new Error(`Failed to open changeset (HTTP ${csRes.status}): ${errText}`);
    }

    const changesetId = (await csRes.text()).trim();
    const changesetUrl = this.getChangesetUrl(changesetId);

    const results = [];
    const serializer = new XMLSerializer();
    const parser = new DOMParser();

    try {
      // 3. Sequentially update each item in the SAME changeset
      for (let i = 0; i < itemsList.length; i++) {
        const item = itemsList[i];
        const ref = this.parseOsmRef(item.osmRef);
        const cleanQid = item.qid.startsWith("Q") ? item.qid : `Q${item.qid}`;
        const displayName = item.nameAr || item.nameEn || item.name || item.displayName || cleanQid;

        if (onProgress) {
          onProgress({
            current: i + 1,
            total: itemsList.length,
            item: item,
            status: "updating_item",
            message: `Updating ${i + 1}/${itemsList.length}: ${displayName} (${item.osmRef})...`
          });
        }

        if (!ref) {
          results.push({
            item,
            success: false,
            error: `Invalid OSM ref: ${item.osmRef}`
          });
          continue;
        }

        try {
          // Fetch element XML
          const elemUrl = `${urls.apiBase}/api/0.6/${ref.type}/${ref.id}`;
          const elemRes = await fetch(elemUrl);
          if (!elemRes.ok) {
            throw new Error(`HTTP ${elemRes.status}`);
          }

          const elemXmlText = await elemRes.text();
          const xmlDoc = parser.parseFromString(elemXmlText, "application/xml");
          const elemNode = xmlDoc.querySelector(`${ref.type}`);
          if (!elemNode) {
            throw new Error(`Failed to parse XML for ${ref.type}/${ref.id}`);
          }

          // Check if already has matching wikidata
          let existingWdTag = elemNode.querySelector('tag[k="wikidata"]');
          if (existingWdTag && existingWdTag.getAttribute("v") === cleanQid) {
            results.push({
              item,
              success: true,
              alreadyLinked: true,
              version: elemNode.getAttribute("version"),
              osmRef: item.osmRef,
              qid: cleanQid,
              name: displayName
            });
            continue;
          }

          if (existingWdTag) {
            existingWdTag.setAttribute("v", cleanQid);
          } else {
            const newTag = xmlDoc.createElement("tag");
            newTag.setAttribute("k", "wikidata");
            newTag.setAttribute("v", cleanQid);
            elemNode.appendChild(newTag);
          }

          // Add wikipedia tag if provided
          if (item.extraTags && item.extraTags.wikipedia) {
            let existingWikiTag = elemNode.querySelector('tag[k="wikipedia"]');
            if (!existingWikiTag) {
              const newWiki = xmlDoc.createElement("tag");
              newWiki.setAttribute("k", "wikipedia");
              newWiki.setAttribute("v", item.extraTags.wikipedia);
              elemNode.appendChild(newWiki);
            }
          }

          // Set element to this changeset ID
          elemNode.setAttribute("changeset", changesetId);

          const updatedXml = `<?xml version="1.0" encoding="UTF-8"?>
<osm version="0.6" generator="OSM x Wikidata GCC Linker">
${serializer.serializeToString(elemNode)}
</osm>`;

          const updateRes = await fetch(`${urls.apiBase}/api/0.6/${ref.type}/${ref.id}`, {
            method: "PUT",
            headers: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/xml; charset=utf-8"
            },
            body: updatedXml
          });

          if (!updateRes.ok) {
            const errText = await updateRes.text();
            throw new Error(`HTTP ${updateRes.status}: ${errText}`);
          }

          const newVersion = (await updateRes.text()).trim();

          // Mark verified locally
          LiveVerifier.markVerifiedLocally(cleanQid, item.osmRef, displayName);

          results.push({
            item,
            success: true,
            version: newVersion,
            osmRef: item.osmRef,
            qid: cleanQid,
            name: displayName
          });

          // Polite pause between requests (120ms)
          if (i < itemsList.length - 1) {
            await new Promise(r => setTimeout(r, 120));
          }
        } catch (itemErr) {
          console.error(`Error updating item ${item.osmRef}:`, itemErr);
          results.push({
            item,
            success: false,
            osmRef: item.osmRef,
            qid: cleanQid,
            name: displayName,
            error: itemErr.message
          });
        }
      }
    } finally {
      // 4. Always close the changeset cleanly
      if (onProgress) {
        onProgress({
          current: itemsList.length,
          total: itemsList.length,
          status: "closing_changeset",
          message: "Closing OSM Changeset..."
        });
      }

      try {
        await fetch(`${urls.apiBase}/api/0.6/changeset/${changesetId}/close`, {
          method: "PUT",
          headers: { "Authorization": `Bearer ${token}` }
        });
      } catch (closeErr) {
        console.warn("Failed to close changeset cleanly:", closeErr);
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    // 5. Save to Persistent History
    const historyRecord = {
      changesetId: changesetId,
      changesetUrl: changesetUrl,
      timestamp: Date.now(),
      user: this.getUserName() || "OSM User",
      isBatch: true,
      itemCount: itemsList.length,
      successCount: successCount,
      failCount: failCount,
      comment: comment,
      country: countryCode || "gcc",
      items: results.map(r => ({
        name: r.name || r.item?.nameAr || r.item?.nameEn || r.item?.qid,
        qid: r.qid || r.item?.qid,
        osmRef: r.osmRef || r.item?.osmRef,
        version: r.version || null,
        status: r.success ? (r.alreadyLinked ? "already_linked" : "success") : "error",
        error: r.error || null,
        lat: r.item?.lat,
        lon: r.item?.lon
      }))
    };

    this.saveChangesetRecord(historyRecord);

    return {
      success: true,
      changesetId: changesetId,
      changesetUrl: changesetUrl,
      results: results,
      total: itemsList.length,
      successCount: successCount,
      failCount: failCount,
      comment: comment
    };
  },

  /**
   * Submits an OSM Note (either authenticated or anonymously).
   */
  async submitNote(lat, lon, text) {
    const urls = this.getUrls();
    const token = localStorage.getItem("osm_access_token");
    const fullText = `${text.trim()}\n\n${this.NOTE_SIGNATURE}`;

    const headers = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const url = `${urls.notesUrl}?lat=${lat}&lon=${lon}&text=${encodeURIComponent(fullText)}`;
    const res = await fetch(url, { method: "POST", headers });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    }
    return await res.json();
  }
};

if (typeof window !== "undefined") {
  window.OsmAuth = OsmAuth;
}

