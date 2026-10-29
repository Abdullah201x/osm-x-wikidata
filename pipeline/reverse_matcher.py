"""
Reverse Analysis Engine: Audits and QA-Checks OSM Objects Carrying `wikidata=*`.
Categorizes linked objects into 4 actionable queues:
1. missing_backlink: 1-to-1 verified candidates where Wikidata lacks P11693/P10689/P402.
2. broken_osm_tag: Malformed QIDs, redirects, deleted entities, and wrong-key migrations (Q5 -> name:etymology:wikidata).
3. conflict: Multi-tagged QIDs (5 pre-classified buckets) and Wikidata ID collisions.
4. review_gap: Informational gaps (missing coordinates or missing Arabic label on Wikidata).
"""

import os
import sys
import re
import json
import time
import math
import sqlite3
from typing import Dict, List, Any, Optional, Tuple, Set
import requests

from pipeline.config import BASE_DIR, PIPELINE_DIR, DATA_DIR, GCC_COUNTRIES, P31_ONTOLOGY, QID_TO_COUNTRY_CODE
from pipeline.arabic_normalizer import string_similarity, match_names_composite, strip_serial_suffix, normalize_arabic
from pipeline.physicality_filter import NON_MAPPABLE_P31, is_physical_mappable
from pipeline.country_boundaries import get_country_matcher

WIKIDATA_CACHE_DB = os.path.join(PIPELINE_DIR, "wikidata_cache.db")
OSM_CACHE_DB = os.path.join(PIPELINE_DIR, "osm_cache.db")

USER_AGENT = "OSMxWikidataLinker/2.0 (+https://wikidata.saudiosm.org/)"

RE_CANONICAL_QID = re.compile(r"^Q[1-9][0-9]*$")
RE_NUMERIC_ONLY = re.compile(r"^[1-9][0-9]*$")

# Classes representing brands, retail chains, and companies that belong in brand:wikidata / operator:wikidata
BRAND_OPERATOR_CLASSES = {
    "Q431289",    # brand
    "Q4830453",   # business enterprise / company
    "Q783794",    # company
    "Q507619",    # supermarket chain
    "Q161726",    # chain store
    "Q11707",     # restaurant chain
    "Q41298",     # magazine / media brand
}

# Incompatible physical domains for class_conflict detection
DOMAIN_CONFLICTS = {
    "highway": {"Q16970", "Q32815", "Q16917", "Q3914"}, # road tagged as mosque, church, hospital, school
    "amenity": {"Q34442", "Q532", "Q12284"},            # amenity tagged as road, village, city
}

