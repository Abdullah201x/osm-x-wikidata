# OSM × Wikidata GCC Linker: Project Handoff

This document summarizes the architecture, live infrastructure, completed phases, operational runbooks, and standing constraints for the **OSM × Wikidata GCC Linker** (`https://wikidata.saudiosm.org`), so another AI coding assistant or human engineer can seamlessly continue the work.

**Where things stand (updated 2026-11-01):**
- **Original Plan (Phases 1–5):** Reverse analysis engine, FastAPI backend (`osmwd-api`), Docker/Caddy deployment stack (`osmwd-web`), Leaflet reverse QA UI, and dual OAuth PKCE are implemented.
- **Level-Up Phase 0 (Audit Bug Fixes):** Complete across 13 commits (`ddc8b4f` … `a5f45cb`). SlowAPI rate limiting is enabled and tested, request bodies are capped at 16 KB, `cc` is strictly validated, real LRU caching and upstream 429 backoff are in place, Wikidata writes are authenticated and lag-aware with pre-flight `/api/v1/edits/preview`, all inline handlers are eliminated, UTC ISO-8601 timestamps are unified, and reverse datasets for all six GCC countries are generated.
- **Level-Up Phase 1 (Documentation & Parity Architecture):** Complete. `HANDOFF.md`, `README.md`, `BACKEND_AND_REVERSE_LINKER_PLAN.md`, and project memory are synchronized with Manara (`C:\Users\abdul\Desktop\GCC20260707`) standards.
- **Level-Up Phase 2 (Frontend Tooling):** Complete locally (`1576630`, `32e81e5`); not yet pushed. Dev-only `package.json` (eslint 10, Vitest + jsdom, Playwright), 237 Vitest cases in 12 suites, 66 Playwright smoke tests run against the production CSP with all third-party traffic stubbed, and a `frontend` job in `ci.yml`. The new suites found and fixed three real bugs (reverse-mode shortcuts threw `ReferenceError`, `#mode=reverse` deep links never switched mode, four strings had no English translation).
- **Deploy reality check (2026-11-01, Next-level Phase A):** production was found stuck on a build from 12:45 UTC (`app.js?v=10`, empty API store, `/api/healthz/freshness` 503) because osmwd is a Coolify **Service** with no git webhook: pushes never deployed. `.github/workflows/deploy.yml` now redeploys through the Coolify API after green CI / data runs and then verifies the live site (see §3.0). Roadmap: `NEXT_LEVEL_PLAN.md` (Phases A–E).
- **Python Test Suite:** 42 passed tests (`tests/test_backend_api.py`, `tests/test_country_boundaries.py`, `tests/test_reverse_matcher.py`, `tests/test_serve_ssl.py`). Zero network calls during test runs.

---

## START HERE (next agent)

1. **Verify before you touch anything:**
   ```bash
   python -m pytest tests/ -q
   ```
   Must report **42 passed** in ~10 seconds with zero failures. Then, after `npm ci` (first time only; the smoke tests also need Chrome locally, or `npx playwright install chromium`):
   ```bash
   npm run lint     # 0 errors, 0 warnings
   npm test         # 12 files, 237 passed
   npm run smoke    # 66 passed (desktop + mobile), ~1.5 min
   ```
2. **Current git state:**
   Check `git status` and `git log -n 5 --oneline`. The local `main` branch holds the Phase 0 and Phase 1 commits.
   > [!IMPORTANT]
   > **ASK BEFORE EVERY `git push`.** A push to `origin/main` runs CI; green CI triggers `deploy.yml`, which redeploys production on the live VPS (`159.195.192.148`) via the Coolify API. Never push without explicit confirmation from the user.
3. **Upstream contract with Manara (`C:\Users\abdul\Desktop\GCC20260707`):**
   Manara's nightly data pipeline downloads `https://raw.githubusercontent.com/Abdullah201x/osm-x-wikidata/main/data/sa.json` at 23:30 UTC and indexes `items` tuple slots `[0..7]`.
   **Hard rule:** `data/sa.json` must remain committed on `main` at that exact path with its 15-element tuple layout `[0..14]` intact.
