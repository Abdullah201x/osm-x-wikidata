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

  /**
   * Links a Wikidata QID to an existing OSM element directly via OSM API 0.6.
   * Creates an assisted changeset, updates the element with wikidata=Q..., and closes the changeset.
   */
  async linkOsmElement(osmRef, qid, extraTags = {}, customComment = "") {
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

    // 3. Open a Changeset
    const defaultComment = `Add wikidata=${cleanQid} to ${ref.type}/${ref.id} #osm-wikidata-gcc`;
    const comment = (customComment || defaultComment).trim();

    const changesetXml = `<?xml version="1.0" encoding="UTF-8"?>
<osm version="0.6" generator="OSM x Wikidata GCC Linker">
  <changeset>
    <tag k="created_by" v="OSM x Wikidata GCC Linker (https://abdullah201x.github.io/osm-x-wikidata)"/>
    <tag k="comment" v="${this._escapeXml(comment)}"/>
    <tag k="source" v="Wikidata; OpenStreetMap"/>
    <tag k="wikidata" v="${this._escapeXml(cleanQid)}"/>
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

    return {
      success: true,
      changesetId: changesetId,
      version: newVersion,
      type: ref.type,
      id: ref.id,
      url: `https://www.openstreetmap.org/${ref.type}/${ref.id}`,
      changesetUrl: this.getChangesetUrl(changesetId)
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
