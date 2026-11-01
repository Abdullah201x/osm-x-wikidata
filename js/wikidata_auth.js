/**
 * Wikimedia OAuth 2.0 (PKCE) Client for Wikidata.
 * Supports public client authorization code flow with PKCE (RFC 7636).
 * Registered with Client ID: 37e339735b8e52e4d655c7fbe37aa33a
 */

const DEFAULT_WD_CLIENT_ID = "37e339735b8e52e4d655c7fbe37aa33a";

const WikidataAuth = {
  CLIENT_ID: localStorage.getItem("wd_oauth_client_id") || DEFAULT_WD_CLIENT_ID,
  ENVIRONMENT: localStorage.getItem("wd_oauth_environment") || "production", // "production" or "test"
  SCOPES: "basic editpage",

  getEndpoints() {
    const isTest = this.ENVIRONMENT === "test";
    const metaBase = "https://meta.wikimedia.org";
    const wikidataBase = isTest ? "https://test.wikidata.org" : "https://www.wikidata.org";

    return {
      authUrl: `${metaBase}/w/rest.php/oauth2/authorize`,
      tokenUrl: `${metaBase}/w/rest.php/oauth2/access_token`,
      profileUrl: `${metaBase}/w/rest.php/oauth2/resource/profile`,
      wikidataApi: `${wikidataBase}/w/api.php`,
      wikidataRest: `${wikidataBase}/w/rest.php/wikibase/v1`,
      wikidataBase: wikidataBase
    };
  },

  getRedirectUri() {
    // MediaWiki OAuth 2.0 requires an exact callback URL match
    let uri = window.location.origin + window.location.pathname;
    if (!uri.endsWith("/index.html") && !uri.endsWith("/")) {
      uri += "/index.html";
    } else if (uri.endsWith("/")) {
      uri += "index.html";
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
    this.CLIENT_ID = clientId || DEFAULT_WD_CLIENT_ID;
    localStorage.setItem("wd_oauth_client_id", this.CLIENT_ID);

    const endpoints = this.getEndpoints();
    const verifier = this.generateRandomString(64);
    const challenge = await this.generateChallenge(verifier);
    const state = "wd_" + this.generateRandomString(24);

    sessionStorage.setItem("wd_oauth_state", state);
    sessionStorage.setItem("wd_code_verifier", verifier);
    sessionStorage.setItem("wd_return_hash", window.location.hash || "");

    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.CLIENT_ID,
      redirect_uri: this.getRedirectUri(),
      scope: this.SCOPES,
      code_challenge: challenge,
      code_challenge_method: "S256",
      state: state
    });

    window.location.href = `${endpoints.authUrl}?${params.toString()}`;
  },

  async handleCallback() {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get("code");
    const state = urlParams.get("state");

    // Check if this callback is intended for Wikidata (namespaced with "wd_")
    if (!code || !state || !state.startsWith("wd_")) {
      return false;
    }

    const savedState = sessionStorage.getItem("wd_oauth_state");
    const codeVerifier = sessionStorage.getItem("wd_code_verifier");
    const returnHash = sessionStorage.getItem("wd_return_hash");

    sessionStorage.removeItem("wd_oauth_state");
    sessionStorage.removeItem("wd_code_verifier");
    sessionStorage.removeItem("wd_return_hash");

    if (state !== savedState) {
      console.error("Wikidata OAuth state mismatch. Possible CSRF attack.");
      alert("Wikidata authentication error: invalid OAuth state parameter.");
      this.cleanUrlParams(returnHash);
      return false;
    }

    try {
      const endpoints = this.getEndpoints();
      const body = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: this.CLIENT_ID,
        code: code,
        redirect_uri: this.getRedirectUri(),
        code_verifier: codeVerifier
      });

      const res = await fetch(endpoints.tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: body.toString()
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Token exchange failed: ${res.status} ${errorText}`);
      }

      const tokenData = await res.json();
      if (tokenData.access_token) {
        localStorage.setItem("wd_access_token", tokenData.access_token);
        if (tokenData.refresh_token) {
          localStorage.setItem("wd_refresh_token", tokenData.refresh_token);
        }
        localStorage.setItem("wd_token_expires_at", (Date.now() + (tokenData.expires_in || 14400) * 1000).toString());

        await this.fetchUserProfile(tokenData.access_token);
      }
    } catch (e) {
      console.error("Failed to complete Wikidata OAuth login:", e);
      alert("Failed to authenticate with Wikidata. Please verify OAuth app status or try QuickStatements fallback.");
    } finally {
      this.cleanUrlParams(returnHash);
    }

    return true;
  },

  async fetchUserProfile(token = null) {
    const accessToken = token || this.getAccessToken();
    if (!accessToken) return null;

    const endpoints = this.getEndpoints();
    try {
      // 1. Try OAuth resource profile endpoint
      const res = await fetch(endpoints.profileUrl, {
        headers: {
          "Authorization": `Bearer ${accessToken}`
        }
      });

      if (res.ok) {
        const profile = await res.json();
        const userObj = {
          username: profile.username || profile.sub || "Wikidata Mapper",
          id: profile.sub || "",
          profile: profile
        };
        localStorage.setItem("wd_user_identity", JSON.stringify(userObj));
        return userObj;
      }

      // 2. Fallback to Action API userinfo
      const apiRes = await fetch(`${endpoints.wikidataApi}?action=query&meta=userinfo&format=json&crossorigin=1`, {
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Api-User-Agent": "OSMxWikidataLinker/2.0 (https://wikidata.saudiosm.org)"
        }
      });

      if (apiRes.ok) {
        const data = await apiRes.json();
        if (data.query?.userinfo) {
          const userObj = {
            username: data.query.userinfo.name,
            id: data.query.userinfo.id,
            profile: data.query.userinfo
          };
          localStorage.setItem("wd_user_identity", JSON.stringify(userObj));
          return userObj;
        }
      }
    } catch (e) {
      console.warn("Could not fetch Wikidata user profile:", e);
    }
    return null;
  },

  // Refresh a minute early so a token never expires mid-request.
  TOKEN_SKEW_MS: 60 * 1000,

  getRefreshToken() {
    return localStorage.getItem("wd_refresh_token");
  },

  /**
   * Synchronous read of the current access token. Returns null when it has
   * expired. Only forces a logout when there is no refresh token to fall back
   * on; otherwise ensureAccessToken() can still renew the session.
   */
  getAccessToken() {
    const expiresAt = parseInt(localStorage.getItem("wd_token_expires_at") || "0", 10);
    if (expiresAt && Date.now() > expiresAt) {
      console.warn("Wikidata access token expired.");
      if (!this.getRefreshToken()) this.logout();
      return null;
    }
    return localStorage.getItem("wd_access_token");
  },

  /**
   * Returns a usable access token, exchanging the stored refresh token first
   * if the current one is expired or about to be. Resolves null (and logs out)
   * when no valid session can be recovered.
   */
  async ensureAccessToken() {
    const expiresAt = parseInt(localStorage.getItem("wd_token_expires_at") || "0", 10);
    const stillValid = !expiresAt || Date.now() < expiresAt - this.TOKEN_SKEW_MS;
    if (stillValid) {
      const token = localStorage.getItem("wd_access_token");
      if (token) return token;
    }
    if (!this.getRefreshToken()) {
      this.logout();
      return null;
    }
    return this.refreshAccessToken();
  },

  /**
   * RFC 6749 refresh_token grant. Concurrent callers share one request so a
   * rotating refresh token is never redeemed twice.
   */
  refreshAccessToken() {
    if (this._refreshPromise) return this._refreshPromise;

    this._refreshPromise = (async () => {
      try {
        const body = new URLSearchParams({
          grant_type: "refresh_token",
          client_id: this.CLIENT_ID,
          refresh_token: this.getRefreshToken()
        });
        const res = await fetch(this.getEndpoints().tokenUrl, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: body.toString()
        });

        if (!res.ok) {
          // A 4xx means the grant itself is dead; a 5xx may be transient, so
          // keep the session and let the caller report the failure.
          if (res.status >= 400 && res.status < 500) this.logout();
          console.warn(`Wikidata token refresh failed: HTTP ${res.status}`);
          return null;
        }

        const tokenData = await res.json();
        if (!tokenData.access_token) {
          this.logout();
          return null;
        }
        localStorage.setItem("wd_access_token", tokenData.access_token);
        if (tokenData.refresh_token) {
          localStorage.setItem("wd_refresh_token", tokenData.refresh_token);
        }
        localStorage.setItem("wd_token_expires_at", (Date.now() + (tokenData.expires_in || 14400) * 1000).toString());
        return tokenData.access_token;
      } catch (e) {
        console.warn("Wikidata token refresh error:", e);
        return null;
      } finally {
        this._refreshPromise = null;
      }
    })();

    return this._refreshPromise;
  },

  getUser() {
    const raw = localStorage.getItem("wd_user_identity");
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },

  isAuthenticated() {
    // A refresh token means the session can still be renewed on the next write.
    return !!this.getAccessToken() || !!this.getRefreshToken();
  },

  logout() {
    localStorage.removeItem("wd_access_token");
    localStorage.removeItem("wd_refresh_token");
    localStorage.removeItem("wd_token_expires_at");
    localStorage.removeItem("wd_user_identity");
  },

  cleanUrlParams(returnHash = "") {
    const url = new URL(window.location.href);
    url.searchParams.delete("code");
    url.searchParams.delete("state");
    const cleanUrl = url.pathname + (returnHash ? (returnHash.startsWith("#") ? returnHash : "#" + returnHash) : window.location.hash);
    window.history.replaceState({}, document.title, cleanUrl);
  }
};

window.WikidataAuth = WikidataAuth;
