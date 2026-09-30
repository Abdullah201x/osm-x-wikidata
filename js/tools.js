/**
 * Power-User Mapping Tools Suite.
 * Handles JOSM Remote Control (8111), iD Editor, QuickStatements,
 * and MapRoulette / CSV exports.
 */

const MappingTools = {
  JOSM_BASE: "http://127.0.0.1:8111",

  /**
   * JOSM Remote Control: Load bounding box and zoom.
   */
  async josmLoadAndZoom(lat, lon, selectRef = null) {
    const delta = 0.002; // ~220m bounding box
    let url = `${this.JOSM_BASE}/load_and_zoom?left=${lon - delta}&right=${lon + delta}&top=${lat + delta}&bottom=${lat - delta}`;
    if (selectRef) {
      // e.g. "n12345" -> "node12345", "w987" -> "way987"
      const fullSelect = selectRef.replace(/^n/, "node").replace(/^w/, "way").replace(/^r/, "relation");
      url += `&select=${fullSelect}`;
    }
    try {
      await fetch(url);
      return true;
    } catch (e) {
      alert(TRANSLATIONS[currentLang || "ar"].josmError);
      return false;
    }
  },

  /**
   * JOSM Remote Control: Push tags to currently selected object or specific element.
   */
  async josmAddTags(osmRef, qid) {
    const tagsParam = `wikidata=${qid}`;
    let url = `${this.JOSM_BASE}/add_tags?tags=${encodeURIComponent(tagsParam)}`;
    if (osmRef) {
      const type = osmRef.charAt(0) === 'w' ? 'way' : osmRef.charAt(0) === 'r' ? 'relation' : 'node';
      const id = osmRef.slice(1);
      url += `&url=https://www.openstreetmap.org/${type}/${id}`;
    }
    try {
      await fetch(url);
      return true;
    } catch (e) {
      alert(TRANSLATIONS[currentLang || "ar"].josmError);
      return false;
    }
  },

  /**
   * Generates direct link to OSM iD Editor.
   */
  getIdEditorUrl(lat, lon) {
    return `https://www.openstreetmap.org/edit?editor=id#map=19/${lat}/${lon}`;
  },

  /**
   * Generates QuickStatements v2 format string.
   */
  getQuickStatements(qid, osmRef) {
    if (!osmRef) return `${qid}|P11693|""`;
    const type = osmRef.charAt(0) === 'w' ? 'way' : osmRef.charAt(0) === 'r' ? 'relation' : 'node';
    const id = osmRef.slice(1);
    // P11693 is OpenStreetMap element ID
    return `${qid}|P11693|"${type}/${id}"`;
  },

  /**
   * Generates External Research Search URLs (NSI Style).
   */
  getGoogleSearchUrl(name) {
    return `https://www.google.com/search?q=${encodeURIComponent(name)}`;
  },

  getWikipediaSearchUrl(name) {
    return `https://www.google.com/search?q=${encodeURIComponent(name)}+site%3Awikipedia.org`;
  },

  getWikidataSearchUrl(name) {
    return `https://www.wikidata.org/w/index.php?search=${encodeURIComponent(name)}`;
  },

  /**
   * Generates NSI-style interactive Overpass Turbo query with 3-color MapCSS:
   * 🔴 Red: Features matching name in OSM
   * 🟡 Yellow: Features matching the category tag in OSM without wikidata link
   * 🟢 Green: Features correctly linked with wikidata=Q...
   */
  generateOverpassQuery(item, tags) {
    const qid = `Q${item[0]}`;
    const lat = item[1];
    const lon = item[2];
    const name = item[5] || item[6] || "";
    const cleanName = name.replace(/"/g, '\\"');

    // Find main key/val pair from generated tags
    let mainK = "amenity", mainV = "place_of_worship";
    for (let k of ["amenity", "historic", "tourism", "place", "shop", "leisure", "natural", "waterway", "aeroway"]) {
      if (tags[k]) {
        mainK = k;
        mainV = tags[k];
        break;
      }
    }

    const bboxRadius = 0.02; // ~2.2 km around the item
    const south = (lat - bboxRadius).toFixed(4);
    const west = (lon - bboxRadius).toFixed(4);
    const north = (lat + bboxRadius).toFixed(4);
    const east = (lon + bboxRadius).toFixed(4);

    return `[out:json][timeout:60][bbox:${south},${west},${north},${east}];
(
  nwr["name"="${cleanName}"];
  nwr["${mainK}"="${mainV}"];
);
out body;
>;
out skel qt;

{{style:
node, way, relation {
  color: #ff3366;
  fill-color: #ff3366;
  fill-opacity: 0.3;
}
node["${mainK}"="${mainV}"],
way["${mainK}"="${mainV}"],
relation["${mainK}"="${mainV}"] {
  color: #ffb703;
  fill-color: #ffb703;
  fill-opacity: 0.4;
}
node["wikidata"="${qid}"],
way["wikidata"="${qid}"],
relation["wikidata"="${qid}"] {
  color: #00ff87;
  fill-color: #00ff87;
  fill-opacity: 0.6;
}
}}`;
  },

  openOverpassTurbo(item, tags) {
    const query = this.generateOverpassQuery(item, tags);
    const url = `https://overpass-turbo.eu/?Q=${encodeURIComponent(query)}&R`;
    window.open(url, "_blank");
  },

  /**
   * Exports filtered items as official JOSM Tagging Presets XML file.
   * Mappers can add this directly to JOSM Preferences -> Tagging Presets.
   */
  exportJosmPresets(items, countryName) {
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<presets xmlns="http://josm.openstreetmap.de/tagging-preset-1.0"\n`;
    xml += `         author="OSM x Wikidata GCC Linker"\n`;
    xml += `         shortdescription="GCC Wikidata (${countryName.toUpperCase()})"\n`;
    xml += `         description="Canonical Wikidata Presets for ${countryName.toUpperCase()} features"\n`;
    xml += `         version="1.0">\n`;

    const catMap = {
      1: "Cities and Settlements",
      2: "Heritage and Archaeology",
      3: "Geography and Nature",
      4: "Healthcare and Education",
      5: "Tourism and Commercial",
      6: "Places of Worship"
    };

    const grouped = {};
    for (let it of items) {
      const cat = it[3] || 5;
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(it);
    }

    const escapeXml = (str) => {
      return String(str || "")
        .replace(/&/g, "&amp;")
        .replace(/'/g, "&apos;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    };

    for (let catId in grouped) {
      const groupName = catMap[catId] || `Category ${catId}`;
      xml += `  <group name="${escapeXml(groupName)}">\n`;

      const groupItems = grouped[catId].slice(0, 3000);
      for (let it of groupItems) {
        const qid = `Q${it[0]}`;
        const name = it[5] || it[6] || qid;
        const tags = TagGenerator.generateTags(it);

        xml += `    <item name="${escapeXml(name)} (${qid})" type="node,way,relation">\n`;
        for (let [k, v] of Object.entries(tags)) {
          xml += `      <key key="${escapeXml(k)}" value="${escapeXml(v)}"/>\n`;
        }
        xml += `    </item>\n`;
      }
      xml += `  </group>\n`;
    }

    xml += `</presets>\n`;

    this._downloadFile(
      `josm_presets_${countryName.toLowerCase()}.xml`,
      xml,
      "application/xml;charset=utf-8;"
    );
  },

  /**
   * Exports filtered items as a MapRoulette Challenge GeoJSON bundle.
   */
  exportMapRoulette(items, countryName) {
    const features = items.map(item => {
      const qid = `Q${item[0]}`;
      const lat = item[1];
      const lon = item[2];
      const statusStr = item[4] === 0 ? "Missing in OSM" : item[4] === 1 ? "Candidate Match" : "Linked";
      return {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [lon, lat]
        },
        properties: {
          qid: qid,
          name_ar: item[5] || "",
          name_en: item[6] || "",
          p31: item[7] || "",
          status: statusStr,
          osm_ref: item[8] || "",
          cand_info: item[9] || "",
          wikipedia_ar: item[11] || "",
          instruction: `Review and map ${item[5] || item[6] || qid} in OpenStreetMap with tag wikidata=${qid}`
        }
      };
    });

    const geojson = {
      type: "FeatureCollection",
      features: features
    };

    this._downloadFile(
      `maproulette_${countryName.toLowerCase()}_tasks.geojson`,
      JSON.stringify(geojson, null, 2),
      "application/geo+json"
    );
  },

  /**
   * Exports filtered items as CSV.
   */
  exportCsv(items, countryCode) {
    const headers = ["QID", "Latitude", "Longitude", "Category_ID", "Status_Code", "Name_AR", "Name_EN", "P31", "OSM_Ref", "Candidate_Info", "Wikipedia_AR", "Website", "Dissolved"];
    const rows = [headers.join(",")];

    for (let it of items) {
      const row = [
        `Q${it[0]}`,
        it[1],
        it[2],
        it[3],
        it[4],
        `"${(it[5] || '').replace(/"/g, '""')}"`,
        `"${(it[6] || '').replace(/"/g, '""')}"`,
        it[7] || "",
        it[8] || "",
        `"${(it[9] || '').replace(/"/g, '""')}"`,
        `"${(it[11] || '').replace(/"/g, '""')}"`,
        `"${(it[12] || '').replace(/"/g, '""')}"`,
        it[13] || ""
      ];
      rows.push(row.join(","));
    }

    this._downloadFile(
      `osm_wikidata_${countryCode.toLowerCase()}.csv`,
      "\uFEFF" + rows.join("\n"), // UTF-8 BOM for Excel
      "text/csv;charset=utf-8;"
    );
  },

  _downloadFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
};

window.MappingTools = MappingTools;
