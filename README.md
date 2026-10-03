# OSM × Wikidata GCC Linker & Missing Entries Finder

A high-performance web workbench and hybrid data pipeline designed to couple **OpenStreetMap (OSM)** data with **Wikidata** across the 6 GCC countries (**Saudi Arabia, UAE, Kuwait, Qatar, Bahrain, Oman**).

Developed for power users and the GCC mapping community, this project highlights Wikidata entities that are **missing in OpenStreetMap** so mappers can add them with 1-click tag presets, detects potential candidate matches, and integrates directly with **JOSM Remote Control** and **OSM iD Editor**.

---

## 🌟 Key Features

* **🤖 Machine Learning Conflation Engine**: Uses a trained `HistGradientBoostingClassifier` (ROC-AUC 0.996) evaluated on strictly local spatial neighborhoods (10m–400m) to predict candidate match probabilities with AI confidence percentages.
* **🛡️ Physicality & Ground Truth Guard**: Automatically filters out 6,200+ non-physical entities (events, disasters, pandemics, drone strikes, timelines, and blank GeoNames imports) to ensure strict compliance with the OSM Ground Truth rule.
* **⚡ Local `.osm.pbf` Engine**: Uses `pyosmium` to stream through local GCC PBF extracts in under a minute without Overpass rate limits or network timeouts.
* **🔍 Arabic Linguistic Normalization**: Advanced NLP normalization handles spelling variants (`الـ` prefix, hamza variants `أ/إ/آ`, taa marbuta `ة/ه`, and mosque synonyms `جامع/مسجد`) for high-precision candidate matching.
* **🕌 Smart Category Filtering**: Segregates the 72,000+ Saudi mosques from other critical infrastructure (heritage sites, hospitals, schools, mountains, islands, settlements) so power users can focus on specific mapping targets.
* **🔗 Flexible Single & Multi-Item OSM Linking (API 0.6)**: 
  * **Single Item Mode**: 1-click instant edit with pre-flight comment review in a dedicated single changeset.
  * **Batch Queue Mode**: Stage multiple candidate edits across the map into a changeset queue and upload them all in **ONE unified OSM Changeset** (following OSM community guidelines to prevent changeset clutter).
* **💬 Intelligent, Community-Compliant Changeset Comments**: Generates informative comments with human-readable Arabic & English feature names, country context, QIDs, and community hashtags (`#osm-wikidata-gcc`), along with customizable preset chips (`[Verified with aerial imagery]`, `[Name match confirmed]`).
* **📜 Dedicated Activity & History Page ("What Has Been Done")**: Complete activity center displaying all changesets created via the tool, summary KPIs (total changesets, elements linked, batch vs single breakdown), search and filters, 1-click map zooming to past edits, and CSV/JSON export.
* **🎯 JOSM Remote Control (`localhost:8111`)**:
  * **Load & Zoom**: Jump directly to the bounding box in JOSM.
  * **Push Tags**: 1-click push of `wikidata=Q...` to candidate OSM elements.
  * **Add Node**: Instant creation of new nodes in JOSM with pre-filled tags (`name`, `name:ar`, `name:en`, `wikidata`, `wikipedia`, `amenity`, etc.).
* **✏️ OSM iD Editor & Notes API**: Direct deep-links to iD Editor and in-app OSM Notes creation (authenticated via OAuth 2.0 PKCE or anonymous).
* **🛰️ High-Resolution Satellite Verification**: Seamless switching between Dark Mode, Esri World Imagery (Satellite), and OSM Streets to visually verify physical structures on the ground.
* **🔄 Hybrid Live OSM Verifier**: 1-click on-demand micro-query against live OSM servers (150m radius) to check if an item was mapped after the PBF extract was generated.
* **📦 Community Export Tools**: Export any filtered subset as a **MapRoulette Challenge (GeoJSON)** for mapping sprints, or as a CSV/QuickStatements table.

---

## 📂 Project Structure

