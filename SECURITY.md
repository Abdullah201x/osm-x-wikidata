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
   - User access tokens are stored strictly in client-side browser storage and are **never** transmitted to or logged by the backend API (`osmwd-api`).
2. **Defensive API Gateway & Rate Limiting:**
   - Rate limiting enforced via `SlowAPIMiddleware` (20 requests/minute on verify, 30 requests/minute on edit preview).
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
