/**
 * Leaflet Map Controller with Layer Switching, Marker Clustering,
 * and Status-Coded Vector Markers.
 */

let map = null;
let clusterGroup = null;
let currentBasemap = null;
let basemapLayers = {};
let activeMarker = null;
let candidatesLayerGroup = null;

const MapController = {
  STATUS_COLORS: {
    0: "#ff3366", // Red: Missing in OSM
    1: "#ffb703", // Amber: Candidate Match
    2: "#00f2fe"  // Cyan/Green: Already Linked
  },

  init() {
    // Initial map centered on GCC / Riyadh
    map = L.map("map", {
      center: [24.5, 48.0],
      zoom: 6,
      maxZoom: 19,
      zoomControl: false,
      preferCanvas: true
    });

    // Zoom control in top corner
    L.control.zoom({ position: "topright" }).addTo(map);

    // Basemaps (keyless Esri tiles only; no volunteer-run OSM tile servers, and no
    // providers that need an API key). Label overlays keep names readable on every style.
    // Labels sit above the tiles but below markers/vectors.
    map.createPane("basemapLabels").style.zIndex = 250;
    map.getPane("basemapLabels").style.pointerEvents = "none";

    const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";
    const esri = (path, opts) =>
      L.tileLayer(`${ESRI}/${path}/MapServer/tile/{z}/{y}/{x}`, {
        maxNativeZoom: 19,
        maxZoom: 19,
        ...opts
      });
    const esriAttr = '&copy; <a href="https://www.esri.com/">Esri</a>';
    const labels = (path) => esri(path, { pane: "basemapLabels", opacity: 0.9, attribution: "" });

    basemapLayers = {
      dark: L.layerGroup([
        esri("Canvas/World_Dark_Gray_Base", { maxNativeZoom: 16, attribution: `${esriAttr}, HERE, Garmin` }),
        labels("Canvas/World_Dark_Gray_Reference")
      ]),
      light: L.layerGroup([
        esri("Canvas/World_Light_Gray_Base", { maxNativeZoom: 16, attribution: `${esriAttr}, HERE, Garmin` }),
        labels("Canvas/World_Light_Gray_Reference")
      ]),
      streets: esri("World_Street_Map", {
        attribution: `${esriAttr}, HERE, Garmin, USGS, NGA, FAO, OpenStreetMap contributors`
      }),
      topo: esri("World_Topo_Map", {
        attribution: `${esriAttr}, HERE, Garmin, USGS, NGA, FAO, OpenStreetMap contributors`
      }),
      satellite: L.layerGroup([
        esri("World_Imagery", { attribution: `${esriAttr}, Maxar, Earthstar Geographics` }),
        labels("Reference/World_Boundaries_and_Places")
      ])
    };

    // Default to streets
    currentBasemap = basemapLayers.streets;
    currentBasemap.addTo(map);

    // Marker cluster group
    clusterGroup = L.markerClusterGroup({
      chunkedLoading: true,
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      iconCreateFunction: (cluster) => {
        const count = cluster.getChildCount();
        let sizeClass = count < 50 ? "small" : count < 500 ? "medium" : "large";
        return L.divIcon({
          html: `<div class="custom-cluster ${sizeClass}"><span>${count.toLocaleString()}</span></div>`,
          className: "marker-cluster-custom",
          iconSize: L.point(40, 40)
        });
      }
    });
    map.addLayer(clusterGroup);

    // Layer group for live candidates and connector lines
    candidatesLayerGroup = L.layerGroup().addTo(map);

    // Map click
    map.on("click", (e) => {
      if (window.isNotePlacementMode) {
        window.handleMapNoteClick(e.latlng.lat, e.latlng.lng);
      }
    });
  },

  BASEMAP_ORDER: ["dark", "light", "streets", "topo", "satellite"],

  switchBasemap(type) {
    if (basemapLayers[type] && currentBasemap !== basemapLayers[type]) {
      map.removeLayer(currentBasemap);
      currentBasemap = basemapLayers[type];
      currentBasemap.addTo(map);
    }
  },

  /**
   * Displays nearby OSM candidates on the map with connector lines.
   */
  showCandidatesOnMap(targetCoords, candidates, onCandidateClick) {
    this.clearCandidatesFromMap();
    if (!candidates || candidates.length === 0) return;

    candidates.forEach((cand, idx) => {
      if (!cand.lat || !cand.lon) return;

      // 1. Dashed connector line
      const line = L.polyline([targetCoords, [cand.lat, cand.lon]], {
        color: "#ffb703",
        weight: 2.5,
        dashArray: "6, 6",
        opacity: 0.85,
        className: "candidate-connector-line"
      });

      line.bindTooltip(`${cand.distance_m}m`, {
        permanent: true,
        direction: "center",
        className: "connector-distance-label"
      });
      candidatesLayerGroup.addLayer(line);

      // 2. Candidate marker icon
      const candIcon = L.divIcon({
        className: "candidate-poi-marker",
        html: `<div class="candidate-marker-pin" title="${escapeHtml(cand.name)} (${escapeHtml(cand.ref)})"><span>${idx + 1}</span></div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13]
      });

      const candMarker = L.marker([cand.lat, cand.lon], { icon: candIcon });
      candMarker.bindTooltip(`<b>${escapeHtml(cand.name)}</b><br>OSM: <code>${escapeHtml(cand.ref)}</code> (${cand.distance_m}m)`, {
        direction: "top",
        offset: [0, -12],
        className: "marker-tooltip"
      });

      if (onCandidateClick) {
        candMarker.on("click", () => onCandidateClick(cand));
      }

      candidatesLayerGroup.addLayer(candMarker);
    });
  },

  clearCandidatesFromMap() {
    if (candidatesLayerGroup) {
      candidatesLayerGroup.clearLayers();
    }
  },

  getMap() {
    return map;
  },

  getBounds() {
    return map ? map.getBounds() : null;
  },

  /**
   * Renders the filtered items onto the map using marker clusters.
   * item: [0:qid_num, 1:lat, 2:lon, 3:cat, 4:status, 5:name_ar, 6:name_en, 7:p31, 8:osm_ref, 9:cand_info, 10:image, 11:wiki_ar]
   */
  renderItems(items, onSelectCallback) {
    clusterGroup.clearLayers();
    this.clearCandidatesFromMap();
    activeMarker = null;

    const markers = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const lat = item[1];
      const lon = item[2];
      const qid = `Q${item[0]}`;
      const isLocal = LiveVerifier.isLocallyVerified(qid);
      const status = isLocal ? 2 : item[4];
      const color = this.STATUS_COLORS[status] || "#999999";
      const name = item[5] || item[6] || qid;

      // Lightweight SVG pin icon
      const icon = L.divIcon({
        className: `poi-marker status-${status}`,
        html: `<div class="marker-dot" style="background-color: ${color}; border-color: rgba(255,255,255,0.85);"></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8]
      });

      const marker = L.marker([lat, lon], { icon: icon });
      marker.itemData = item;

      marker.on("click", () => {
        if (onSelectCallback) {
          onSelectCallback(item, marker);
        }
      });

      marker.bindTooltip(escapeHtml(name), {
        direction: "top",
        offset: [0, -8],
        className: "marker-tooltip"
      });

      markers.push(marker);
    }

    clusterGroup.addLayers(markers);
  },

  REVERSE_COLORS: {
    missing_backlink_high: "#00ff87",
    missing_backlink: "#ffb703",
    broken_osm_tag: "#ff3366",
    conflict: "#fb8500",
    review_gap: "#3a86ff"
  },

  renderReverseItems(items, onSelectCallback) {
    clusterGroup.clearLayers();
    this.clearCandidatesFromMap();
    activeMarker = null;

    const markers = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const osm = item.osm || {};
      const wd = item.wikidata || {};
      const lat = osm.lat || wd.lat;
      const lon = osm.lon || wd.lon;

      if (!lat || !lon || (lat === 0.0 && lon === 0.0)) {
        continue;
      }

      let colorKey = item.kind;
      if (item.kind === "missing_backlink" && item.subkind === "high_confidence") {
        colorKey = "missing_backlink_high";
      }
      const color = this.REVERSE_COLORS[colorKey] || "#00f2fe";
      const name = osm.name || osm.name_ar || wd.name_ar || wd.name_en || item.qid;

      const icon = L.divIcon({
        className: `poi-marker reverse-marker kind-${item.kind}`,
        html: `<div class="marker-dot" style="background-color: ${color}; border-color: rgba(255,255,255,0.85); box-shadow: 0 0 8px ${color};"></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8]
      });

      const marker = L.marker([lat, lon], { icon: icon });
      marker.itemData = item;

      marker.on("click", () => {
        if (onSelectCallback) {
          onSelectCallback(item, marker);
        }
      });

      marker.bindTooltip(escapeHtml(name), {
        direction: "top",
        offset: [0, -8],
        className: "marker-tooltip"
      });

      markers.push(marker);
    }

    clusterGroup.addLayers(markers);
  },

  flyTo(lat, lon, zoom = 16) {
    map.flyTo([lat, lon], zoom, { duration: 1.2 });
  },

  setView(center, zoom) {
    map.setView(center, zoom);
  }
};

