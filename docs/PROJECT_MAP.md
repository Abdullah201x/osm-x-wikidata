# Project Map

Concise index of where things live. Check here before searching the repository.

## Entry Points
- `index.html`, `404.html` - Single-page application HTML and fallback
- `serve_ssl.py` - Local dev/e2e static server (`--http`, `--csp`, `--api`)
- `update_data.py` - Master offline data pipeline runner
- `backend/app/main.py` - FastAPI backend (`osmwd-api`) entrypoint

## Backend (`backend/app/`)
- `config.py` - Environment config, CORS origins, `OSMWD_IMPORT_ALLOWLIST`
- `store.py` - In-memory dataset store with atomic reload
- `limiter.py`, `body_limit.py` - SlowAPI rate limiting & 16 KB body limit middleware
- `routers/healthz.py` - `/api/healthz` and `/api/healthz/freshness`
- `routers/me.py` - `/api/v1/me` OSM identity & import allowlist check
- `routers/reverse.py` - `/api/v1/reverse` paginated reverse-QA query endpoint
- `routers/verify.py` - `/api/v1/verify/{qid}` live Wikidata & OSM verifier
- `routers/preview.py` - `/api/v1/edits/preview` pre-flight write validation
- `routers/_common.py` - Shared router helpers

## Offline Pipeline (`pipeline/`)
- `config.py` - GCC metadata, bounding boxes, P31 ontology
- `pbf_extractor.py` - `pyosmium` PBF scanner with SQLite cache
- `wikidata_fetcher.py` - SPARQL client with backoff & SQLite cache
- `country_boundaries.py` - GCC `admin_level=2` polygon extraction
- `arabic_normalizer.py` - Arabic NLP normalization & string similarity
- `physicality_filter.py` - Filters non-physical Wikidata items
- `matcher.py` - Spatial join & candidate POI matcher
- `ml_matcher.py`, `evaluate_matcher.py` - `HistGradientBoostingClassifier` conflation model & eval
- `reverse_matcher.py` - Reverse QA classification & multi-tag conflict engine
- `linkable.py`, `publish_filter.py`, `jsonio.py` - Dataset filtering & compact JSON export
- `validate_data.py`, `progress.py` - Dataset validation & progress tracking

## Frontend (`js/`, `css/`)
- `css/style.css` - Design system & RTL/LTR layout styles
- `js/app.js` - Main state controller & UI event bindings
- `js/map.js` - Leaflet map & marker clustering
- `js/import_access.js` - Client-side import gate (`/api/v1/me`)
- `js/arabic_utils.js` - Client-side Arabic search & normalization
- `js/translations.js` - Bilingual Arabic (RTL) & English strings
- `js/osm_oauth.js`, `js/wikidata_auth.js`, `js/pages_redirect.js` - OAuth 2.0 PKCE flows
- `js/wikidata_edit.js`, `js/wikidata_labels.js` - Wikidata claim writer & QID/PID label cache
- `js/batch_manager.js`, `js/history_manager.js` - Staging queue & activity history export
- `js/live_verify.js`, `js/tag_generator.js`, `js/tag_repair_dialog.js`, `js/tools.js` - Verifier, tag presets, repair dialog, JOSM/iD/QuickStatements
- `js/modal_a11y.js`, `js/notify.js`, `js/progress_chart.js` - Modals, notifications, progress chart

## Tests & Tooling
- `tests/test_*.py`, `tests/conftest.py` - Python unit & API integration tests
- `tests/js/*.test.js`, `tests/js/app-harness.js`, `tests/js/load-script.js` - Vitest JS unit tests
- `e2e/*.e2e.js`, `e2e/helpers.js` - Playwright E2E smoke tests
- `pytest.ini`, `pyproject.toml`, `eslint.config.js`, `vitest.config.js`, `playwright.config.js`

## Deployment & CI
- `Dockerfile`, `backend/Dockerfile` - Web (Caddy) and API containers
- `deploy/Caddyfile.container`, `deploy/docker-compose.coolify.yml` - Production proxy & compose
- `.github/workflows/ci.yml`, `deploy.yml`, `update-data.yml` - CI, deploy, scheduled data updates

## Documentation
- `README.md`, `PRODUCT.md`, `DESIGN.md`, `CHANGELOG.md`, `SECURITY.md`
- `docs/OSM_IMPORT_GUIDELINES.md` - OSM import policy & compliance guide
- `docs/NEXT_LEVEL_PLAN.md` - Engineering roadmap
- `docs/PIPELINE_SPEEDUP_GUIDE.md` - Pipeline performance guide
- `docs/ai_design_principles_cognitive_ux_playbook.md` - UX laws & design principles

## Do Not Read (Large, Generated, or Sensitive)
- `data/`, `node_modules/`, `vendor/`, `test-results/`, `.pytest_cache/`, `.ruff_cache/`, `__pycache__/`
- `.env`, `*.db`, `*.pbf`, `*.geojson`, `cert.pem`, `key.pem`
