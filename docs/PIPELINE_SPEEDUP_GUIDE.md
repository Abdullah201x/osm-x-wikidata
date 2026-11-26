# Pipeline speed-up guide for OSM x Wikidata

Written 2026-11-23. Source: the Manara pipeline speed-up (same Geofabrik GCC extract, same pyosmium) plus `GCC_EXPANSION_GUIDE.md` / `PIPELINE_PERFORMANCE_PLAN.md` from the OSM Quality Guard project.

**Status of the numbers.** Everything marked *measured* was measured in Manara on `gcc-states.osm.pbf` (258 MB). Everything marked *expected* is an estimate for THIS project: I read its code but did not run it. Verify each change with the checks in section 6 before trusting it.

## 0. Short version

1. **Python is not the problem; Python callbacks on every object are.** The GCC extract has ~34M nodes and ~4.2M ways. Calling a Python method for each one costs minutes, even when the method returns immediately.
2. **Fix: let libosmium (C++) drop objects before Python sees them**, with `apply_file(..., filters=[...])`. Measured in Manara: `extract_places` 174 s -> 16 s, output byte-identical.
3. **Do not use Rust.** For a Saudi/GCC-only, single-purpose project it adds a toolchain to maintain, and the cost was never the language. Both other projects reached the same conclusion (`PIPELINE_PERFORMANCE_PLAN.md`: "It does not come from Python").
4. Fix the `find_pbf` glob first (section 1). It is a correctness bug, not a speed one.

## 1. Correctness first: `find_pbf` can pick the full-history file

`pipeline/config.py:30` globs `*.osm.pbf` **and** `*.pbf`, then takes the newest by mtime from `..\update osm\`. That folder also holds `gcc-states-internal.osh.pbf` (589 MB, every version of every object, deleted objects included).

Today the `.osm.pbf` (2026-11-23) is newer than the `.osh.pbf` (2026-11-22), so it works. The first time the `.osh.pbf` is the newer one, the pipeline silently parses 2x the bytes and sees duplicate IDs and deleted features. In OSM Quality Guard this exact bug made results wrong and the run 2-4x slower.

Fix:
- `config.py`: glob only `*.osm.pbf`. Never `*.osh.pbf`.
- Add a content check, not just a name check, in `extract_pbf_to_cache`:
  ```python
  reader = osmium.io.Reader(pbf_path, osmium.osm.osm_entity_bits.NOTHING)
  try:
      if reader.header().has_multiple_object_versions:
          raise ValueError(f"{pbf_path} is a history file; use an .osm.pbf")
  finally:
      reader.close()
  ```
- Print which file was chosen at startup.

## 2. The main win: C++ filters in `pipeline/pbf_extractor.py`

### What the code does now
`GCCPbfHandler` defines `node()`, `way()` and `relation()`. pyosmium calls `node()` for every node in the file. Each call reads tags, a coordinate range check, and a loop over `TARGET_TAG_KEYS`, only to discard ~99% of nodes.

An object is kept only if it has `wikidata`, or has a key in `TARGET_TAG_KEYS` **and** a name. So every kept object has at least one of `wikidata` or a `TARGET_TAG_KEYS` key. That is exactly what a `KeyFilter` expresses.

### The change
`osmium.filter.KeyFilter(*keys)` passes an object only if it has at least one of the keys. It runs in C++ (before your handler), so Python is called only for the survivors.

```python
# pbf_extractor.py
FILTER_KEYS = ("wikidata",) + TARGET_TAG_KEYS

