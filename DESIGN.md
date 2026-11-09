---
name: OSM x Wikidata GCC Linker
description: High-precision cartographic QA and entity reconciliation interface for the Arabian Peninsula
colors:
  bg-dark: "#0a0b10"
  surface: "#111827"
  surface-hover: "#1f2937"
  panel-bg: "rgba(13, 16, 26, 0.88)"
  panel-border: "rgba(255, 255, 255, 0.12)"
  primary: "#00f2fe"
  secondary: "#4facfe"
  accent: "#10b981"
  missing: "#f43f5e"
  candidate: "#f59e0b"
  linked: "#06b6d4"
  text: "#f8fafc"
  text-muted: "#94a3b8"
  text-inverse: "#0f172a"
typography:
  display:
    fontFamily: "'Thmanyah Serif Display', 'Outfit', 'Cairo', sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.2
  title:
    fontFamily: "'Thmanyah Serif Display', 'Outfit', 'Cairo', sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.3
  body:
    fontFamily: "'Thmanyah Sans', 'Cairo', 'Plus Jakarta Sans', sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "'Thmanyah Sans', 'Cairo', 'Plus Jakarta Sans', sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 600
    lineHeight: 1.4
  mono:
    fontFamily: "'JetBrains Mono', monospace"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.4
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.text-inverse}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-repair:
    backgroundColor: "{colors.candidate}"
    textColor: "{colors.text-inverse}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  badge-linked:
    backgroundColor: "rgba(6, 182, 212, 0.15)"
    textColor: "{colors.linked}"
    rounded: "{rounded.sm}"
    padding: "2px 8px"
---

## Overview

The design system for **OSM × Wikidata GCC Linker** is engineered for deep cartographic verification, GIS entity alignment, and intensive data curation. The interface balances full-screen map interaction (Leaflet) with a rich, semi-transparent frosted control panel and contextual inspection drawers.

The core visual philosophy is **"Calm Precision"**: dark basemaps to minimize glare during long tagging sessions, crisp high-contrast data tags, and rigorous typography optimized for bilingual Arabic-English legibility.

## Colors

The palette employs a deep midnight base with functional geospatial semantics:

- **Background & Canvas:**
  - `bg-dark` (`#0a0b10`): Deep dark space for the map canvas and base viewports.
  - `surface` (`#111827`): Opaque slate container for modals, floating dialogs, and popovers.
  - `panel-bg` (`rgba(13, 16, 26, 0.88)`): Backdrop-filtered frosted glass for floating sidebars.
- **Geospatial Status Tones:**
  - **Linked (`#06b6d4` / `#00f2fe`)**: Verified entities where OSM and Wikidata are connected.
  - **Candidate (`#f59e0b`)**: Potential geographic and name matches pending human confirmation.
  - **Missing (`#f43f5e`)**: Entities present in Wikidata with no corresponding OSM element.
  - **Success / Added (`#10b981`)**: Newly linked tags and successful changeset uploads.
- **Text & Hierarchy:**
  - `text` (`#f8fafc`): Primary reading contrast (> 12:1 against dark backgrounds).
  - `text-muted` (`#94a3b8`): Secondary metadata, coordinates, QIDs, and tags (minimum 4.5:1).
  - `text-inverse` (`#0f172a`): High-contrast dark typography for bright buttons (such as amber and cyan buttons).

## Typography

Arabic typography demands generous vertical rhythm and larger floor sizes than Latin text due to complex diacritics and compact baseline letterforms:

- **Font Stacks:**
  - Headings / Brand: `'Thmanyah Serif Display', 'Outfit', 'Cairo', sans-serif`
  - Body & Controls: `'Thmanyah Sans', 'Cairo', 'Plus Jakarta Sans', sans-serif`
  - Identifiers & Coordinates: `'JetBrains Mono', monospace`
