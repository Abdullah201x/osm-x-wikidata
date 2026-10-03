# OpenStreetMap (OSM) Import Guidelines & Compliance Guide
### For the OSM × Wikidata GCC Linker Project

> **Important Notice**: Any systematic addition of external data (including Wikidata entities) to OpenStreetMap—whether executed through automated scripts, semi-automated 1-click tools (OAuth 2.0 API, JOSM Remote Control), or micro-tasking platforms (MapRoulette)—is classified as an **Import** or **Assisted Conflation** under the [OpenStreetMap Foundation (OSMF) Import Guidelines](https://wiki.openstreetmap.org/wiki/Import/Guidelines) and the [Automated Edits code of conduct](https://wiki.openstreetmap.org/wiki/Automated_Edits_code_of_conduct).

---

## 📋 Table of Contents
1. [Why Community Approval & Protocols Are Mandatory](#1-why-community-approval--protocols-are-mandatory)
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
   - [A. Changeset Tags for Assisted Conflation (Tag Linking)](#a-changeset-tags-for-assisted-conflation-tag-linking)
   - [B. Changeset Tags for Formal Feature Imports (Adding New Elements)](#b-changeset-tags-for-formal-feature-imports-adding-new-elements)
7. [Safe Tool Workflows for This Project](#7-safe-tool-workflows-for-this-project)
   - [Workflow A: Assisted Conflation via In-App OAuth 2.0 (Single & Batch Modes)](#workflow-a-assisted-conflation-via-in-app-oauth-20-single--batch-modes)
   - [Workflow B: Assisted Conflation via JOSM Remote Control](#workflow-b-assisted-conflation-via-josm-remote-control)
   - [Workflow C: Adding New Features (Requires Import Clearance & Physical Verification)](#workflow-c-adding-new-features-requires-import-clearance--physical-verification)
   - [Workflow D: Crowdsourced MapRoulette Challenges](#workflow-d-crowdsourced-maproulette-challenges)
   - [Workflow E: Submitting OSM Notes for Ambiguous Features](#workflow-e-submitting-osm-notes-for-ambiguous-features)
8. [Revert & Contingency Plan](#8-revert--contingency-plan)
9. [Pre-Flight Mapper Checklist](#9-pre-flight-mapper-checklist)
10. [Maintainer Contacts & DWG Compliance Statement](#10-maintainer-contacts--dwg-compliance-statement)

---

## 1. Why Community Approval & Protocols Are Mandatory

In OpenStreetMap, the community strictly values **Ground Truth** and local knowledge above all else. Adding data from third-party databases without following formal community protocols is strictly prohibited, regardless of good intentions.

### What happens if you skip the import process?
* **Account Suspension**: The OSM **Data Working Group (DWG)** will block or ban the editing account.
* **Mass Reversion**: All changesets associated with the unapproved import will be reverted globally.
* **Community Friction**: Loss of standing and trust within the local GCC and international OSM community.
* **Corrupted Map Quality**: Blindly importing Wikidata coordinates often places nodes in the middle of highways, inside water bodies, or on top of existing buildings.

---

## 2. Conflation (Linking) vs. Importing (Adding Nodes)

This workbench performs two fundamentally distinct operations. You must understand the difference:

| Operation | Action in Workbench | OSM Policy Status | Risk Level | Guidelines & Requirements |
| :--- | :--- | :--- | :--- | :--- |
| **Assisted Conflation (Tag Linking)** | Clicking **Link in OSM** (OAuth 2.0 PKCE), using the **Batch Queue**, or clicking **Push Tag to JOSM** (`wikidata=Q...`) on an *existing* OSM element | **Assisted Conflation** | 🟢 Low | Requires manual verification that the OSM element and Wikidata QID refer to the exact same physical feature. Must adhere to the [Automated Edits code of conduct](https://wiki.openstreetmap.org/wiki/Automated_Edits_code_of_conduct). |
| **New Feature Creation (Adding Nodes)** | Clicking **Add Node in JOSM** or using **OSM iD Editor** deep links to add missing Wikidata items | **Formal Import** | 🔴 High | Must follow the full 6-step OSM Import Guidelines. Requires visual confirmation on satellite imagery and a dedicated import account. |
| **Submitting OSM Notes** | Clicking **Add OSM Note** to request on-the-ground survey | **Community Note** | ⚪ None | Safe, non-intrusive way to flag missing or ambiguous entities without modifying map data directly. |
| **MapRoulette Challenge** | Exporting GeoJSON tasks via **Export MapRoulette (GeoJSON)** | **Crowdsourced Task** | 🟡 Low | Best community-approved approach for distributed human review and sprint mapping. |

---

## 3. The 6-Step Official OSM Import Process

To ensure full compliance with OSMF policies when adding new features or systematically integrating external data, complete the following six steps in order:

### Step 1: Licensing & Provenance Verification
* **License Compatibility**: OpenStreetMap is licensed under **ODbL 1.0**. Wikidata claims are released under **CC0 1.0 Universal** (Public Domain), which is legally compatible with ODbL.
* **The "Wikidata Coordinate Trap"**: Even though Wikidata's license is CC0, **many coordinates on Wikidata were originally copied from non-free sources** (such as Google Maps, copyrighted commercial directories, or coarse city-centroid geocoders).
* **Strict Ground Truth Rule**: You must **NEVER** blindly trust Wikidata coordinates. Before creating any node in OpenStreetMap, you **must visually verify the physical building or feature on approved high-resolution aerial imagery** (Esri World Imagery, Bing Aerial, or Mapbox) or via local ground knowledge.
* **Non-Physical Filter**: Ensure non-physical Wikidata items (events, disasters, battles, historical periods, and abstract administrative entities) are excluded. (This workbench includes a built-in physicality filter that automatically removes 6,200+ non-physical items).

### Step 2: Community Consultation & Buy-In
Before making batch edits or starting an import, you must present your proposal to both local and international communities:
1. **OSM Community Forum**: Post in the [Imports Category](https://community.openstreetmap.org/c/imports/), [Middle East / Regional Category](https://community.openstreetmap.org/c/communities/middle-east/), or [General Talk](https://community.openstreetmap.org/c/general/talk/).
2. **Local GCC & Arab Mapping Communities**: Share the plan in active regional groups (e.g., the OSM Arab World Telegram group [@OSMSaudi](https://t.me/OSMSaudi) and GCC mappers).
3. **Imports Mailing List**: Send an announcement email to `imports@openstreetmap.org`.
4. **Mandatory Waiting Period**: Wait at least **14 days** to allow mappers to review the methodology, tag schemas, and raise questions or objections.

### Step 3: OSM Wiki Documentation Page
Create a dedicated public documentation page under:
`https://wiki.openstreetmap.org/wiki/Import/Catalogue/GCC_Wikidata_Conflation`
*(A complete template is provided in [Section 5](#5-wiki-page-template-ready-to-copy)).*

### Step 4: Dedicated Import Account
* **Never use your personal OSM account** for imports or high-volume automated/semi-automated edits.
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
* **Never upload more than 50–100 objects per changeset**. Use the workbench's **Batch Queue** to stage and commit manageable batches.
* Always inspect imagery before creating a node to prevent:
  * Placing nodes on roads or in water bodies.
  * Duplicating an existing building polygon that already represents the same feature.
* Actively monitor your OSM inbox and changeset discussions; reply promptly to any fellow mapper inquiries.

---

## 4. Official Proposal Templates (English & Arabic)

Use these templates when starting the community discussion on the [OSM Community Forum](https://community.openstreetmap.org/) and `imports@openstreetmap.org`.

### English Version (for `imports@openstreetmap.org` and Forum)

```markdown
Subject: [Proposal] Semi-Automated Conflation and Assisted Import of Missing GCC POIs from Wikidata

Dear OpenStreetMap Community,

I would like to propose a semi-automated conflation and assisted mapping project to link and add verified missing Points of Interest (POIs) across GCC countries (Saudi Arabia, UAE, Kuwait, Qatar, Bahrain, Oman) using Wikidata as a reference dataset.

### Project Summary:
* **Scope**: GCC Countries (focusing primarily on Mosques, Heritage Sites, Healthcare, and Public Infrastructure).
* **Source**: Wikidata (CC0), verified against authorized aerial imagery (Esri World Imagery, Bing Aerial) and local ground knowledge.
* **Tools**:
  - OSM × Wikidata GCC Workbench (https://github.com/Abdullah201x/osm-x-wikidata)
  - In-app OSM API 0.6 client with OAuth 2.0 PKCE (single-edit & batch queue staging)
  - JOSM Remote Control (`localhost:8111`)
  - Live Overpass verifier (150m real-time radius check)
  - MapRoulette Challenge Exporter
* **Wiki Documentation**: https://wiki.openstreetmap.org/wiki/Import/Catalogue/GCC_Wikidata_Conflation
* **Import Account**: [Link to your dedicated import account]
* **Personal Account**: [Link to your primary mapper account]

### Methodology:
1. Candidate Matching: Existing OSM objects are identified using spatial proximity (10m–400m) and Arabic NLP string normalization. Matches are manually inspected in the workbench or JOSM before applying the `wikidata=*` tag.
2. Missing Features: For entities with no OSM counterpart, mappers visually verify the physical presence of the structure on satellite imagery before creating an OSM node. Features that are ambiguous, coarse, or cannot be seen on imagery are skipped or flagged as OSM Notes.
3. Batch Size: Individual changesets will be strictly restricted to small, geographically localized areas (maximum 20–50 elements per batch changeset, hard cap at 100).
4. Ground Truth: No blind automated scripts will be run. Every single element requires human review and confirmation.

We welcome your feedback, suggestions, and review of our proposed tagging schema over the next two weeks.

Best regards,
[Your Name / Username]
```

### النسخة العربية (للمنتدى العربي ومجموعات تيليجرام)

```markdown
الموضوع: [مقترح مجتمعي] مشروع مطابقة وإضافة المعالم المفقودة في دول الخليج العربي بالاعتماد على ويكي بيانات (Wikidata)

السلام عليكم ورحمة الله وبركاته،

أود مشاركتكم مقترحاً لمشروع يهدف إلى تحسين جودة وتغطية بيانات خريطة الشارع المفتوحة (OpenStreetMap) في دول مجلس التعاون الخليجي (السعودية، الإمارات، الكويت، قطر، البحرين، وعُمان)، من خلال مطابقة وربط المعالم القائمة مع ويكي بيانات (Wikidata) وإضافة المعالم المؤكدة غير الموجودة حالياً وفق أعلى معايير الجودة والتحقق البصري.

### ملخص المشروع:
* **النطاق**: دول الخليج العربي (التركيز على المساجد، المواقع التراثية والأثرية، المرافق الصحية، المنشآت العامة، والخدمات).
* **مصدر البيانات**: ويكي بيانات (ترخيص CC0 متوافق مع ODbL)، مع التحقق البصري الإلزامي من الصور الجوية المعتمدة (Esri World Imagery / Bing Aerial).
* **الأدوات المستخدمة**:
  - منصة العمل التفاعلية (OSM × Wikidata GCC Workbench): https://github.com/Abdullah201x/osm-x-wikidata
  - الربط المباشر عبر بروتوكول OAuth 2.0 PKCE وواجهة برمجة تطبيقات OSM (فردي ومجموعات مجمعة)
  - أداة التحكم عن بُعد في JOSM ومحرر iD
  - أداة التحقق اللحظي عبر Overpass
  - تصدير تحديات MapRoulette للمجتمع
* **توثيق الويكي**: https://wiki.openstreetmap.org/wiki/Import/Catalogue/GCC_Wikidata_Conflation
* **حساب الاستيراد المخصص**: [ضع رابط الحساب المخصص هنا]
* **الحساب الشخصي الأساسي**: [ضع رابط حسابك الشخصي هنا]

### آلية العمل وضمان الجودة (Ground Truth):
1. **الربط والمطابقة (Conflation)**: نستخدم خوارزمية ذكية لمطابقة الأسماء العربية (معالجة أشكال الهمزات والتاء المربوطة وأل التعريف)، ويتم مراجعة كل عنصر بشرياً في المنصة أو في JOSM قبل ربطه بوسم `wikidata=*`.
2. **إضافة المعالم الجديدة (Missing Features)**: لن يتم رفع أي معلم بشكل آلي أعمى؛ بل يقوم راسم الخريطة بفحص الموقع والتأكد من وجود المبنى الفعلي عبر الصور الجوية، ومن عدم وجود مضلع مبنى غير موسوم مسبقاً، ثم وضع النقطة في مكانها الدقيق. في حال الشك يتم استخدام خاصية إضافة "ملاحظة OSM" بدلاً من التخمين.
3. **حجم مجموعات التعديل (Changesets)**: تعديلات صغيرة ومحصورة جغرافياً بكل حي أو مدينة (بين 20 إلى 50 عنصراً لكل مجموعة وبحد أقصى 100 عنصر) مع تعليقات وصفية واضحة ووسوم تتبع رسمية.

نرحب بآرائكم وملاحظاتكم واقتراحاتكم خلال فترة النقاش (14 يوماً) قبل البدء بأي عينة تجريبية.

شاكرين ومقدرين جهودكم في إثراء الخريطة الحرة.
[اسمك أو اسم حسابك]
```

---

## 5. Wiki Page Template (Ready to Copy)

Copy and paste this markdown directly into the OpenStreetMap Wiki when creating your page under `wiki.openstreetmap.org/wiki/Import/Catalogue/GCC_Wikidata_Conflation`:

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
# Linking existing OSM elements with verified Wikidata QIDs (`wikidata=*` and `wikipedia=*`) using Arabic string normalization and spatial matching.
# Assisting local mappers in identifying, visually verifying, and manually mapping missing public infrastructure (mosques, archaeological and heritage sites, schools, hospitals) through JOSM, iD, and MapRoulette.

== Community Consultation ==
* '''OSM Community Forum Thread''': [Link to discussion thread]
* '''Imports Mailing List Archive''': [Link to mail archive]
* '''Local Mapping Channels''': Discussed with local GCC mappers (Telegram: @OSMSaudi).

== Data Source & Licensing ==
* '''Source''': Wikidata (SPARQL queries filtered by GCC country claims and coordinates).
* '''License''': Creative Commons Zero (CC0 1.0 Universal) - Compatible with ODbL.
* '''Coordinate Verification''': All locations are manually cross-referenced against Esri World Imagery and Bing Aerial imagery before any element is created. No blind coordinate imports are permitted.

== Tagging Schema ==
The import strictly adheres to established OSM tagging conventions:

{| class="wikitable"
! Wikidata P31 !! Concept !! OSM Main Tag !! Additional Default Tags
|-
| Q32815 || Mosque || amenity=place_of_worship || religion=muslim
|-
| Q839954 || Archaeological Site || historic=archaeological_site || -
|-
| Q1081138 / Q358 || Historic / Heritage Site || historic=heritage || -
|-
| Q23413 || Castle / Fort || historic=castle || -
|-
| Q33506 || Museum || tourism=museum || -
|-
| Q16917 || Hospital || amenity=hospital || -
|-
| Q1774898 || Clinic || amenity=clinic || -
|-
| Q13107184 || Pharmacy || amenity=pharmacy || -
|-
| Q3914 || School || amenity=school || -
|-
| Q3918 || University || amenity=university || -
|-
| Q7075 || Library || amenity=library || -
|-
| Q8502 || Mountain / Peak || natural=peak || -
|-
| Q187971 || Wadi || waterway=wadi || -
|-
| Q23442 || Island || place=island || -
|-
| Q43483 || Water Well || man_made=water_well || -
|}

=== Language & Identification Tags ===
* <code>name</code> = Arabic Name (default in GCC)
* <code>name:ar</code> = Arabic Name
* <code>name:en</code> = English Name (if available)
* <code>wikidata</code> = QID (e.g. Q123456)
* <code>wikipedia</code> = ar:Title (if verified Arabic Wikipedia article exists)

== Conflation & Duplicate Prevention ==
* Spatial radius check: 10m–400m evaluated candidate radius with ML confidence scoring.
* Arabic NLP normalization: Stripping diacritics, unifying `أ/إ/آ` to `ا`, `ة` to `ه`, removing `الـ` prefix, and normalizing synonyms (`جامع`/`مسجد`).
* Manual inspection: Mappers must inspect existing building polygons (`building=*`) to prevent adding redundant point nodes inside already mapped buildings.
* Live verification: Real-time 150m Overpass query confirms feature was not recently added before editing.

== Revert Plan ==
In the event of an erroneous upload, changesets can be reverted using the JOSM Reverter Plugin. All changesets are tagged with identifiable comments, source tags, and the <code>#osm-wikidata-gcc</code> hashtag.
```

---

## 6. Mandatory Changeset Tags

Accurate changeset metadata is essential for transparency and peer review. Depending on the type of edit you are performing, apply the appropriate tags:

### A. Changeset Tags for Assisted Conflation (Tag Linking)
When linking existing OSM features to Wikidata via the web workbench (OAuth 2.0 PKCE) or JOSM Remote Control:

| Key | Value Example | Description |
| :--- | :--- | :--- |
| `comment` | `Link "مسجد قباء" to Wikidata Q123456 on way/123456 in Saudi Arabia #osm-wikidata-gcc` | Descriptive human-readable summary generated by the workbench |
| `source` | `Wikidata; OpenStreetMap` | Documents external reference and existing OSM data |
| `conflation` | `assisted_wikidata` | Identifies assisted tag matching |
| `wikidata` | `Q123456` | The QID or semicolon-separated QIDs involved |
| `created_by` | `OSM x Wikidata GCC Linker (https://abdullah201x.github.io/osm-x-wikidata)` | Tool identifier with link to repository |
| `hashtags` | `#osm-wikidata-gcc` | Community tracking hashtag |

*(Note: The workbench's OAuth 2.0 Single Link and Batch Queue automatically apply these tags).*

### B. Changeset Tags for Formal Feature Imports (Adding New Elements)
When uploading new nodes or features created from Wikidata (via JOSM or bulk scripts):

| Key | Value Example | Description |
| :--- | :--- | :--- |
| `comment` | `Adding verified missing mosques in Muharraq from Wikidata with Esri imagery check #osm-wikidata-gcc` | Clear, localized summary of what was added and how it was checked |
| `source` | `Wikidata; Esri World Imagery` (or `Bing Aerial`) | Explicitly names Wikidata and the imagery source used for position verification |
| `import` | `yes` | Mandatory tag identifying the changeset as an import |
| `type` | `import` | Standard machine tag for import tracking |
| `url` | `https://wiki.openstreetmap.org/wiki/Import/Catalogue/GCC_Wikidata_Conflation` | Direct link to your published OSM Wiki documentation page |
| `created_by` | `OSM x Wikidata GCC Linker` or `JOSM/1.5...` | Editor used |
| `hashtags` | `#osm-wikidata-gcc` | Project tracking hashtag |

---

## 7. Safe Tool Workflows for This Project

To comply with OSM guidelines while using the tools in this repository:

### Workflow A: Assisted Conflation via In-App OAuth 2.0 (Single & Batch Modes)
*Recommended for linking existing OSM elements to Wikidata with zero software installation.*

1. **Log in with OpenStreetMap**: Click **Connect with OpenStreetMap** (authenticated via OAuth 2.0 PKCE).
2. **Filter & Inspect**:
   - Filter by country and category in the sidebar.
   - Select a candidate (yellow marker).
   - Review candidate details: Arabic name similarity, distance, and tag comparison.
3. **Verify Match**:
   - Verify that the candidate OSM element is indeed the exact same place described by Wikidata.
   - If in doubt, click **Open in OSM** to view the feature's history and mapper comments.
4. **Choose Mode**:
   - **Single Item Mode**: Click **Link in OSM (API 0.6)**. Review the pre-flight comment modal, add any notes or preset chips, and confirm upload.
   - **Batch Queue Mode (Recommended for Multiple Edits)**: Click **Add to Batch**. Repeat for several candidate features in the same district or city (recommended batch size: 10–50 items). Click the floating **Changeset Batch** counter, review all staged items, customize the unified changeset comment, and click **🚀 Upload & Commit Changeset**. All edits are committed into **one clean OSM changeset**.
5. **Inspect Result**: Click **View Changeset in OSM** or check your personal activity in the **History & Activity Log** page.

### Workflow B: Assisted Conflation via JOSM Remote Control
*Recommended for power mappers who prefer advanced inspection.*

1. Start **JOSM** and ensure Remote Control is enabled on port `8111` (`Preferences -> Remote Control`).
2. In the workbench, select an item marked **Candidate Match** (Yellow marker).
3. Click **Load & Zoom in JOSM**.
4. In JOSM, activate satellite imagery (Esri World Imagery or Bing Aerial) to confirm the feature.
5. In the workbench, click **Push Tag to JOSM** to send `wikidata=Q...` to the currently selected OSM element.
6. In JOSM, review the tag diff and upload the changeset using a descriptive comment and `#osm-wikidata-gcc`.

### Workflow C: Adding New Features (Requires Import Clearance & Physical Verification)
*Strictly for adding missing features (Red markers). Requires community clearance under OSM Import Guidelines.*

1. Select an item marked **Missing in OSM** (Red marker).
2. **Step 1: Check Live OSM**: Click **Live Verify in OSM**. This queries live OSM servers within a 150m radius to confirm another mapper has not already added it since the local PBF was processed.
3. **Step 2: Inspect High-Resolution Imagery**:
   - Switch the basemap to **Satellite (Esri World Imagery)**.
   - *Is there a visible, physical structure at that location?*
   - *Is there already an un-tagged building polygon mapped there?* If yes, apply the tags to the existing polygon—**do not create a duplicate point node inside the polygon**.
4. **Step 3: Add the Feature**:
   - Click **Add Node in JOSM** or **Edit in iD Editor**.
   - Carefully adjust the node position so it rests accurately on the roof/centroid of the physical structure (do not leave it floating in a street, roundabout, or empty desert).
5. **Step 4: Upload**:
   - Upload using your **dedicated import account**.
   - Include `import=yes`, `source=Wikidata; [Imagery]`, and link to the project Wiki page in the changeset tags.

### Workflow D: Crowdsourced MapRoulette Challenges
*The preferred community method for large-scale assisted mapping.*

1. In the workbench, filter for a specific category and region (e.g., "Bahrain Archaeological Sites" or "Kuwait Clinics").
2. Click **Export MapRoulette (GeoJSON)**.
3. Visit [MapRoulette.org](https://maproulette.org/) and create a new public challenge.
4. Share the challenge URL with local mappers (e.g., in [@OSMSaudi](https://t.me/OSMSaudi)).
5. Mappers independently inspect each feature with satellite imagery and validate edits one by one.

### Workflow E: Submitting OSM Notes for Ambiguous Features
*When imagery is unclear or local ground knowledge is needed.*

1. If you encounter a Wikidata entity whose exact location is ambiguous, obscured, or lacks clear physical evidence on aerial imagery:
2. **Do not guess or create an unverified node.**
3. Click **Add OSM Note**.
4. A pre-filled note with the Arabic name, English name, and Wikidata QID reference is submitted to OpenStreetMap for local mappers on the ground to investigate and map accurately.

---

## 8. Revert & Contingency Plan

If any changeset is accidentally uploaded with incorrect tags, wrong locations, or duplicate elements:

1. **Do not panic**: OpenStreetMap version control stores complete history for all nodes, ways, and relations.
2. Open **JOSM**.
3. Install the official **reverter** plugin (`Preferences -> Plugins -> search for "reverter"`).
4. Select `Data -> Revert changeset...`.
5. Enter the changeset ID (available directly from the workbench's **History & Activity Log** or your OSM user profile).
6. Download the changeset objects, inspect the revert diff, and upload the revert changeset with comment:
   `Reverting changeset #XXXXXX due to [detailed reason] #osm-wikidata-gcc`.
7. If the issue affects multiple changesets, announce the correction on the OSM Community Forum thread or contact the Data Working Group (DWG).

---

## 9. Pre-Flight Mapper Checklist

Before uploading any changeset, run through the appropriate checklist:

### A. For Assisted Conflation (Tag Linking):
- [ ] Did I verify that the OSM element and Wikidata QID represent the exact same physical feature?
- [ ] Is the spatial distance reasonable (under 100m, or verified landmark)?
- [ ] Does the changeset comment clearly describe what features were linked?
- [ ] Am I using the **Batch Queue** for multiple edits rather than spamming individual changesets?
- [ ] Is the changeset tagged with `#osm-wikidata-gcc` and `conflation=assisted_wikidata`?

### B. For Adding New Features (Imports):
- [ ] Am I logged into my **dedicated import account** (not my personal account)?
- [ ] Have I announced this import on the **OSM Community Forum** and completed the 14-day consultation?
- [ ] Is the **OSM Wiki page** published and linked in both account profiles?
- [ ] Did I run **Live Verify in OSM** to ensure the feature wasn't mapped recently?
- [ ] Did I visually verify the physical building/structure on **high-resolution satellite imagery**?
- [ ] Did I verify that an **un-tagged building polygon does not already exist** at this spot?
- [ ] Is my changeset size **under 50–100 objects** and focused on a single locality?
- [ ] Does my changeset include `import=yes`, `source=Wikidata; [Imagery]`, and the `url` to the Wiki page?

---

## 10. Maintainer Contacts & DWG Compliance Statement

* **Maintainer**: **[Alshowaiey](https://www.openstreetmap.org/user/Alshowaiey)** (OpenStreetMap Profile)
* **Direct OSM Message**: Send inquiries or feedback via **[OpenStreetMap Messages](https://www.openstreetmap.org/message/new/Alshowaiey)**.
* **GitHub Issues**: Report false positive matches, bug reports, or tagging suggestions on **[GitHub Issues](https://github.com/Abdullah201x/osm-x-wikidata/issues)**.
* **GCC Mapping Community**: Join regional discussions on Telegram: **[@OSMSaudi](https://t.me/OSMSaudi)**.
* **DWG & OSMF Notice**: This application operates strictly as an **assisted manual conflation workbench** requiring individual mapper authentication, visual aerial confirmation, and explicit user consent. We perform **no blind automated bot imports**. If you are a member of the Data Working Group (DWG) or local mapping community and have questions, suggestions, or concerns regarding tagging schemes or workflows, please reach out directly and we will gladly collaborate.
