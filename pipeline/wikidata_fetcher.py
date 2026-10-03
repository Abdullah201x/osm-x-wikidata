"""
Wikidata SPARQL Fetcher for GCC Countries.
Retrieves coordinate-bearing items with Arabic/English labels, descriptions,
P31 classes, Wikipedia links, and Commons images. Includes SQLite caching.
"""

import os
import re
import time
import json
import sqlite3
import requests
from typing import Dict, List, Any, Optional
from pipeline.config import GCC_COUNTRIES, BASE_DIR, classify_p31

CACHE_DB = os.path.join(BASE_DIR, "pipeline", "wikidata_cache.db")
WIKIDATA_SPARQL_URL = "https://query.wikidata.org/sparql"
USER_AGENT = "OSMxWikidataLinker/1.0 (https://github.com/abdullah201x; GCC Mapping Project)"

def init_cache_db():
    conn = sqlite3.connect(CACHE_DB)
    cursor = conn.cursor()
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS wikidata_cache (
        qid TEXT PRIMARY KEY,
        country_code TEXT NOT NULL,
        lat REAL NOT NULL,
        lon REAL NOT NULL,
        cat_id INTEGER NOT NULL,
        p31_qid TEXT,
        p31_label TEXT,
        name_ar TEXT,
        name_en TEXT,
        desc_ar TEXT,
        desc_en TEXT,
        wikipedia_ar TEXT,
        wikipedia_en TEXT,
        image_url TEXT,
        osm_id TEXT,
        website TEXT,
        dissolved TEXT,
        twitter TEXT,
        instagram TEXT,
        facebook TEXT,
        updated_at INTEGER NOT NULL
    )
    """)
    # Ensure newly added columns exist in existing caches
    for col in ("website", "dissolved", "twitter", "instagram", "facebook"):
        try:
            cursor.execute(f"ALTER TABLE wikidata_cache ADD COLUMN {col} TEXT")
        except sqlite3.OperationalError:
            pass
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_wd_country ON wikidata_cache(country_code)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_wd_lat_lon ON wikidata_cache(lat, lon)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_wd_cat ON wikidata_cache(cat_id)")
    conn.commit()
    conn.close()

def parse_point_coords(coords_str: str) -> Optional[tuple]:
    """
    Parses 'Point(50.55 26.05)' -> (lat=26.05, lon=50.55)
    Note: WKT Point format is 'Point(lon lat)'
    """
    m = re.search(r'Point\(\s*([-\d.]+)\s+([-\d.]+)\s*\)', coords_str)
    if m:
        lon = float(m.group(1))
        lat = float(m.group(2))
        return lat, lon
    return None

# "جامع" / "مسجد" / "مصلى" as whole words only: a plain substring test also matches "جامعة" (university)
RE_MOSQUE_NAME = re.compile(r'(?<![\u0600-\u06FF])(ال)?(جامع|مسجد|مصلى)(?![\u0600-\u06FF])')
RE_MOSQUE_NAME_EN = re.compile(r'\b(mosque|masjid)\b', re.IGNORECASE)

def classify_item(name_ar: str, name_en: str, p31_qid: str, p31_label: str) -> tuple:
    """Returns (cat_id, p31_qid, p31_label), promoting items named like mosques to the worship category."""
    if RE_MOSQUE_NAME.search(name_ar or "") or RE_MOSQUE_NAME.search(name_en or "") or RE_MOSQUE_NAME_EN.search(name_en or ""):
        return 6, "Q32815", "مسجد / جامع"
    return classify_p31(p31_qid), p31_qid, p31_label

def fetch_sparql(query: str, max_retries: int = 3, timeout: int = 45) -> Optional[List[Dict[str, Any]]]:
    """Executes a SPARQL query with retries and exponential backoff. Returns None if every attempt failed."""
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "application/sparql-results+json"
    }
    for attempt in range(max_retries):
        try:
            r = requests.get(
                WIKIDATA_SPARQL_URL,
                params={"query": query, "format": "json"},
                headers=headers,
                timeout=timeout
            )
            if r.status_code == 200:
                data = r.json()
                return data.get("results", {}).get("bindings", [])
            elif r.status_code in (429, 503, 504):
                wait = (attempt + 1) * 5
                print(f"  [Wikidata] Rate limited / Busy (HTTP {r.status_code}). Retrying in {wait}s...")
                time.sleep(wait)
            else:
                print(f"  [Wikidata Error] HTTP {r.status_code}: {r.text[:200]}")
                time.sleep(3)
        except requests.exceptions.RequestException as e:
            print(f"  [Wikidata Request Exception] {e}. Retrying...")
            time.sleep((attempt + 1) * 3)
    return None

def fetch_country_wikidata(country_code: str, force_refresh: bool = False) -> List[Dict[str, Any]]:
    """
    Fetches all coordinate-bearing Wikidata items for a GCC country.
    Uses SQLite local cache if available and fresh.
    """
    init_cache_db()
    country_code = country_code.upper()
    if country_code not in GCC_COUNTRIES:
        raise ValueError(f"Unknown GCC country: {country_code}")

    c_info = GCC_COUNTRIES[country_code]
    c_qid = c_info["qid"]

    # Check cache
    conn = sqlite3.connect(CACHE_DB)
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM wikidata_cache WHERE country_code = ?", (country_code,))
    count = cursor.fetchone()[0]

    now = int(time.time())
    # If we have cached items and not forcing refresh, return from cache
    if count > 0 and not force_refresh:
        print(f"  [Wikidata] Loading {count} items for {country_code} from local cache...")
        cursor.execute("""
        SELECT qid, country_code, lat, lon, cat_id, p31_qid, p31_label,
               name_ar, name_en, desc_ar, desc_en, wikipedia_ar, wikipedia_en,
               image_url, osm_id, website, dissolved, twitter, instagram, facebook
        FROM wikidata_cache WHERE country_code = ?
        """, (country_code,))
        items = []
        for row in cursor.fetchall():
            cat_id, p31_qid, p31_lbl = classify_item(row[7] or "", row[8] or "", row[5] or "", row[6] or "")
            items.append({
                "qid": row[0],
                "country": row[1],
                "lat": row[2],
                "lon": row[3],
                "cat": cat_id,
                "p31": p31_qid,
                "p31_label": p31_lbl,
                "name_ar": row[7] or "",
                "name_en": row[8] or "",
                "desc_ar": row[9] or "",
                "desc_en": row[10] or "",
                "wikipedia_ar": row[11] or "",
                "wikipedia_en": row[12] or "",
                "image": row[13] or "",
                "osm_id": row[14] or "",
                "website": row[15] or "" if len(row) > 15 else "",
                "dissolved": row[16] or "" if len(row) > 16 else "",
                "twitter": row[17] or "" if len(row) > 17 else "",
                "instagram": row[18] or "" if len(row) > 18 else "",
                "facebook": row[19] or "" if len(row) > 19 else "",
            })
        conn.close()
        return items

    print(f"  [Wikidata] Fetching live items for {c_info['name_en']} ({c_qid}) via SPARQL...")

    # SPARQL queries
    # For Saudi Arabia (SA), we split non-mosques and mosques to avoid SPARQL timeout
    queries = []
    if country_code == "SA":
        # Query 1: All non-mosque POIs in SA (~16,000 items - archaeology, places, hospitals, peaks, etc.)
        queries.append(f"""
        SELECT ?item ?itemLabel ?itemLabel_ar ?itemLabel_en ?coords ?p31 ?p31Label ?desc_ar ?desc_en ?wiki_ar ?wiki_en ?image ?osmId ?website ?dissolved ?twitter ?instagram ?facebook WHERE {{
          ?item wdt:P17 wd:{c_qid} ;
                wdt:P625 ?coords .
          MINUS {{ ?item wdt:P31 wd:Q32815 . }}
          OPTIONAL {{ ?item wdt:P31 ?p31 . }}
          OPTIONAL {{ ?item rdfs:label ?itemLabel_ar . FILTER(LANG(?itemLabel_ar) = "ar") }}
          OPTIONAL {{ ?item rdfs:label ?itemLabel_en . FILTER(LANG(?itemLabel_en) = "en") }}
          OPTIONAL {{ ?item schema:description ?desc_ar . FILTER(LANG(?desc_ar) = "ar") }}
          OPTIONAL {{ ?item schema:description ?desc_en . FILTER(LANG(?desc_en) = "en") }}
          OPTIONAL {{ ?wiki_ar schema:about ?item ; schema:isPartOf <https://ar.wikipedia.org/> . }}
          OPTIONAL {{ ?wiki_en schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> . }}
          OPTIONAL {{ ?item wdt:P18 ?image . }}
          OPTIONAL {{ ?item wdt:P11693 ?osmId . }}
          OPTIONAL {{ ?item wdt:P856 ?website . }}
          OPTIONAL {{ ?item wdt:P576 ?dissolved . }}
          OPTIONAL {{ ?item wdt:P2002 ?twitter . }}
          OPTIONAL {{ ?item wdt:P2003 ?instagram . }}
          OPTIONAL {{ ?item wdt:P2013 ?facebook . }}
          SERVICE wikibase:label {{ bd:serviceParam wikibase:language "ar,en". }}
        }}
        """)
        # Query 2: Mosques in SA in fast 25,000 batches
        for offset in (0, 25000, 50000):
            queries.append(f"""
            SELECT ?item ?itemLabel_ar ?itemLabel_en ?coords (wd:Q32815 AS ?p31) WHERE {{
              ?item wdt:P17 wd:{c_qid} ;
                    wdt:P625 ?coords ;
                    wdt:P31 wd:Q32815 .
              OPTIONAL {{ ?item rdfs:label ?itemLabel_ar . FILTER(LANG(?itemLabel_ar) = "ar") }}
              OPTIONAL {{ ?item rdfs:label ?itemLabel_en . FILTER(LANG(?itemLabel_en) = "en") }}
            }}
            LIMIT 25000 OFFSET {offset}
            """)
    else:
        # Standard single query for other GCC countries (< 5,000 items each)
        queries.append(f"""
        SELECT ?item ?itemLabel ?itemLabel_ar ?itemLabel_en ?coords ?p31 ?p31Label ?desc_ar ?desc_en ?wiki_ar ?wiki_en ?image ?osmId ?website ?dissolved ?twitter ?instagram ?facebook WHERE {{
          ?item wdt:P17 wd:{c_qid} ;
                wdt:P625 ?coords .
          OPTIONAL {{ ?item wdt:P31 ?p31 . }}
          OPTIONAL {{ ?item rdfs:label ?itemLabel_ar . FILTER(LANG(?itemLabel_ar) = "ar") }}
          OPTIONAL {{ ?item rdfs:label ?itemLabel_en . FILTER(LANG(?itemLabel_en) = "en") }}
          OPTIONAL {{ ?item schema:description ?desc_ar . FILTER(LANG(?desc_ar) = "ar") }}
          OPTIONAL {{ ?item schema:description ?desc_en . FILTER(LANG(?desc_en) = "en") }}
          OPTIONAL {{ ?wiki_ar schema:about ?item ; schema:isPartOf <https://ar.wikipedia.org/> . }}
          OPTIONAL {{ ?wiki_en schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> . }}
          OPTIONAL {{ ?item wdt:P18 ?image . }}
          OPTIONAL {{ ?item wdt:P11693 ?osmId . }}
          OPTIONAL {{ ?item wdt:P856 ?website . }}
          OPTIONAL {{ ?item wdt:P576 ?dissolved . }}
          OPTIONAL {{ ?item wdt:P2002 ?twitter . }}
          OPTIONAL {{ ?item wdt:P2003 ?instagram . }}
          OPTIONAL {{ ?item wdt:P2013 ?facebook . }}
          SERVICE wikibase:label {{ bd:serviceParam wikibase:language "ar,en". }}
        }}
        """)

    all_bindings = []
    for idx, q in enumerate(queries):
        print(f"    Executing SPARQL query {idx+1}/{len(queries)}...")
        bindings = fetch_sparql(q)
        if bindings is None:
            # Never replace a good cache with a partial/empty result set
            conn.close()
            if count > 0:
                print(f"  [Wikidata] SPARQL query {idx+1} failed; keeping the {count} cached items for {country_code}.")
                return fetch_country_wikidata(country_code, force_refresh=False)
            raise RuntimeError(f"Wikidata SPARQL query {idx+1} failed for {country_code} and no cache is available.")
        all_bindings.extend(bindings)
        time.sleep(1)

    print(f"  [Wikidata] Received {len(all_bindings)} records for {country_code}.")

    # Deduplicate & parse
    seen_qids = {}
    for b in all_bindings:
        item_uri = b.get("item", {}).get("value", "")
        qid = item_uri.split("/")[-1]
        if not qid or not qid.startswith("Q"):
            continue

        coords_str = b.get("coords", {}).get("value", "")
        pt = parse_point_coords(coords_str)
        if not pt:
            continue
        lat, lon = pt

        p31_uri = b.get("p31", {}).get("value", "")
        p31_qid = p31_uri.split("/")[-1] if p31_uri else ""
        p31_lbl = b.get("p31Label", {}).get("value", "")

        # Labels
        name_ar = b.get("itemLabel_ar", {}).get("value", "")
        name_en = b.get("itemLabel_en", {}).get("value", "")
        fallback_label = b.get("itemLabel", {}).get("value", "")

        if not name_ar and fallback_label and not fallback_label.startswith("Q"):
            if re.search(r'[\u0600-\u06FF]', fallback_label):
                name_ar = fallback_label
            else:
                name_en = fallback_label

        # Intelligent Mosque / Category detection
        cat_id, p31_qid, p31_lbl = classify_item(name_ar, name_en, p31_qid, p31_lbl)

        desc_ar = b.get("desc_ar", {}).get("value", "")
        desc_en = b.get("desc_en", {}).get("value", "")
        wiki_ar = b.get("wiki_ar", {}).get("value", "")
        wiki_en = b.get("wiki_en", {}).get("value", "")
        image_url = b.get("image", {}).get("value", "")
        osm_id = b.get("osmId", {}).get("value", "")

        # NSI Attributes: website, dissolution date, social channels
        website = b.get("website", {}).get("value", "")
        dissolved_raw = b.get("dissolved", {}).get("value", "")
        dissolved_year = ""
        if dissolved_raw:
            m_year = re.search(r'(\d{4})', dissolved_raw)
            dissolved_year = m_year.group(1) if m_year else ""

        twitter = b.get("twitter", {}).get("value", "")
        instagram = b.get("instagram", {}).get("value", "")
        facebook = b.get("facebook", {}).get("value", "")

        item_obj = {
            "qid": qid,
            "country": country_code,
            "lat": round(lat, 6),
            "lon": round(lon, 6),
            "cat": cat_id,
            "p31": p31_qid,
            "p31_label": p31_lbl,
            "name_ar": name_ar,
            "name_en": name_en,
            "desc_ar": desc_ar,
            "desc_en": desc_en,
            "wikipedia_ar": wiki_ar,
            "wikipedia_en": wiki_en,
            "image": image_url,
            "osm_id": osm_id,
            "website": website,
            "dissolved": dissolved_year,
            "twitter": twitter,
            "instagram": instagram,
            "facebook": facebook,
        }

        # Keep or merge with existing
        if qid not in seen_qids:
            seen_qids[qid] = item_obj
        else:
            # Merge missing fields
            curr = seen_qids[qid]
            for k in ("name_ar", "name_en", "desc_ar", "desc_en", "wikipedia_ar", "wikipedia_en", "image", "osm_id", "website", "dissolved", "twitter", "instagram", "facebook"):
                if not curr.get(k) and item_obj.get(k):
                    curr[k] = item_obj[k]

    # Save to SQLite cache
    cursor.execute("DELETE FROM wikidata_cache WHERE country_code = ?", (country_code,))
    insert_records = [
        (
            v["qid"], v["country"], v["lat"], v["lon"], v["cat"],
            v["p31"], v["p31_label"], v["name_ar"], v["name_en"],
            v["desc_ar"], v["desc_en"], v["wikipedia_ar"], v["wikipedia_en"],
            v["image"], v["osm_id"],
            v.get("website", ""), v.get("dissolved", ""),
            v.get("twitter", ""), v.get("instagram", ""), v.get("facebook", ""),
            now
        )
        for v in seen_qids.values()
    ]
    cursor.executemany("""
    INSERT OR REPLACE INTO wikidata_cache VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    """, insert_records)
    conn.commit()
    conn.close()

    print(f"  [Wikidata] Cached {len(seen_qids)} unique items for {country_code} in local SQLite.")
    return list(seen_qids.values())
