# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **OpenStreetMap contributors & regional mappers**: Community mappers in the Gulf Cooperation Council (GCC) region (Saudi Arabia, UAE, Kuwait, Qatar, Oman, Bahrain) who audit geographical tags, reconcile missing POIs, and cross-reference Wikidata identifiers.
- **Wikidata editors & knowledge graph engineers**: Contributors seeking to enhance geospatial claims (`P625` coordinates, `P31` instance-of, `P17` country) with grounded, real-world OSM nodes, ways, and relations.
- **Data Quality & Community Working Group (DWG) reviewers**: Reviewers verifying that automated and semi-automated edits adhere to strict OSM changeset guidelines, avoid bulk blind-imports, and preserve verifiable local ground truth.

## Product Purpose

A focused, high-precision GIS QA tool that bridges the gap between OpenStreetMap and Wikidata for GCC countries. It enables contributors to:
1. Identify Wikidata entities missing from OSM (or vice versa).
2. Review candidate matches with distance, bearing, and name-similarity verification.
3. Stage changes either as individual single-click edits or as disciplined, documented batch changesets directly to the OSM and Wikidata APIs.
4. Clean up corrupted, mismatched, or outdated `wikidata=*` tags safely.

## Positioning

Unlike generic OSM editors (iD, JOSM) that require manual tag authoring from scratch, or global linking tools (like MapRoulette challenges) that lack deep regional Gulf localization, this application is a purpose-built, dual-authenticated dashboard optimized for Arabian Peninsula POIs, handling bilingual (Arabic/English) transliterations, regional admin boundaries, and strict DWG compliance safeguards.

## Operating Context

- **Screen Setup**: Typically used on desktop/laptop displays side-by-side with satellite imagery, OpenStreetMap history, and Wikidata entity pages.
- **Data Environments**: Live queries against the Overpass API, Wikidata SPARQL endpoint, and OSM OAuth 2.0 API.
- **Workflow Speed**: High-frequency verification workflows where contributors spend hours scanning candidates, reviewing aerial imagery diffs, and staging batch queues. Ergonomic typography, reduced eye strain, and clear visual hierarchy are paramount.

## Capabilities and Constraints

- **Stack**: Pure client-side static web application (HTML5, modern CSS3, Vanilla ES Modules, Leaflet, MarkerCluster). Dev tooling relies on ESLint, Vitest, and Playwright. Zero bundling step for production.
- **Bilingual Core**: Primary layout is Arabic RTL (`dir="rtl"`, Cairo font), with full runtime toggle to English LTR (`dir="ltr"`).
- **Authentication**: Dual independent OAuth 2.0 sessions for OpenStreetMap and Wikidata with secure token management in client storage.
- **Offline & Low-Bandwidth Consideration**: Caches regional GeoJSON boundaries and query responses where possible.

## Brand Commitments

- **Tone**: Pragmatic, authoritative, GIS-grade, dependable, non-frivolous.
- **Aesthetic**: Modern dark cartographic theme (dark slate/navy basemaps with high-contrast thematic status accents: cyan for linked, amber for candidates, crimson/rose for missing).
- **Community Respect**: Emphasizes transparency, changeset comments with `#osm-wikidata-gcc`, explicit changelog diffs, and strict anti-vandalism safeguards.

## Evidence on Hand

- Production codebase with functional Leaflet mapping, Overpass data fetching, and OAuth integration (`index.html`, `css/style.css`, `js/`).
- Historical datasets and regional boundary polygons (`sa_boundary.geojson`, `data/`).
- Documented community guidelines (`OSM_IMPORT_GUIDELINES.md`, `CHANGELOG.md`, `SECURITY.md`).

## Product Principles

1. **Ground Truth Over Speed**: Never rush or automate tag linking without explicit human review and geographic proximity confirmation.
2. **First-Class Arabic Typography**: Arabic text must remain legible at glance across all density levels without clipped ligatures or crushed line heights.
3. **Calm Precision**: Minimize decorative noise (gimmicky neon glows, pulsing badges, ungrounded animations) in favor of crisp spatial indicators and legible data tables.
4. **Honest Feedback**: Clearly reflect network sync states, OAuth permissions, and changeset submission status without deceptive optimism.

## Accessibility & Inclusion

- Adherence to WCAG 2.1 AA standards for all content-bearing and interactive elements.
- Strict font size floor (minimum 12px for micro-labels; recommended 14px-16px for body and data cells).
- Minimum 4.5:1 contrast ratio across dark surfaces for all actionable buttons and data indicators.
- Symmetrical support for keyboard navigation (shortcuts `B`, `H`, `Esc`) and assistive technology outlines.
