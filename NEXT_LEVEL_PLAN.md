# NEXT_LEVEL_PLAN: OSM × Wikidata GCC Linker, from "engineered" to "shipped, safe, fast, useful"

## Context

The Level-up phases 0–6 and 8 brought the repo up to Manara's engineering level (tests, CI, CSP, validation). But the audit for this plan found that **none of that work is live**, and that the product still has gaps.

**Production is stale (verified via read-only SSH and the Coolify DB):**
- `osmwd` is a Coolify **Service** (raw compose, uuid `wxlmccgoeqyzdt9mhzd7ty1m`). Its build context is `https://github.com/Abdullah201x/osm-x-wikidata.git#main`.
- Services have no git webhook. It was built once on 2026-11-01 12:45 UTC and has never redeployed. HANDOFF and memory both say "push = auto-deploy", which is false for this app.
- Live symptoms:
  - the site serves `app.js?v=10` (repo: `v=11`);
  - `/data/reverse_sa.json` returns 404;
  - the API store is empty (old `DATA_DIR` bug, fixed in `e790549` but never deployed);
  - `/api/healthz/freshness` returns 503 and `/api/v1/reverse` returns 0 items.

**Product and policy gaps:**
- **Imports are prohibited.** Wikidata → OSM feature creation (the "missing" items plus Create-node / copy-XML / JOSM-presets / MapRoulette) must be visible **only to OSM users the owner approves**.
- **Performance.** `sa.json` is 8.9 MB raw / 1.8 MB brotli (~2 s to download) and parses 83k items on the main thread. 76k of those are "missing" items, which most users will no longer see.
- **Accessibility.** The Phase 6 a11y items were never done: 0 `role="dialog"`, no focus trap, no `:focus-visible`, no reduced-motion, no live region. There are also 48 `style="…"` strings, which force CSP `style-src 'unsafe-inline'`.
- **Unfinished items.**
  - Phase 7: the tag repair uses a bare `confirm()` with no diff; there are no history tabs and no daily pace indicator.
  - Monitoring: none (UptimeRobot).
  - Umami: never loaded.
- **ML matcher quality is unmeasured.** `pipeline/ml_matcher.py:train_matcher_model`:
  - reports **in-sample** ROC-AUC;
  - the hard-negative cap is global, so early positives take every negative, and the inner `break` only exits one loop;
  - negatives start at ≥10 m while positives can be <10 m, so the model learns "distance < 10 m = match" as a leaky shortcut.
  - Data refreshes only weekly.

**User decisions (2026-11-01):**
- All four focus areas are in scope. **Skip MapRoulette** (no new MapRoulette work; the existing export moves behind the import gate).
- Non-approved users see **no missing items at all**.
- The allowlist is **backend-verified** (OSM user IDs in a Coolify env var).
- Deploys are **CI-gated via the Coolify API**.
- Read-only SSH is allowed. Any restart or redeploy needs explicit approval.

### Standing constraints (every phase)
- **Ask before every `git push`.** After Phase A, a push to `main` really does deploy (through CI).
- **Ask before any production action:** Coolify redeploy, container restart, secrets.
- Never write secrets to git, docs or logs. The `Authorization` header must never be logged.
- `data/sa.json` stays at that path with the 15-slot tuple layout intact (Manara contract).
- OSM/Wikimedia compliance:
  - single-element, user-triggered reads only;
  - no `tile.openstreetmap.org`;
  - writes need human confirmation.
