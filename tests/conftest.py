"""
Global Pytest Fixtures & Offline Enforcement for osm x wikidata.

Enforces Decision D4:
- All tests run 100% offline. Network socket calls to non-loopback addresses are blocked.
- Synthetic fixtures for datasets in tmp_path.
- Respx and responses mocks for Wikidata and OSM endpoints.
"""

import json
import socket
import sys
from pathlib import Path
import pytest
import respx
from fastapi.testclient import TestClient

ROOT_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT_DIR / "backend"

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app.main import app
from app.store import DatasetStore


# 1. Block external network access across all tests
ALLOWED_HOSTS = {"127.0.0.1", "::1", "localhost"}

_orig_connect = socket.socket.connect

def guarded_connect(self, address):
    host = address[0] if isinstance(address, (tuple, list)) else address
    if host not in ALLOWED_HOSTS and not str(host).startswith("127."):
        raise RuntimeError(f"Offline test violation: attempted external network connection to {host}")
    return _orig_connect(self, address)

@pytest.fixture(autouse=True)
def block_external_sockets(monkeypatch):
    """Ensure no test makes real network calls outside localhost."""
    monkeypatch.setattr(socket.socket, "connect", guarded_connect)


# 1b. Hermetic country boundaries: CI has no PBF and the real gcc_boundaries.geojson is
# gitignored, so every test uses a small simplified committed fixture instead.
BOUNDARIES_FIXTURE = ROOT_DIR / "tests" / "fixtures" / "gcc_boundaries_simplified.geojson"

@pytest.fixture(autouse=True)
def hermetic_country_boundaries(monkeypatch):
    import pipeline.country_boundaries as cb
    monkeypatch.setattr(cb, "BOUNDARIES_GEOJSON", str(BOUNDARIES_FIXTURE))
    monkeypatch.setattr(cb, "_MATCHER_INSTANCE", None)


# 2. Synthetic Dataset Fixtures
@pytest.fixture
def synthetic_data_dir(tmp_path, monkeypatch):
    """Creates a complete synthetic data directory in tmp_path."""
    data_dir = tmp_path / "data"
    data_dir.mkdir(parents=True, exist_ok=True)

    summary_content = {
        "updated_at": "2026-11-01T12:00:00Z",
        "pbf_file": "gcc-states-latest.osm.pbf",
        "total_osm_linked": 42,
        "total_wikidata_candidates": 100,
        "countries": {
            "BH": {
                "name": "Bahrain",
                "osm_linked": 12,
                "candidates": 20,
                "matched": 10,
                "reverse_counts": {
                    "total": 5,
                    "missing_backlink": 2,
                    "broken_osm_tag": 1,
                    "conflict": 1,
                    "review_gap": 1
                }
            },
            "SA": {
                "name": "Saudi Arabia",
                "osm_linked": 30,
                "candidates": 80,
                "matched": 40,
                "reverse_counts": {
                    "total": 10,
                    "missing_backlink": 5,
                    "broken_osm_tag": 2,
                    "conflict": 2,
                    "review_gap": 1
                }
            }
        }
    }
    (data_dir / "summary.json").write_text(json.dumps(summary_content), encoding="utf-8")

    # Synthetic reverse_bh.json
    reverse_bh_content = {
        "country": "BH",
        "generated_at": "2026-11-01T12:00:00Z",
        "counts": {
            "total": 2,
            "missing_backlink": 1,
            "broken_osm_tag": 1,
            "conflict": 0,
            "review_gap": 0
        },
        "items": [
            {
                "kind": "missing_backlink",
                "subkind": "unlinked_entity",
                "confidence": 0.95,
                "osm_type": "node",
                "osm_id": 1001,
                "qid": "Q851",
                "name": "Test Mosque",
                "name_ar": "مسجد تجريبي",
                "name_en": "Test Mosque",
                "lat": 26.2,
                "lon": 50.5,
                "reasons": ["name_match", "coordinate_proximity"]
            },
            {
                "kind": "broken_osm_tag",
                "subkind": "redirected_qid",
                "confidence": 1.0,
                "osm_type": "way",
                "osm_id": 2002,
                "qid": "Q999",
                "name": "Old Road",
                "lat": 26.1,
                "lon": 50.4,
                "reasons": ["redirected_to_Q851"]
            }
        ]
    }
    (data_dir / "reverse_bh.json").write_text(json.dumps(reverse_bh_content), encoding="utf-8")

    # Synthetic forward sa.json with 15-tuple layout
    sa_content = {
        "country": "SA",
        "generated_at": "2026-11-01T12:00:00Z",
        "items": [
            [
                "Q12345", "مسجد النور", "Al Noor Mosque", 24.71, 46.67,
                "Q32815", "mosque", 0.92, 101, "node",
                "amenity", "place_of_worship", "مسجد النور", 12.5, "high"
            ]
        ]
    }
    (data_dir / "sa.json").write_text(json.dumps(sa_content), encoding="utf-8")

    monkeypatch.setenv("OSMWD_DATA_DIR", str(data_dir))
    return data_dir


@pytest.fixture
def mock_store(synthetic_data_dir):
    """Returns a DatasetStore instance pointed at the synthetic data directory."""
    return DatasetStore(data_dir=str(synthetic_data_dir))


@pytest.fixture
def client(synthetic_data_dir):
    """FastAPI TestClient with app state pointing to the synthetic dataset store."""
    app.state.store = DatasetStore(data_dir=str(synthetic_data_dir))
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def mocked_backend(respx_mock):
    """Standard respx mocks for Wikidata and OSM endpoints."""
    # Mock Wikidata wbgetentities
    wikidata_route = respx_mock.get("https://www.wikidata.org/w/api.php").mock(
        return_value=respx.Response(
            200,
            json={
                "entities": {
                    "Q851": {
                        "id": "Q851",
                        "type": "item",
                        "lastrevid": 1234567,
                        "labels": {
                            "ar": {"language": "ar", "value": "المملكة العربية السعودية"},
                            "en": {"language": "en", "value": "Saudi Arabia"}
                        },
                        "claims": {
                            "P31": [
                                {"mainsnak": {"snaktype": "value", "datavalue": {"value": {"id": "Q6256"}}}}
                            ]
                        }
                    }
                }
            }
        )
    )

    # Mock OSM 0.6 element API
    osm_route = respx_mock.get(respx.patterns.regex(r"https://api\.openstreetmap\.org/api/0\.6/(node|way|relation)/\d+\.json")).mock(
        return_value=respx.Response(
            200,
            json={
                "elements": [
                    {
                        "type": "node",
                        "id": 12345,
                        "lat": 24.71,
                        "lon": 46.67,
                        "tags": {
                            "name": "Test Node",
                            "wikidata": "Q851"
                        }
                    }
                ]
            }
        )
    )

    return {"wikidata": wikidata_route, "osm": osm_route}
