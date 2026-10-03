/**
 * Hybrid Live Verification Module.
 * Executes on-demand micro-queries against live OSM servers for a 300m radius
 * to detect if an item was mapped after the local PBF extract was generated,
 * and extracts all candidate OSM objects with distance and coordinates.
 */

const LiveVerifier = {
  OVERPASS_ENDPOINTS: [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter"
  ],

  _cache: null,

  getVerifiedCache() {
    if (this._cache) return this._cache;
    try {
      this._cache = JSON.parse(localStorage.getItem("osm_wd_verified_qids") || "{}");
    } catch (e) {
      this._cache = {};
    }
    return this._cache;
  },

  markVerifiedLocally(qid, osmRef, name) {
    const cache = this.getVerifiedCache();
    cache[qid] = {
      osm_ref: osmRef,
      name: name,
      verified_at: Date.now()
    };
    this._cache = cache;
    try {
      localStorage.setItem("osm_wd_verified_qids", JSON.stringify(cache));
    } catch (e) {
      console.warn("Could not save to localStorage:", e);
    }
  },

  isLocallyVerified(qid) {
    const cache = this.getVerifiedCache();
    return cache[qid] || null;
  },

  /**
   * Distance calculation in meters between two lat/lon points.
   */
  calcDistanceM(lat1, lon1, lat2, lon2) {
    const rad = Math.PI / 180;
    const dy = (lat2 - lat1) * 110574.0;
    const dx = (lon2 - lon1) * 111320.0 * Math.cos(lat1 * rad);
    return Math.round(Math.sqrt(dx * dx + dy * dy));
  },

  /**
   * Queries live Overpass for a 300m radius around (lat, lon)
   * and returns all relevant candidate OSM POIs.
   */
  async verifyItemLive(item) {
    const qid = `Q${item[0]}`;
    const lat = item[1];
    const lon = item[2];
    const targetNameAr = ArabicUtils.normalize(item[5] || "", true);
    const targetNameEn = (item[6] || "").toLowerCase().trim();

    // Query 300m around coordinates (nodes, ways, relations with center)
    const query = `[out:json][timeout:10];(
      node(around:300,${lat},${lon})[amenity];
      node(around:300,${lat},${lon})[historic];
      node(around:300,${lat},${lon})[tourism];
      node(around:300,${lat},${lon})[shop];
      node(around:300,${lat},${lon})[natural];
      node(around:300,${lat},${lon})[place];
      node(around:300,${lat},${lon})[leisure];
      node(around:300,${lat},${lon})[building];
      node(around:300,${lat},${lon})[name];
      way(around:300,${lat},${lon})[amenity];
      way(around:300,${lat},${lon})[historic];
      way(around:300,${lat},${lon})[tourism];
      way(around:300,${lat},${lon})[natural];
      way(around:300,${lat},${lon})[building][name];
      way(around:300,${lat},${lon})[name];
      relation(around:300,${lat},${lon})[name];
    );out tags center;`;

    let data = null;
    let endpointIndex = 0;

    while (endpointIndex < this.OVERPASS_ENDPOINTS.length && !data) {
      try {
        const ep = this.OVERPASS_ENDPOINTS[endpointIndex];
        const res = await fetch(`${ep}?data=${encodeURIComponent(query)}`);
        if (res.ok) {
          data = await res.json();
        } else {
          endpointIndex++;
        }
      } catch (e) {
        endpointIndex++;
      }
    }

    if (!data || !data.elements) {
      throw new Error("Live OSM server did not respond or timed out.");
    }

    const elements = data.elements;
    let directMatch = null;
    const candidates = [];

    for (let el of elements) {
      const tags = el.tags || {};
      const elType = el.type.charAt(0);
      const elRef = `${elType}${el.id}`;

      // Coordinates resolution (node vs way/rel center)
      const elLat = el.lat !== undefined ? el.lat : (el.center ? el.center.lat : lat);
      const elLon = el.lon !== undefined ? el.lon : (el.center ? el.center.lon : lon);
      const distM = this.calcDistanceM(lat, lon, elLat, elLon);

      const name = tags.name || tags["name:ar"] || tags["name:en"] || "";
      const normName = ArabicUtils.normalize(name, true);
      const nameEn = (tags["name:en"] || "").toLowerCase();

      // Check 1: Direct wikidata tag match
      if (tags.wikidata === qid) {
        directMatch = {
          ref: elRef,
          name: name || elRef,
          distance_m: distM,
          lat: elLat,
          lon: elLon,
          tags: tags,
          is_direct: true
        };
        break;
      }

      // Skip unnamed boundaries and generic highway ways
      if (!name && !tags.amenity && !tags.historic && !tags.tourism) {
        continue;
      }

      // Check 2: Match scoring
      let score = 0.0;
      let matchedReason = "";

      if (targetNameAr && normName) {
        if (normName === targetNameAr) {
          score = 1.0;
          matchedReason = "Exact Arabic Name Match";
        } else if (normName.includes(targetNameAr) || targetNameAr.includes(normName)) {
          score = 0.8;
          matchedReason = "Partial Arabic Name Match";
        }
      }

      if (targetNameEn && nameEn) {
        if (nameEn === targetNameEn) {
          score = Math.max(score, 1.0);
          matchedReason = "Exact English Name Match";
        } else if (nameEn.includes(targetNameEn) || targetNameEn.includes(nameEn)) {
          score = Math.max(score, 0.75);
          matchedReason = "Partial English Name Match";
        }
      }

      // Proximity score bonus
      if (distM <= 50) {
        score += 0.2;
      } else if (distM <= 120) {
        score += 0.1;
      }

      // Tag type match bonus
      if (item[3] === 6 && (tags.amenity === "place_of_worship" || tags.building === "mosque")) {
        score += 0.15;
      }

      if (score >= 0.4 || (name && distM <= 80)) {
        candidates.push({
          ref: elRef,
          name: name || `${tags.amenity || tags.historic || tags.tourism || elRef}`,
          distance_m: distM,
          lat: elLat,
          lon: elLon,
          tags: tags,
          score: Math.min(1.0, score),
          matchedReason: matchedReason || `Nearby (${distM}m)`
        });
      }
    }

    if (directMatch) {
      this.markVerifiedLocally(qid, directMatch.ref, directMatch.name);
      return {
        status: "linked",
        ref: directMatch.ref,
        name: directMatch.name,
        directMatch: directMatch,
        candidates: [directMatch],
        count_nearby: elements.length
      };
    }

    // Sort candidates by score descending, then distance ascending
    candidates.sort((a, b) => b.score - a.score || a.distance_m - b.distance_m);

    if (candidates.length > 0) {
      return {
        status: "candidate",
        ref: candidates[0].ref,
        name: candidates[0].name,
        candidates: candidates.slice(0, 5), // top 5 candidates
        count_nearby: elements.length
      };
    }

    return {
      status: "missing",
      candidates: [],
      count_nearby: elements.length
    };
  }
};

window.LiveVerifier = LiveVerifier;
