# OpenStreetMap (OSM) Import Guidelines & Compliance Guide
### For the OSM × Wikidata GCC Linker Project

> **Important Notice**: Any systematic addition of external data (including Wikidata entities) to OpenStreetMap—whether executed through an automated script, semi-automated 1-click tools (JOSM Remote Control), or micro-tasking platforms (MapRoulette)—is classified as an **Import** under the [OpenStreetMap Foundation (OSMF) Import Guidelines](https://wiki.openstreetmap.org/wiki/Import/Guidelines) and the [Automated Edits code of conduct](https://wiki.openstreetmap.org/wiki/Automated_Edits_code_of_conduct).

---

## 📋 Table of Contents
1. [Why Your Friend Is Correct](#1-why-your-friend-is-correct)
2. [Conflation (Linking) vs. Importing (Adding Nodes)](#2-conflation-linking-vs-importing-adding-nodes)
3. [The 6-Step Official OSM Import Process](#3-the-6-step-official-osm-import-process)
   - [Step 1: Licensing & Provenance Verification](#step-1-licensing--provenance-verification)
   - [Step 2: Community Consultation & Buy-In](#step-2-community-consultation--buy-in)
   - [Step 3: OSM Wiki Documentation Page](#step-3-osm-wiki-documentation-page)
   - [Step 4: Dedicated Import Account](#step-4-dedicated-import-account)
   - [Step 5: Test Pilot & Community Review](#step-5-test-pilot--community-review)
   - [Step 6: Production Execution & Quality Controls](#step-6-production-execution--quality-controls)
4. [Official Proposal Templates (English & Arabic)](#4-official-proposal-templates-english--arabic)
5. [Wiki Page Template (Ready to Copy)](#5-wiki-page-template-ready-to-copy)
6. [Mandatory Changeset Tags](#6-mandatory-changeset-tags)
7. [Safe Tool Workflows for This Project](#7-safe-tool-workflows-for-this-project)
8. [Revert & Contingency Plan](#8-revert--contingency-plan)
9. [Pre-Flight Mapper Checklist](#9-pre-flight-mapper-checklist)

---

## 1. Why Your Friend Is Correct

In OpenStreetMap, the community values **Ground Truth** and local knowledge above all else. Adding data from third-party databases without following formal community protocols is strictly prohibited, regardless of good intentions.

### What happens if you skip the import process?
* **Account Suspension**: The OSM **Data Working Group (DWG)** will block the editing account.
* **Mass Reversion**: All changesets associated with the unapproved import will be reverted globally.
* **Community Friction**: Loss of standing and trust within the local GCC and international OSM community.

---

## 2. Conflation (Linking) vs. Importing (Adding Nodes)

This workbench performs two fundamentally distinct operations. You must understand the difference:

| Operation | Action in Workbench | OSM Policy Status | Risk Level |
| :--- | :--- | :--- | :--- |
| **Conflation / Tag Linking** | Clicking **Push Tag to JOSM** (`wikidata=Q...`) on an *existing* OSM building or node | **Assisted Conflation** (Low friction, but still requires individual verification to prevent bad links) | 🟢 Low |
| **New Feature Creation** | Clicking **Add Node in JOSM** or bulk adding missing Wikidata items | **Formal Import** (Must follow the 6-step OSM Import Guidelines) | 🔴 High |
| **MapRoulette Challenge** | Exporting GeoJSON tasks for the community to map one-by-one | **Crowdsourced Conflation Task** (Best community-approved approach for semi-automated workflows) | 🟡 Medium |

---

## 3. The 6-Step Official OSM Import Process

To ensure full compliance with OSMF policies, complete the following six steps in order:

### Step 1: Licensing & Provenance Verification
* **License Compatibility**: OpenStreetMap is licensed under **ODbL 1.0**. Wikidata claims are released under **CC0 1.0 Universal** (Public Domain), which is legally compatible with ODbL.
* **The "Wikidata Coordinate Trap"**: Even though Wikidata's license is CC0, **many coordinates on Wikidata were originally copied from non-free sources** (e.g., Google Maps, copyrighted commercial directories, or rough city-centroid geocoders).
* **Strict Ground Truth Rule**: You must **NEVER** blindly trust Wikidata coordinates. Before creating any node in OpenStreetMap, you **must visually verify the physical building or feature on approved high-resolution aerial imagery** (Esri World Imagery, Bing Aerial, or Mapbox) or via local ground knowledge.

### Step 2: Community Consultation & Buy-In
Before making batch edits or starting an import, you must present your proposal to both local and international communities:
1. **OSM Community Forum**: Post in the [Middle East / Regional Category](https://community.openstreetmap.org/c/communities/middle-east/) or [General Talk](https://community.openstreetmap.org/c/general/talk/).
2. **Local GCC & Arab Mapping Communities**: Share the plan in active regional groups (e.g., OSM Arab World Telegram group, GCC mappers).
3. **Imports Mailing List**: Send an announcement email to `imports@openstreetmap.org`.
4. **Mandatory Waiting Period**: Wait at least **14 days** to allow mappers to review the methodology, tag schemas, and raise questions or objections.

### Step 3: OSM Wiki Documentation Page
Create a dedicated public documentation page under:
`https://wiki.openstreetmap.org/wiki/Import/Catalogue/GCC_Wikidata_Conflation`
*(A complete template is provided in [Section 5](#5-wiki-page-template-ready-to-copy)).*

### Step 4: Dedicated Import Account
* **Never use your personal OSM account** for imports or high-volume semi-automated edits.
* Register a new OSM account specifically for this activity (e.g., `YourUsername_gcc_import`).
* **Profile Requirements**:
  * On your import account profile, link to your main personal OSM account and link to the Wiki documentation page.
  * On your personal account profile, add a note acknowledging ownership of the import account.

### Step 5: Test Pilot & Community Review
1. Choose a small, localized pilot area (e.g., a single municipality or governorate in Bahrain, or a specific neighborhood in Riyadh).
2. Process a small batch (no more than **10 to 20 objects**).
3. Use the required changeset tags (see [Section 6](#6-mandatory-changeset-tags)).
4. Share the changeset links on your forum thread and the `imports@` mailing list.
5. Request feedback and make any requested adjustments to tagging or alignment.

### Step 6: Production Execution & Quality Controls
Once the community gives approval:
* Work in **small, geographically bounded chunks** (e.g., one city or district per changeset).
* **Never upload more than 100 objects per changeset**.
* Always inspect imagery in JOSM before creating a node to prevent:
  * Placing nodes on roads or in water bodies.
  * Duplicating an existing building polygon that already represents the same feature.
* Actively monitor your OSM inbox and changeset discussions; reply promptly to any fellow mapper inquiries.

---

## 4. Official Proposal Templates (English & Arabic)

Use these templates when starting the community discussion on the [OSM Community Forum](https://community.openstreetmap.org/) and `imports@openstreetmap.org`.

### English Version (for `imports@openstreetmap.org` and Forum)

```markdown
Subject: [Proposal] Semi-Automated Conflation and Import of Missing GCC POIs from Wikidata

Dear OpenStreetMap Community,

I would like to propose a semi-automated conflation and assisted import project to link and add verified missing Points of Interest (POIs) across GCC countries (Saudi Arabia, UAE, Kuwait, Qatar, Bahrain, Oman) using Wikidata as a reference dataset.

### Project Summary:
* **Scope**: GCC Countries (focusing primarily on Mosques, Heritage Sites, Healthcare, and Public Infrastructure).
* **Source**: Wikidata (CC0), verified against authorized aerial imagery (Esri World Imagery, Bing Aerial).
* **Tools**: Custom web workbench, JOSM Remote Control, and MapRoulette.
* **Wiki Documentation**: https://wiki.openstreetmap.org/wiki/Import/Catalogue/GCC_Wikidata_Conflation
* **Import Account**: [Link to your dedicated import account]
* **Personal Account**: [Link to your primary mapper account]

### Methodology:
1. Candidate Matching: Existing OSM objects are identified using spatial proximity and Arabic NLP string normalization. Matches are manually reviewed in JOSM before pushing the `wikidata=*` tag.
2. Missing Features: For entities with no OSM counterpart, mappers visually verify the physical presence of the structure on satellite imagery before creating an OSM node. Approximate or unverified coordinates are skipped.
3. Batch Size: Individual changesets will be strictly restricted to small, geographically localized areas (maximum 50–100 elements per changeset).

We welcome your feedback, suggestions, and review of our proposed tagging schema over the next two weeks.

Best regards,
[Your Name / Username]
```

### النسخة العربية (للمنتدى العربي ومجموعات تيليجرام)

```markdown
الموضوع: [مقترح مجتمعي] مشروع مطابقة وإضافة المعالم المفقودة في دول الخليج العربي بالاعتماد على ويكي بيانات (Wikidata)

السلام عليكم ورحمة الله وبركاته،

أود مشاركتكم مقترحاً لمشروع يهدف إلى تحسين جودة وتغطية بيانات خريطة الشارع المفتوحة (OpenStreetMap) في دول مجلس التعاون الخليجي (السعودية، الإمارات، الكويت، قطر، البحرين، وعُمان)، من خلال مطابقة وربط المعالم مع ويكي بيانات (Wikidata) وإضافة المعالم المؤكدة غير الموجودة حالياً.

### ملخص المشروع:
* **النطاق**: دول الخليج العربي (التركيز على المساجد، المواقع التراثية والأثرية، المرافق الصحية، والمنشآت العامة).
* **مصدر البيانات**: ويكي بيانات (ترخيص CC0 متوافق)، مع التحقق البصري الإلزامي من الصور الجوية المعتمدة (Esri / Bing).
* **الأدوات**: منصة فحص متخصصة، أداة التحكم عن بُعد في JOSM، وتحديات MapRoulette للمجتمع.
* **توثيق الويكي**: https://wiki.openstreetmap.org/wiki/Import/Catalogue/GCC_Wikidata_Conflation
* **حساب الاستيراد المخصص**: [ضع رابط الحساب المخصص هنا]

### آلية العمل وضمان الجودة:
1. **الربط والمطابقة**: نستخدم خوارزمية لمطابقة الأسماء العربية (معالجة أشكال الهمزات والتاء المربوطة وأل التعريف)، ويتم مراجعة كل عنصر يدوياً في JOSM قبل ربطه بوسم `wikidata=*`.
2. **إضافة المعالم الجديدة**: لن يتم رفع أي معلم بشكل آلي أعمى؛ بل يقوم راسم الخريطة بفتح الموقع في محرر JOSM والتحقق من وجود المبنى الفعلي عبر الصور الجوية، ثم إضافة النقطة في مكانها الصحيح والدقيق.
3. **حجم مجموعات التعديل (Changesets)**: تعديلات صغيرة ومحصورة جغرافياً بكل حي أو مدينة (بحد أقصى 50 إلى 100 عنصر لكل مجموعة).

نرحب بآرائكم، ملاحظاتكم، واقتراحاتكم خلال فترة النقاش (14 يوماً) قبل البدء بأي عينة تجريبية.

شاكرين ومقدرين جهودكم في إثراء الخريطة الحرة.
[اسمك أو اسم حسابك]
```

---

## 5. Wiki Page Template (Ready to Copy)

Copy and paste this markdown directly into the OpenStreetMap Wiki when creating your page under `wiki.openstreetmap.org`:

```mediawiki
{{Import
|name = GCC Wikidata Conflation & Assisted Mapping
|status = Proposed
|country = Saudi Arabia, United Arab Emirates, Kuwait, Qatar, Bahrain, Oman
|type = conflation
|source = Wikidata
|url = https://github.com/Abdullah201x/osm-x-wikidata
|account = [Dedicated Import Username]
}}

== Goals ==
The objective of this project is to improve OpenStreetMap coverage across the six GCC countries by:
# Linking existing OSM elements with verified Wikidata QIDs (`wikidata=*`) using Arabic string normalization and spatial matching.
# Assisting local mappers in identifying and manually mapping missing public infrastructure (mosques, archaeological and heritage sites, schools, hospitals) through JOSM and MapRoulette.

== Community Consultation ==
* '''OSM Community Forum Thread''': [Link to discussion thread]
* '''Imports Mailing List Archive''': [Link to mail archive]
* '''Local Mapping Channels''': Discussed with local GCC mappers.

== Data Source & Licensing ==
* '''Source''': Wikidata (SPARQL queries filtered by GCC country claims and coordinates).
* '''License''': Creative Commons Zero (CC0 1.0 Universal) - Compatible with ODbL.
* '''Coordinate Verification''': All locations are manually cross-referenced against Esri World Imagery and Bing Aerial imagery before any element is created. No blind coordinate imports are permitted.

== Tagging Schema ==
The import strictly adheres to established OSM tagging conventions:

{| class="wikitable"
! Wikidata P31 !! OSM Main Tag !! Additional Default Tags
|-
| Q32815 (Mosque) || amenity=place_of_worship || religion=muslim
|-
| Q637600 (Archaeological site) || historic=archaeological_site || -
|-
| Q187971 (Heritage site) || historic=heritage || -
|-
| Q23413 (Castle) || historic=castle || -
|-
| Q33506 (Museum) || tourism=museum || -
|-
| Q16917 (Hospital) || amenity=hospital || -
|-
| Q3914 (School) || amenity=school || -
|}

=== Language Tags ===
* <code>name</code> = Arabic Name (default in GCC)
* <code>name:ar</code> = Arabic Name
* <code>name:en</code> = English Name (if available)
* <code>wikidata</code> = QID (e.g. Q123456)
* <code>wikipedia</code> = ar:Title (if verified Arabic Wikipedia article exists)

== Conflation & Duplicate Prevention ==
* Spatial radius check: 150-meter buffer around each candidate.
* Arabic NLP normalization: Stripping diacritics, unifying `أ/إ/آ` to `ا`, `ة` to `ه`, removing `الـ` prefix, and normalizing synonyms (`جامع`/`مسجد`).
* Manual JOSM inspection: Mappers must inspect existing building polygons (`building=*`) to prevent adding redundant point nodes inside already mapped buildings.

== Revert Plan ==
In the event of an erroneous upload, changesets can be reverted using the JOSM Reverter Plugin. All changesets will be tagged with <code>import=yes</code> and link directly to this documentation page.
```

---

## 6. Mandatory Changeset Tags

Whenever you upload edits derived from this workflow, your changeset must include the following tags:

| Key | Value Example | Description |
| :--- | :--- | :--- |
| `comment` | `Adding verified missing mosques in Muharraq from Wikidata with Esri imagery check` | Clear, human-readable summary of what was changed and where |
| `source` | `Wikidata; Esri World Imagery` | Explicitly lists both Wikidata and the imagery source used for position verification |
| `import` | `yes` | Identifies the changeset as an import or assisted data integration |
| `type` | `import` | Standard machine tag for import tracking |
| `url` | `https://wiki.openstreetmap.org/wiki/Import/Catalogue/GCC_Wikidata_Conflation` | Direct link to your approved OSM Wiki documentation page |

---

## 7. Safe Tool Workflows for This Project

To comply with OSM guidelines while using the tools in this repository:

### Workflow A: Linking Candidates (Safe & Recommended)
1. Filter by country and category in the web workbench.
2. Select an item marked **Candidate Match** (Yellow marker).
3. Click **Load & Zoom in JOSM** (or review candidate tags).
4. In JOSM, verify that the existing OSM feature matches the Wikidata entity.
5. Click **Push Tag to JOSM** to add `wikidata=Q...` to the selected OSM feature.
6. Upload your changeset using standard mapping comments.

### Workflow B: Adding New Nodes (Requires Import Clearance)
1. Select an item marked **Missing in OSM** (Red marker).
2. Click **Load & Zoom in JOSM**.
3. **Inspect Satellite Imagery**: Toggle Esri World Imagery or Bing Aerial.
   * *Is there a visible physical building/structure at that spot?*
   * *Is there already an un-tagged building polygon mapped there?* If yes, apply the tags to the existing polygon—**do not create a duplicate node inside the polygon**.
4. If the structure is confirmed and not yet mapped, click **Add Node in JOSM**.
5. Adjust the node position so it sits accurately on top of the physical structure (do not leave it floating in a street or parking lot).
6. Upload using the dedicated import account and mandatory changeset tags.

### Workflow C: MapRoulette Challenges (Community Preferred)
1. Filter a specific country and category (e.g., "Bahrain Archaeological Sites").
2. Click **Export MapRoulette (GeoJSON)**.
3. Create a public challenge on [MapRoulette.org](https://maproulette.org/).
4. Post the challenge link in community channels so multiple mappers can inspect and map entities individually.

---

## 8. Revert & Contingency Plan

If any changeset is uploaded with incorrect tags, incorrect locations, or duplicates:
1. **Do not panic**: OSM version control records every edit.
2. Open **JOSM**.
3. Install the **reverter** plugin (`Preferences -> Plugins -> reverter`).
4. Select `Data -> Revert changeset`.
5. Enter the erroneous changeset number.
6. Download, inspect the revert diff, and upload the revert changeset with comment: `Reverting changeset #XXXXXX due to [reason]`.
7. Post an update on the community forum thread notifying mappers of the correction.

---

## 9. Pre-Flight Mapper Checklist

Before clicking upload on any changeset, run through this checklist:

- [ ] Am I logged into my **dedicated import account** (not my personal account)?
- [ ] Have I announced this import on the **OSM Community Forum** and waited for feedback?
- [ ] Is the **OSM Wiki page** published and linked in my profile?
- [ ] Did I visually verify every single node against **high-resolution satellite imagery**?
- [ ] Did I check that I am **not creating a duplicate node** inside an existing building polygon?
- [ ] Is my changeset size **under 100 objects** and focused on a single city or locality?
- [ ] Does my changeset include `import=yes`, `source=Wikidata; [Imagery]`, and the `url` to the Wiki page?
