# OSM × Wikidata GCC Linker & Reverse QA Workbench
### منصة الربط والتحقق الثنائي بين خريطة الشارع المفتوحة وويكي بيانات لدول الخليج

[![CI](https://github.com/Abdullah201x/osm-x-wikidata/actions/workflows/ci.yml/badge.svg)](https://github.com/Abdullah201x/osm-x-wikidata/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python 3.12](https://img.shields.io/badge/Python-3.12-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688.svg)](https://fastapi.tiangolo.com/)
[![OpenStreetMap](https://img.shields.io/badge/OpenStreetMap-API%200.6%20OAuth2-7EBC6F.svg)](https://www.openstreetmap.org/)
[![Wikidata](https://img.shields.io/badge/Wikidata-OAuth2%20PKCE-339966.svg)](https://www.wikidata.org/)

A high-performance, bidirectional web workbench and hybrid data pipeline coupling **OpenStreetMap (OSM)** with **Wikidata** across the 6 GCC countries (**Saudi Arabia, United Arab Emirates, Kuwait, Qatar, Bahrain, and Oman**).

Live Production: **[wikidata.saudiosm.org](https://wikidata.saudiosm.org)**

---

## 🌟 Key Capabilities

### 1. 🔄 Bidirectional Linking & QA Modes

The workbench operates seamlessly in two specialized modes via a top navigation pill:

* **Mode A: Forward Conflation (Wikidata &rarr; OSM)**:
  * Shows Wikidata entities that already exist in OSM (link candidates and linked items) to everyone.
  * **Import gate:** Wikidata entities that are *missing* in OSM (new-node creation, JOSM presets, MapRoulette export) are shown only to OSM users the maintainer has approved. Anonymous visitors load the much smaller `data/<cc>_linkable.json`; approved importers (OSM uid in `OSMWD_IMPORT_ALLOWLIST`, verified server-side through `/api/v1/me`) load the full `data/<cc>.json`.
  * **Machine Learning Conflation**: Employs a trained `HistGradientBoostingClassifier` (ROC-AUC 0.996) evaluated on strictly local spatial neighborhoods (10 m–400 m) to predict match probabilities with AI confidence percentages.
  * **Physicality & Ground Truth Guard**: Automatically filters out 6,200+ non-physical entities (events, disasters, pandemics, timelines, administrative lists) ensuring strict adherence to OSM's Ground Truth rule.
  * **Arabic Linguistic Normalization**: Advanced NLP normalization handles spelling variants (`الـ` prefix, hamza variants `أ/إ/آ`, taa marbuta `ة/ه`, and mosque synonyms `جامع/مسجد`).
  * **1-Click Tag Presets**: Pre-fills tags for hundreds of entity types across all GCC states.

* **Mode B: Reverse QA & Back-Linking (OSM &rarr; Wikidata)**:
  * Scans existing OSM elements carrying `wikidata=*` tags across the 6 GCC countries to detect errors and sync Wikidata reciprocal statements.
  * **Missing Back-links Engine**: Identifies OSM elements correctly linked to Wikidata where Wikidata lacks the corresponding external identifier (`P11693` for nodes, `P10689` for ways, `P402` for relations).
  * **Broken OSM Tag Detection**: Catches malformed QIDs (`q851`, full URLs, semicolon lists), deleted entities, and redirected QIDs with 1-click tag migration.
  * **Wrong-Key Classifier**: Proactively prevents bad Wikidata edits by detecting entity misclassifications:
    * `Q5` (human) &rarr; suggests `name:etymology:wikidata` (named streets, mosques) or `subject:wikidata` (statues).
    * Retail chains / corporate brands &rarr; suggests `brand:wikidata` or `operator:wikidata`.
    * Taxa (`Q16521`) &rarr; suggests `species:wikidata`.
  * **Multi-Tag Conflict Engine (5 Buckets)**: Classifies multi-tagged QIDs into benign relations (e.g. Haramain Railway), linear segmented ways (Wadi Hanifah, Sheikh Zayed Rd), admin relations, duplicate POIs, and parent-admin copy-paste pollution (e.g. Jazan governorate tags pasted onto 60+ child villages).

### 2. 🔐 Dual OAuth 2.0 PKCE & In-App Writing

* **OpenStreetMap OAuth 2.0 PKCE**: Authenticated changeset creation (API 0.6) with automatic token management, smart changeset comments, and optional dev sandbox toggle (`master.apis.dev.openstreetmap.org`).
* **Wikidata OAuth 2.0 PKCE**: Direct in-app creation of `P11693`, `P10689`, and `P402` claims with `maxlag=5` throttling, conflict `baserevid` protection, upstream 429 backoff, and [EditGroups](https://editgroups.toolforge.org) batch links.
* **Pre-Flight Edit Preview**: Calls `/api/v1/edits/preview` before every write to verify live Wikidata and OSM element state.
* **Batch Staging Queue**: Queue up to **25 items** per changeset or Wikidata batch with polite &ge;600 ms spacing and real-time progress indicators. No blind bulk bot writes.

### 3. 🎯 External Tool Integrations

* **JOSM Remote Control (`localhost:8111`)**:
  * **Load & Zoom (`J`)**: Jump directly to the bounding box in JOSM.
  * **Push Tags**: 1-click push of `wikidata=Q...` to selected OSM elements.
  * **Add Node**: Instant node creation in JOSM with pre-filled tags.
* **OSM iD Editor (`I`)**: Deep-links directly to the exact zoom and location in iD editor.
* **QuickStatements v2 Export**: 1-click copy of QuickStatements lines or batch export of high-confidence back-links.
* **MapRoulette Challenge Export**: Export any filtered subset as a GeoJSON task challenge.

### 4. ⚡ High-Speed Pipeline & FastAPI Backend

* **Local PBF Scanner**: Uses `pyosmium` and `shapely` to extract GCC features from Geofabrik extracts in under a minute without network timeouts or Overpass limits.
* **Stateless FastAPI Backend (`osmwd-api`)**:
  * Serves filtered reverse-QA queries with pagination and search (`/api/v1/reverse`).
  * Real-time live Wikidata & OSM entity verification with caching and upstream backoff (`/api/v1/verify/{qid}`).
  * Pre-flight write validation (`/api/v1/edits/preview`).
  * Health and dataset freshness monitoring (`/api/healthz`, `/api/healthz/freshness`).
  * Rate-limited with `slowapi` using client real IPs behind proxy headers.
* **Self-Contained Container Stack**: Pre-compressed Brotli (`-q 9`) and Gzip static assets served via Caddy with strict Content Security Policy (CSP), zero external CDN dependencies, and same-origin Umami analytics proxying.

---

## 📂 Project Structure

```
├── backend/                  # FastAPI backend service (osmwd-api)
│   ├── app/
│   │   ├── routers/          # API route handlers
│   │   │   ├── healthz.py    # Health & freshness endpoints (HEAD + GET)
│   │   │   ├── preview.py    # Pre-flight edit validation (/edits/preview)
│   │   │   ├── reverse.py    # Paginated reverse QA query engine (/reverse)
│   │   │   └── verify.py     # Live Wikidata & OSM verifier (/verify/{qid})
│   │   ├── body_limit.py     # 16 KB request body limit middleware
│   │   ├── config.py         # Environment configuration & CORS origins
│   │   ├── limiter.py        # SlowAPI rate limiting configuration
│   │   ├── main.py           # FastAPI application entrypoint
│   │   └── store.py          # In-memory dataset store with atomic hot-reload
│   ├── Dockerfile            # Pinned python:3.12-slim non-root container
│   └── requirements.txt      # Backend Python dependencies
├── css/
│   └── style.css             # Dark glassmorphic design system
├── data/                     # Published datasets (committed to git)
│   ├── summary.json          # Overall stats, reverse counts & UTC updated_at
│   ├── {sa,ae,kw,qa,bh,om}.json          # Forward conflation 15-tuple datasets
│   └── reverse_{sa,ae,kw,qa,bh,om}.json  # Reverse QA datasets
├── deploy/                   # Production deployment assets
│   ├── Caddyfile.container   # Production Caddy config with strict CSP & Umami proxy
│   └── docker-compose.coolify.yml # Coolify compose recipe (osmwd-web + osmwd-api)
├── js/                       # Client-side vanilla JavaScript modules
│   ├── app.js                # State controller & UI event binding
│   ├── arabic_utils.js       # Client-side Arabic search & normalization
│   ├── batch_manager.js      # Staging queue & multi-item changeset manager
│   ├── history_manager.js    # Activity history & CSV/JSON export
│   ├── live_verify.js        # On-demand micro-query verifier
│   ├── map.js                # Leaflet map engine & marker clustering
│   ├── osm_oauth.js          # OSM OAuth 2.0 PKCE & Changeset API 0.6
│   ├── tag_generator.js      # P31 -> OSM tag preset generator
│   ├── tools.js              # JOSM 8111, iD Editor & QuickStatements tools
│   ├── translations.js       # Bilingual Arabic (RTL) & English localizations
│   ├── wikidata_auth.js      # Wikimedia OAuth 2.0 PKCE auth controller
│   ├── wikidata_edit.js      # Wikidata API statement writer & EditGroups
│   └── wikidata_labels.js    # Client-side QID/PID label cache
├── pipeline/                 # Offline data pipeline & conflation engine
│   ├── arabic_normalizer.py  # Arabic NLP normalizer & string similarity
│   ├── config.py             # GCC metadata, bounding boxes & P31 ontology
│   ├── country_boundaries.py # GCC admin_level=2 boundary extractor
│   ├── matcher.py            # Spatial join & candidate POI matcher
│   ├── ml_matcher.py         # ML conflation model prediction
│   ├── pbf_extractor.py      # pyosmium PBF scanner with SQLite caching
│   ├── physicality_filter.py # Filter for non-physical Wikidata items
│   ├── reverse_matcher.py    # Reverse QA classification & confidence engine
│   └── wikidata_fetcher.py   # SPARQL client with backoff & SQLite caching
├── tests/                    # Automated test suites
│   ├── test_backend_api.py   # FastAPI endpoint, rate limit & validation tests
│   ├── test_country_boundaries.py # GCC polygon extraction & point-in-poly tests
│   └── test_reverse_matcher.py    # Reverse QA classification & bucket tests
├── vendor/                   # Self-hosted frontend dependencies (Zero CDN)
│   ├── fonts/                # Cairo, Outfit, Plus Jakarta Sans, JetBrains Mono
│   ├── leaflet/              # Leaflet 1.9.4 CSS, JS & images
│   └── markercluster/        # Leaflet.markercluster 1.4.1 CSS & JS
├── Dockerfile                # Multi-stage production web container (Brotli + Caddy)
├── index.html                # Single-page application entrypoint
├── OSM_IMPORT_GUIDELINES.md  # Official OSM Import Policy & Compliance Guide
├── package.json              # Dev-only frontend tooling (eslint, vitest, playwright)
├── pytest.ini                # Pytest configuration
├── requirements.txt          # Root Python dependencies (pipeline + tests)
├── serve_ssl.py              # Local dev/e2e server (HTTPS or --http) with production CSP enforcement (--csp)
└── update_data.py            # Master pipeline runner
```

---

## 🚀 Getting Started

### 1. Prerequisites & Dependencies

Python 3.12+ is required. Install dependencies for both the pipeline and backend:

```bash
# Pipeline & testing dependencies
pip install -r requirements.txt

# Backend API dependencies
pip install -r backend/requirements.txt
```

### 2. Running Automated Tests

Run the full Python test suite (42 tests, runs completely offline):

```bash
python -m pytest tests/ -q
```

Frontend checks use dev-only Node tooling (the site itself ships as plain static files, nothing is bundled):

```bash
npm ci
npm run lint     # ESLint over js/
npm test         # Vitest + jsdom unit tests (12 files, 237 cases, no network)
npm run smoke    # Playwright: desktop + mobile, production CSP, third-party traffic stubbed
```

`npm run smoke` uses your installed Chrome locally; in CI it uses `npx playwright install --with-deps chromium`.

### 3. Running Locally

#### Option A: Local Web Server with Production CSP Enforcement
To test OAuth callbacks and CSP headers with local HTTPS:
```bash
python serve_ssl.py --csp
```
Open `https://localhost:8000` (accept the self-signed developer certificate). `--csp` sends the exact Content-Security-Policy from `deploy/Caddyfile.container`; `--http` serves plain HTTP without certificates (used by the Playwright tests); `--api http://127.0.0.1:8010` proxies `/api/*` to a local backend.

#### Option B: Running the Backend API Locally
```bash
uvicorn backend.app.main:app --host 127.0.0.1 --port 8010 --reload
```
Interactive OpenAPI documentation is available at:
`http://127.0.0.1:8010/api/docs`

---

## 🔄 Running the Data Pipeline

The data pipeline runs **off the VPS** (either locally or in GitHub Actions) to keep VPS memory usage minimal.

### Prerequisites for Pipeline Run
Place a recent Geofabrik extract (`gcc-states-latest.osm.pbf`) in the root directory or configure `OSM_PBF=/path/to/extract.osm.pbf`.

```bash
# Run for a specific country (e.g. Bahrain or Saudi Arabia)
python update_data.py --country bh
python update_data.py --country sa

# Run for all 6 GCC countries
python update_data.py --country all

# Force refresh from Wikidata SPARQL & entity caches
python update_data.py --refresh-wikidata
```

The pipeline writes output to `data/<cc>.json`, `data/reverse_<cc>.json`, and updates `data/summary.json`.

> [!IMPORTANT]
> **Upstream Contract with Manara (`manara.saudiosm.org`):**
> Manara downloads `data/sa.json` nightly. Never alter the 15-element tuple layout `[0..14]` of `data/sa.json`.

---

## 🐳 Production Deployment (Coolify)

Production runs on a Debian VPS (`159.195.192.148`) managed by **Coolify 4.5**.

```bash
# Build and run with Docker Compose
docker compose -f deploy/docker-compose.coolify.yml up -d --build
```

### Resource Allocations
* `osmwd-web`: Caddy 2.11 on `:80` (memory cap `128 MiB`).
* `osmwd-api`: FastAPI on `:8010` (memory cap `256 MiB`).
* Traefik (`coolify-proxy`) owns host ports 80/443 and terminates TLS for `wikidata.saudiosm.org`.

---

## ⚠️ OpenStreetMap & Wikimedia Policy Compliance

* **OSM Ground Truth Rule**: All candidate matches must be verified visually via aerial imagery or on-the-ground knowledge before uploading.
* **No Blind Automated Edits**: Edits are staged for explicit human review. No automated bots.
* **OSM Import Guidelines**: Adding missing features from Wikidata is governed by the [OSMF Import Guidelines](https://wiki.openstreetmap.org/wiki/Import/Guidelines). Read **[`OSM_IMPORT_GUIDELINES.md`](OSM_IMPORT_GUIDELINES.md)** before performing batch edits.
* **Wikimedia Edit Policy**: All Wikidata edits use authenticated OAuth 2.0 PKCE with `maxlag=5` and `baserevid` collision guards.
* **Tile Usage**: Map tiles are sourced from CARTO Voyager and Esri World Imagery. **Zero traffic is routed to `tile.openstreetmap.org`**.

---

## 👤 Maintainer & Community Feedback

* **Maintainer**: **[Alshowaiey](https://www.openstreetmap.org/user/Alshowaiey)** (OpenStreetMap Profile)
* **Direct OSM Message**: Send inquiries or feedback via **[OpenStreetMap Messages](https://www.openstreetmap.org/message/new/Alshowaiey)**.
* **GitHub Issues**: Report issues or suggestions on **[GitHub Issues](https://github.com/Abdullah201x/osm-x-wikidata/issues)**.
* **Saudi OSM Community**: Join regional contributors on Telegram: **[@OSMSaudi](https://t.me/OSMSaudi)**.