- Stay within VPS caps: web 128 MiB, api 256 MiB.
- Conventional Commits with a body plus `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Commits name the step, e.g. `(Next-level Phase B step 2)`.

---

## Phase A: Make production current and deployable (first)

1. **Workflow `.github/workflows/deploy.yml`** (new).
   - Triggers:
     - `workflow_run` on `CI` and on `Update OSM x Wikidata Datasets`, `types: [completed]`, `branches: [main]`, `if: conclusion == 'success'`. This works for both cases: data commits pushed by the bot via `GITHUB_TOKEN` don't trigger `push` workflows, but their workflow's completion does trigger `workflow_run`.
     - `workflow_dispatch`.
   - `concurrency: deploy` (no cancel). `timeout-minutes: 20`.
   - Job `deploy`: `curl -fsS -H "Authorization: Bearer $COOLIFY_TOKEN" "$COOLIFY_URL/api/v1/deploy?uuid=wxlmccgoeqyzdt9mhzd7ty1m&force=false"`, using secrets `COOLIFY_URL` and `COOLIFY_TOKEN`.
   - Job `verify-live` (needs `deploy`): poll every 20 s for up to 12 min until all of these hold:
     - the live `/` HTML equals `index.html` at `${{ github.event.workflow_run.head_sha }}` (byte compare; `index.html` carries every `?v=`);
     - `/api/healthz/freshness` returns 200;
     - `/api/v1/reverse?cc=sa&page_size=1` returns `total > 0`;
     - `/data/reverse_sa.json` returns 200.
   - The job fails loudly otherwise.
2. **Pre-deploy guard.** In `ci.yml`, add a `docker-build` job (planned in old Phase 4, never added): `docker build` both images, then `docker run --rm <web> caddy validate --config /etc/caddy/Caddyfile`. Deploy waits on a green CI, so this guard runs first.
3. **User actions** (I'll give the exact clicks):
   - Coolify → Keys & Tokens → create an API token with `deploy` permission. Make sure the API is enabled and reachable from GitHub runners.
   - Add the GitHub secrets `COOLIFY_URL` and `COOLIFY_TOKEN`.
   - **With your approval**, trigger one manual redeploy now so production catches up.
4. **Docs truth fix.**
   - HANDOFF §START HERE/§3/§5.1: describe the Service-based deploy, the CI-gated deploy job, how to redeploy manually, and how to roll back (re-run `deploy.yml` on an older SHA with `workflow_dispatch` + `ref`).
   - Update memory `ask-before-push.md` and `osmwd-vps-hosting.md` with the Service uuid and "deploy = CI deploy job".
   - Add a CHANGELOG entry.

**Exit:** after the approved redeploy, `/api/healthz/freshness` returns 200, the live HTML has `v=11`, and `/data/reverse_sa.json` returns 200. Pushing a no-op docs commit (after asking) runs CI → deploy → verify-live, all green.

---

## Phase B: Import gate + linkable dataset (policy and performance together)

1. **Backend `GET /api/v1/me`** in the new `backend/app/routers/me.py`, registered in `backend/app/main.py`.
   - Reads `Authorization: Bearer <osm token>` and calls `https://api.openstreetmap.org/api/0.6/user/details.json` once (httpx, `USER_AGENT` from `app/config.py`, 5 s timeout).
   - Returns `{uid, display_name, can_import}`.
   - `can_import = uid in OSMWD_IMPORT_ALLOWLIST`: a comma-separated list of numeric OSM uids, parsed in `app/config.py`. An empty list means nobody can import.
   - Caches by `sha256(token)` for 15 min, reusing the `OrderedDict` LRU pattern from `backend/app/routers/verify.py`.
   - `@limiter.limit("10/minute")`.
   - Upstream 401 → 401. Upstream 429/5xx → 503 with `Retry-After` (same handling as verify).
   - Never stores or logs the token.
   - Only production OSM tokens are accepted. Dev-sandbox logins are always `can_import=false`.
2. **Pipeline: `data/<cc>_linkable.json`.**
   - `update_data.py` writes these next to `<cc>.json`. Same envelope and the same 15-slot tuples, filtered to status ∈ {1, 2}. Counts drop `missing`.
   - Atomic write, using the same `.tmp` + `os.replace` helper already in `update_data.py`.
   - `pipeline/validate_data.py` also checks: the linkable file exists, contains no status-0 items, has `count == candidates + linked`, and stays under 2 MB raw for `sa`.
   - Generate it once locally for all six countries from the current data. A small `--derive-linkable` mode filters the existing JSON, so no PBF is needed.
3. **Frontend gate.** New `js/import_access.js`, loaded before `app.js` with `?v=`.
   - `ImportAccess.check()` runs after `OsmAuth.handleCallback()` / on startup when logged in. It calls `/api/v1/me` with the OSM token and keeps `canImport` in memory only. Logout resets it.
   - `app.js:loadCountry` fetches `data/${cc}_linkable.json` unless `canImport`, in which case it fetches the full `data/${cc}.json`. Re-load when access changes.
   - When `!canImport`:
     - hide the "missing" stat card, the status-0 filter option and the `filterHideLinked`-adjacent missing UI;
     - hide `btn-josm-add-node` (`app.js:1015`), the new-node XML copy, `btn-export-josm-presets` and the MapRoulette export (`app.js:1882`);
     - a deep link to a status-0 QID shows a translated "restricted" notice.
   - Translated strings in `js/translations.js` (ar + en; the parity tests enforce both).
4. **Docs.**
   - README and `OSM_IMPORT_GUIDELINES.md`: explain the gate and how to grant access (add the uid to the Coolify env, then redeploy).
   - HANDOFF env-var table: `OSMWD_IMPORT_ALLOWLIST`.
   - SECURITY.md: the token is relayed to OSM only for identity and is never stored.