```
├── .github/workflows/
│   └── update-data.yml       # Automated weekly GitHub Actions sync & deploy
├── data/
│   ├── summary.json          # Overall & per-country statistics
│   ├── bh.json               # Bahrain dataset
│   ├── kw.json               # Kuwait dataset
│   ├── qa.json               # Qatar dataset
│   ├── ae.json               # UAE dataset
│   ├── om.json               # Oman dataset
│   └── sa.json               # Saudi Arabia dataset
├── pipeline/
│   ├── config.py             # GCC metadata & P31-to-OSM ontology
│   ├── arabic_normalizer.py  # Arabic NLP normalizer & string similarity
│   ├── pbf_extractor.py      # pyosmium PBF scanner with SQLite caching
│   ├── wikidata_fetcher.py   # SPARQL client with SQLite caching
│   └── matcher.py            # Spatial join & candidate detection
├── css/
│   └── style.css             # Dark glassmorphic design system
├── js/
│   ├── translations.js       # Arabic & English localizations
│   ├── arabic_utils.js       # Client-side Arabic search & normalization
│   ├── tag_generator.js      # P31 -> OSM tag preset generator & OSM XML
│   ├── tools.js              # JOSM 8111, iD Editor & MapRoulette exporter
│   ├── osm_oauth.js          # OSM OAuth 2.0 PKCE & Changeset API 0.6
│   ├── live_verify.js        # Real-time 150m Overpass verifier
│   ├── batch_manager.js      # Staging queue & multi-item changeset manager
│   ├── history_manager.js    # Activity log, KPI stats, & CSV/JSON export
│   ├── map.js                # Leaflet map engine & marker clustering
│   └── app.js                # State controller & UI wiring
├── index.html                # Main application interface
├── OSM_IMPORT_GUIDELINES.md  # Official OSM Import Policy & Compliance Guide
├── update_data.py            # Master pipeline runner
└── README.md
```

---

## ⚠️ Important: OSM Import Guidelines Compliance

Adding missing features or bulk data from Wikidata into OpenStreetMap is officially classified as an **Import** under the **[OSMF Import Guidelines](https://wiki.openstreetmap.org/wiki/Import/Guidelines)**.

Before using the **Add Node in JOSM** feature or uploading new nodes to OpenStreetMap:
* Please read **[`OSM_IMPORT_GUIDELINES.md`](OSM_IMPORT_GUIDELINES.md)**.
* Follow the 6 mandatory steps: Community Consultation, OSM Wiki documentation, dedicated import account, small pilot test, mandatory changeset tags, and imagery ground-truth verification.


---

## 🚀 Running the Data Pipeline Locally

### Prerequisites
```bash
pip install requests shapely osmium scikit-learn joblib numpy
```

### Run for a Specific Country (e.g. Bahrain or Kuwait)
```bash
python update_data.py --country bh
```

### Run for All GCC Countries
```bash
python update_data.py --country all
```

### Force Refresh from Wikidata SPARQL
```bash
python update_data.py --refresh-wikidata
```

---

## 🔗 Master Updater Integration

This project can be integrated as part of a multi-project OSM pipeline updater (such as `update_projects.py` in your local OSM workspace).
Whenever you drop a new `.osm.pbf` file into your local PBF directory and run:

```bash
python update_projects.py
```

All connected regional mapping projects update their datasets concurrently!

---

## 🌐 Running the Web Application Locally

Serve the workspace directory with any static server:

```bash
# Python built-in HTTP server
python -m http.server 8000
```
Then open `http://localhost:8000` in your browser.

---

## 🛠️ JOSM Remote Control Setup

1. Open **JOSM**.
2. Go to **Preferences** (F12) &rarr; **Remote Control** (tower icon).
3. Check **Enable remote control**.
4. Ensure port `8111` is open.
5. In the web app, click **Load & Zoom in JOSM** or **Push Tag to JOSM**.

---

## 👤 Maintainer, Community Feedback & DWG Compliance

* **Maintainer**: **[Alshowaiey](https://www.openstreetmap.org/user/Alshowaiey)** (OpenStreetMap Profile)
* **Direct OSM Message**: Send inquiries or feedback via **[OpenStreetMap Messages](https://www.openstreetmap.org/message/new/Alshowaiey)**.
* **GitHub Issues**: Report false positive conflation matches or tag suggestions on **[GitHub Issues](https://github.com/Abdullah201x/osm-x-wikidata/issues)**.
* **Saudi OSM Community**: Chat with regional contributors on Telegram: **[@OSMSaudi](https://t.me/OSMSaudi)**.
* **DWG & OSMF Notice**: This application operates strictly as an **assisted manual conflation workbench** requiring individual mapper authentication, visual aerial confirmation, and explicit user consent. We perform **no blind automated bot imports**. If you are a member of the Data Working Group (DWG) or local mapping community and have questions, suggestions, or concerns regarding tagging schemes or workflows, please reach out directly and we will gladly collaborate.