4. **Immediate next work:**
   Proceed with **Phase 3 (Python test hardening)** of `LEVEL_UP_PLAN.md`, then Phase 4 (CI/CD refinement; the `frontend` job added in Phase 2 is a single job that Phase 4 may split into `frontend` + `smoke`).
   The Phase 2 commits are local only: **ask the user before pushing** (the push also exercises the new CI job for the first time).

- **Repository:** `github.com/Abdullah201x/osm-x-wikidata` (branch `main` auto-deploys via Coolify)
- **Local checkout:** `C:\Users\abdul\Desktop\osm x wikidata`
- **Reference project:** `C:\Users\abdul\Desktop\GCC20260707` (Manara)
- **VPS SSH:** `root@159.195.192.148`

---

## 1. What the Project Is

The **OSM × Wikidata GCC Linker & Reverse QA Workbench** is a bidirectional conflation and quality assurance platform for OpenStreetMap and Wikidata across the six Gulf Cooperation Council (GCC) countries: Saudi Arabia (`SA`), United Arab Emirates (`AE`), Kuwait (`KW`), Qatar (`QA`), Bahrain (`BH`), and Oman (`OM`).

The platform operates in two complementary modes:

### Mode 1: Forward Conflation (Wikidata &rarr; OSM)
Identifies Wikidata entities that are missing in OpenStreetMap so regional mappers can add them or link existing candidate OSM elements.
- **ML Conflation Engine:** `HistGradientBoostingClassifier` evaluated on local spatial neighborhoods (10 m–400 m) to score candidate match probability.
- **Physicality Filter:** Filters out 6,200+ non-physical entities (events, disasters, pandemics, timelines, administrative lists) to preserve the OSM Ground Truth rule.
- **Arabic NLP Normalization:** Advanced normalization handling spelling variants (`الـ` prefix, hamzas `أ/إ/آ`, taa marbuta `ة/ه`, and mosque synonyms `جامع/مسجد`).
- **Power Actions:** 1-click changeset creation via OSM OAuth 2.0 PKCE, multi-item batch staging queues (max 25 items), JOSM Remote Control (`localhost:8111`), and iD Editor deep-links.

### Mode 2: Reverse QA & Back-Linking (OSM &rarr; Wikidata)
Scans existing OpenStreetMap elements carrying `wikidata=*` tags to detect errors and add missing reciprocal statements on Wikidata:
- **Missing Back-links:** Items where OSM links to a valid Wikidata QID, but Wikidata lacks the corresponding external identifier (`P11693` for nodes, `P10689` for ways, `P402` for relations).
- **Broken OSM Tags:** Malformed QIDs (e.g. `q851`, full URLs), deleted QIDs, and redirected QIDs with 1-click replacement.
- **Wrong-Key Misuse:** Flags non-physical tagging and suggests secondary tag migration:
  - `Q5` (human) &rarr; suggest `name:etymology:wikidata` or `subject:wikidata`.
  - Brand/company retail chains &rarr; suggest `brand:wikidata` or `operator:wikidata`.
  - Taxa (`Q16521`) &rarr; suggest `species:wikidata`.
- **Multi-Tag Conflict Engine (5 Buckets):**
  1. `relation_with_members`: Benign (e.g. Haramain Railway `Q737791` = 1 `r` + 270 member `w`). Evaluates `P402` on the relation only.
  2. `split_linear_ways`: Benign OSM segmentation (e.g. Wadi Hanifah = 116 `w`, King Fahd Rd = 51 `w`). Suppresses `P10689` to respect Wikidata single-value constraint.
  3. `place_node_plus_boundary_rel`: Benign. `P11693` and `P402` are distinct and both valid.
  4. `duplicate_poi_representation`: Flagged for cleanup (node + building way within 150 m).
  5. `parent_admin_or_unrelated_pollution`: Critical OSM bug (e.g. Jazan governorates pasted onto 60+ unrelated villages and mountain peaks). Flagged for tag removal.
