/**
 * Smart P31 -> OSM Tag Preset Generator.
 * Composes standard OSM tag sets from Wikidata claims and coordinates.
 */

const TagGenerator = {
  // P31 Ontology Mapping to OSM tags (Aligned with NSI standards)
  ontology: {
    "Q32815": { "amenity": "place_of_worship", "religion": "muslim" },
    "Q16970": { "amenity": "place_of_worship", "religion": "christian" },
    "Q637600": { "historic": "archaeological_site" },
    "Q839954": { "historic": "archaeological_site" },
    "Q187971": { "historic": "heritage" },
    "Q23413": { "historic": "castle" },
    "Q33506": { "tourism": "museum" },
    "Q498990": { "historic": "monument" },
    "Q928830": { "historic": "castle", "castle_type": "palace" },
    "Q184358": { "historic": "fort" },
    "Q8502": { "natural": "peak" },
    "Q355304": { "waterway": "wadi" },
    "Q23442": { "place": "island" },
    "Q190429": { "man_made": "water_well" },
    "Q124714": { "natural": "spring" },
    "Q12323": { "waterway": "dam" },
    "Q179700": { "boundary": "protected_area", "protect_class": "1" },
    "Q515": { "place": "city" },
    "Q3957": { "place": "town" },
    "Q532": { "place": "village" },
    "Q25391": { "place": "village" },
    "Q486972": { "place": "village" },
    "Q123705": { "place": "neighbourhood" },
    "Q16917": { "amenity": "hospital" },
    "Q211884": { "amenity": "clinic" },
    "Q131261": { "amenity": "pharmacy" },
    "Q3918": { "amenity": "university" },
    "Q3914": { "amenity": "school" },
    "Q7075": { "amenity": "library" },
    "Q1248784": { "aeroway": "aerodrome" },
    "Q27686": { "tourism": "hotel" },
    "Q11256": { "shop": "mall" },
    "Q205495": { "shop": "supermarket" },
    "Q52615": { "amenity": "fuel" },
    "Q22687": { "amenity": "bank" },
    "Q11707": { "amenity": "restaurant" },
    "Q30022": { "amenity": "cafe" },
    "Q39176": { "amenity": "embassy" },
    "Q180684": { "amenity": "post_office" },
    "Q166118": { "leisure": "stadium" },
    "Q22698": { "leisure": "park" }
  },

  /**
   * Generates a dictionary of OSM tags for a given Wikidata item tuple.
   * item tuple: [0:qid_num, 1:lat, 2:lon, 3:cat, 4:status, 5:name_ar, 6:name_en, 7:p31, 8:osm_ref, 9:cand_info, 10:image, 11:wiki_ar, 12:website, 13:dissolved, 14:social]
   */
  generateTags(item) {
    const qid = `Q${item[0]}`;
    const nameAr = item[5] || "";
    const nameEn = item[6] || "";
    const p31 = item[7] || "";
    const wikiAr = item[11] || "";
    const website = item[12] || "";
    const dissolvedYear = item[13] || "";
    const socialPipe = item[14] || "";

    const tags = {};

    // In GCC, default name is Arabic, with explicit multilingual tags
    if (nameAr) {
      tags["name"] = nameAr;
      tags["name:ar"] = nameAr;
    } else if (nameEn) {
      tags["name"] = nameEn;
    }

    if (nameEn && nameEn !== nameAr) {
      tags["name:en"] = nameEn;
    }

    tags["wikidata"] = qid;

    // Wikipedia tag (ar:Title)
    if (wikiAr) {
      try {
        const url = new URL(wikiAr);
        const article = decodeURIComponent(url.pathname.replace(/^\/wiki\//, ""));
        if (article) {
          tags["wikipedia"] = `ar:${article}`;
        }
      } catch (e) {}
    }

    // NSI Attribute: Official website
    if (website) {
      tags["website"] = website;
    }

    // NSI Attribute: Social & Digital Identities (Twitter, Instagram, Facebook)
    if (socialPipe) {
      const parts = socialPipe.split("|");
      if (parts[0]) tags["contact:twitter"] = parts[0];
      if (parts[1]) tags["contact:instagram"] = parts[1];
      if (parts[2]) tags["contact:facebook"] = parts[2];
    }

    // Apply P31 ontology tags
    if (this.ontology[p31]) {
      Object.assign(tags, this.ontology[p31]);
    } else {
      // Heuristic detection based on Arabic & English names
      const lowerAr = (nameAr || "").toLowerCase();
      const lowerEn = (nameEn || "").toLowerCase();

      // 1. Places of Worship / Mosques (High Priority in GCC)
      if (
        item[3] === 6 ||
        p31 === "Q32815" ||
        lowerAr.includes("مسجد") ||
        lowerAr.includes("جامع") ||
        lowerAr.includes("مصلى") ||
        lowerEn.includes("mosque") ||
        lowerEn.includes("masjid") ||
        lowerEn.includes("jami")
      ) {
        tags["amenity"] = "place_of_worship";
        tags["religion"] = "muslim";
      }
      // 2. Commercial Banks / ATMs
      else if (lowerAr.includes("بنك") || lowerAr.includes("مصرف") || lowerEn.includes("bank")) {
        tags["amenity"] = "bank";
      }
      // 3. Fuel Stations
      else if (lowerAr.includes("محطة وقود") || lowerAr.includes("محطة بنزين") || lowerEn.includes("fuel") || lowerEn.includes("petrol")) {
        tags["amenity"] = "fuel";
      }
      // 4. Supermarkets / Grocery
      else if (lowerAr.includes("سوبرماركت") || lowerAr.includes("هايبرماركت") || lowerAr.includes("تموينات") || lowerEn.includes("supermarket") || lowerEn.includes("hypermarket")) {
        tags["shop"] = "supermarket";
      }
      // 5. Healthcare (Hospitals / Clinics / Pharmacies)
      else if (lowerAr.includes("صيدلية") || lowerEn.includes("pharmacy")) {
        tags["amenity"] = "pharmacy";
      }
      else if (lowerAr.includes("مستوصف") || lowerAr.includes("عيادة") || lowerEn.includes("clinic")) {
        tags["amenity"] = "clinic";
      }
      else if (lowerAr.includes("مستشفى") || lowerAr.includes("مركز صحي") || lowerEn.includes("hospital")) {
        tags["amenity"] = "hospital";
      }
      // 6. Education
      else if (lowerAr.includes("جامعة") || lowerEn.includes("university")) {
        tags["amenity"] = "university";
      }
      else if (lowerAr.includes("مدرسة") || lowerAr.includes("ثانوية") || lowerAr.includes("ابتدائية") || lowerEn.includes("school")) {
        tags["amenity"] = "school";
      }
      // 7. Heritage & Forts
      else if (lowerAr.includes("قلعة") || lowerAr.includes("حصن") || lowerEn.includes("fort") || lowerEn.includes("castle")) {
        tags["historic"] = "castle";
      }
      else if (lowerAr.includes("أثري") || lowerAr.includes("نقوش") || lowerAr.includes("موقع تاريخي") || lowerEn.includes("archaeological") || lowerEn.includes("historic")) {
        tags["historic"] = "archaeological_site";
      }
      // 8. Nature & Geography
      else if (lowerAr.includes("جبل") || lowerEn.includes("jabal") || lowerEn.includes("mount")) {
        tags["natural"] = "peak";
      }
      else if (lowerAr.includes("وادي") || lowerEn.includes("wadi")) {
        tags["waterway"] = "wadi";
      }
      else if (lowerAr.includes("جزيرة") || lowerEn.includes("island")) {
        tags["place"] = "island";
      }
      else if (lowerAr.includes("بئر") || lowerEn.includes("well")) {
        tags["man_made"] = "water_well";
      }
      // 9. Shopping Malls & Commercial
      else if (lowerAr.includes("مول") || lowerAr.includes("سنتر") || lowerEn.includes("mall")) {
        tags["shop"] = "mall";
      }
      // 10. Hotels
      else if (lowerAr.includes("فندق") || lowerEn.includes("hotel")) {
        tags["tourism"] = "hotel";
      }
      // Fallback based on category
      else {
        const cat = item[3];
        if (cat === 1) tags["place"] = "village";
        else if (cat === 2) tags["historic"] = "heritage";
        else if (cat === 3) tags["natural"] = "feature";
        else if (cat === 4) tags["amenity"] = "public_facility";
        else if (cat === 5) tags["tourism"] = "attraction";
        else if (cat === 6) {
          tags["amenity"] = "place_of_worship";
          tags["religion"] = "muslim";
        }
      }
    }

    // NSI Dissolution Handling: If feature is dissolved/demolished, mark end_date
    if (dissolvedYear) {
      tags["end_date"] = dissolvedYear;
      // Convert active amenity to disused or historic to avoid mapping defunct objects as active
      if (tags["amenity"]) {
        tags[`disused:amenity`] = tags["amenity"];
        delete tags["amenity"];
      } else if (tags["shop"]) {
        tags[`disused:shop`] = tags["shop"];
        delete tags["shop"];
      }
      if (!tags["historic"]) {
        tags["historic"] = "ruins";
      }
    }

    return tags;
  },

  /**
   * Formats tags as multiline string for copy-pasting.
   */
  formatAsLines(tags) {
    return Object.entries(tags)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");
  },

  /**
   * Formats tags as JOSM URL parameter string: key1=val1|key2=val2
   */
  formatForJosmUrl(tags) {
    return Object.entries(tags)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("%7C"); // URL-encoded pipe '|'
  },

  /**
   * Generates OSM XML for a new node ready to paste into JOSM.
   */
  formatAsOsmXml(item, tags) {
    const lat = item[1];
    const lon = item[2];
    let xml = `<?xml version='1.0' encoding='UTF-8'?>\n<osm version='0.6' generator='OSMxWikidataLinker'>\n`;
    xml += `  <node id='-1' lat='${lat}' lon='${lon}' version='0'>\n`;
    for (let [k, v] of Object.entries(tags)) {
      // Escape XML characters
      const escapedVal = String(v)
        .replace(/&/g, "&amp;")
        .replace(/'/g, "&apos;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      xml += `    <tag k='${k}' v='${escapedVal}' />\n`;
    }
    xml += `  </node>\n</osm>`;
    return xml;
  }
};

window.TagGenerator = TagGenerator;
