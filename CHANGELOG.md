# Changelog

All notable changes to the **OpenStreetMap × Wikidata GCC Conflation & Reverse QA Workbench** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- **CI-gated production deploys:** `.github/workflows/deploy.yml` redeploys the Coolify Service through the Coolify API after a green CI or data-refresh run on `main`. A `verify-live` job then confirms the site serves the new commit, data is fresh and the reverse API is populated.
- **`docker-build` CI job:** builds both images, runs `caddy validate`, and asserts the API image actually loads its datasets.
- **Import gate:** `GET /api/v1/me` verifies the OSM token server-side against `OSMWD_IMPORT_ALLOWLIST`. Only approved users load the full datasets and see missing items, new-node creation, JOSM presets and the MapRoulette export; everyone else gets `data/<cc>_linkable.json` (SA: 8.9 MB → 1.1 MB) and a short explanatory note.
- `pipeline/linkable.py`, `update_data.py --derive-linkable`, and validator checks (no status-0 items, consistent counts, size budget, not stale).

### Changed
- `SECURITY.md` now documents that the OSM token is relayed once to OpenStreetMap by `/api/v1/me`.
- Asset version bumped to `?v=12`.

### Fixed
- **Direct OSM Tag Repair button in reverse mode:** Fixed uncaught `TypeError: OsmAuth.isAuthenticated is not a function` on clicking the orange repair button, added missing `fromTag` migration handling (e.g. migrating `wikidata` to `brand:wikidata`), standardized OSM API 0.6 element XML serialization, guaranteed changeset closure via `finally`, and recorded repairs in persistent history.
- Production was not redeploying on push (a Coolify Service has no git webhook), so the live site had none of the 2.1.0/2.2.0 changes. HANDOFF and runbooks now describe the real deploy path.

---

## [2.2.0] - 2026-11-01

### Added
- **Arabic Keyboard Layout Support:** Ported layout-independent `shortcutKey(e)` engine supporting Arabic layout keypresses (`؟`, `KeyB`, `KeyH`, `KeyJ`, `BracketRight`/`BracketLeft`).
- **Multi-Tier Container Resolution:** Self-healing dataset discovery in `backend/app/config.py` checking `OSMWD_DATA_DIR` &rarr; `/app/data` &rarr; local `data/`.
- **Engineering Excellence Tooling:** Added `ruff` static analysis, `pytest-cov` test coverage reports, and unified `pyproject.toml`.
- **Data Validation & Shrink Guard:** Added `pipeline/validate_data.py` blocking publish if any dataset shrinks >20% or violates the 15-element schema.
- **Atomic Data Writes:** Switched `update_data.py` and `reverse_matcher.py` to atomic writes (`.tmp` + `os.replace`).
- **Comprehensive Test Suite:** 126 offline Python tests (17 modules) and 242 Vitest frontend tests across 12 suites.
- **E2E Playwright Smoke Suite:** 66 tests (41 desktop + 25 mobile) enforcing production Caddy CSP locally.
- **Split CI Workflow:** 3-job GitHub Actions workflow (`python-tests`, `frontend`, `smoke`) with concurrency cancellation.
- **Security Headers:** Added `Strict-Transport-Security` and `Permissions-Policy` to `deploy/Caddyfile.container`.
- **Security Policy:** Added `SECURITY.md` defining vulnerability disclosure and client-side PKCE token guarantees.

### Changed
- Refactored 28 inline HTML styling attributes into clean CSS classes in `css/style.css`.
- Cleaned up unused imports across all Python pipeline and backend modules via Ruff.

---

## [2.1.0] - 2026-11-01

### Added
- Reverse QA anomaly datasets for all six GCC countries (`reverse_*.json`).
- `SlowAPIMiddleware` with per-route rate limits (20/min verify, 30/min preview).
- Strict 16 KB request body cap middleware on POST endpoints.
- Upstream 429 backoff and `Retry-After` propagation.
- Lag-aware authenticated Wikidata writes (`maxlag=5`, `baserevid`).
- Comprehensive operations runbook and verify block in `HANDOFF.md`.

### Fixed
- Replaced naive cache flush with bounded `OrderedDict` LRU cache.
- Added `redirects=yes` on edit preview to prevent editing redirected Wikidata entities.
- Replaced inline `onclick` handlers in batch manager with `addEventListener`.

---

## [2.0.0] - 2026-10-29

### Added
- Dual-mode architecture: Forward Conflation + Reverse QA Workbench.
- Dedicated FastAPI backend service (`osmwd-api`) in Docker with health & freshness endpoints.
- Full Wikidata OAuth 2.0 PKCE authentication flow with in-app statement authoring.
- Self-hosted vendor assets (Leaflet, MarkerCluster) behind Caddy reverse proxy container.
- MapRoulette, JOSM XML Presets, and QuickStatements v2 batch export centers.

---

## [1.0.0] - 2026-10-01

### Added
- Initial release of OpenStreetMap × Wikidata GCC Conflation Workbench.
- Forward conflation pipeline linking Wikidata items to GCC OpenStreetMap features.
- High-speed PBF POI extraction using `pyosmium`.
- Machine-learning matching heuristics using composite Arabic/English name normalization.
- Bilingual interface (Arabic / English) with interactive map clustering.
