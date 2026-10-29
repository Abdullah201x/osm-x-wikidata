"""
Configuration for OSM x Wikidata Backend API (osmwd-api).
"""

import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.environ.get("OSMWD_DATA_DIR", os.path.join(BASE_DIR, "data"))

# Maximum dataset freshness before health freshness alerts (default 216 hours = 9 days)
MAX_DATASET_AGE_HOURS = float(os.environ.get("OSMWD_MAX_DATASET_AGE_HOURS", "216"))

DOMAIN = os.environ.get("OSMWD_DOMAIN", "https://wikidata.saudiosm.org")

ALLOWED_ORIGINS = [
    DOMAIN,
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "https://localhost:8000",
    "http://localhost:3000",
]

USER_AGENT = "OSMxWikidataLinker/2.0 (+https://wikidata.saudiosm.org/)"

