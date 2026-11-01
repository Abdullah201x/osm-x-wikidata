# LEVEL_UP_PLAN — Bring *OSM × Wikidata GCC Linker* to Manara's engineering level

> Deliverable on approval: this file is copied verbatim to
> `C:\Users\abdul\Desktop\osm x wikidata\LEVEL_UP_PLAN.md`. Nothing else is executed.

## Context

The reference project **Manara** (`C:\Users\abdul\Desktop\GCC20260707`) and this project share an author, a VPS, a Coolify setup, a Caddy-in-container pattern, and even code lineage (Manara's `i18n.js` is modelled on this repo's `translations.js`; Manara's `pipeline/run.py` downloads `osm-x-wikidata/main/data/sa.json`).

Manara is ahead mostly on **engineering process**, not features:

| Area | Manara (reference) | OSM × Wikidata (today) |
|---|---|---|
| Agent handoff doc | `HANDOFF.md` with "START HERE", constraints, live resources, runbooks, verification commands | none; plan doc only |
| Plan doc | `REDESIGN.md` with decisions table D1–D6, per-phase *Exit criteria / RAM / Compliance* lines, §7 verification | `BACKEND_AND_REVERSE_LINKER_PLAN.md` (no decisions table, no per-phase exit criteria) |
| Python tests | 16 files / ~146 tests, DB mocked, no network | 3 files / 19 tests; backend tests hit live Wikidata; depend on committed `data/reverse_bh.json` |
| Frontend lint | ESLint 10 flat config | none |
| Frontend unit tests | Vitest, 15 files / ~138 cases | none (≈6,000 lines of JS untested) |
| E2E | Playwright: routes × ar/en × desktop/mobile, CSP-violation check, network-compliance test | none |
| Cross-language consistency test | `tests/test_tags.py` (validator.js ⇄ content/tags) | none |
| CI | 3 jobs (pytest · lint+test+build · smoke), concurrency cancel, timeouts, artifact upload | 1 job (pytest), no concurrency/timeouts |
| Dependabot | pip + npm + docker + actions, grouped weekly | pip + docker + actions (OK; add npm once it exists) |
| CSP | single source in Caddyfile, *also enforced in preview/e2e* | Caddyfile only; one inline `onclick` already violates it |
| Headers | CSP + HSTS + Permissions-Policy + nosniff + Referrer-Policy, `-Server` | no HSTS, no Permissions-Policy |
| Rate limiting | slowapi working, per-route limits | **non-functional** (no `SlowAPIMiddleware`, no decorators) |
| Data safety | `validate_data.py` blocks publish on >20% shrink; atomic publish | none; Action commits whatever the pipeline produced |
| Monitoring | 3 UptimeRobot monitors, Umami wired | planned only; Umami proxied but script never loaded |
| `.gitattributes` | `*.sh`, `deploy/**` → `eol=lf` | none (Windows dev box → CRLF risk in Caddyfile/compose) |
| Commits | Conventional Commits `type(scope): …` + body + Co-Authored-By | mixed styles |
| Claude memory | 3 standing-constraint memory files | empty memory dir |

Goal: close every gap above so the two repos are at parity. Fix the real bugs found during the audit too. Manara has no CLAUDE.md, CONTRIBUTING, CHANGELOG, SECURITY.md, Prettier, coverage, pre-commit or CodeQL, so none of those are needed for parity. They are optional extras (Phase 8).

### Standing constraints (carry into every phase)
- **Ask before every `git push`.** A push to `main` triggers a Coolify production build. *This differs from Manara, where pushing to main is OK.*
- Secrets live only in Coolify env vars. Never put them in git or docs.
- Never risk OSM / Wikimedia blocks. Tests and CI must never write to production OSM or Wikidata. Sandbox writes go to `master.apis.dev.openstreetmap.org` / `test.wikidata.org` only.
- VPS budget is 2 vCPU / 3.8 GiB, shared with Manara (which already uses about 2.3 GiB in caps). This app stays within api 256 MiB + web 128 MiB.
- `data/sa.json` must stay committed at that path on `main`, because Manara's pipeline downloads it.
- Reply in English. Conventional Commits with a body plus a `Co-Authored-By` trailer.

---

## Decisions (lightweight ADRs, mirroring Manara REDESIGN §6)

| # | Decision | Rationale |
|---|---|---|
| D1 | Add a **dev-only** `package.json` (ESLint, Vitest + jsdom, Playwright). **No bundler.** The site keeps shipping plain `<script>` files. | Gets Manara's lint/test/e2e parity without rewriting 13 global-script files into ES modules. A Vite migration can be revisited later as its own decision. |
| D2 | The pipeline keeps running in **GitHub Actions** (not a VPS container). Remove the GitHub Pages deploy steps. | Saves VPS RAM (Manara's pipeline already takes 1.5 GiB). Data stays in git, which Manara depends on. Coolify redeploys on the data commit. |
| D3 | **CSP has one source:** `deploy/Caddyfile.container`. The local/e2e server reads it with a regex, the same way Manara's `vite.config.js` does. | E2E then fails on any CSP regression before it reaches production. |
| D4 | Backend tests are **offline only**. Wikidata/OSM HTTP is mocked, with small synthetic fixtures under `tests/fixtures/`. | Deterministic CI that never touches Wikimedia. |
| D5 | No database, so no `pg_dump`. **Git is the backup.** The runbook covers rollback by commit and Coolify redeploy. | Same safety level, different mechanism. |

---

## Phase 0 — Fix audit bugs (COMPLETE)

All 13 items completed across commits `ddc8b4f` … `a5f45cb`:
1. **Rate limiting actually on:** `app.add_middleware(SlowAPIMiddleware)`, `@limiter.limit("20/minute")` on verify, `@limiter.limit("30/minute")` on preview. Tested with 429 assertion on 21st call (`ddc8b4f`).
2. **Request body cap:** 16 KB enforced via middleware on POST routes (`89276b1`).
3. **`cc` allowlist:** `sa|ae|kw|qa|bh|om` regex query parameter validation (`4bcdad1`).
4. **`verify.py` robustness:** `collections.OrderedDict` popitem LRU cache, bounded locks, upstream 429 `Retry-After` honor & 503 propagation (`cda6417`).
5. **`preview.py`:** `redirects=yes` enabled for Wikidata redirect detection (`a4ea5df`).
6. **Wikidata write path:** Authenticated MediaWiki writes with `crossorigin=`, `maxlag=5`, `baserevid`, upstream retry, and refresh token renewal (`5ec45de`).
7. **Preview before write:** `/api/v1/edits/preview` called before every in-app write (`2b4878a`).
8. **Inline handlers eliminated:** `js/batch_manager.js` `onclick=` replaced with `addEventListener` (`ca166d5`).
9. **Timezone format:** `update_data.py` writes UTC ISO-8601 `Z` format; `healthz.py` accepts both formats (`f636fbd`).
10. **`update-data.yml`:** Dropped obsolete GitHub Pages deploy steps and permissions; Python 3.12 (`c31c1b5`).
11. **Cache-busting:** Added `?v=` to vendor URLs and unified `ASSET_VERSION = "2.1.0"` (`2372b67`).
12. **Repo hygiene:** Untracked stale geojson, pinned `joblib`, slimmed API Docker image (`3a411b0`).
13. **Reverse datasets:** Generated for all 6 GCC countries (`reverse_*.json`) with `reverse_counts` in `summary.json` (`a5f45cb`).

**Exit criteria achieved:** 37 passed tests in pytest. Rate-limit test returns 429. Zero inline handlers.

---

## Phase 1 — Documentation & agent handoff (COMPLETE)

1. **`HANDOFF.md`** created and verified:
   - **START HERE (next agent):** exact verification command (`python -m pytest tests/ -q` &rarr; 37 passed), current test counts, and last commit.
   - **Hard constraints:** standing constraints, OSM import guideline compliance, Wikimedia bot/edit-rate policy, Manara upstream contract.
   - **Live resources table:** Coolify containers (`osmwd-web`, `osmwd-api`), domain (`wikidata.saudiosm.org`), memory caps (128M web, 256M api), healthcheck URLs, Umami site proxy, OAuth client IDs.
   - **Env-var table:** `OSMWD_DATA_DIR`, `OSMWD_MAX_DATASET_AGE_HOURS` (216), `OSMWD_DOMAIN`, `OSMWD_API_URL`, `OSM_PBF`.
   - **Per-phase "DONE & Live" log:** backfilled from initial commit through Phase 0 and Phase 1.
   - **Operations runbook:** rollback, bad-data recovery, OAuth rotation, UptimeRobot alert response.
   - **Verification commands & environment gotchas:** curl checks, Windows cp1252/CRLF gotchas, local SSL certificates.
2. **`README.md` rewritten:**
   - Bilingual title (`OSM × Wikidata GCC Linker & Reverse QA Workbench | منصة الربط والتحقق الثنائي بين خريطة الشارع المفتوحة وويكي بيانات لدول الخليج`).
   - Live URL and CI badges.
   - Complete accurate structure tree (`backend/`, `deploy/`, `vendor/`, `tests/`, etc.).
   - Both modes (Forward Conflation + Reverse QA), Wikidata OAuth PKCE, FastAPI backend, Docker/Coolify deploy.
   - Test execution and prerequisites.
3. **Upgraded `BACKEND_AND_REVERSE_LINKER_PLAN.md`:**
   - Decisions Table (D1–D5).
   - *Exit criteria / RAM impact / Compliance* lines per phase.
   - "Verification for every phase" section.
   - Performance budget (app shell &le; 150 KB brotli, first map paint &le; 2.5 s on 4G, `sa.json` size tracked).
   - Operational status checklist.
4. **Claude memory files created:**
   - `C:\Users\abdul\.claude\projects\C--Users-abdul-Desktop-osm-x-wikidata\memory\MEMORY.md`
   - `osmwd-osm-wikimedia-compliance.md`
   - `osmwd-vps-hosting.md`
   - `ask-before-push.md`

**Exit criteria achieved:** A fresh agent can go from `HANDOFF.md` START HERE block to a green local test run (37 passed) without reading anything else.

---

## Phase 2 — Frontend tooling (D1)

1. **`package.json`** at the root (private, `"type": "module"` for config files only).
   - devDependencies: `eslint@10`, `globals`, `vitest`, `jsdom`, `@playwright/test`.
   - Commit `package-lock.json`.
   - Scripts:
     - `lint`: `eslint js`
     - `test`: `vitest run`
     - `smoke`: `playwright test`
     - `smoke:fast`: a chromium desktop-only subset
2. **`eslint.config.js`** (flat).
   - Copy Manara's `frontend/eslint.config.js` shape: `files: ["js/**/*.js"]`, ignore `vendor/**`, ecmaVersion 2023, `sourceType: "script"`.
   - Browser globals plus `L` plus this project's cross-file globals (`App`, `BatchManager`, `HistoryManager`, `TRANSLATIONS`, …).
   - Rules: `no-undef: error`, `no-unused-vars: warn` (same as Manara).
3. **Make pure logic testable without a bundler.**
   - Pure helpers (escapeHtml, QuickStatements export, MapRoulette/CSV export, batch caps/spacing, smart changeset comments, Wikidata state-prefix/PKCE helpers, translation lookup) end with `if (typeof module !== "undefined") module.exports = {...}`.
   - Alternatively, Vitest loads them into a jsdom `window` via a small `tests/js/load-script.js` helper that `eval`s the file. The helper is preferred because it needs zero changes to production code.
4. **Vitest suites** in `tests/js/*.test.js`. Target ≥ 10 files, ≈ 100 cases:
   - `translations` (ar/en key parity, no empty strings)
   - `escape`
   - `exports` (QuickStatements/CSV/GeoJSON shape)
   - `batch` (25-item cap, 600 ms spacing with fake timers)
   - `osm_oauth` (state prefix `osm_` ignored/accepted, hash restore)
   - `wikidata_auth` (PKCE S256, `wd_` state CSRF check, refresh flow)
   - `wikidata_edit` (`crossorigin=`, `maxlag`, `baserevid`, 429 retry, preview-before-write)
   - `filters`
   - `keyboard shortcuts`
5. **Local/e2e server with the production CSP (D3).** Extend `serve_ssl.py`, reusing its existing handler; don't write a new server:
   - add a `--csp` flag that parses the `Content-Security-Policy` value out of `deploy/Caddyfile.container` (regex, as in Manara's `vite.config.js`);
   - add `--http` for CI (no certs);
   - proxy `/api/*` to a locally started uvicorn, or serve fixture JSON.
6. **Playwright** (`playwright.config.js`, `e2e/*.e2e.js`; the naming keeps Vitest from picking them up). Copy Manara's config shape: 1 worker, 120 s timeout, 1 retry in CI, `trace: retain-on-failure`, a `webServer` running the server above.
   - `ui.e2e.js`: forward and reverse modes × ar/en × desktop 1280×800 and mobile 390×844. Asserts:
     - no `pageerror`;
     - **no CSP violations** (`securitypolicyviolation` listener);
     - no failed same-origin requests;
     - correct `<html lang/dir>`;
     - no horizontal overflow;
     - the modals open and close.
   - `network.e2e.js` (compliance). Fail if the page contacts:
     - `tile.openstreetmap.org`;
     - any OSM or Wikidata **write** endpoint;
     - Overpass on page load.
     Route all third-party traffic to stubs.
   - `oauth.e2e.js`: login buttons build correct authorize URLs (PKCE params, state prefixes), intercepted and never followed.

**Exit criteria:** `npm run lint` is clean (warnings allowed). `npm test` and `npm run smoke` are green locally on Windows and in CI.

---

## Phase 3 — Python test hardening (D4)

1. **`tests/conftest.py`** with shared fixtures:
   - a synthetic `reverse_xx.json` + `summary.json` in `tmp_path`, with `OSMWD_DATA_DIR` monkeypatched;
   - a `TestClient` fixture;
   - an HTTP mock for Wikidata/OSM. Add `respx` (httpx) or `responses` (requests) to dev requirements, whichever matches the client each router uses.
2. **Rewrite `tests/test_backend_api.py`** so it never touches the network. `/verify/Q851` gets a deterministic 200 from the mock. Add cases:
   - 429 rate limit;
   - body cap → 413;
   - bad `cc` → 422;
   - upstream 429 → 503 with `Retry-After`;
   - freshness with both timestamp formats;
   - HEAD on every healthz route.
3. **New pipeline tests:**
   - `test_matcher.py`
   - `test_ml_matcher.py` (loads the committed joblib; asserts the feature vector shape and known-pair ordering)
   - `test_arabic_normalizer.py`
   - `test_physicality_filter.py`
   - `test_wikidata_fetcher.py` (mocked SPARQL, cache hit/miss)
   - `test_update_data.py` (summary.json schema, UTC `Z` timestamp)
   - `test_validate_data.py` (Phase 5)
4. **Cross-language consistency tests** (Manara `test_tags.py` pattern):
   - `test_translations_parity.py` parses `js/translations.js`, asserts identical key sets in `ar` and `en`, and checks that every `data-i18n="…"` in `index.html` exists.
   - `test_csp_inline.py` fails on any inline `on*=` handler or `<script>` without `src` in `index.html`/`js/`.
   - `test_cache_bust.py` checks that every local `<script>`/`<link>` in `index.html` carries `?v=`.
5. Move data-dependent tests off `data/reverse_bh.json` onto fixtures.

**Exit criteria:** ≥ 15 Python test files and ≥ 100 tests, all green with networking disabled (`pytest -p no:cacheprovider` with a socket-blocking fixture).

---

## Phase 4 — CI/CD parity

1. **`.github/workflows/ci.yml`** rewritten to mirror Manara's three jobs:
   - top-level `concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }`;
   - `python-tests` (timeout 5 min): py 3.12, pip cache on both requirements files, `python -m pytest -q`;
   - `frontend` (timeout 5 min): Node 22, npm cache, `npm ci`, `npm run lint`, `npm test`;
   - `smoke` (timeout 15 min): `npm ci`, `npx playwright install --with-deps chromium`, `npm run smoke` with `CI=true`. On failure, upload `playwright-report` and `test-results` (7-day retention);
   - `docker-build` (timeout 10 min, beyond Manara): `docker build` both images, no push. This catches Caddyfile syntax errors like the one fixed in `813a848`, using `caddy validate` inside the image.
   - Keep `paths-ignore` for `data/**`. Drop the `**.md` ignore once HANDOFF/README tests exist.
2. **`.github/dependabot.yml`:** add the `npm` ecosystem for `/`, grouped `patterns: "*"`, weekly, `open-pull-requests-limit: 5`. Document in HANDOFF the "review, don't auto-merge (merge = deploy)" policy. Triage the 4 Dependabot branches already open.
3. **`.gitattributes`:** `*.sh text eol=lf`, `deploy/** text eol=lf`, `Dockerfile text eol=lf`, `*.py text eol=lf`.
4. **`update-data.yml`:** after the Phase 0 cleanup, add `python pipeline/validate_data.py` before the commit step, so the job fails without committing if validation fails. Add `timeout-minutes` and a concurrency group `update-data`.

**Exit criteria:** a PR shows 4 green checks. A deliberately broken Caddyfile or inline `onclick` fails CI.

---

## Phase 5 — Data safety & operations parity

1. **`pipeline/validate_data.py`** (port of Manara's). Block publishing when:
   - any `data/<cc>.json` or `reverse_<cc>.json` is missing or invalid JSON;
   - an item count shrank by more than 20% against the previous committed version;
   - `summary.json` lacks `updated_at` / `reverse_counts`.
   It exits non-zero with a clear message. `update_data.py` calls it at the end, and the Action calls it again.
2. **Atomic data writes in `update_data.py`:** write to `*.tmp`, then `os.replace` it, so a crashed run never leaves a half-written JSON.
3. **Monitoring:** create 3 UptimeRobot monitors (5 min, email alerts, HEAD-compatible):
   - `/healthz`
   - `/api/healthz`
   - `/api/healthz/freshness` (503 once data is older than 216 h)
   Record them in HANDOFF.
4. **Umami:** add the `<script defer src="/stats/script.js" data-website-id="…">` tag. The ID is not a secret, but keep it in one place, and add the `data-host-url` same-origin setting. The CSP already allows `'self'`.
5. **Structured logs:** replace `print()` in `backend/app/store.py` with `logging` (INFO, single-line). Manara still uses print, so this is a cheap improvement rather than a parity item.
6. **Rollback runbook** (D5) in HANDOFF: Coolify → Deployments → redeploy the previous commit; `git revert <data-commit>` for bad data.

**Exit criteria:** a fake 30%-shrink dataset makes `validate_data.py` exit 1 in a test. All monitors are green. Umami records a pageview with no CSP violation.

---

## Phase 6 — Security headers, accessibility, i18n, performance

1. **Caddyfile headers:**
   - `Strict-Transport-Security "max-age=31536000; includeSubDomains"`;
   - `Permissions-Policy` (geolocation=(self), camera=(), microphone=(), …) as in Manara;
   - keep the existing `-Server`.
   Then try dropping `style-src 'unsafe-inline'` by moving the 28 inline `style=""` attributes in `index.html` into `css/style.css` classes. JS-set `element.style` is still allowed under CSP.
2. **`innerHTML` audit:** grep every `innerHTML` and confirm each one goes through `escapeHtml` or uses `textContent`. Add an ESLint `no-restricted-properties` warning to make new ones visible.
3. **Accessibility** (Manara level: ARIA on the main page):
   - modals get `role="dialog"`, `aria-modal`, `aria-labelledby`, a focus trap, focus restore and Esc;
   - icon-only emoji buttons get `aria-label` (translated via `data-i18n-aria`);
   - add a `:focus-visible` style, an `.sr-only` utility and `prefers-reduced-motion`;
   - live region for toast messages;
   - keyboard shortcuts fall back to `KeyboardEvent.code` so they work on an Arabic layout (port Manara `src/keys.js`).
4. **i18n:** replace the hard-coded "Arabic / English" `title=` pairs with `data-i18n-title` keys. Use CSS logical properties where `[dir="ltr"]` overrides exist.
5. **Performance budget enforcement:** add an e2e assertion on total transferred bytes for the app shell, excluding `data/*.json`. Track `sa.json` brotli size in HANDOFF. A stretch goal (log it as decision D6 if pursued) is splitting `sa.json` by status or region for lazy loading. **This must keep `data/sa.json` intact for Manara.**

**Exit criteria:** securityheaders.com grade A. The Playwright smoke run asserts no CSP violations with `'unsafe-inline'` removed, if that was achieved. Keyboard-only walkthrough of both modes works.

---

## Phase 7 — Finish open product items from the existing plan

- Phase 5C OSM tag-repair modal (replace / migrate / remove `wikidata=`, with a diff confirmation). Verify whether it is present in `js/osm_oauth.js`, then build or finish it.
- History tabs and daily pace indicator.
- Resolve the plan's §11/§12 open decisions: final subdomain, Meta-Wiki OAuth consumer approval, Umami ID, and sandbox write verification on `test.wikidata.org`.
- Run the plan's verification checklist end to end and record the results in HANDOFF.

---

## Phase 8 — Optional (beyond Manara parity)

- `ruff` (lint + format) for Python and a `pre-commit` config.
- `pytest-cov` with a coverage floor.
- CodeQL, and pinning the Python deps (`pip-tools` lock).
- Run the web container as non-root.
- `SECURITY.md` and `CHANGELOG.md`.

---

## Conventions for executing this plan
- One phase per branch or commit series, using Conventional Commits:
  - `fix(api): enable slowapi middleware and per-route limits`
  - `feat(e2e): …`
  - `docs(handoff): …`
  - `ci: …`
- Each commit gets an explanatory body and the `Co-Authored-By` trailer.
- Commit messages name the plan step, e.g. `… (Level-up Phase 0 step 1)`.
- **Ask before every push.** Update HANDOFF's "DONE & Live" log after each phase.

## Critical files
- **Backend:** `backend/app/main.py`, `backend/app/routers/{verify,preview,reverse,healthz}.py`, `backend/app/store.py`, `backend/Dockerfile`
- **Frontend:** `js/wikidata_edit.js`, `js/wikidata_auth.js`, `js/batch_manager.js`, `js/translations.js`, `index.html`, `css/style.css`
- **Pipeline:** `update_data.py`, new `pipeline/validate_data.py`
- **Deploy and CI:** `deploy/Caddyfile.container`, `.github/workflows/{ci,update-data}.yml`, `.github/dependabot.yml`
- **Tooling:** `serve_ssl.py` (reused as the CSP-enforcing e2e server)
- **New:** `HANDOFF.md`, `package.json`, `eslint.config.js`, `playwright.config.js`, `tests/conftest.py`, `tests/js/`, `e2e/`, `.gitattributes`

## Reuse from Manara (copy and adapt; don't reinvent)
- `frontend/eslint.config.js`: lint config shape
- `frontend/playwright.config.js` and `frontend/e2e/{routes,network}.e2e.js`: e2e structure, CSP-violation and forbidden-host checks
- `frontend/vite.config.js`: the regex that extracts CSP from the Caddyfile
- `tests/test_tags.py`: the cross-language consistency test pattern
- `pipeline/validate_data.py`: the shrink-guard logic
- `backend/app/main.py` + `auth.py`: the working slowapi wiring and per-route limits
- `frontend/src/keys.js`: layout-independent shortcuts
- `.github/workflows/ci.yml`, `.github/dependabot.yml`, `.gitattributes`
- `HANDOFF.md` §§ START HERE, 9 (runbook), 10 (verification commands), 11 (preferences)

## Verification (end-to-end, after all phases)
1. `python -m pytest -q`: ≥ 100 tests, green, with networking blocked.
2. `npm ci && npm run lint && npm test && npm run smoke`: green on Windows and in CI.
3. A PR to `main` shows 4 green jobs. A planted inline `onclick` or a broken Caddyfile fails CI.
4. `docker compose -f deploy/docker-compose.coolify.yml build`: both images build, and `caddy validate` passes.
5. Production (after an approved push):
   - `curl -I` on `/healthz`, `/api/healthz` and `/api/healthz/freshness` all return 200;
   - response headers include CSP, HSTS and Permissions-Policy;
   - 25 rapid `/api/v1/verify/Q42` calls produce a 429.
6. Browser: both modes in ar/en, zero console CSP violations, an Umami pageview recorded, and one sandbox Wikidata write on `test.wikidata.org` through the preview-then-write path.
7. `ssh … docker stats --no-stream`: api < 256 MiB, web < 128 MiB.
8. A fresh agent following HANDOFF "START HERE" alone reproduces steps 1–2.
