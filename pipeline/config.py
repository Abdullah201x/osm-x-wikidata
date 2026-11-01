"""
Configuration for OSM x Wikidata GCC Linker.
Defines GCC country metadata, category taxonomies, Wikidata P31 to OSM tag mappings,
and path discovery helpers.
"""

import os
import glob

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
PIPELINE_DIR = os.path.join(BASE_DIR, "pipeline")

# Ensure data directory exists
os.makedirs(DATA_DIR, exist_ok=True)

def find_pbf(base_dir=None):
    """
    Locates the active .osm.pbf file in 'update osm' or local directories.
    """
    if base_dir is None:
        base_dir = BASE_DIR
    search_dirs = [
        os.path.abspath(os.path.join(base_dir, "..", "update osm")),
        os.path.expanduser(os.path.join("~", "Desktop", "update osm")),
        base_dir,
    ]
    for d in search_dirs:
        if os.path.exists(d):
            matches = glob.glob(os.path.join(d, "*.osm.pbf")) + glob.glob(os.path.join(d, "*.pbf"))
            seen = set()
            unique = [m for m in matches if not (m in seen or seen.add(m))]
            if unique:
                unique.sort(key=os.path.getmtime, reverse=True)
                return unique[0]
    return None

# GCC Country Definitions
# Wikidata Country QID -> Metadata
GCC_COUNTRIES = {
    "SA": {
        "id": "sa",
        "name_en": "Saudi Arabia",
        "name_ar": "المملكة العربية السعودية",
        "qid": "Q851",
        "relation_id": 307584,
        "bbox": [16.3, 34.5, 32.2, 55.7],  # [min_lat, min_lon, max_lat, max_lon]
        "center": [24.0, 45.0],
        "default_zoom": 6,
    },
    "AE": {
        "id": "ae",
        "name_en": "United Arab Emirates",
        "name_ar": "الإمارات العربية المتحدة",
        "qid": "Q878",
        "relation_id": 307763,
        "bbox": [22.6, 51.5, 26.1, 56.4],
        "center": [24.2, 54.5],
        "default_zoom": 7,
    },
    "KW": {
        "id": "kw",
        "name_en": "Kuwait",
        "name_ar": "الكويت",
        "qid": "Q817",
        "relation_id": 305099,
        "bbox": [28.5, 46.5, 30.1, 48.5],
        "center": [29.3, 47.5],
        "default_zoom": 9,
    },
    "QA": {
        "id": "qa",
        "name_en": "Qatar",
        "name_ar": "قطر",
        "qid": "Q846",
        "relation_id": 305095,
        "bbox": [24.5, 50.7, 26.2, 51.7],
        "center": [25.3, 51.2],
        "default_zoom": 9,
    },
    "BH": {
        "id": "bh",
        "name_en": "Bahrain",
        "name_ar": "البحرين",
        "qid": "Q398",
        "relation_id": 378734,
        "bbox": [25.7, 50.3, 26.4, 50.7],
        "center": [26.05, 50.55],
        "default_zoom": 10,
    },
    "OM": {
        "id": "om",
        "name_en": "Oman",
        "name_ar": "سلطنة عمان",
        "qid": "Q842",
        "relation_id": 305138,
        "bbox": [16.6, 52.0, 26.4, 59.9],
        "center": [21.5, 56.5],
        "default_zoom": 6,
    },
}

# Lookup maps
QID_TO_COUNTRY_CODE = {v["qid"]: k for k, v in GCC_COUNTRIES.items()}
COUNTRY_CODE_TO_QID = {k: v["qid"] for k, v in GCC_COUNTRIES.items()}

# Categories:
# 1: places (human settlements, cities, towns, villages, suburbs)
# 2: heritage (archaeology, forts, castles, monuments, museums, historic)
# 3: nature (mountains, peaks, wadis/valleys, islands, wells, springs, reserves)
# 4: amenity (hospitals, universities, schools, libraries, public facilities)
# 5: tourism (hotels, shopping malls, parks, viewpoints, attractions)
# 6: worship (mosques, places of worship - segregated due to 72k+ items in KSA)
CATEGORIES = {
    1: {"id": "places", "name_en": "Places & Settlements", "name_ar": "المدن والتجمعات السكنية", "icon": "🏙️"},
    2: {"id": "heritage", "name_en": "Heritage & History", "name_ar": "التراث والتاريخ والآثار", "icon": "🏛️"},
    3: {"id": "nature", "name_en": "Geography & Nature", "name_ar": "الجغرافيا والمعالم الطبيعية", "icon": "⛰️"},
    4: {"id": "amenity", "name_en": "Healthcare & Education", "name_ar": "التعليم والصحة والخدمات", "icon": "🏥"},
    5: {"id": "tourism", "name_en": "Tourism & Commercial", "name_ar": "السياحة والمراكز التجارية", "icon": "🏨"},
    6: {"id": "worship", "name_en": "Places of Worship", "name_ar": "المساجد ودور العبادة", "icon": "🕌"},
}

