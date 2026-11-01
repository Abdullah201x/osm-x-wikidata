# Security Policy

## Supported Versions

Only the latest version deployed on the `main` branch is actively supported with security updates.

| Branch / Version | Supported |
|---|---|
| `main` (`2.2.x`) | :white_check_mark: |
| `< 2.0.0` | :x: |

## Security Architecture & Guarantees

1. **Client-Side PKCE Authentication:**
   - OSM and Wikidata authentication use OAuth 2.0 with Proof Key for Code Exchange (PKCE S256).
   - User access tokens are stored in client-side browser storage. The Wikidata token is never sent to `osmwd-api`.
   - The OSM token is sent to exactly one backend route, `GET /api/v1/me`, which relays it once to `api.openstreetmap.org/api/0.6/user/details.json` to learn the numeric user id and decide import permission (`OSMWD_IMPORT_ALLOWLIST`). The backend never stores or logs the token (its in-memory cache is keyed by a SHA-256 digest and holds only the uid and display name), and the response is `Cache-Control: no-store`.
   - Import permission lives in page memory only and is re-checked on every page load; editing browser storage cannot grant it. `data/<cc>.json` remains publicly downloadable (Manara consumes `data/sa.json`), so the gate controls the app's UI and bandwidth, not secrecy of public Wikidata/OSM data.
2. **Defensive API Gateway & Rate Limiting:**
   - Rate limiting enforced via `SlowAPIMiddleware` (20 requests/minute on verify, 30 on edit preview, 10 on `/api/v1/me`).
   - Strict 16 KB request body limit enforced across all POST routes.
   - Bounded in-memory LRU cache with upstream 429 backoff handling.
3. **Content Security Policy (CSP):**
   - Self-hosted vendor scripts and styles with zero inline JavaScript event handlers.
   - Restrictive connect-src allowing only approved OSM, Wikimedia, and local JOSM origins.
   - `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, and `Permissions-Policy` headers.

## Reporting a Vulnerability

If you discover a security vulnerability in this project:

1. **Do not open a public GitHub issue.**
2. Send a report directly to the repository maintainer:
   - **OSM Profile:** [Alshowaiey](https://www.openstreetmap.org/user/Alshowaiey)
   - Or open a **Private Vulnerability Report** via GitHub Security Advisories.
3. Please include:
   - A detailed description of the vulnerability.
   - Steps to reproduce or proof-of-concept payload.
   - Potential impact.

We strive to acknowledge receipt of reports within 48 hours and provide a fix or mitigation plan within 7 days.