def init_tagged_qid_cache(conn: sqlite3.Connection):
    cursor = conn.cursor()
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS tagged_qid_cache (
        qid TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        redirect_target TEXT,
        lastrevid INTEGER,
        labels_json TEXT,
        descriptions_json TEXT,
        p31_json TEXT,
        p17_json TEXT,
        lat REAL,
        lon REAL,
        p11693_json TEXT,
        p10689_json TEXT,
        p402_json TEXT,
        dissolved TEXT,
        replaced_by TEXT,
        sitelinks_json TEXT,
        fetched_at INTEGER
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_tagged_fetched ON tagged_qid_cache(fetched_at)")
    conn.commit()

def fetch_tagged_qids_batch(
    qids: List[str],
    conn: sqlite3.Connection,
    force_refresh: bool = False,
    cache_ttl_seconds: int = 86400
) -> Dict[str, Dict[str, Any]]:
    """
    Fetches Wikidata entities for a list of QIDs in batches of 50.
    Caches results in tagged_qid_cache (24-hour TTL).
    """
    init_tagged_qid_cache(conn)
    now = int(time.time())
    result: Dict[str, Dict[str, Any]] = {}
    missing_qids: Set[str] = set()

    # Load from cache
    cursor = conn.cursor()
    chunk_size = 500
    for i in range(0, len(qids), chunk_size):
        chunk = qids[i:i + chunk_size]
        placeholders = ",".join("?" for _ in chunk)
        cursor.execute(f"""
        SELECT qid, status, redirect_target, lastrevid, labels_json, descriptions_json,
               p31_json, p17_json, lat, lon, p11693_json, p10689_json, p402_json,
               dissolved, replaced_by, sitelinks_json, fetched_at
        FROM tagged_qid_cache
        WHERE qid IN ({placeholders})
        """, chunk)
        for row in cursor.fetchall():
            q = row[0]
            fetched_at = row[16] or 0
            if not force_refresh and (now - fetched_at) < cache_ttl_seconds:
                result[q] = {
                    "qid": q,
                    "status": row[1],
                    "redirect_target": row[2] or "",
                    "lastrevid": row[3] or 0,
                    "labels": json.loads(row[4] or "{}"),
                    "descriptions": json.loads(row[5] or "{}"),
                    "p31": json.loads(row[6] or "[]"),
                    "p17": json.loads(row[7] or "[]"),
                    "lat": row[8],
                    "lon": row[9],
                    "p11693": json.loads(row[10] or "[]"),
                    "p10689": json.loads(row[11] or "[]"),
                    "p402": json.loads(row[12] or "[]"),
                    "dissolved": row[13] or "",
                    "replaced_by": row[14] or "",
                    "sitelinks": json.loads(row[15] or "{}"),
                    "fetched_at": fetched_at
                }

    for q in qids:
        # Only query Wikidata API for canonical QIDs
        if RE_CANONICAL_QID.match(q) and q not in result:
            missing_qids.add(q)

    if not missing_qids:
        return result

    print(f"  [Wikidata API] Fetching {len(missing_qids):,} QIDs in batches of 50...")
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})

    to_fetch = list(missing_qids)
    batch_size = 50
    db_batch = []

    for i in range(0, len(to_fetch), batch_size):
        batch = to_fetch[i:i + batch_size]
        ids_str = "|".join(batch)
        url = (
            f"https://www.wikidata.org/w/api.php?action=wbgetentities"
            f"&ids={ids_str}&props=info|labels|descriptions|claims|sitelinks"
            f"&languages=ar|en&redirects=yes&format=json"
        )

        resp_data = None
        for attempt in range(4):
            try:
                resp = session.get(url, timeout=12)
                if resp.status_code == 429 or resp.status_code == 503:
                    retry_after = int(resp.headers.get("Retry-After", 2 * (attempt + 1)))
                    time.sleep(retry_after)
                    continue
                if resp.status_code == 200:
                    resp_data = resp.json()
                    break
            except Exception as e:
                time.sleep(1.5 * (attempt + 1))

        if not resp_data:
            print(f"  [Wikidata API WARNING] Failed batch {i//batch_size + 1}")
            continue

        entities = resp_data.get("entities", {})
        redirects = {r["from"]: r["to"] for r in resp_data.get("redirects", [])}

        for req_qid in batch:
            # Check redirect
            canonical_qid = redirects.get(req_qid, req_qid)
            ent = entities.get(canonical_qid) or entities.get(req_qid)

            if not ent or "missing" in ent:
                parsed = {
                    "qid": req_qid,
                    "status": "missing",
                    "redirect_target": "",
                    "lastrevid": 0,
                    "labels": {},
                    "descriptions": {},
                    "p31": [],
                    "p17": [],
                    "lat": None,
                    "lon": None,
                    "p11693": [],
                    "p10689": [],
                    "p402": [],
                    "dissolved": "",
                    "replaced_by": "",
                    "sitelinks": {},
                    "fetched_at": now
                }
            elif req_qid in redirects:
                # Entity exists but was reached via redirect
                parsed = _parse_entity_claims(ent, req_qid, "redirect", canonical_qid, now)
            else:
                parsed = _parse_entity_claims(ent, req_qid, "exists", "", now)

            result[req_qid] = parsed
            db_batch.append((
                parsed["qid"], parsed["status"], parsed["redirect_target"], parsed["lastrevid"],
                json.dumps(parsed["labels"], ensure_ascii=False),
                json.dumps(parsed["descriptions"], ensure_ascii=False),
                json.dumps(parsed["p31"], ensure_ascii=False),
                json.dumps(parsed["p17"], ensure_ascii=False),
                parsed["lat"], parsed["lon"],
                json.dumps(parsed["p11693"], ensure_ascii=False),
                json.dumps(parsed["p10689"], ensure_ascii=False),
                json.dumps(parsed["p402"], ensure_ascii=False),
                parsed["dissolved"], parsed["replaced_by"],
                json.dumps(parsed["sitelinks"], ensure_ascii=False),
                parsed["fetched_at"]
            ))

        time.sleep(0.1)

    if db_batch:
        cursor.executemany("""
        INSERT OR REPLACE INTO tagged_qid_cache VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, db_batch)
        conn.commit()

    return result

def _parse_entity_claims(ent: Dict, qid: str, status: str, redirect_target: str, now: int) -> Dict[str, Any]:
    claims = ent.get("claims", {})
    labels = {k: v["value"] for k, v in ent.get("labels", {}).items() if "value" in v}
    descs = {k: v["value"] for k, v in ent.get("descriptions", {}).items() if "value" in v}
    sitelinks = {k: v["title"] for k, v in ent.get("sitelinks", {}).items() if "title" in v}

    # P31 instance of
    p31_list = []
    for c in claims.get("P31", []):
        try:
            val = c["mainsnak"]["datavalue"]["value"]["id"]
            p31_list.append(val)
        except Exception:
            pass

    # P17 country
    p17_list = []
    for c in claims.get("P17", []):
        try:
            val = c["mainsnak"]["datavalue"]["value"]["id"]
            p17_list.append(val)
        except Exception:
            pass

    # P625 coordinates
    lat, lon = None, None
    for c in claims.get("P625", []):
        try:
            val = c["mainsnak"]["datavalue"]["value"]
            lat = round(float(val["latitude"]), 6)
            lon = round(float(val["longitude"]), 6)
            break
        except Exception:
            pass

    # External OSM identifiers
    def _extract_string_claims(prop: str) -> List[str]:
        vals = []
        for c in claims.get(prop, []):
            try:
                v = str(c["mainsnak"]["datavalue"]["value"]).strip()
                if v:
                    vals.append(v)
            except Exception:
                pass
        return vals

    p11693 = _extract_string_claims("P11693")  # node
    p10689 = _extract_string_claims("P10689")  # way
    p402 = _extract_string_claims("P402")      # relation

    # Dissolution (P576 end time / P582 date of official closure)
    dissolved = ""
    for prop in ("P576", "P582"):
        if prop in claims:
            try:
                time_val = claims[prop][0]["mainsnak"]["datavalue"]["value"]["time"]
                # extract year e.g. +2015-00-00T00:00:00Z -> 2015
                m = re.search(r"([0-9]{4})", time_val)
                if m:
                    dissolved = m.group(1)
                    break
            except Exception:
                pass

    # Replaced by (P1366)
    replaced_by = ""
    if "P1366" in claims:
        try:
            replaced_by = claims["P1366"][0]["mainsnak"]["datavalue"]["value"]["id"]
        except Exception:
            pass

    return {
        "qid": qid,
        "status": status,
        "redirect_target": redirect_target,
        "lastrevid": ent.get("lastrevid", 0),
        "labels": labels,
        "descriptions": descs,
        "p31": p31_list,
        "p17": p17_list,
        "lat": lat,
        "lon": lon,
        "p11693": p11693,
        "p10689": p10689,
        "p402": p402,
        "dissolved": dissolved,
        "replaced_by": replaced_by,
        "sitelinks": sitelinks,
        "fetched_at": now
    }

def haversine_distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> int:
    """Computes distance in meters between two lat/lon coordinates."""
    R = 6371000
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return int(R * c)

def normalize_malformed_qid(raw_val: str) -> Optional[str]:
    """Attempts to extract a canonical QID from malformed values (e.g. 'q851', URLs, numeric)."""
    if not raw_val:
        return None
    s = raw_val.strip()
    if RE_CANONICAL_QID.match(s):
        return s
    # Case lowercase q
    if s.lower().startswith('q') and s[1:].isdigit():
        return f"Q{s[1:]}"
    # Numeric only e.g. "851"
    if RE_NUMERIC_ONLY.match(s):
        return f"Q{s}"
    # Full URL or wikidata URI e.g. "https://www.wikidata.org/wiki/Q851" or "wd:Q851"
    m = re.search(r"\b(Q[1-9][0-9]*)\b", s, re.IGNORECASE)
    if m:
        return m.group(1).upper()
    return None

class ReverseAnalyzer:
    """
    Analyzes OSM objects carrying `wikidata=*` against Wikidata entities.
    """
    def __init__(self, osm_conn: sqlite3.Connection, wd_conn: sqlite3.Connection):
        self.osm_conn = osm_conn
        self.wd_conn = wd_conn
        self.country_matcher = get_country_matcher()

        cursor = self.osm_conn.cursor()
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS osm_relation_members (
            rel_id INTEGER NOT NULL,
            member_type TEXT NOT NULL,
            member_id INTEGER NOT NULL,
            role TEXT,
            PRIMARY KEY (rel_id, member_type, member_id, role)
        )
        """)
        self.osm_conn.commit()

    def load_country_linked_objects(self, target_country: str) -> List[Dict[str, Any]]:
        """
        Loads all objects from osm_linked, assigning country via the 3-tier waterfall.
        """
        target_country = target_country.upper()
        cursor = self.osm_conn.cursor()
        cursor.execute("""
        SELECT osm_type, osm_id, lat, lon, qid, name, name_ar, name_en, main_key, main_val, tags_json
        FROM osm_linked
        """)
        rows = cursor.fetchall()

        matched_objects = []
        for r in rows:
            otype, oid, lat, lon, qid, name, name_ar, name_en, main_k, main_v, tags_raw = r
            try:
                tags = json.loads(tags_raw) if tags_raw else {}
            except Exception:
                tags = {}

            # Tier 1 & 2 waterfall: OSM geometry & tags
            cc = self.country_matcher.resolve_country(lat, lon, osm_tags=tags)

            if cc == target_country:
                matched_objects.append({
                    "osm_type": otype,
                    "osm_id": oid,
                    "lat": lat,
                    "lon": lon,
                    "qid": qid.strip(),
                    "name": name or "",
                    "name_ar": name_ar or "",
                    "name_en": name_en or "",
                    "main_key": main_k or "",
                    "main_val": main_v or "",
                    "tags": tags,
                    "country": cc
                })

        return matched_objects

    def preclassify_multi_tagged(self, objects: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
        """
        Pre-classifies multi-tagged QIDs across the dataset into 5 buckets:
        1. relation_with_members (benign)
        2. split_linear_ways (benign linear ways e.g. Wadi Hanifah)
        3. place_node_plus_boundary_rel (benign)
        4. duplicate_poi_representation (low severity duplicate)
        5. parent_admin_pollution (high value error e.g. Jazan governorate on villages)
        """
        from collections import defaultdict
        qid_groups = defaultdict(list)
        for obj in objects:
            norm_q = normalize_malformed_qid(obj["qid"]) or obj["qid"]
            qid_groups[norm_q].append(obj)

        cursor = self.osm_conn.cursor()
        multi_info = {}

        for q, grp in qid_groups.items():
            if len(grp) <= 1:
                continue

            types = {o["osm_type"] for o in grp}
            has_rel = 'r' in types
            has_way = 'w' in types
            has_node = 'n' in types

            # Check 1: Relation with members
            # If 1 relation exists and ways/nodes are its members
            if has_rel and len(grp) >= 2:
                rel_objs = [o for o in grp if o["osm_type"] == 'r']
                if len(rel_objs) == 1:
                    rel_id = rel_objs[0]["osm_id"]
                    cursor.execute("SELECT member_type, member_id FROM osm_relation_members WHERE rel_id = ?", (rel_id,))
                    members = {(row[0], row[1]) for row in cursor.fetchall()}
                    non_rels = [o for o in grp if o["osm_type"] != 'r']
                    if members and all((o["osm_type"], o["osm_id"]) in members for o in non_rels):
                        multi_info[q] = {
                            "bucket": "relation_with_members",
                            "canonical_osm": f"r{rel_id}",
                            "count": len(grp)
                        }
                        continue

            # Check 2: Split linear ways (highway, railway, waterway, natural=valley)
            if all(o["osm_type"] == 'w' for o in grp):
                linear_keys = {"highway", "railway", "waterway"}
                is_linear = all(
                    o["main_key"] in linear_keys or o["tags"].get("natural") == "valley"
                    for o in grp
                )
                if is_linear:
                    multi_info[q] = {
                        "bucket": "split_linear_ways",
                        "canonical_osm": None,
                        "count": len(grp)
                    }
                    continue

            # Check 3: Place node + boundary relation
            if len(grp) == 2 and has_node and has_rel:
                node_obj = next(o for o in grp if o["osm_type"] == 'n')
                rel_obj = next(o for o in grp if o["osm_type"] == 'r')
                if node_obj["main_key"] == "place" and rel_obj["tags"].get("boundary") == "administrative":
                    multi_info[q] = {
                        "bucket": "place_node_plus_boundary_rel",
                        "canonical_osm": f"r{rel_obj['osm_id']}",
                        "count": len(grp)
                    }
                    continue

            # Check 4: Duplicate POI representation (node + way within 150m)
            if len(grp) == 2 and has_node and has_way:
                n_obj = next(o for o in grp if o["osm_type"] == 'n')
                w_obj = next(o for o in grp if o["osm_type"] == 'w')
                if n_obj["lat"] != 0 and w_obj["lat"] != 0:
                    dist = haversine_distance_m(n_obj["lat"], n_obj["lon"], w_obj["lat"], w_obj["lon"])
                    if dist <= 150:
                        multi_info[q] = {
                            "bucket": "duplicate_poi_representation",
                            "canonical_osm": f"w{w_obj['osm_id']}", # prefer way
                            "count": len(grp)
                        }
                        continue

            # Check 5: Parent admin or unrelated pollution (divergent objects or > 500m apart)
            multi_info[q] = {
                "bucket": "parent_admin_pollution",
                "canonical_osm": None,
                "count": len(grp)
            }

        return multi_info

    def audit_object(
        self,
        obj: Dict[str, Any],
        wd_entity: Optional[Dict[str, Any]],
        multi_info: Optional[Dict[str, Any]],
        existing_osm_ids: Set[str]
    ) -> List[Dict[str, Any]]:
        """
        Audits a single OSM object against Wikidata and produces QA results.
        Returns a list of finding items (usually 1, occasionally 2 if review_gap).
        """
        findings = []
        raw_qid = obj["qid"]
        norm_qid = normalize_malformed_qid(raw_qid)
        otype = obj["osm_type"]
        oid = obj["osm_id"]
        osm_ref = f"{otype}{oid}"

        # Target external ID property on Wikidata
        target_prop = "P11693" if otype == 'n' else ("P10689" if otype == 'w' else "P402")

        # ---------------------------------------------------------
        # Category 1: Broken OSM Tag (Fix is on OSM)
        # ---------------------------------------------------------
        if not RE_CANONICAL_QID.match(raw_qid):
            findings.append({
                "osm_type": otype,
                "osm_id": oid,
                "qid": raw_qid,
                "kind": "broken_osm_tag",
                "subkind": "malformed_qid",
                "confidence": 1.0,
                "reasons": [f"Tag value '{raw_qid}' does not match canonical QID pattern"],
                "suggested_fix": {
                    "target": "osm",
                    "action": "replace_tag" if norm_qid else "remove_tag",
                    "tag": "wikidata",
                    "value": norm_qid or ""
                },
                "osm": self._format_osm_summary(obj),
                "wikidata": None
            })
            return findings

        if not wd_entity or wd_entity["status"] == "missing":
            findings.append({
                "osm_type": otype,
                "osm_id": oid,
                "qid": raw_qid,
                "kind": "broken_osm_tag",
                "subkind": "missing_qid",
                "confidence": 1.0,
                "reasons": [f"Wikidata entity {raw_qid} does not exist or has been deleted"],
                "suggested_fix": {
                    "target": "osm",
                    "action": "remove_tag",
                    "tag": "wikidata",
                    "value": ""
                },
                "osm": self._format_osm_summary(obj),
                "wikidata": None
            })
            return findings

        if wd_entity["status"] == "redirect":
            target = wd_entity["redirect_target"]
            findings.append({
                "osm_type": otype,
                "osm_id": oid,
                "qid": raw_qid,
                "kind": "broken_osm_tag",
                "subkind": "redirected_qid",
                "confidence": 1.0,
                "reasons": [f"Wikidata entity {raw_qid} redirects to {target}"],
                "suggested_fix": {
                    "target": "osm",
                    "action": "replace_tag",
                    "tag": "wikidata",
                    "value": target
                },
                "osm": self._format_osm_summary(obj),
                "wikidata": self._format_wd_summary(wd_entity)
            })
            return findings

        p31_list = wd_entity.get("p31", [])

        # Check wrong_wikidata_key: Q5 human
        if "Q5" in p31_list:
            findings.append({
                "osm_type": otype,
                "osm_id": oid,
                "qid": raw_qid,
                "kind": "broken_osm_tag",
                "subkind": "wrong_wikidata_key",
                "confidence": 0.98,
                "reasons": ["Entity is a human (Q5); physical object should link via name:etymology:wikidata or subject:wikidata"],
                "suggested_fix": {
                    "target": "osm",
                    "action": "migrate_tag",
                    "from_tag": "wikidata",
                    "to_tag": "name:etymology:wikidata",
                    "value": raw_qid
                },
                "osm": self._format_osm_summary(obj),
                "wikidata": self._format_wd_summary(wd_entity)
            })
            return findings

        # Check wrong_wikidata_key: Brand / retail chain tagged on branch POI
        is_brand_class = any(c in BRAND_OPERATOR_CLASSES for c in p31_list)
        if is_brand_class:
            findings.append({
                "osm_type": otype,
                "osm_id": oid,
                "qid": raw_qid,
                "kind": "broken_osm_tag",
                "subkind": "wrong_wikidata_key",
                "confidence": 0.95,
                "reasons": ["Entity is a brand/chain class; branch POI should use brand:wikidata or operator:wikidata"],
                "suggested_fix": {
                    "target": "osm",
                    "action": "migrate_tag",
                    "from_tag": "wikidata",
                    "to_tag": "brand:wikidata",
                    "value": raw_qid
                },
                "osm": self._format_osm_summary(obj),
                "wikidata": self._format_wd_summary(wd_entity)
            })
            return findings

        # Check wrong_wikidata_key: Taxon Q16521
        if "Q16521" in p31_list:
            findings.append({
                "osm_type": otype,
                "osm_id": oid,
                "qid": raw_qid,
                "kind": "broken_osm_tag",
                "subkind": "wrong_wikidata_key",
                "confidence": 0.95,
                "reasons": ["Entity is a biological taxon (Q16521); use species:wikidata instead of wikidata"],
                "suggested_fix": {
                    "target": "osm",
                    "action": "migrate_tag",
                    "from_tag": "wikidata",
                    "to_tag": "species:wikidata",
                    "value": raw_qid
                },
                "osm": self._format_osm_summary(obj),
                "wikidata": self._format_wd_summary(wd_entity)
            })
            return findings

        # Check non_entity_or_non_physical (disambiguation Q4167410, events, lists)
        if any(c in NON_MAPPABLE_P31 for c in p31_list):
            findings.append({
                "osm_type": otype,
                "osm_id": oid,
                "qid": raw_qid,
                "kind": "broken_osm_tag",
                "subkind": "non_entity_or_non_physical",
                "confidence": 0.95,
                "reasons": ["Entity is a non-physical class (disambiguation page, event, list, or category)"],
                "suggested_fix": {
                    "target": "osm",
                    "action": "remove_tag",
                    "tag": "wikidata",
                    "value": ""
                },
                "osm": self._format_osm_summary(obj),
                "wikidata": self._format_wd_summary(wd_entity)
            })
            return findings

        # ---------------------------------------------------------
        # Category 2: Conflict (Multi-tag or ID mismatch)
        # ---------------------------------------------------------
        # Wikidata ID collision check: Does Wikidata already point to a different OSM ID?
        wd_target_osm_ids = wd_entity.get(target_prop.lower(), [])
        if wd_target_osm_ids:
            str_oid = str(oid)
            if str_oid in wd_target_osm_ids:
                # Already linked on Wikidata to this exact ID!
                # Nothing missing for this property
                pass
            else:
                # Wikidata points to a DIFFERENT ID!
                other_ids = [x for x in wd_target_osm_ids if x != str_oid]
                is_stale_upgrade = False
                # If old ID is no longer in OSM
                if other_ids and not any(f"{otype}{x}" in existing_osm_ids for x in other_ids):
                    is_stale_upgrade = True

                findings.append({
                    "osm_type": otype,
                    "osm_id": oid,
                    "qid": raw_qid,
                    "kind": "conflict",
                    "subkind": "stale_node_to_way_upgrade" if is_stale_upgrade else "active_id_conflict",
                    "confidence": 0.90 if is_stale_upgrade else 0.70,
                    "reasons": [
                        f"Wikidata {target_prop} already points to {otype}{','.join(other_ids)}"
                        + (" (stale element no longer exists in OSM)" if is_stale_upgrade else " (both exist in OSM)")
                    ],
                    "suggested_fix": {
                        "target": "wikidata",
                        "action": "replace_claim" if is_stale_upgrade else "review",
                        "property": target_prop,
                        "value": str_oid
                    },
                    "osm": self._format_osm_summary(obj),
                    "wikidata": self._format_wd_summary(wd_entity)
                })
                return findings

        # Multi-tag classification check
        if multi_info:
            bucket = multi_info["bucket"]
            if bucket == "split_linear_ways":
                # Benign OSM segmentation! Suppress P10689 to respect Wikidata Single-Value constraint
                # Omit from errors
                return findings
            elif bucket == "relation_with_members":
                # Benign: relation owns the backlink; suppress member ways/nodes
                if otype != 'r':
                    return findings
            elif bucket == "place_node_plus_boundary_rel":
                # Benign coexistence of place node and admin relation
                pass
            elif bucket == "duplicate_poi_representation":
                findings.append({
                    "osm_type": otype,
                    "osm_id": oid,
                    "qid": raw_qid,
                    "kind": "conflict",
                    "subkind": "duplicate_poi_representation",
                    "confidence": 0.65,
                    "reasons": [f"QID is shared between a node and way representation within 150m (canonical: {multi_info.get('canonical_osm')})"],
                    "suggested_fix": {
                        "target": "osm",
                        "action": "review_duplicate",
                        "tag": "wikidata",
                        "value": raw_qid
                    },
                    "osm": self._format_osm_summary(obj),
                    "wikidata": self._format_wd_summary(wd_entity)
                })
                return findings
            elif bucket == "parent_admin_pollution":
                findings.append({
                    "osm_type": otype,
                    "osm_id": oid,
                    "qid": raw_qid,
                    "kind": "conflict",
                    "subkind": "parent_admin_pollution",
                    "confidence": 0.85,
                    "reasons": [f"QID is shared by {multi_info['count']} separate, distant OSM objects (likely a parent governorate/region QID mis-tagged on child features)"],
                    "suggested_fix": {
                        "target": "osm",
                        "action": "migrate_tag",
                        "from_tag": "wikidata",
                        "to_tag": "is_in:wikidata",
                        "value": raw_qid
                    },
                    "osm": self._format_osm_summary(obj),
                    "wikidata": self._format_wd_summary(wd_entity)
                })
                return findings

        # ---------------------------------------------------------
        # Category 3: Missing Backlink (Fix is on Wikidata)
        # ---------------------------------------------------------
        # If Wikidata does NOT have target_prop pointing to this OSM object:
        if str(oid) not in wd_target_osm_ids:
            score, reasons, dist_m = self._compute_confidence(obj, wd_entity, multi_info)
            subkind = "high_confidence" if score >= 0.85 else ("medium_confidence" if score >= 0.60 else "low_confidence")

            findings.append({
                "osm_type": otype,
                "osm_id": oid,
                "qid": raw_qid,
                "kind": "missing_backlink",
                "subkind": subkind,
                "confidence": round(score, 2),
                "reasons": reasons,
                "suggested_fix": {
                    "target": "wikidata",
                    "action": "add_claim",
                    "property": target_prop,
                    "value": str(oid)
                },
                "osm": self._format_osm_summary(obj),
                "wikidata": self._format_wd_summary(wd_entity, dist_m)
            })

        # ---------------------------------------------------------
        # Category 4: Review Gap (Opt-in informational)
        # ---------------------------------------------------------
        # Wikidata lacks coordinates P625 or lacks Arabic label
        has_wd_coords = (wd_entity.get("lat") is not None and wd_entity.get("lon") is not None)
        has_wd_ar_label = bool(wd_entity.get("labels", {}).get("ar"))
        has_osm_coords = (obj["lat"] != 0.0 and obj["lon"] != 0.0)
        has_osm_ar_name = bool(obj["name_ar"] or (obj["name"] and normalize_arabic(obj["name"])))

        gap_reasons = []
        if not has_wd_coords and has_osm_coords:
            gap_reasons.append("Wikidata lacks coordinate location (P625)")
        if not has_wd_ar_label and has_osm_ar_name:
            gap_reasons.append("Wikidata lacks Arabic label (name_ar)")

        if gap_reasons:
            findings.append({
                "osm_type": otype,
                "osm_id": oid,
                "qid": raw_qid,
                "kind": "review_gap",
                "subkind": "missing_coords" if not has_wd_coords else "missing_ar_label",
                "confidence": 0.50,
                "reasons": gap_reasons,
                "suggested_fix": None, # Never auto-copy coordinates/names across license boundary!
                "osm": self._format_osm_summary(obj),
                "wikidata": self._format_wd_summary(wd_entity)
            })

        return findings

    def _compute_confidence(
        self,
        osm_obj: Dict[str, Any],
        wd_entity: Dict[str, Any],
        multi_info: Optional[Dict[str, Any]]
    ) -> Tuple[float, List[str], Optional[int]]:
        """
        Calculates confidence score (0.00 .. 1.00) based on name match, proximity, and ontology.
        """
        score = 0.0
        reasons = []
        dist_m = None

        wd_labels = wd_entity.get("labels", {})
        wd_ar = wd_labels.get("ar", "")
        wd_en = wd_labels.get("en", "")

        osm_ar = osm_obj.get("name_ar") or osm_obj.get("name") or ""
        osm_en = osm_obj.get("name_en") or ""

        # 1. Name match (up to 0.45)
        name_sim = match_names_composite(osm_ar, osm_en, wd_ar, wd_en)
        if name_sim >= 0.95:
            score += 0.45
            reasons.append("Exact name match (including Arabic/English or serial normalization)")
        elif name_sim >= 0.80:
            score += 0.38
            reasons.append(f"Strong name match ({int(name_sim*100)}% similarity)")
        elif name_sim >= 0.60:
            score += 0.25
            reasons.append(f"Moderate name match ({int(name_sim*100)}% similarity)")
        elif name_sim > 0.0:
            score += 0.10
            reasons.append("Partial name/consonant overlap")

        # 2. Coordinate proximity (up to 0.35)
        olat = osm_obj.get("lat", 0.0)
        olon = osm_obj.get("lon", 0.0)
        wlat = wd_entity.get("lat")
        wlon = wd_entity.get("lon")

        if olat != 0.0 and olon != 0.0 and wlat is not None and wlon is not None:
            dist_m = haversine_distance_m(olat, olon, wlat, wlon)
            if dist_m < 50:
                score += 0.35
                reasons.append(f"Immediate proximity ({dist_m}m)")
            elif dist_m < 150:
                score += 0.28
                reasons.append(f"Close proximity ({dist_m}m)")
            elif dist_m < 500:
                score += 0.18
                reasons.append(f"Nearby proximity ({dist_m}m)")
            elif dist_m < 2000:
                score += 0.10
                reasons.append(f"Area proximity ({dist_m}m)")
            elif dist_m > 5000:
                score -= 0.30
                reasons.append(f"Proximity penalty: coordinates differ by {dist_m//1000}km")
        else:
            # Rescale slightly when coordinates are absent on relation or Wikidata
            score += 0.15
            reasons.append("Coordinates absent on one side (evaluation based on name & ontology)")

        # 3. Ontology & 1-to-1 Exclusivity (up to 0.20)
        if not multi_info:
            score += 0.10
            reasons.append("1-to-1 unique tag match in OSM")

        p31_list = wd_entity.get("p31", [])
        if any(c in P31_ONTOLOGY for c in p31_list):
            score += 0.10
            reasons.append("Class matches recognized GCC ontology")

        return min(max(round(score, 2), 0.0), 1.0), reasons, dist_m

    def _format_osm_summary(self, obj: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "type": obj["osm_type"],
            "id": obj["osm_id"],
            "name": obj["name"],
            "name_ar": obj["name_ar"],
            "name_en": obj["name_en"],
            "lat": obj["lat"],
            "lon": obj["lon"],
            "main_key": obj["main_key"],
            "main_val": obj["main_val"]
        }

    def _format_wd_summary(self, ent: Dict[str, Any], dist_m: Optional[int] = None) -> Dict[str, Any]:
        labels = ent.get("labels", {})
        descs = ent.get("descriptions", {})
        p31 = ent.get("p31", [])
        p31_names = []
        for q in p31:
            if q in P31_ONTOLOGY:
                p31_names.append(f"{P31_ONTOLOGY[q]['name_ar']} / {P31_ONTOLOGY[q]['name_en']}")
            else:
                p31_names.append(q)

        return {
            "qid": ent.get("qid"),
            "name_ar": labels.get("ar", ""),
            "name_en": labels.get("en", ""),
            "desc_ar": descs.get("ar", ""),
            "desc_en": descs.get("en", ""),
            "p31": p31,
            "p31_labels": p31_names,
            "lat": ent.get("lat"),
            "lon": ent.get("lon"),
            "dist_m": dist_m
        }

def run_reverse_analysis(
    country_code: str,
    force_refresh_wikidata: bool = False
) -> Dict[str, Any]:
    """
    Executes reverse analysis for a specific country and writes data/reverse_<cc>.json.
    """
    country_code = country_code.lower()
    c_upper = country_code.upper()
    if c_upper not in GCC_COUNTRIES:
        raise ValueError(f"Unknown GCC country code: {c_upper}")

    osm_conn = sqlite3.connect(OSM_CACHE_DB)
    wd_conn = sqlite3.connect(WIKIDATA_CACHE_DB)

    analyzer = ReverseAnalyzer(osm_conn, wd_conn)

    print(f"  [Reverse QA] Loading linked OSM objects for {c_upper}...")
    objects = analyzer.load_country_linked_objects(c_upper)
    print(f"  [Reverse QA] Found {len(objects):,} linked OSM objects in {c_upper}.")

    # Gather QIDs to fetch from Wikidata
    qids_to_fetch = [
        normalize_malformed_qid(o["qid"]) or o["qid"]
        for o in objects
        if o["qid"]
    ]
    wd_entities = fetch_tagged_qids_batch(
        qids_to_fetch, wd_conn, force_refresh=force_refresh_wikidata
    )

    # Multi-tag analysis
    multi_info = analyzer.preclassify_multi_tagged(objects)

    # Set of existing OSM IDs in dataset (for stale upgrade detection)
    existing_osm_ids = {f"{o['osm_type']}{o['osm_id']}" for o in objects}

    items = []
    counts = {
        "total_tagged": len(objects),
        "missing_backlink": 0,
        "missing_backlink_high": 0,
        "missing_backlink_medium": 0,
        "missing_backlink_low": 0,
        "broken_osm_tag": 0,
        "conflict": 0,
        "review_gap": 0
    }

    for obj in objects:
        raw_q = obj["qid"]
        norm_q = normalize_malformed_qid(raw_q) or raw_q
        ent = wd_entities.get(norm_q) or wd_entities.get(raw_q)
        m_info = multi_info.get(norm_q)

        obj_findings = analyzer.audit_object(obj, ent, m_info, existing_osm_ids)
        for f in obj_findings:
            kind = f["kind"]
            if kind == "missing_backlink":
                counts["missing_backlink"] += 1
                if f["subkind"] == "high_confidence":
                    counts["missing_backlink_high"] += 1
                elif f["subkind"] == "medium_confidence":
                    counts["missing_backlink_medium"] += 1
                elif f["subkind"] == "low_confidence":
                    counts["missing_backlink_low"] += 1
            elif kind == "broken_osm_tag":
                counts["broken_osm_tag"] += 1
            elif kind == "conflict":
                counts["conflict"] += 1
            elif kind == "review_gap":
                counts["review_gap"] += 1
            items.append(f)

    osm_conn.close()
    wd_conn.close()

    result = {
        "country": c_upper,
        "country_name_en": GCC_COUNTRIES[c_upper]["name_en"],
        "country_name_ar": GCC_COUNTRIES[c_upper]["name_ar"],
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "counts": counts,
        "items": items
    }

    # Write out data/reverse_<cc>.json
    out_file = os.path.join(DATA_DIR, f"reverse_{country_code}.json")
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, separators=(',', ':'))

    file_size_kb = os.path.getsize(out_file) / 1024
    print(f"  [Reverse QA] Wrote {out_file} ({file_size_kb:.1f} KB | {counts['missing_backlink_high']:,} high back-links, {counts['broken_osm_tag']:,} broken tags, {counts['conflict']:,} conflicts).")

    return result