5. **Tests.**
   - pytest `tests/test_me.py` (respx-mocked OSM): allowlisted, not allowlisted, 401, upstream 429, cache hit, no token, and rate limit.
   - Vitest `tests/js/import_access.test.js`: dataset URL choice, hidden controls.
   - Playwright: an anonymous user sees no missing markers, gets no `/data/sa.json` request, and has no Create-node button. A stubbed `/api/v1/me` with `can_import:true` restores them.
   - `network.e2e.js`: assert an anonymous page load fetches `sa_linkable.json`, not `sa.json`.

**Exit:** anonymous first load of SA transfers about 10× less data, and no import affordance is reachable without an allowlisted OSM login.

---

## Phase C: Ops & quality

1. **Monitoring.** I write the exact UptimeRobot setup; you create the monitors (account access): HEAD on `/healthz`, `/api/healthz` and `/api/healthz/freshness`, every 5 min, email alerts. Record them in HANDOFF §5.3.
2. **Umami.** You create the website in Umami (`analytics.rahmahealth.net`) and give me the ID. I add `<script defer src="/stats/script.js?v=…" data-website-id="…" data-host-url="">` to `index.html`. Update the `network.e2e.js` allowlist and stub `/stats/*` in e2e.
3. **Accessibility** (old Phase 6.3; nothing done yet). New `js/dialog.js` with `Dialog.open(el, triggerEl)` / `Dialog.close(el)`:
   - focus trap, focus restore and Esc;
   - sets `role="dialog"`, `aria-modal="true"` and `aria-labelledby`.
   - Use it for all modals in `index.html` (shortcuts, about, lightbox, note, single-link, batch, history) instead of the ad-hoc `style.display` toggles.
   - Icon-only buttons (`btn-about-modal`, `btn-shortcuts-modal`, …) get `data-i18n-aria` labels.
   - `css/style.css`: `:focus-visible`, `.sr-only`, `@media (prefers-reduced-motion)`.
   - Toasts and alerts go to an `aria-live="polite"` region.
   - Replace the hard-coded "ar / en" `title=` pairs with `data-i18n-title`.
4. **Drop `style-src 'unsafe-inline'`.**
   - Move the 48 `style="…"` strings (`js/app.js` 27, `index.html` 16, `batch_manager.js` 2, `map.js` 2, `history_manager.js` 1) into `css/style.css` classes. Initial `display:none` becomes a `[hidden]`/`.is-hidden` class. JS `el.style.x = …` stays allowed.
   - Then remove `'unsafe-inline'` from `deploy/Caddyfile.container`.
   - The e2e CSP listener (`e2e/ui.e2e.js`) proves there are no violations.
   - Extend `tests/test_csp_inline.py` to fail on `style="` in `index.html`/`js/`.
5. **Structured logs.** Replace the `print()` calls in `backend/app/store.py` with `logging`.

**Exit:** a keyboard-only walkthrough of both modes works. Smoke is green with no `'unsafe-inline'`. Monitors are green. An Umami pageview is recorded with no CSP violation.

---

## Phase D: Mapper features (no MapRoulette)

1. **Tag-repair diff confirmation.** Replace the `confirm()` at `js/app.js:578` with a dialog (Phase C `Dialog`):
   - It shows the element's **current live tags** next to the proposed change (red/green rows).
   - The tags come from the single-element read that `OsmAuth.repairOsmTag` already does (`js/osm_oauth.js:570`); split it into `previewOsmTagRepair()` and `applyOsmTagRepair()`.
   - It also shows the changeset comment, which the user can edit.
   - It aborts if the live value no longer matches the dataset (the element changed since the scan).
2. **History tabs and daily pace.** `js/history_manager.js` gets tabs: OSM changesets | Wikidata edits | Reverse fixes. A "today: N / 25-per-batch, last 7 days" pace bar, built from local history timestamps, nudges polite editing rates.
3. **Shareable item links.** `parseUrlHash` already accepts `#mode=…&country=…&qid=…`. Add a 🔗 "copy link" button to the forward and reverse detail panels, and make sure `updateUrlHash()` writes `qid`/OSM ref when an item is selected.
4. **Progress-over-time dashboard.**
   - `update_data.py` appends one row per run to `data/progress.json` (`{date, cc, linked, candidates, missing_backlink, broken, conflict}`), capped at 400 rows.
   - The about/stats panel draws a small inline-SVG sparkline per country for linked and backlinks fixed. There is no chart library (CSP- and size-friendly).
   - Validate the schema in `validate_data.py`.

**Exit:** each feature has Vitest and Playwright coverage. The repair flow is tested end-to-end against stubbed OSM with a diff shown and the comment edited, and it never touches the real OSM in tests.

---

## Phase E: Data quality

1. **Fix training.** In `pipeline/ml_matcher.py:train_matcher_model`:
   - cap negatives **per positive** (≤3 each) instead of a global cap, and fix the nested `break`;
   - sample negatives from 0–400 m (drop the 10 m floor) so distance isn't a label leak;
   - add hard negatives that share a name but have a different QID.