- **Scale Rules:**
  - **Floor Size:** No content-bearing UI label or button may render below `11px` (`0.6875rem`). The standard micro-label baseline is `12px` (`0.75rem`).
  - **Body Copy:** Base text should render at `14px` (`0.875rem`) to `15px` (`0.9375rem`) with line-height of `1.5` to `1.6` for Cairo.
  - **Headings:** Hierarchy strictly descends from `h1` (main brand), `h2` (major panels, drawer views, modals), down to `h3`/`h4` (cards and sections).

## Layout

- **Full-Bleed Map Canvas:** The Leaflet map occupies 100vw × 100vh.
- **Floating Sidebar:** Positioned at `16px` inset from viewport edges. In RTL mode, docks on the right; in LTR mode, docks on the left. Width is fixed to `380px` on desktop and adapts responsively on mobile.
- **Basemap & Utility Docks:** Floating horizontal toolbars docked at bottom-start and bottom-end with non-obstructive z-indices.
- **RTL-First Spacing:** All margins, paddings, and absolute anchors use logical CSS properties (`margin-inline-start`, `inset-inline-start`, `text-align: start`) to guarantee seamless language flipping.

## Elevation & Depth

Layering relies on subtle surface luminance shifts and physical drop shadows rather than neon or chromatic glow effects:

- **Elevation 0 (Map Canvas):** Ground level.
- **Elevation 1 (Cards & Inputs):** `rgba(255, 255, 255, 0.04)` fill with `1px solid rgba(255, 255, 255, 0.08)` border.
- **Elevation 2 (Floating Sidebar & Drawer):** Frosted glass `backdrop-filter: blur(16px)` with `box-shadow: 0 10px 30px -5px rgba(0, 0, 0, 0.6)`.
- **Elevation 3 (Modals & Lightboxes):** `box-shadow: 0 20px 45px -10px rgba(0, 0, 0, 0.8)` with dark semi-opaque backdrop scrim (`rgba(0, 0, 0, 0.75)`).

## Shapes

- **Corner Radius:**
  - Buttons, Inputs, Chips: `8px` (`--rounded-md`).
  - Panels, Modals, Drawers: `16px` (`--rounded-xl`).
  - Status Indicators & Avatars: `9999px` (`--rounded-full`).
- **Borders:** Consistent `1px` translucent strokes (`rgba(255, 255, 255, 0.1)`) create crisp definition against variable map imagery without heavy opaque borders.

## Components

- **Action Buttons (`.btn`):**
  - Primary Action: Bright cyan or amber button with dark text (`#0f172a`) to guarantee minimum 4.5:1 WCAG AA contrast.
  - Secondary / Ghost Action: Translucent dark surface with border, lightening on hover.
  - Dangerous / Reject Action: Subdued rose tint, brightening on hover.
- **Status Filter Chips (`.status-filter-btn`):**
  - Compact segment pills showing count badges, active states indicated with accent borders and subtle tinted backgrounds.
- **Diff Table (`.tag-repair-diff`):**
  - Structured comparative view (Old Tag vs New Tag) with distinct green (addition) and red (deletion) highlight badges, padded with minimum `8px` container insets.
- **Lightbox / Preview Modal:**
  - High-res image display with fallback SVG placeholder to prevent empty image source warnings.

## Do's and Don'ts

### Do
- Maintain dark text on bright amber (`#f59e0b`) buttons (`color: #0f172a`) to pass WCAG AA standards.
- Use natural elevation drop shadows (`rgba(0, 0, 0, 0.5)`) rather than zero-offset chromatic glow halos (`box-shadow: 0 0 15px cyan`).
- Keep Arabic text at or above `12px` to prevent Cairo glyph degradation.
- Maintain sequential heading hierarchy (`h1` -> `h2` -> `h3`).
- Use CSS logical properties (`margin-inline`, `padding-inline`) for bidirectional symmetry.

### Don't
- Don't use white text on bright warning/amber buttons (yields an unreadable 2.1:1 ratio).
- Don't leave empty `<img src="">` tags in modal templates before user interaction.
- Don't place infinite decorative pulsing animations on idle elements.
- Don't cram table cells against raw container borders without inset padding.
- Don't hardcode `left` or `right` positioning for directional UI controls.
