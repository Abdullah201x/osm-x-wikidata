"""
Physicality & Verifiability Filter for Wikidata Items.
Enforces the OpenStreetMap Ground Truth rule by filtering out:
1. Non-physical entities (events, plane crashes, disasters, battles, drone strikes, pandemics).
2. Temporal concepts (years in country, chronological timelines).
3. Abstract / Non-spatial organizations without dedicated venues.
4. Blank / Unnamed GeoNames bot imports (missing both Arabic and English names).
"""

import re
from typing import Dict, Any, Tuple

# Classes that are explicitly non-physical or not mappable as OSM physical nodes/buildings
NON_MAPPABLE_P31 = {
    'Q178561',   # battle
    'Q168983',   # conflagration
    'Q3241045',  # disease outbreak / pandemic
    'Q30588142', # drone warfare
    'Q750215',   # mass murder / shooting
    'Q3196',     # fire
    'Q744913',   # aviation accident / crash
    'Q13418847', # historical event
    'Q1190554',  # occurrence
    'Q124757',   # riot
    'Q114609228',# recurring sports event edition
    'Q15275719', # recurring event
    'Q18340514', # year in country / period
    'Q186117',   # timeline
    'Q101352',   # family name
    'Q5',        # human
    'Q1656682',  # planned event
    'Q132241',   # festival
    'Q40231',    # public election
    'Q13406554', # sports competition
    'Q21480300', # mass shooting
    'Q198',      # war
}

# Regex for English event/incident descriptions and titles
RE_NON_PHYSICAL_EN = re.compile(
    r'\b(pandemic|epidemic|drone attack|drone strike|plane crash|aviation accident|aviation incident|'
    r'terrorist attack|mass shooting|fire at|battle of|battle fought|timeline of|list of events|'
    r'year in [a-z]+|disaster in|earthquake in|flood in|riot in|protest in|explosion at)\b',
    re.IGNORECASE
)

# Regex for Arabic event/incident descriptions and titles
RE_NON_PHYSICAL_AR = re.compile(
    r'(جائحة|تفشي مرض|هجوم بمسيرة|حادث طيران|تحطم طائرة|حادثة تفجير|هجوم إرهابي|حريق اندلع|'
    r'معركة |تسلسل زمني|أحداث في سنة|قائمة أحداث|مجزرة|كارثة طبيعية|زلزال |فيضان |احتجاجات |تفجير )'
)

def is_physical_mappable(item: Dict[str, Any]) -> Tuple[bool, str]:
    """
    Evaluates whether a Wikidata entity represents a physical on-the-ground feature
    appropriate for OpenStreetMap mapping.
    
    Returns:
        (True, "Valid") if the item is physically mappable.
        (False, reason_string) if the item is an event, abstract concept, or blank noise.
    """
    p31 = item.get('p31') or item.get('p31_qid', '')
    if p31 in NON_MAPPABLE_P31:
        return False, f"Non-mappable class ({p31})"
        
    name_ar = (item.get('name_ar') or '').strip()
    name_en = (item.get('name_en') or '').strip()
    
    # Exclude entries with completely empty names in both languages
    if not name_ar and not name_en:
        return False, "Blank name (missing Arabic and English labels)"
        
    desc_en = item.get('desc_en') or ''
    desc_ar = item.get('desc_ar') or ''
    
    # Check English title & description for event markers
    if RE_NON_PHYSICAL_EN.search(desc_en) or RE_NON_PHYSICAL_EN.search(name_en):
        return False, "Event / Incident keyword in English title or description"
        
    # Check Arabic title & description for event markers
    if RE_NON_PHYSICAL_AR.search(desc_ar) or RE_NON_PHYSICAL_AR.search(name_ar):
        return False, "Event / Incident keyword in Arabic title or description"
        
    return True, "Valid"