- **Wikidata In-App Writes:** Authenticated writes via MediaWiki OAuth 2.0 PKCE with `maxlag=5`, `baserevid` conflict checks, `429` backoff, and [EditGroups](https://editgroups.toolforge.org) summary links.

### Datasets Catalog (`data/`)

| Dataset File | Target Country | Contents |
|---|---|---|
| `data/summary.json` | All GCC | Overall statistics, per-country counts, `reverse_counts`, and UTC ISO-8601 `updated_at` |
| `data/<cc>.json` (`sa, ae, kw, qa, bh, om`) | Individual | Forward conflation candidates: 15-element tuple layout `[0..14]`. **Slot contract locked for Manara.** |
| `data/reverse_<cc>.json` | Individual | Reverse QA records: `kind`, `subkind`, `confidence`, `osm_type`, `osm_id`, `qid`, `labels`, `reasons` |

---

## 2. Hard Constraints (MUST RESPECT)

### 2.1 Standing Constraints
- **Ask before every `git push`.** Pushing to `origin/main` → green CI → `deploy.yml` rebuilds and redeploys production through the Coolify API.
- **Secrets live only in Coolify environment variables.** Never write database credentials, tokens, or private keys into git, docs, logs, or chat.
- **Commit style:** Conventional Commits (`type(scope): description`) with an explanatory body and `Co-Authored-By` trailer.
- **Language policy:** Always respond in English by default. Preserve Arabic text in code, strings, and translations intact.

### 2.2 VPS & Coolify Topology
- **Host:** `159.195.192.148` (Debian 13, 2 vCPU AMD EPYC Genoa, 3.8 GiB RAM, 2 GiB swap).
- **Edge Proxy:** **Coolify 4.5 / Traefik (`coolify-proxy`) owns host ports 80/443.** There is no host Caddy or Nginx. Never attempt to bind host ports 80 or 443.
- **Neighboring services:**
  - **rahmahealth.net** (`nn0yw94zrb6w7lbgpmzt3jko`) — **NEVER touch Rahma containers.**
  - **Manara** (`manara-web`, `manara-api`, `manara-db`, `manara-pipeline`).
- **Resource budget for `osm x wikidata`:**
  - `osmwd-web`: Capped at **128 MiB** RAM (actual ~15–20 MiB).
  - `osmwd-api`: Capped at **256 MiB** RAM (actual ~55–80 MiB).
  - **Total RAM:** &le; 110 MiB, leaving > 1.8 GiB headroom on the VPS.
  - The offline data pipeline (`update_data.py`) and ML training remain completely **off the VPS** (run locally or in GitHub Actions).
- **Shared Umami Analytics:**
  - Uses the VPS's shared Umami instance (`analytics.rahmahealth.net`, v3.0.3).
  - Proxied same-origin under `/stats/*` via Caddy (`/stats/script.js` and `/stats/api/send` only). `/stats/login` returns 404.

### 2.3 OpenStreetMap Compliance
- **No bulk reads from `api.openstreetmap.org`, ever.**
- Bulk data comes exclusively from **Geofabrik's public GCC extract** (`gcc-states-latest.osm.pbf`) scanned locally via `pyosmium`.
- In-app live verifications (`/api/v1/verify/{qid}` or browser Overpass) are **single-element, user-triggered on-click only**.
- Writes to OSM:
  - Must send an explicit `created_by` / `User-Agent`.
  - Respect HTTP 429 `Retry-After`.
  - Batch size strictly capped at **25 elements** per changeset with polite &ge; 600 ms spacing.
  - Informative changeset comments with human-readable Arabic/English names, QIDs, and `#osm-wikidata-gcc`.
  - No blind "fix-all" buttons. Every edit requires human confirmation.
- **Tile usage:** Basemaps use CARTO Voyager and Esri World Imagery only. **Zero requests to `tile.openstreetmap.org`**.

### 2.4 Wikimedia Compliance
- Authenticated writes to Wikidata use MediaWiki OAuth 2.0 PKCE.
- Must send `Api-User-Agent: OSMxWikidataLinker/2.0 (+https://wikidata.saudiosm.org/)`.
- Must include `maxlag=5` and `baserevid` on all `wbcreateclaim` / statement operations.
- Must honor upstream HTTP 429 and 503 `Retry-After` headers.
- Must run `/api/v1/edits/preview` before writing to assert entity existence, redirect state, and absence of conflicts.
- Edits must carry an **EditGroups** custom-tool summary suffix:
  `([[:toolforge:editgroups/b/CB/{batch_hex8}|details]])`.
- Maximum batch size: **25 statements** per user-confirmed batch with &ge; 600 ms spacing.

---

## 3. Infrastructure & Resources

### 3.0 How Deploys Actually Work
- osmwd is a Coolify **Service** (raw docker-compose), uuid **`wxlmccgoeqyzdt9mhzd7ty1m`**, in Coolify at `https://coolify.rahmahealth.net`. Its build context is `https://github.com/Abdullah201x/osm-x-wikidata.git#main`, so every redeploy rebuilds from the current `main`.
- A Service has **no git webhook**. Pushing alone deploys nothing.
- `.github/workflows/deploy.yml` is the deploy path:
  - it runs on `workflow_run` of **CI** (pushes to main) and **Update OSM x Wikidata Datasets** (bot data commits), only when they succeed;
  - it calls `GET $COOLIFY_URL/api/v1/deploy?uuid=wxlmccgoeqyzdt9mhzd7ty1m`;
  - its `verify-live` job then waits (≤ 12 min) until the live `index.html` byte-matches the commit, `/api/healthz/freshness` is 200, `/data/reverse_sa.json` is 200 and `/api/v1/reverse?cc=sa` is non-empty.
- Required GitHub secrets: `COOLIFY_URL` (`https://coolify.rahmahealth.net`) and `COOLIFY_TOKEN` (a Coolify API token with *deploy* permission; Coolify Settings → Advanced → API Access must be on).
- `ci.yml` job `docker-build` builds both images, runs `caddy validate`, and asserts the API image loads `summary.json` + `reverse_sa.json`. That is the exact failure that kept production broken.
- Manual deploy: Coolify UI → the osmwd service → **Redeploy**, or GitHub → Actions → Deploy → *Run workflow*.

### 3.1 Live Containers (Coolify Service `wxlmccgoeqyzdt9mhzd7ty1m`, Network: `coolify`)

| Container / Service | Base Directory | Dockerfile | Internal Port | Memory Cap | Target Domain / Proxy |
|---|---|---|---|---|---|
| **`osmwd-web`** | `/` | `Dockerfile` | `:80` | `128 MiB` | `https://wikidata.saudiosm.org` (Traefik &rarr; Caddy) |
| **`osmwd-api`** | `/` | `backend/Dockerfile` | `:8010` | `256 MiB` | Internal only: proxied by Caddy `handle /api/*` |

### 3.2 Environment Variables

| Variable | Service | Default | Purpose |
|---|---|---|---|
| `OSMWD_DATA_DIR` | `osmwd-api` | `app/data` (or repo `data/`) | Absolute path to directory containing `summary.json` and `reverse_*.json` |
| `OSMWD_MAX_DATASET_AGE_HOURS` | `osmwd-api` | `216` (9 days) | Threshold for `/api/healthz/freshness` to return 503 (matches weekly Monday CI run) |
| `OSMWD_DOMAIN` | `osmwd-api` | `https://wikidata.saudiosm.org` | Canonical origin for CORS headers |
| `OSMWD_API_URL` | `osmwd-web` | `http://osmwd-api:8010` | Upstream backend address for Caddy `reverse_proxy` |
| `OSM_PBF` | pipeline | Auto-detected | Path to local `.osm.pbf` file for `update_data.py` |

### 3.3 OAuth Client Registry

| Provider | Client / Consumer ID | Scopes | Redirect URI | Environment |
|---|---|---|---|---|
| **OpenStreetMap** | `66V3GYmV7X9ZP9zIimXwk1Pi-R2YWBLz2peCFLjcImE` | `read_prefs`, `write_api`, `write_notes` | `https://wikidata.saudiosm.org/` | Public / Non-confidential PKCE |
| **OpenStreetMap Dev** | User-configured in `.auth-bar` | `read_prefs`, `write_api`, `write_notes` | `https://wikidata.saudiosm.org/` | Sandbox (`master.apis.dev.openstreetmap.org`) |
| **Wikimedia** | Proposed on Meta-Wiki (`*` all projects) | `basic`, `editpage` | `https://wikidata.saudiosm.org/` | Public / Non-confidential PKCE |
| **Wikimedia Test** | Configured via sandbox toggle | `basic`, `editpage` | `https://wikidata.saudiosm.org/` | Sandbox (`test.wikidata.org`) |

---

## 4. Phase History: "DONE & Live" Log

| Commit | Date | Phase / Step | Summary |
|---|---|---|---|
| `944355c` | 2026-10-01 | Initial | Initial commit: OpenStreetMap x Wikidata GCC Conflation Workbench |
| `e7a3a99` | 2026-10-03 | Core Feature | Batch linking, changeset activity history, smart comments & instant map view refresh |
| `e64c3ac` | 2026-10-03 | Security/Fix | XSS hardening, broken history modal, wrong Wikidata classes & pipeline bugs |
| `3f7c4c8` | 2026-10-03 | Compliance | Overhaul `OSM_IMPORT_GUIDELINES.md` with OAuth workflows & correct P31 ontology |
| `d2972bd` | 2026-10-29 | Plan Phase 1 & 2 | Implement Phase 1 reverse analysis engine and Phase 2 FastAPI backend |
| `4a952e8` | 2026-10-29 | Plan Phase 3 | Self-host vendor assets, Caddyfile container, Dockerfile, and CI workflows |
| `3e871e8` | 2026-10-29 | Plan Phase 4 | Reverse QA UI with Leaflet clusters, side drawer, and QuickStatements export |
| `52c097a` | 2026-10-29 | Plan Phase 5 | Implement Wikidata OAuth PKCE, in-app statement write, EditGroups, and QuickStatements 1-click |
| `cbd4952` | 2026-10-30 | Deploy | Add Coolify Docker Compose deployment recipe (`docker-compose.coolify.yml`) |
| `813a848` | 2026-11-01 | Deploy/Fix | Fix Caddyfile global servers block for trusted_proxies and healthcheck wget |
| `ddc8b4f` | 2026-11-01 | Level-Up P0.1 | Enable `SlowAPIMiddleware` and route limits (20/min verify, 30/min preview) |
| `89276b1` | 2026-11-01 | Level-Up P0.2 | Cap POST request bodies at 16 KB with streaming size enforcement |
| `4bcdad1` | 2026-11-01 | Level-Up P0.3 | Restrict reverse `cc` query parameter to the 6 GCC codes (`sa,ae,kw,qa,bh,om`) |
| `cda6417` | 2026-11-01 | Level-Up P0.4 | Replace naive clear with real `OrderedDict` LRU cache, bounded locks, honor upstream 429 |
| `a4ea5df` | 2026-11-01 | Level-Up P0.5 | Detect redirected Wikidata items in edit preview with `redirects=yes` |
| `ca166d5` | 2026-11-01 | Level-Up P0.6 | Replace inline `onclick` in batch manager success view (`addEventListener`) |
| `f636fbd` | 2026-11-01 | Level-Up P0.7 | Write summary `updated_at` as UTC ISO-8601 with `Z` suffix |
| `c31c1b5` | 2026-11-01 | Level-Up P0.8 | Drop obsolete GitHub Pages deploy steps from `update-data.yml` |
| `2372b67` | 2026-11-01 | Level-Up P0.9 | Cache-bust vendor assets and unify asset version constant (`ASSET_VERSION = "2.1.0"`) |
| `3a411b0` | 2026-11-01 | Level-Up P0.10 | Repo hygiene: untrack stale GeoJSON, pin `joblib`, slim API Docker image |
| `5ec45de` | 2026-11-01 | Level-Up P0.11 | Make Wikidata writes authenticated, lag-aware (`maxlag=5`), and refreshable |
| `2b4878a` | 2026-11-01 | Level-Up P0.12 | Run `/api/v1/edits/preview` before every in-app Wikidata write |
| `a5f45cb` | 2026-11-01 | Level-Up P0.13 | Generate reverse QA datasets for all six GCC countries |
| `254bdee` | 2026-11-01 | Level-Up P1 | Establish HANDOFF.md, README rewrite, and ADR planning parity |
| `1576630` | 2026-11-01 | Level-Up P2 (fixes) | Fix reverse-mode shortcuts / URL hash `ReferenceError`, `#mode=reverse` deep links, and missing translations |
| `32e81e5` | 2026-11-01 | Level-Up P2 (tooling) | eslint + Vitest + Playwright (production CSP), `serve_ssl.py --http --csp`, CI `frontend` job |
| `2602086` | 2026-11-01 | Level-Up P3 | Harden Python test suite with offline mocks, dataset integrity checks, and 16 test files (118 tests) |
| `77f5919` | 2026-11-01 | Level-Up P4 | CI/CD parity with Manara: split 3-job workflow (python-tests, frontend, smoke), npm dependabot, and `.gitattributes` |
| `e2d160a` | 2026-11-01 | Level-Up P5 | Data safety: port `pipeline/validate_data.py` shrink guard (<20% drop) and atomic writes (`.tmp` + `os.replace`) |
| `5614b67` | 2026-11-01 | Level-Up P6 | Security & CSS: Caddy HSTS and Permissions-Policy headers, refactor inline styles to CSS utility classes |
| `4c2dc73` | 2026-11-01 | Docs | Record Level-Up phases 3-6 commits and verification counts in HANDOFF |
| `e790549` | 2026-11-01 | Fix | Resolve container DATA_DIR hierarchy and support Arabic layout keyboard shortcuts |
| `Phase 8` | 2026-11-01 | Level-Up P8 | Surpass Manara: Ruff linter/formatter, pyproject.toml, pytest-cov, SECURITY.md, CHANGELOG.md |

---

## 5. Operations & Incident Runbook

### 5.1 Deployment Rollback
If a newly pushed commit breaks production:
The Service always builds from `main`, so rollback means making `main` good again:
1. Locally revert the offending commit:
   ```bash
   git revert <bad-commit>
   # Ask the user before pushing:
   git push origin main
   ```
2. CI goes green, then `deploy.yml` redeploys and `verify-live` confirms the result.
3. Emergency (CI itself broken): after the revert lands, use Coolify UI (`https://coolify.rahmahealth.net`) → osmwd service → **Redeploy**, or run *Deploy* from the Actions tab.

### 5.2 Bad Data Recovery
If an automated weekly pipeline run in GitHub Actions publishes corrupted data or causes regression:
1. Locate the offending data commit on `main`.
2. Revert the commit locally:
   ```bash
   git revert <bad-data-commit-hash>
   # Ask user for push confirmation:
   git push origin main
   ```
3. Green CI triggers `deploy.yml`, which redeploys the previous valid datasets.

### 5.3 UptimeRobot Alert Response
- **Alert on `/api/healthz/freshness` (HTTP 503):**
  - **Cause:** `data/summary.json` has `updated_at` older than `OSMWD_MAX_DATASET_AGE_HOURS` (216 hours / 9 days).
  - **Resolution:** Check GitHub Actions (`update-data.yml`). If failed, inspect run logs (e.g. network timeout during SPARQL query or PBF download). Trigger manual run from GitHub Actions UI or locally:
    ```bash
    python update_data.py --country all
    # Review changes, commit, ask user, then push.
    ```
- **Alert on `/healthz` or `/api/healthz` (HTTP 502/504 or connection failure):**
  - **Check VPS container status:**
    ```bash
    ssh root@159.195.192.148 "docker ps --filter name=osmwd"
    ssh root@159.195.192.148 "docker logs --tail 50 osmwd-api"
    ```
  - Restart containers if needed:
    ```bash
    ssh root@159.195.192.148 "docker restart osmwd-api osmwd-web"
    ```

### 5.4 OAuth Client Rotation
- **OSM OAuth Client ID:**
  - If rotated on `openstreetmap.org`, update `DEFAULT_CLIENT_ID` in `js/osm_oauth.js`.
  - Invalidate old cached IDs from clients by bumping the version token or clearing `localStorage["osm_oauth_client_id"]`.
- **Wikimedia OAuth Consumer:**
  - If rotated on Meta-Wiki, update `DEFAULT_CLIENT_ID` in `js/wikidata_auth.js`.

---

## 6. Useful Verification Commands

### Local Testing & Linting
```bash
# 1. Run all Python unit & integration tests (126 tests across 17 test files, offline, mocked):
python -m pytest tests/ -q

# 2. Local preview server with the production CSP (copied from deploy/Caddyfile.container):
python serve_ssl.py --csp                  # https://localhost:8000 (needs cert.pem/key.pem; accept self-signed cert)
python serve_ssl.py --http --csp --port 8765   # plain HTTP, no certs (what Playwright uses)
#   --api http://127.0.0.1:8010 proxies /api/* to a local uvicorn; without it /api/* answers 503.

# 3. Frontend checks (dev-only tooling; the site itself needs no build):
npm ci                # first time
npm run lint          # eslint js
npm test              # Vitest + jsdom, loads js/*.js unmodified via tests/js/load-script.js
npm run smoke         # Playwright, desktop 1280x800 + mobile 390x844; Chrome locally, Chromium in CI
npm run smoke:fast    # desktop project only
```

### Production Health Checks
```bash
# Web server health (Caddy)
curl -sI https://wikidata.saudiosm.org/healthz

# Backend API health & dataset freshness
curl -sI https://wikidata.saudiosm.org/api/healthz
curl -sI https://wikidata.saudiosm.org/api/healthz/freshness

# Verify Content-Security-Policy & Security Headers
curl -sI https://wikidata.saudiosm.org/ | grep -iE 'content-security-policy|x-content-type|strict-transport'

# API verify endpoint (rate-limited at 20/min)
curl -s "https://wikidata.saudiosm.org/api/v1/verify/Q851"

# Remote VPS container stats
ssh root@159.195.192.148 "docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}' | grep osmwd"
```

---

## 7. Working Preferences & Windows Development Gotchas

### Working Preferences
- **Default response language:** English.
- **Arabic content preservation:** Keep Arabic UI labels, changeset comments, and translations intact.
- **Ask before every push:** A push to `main` redeploys production. Local commits are fine without asking.
- **Plan first, build with verification:** Propose phase steps and provide test verification before declaring completion.

### Windows Dev Machine Gotchas
1. **Python default encoding (CP1252):**
   Windows defaults to `cp1252`. Always specify `encoding="utf-8"` in any Python `open()` or file reading call.
2. **Line endings (CRLF vs LF):**
   Shell scripts, `deploy/Caddyfile.container`, and Dockerfiles must use `LF` line endings. Git on Windows may warn about CRLF; maintain `.gitattributes` to enforce `eol=lf` for Linux container assets.
3. **PowerShell vs Bash:**
   The workspace is on Windows 11 with PowerShell. When executing terminal commands, use PowerShell syntax or cross-platform Python scripts rather than complex Bash heredocs.
4. **Self-signed SSL certificates (`serve_ssl.py`):**
   `cert.pem` and `key.pem` in the root directory provide local HTTPS for testing OAuth callbacks. They are gitignored and intended for local dev only.