# Wikidata P31 (Instance Of) -> Category ID + Suggested OSM Tags
# Maps common GCC Wikidata classes to standard OSM tagging schemes
P31_ONTOLOGY = {
    # Worship
    "Q32815": {
        "cat": 6,
        "name_en": "Mosque",
        "name_ar": "مسجد / جامع",
        "tags": {"amenity": "place_of_worship", "religion": "muslim"}
    },
    "Q16970": {
        "cat": 6,
        "name_en": "Church",
        "name_ar": "كنيسة",
        "tags": {"amenity": "place_of_worship", "religion": "christian"}
    },
    
    # Heritage
    "Q839954": {
        "cat": 2,
        "name_en": "Archaeological Site",
        "name_ar": "موقع أثري",
        "tags": {"historic": "archaeological_site"}
    },
    "Q1081138": {
        "cat": 2,
        "name_en": "Historic Site / Heritage",
        "name_ar": "موقع تاريخي / تراثي",
        "tags": {"historic": "heritage"}
    },
    "Q358": {
        "cat": 2,
        "name_en": "Heritage Site",
        "name_ar": "موقع تراثي",
        "tags": {"historic": "heritage"}
    },
    "Q23413": {
        "cat": 2,
        "name_en": "Castle / Fort",
        "name_ar": "قلعة / حصن",
        "tags": {"historic": "castle"}
    },
    "Q33506": {
        "cat": 2,
        "name_en": "Museum",
        "name_ar": "متحف",
        "tags": {"tourism": "museum"}
    },
    "Q4989906": {
        "cat": 2,
        "name_en": "Monument",
        "name_ar": "نصب تذكاري",
        "tags": {"historic": "monument"}
    },
    "Q16560": {
        "cat": 2,
        "name_en": "Palace",
        "name_ar": "قصر",
        "tags": {"historic": "castle", "castle_type": "palace"}
    },
    "Q57821": {
        "cat": 2,
        "name_en": "Fortification",
        "name_ar": "حصن",
        "tags": {"historic": "fort"}
    },
    "Q1785071": {
        "cat": 2,
        "name_en": "Fort",
        "name_ar": "حصن",
        "tags": {"historic": "fort"}
    },
    "Q179700": {
        "cat": 2,
        "name_en": "Statue",
        "name_ar": "تمثال",
        "tags": {"historic": "memorial", "memorial": "statue"}
    },

    # Nature & Geography
    "Q8502": {
        "cat": 3,
        "name_en": "Mountain / Peak",
        "name_ar": "جبل / قمة",
        "tags": {"natural": "peak"}
    },
    "Q187971": {
        "cat": 3,
        "name_en": "Wadi",
        "name_ar": "وادي",
        "tags": {"waterway": "wadi"}
    },
    "Q355304": {
        "cat": 3,
        "name_en": "Watercourse",
        "name_ar": "مجرى مائي",
        "tags": {"waterway": "wadi"}
    },
    "Q637600": {
        "cat": 3,
        "name_en": "Sabkha",
        "name_ar": "سبخة",
        "tags": {"natural": "wetland", "wetland": "saltmarsh"}
    },
    "Q25391": {
        "cat": 3,
        "name_en": "Dune",
        "name_ar": "كثيب رملي",
        "tags": {"natural": "dune"}
    },
    "Q184358": {
        "cat": 3,
        "name_en": "Reef",
        "name_ar": "شعاب",
        "tags": {"natural": "reef"}
    },
    "Q23442": {
        "cat": 3,
        "name_en": "Island",
        "name_ar": "جزيرة",
        "tags": {"place": "island"}
    },
    "Q43483": {
        "cat": 3,
        "name_en": "Water Well",
        "name_ar": "بئر ماء",
        "tags": {"man_made": "water_well"}
    },
    "Q124714": {
        "cat": 3,
        "name_en": "Spring / Oasis",
        "name_ar": "عين / واحة",
        "tags": {"natural": "spring"}
    },
    "Q12323": {
        "cat": 3,
        "name_en": "Dam",
        "name_ar": "سد",
        "tags": {"waterway": "dam"}
    },
    "Q179049": {
        "cat": 3,
        "name_en": "Nature Reserve",
        "name_ar": "محمية طبيعية",
        "tags": {"boundary": "protected_area", "protect_class": "1"}
    },

    # Places & Settlements
    "Q515": {
        "cat": 1,
        "name_en": "City",
        "name_ar": "مدينة",
        "tags": {"place": "city"}
    },
    "Q3957": {
        "cat": 1,
        "name_en": "Town",
        "name_ar": "بلدة",
        "tags": {"place": "town"}
    },
    "Q532": {
        "cat": 1,
        "name_en": "Village",
        "name_ar": "قرية",
        "tags": {"place": "village"}
    },
    "Q486972": {
        "cat": 1,
        "name_en": "Human Settlement",
        "name_ar": "مستوطنة / تجمع سكني",
        "tags": {"place": "village"}
    },
    "Q123705": {
        "cat": 1,
        "name_en": "Neighborhood / Suburb",
        "name_ar": "حي سكني / ضاحية",
        "tags": {"place": "neighbourhood"}
    },

    # Healthcare & Education & Public Services
    "Q16917": {
        "cat": 4,
        "name_en": "Hospital",
        "name_ar": "مستشفى",
        "tags": {"amenity": "hospital"}
    },
    "Q3918": {
        "cat": 4,
        "name_en": "University",
        "name_ar": "جامعة",
        "tags": {"amenity": "university"}
    },
    "Q3914": {
        "cat": 4,
        "name_en": "School",
        "name_ar": "مدرسة",
        "tags": {"amenity": "school"}
    },
    "Q7075": {
        "cat": 4,
        "name_en": "Library",
        "name_ar": "مكتبة",
        "tags": {"amenity": "library"}
    },
    "Q1248784": {
        "cat": 4,
        "name_en": "Airport",
        "name_ar": "مطار",
        "tags": {"aeroway": "aerodrome"}
    },

    # Commercial & Services & Brands (NSI aligned)
    "Q27686": {
        "cat": 5,
        "name_en": "Hotel",
        "name_ar": "فندق",
        "tags": {"tourism": "hotel"}
    },
    "Q11315": {
        "cat": 5,
        "name_en": "Shopping Mall",
        "name_ar": "مركز تسوق / مول",
        "tags": {"shop": "mall"}
    },
    "Q180846": {
        "cat": 5,
        "name_en": "Supermarket",
        "name_ar": "سوبرماركت / هايبرماركت",
        "tags": {"shop": "supermarket"}
    },
    "Q205495": {
        "cat": 5,
        "name_en": "Fuel Station",
        "name_ar": "محطة وقود",
        "tags": {"amenity": "fuel"}
    },
    "Q22687": {
        "cat": 5,
        "name_en": "Bank",
        "name_ar": "مصرف / بنك",
        "tags": {"amenity": "bank"}
    },
    "Q13107184": {
        "cat": 4,
        "name_en": "Pharmacy",
        "name_ar": "صيدلية",
        "tags": {"amenity": "pharmacy"}
    },
    "Q1774898": {
        "cat": 4,
        "name_en": "Clinic",
        "name_ar": "مستوصف / عيادة",
        "tags": {"amenity": "clinic"}
    },
    "Q11707": {
        "cat": 5,
        "name_en": "Restaurant",
        "name_ar": "مطعم",
        "tags": {"amenity": "restaurant"}
    },
    "Q30022": {
        "cat": 5,
        "name_en": "Cafe",
        "name_ar": "مقهى / كافيه",
        "tags": {"amenity": "cafe"}
    },
    "Q3917681": {
        "cat": 4,
        "name_en": "Embassy",
        "name_ar": "سفارة",
        "tags": {"amenity": "embassy"}
    },
    "Q35054": {
        "cat": 4,
        "name_en": "Post Office",
        "name_ar": "مكتب بريد",
        "tags": {"amenity": "post_office"}
    },
    "Q483110": {
        "cat": 5,
        "name_en": "Stadium",
        "name_ar": "استاد / ملعب رياضي",
        "tags": {"leisure": "stadium"}
    },
    "Q22698": {
        "cat": 5,
        "name_en": "Park",
        "name_ar": "حديقة / منتزه",
        "tags": {"leisure": "park"}
    },
}

def classify_p31(p31_qid: str) -> int:
    """
    Maps a Wikidata P31 QID to one of the 6 category IDs.
    Defaults to 5 (Tourism/Commercial) or 2 (Heritage) if unknown.
    """
    if p31_qid in P31_ONTOLOGY:
        return P31_ONTOLOGY[p31_qid]["cat"]
    return 5
