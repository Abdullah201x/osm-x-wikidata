# OSM x Wikidata GCC Linker & Reverse QA Workbench

Bidirectional web workbench and offline data pipeline coupling OpenStreetMap (OSM) and Wikidata across the 6 GCC countries (SA, AE, KW, QA, BH, OM). FastAPI backend (`osmwd-api`), Python pipeline (`pipeline/`), plain-JS/HTML/CSS static frontend (no build step).

## Hard rules
- Never open or read `.env`, `*.db`, `*.pbf`, `*.geojson`, `cert.pem`, `key.pem`, `data/`, `node_modules/`, `vendor/`, `test-results/`, `.pytest_cache/`, `.ruff_cache/`, or `__pycache__/`.
- Never commit secrets, `.env`, `*.pem`, `*.key`, or personal machine paths (this is a public repository).
- Keep edits human-in-the-loop: no blind bulk bot writes to OSM or Wikidata; respect the import gate and `docs/OSM_IMPORT_GUIDELINES.md`.
- Keep frontend dependencies self-hosted in `vendor/` (zero external CDN dependencies; strict CSP in `deploy/Caddyfile.container`).

## Commands
- Local static server: `python serve_ssl.py --http --csp` (or `python serve_ssl.py` for HTTPS)
- Pipeline update: `python update_data.py`
- Python tests: `pytest -q -x --tb=short` (scope with `-k` or a single file)
- Python lint: `python -m ruff check`
- Frontend lint & unit tests: `npm run lint` and `npm test`
- E2E smoke tests: `npm run smoke:fast`
- File map (where is X?): `docs/PROJECT_MAP.md` - check it before searching.

## Layout
- `backend/app/` FastAPI service (`main.py`, `store.py`, `routers/`)
- `pipeline/` Offline PBF/SPARQL extraction, matching, ML conflation, and reverse QA
- `js/`, `css/`, `index.html` Static SPA frontend
- `tests/` Python (`test_*.py`) and JS (`tests/js/*.test.js`) unit tests
- `e2e/` Playwright smoke tests
- `deploy/` Caddyfile and Coolify Docker Compose config
- `docs/` Project map, import guidelines, and planning/design docs

## Working style
- Reply concisely: state the change or direct answer without restating the task.
- Make the smallest change that fits; add or update tests for behavior or rule changes.
- Run only the relevant tests, not the entire suite, unless asked.
