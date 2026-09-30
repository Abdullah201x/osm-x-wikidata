"""
Master Data Pipeline Runner for OSM x Wikidata GCC Linker.
Orchestrates:
1. PBF scanning via pyosmium (extracting linked entities & candidate POIs).
2. Wikidata SPARQL syncing for GCC countries (with SQLite caching).
3. Spatial join & Arabic name matching.
4. Exporting compact, minified web JSON datasets to data/*.json and data/summary.json.

Compatible with C:\\Users\\abdul\\Desktop\\update osm\\update_projects.py.
"""

import os
import sys
import time
import json
import argparse

# Ensure UTF-8 output on Windows consoles
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE_DIR)

from pipeline.config import GCC_COUNTRIES, DATA_DIR, find_pbf
from pipeline.pbf_extractor import extract_pbf_to_cache
from pipeline.wikidata_fetcher import fetch_country_wikidata
from pipeline.matcher import match_country_items

def main():
    parser = argparse.ArgumentParser(description="Update OSM x Wikidata GCC datasets.")
    parser.add_argument(
        "--country",
        type=str,
        default="all",
        help="Target country code (sa, ae, kw, qa, bh, om) or 'all' (default).",
    )
    parser.add_argument(
        "--pbf",
        type=str,
        default=None,
        help="Path to .osm.pbf file (auto-detected if omitted).",
    )
    parser.add_argument(
        "--reparse-pbf",
        action="store_true",
        help="Force re-parsing of PBF file even if cached mtime matches.",
    )
    parser.add_argument(
        "--refresh-wikidata",
        action="store_true",
        help="Force fresh Wikidata SPARQL queries instead of using SQLite cache.",
    )
    args = parser.parse_args()

    print("==================================================")
    print(" OSM x WIKIDATA GCC LINKER - DATA PIPELINE")
    print("==================================================")
    start_time = time.time()

    pbf_file = args.pbf or find_pbf(BASE_DIR)
    if not pbf_file or not os.path.exists(pbf_file):
        print(f"[ERROR] No .osm.pbf file found. Looked in 'update osm' and '{BASE_DIR}'.")
        sys.exit(1)

    print(f" PBF File:       {os.path.basename(pbf_file)}")
    print(f" PBF Path:       {pbf_file}")
    print(f" Target Country: {args.country.upper()}")
    print("==================================================")

    # Step 1: Scan / Update local PBF cache
    print("\n[Step 1/3] Checking & scanning local PBF file...")
    linked_cnt, cand_cnt = extract_pbf_to_cache(pbf_file, force_reparse=args.reparse_pbf)

    # Determine countries to process
    if args.country.lower() == "all":
        target_countries = list(GCC_COUNTRIES.keys())
    else:
        c_code = args.country.upper()
        if c_code not in GCC_COUNTRIES:
            sys.exit(f"[ERROR] Unknown country '{c_code}'. Valid codes: {', '.join(GCC_COUNTRIES.keys())}")
        target_countries = [c_code]

    # Load existing summary.json if available
    summary_file = os.path.join(DATA_DIR, "summary.json")
    if os.path.exists(summary_file):
        try:
            with open(summary_file, "r", encoding="utf-8") as f:
                summary = json.load(f)
        except Exception:
            summary = {"countries": {}}
    else:
        summary = {"countries": {}}

    summary["updated_at"] = time.strftime("%Y-%m-%d %H:%M:%S")
    summary["pbf_file"] = os.path.basename(pbf_file)
    if "countries" not in summary:
        summary["countries"] = {}

    # Step 2 & 3: Process countries
    for idx, c_code in enumerate(target_countries, 1):
        c_info = GCC_COUNTRIES[c_code]
        print(f"\n[Step 2/3] ({idx}/{len(target_countries)}) Processing {c_info['name_en']} ({c_code})...")

        # Fetch Wikidata items
        wd_items = fetch_country_wikidata(c_code, force_refresh=args.refresh_wikidata)

        # Match against OSM
        print(f"  [Matching] Running spatial join & Arabic fuzzy matching for {c_code}...")
        matched_result = match_country_items(c_code, wd_items)

        # Save country JSON file
        out_file = os.path.join(DATA_DIR, f"{c_code.lower()}.json")
        with open(out_file, "w", encoding="utf-8") as f:
            json.dump(matched_result, f, ensure_ascii=False, separators=(',', ':'))

        file_size_kb = os.path.getsize(out_file) / 1024
        print(f"  [Export] Wrote {out_file} ({file_size_kb:.1f} KB, {matched_result['counts']['total']:,} items)")

        # Update summary for this country
        summary["countries"][c_code] = {
            "name_en": c_info["name_en"],
            "name_ar": c_info["name_ar"],
            "file": f"{c_code.lower()}.json",
            "counts": matched_result["counts"]
        }

    # Recompute overall totals from all countries in summary
    summary["total_items"] = sum(c["counts"]["total"] for c in summary["countries"].values())
    summary["total_missing"] = sum(c["counts"]["missing"] for c in summary["countries"].values())
    summary["total_candidates"] = sum(c["counts"]["candidates"] for c in summary["countries"].values())
    summary["total_linked"] = sum(c["counts"]["linked"] for c in summary["countries"].values())
    summary["total_filtered_non_physical"] = sum(c["counts"].get("filtered_non_physical", 0) for c in summary["countries"].values())

    # Write summary.json
    summary_file = os.path.join(DATA_DIR, "summary.json")
    with open(summary_file, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    elapsed = time.time() - start_time
    print("\n==================================================")
    print(" PIPELINE RUN COMPLETE")
    print(f" Elapsed Time:     {elapsed:.1f}s")
    print(f" Total GCC Items:  {summary['total_items']:,}")
    print(f" Missing in OSM:   {summary['total_missing']:,} (🔴 needs mapping)")
    print(f" ML Candidates:    {summary['total_candidates']:,} (🟡 needs tag linkage)")
    print(f" Fully Linked:     {summary['total_linked']:,} (🟢 already in OSM)")
    print(f" Filtered Noise:   {summary['total_filtered_non_physical']:,} (🚫 events/non-physical purged)")
    print(f" Summary Saved:    {summary_file}")
    print("==================================================")

if __name__ == "__main__":
    main()
