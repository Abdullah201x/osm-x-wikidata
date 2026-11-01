"""
Configuration for OSM x Wikidata Backend API (osmwd-api).
"""

import os

def resolve_data_dir() -> str:
    """
    Multi-tier discovery for datasets directory:
    1. Explicit OSMWD_DATA_DIR environment variable (if valid directory).
    2. Container path /app/data (where backend/Dockerfile copies datasets).
    3. Repository root data/ (local development).
    """
    env_dir = os.environ.get("OSMWD_DATA_DIR")
    if env_dir and os.path.isdir(env_dir):
        return env_dir

    # In Docker container: /app/app/config.py -> parent is /app -> /app/data
    container_candidate = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
    if os.path.isdir(container_candidate):
        return container_candidate

    # In local development: backend/app/config.py -> parent is backend -> root -> data/
    repo_candidate = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "data")
    if os.path.isdir(repo_candidate):
        return repo_candidate

    return env_dir or container_candidate

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = resolve_data_dir()

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