handler = GCCPbfHandler()
handler.apply_file(
    pbf_path,
    locations=True,
    filters=[osmium.filter.KeyFilter(*FILTER_KEYS)],
)
handler.close()
```

Why this is safe for ways: pyosmium runs the node-location handler **before** the filters (see `SimpleHandler._apply_object` in `osmium/simple_handler.py`: `handlers = [lh, *filters, self]`). So untagged nodes are dropped from your callbacks but their locations are still stored, and `w.nodes` still has coordinates for the centroid calculation. Do not "optimize" by removing `locations=True`.

Keep the existing logic inside `node()/way()/relation()` unchanged. The filter only removes objects that the existing `if` statements would have rejected anyway, so the output should be identical.

Keep `FILTER_KEYS` derived from `TARGET_TAG_KEYS` (as above), never a second hand-written list, or the two will drift.

### Expected effect
*Expected* (not measured here): the parse step shrinks to roughly the C++ read time (10-20 s for this file) plus Python work on the kept objects. In Manara the equivalent step went 174 s -> 16 s. Your handler keeps more objects than Manara's (every object with a name and any `TARGET_TAG_KEYS` key, not only worship tags), so expect the Python share to be larger. Measure it.

### Optional second step: way centroids without a Python loop
`way()` loops over `w.nodes` in Python to sum lat/lon (~9 million attribute reads in Manara's road step, ~13 s of pure `node.lat`/`node.lon` overhead). If profiling shows this matters after step 2, ask libosmium for the geometry once per way:
```python
self._wkb = osmium.geom.WKBFactory()
wkb = self._wkb.create_linestring(w)   # hex WKB; raises RuntimeError for <2 distinct points
```
then decode the float64 coordinates with numpy (layout: `0102000000` header + uint32 count + lon/lat pairs; see `DrivableRoadExtractor.road_segments` in Manara's `pipeline/calculate_gaps.py`). Note that your current centroid is the plain mean of the way's nodes, including the repeated closing node. `create_linestring` drops *consecutive duplicate* nodes only, so the mean is the same unless a way repeats a node consecutively. Compare outputs before adopting. Only do this if the profile says it matters.

## 3. Boundaries: `pipeline/country_boundaries.py`

Pass 2 (`GCCWayCoordinateCollector`) is called for every way in the file just to find a few hundred boundary ways. Add an ID filter (measured in Manara: 19 s -> 5 s and 23 s -> 9 s, output byte-identical):
```python
coord_collector.apply_file(
    pbf_path, locations=True,
    filters=[osmium.filter.IdFilter(rel_collector.all_way_ids).enable_for(osmium.osm.WAY)],
)
```
`.enable_for(osmium.osm.WAY)` is required: without it the filter also applies to nodes/relations. (The filtering for nodes does not break locations; the location handler already ran.)

## 4. Optional: SQLite load (`init_osm_db`, `_flush`)

From `PIPELINE_PERFORMANCE_PLAN.md` section 6: for a cache that is rebuilt from scratch, `journal_mode=OFF`, `synchronous=OFF`, a bigger cache and creating indexes **after** the bulk insert were all worth tens of seconds on a 1.6M-row store.

Here `extract_pbf_to_cache` already does `DELETE FROM ...` then re-inserts with 5 indexes in place, using `INSERT OR REPLACE`. If profiling shows the inserts are slow after step 2:
- drop the secondary indexes before the parse and `CREATE INDEX` after it;
- use `INSERT` instead of `INSERT OR REPLACE` (rows were just deleted; the primary key still protects you);
- consider building into `osm_cache.db.tmp` and `os.replace`-ing it, so a crash mid-parse never leaves a half-empty cache that `--reparse-pbf` thinks is current. (Today `pbf_mtime` is only written at the end, so this is already safe; the temp file mainly helps readers.)

Skip this unless the profile points at it. Your tables are much smaller than Manara's.

## 5. Things that look like wins but are not

- **Rust PBF builder** (the other project's `rust/pbf_store_builder`): it was built for a 1.6M-element store with 12 analyzers and multi-country scaling. Its own plan says "only if still needed". For this project, steps 1-3 get to C++-read-time without it.
- **Brotli parallelism**: Manara's `publish()` compresses ~55 MB with Brotli quality 11, which takes 80 s sequentially (21 s with a thread pool). Your `Dockerfile` precompresses with `brotli -q 9 -k` on ~17 MB of JSON at image build time. That is seconds, and q9 is within a few percent of q11 for size. Leave it.
- **Pre-cutting a smaller PBF** or **sharing one pass across scripts**: in Manara this was worth ~30 s of a 750 s run and added output-drift risk. Not worth it at this size.
- **`ThreadPoolExecutor` for analyzers**: CPU-bound Python does not benefit from threads (GIL). Threads help only when the work is in C code that releases the GIL (brotli, zlib, libosmium) as in the Brotli case above.

## 6. How to verify (do this, do not skip)

### 6.1 Get a repeatable input
Use one fixed PBF for before/after. The current one is `..\update osm\gcc-states-261122-internal.osm.pbf`. Copy it somewhere so a daily download does not change it mid-test.

### 6.2 Protect your real data
Run experiments against a scratch DB, never `data\` or `osm_cache.db` in the repo. Check how `OSM_CACHE_DB` is set in `pipeline/config.py`; point it at a temp path for the test (an env var, or temporarily monkeypatch it in a test script). **In Manara a script run without its data-dir env var overwrote tracked files; the same can happen here.**

### 6.3 Profile before changing anything
```bash
python -X utf8 -c "
import cProfile, pstats, sys
sys.path.insert(0, '.')
from pipeline.pbf_extractor import extract_pbf_to_cache
cProfile.run('extract_pbf_to_cache(r\"<pbf>\", force_reparse=True)', 'p.out')
pstats.Stats('p.out').sort_stats('tottime').print_stats(12)"
```
Look for `node()` called ~34 million times. If the call counts are not in the millions, the filter will not help and you should stop.

### 6.4 Prove the output did not change
After the change, rebuild the cache and compare row sets, not file bytes (SQLite files are not byte-stable):
```sql
SELECT COUNT(*) FROM osm_linked;       -- must match before
SELECT COUNT(*) FROM osm_candidates;   -- must match before
SELECT COUNT(*) FROM osm_relation_members;
```
and diff the full contents:
```bash
sqlite3 before.db "SELECT * FROM osm_linked ORDER BY osm_type, osm_id" > a.txt
sqlite3 after.db  "SELECT * FROM osm_linked ORDER BY osm_type, osm_id" > b.txt
cmp a.txt b.txt   # repeat for osm_candidates and osm_relation_members
```
The exported `data\*.json` files should also be identical (`cmp`). If they differ only in ordering, check whether the order comes from file-emission order or from the data.

### 6.5 Add a test
Mirror Manara's `tests/test_pbf_filters.py`: build a tiny `.opl` file in `tmp_path` and assert
1. the filter passes exactly the nodes the Python predicate would keep;
2. a way whose nodes are all untagged still gets coordinates (centroid is not `None`/missing).
`.opl` is a plain text format that `osmium.FileProcessor` reads directly, e.g. `n1 v1 x46.0 y24.0 T` for an untagged node and `w10 v1 Tamenity=mosque Nn1,n2,n3,n1` for a way.

## 7. Pitfalls found while doing this in Manara

- **Anything order-dependent can change when you add filters.** libosmium's emit order for multipolygon areas shifted in Manara, which changed scikit-learn `IsolationForest` scores even with `random_state=42` (about 8 of 80 flagged items swapped). If this project's `ml_matcher.py` trains on rows read in extraction order, sort by a stable key (e.g. `osm_id`) before fitting. Output keyed by ID is unaffected.
- **Exact-key filters only.** `KeyFilter("name")` does not match `name:ar`. Here that is fine because `FILTER_KEYS` contains `wikidata` and the `TARGET_TAG_KEYS`, and every kept object needs one of those. If you ever keep objects on a name alone, add the name keys.
- **Windows consoles**: run scripts with `python -X utf8` when you pipe output, or Arabic text raises `UnicodeDecodeError` in the capture thread (that was my test harness, not the pipeline).
- **Line endings**: check `git diff --stat` after editing. Rewriting a file with a script that normalizes `\r\n` -> `\n` turns a 12-line change into a 500-line diff.
- **Do not trust a benchmark that overwrote its own baseline.** Keep the "before" output in a separate directory, and `cmp` against that copy.

## 8. Suggested order

| # | Change | Where | Risk | Expected |
|---|---|---|---|---|
| 1 | Only parse `*.osm.pbf` + history header check | `config.py`, `pbf_extractor.py` | none | correctness; avoids 2x slowdown |
| 2 | Profile the parse (6.3) | - | none | confirms the cause |
| 3 | `KeyFilter(*FILTER_KEYS)` on the main parse | `pbf_extractor.py` | low (verify with 6.4) | parse -> near C++ read time |
| 4 | `IdFilter` for boundary ways | `country_boundaries.py` | low | -15 s per boundary rebuild (measured in Manara) |
| 5 | Add the filter test | `tests/` | none | keeps (3) honest |
| 6 | Only if still slow: WKB centroids (section 2), SQLite load tweaks (section 4) | `pbf_extractor.py` | medium | profile first |

Stop after step 5 unless the profile still shows the parse dominating the run.