2. **Honest evaluation.** New `pipeline/evaluate_matcher.py`:
   - `GroupKFold` by QID;
   - reports ROC-AUC, plus precision/recall/F1 at the production threshold 0.60 (`find_ml_candidate`) and the precision@top-1 the candidate picker actually uses;
   - writes `data/matcher_metrics.json`.
   - `validate_data.py` fails the publish if precision@0.60 is < 0.90 or drops > 3 points against the previous committed metrics.
3. **Retrain.**
   - Retrain locally on today's linked pairs and commit the new `ml_matcher_model.joblib` only if held-out metrics beat the current model on the same folds.
   - Record before/after numbers in CHANGELOG.
   - Add `retrain` as a `workflow_dispatch` input on `update-data.yml`.
   - Unit tests in `tests/test_ml_matcher.py`: negatives are distributed per positive, there is no distance-floor asymmetry, and the eval script runs on a tiny synthetic SQLite fixture.
4. **Daily refresh.**
   - Change the `update-data.yml` cron to daily at 04:00 UTC. Geofabrik's extract is daily; WDQS gets the same 6 queries per day with our UA.
   - Lower `OSMWD_MAX_DATASET_AGE_HOURS` to `50`.
   - Write the data JSON **one item per line** (still valid JSON; Manara unaffected) so daily git deltas stay small. Track `.git` size in HANDOFF.
   - Skip the commit when nothing except `updated_at` / progress changed. Still commit `summary.json` so freshness advances.

**Exit:** `matcher_metrics.json` is committed with held-out numbers. A daily run produces a validated commit, which triggers the Phase A deploy and verify-live.

---

## Critical files
- **New:** `.github/workflows/deploy.yml`, `backend/app/routers/me.py`, `js/import_access.js`, `js/dialog.js`, `pipeline/evaluate_matcher.py`, `data/<cc>_linkable.json`, `data/progress.json`, `data/matcher_metrics.json`, `tests/test_me.py`, `tests/js/import_access.test.js`
- **Modified:**
  - CI and deploy: `.github/workflows/{ci,update-data}.yml`, `deploy/Caddyfile.container`
  - Backend: `backend/app/{main,config,store}.py`
  - Pipeline: `update_data.py`, `pipeline/{validate_data,ml_matcher}.py`
  - Frontend: `js/{app,osm_oauth,history_manager,translations,tools}.js`, `index.html`, `css/style.css`
  - E2E: `e2e/*.e2e.js`
  - Docs: HANDOFF.md, README.md, CHANGELOG.md, SECURITY.md, OSM_IMPORT_GUIDELINES.md
- **Reuse:**
  - LRU + 429 handling from `backend/app/routers/verify.py`;
  - `limiter` from `backend/app/limiter.py`;
  - atomic-write helper in `update_data.py`;
  - shrink-guard structure in `pipeline/validate_data.py`;
  - `tests/js/load-script.js` and `app-harness.js` for Vitest;
  - the CSP listener in `e2e/ui.e2e.js`;
  - `serve_ssl.py --http --csp --api` for e2e.

## Verification
1. Locally after each phase:
   - `python -m ruff check && python -m pytest -q` (offline; the count grows from 126);
   - `npm run lint && npm test && npm run smoke`.
2. Phase A (after approved redeploy and push), all must hold:
   - `curl -sI https://wikidata.saudiosm.org/api/healthz/freshness` returns 200;
   - the live HTML contains `app.js?v=11` (or newer);
   - `/data/reverse_sa.json` returns 200;
   - the GitHub runs CI → deploy → verify-live are all green.
3. Phase B: the anonymous DevTools network tab shows `sa_linkable.json` (~1 MB raw) and no missing markers. With the owner's uid in `OSMWD_IMPORT_ALLOWLIST`, the import UI appears after login. Tampering with localStorage doesn't reveal it.
4. Phase C:
   - the live headers show CSP without `'unsafe-inline'`;
   - a keyboard-only pass works through every dialog (Tab cycles inside, Esc closes, focus returns);
   - the Umami dashboard shows a pageview;
   - all 3 UptimeRobot monitors are up.
5. Phase D: on `master.apis.dev.openstreetmap.org` (sandbox toggle), one tag repair shows the diff, applies, and appears in the History "Reverse fixes" tab.
6. Phase E:
   - `python pipeline/evaluate_matcher.py` prints held-out metrics ≥ the floor;
   - `workflow_dispatch` of `update-data.yml` commits validated data and the deploy follows automatically;
   - `ssh … docker stats --no-stream`: api < 256 MiB, web < 128 MiB.
7. Update HANDOFF's "DONE & Live" log after each phase. Ask before each push.
