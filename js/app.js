/**
 * Core Application Controller for OSM x Wikidata GCC Linker.
 */

let currentLang = localStorage.getItem("osm_wd_lang") || "ar";
let currentCountry = localStorage.getItem("osm_wd_country") || "sa";
let loadedDataset = null;
let filteredItems = [];
let summaryData = null;
let selectedItem = null;
let selectedItemIndex = -1;

// Filter state
let activeStatusFilter = "all"; // "all", 0 (missing), 1 (candidate), 2 (linked)
let activeCategoryFilters = new Set([1, 2, 3, 4, 5, 6]);
let searchQuery = "";

// Quality Filter Chips
let filterHasWiki = false;
let filterHasPhoto = false;
let filterHideDemolished = true; // default true: hide demolished / destroyed
let filterHideMosques = false;
let filterHideLinked = false;

// Viewport Stats state
let viewportStatsEnabled = false;
let viewportTimer = null;

// Top-level `let` bindings are not window properties; expose live getters for the other modules
Object.defineProperty(window, "currentLang", { get: () => currentLang });
Object.defineProperty(window, "currentCountry", { get: () => currentCountry });

document.addEventListener("DOMContentLoaded", async () => {
  // Initialize UI language
  setLanguage(currentLang);

  // Initialize Map
  MapController.init();

  // Handle OAuth callback if returning from OSM login
  await OsmAuth.handleCallback();
  updateAuthUI();

  // Load summary statistics
  await loadSummary();

  // Parse URL hash if present (e.g. #country=ae&qid=Q12345)
  parseUrlHash();

  // Load initial country
  await loadCountry(currentCountry);

  // Wire UI event listeners & keyboard shortcuts
  setupEventListeners();
  setupKeyboardShortcuts();
  setupViewportStatsListener();

  // Initialize Batch Manager and History Manager
  if (typeof BatchManager !== "undefined") BatchManager.init();
  if (typeof HistoryManager !== "undefined") HistoryManager.init();
});

async function loadSummary() {
  try {
    const res = await fetch("data/summary.json");
    if (res.ok) {
      summaryData = await res.json();
      renderSummaryStats();
    }
  } catch (e) {
    console.warn("Could not load summary.json:", e);
  }
}

function renderSummaryStats() {
  if (!summaryData) return;
  const countryCounts = summaryData.countries[currentCountry.toUpperCase()]?.counts || summaryData;
  let total = countryCounts.total || countryCounts.total_items || 0;
  let missing = countryCounts.missing || countryCounts.total_missing || 0;
  let candidates = countryCounts.candidates || countryCounts.total_candidates || 0;
  let linked = countryCounts.linked || countryCounts.total_linked || 0;

  if (loadedDataset && loadedDataset.items) {
    const verifiedCache = LiveVerifier.getVerifiedCache();
    for (let it of loadedDataset.items) {
      const origStatus = it.originalStatus ?? it[4];
      if (origStatus !== 2 && verifiedCache[`Q${it[0]}`]) {
        linked++;
        if (origStatus === 1) {
          candidates = Math.max(0, candidates - 1);
        } else {
          missing = Math.max(0, missing - 1);
        }
      }
    }
  }

  document.getElementById("stat-total-val").innerText = total.toLocaleString();
  document.getElementById("stat-missing-val").innerText = missing.toLocaleString();
  document.getElementById("stat-candidates-val").innerText = candidates.toLocaleString();
  document.getElementById("stat-linked-val").innerText = linked.toLocaleString();

  if (viewportStatsEnabled) {
    scheduleViewportStats();
  }
}

async function loadCountry(code) {
  currentCountry = code.toLowerCase();
  localStorage.setItem("osm_wd_country", currentCountry);
  updateUrlHash();

  const loadingEl = document.getElementById("loading-indicator");
  if (loadingEl) loadingEl.style.display = "flex";

  try {
    const res = await fetch(`data/${currentCountry}.json`);
    if (!res.ok) throw new Error(`Could not load data/${currentCountry}.json`);
    loadedDataset = await res.json();
    window.loadedDataset = loadedDataset;

    // Set map center and zoom
    if (loadedDataset.center && loadedDataset.zoom) {
      MapController.setView(loadedDataset.center, loadedDataset.zoom);
    }

    // Update country selector
    const countrySelect = document.getElementById("country-select");
    if (countrySelect) countrySelect.value = currentCountry;

    // Apply filters and render
    applyFilters();
    renderSummaryStats();
  } catch (e) {
    console.error("Failed to load country data:", e);
    alert(`Failed to load dataset for ${code.toUpperCase()}. Please check data/${code}.json.`);
  } finally {
    if (loadingEl) loadingEl.style.display = "none";
  }
}

function applyFilters() {
  if (!loadedDataset || !loadedDataset.items) return;

  const items = loadedDataset.items;
  filteredItems = [];
  const verifiedCache = LiveVerifier.getVerifiedCache();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const cat = item[3];
    const qid = `Q${item[0]}`;
    const localVer = verifiedCache[qid];
    const status = localVer ? 2 : item[4];
    const nameAr = item[5] || "";
    const nameEn = (item[6] || "").toLowerCase();
    const p31 = item[7] || "";
    const image = item[10] || "";
    const wikiAr = item[11] || "";

    // Status filter
    if (activeStatusFilter !== "all" && status !== activeStatusFilter) {
      continue;
    }

    // Quality Filter: Hide Linked features
    if (filterHideLinked && status === 2) {
      continue;
    }

    // Category filter
    if (!activeCategoryFilters.has(cat)) {
      continue;
    }

    // Quality Filter: Hide Demolished / Historical Ruins
    if (filterHideDemolished) {
      if (
        p31 === "Q19860854" || // destroyed building or structure
        p31 === "Q15893266" || // former entity
        nameAr.includes("سابق") ||
        nameAr.includes("مهدم") ||
        nameAr.includes("موقع قديم") ||
        nameEn.includes("former") ||
        nameEn.includes("demolished") ||
        nameEn.includes("destroyed")
      ) {
        continue;
      }
    }

    // Quality Filter: Has Wikipedia
    if (filterHasWiki && !wikiAr) {
      continue;
    }

    // Quality Filter: Has Photo
    if (filterHasPhoto && !image) {
      continue;
    }

    // Fast Mosques Toggle
    if (filterHideMosques && (cat === 6 || p31 === "Q32815")) {
      continue;
    }

    // Search query filter
    if (searchQuery && !ArabicUtils.matchesQuery(item, searchQuery)) {
      continue;
    }

    filteredItems.push(item);
  }

  // Update visible count badge
  const visibleBadge = document.getElementById("visible-count");
  if (visibleBadge) {
    visibleBadge.innerText = filteredItems.length.toLocaleString();
  }

  // Render on map
  MapController.renderItems(filteredItems, (item, marker) => {
    selectItem(item, marker);
  });

  // Update viewport statistics if enabled
  if (viewportStatsEnabled) {
    scheduleViewportStats();
  }
}

function scheduleViewportStats() {
  if (!viewportStatsEnabled || !filteredItems) return;
  clearTimeout(viewportTimer);
  viewportTimer = setTimeout(computeViewportStats, 150);
}

function computeViewportStats() {
  const bounds = MapController.getBounds();
  if (!bounds || !filteredItems) return;

  const s = bounds.getSouth(), n = bounds.getNorth();
  const w = bounds.getWest(), e = bounds.getEast();

  let vpTotal = 0, vpMissing = 0, vpCandidates = 0, vpLinked = 0;
  const verifiedCache = LiveVerifier.getVerifiedCache();

  for (let i = 0; i < filteredItems.length; i++) {
    const it = filteredItems[i];
    const lat = it[1];
    const lon = it[2];
    if (lat >= s && lat <= n && lon >= w && lon <= e) {
      vpTotal++;
      const qid = `Q${it[0]}`;
      const localVer = verifiedCache[qid];
      const st = localVer ? 2 : it[4];
      if (st === 0) vpMissing++;
      else if (st === 1) vpCandidates++;
      else if (st === 2) vpLinked++;
    }
  }

  const t = TRANSLATIONS[currentLang];
  const suffix = t.inViewSuffix || "in view";

  const setBadge = (id, count) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (viewportStatsEnabled) {
      el.style.display = "inline-block";
      el.innerText = `(${count.toLocaleString()} ${suffix})`;
    } else {
      el.style.display = "none";
    }
  };

  setBadge("stat-total-inview", vpTotal);
  setBadge("stat-missing-inview", vpMissing);
  setBadge("stat-candidates-inview", vpCandidates);
  setBadge("stat-linked-inview", vpLinked);
}

function selectItem(item, marker = null, skipFly = false) {
  selectedItem = item;
  window.selectedItem = selectedItem;
  selectedItemIndex = filteredItems.indexOf(item);

  const qid = `Q${item[0]}`;
  const lat = item[1];
  const lon = item[2];
  const catId = item[3];
  const status = item[4];
  const nameAr = item[5] || "";
  const nameEn = item[6] || "";
  const p31 = item[7] || "";
  const osmRef = item[8] || "";
  const candInfo = item[9] || "";
  const imageUrl = safeUrl(item[10]);
  const wikiAr = safeUrl(item[11]);
  const website = safeUrl(item[12]);
  const dissolvedYear = item[13] || "";
  const socialPipe = item[14] || "";

  // Fly to feature if not skipped
  if (!skipFly) {
    MapController.flyTo(lat, lon, 17);
  }

  // Clear previous candidate preview connector lines from map
  MapController.clearCandidatesFromMap();

  // Check if locally verified
  const localVer = LiveVerifier.isLocallyVerified(qid);
  const effectiveStatus = localVer ? 2 : status;
  const effectiveOsmRef = localVer ? localVer.osm_ref : osmRef;

  // Human-readable label for the P31 class (fetched from Wikidata if not cached yet)
  const p31Entry = p31 ? WikidataLabels.get(p31) : null;

  // Generate suggested tags
  const tags = TagGenerator.generateTags(item);
  const tagsLines = TagGenerator.formatAsLines(tags);
  const osmXml = TagGenerator.formatAsOsmXml(item, tags);

  // Show Inspector Panel
  const panel = document.getElementById("inspector-content");
  if (!panel) return;

  const t = TRANSLATIONS[currentLang];
  const statusBadges = {
    0: `<span class="badge badge-missing">${t.statusMissing}</span>`,
    1: `<span class="badge badge-candidate">${t.statusCandidates}</span>`,
    2: `<span class="badge badge-linked">${t.statusLinked}</span>`
  };

  const statusBadgeHtml = localVer 
    ? `<span class="badge badge-linked">${t.liveFound} (${escapeHtml(localVer.osm_ref)})</span>`
    : statusBadges[effectiveStatus];

  let candHtml = "";
  if (effectiveStatus === 1 && candInfo) {
    const matchMatch = candInfo.match(/^(\d+)%\s+Match\s*\|\s*(.*)$/i);
    let displayInfo = candInfo;
    let confidenceBadge = "";
    if (matchMatch) {
      const pct = parseInt(matchMatch[1], 10);
      const rest = matchMatch[2];
      const badgeClass = pct >= 90 ? "badge-ai-high" : (pct >= 75 ? "badge-ai-mid" : "badge-ai-low");
      confidenceBadge = `<span class="badge-ai-conf ${badgeClass}">🤖 ${pct}% ${currentLang === 'ar' ? 'ثقة الذكاء الاصطناعي' : 'AI Confidence'}</span>`;
      displayInfo = rest;
    }
    candHtml = `
      <div class="candidate-box">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
          <strong>🎯 ${currentLang === 'ar' ? 'عنصر مرشح مقترح بالذكاء الاصطناعي:' : 'AI Suggested OSM Candidate:'}</strong>
          ${confidenceBadge}
        </div>
        <div class="cand-details">${escapeHtml(displayInfo)} (OSM ID: <code>${escapeHtml(effectiveOsmRef)}</code>)</div>
      </div>
    `;
  }

  let mediaHtml = "";
  if (imageUrl) {
    mediaHtml += `
      <div class="inspector-image-container">
        <img src="${escapeHtml(imageUrl)}?width=400" alt="${escapeHtml(nameAr || nameEn)}" class="inspector-thumb clickable" loading="lazy" title="${currentLang === 'ar' ? 'انقر لتكبير الصورة' : 'Click to enlarge'}" />
        <div class="image-zoom-hint">🔍 ${currentLang === 'ar' ? 'تكبير' : 'Zoom'}</div>
      </div>
    `;
  }

  let wikiHtml = "";
  if (wikiAr) {
    wikiHtml = `<a href="${escapeHtml(wikiAr)}" target="_blank" rel="noopener" class="btn btn-wiki">📖 ${t.labelWikipedia}</a>`;
  }

  // NSI Dissolution Alert Banner
  let dissolvedHtml = "";
  if (dissolvedYear) {
    dissolvedHtml = `
      <div class="dissolved-alert-banner">
        <span>${t.dissolvedWarning} (${escapeHtml(dissolvedYear)})</span>
      </div>
    `;
  }

  // NSI Website & Social Pills
  let websiteRow = "";
  if (website) {
    const cleanWeb = website.replace(/^https?:\/\//, '').replace(/\/$/, '');
    websiteRow = `<tr><td>${t.contactWebsite}</td><td><a href="${escapeHtml(website)}" target="_blank" rel="noopener" class="external-url-link"><code>${escapeHtml(cleanWeb.length > 26 ? cleanWeb.slice(0, 24) + '...' : cleanWeb)}</code> ↗</a></td></tr>`;
  }

  let socialRow = "";
  if (socialPipe) {
    const parts = socialPipe.split("|").map(p => escapeHtml(p));
    const pills = [];
    if (parts[0]) pills.push(`<a href="https://twitter.com/${parts[0]}" target="_blank" rel="noopener" class="social-badge badge-twitter" title="Twitter: ${parts[0]}">🐦 @${parts[0]}</a>`);
    if (parts[1]) pills.push(`<a href="https://instagram.com/${parts[1]}" target="_blank" rel="noopener" class="social-badge badge-instagram" title="Instagram: ${parts[1]}">📸 ${parts[1]}</a>`);
    if (parts[2]) pills.push(`<a href="https://facebook.com/${parts[2]}" target="_blank" rel="noopener" class="social-badge badge-facebook" title="Facebook: ${parts[2]}">📘 ${parts[2]}</a>`);
    if (pills.length > 0) {
      socialRow = `<tr><td>${t.socialLinks}</td><td><div class="social-badges-wrap">${pills.join(" ")}</div></td></tr>`;
    }
  }

  // NSI External Research Suite
  const searchName = nameAr || nameEn || qid;
  const researchSuiteHtml = `
    <div class="inspector-section research-suite-card">
      <h4>🔍 ${t.researchTitle}</h4>
      <div class="research-links-grid">
        <a href="${MappingTools.getGoogleSearchUrl(searchName)}" target="_blank" rel="noopener" class="research-link-btn btn-google" title="Search Google">
          🌐 ${t.searchGoogle}
        </a>
        <a href="${MappingTools.getWikipediaSearchUrl(searchName)}" target="_blank" rel="noopener" class="research-link-btn btn-wikipedia" title="Search Wikipedia">
          📖 ${t.searchWikipedia}
        </a>
        <a href="${MappingTools.getWikidataSearchUrl(searchName)}" target="_blank" rel="noopener" class="research-link-btn btn-wikidata" title="Search Wikidata">
          🏛️ ${t.searchWikidata}
        </a>
      </div>
    </div>
  `;

  panel.innerHTML = `
    <div class="inspector-header">
      <div class="inspector-title-group">
        <h3>${escapeHtml(nameAr || nameEn || qid)}</h3>
        ${nameEn && nameAr ? `<div class="inspector-subtitle">${escapeHtml(nameEn)}</div>` : ""}
      </div>
      <div class="status-badge-container">${statusBadgeHtml}</div>
    </div>

    ${dissolvedHtml}
    ${mediaHtml}

    <!-- Metadata Section -->
    <div class="inspector-section">
      <h4>${t.wdSection}</h4>
      <table class="meta-table">
        <tr>
          <td>${t.labelQid}</td>
          <td><a href="https://www.wikidata.org/wiki/${qid}" target="_blank" rel="noopener" class="qid-link"><code>${qid}</code> ↗</a></td>
        </tr>
        ${nameAr ? `<tr><td>${t.labelNameAr}</td><td><strong>${escapeHtml(nameAr)}</strong></td></tr>` : ""}
        ${nameEn ? `<tr><td>${t.labelNameEn}</td><td>${escapeHtml(nameEn)}</td></tr>` : ""}
        ${p31 ? `<tr><td>${t.labelP31}</td><td>
          <div class="p31-cell">
            <span id="p31-label" class="p31-label${p31Entry ? "" : " loading"}" title="${escapeHtml(WikidataLabels.description(p31Entry, currentLang))}">${p31Entry ? escapeHtml(WikidataLabels.label(p31Entry, currentLang) || p31) : "…"}</span>
            <a href="https://www.wikidata.org/wiki/${escapeHtml(p31)}" target="_blank" rel="noopener" class="p31-qid-link"><code>${escapeHtml(p31)}</code> ↗</a>
          </div>
        </td></tr>` : ""}
        <tr><td>${t.labelCoords}</td><td><code>${lat.toFixed(5)}, ${lon.toFixed(5)}</code></td></tr>
        ${websiteRow}
        ${socialRow}
      </table>
      <div class="wd-actions">
        ${wikiHtml}
        <button id="btn-live-verify" class="btn btn-verify">⚡ ${t.btnLiveVerify}</button>
      </div>
      <div id="live-verify-result" class="verify-feedback" style="display: none;"></div>
    </div>

    ${researchSuiteHtml}
    ${candHtml}

    <!-- Suggested OSM Tags -->
    <div class="inspector-section">
      <div class="section-title-row">
        <h4>${t.tagProposalTitle}</h4>
        <button id="btn-copy-tags" class="btn-copy" title="${t.btnCopyTags}">📋 ${t.btnCopyTags}</button>
      </div>
      <pre class="tags-code-block" id="tags-code">${escapeHtml(tagsLines)}</pre>
    </div>

    <!-- Power-User Action Bar (NSI Aligned) -->
    <div class="inspector-actions">
      ${effectiveStatus === 1 ? `
        <button id="btn-single-link-trigger" class="btn btn-direct-link" title="${t.linkSingleNow || 'Link Now (Single Changeset)'} - Shortcut: L">
          ⚡ ${t.linkSingleNow || 'ربط فوري (مفرد)'} <kbd class="kbd-inline">L</kbd>
        </button>
        <button id="btn-batch-toggle-trigger" class="btn ${typeof BatchManager !== 'undefined' && BatchManager.isStaged(qid) ? 'btn-in-batch' : 'btn-add-batch'}" title="${t.batchQueueBtn}">
          ${typeof BatchManager !== 'undefined' && BatchManager.isStaged(qid) ? `✓ ${t.btnInBatch}` : `➕ ${t.btnAddToBatch}`}
        </button>
      ` : ""}
      <button id="btn-josm-zoom" class="btn btn-josm" title="Shortcut: J">🎯 ${t.btnJosmZoom} <kbd class="kbd-inline">J</kbd></button>
      ${effectiveStatus === 1 ? `<button id="btn-josm-tags" class="btn btn-josm-action" title="Shortcut: T">🏷️ ${t.btnJosmAddTags} <kbd class="kbd-inline">T</kbd></button>` : ""}
      ${effectiveStatus === 0 ? `<button id="btn-josm-add-node" class="btn btn-josm-action">➕ ${t.btnJosmAddNode}</button>` : ""}
      <button id="btn-overpass-turbo" class="btn btn-overpass" title="Shortcut: O">⚡ Overpass <kbd class="kbd-inline">O</kbd></button>
      <a href="${MappingTools.getIdEditorUrl(lat, lon)}" target="_blank" rel="noopener" class="btn btn-id" title="Shortcut: I">✏️ ${t.btnEditId} <kbd class="kbd-inline">I</kbd></a>
      <button id="btn-add-note" class="btn btn-note">📝 ${t.btnAddNote}</button>
      <button id="btn-copy-qs" class="btn btn-qs">⚡ ${t.btnQuickStatements}</button>
    </div>
  `;

  if (p31 && !p31Entry) {
    WikidataLabels.fetch(p31).then(entry => {
      // Ignore if the user has moved on to another feature meanwhile
      const el = document.getElementById("p31-label");
      if (!el || selectedItem !== item) return;
      el.textContent = WikidataLabels.label(entry, currentLang) || p31;
      el.title = WikidataLabels.description(entry, currentLang);
      el.classList.remove("loading");
    }).catch(() => {
      const el = document.getElementById("p31-label");
      if (el && selectedItem === item) el.style.display = "none";
    });
  }

  // Image lightbox click
  const thumb = panel.querySelector(".inspector-thumb");
  if (thumb && imageUrl) {
    thumb.onclick = () => openImageLightbox(imageUrl, nameAr || nameEn, qid);
  }

  // Wire buttons
  document.getElementById("btn-copy-tags").onclick = () => {
    navigator.clipboard.writeText(tagsLines).then(() => {
      const b = document.getElementById("btn-copy-tags");
      b.innerText = `✓ ${t.btnCopied}`;
      setTimeout(() => b.innerText = `📋 ${t.btnCopyTags}`, 2000);
    });
  };

  const btnSingleLinkTrigger = document.getElementById("btn-single-link-trigger");
  if (btnSingleLinkTrigger) {
    btnSingleLinkTrigger.onclick = () => {
      window.openSingleLinkModal(effectiveOsmRef, qid, nameAr || nameEn);
    };
  }

  const btnBatchToggleTrigger = document.getElementById("btn-batch-toggle-trigger");
  if (btnBatchToggleTrigger) {
    btnBatchToggleTrigger.onclick = () => {
      window.toggleCandidateBatch(effectiveOsmRef, qid, nameAr || nameEn);
    };
  }

  document.getElementById("btn-josm-zoom").onclick = () => {
    MappingTools.josmLoadAndZoom(lat, lon, effectiveOsmRef);
  };

  const btnJosmTags = document.getElementById("btn-josm-tags");
  if (btnJosmTags) {
    btnJosmTags.onclick = () => {
      MappingTools.josmAddTags(effectiveOsmRef, qid);
    };
  }

  const btnJosmAddNode = document.getElementById("btn-josm-add-node");
  if (btnJosmAddNode) {
    btnJosmAddNode.onclick = () => {
      MappingTools.josmLoadAndZoom(lat, lon);
      navigator.clipboard.writeText(osmXml).then(() => {
        alert(currentLang === "ar" ? "تم نسخ كود XML للنقطة! في JOSM، اضغط Ctrl+V للصقها." : "OSM XML copied! In JOSM, press Ctrl+V to paste.");
      });
    };
  }

  const btnOverpassTurbo = document.getElementById("btn-overpass-turbo");
  if (btnOverpassTurbo) {
    btnOverpassTurbo.onclick = () => {
      MappingTools.openOverpassTurbo(item, tags);
    };
  }

  document.getElementById("btn-copy-qs").onclick = () => {
    const qs = MappingTools.getQuickStatements(qid, effectiveOsmRef);
    navigator.clipboard.writeText(qs).then(() => {
      alert(`${currentLang === 'ar' ? 'تم نسخ سطر QuickStatements للذاكرة:' : 'QuickStatements copied:'}\n${qs}`);
    });
  };

  document.getElementById("btn-add-note").onclick = () => {
    openNoteModal(lat, lon, nameAr || nameEn, qid);
  };

  // Upgraded Multi-Candidate Live Verifier
  document.getElementById("btn-live-verify").onclick = async () => {
    const resBox = document.getElementById("live-verify-result");
    resBox.style.display = "block";
    resBox.className = "verify-feedback loading";
    resBox.innerText = t.liveVerifying;

    try {
      const result = await LiveVerifier.verifyItemLive(item);

      if (result.status === "linked") {
        resBox.className = "verify-feedback success";
        resBox.innerHTML = `<div>✓ ${t.liveFound} (OSM ID: <code>${escapeHtml(result.ref)}</code>)</div>`;
        LiveVerifier.markVerifiedLocally(qid, result.ref, item[5] || item[6]);
        updateDatasetItemStatus(qid, 2, result.ref);
        refreshViewAfterPush();
      } else if (result.candidates && result.candidates.length > 0) {
        resBox.className = "verify-feedback warning";

        // Show candidates on the map with connector lines
        MapController.showCandidatesOnMap([lat, lon], result.candidates, (cand) => {
          MappingTools.josmLoadAndZoom(cand.lat, cand.lon, cand.ref);
        });

        // Render multi-candidate interactive list
        resBox.innerHTML = `
          <div class="candidates-container-inner">
            <div class="candidates-header-row">
              <strong>${t.candidateFoundMulti} (${result.candidates.length})</strong>
              <button id="btn-clear-cand-preview" class="btn-clear-preview">${t.clearCandidates}</button>
            </div>
            ${result.candidates.map((cand, idx) => {
              const ref = OsmAuth.parseOsmRef(cand.ref);
              const isStaged = typeof BatchManager !== 'undefined' && BatchManager.isStaged(qid);
              return `
                <div class="candidate-card-item" data-cand-idx="${idx}">
                  <div class="cand-card-top">
                    <span class="cand-num-badge">#${idx + 1}</span>
                    <span class="cand-name-title">${escapeHtml(cand.name)}</span>
                    <span class="cand-distance-pill">${cand.distance_m} ${t.distanceMeters}</span>
                  </div>
                  <div class="cand-meta-line">
                    <a href="https://www.openstreetmap.org/${ref.type}/${ref.id}" target="_blank" rel="noopener"><code>${escapeHtml(cand.ref)}</code> ↗</a>
                    · <span class="cand-reason-tag">${escapeHtml(cand.matchedReason)}</span>
                  </div>
                  <div class="cand-button-bar">
                    <button class="btn btn-cand-mini btn-cand-direct-link" data-action="link">⚡ ${t.linkSingleNow || 'ربط فوري'}</button>
                    <button class="btn btn-cand-mini ${isStaged ? 'btn-cand-in-batch' : 'btn-cand-add-batch'}" data-action="batch">${isStaged ? `✓ ${t.btnInBatch}` : `➕ ${t.btnAddToBatch}`}</button>
                    <button class="btn btn-cand-mini" data-action="josm">🎯 JOSM</button>
                    <button class="btn btn-cand-mini" data-action="josm-tags">🏷️ ${t.btnJosmAddTags}</button>
                    <a href="${MappingTools.getIdEditorUrl(cand.lat, cand.lon)}" target="_blank" rel="noopener" class="btn btn-cand-mini">✏️ iD</a>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `;

        document.getElementById("btn-clear-cand-preview").onclick = () => {
          MapController.clearCandidatesFromMap();
        };

        resBox.querySelectorAll(".candidate-card-item").forEach(card => {
          const cand = result.candidates[Number(card.dataset.candIdx)];
          const actions = {
            "link": () => window.openSingleLinkModal(cand.ref, qid, cand.name || ""),
            "batch": () => window.toggleCandidateBatch(cand.ref, qid, cand.name || ""),
            "josm": () => MappingTools.josmLoadAndZoom(cand.lat, cand.lon, cand.ref),
            "josm-tags": () => MappingTools.josmAddTags(cand.ref, qid)
          };
          card.querySelectorAll("[data-action]").forEach(btn => {
            btn.onclick = actions[btn.dataset.action];
          });
        });

      } else {
        MapController.clearCandidatesFromMap();
        resBox.className = "verify-feedback info";
        resBox.innerText = `ℹ ${t.liveNotFound} (${result.count_nearby} nearby elements checked).`;
      }
    } catch (err) {
      resBox.className = "verify-feedback error";
      resBox.innerText = `Error: ${err.message}`;
    }
  };
}

/**
 * Opens the Single Link Confirmation & Improved Comment review modal.
 */
window.openSingleLinkModal = function(osmRef, qid, featureName, callback) {
  const t = TRANSLATIONS[currentLang];

  if (!OsmAuth.isLoggedIn()) {
    const doLogin = confirm(`${t.needLoginToLink}\n\n${currentLang === "ar" ? "هل ترغب في تسجيل الدخول الآن عبر OpenStreetMap؟" : "Would you like to log in with OpenStreetMap now?"}`);
    if (doLogin) {
      OsmAuth.startLogin();
    }
    return;
  }

  const modal = document.getElementById("single-link-modal");
  const nameEl = document.getElementById("single-link-feature-name");
  const qidEl = document.getElementById("single-link-qid");
  const osmRefEl = document.getElementById("single-link-osmref");
  const commentInput = document.getElementById("single-link-comment-input");
  const charCountEl = document.getElementById("single-link-char-count");
  const confirmBtn = document.getElementById("btn-confirm-single-link");
  const cancelBtn = document.getElementById("btn-cancel-single-link");
  const closeBtn = document.getElementById("btn-close-single-link");

  if (!modal || !commentInput) return;

  const cleanQid = qid.startsWith("Q") ? qid : `Q${qid}`;
  if (nameEl) nameEl.innerText = featureName || cleanQid;
  if (qidEl) qidEl.innerText = cleanQid;
  if (osmRefEl) osmRefEl.innerText = osmRef;

  // Extract extra tags (like wikipedia)
  let extraTags = {};
  if (selectedItem && `Q${selectedItem[0]}` === cleanQid) {
    const wikiAr = selectedItem[11];
    if (wikiAr) {
      try {
        const u = new URL(wikiAr);
        const art = decodeURIComponent(u.pathname.replace(/^\/wiki\//, ""));
        if (art) extraTags.wikipedia = `ar:${art}`;
      } catch (e) {}
    }
  }

  // Pre-fill improved smart comment
  const defaultComment = OsmAuth.generateChangesetComment({
    name: featureName,
    qid: cleanQid,
    osmRef: osmRef
  }, currentCountry);

  commentInput.value = defaultComment;
  if (charCountEl) charCountEl.innerText = commentInput.value.length;

  commentInput.oninput = () => {
    if (charCountEl) charCountEl.innerText = commentInput.value.length;
  };

  // Wire preset chips
  document.querySelectorAll(".single-preset-chip").forEach(chip => {
    chip.onclick = () => {
      const preset = chip.getAttribute("data-preset");
      if (preset && !commentInput.value.includes(preset)) {
        commentInput.value = `${commentInput.value.trim()} [${preset}]`;
        if (charCountEl) charCountEl.innerText = commentInput.value.length;
      }
    };
  });

  const closeModal = () => {
    modal.style.display = "none";
  };

  if (cancelBtn) cancelBtn.onclick = closeModal;
  if (closeBtn) closeBtn.onclick = closeModal;

  if (confirmBtn) {
    confirmBtn.onclick = async () => {
      confirmBtn.disabled = true;
      confirmBtn.innerText = `⏳ ${t.linkingInProgress || 'Linking...'}`;

      try {
        const finalComment = commentInput.value.trim() || defaultComment;
        const res = await OsmAuth.linkOsmElement(osmRef, cleanQid, extraTags, finalComment, featureName, currentCountry);

        closeModal();

        // Show feedback banner in inspector
        let feedbackEl = document.getElementById("link-feedback-box");
        if (!feedbackEl) {
          feedbackEl = document.createElement("div");
          feedbackEl.id = "link-feedback-box";
          const actionsContainer = document.querySelector(".inspector-actions");
          if (actionsContainer && actionsContainer.parentNode) {
            actionsContainer.parentNode.insertBefore(feedbackEl, actionsContainer);
          }
        }
        feedbackEl.style.display = "block";

        if (res.alreadyLinked) {
          feedbackEl.className = "verify-feedback info";
          feedbackEl.innerHTML = `ℹ️ ${t.alreadyLinkedNotice} (<code>${escapeHtml(osmRef)}</code>)`;
        } else {
          feedbackEl.className = "verify-feedback success";
          feedbackEl.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 4px;">
              <div><strong>✓ ${t.linkSuccess}</strong> <a href="${res.changesetUrl}" target="_blank" rel="noopener" class="qid-link">#${res.changesetId} ↗</a></div>
              <div style="font-size: 0.72rem;"><a href="${res.url}" target="_blank" rel="noopener">OSM: <code>${escapeHtml(osmRef)}</code> (v${escapeHtml(res.version)}) ↗</a></div>
            </div>
          `;
        }

        // Mark locally verified so it turns status 2 (Linked)
        LiveVerifier.markVerifiedLocally(cleanQid, osmRef, featureName);

        // Update in-memory item & dataset
        updateDatasetItemStatus(cleanQid, 2, osmRef);

        // Remove from batch if it was staged
        if (typeof BatchManager !== "undefined" && BatchManager.isStaged(cleanQid)) {
          BatchManager.remove(cleanQid);
        }

        // IMMEDIATELY refresh map view and counters so linked feature disappears from map
        refreshViewAfterPush();

        if (callback) callback(res);
      } catch (err) {
        console.error("Direct link error:", err);
        alert(`❌ ${t.linkError || 'Error:'} ${err.message}`);
      } finally {
        confirmBtn.disabled = false;
        confirmBtn.innerText = t.btnConfirmLinkNow || 'Confirm & Upload';
      }
    };
  }

  modal.style.display = "flex";
};

/**
 * Toggles an item in or out of the Batch Changeset queue.
 */
window.toggleCandidateBatch = function(osmRef, qid, candidateName = "") {
  const cleanQid = qid.startsWith("Q") ? qid : `Q${qid}`;

  if (typeof BatchManager !== "undefined" && BatchManager.isStaged(cleanQid)) {
    BatchManager.remove(cleanQid);
  } else {
    // Determine item data from selectedItem or loadedDataset
    let itemData = selectedItem;
    if (!itemData || `Q${itemData[0]}` !== cleanQid) {
      if (loadedDataset && loadedDataset.items) {
        const raw = parseInt(cleanQid.replace(/^Q/, ""), 10);
        itemData = loadedDataset.items.find(i => i[0] === raw);
      }
    }

    if (!itemData) {
      itemData = [
        parseInt(cleanQid.replace(/^Q/, ""), 10),
        0, 0, 1, 1,
        candidateName, "", "", osmRef, "", "", "", "", "", ""
      ];
    }

    let extraTags = {};
    if (itemData[11]) {
      try {
        const u = new URL(itemData[11]);
        const art = decodeURIComponent(u.pathname.replace(/^\/wiki\//, ""));
        if (art) extraTags.wikipedia = `ar:${art}`;
      } catch (e) {}
    }

    if (typeof BatchManager !== "undefined") {
      BatchManager.add(itemData, osmRef, candidateName, extraTags, currentCountry);
    }
  }

  // Refresh inspector view if this item is currently selected
  if (selectedItem && `Q${selectedItem[0]}` === cleanQid) {
    selectItem(selectedItem);
  }
};

/**
 * Backward compatibility alias for handleDirectLink.
 */
window.handleDirectLink = function(osmRef, qid, featureName, callback) {
  window.openSingleLinkModal(osmRef, qid, featureName, callback);
};

function openImageLightbox(imageUrl, title, qid) {
  const modal = document.getElementById("image-lightbox-modal");
  const imgEl = document.getElementById("lightbox-img");
  const captionEl = document.getElementById("lightbox-caption");
  const commonsLink = document.getElementById("lightbox-commons-link");

  if (!modal || !imgEl) return;

  // Clean URL to high resolution if thumbnail
  const highResUrl = imageUrl ? imageUrl.split("?")[0] : "";
  imgEl.src = highResUrl;
  if (captionEl) captionEl.innerText = `${title} (${qid})`;

  if (commonsLink) {
    // If it's a commons file URL, extract file title
    const filename = highResUrl.substring(highResUrl.lastIndexOf("/") + 1);
    commonsLink.href = filename
      ? `https://commons.wikimedia.org/wiki/File:${decodeURIComponent(filename)}`
      : `https://www.wikidata.org/wiki/${qid}`;
  }

  modal.style.display = "flex";
}

function openNoteModal(lat, lon, name, qid) {
  const modal = document.getElementById("note-modal");
  const coordsEl = document.getElementById("note-coords");
  const textInput = document.getElementById("note-text-input");
  if (!modal || !textInput) return;

  coordsEl.innerText = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
  textInput.value = currentLang === "ar"
    ? `يرجى إضافة / تحديث المعلم: ${name} (معرف ويكي بيانات: ${qid})`
    : `Please add/update feature: ${name} (Wikidata QID: ${qid})`;

  modal.style.display = "flex";

  document.getElementById("btn-submit-note-confirm").onclick = async () => {
    const text = textInput.value.trim();
    if (!text) return;
    try {
      await OsmAuth.submitNote(lat, lon, text);
      alert(TRANSLATIONS[currentLang].noteSuccess);
      modal.style.display = "none";
    } catch (err) {
      alert(`Failed to submit note: ${err.message}`);
    }
  };

  document.getElementById("btn-cancel-note").onclick = () => {
    modal.style.display = "none";
  };
}

function updateAuthUI() {
  const user = OsmAuth.getUserName();
  const loginBtn = document.getElementById("btn-osm-login");
  const userLabel = document.getElementById("osm-user-badge");

  if (user) {
    if (loginBtn) {
      loginBtn.innerText = TRANSLATIONS[currentLang].logoutOsm;
      loginBtn.onclick = () => {
        OsmAuth.logout();
        updateAuthUI();
      };
    }
    if (userLabel) {
      userLabel.style.display = "inline-flex";
      userLabel.innerText = `${TRANSLATIONS[currentLang].loggedInAs} ${user}`;
    }
  } else {
    if (loginBtn) {
      loginBtn.innerText = TRANSLATIONS[currentLang].loginOsm;
      loginBtn.onclick = () => OsmAuth.startLogin();
    }
    if (userLabel) userLabel.style.display = "none";
  }
}

function setLanguage(lang) {
  currentLang = lang;
  localStorage.setItem("osm_wd_lang", lang);
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";

  const t = TRANSLATIONS[lang];
  document.title = t.docTitle;

  // Translate all marked data-i18n elements
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    if (t[key]) el.innerText = t[key];
  });

  // Placeholder translations
  const searchInput = document.getElementById("search-input");
  if (searchInput) searchInput.placeholder = t.searchPlaceholder;

  const langBtn = document.getElementById("btn-toggle-lang");
  if (langBtn) langBtn.innerText = t.langLabel;

  // The data-i18n pass above resets the auth button to "login"; restore the real login/logout state
  updateAuthUI();

  if (selectedItem) {
    selectItem(selectedItem);
  }
}

function setupViewportStatsListener() {
  const mapInstance = MapController.getMap();
  if (!mapInstance) return;

  // Run viewport recalculation ONLY after movement finishes
  mapInstance.on("moveend", scheduleViewportStats);
  mapInstance.on("zoomend", scheduleViewportStats);
}

function setupKeyboardShortcuts() {
  window.addEventListener("keydown", (e) => {
    // Ignore keystrokes if the user is typing in an input or textarea
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA" || activeEl.tagName === "SELECT")) {
      return;
    }

    const key = e.key;

    // '?' -> Open/Close shortcuts modal
    if (key === "?") {
      e.preventDefault();
      const modal = document.getElementById("shortcuts-modal");
      if (modal) {
        modal.style.display = modal.style.display === "flex" ? "none" : "flex";
      }
      return;
    }

    // Escape -> Close any open modal
    if (key === "Escape") {
      document.querySelectorAll(".modal-overlay").forEach(m => m.style.display = "none");
      return;
    }

    // 'b' or 'B' -> Open Changeset Batch modal
    if (key === "b" || key === "B") {
      e.preventDefault();
      if (typeof BatchManager !== "undefined") BatchManager.openModal();
      return;
    }

    // 'h' or 'H' -> Open Changeset History page modal
    if (key === "h" || key === "H") {
      e.preventDefault();
      if (typeof HistoryManager !== "undefined") HistoryManager.openModal();
      return;
    }

    // '[' or ']' -> Cycle Basemap
    if (key === "[" || key === "]") {
      e.preventDefault();
      const bms = ["dark", "satellite", "streets"];
      const activeBtn = document.querySelector(".basemap-btn.active");
      const current = activeBtn ? activeBtn.getAttribute("data-bm") : "dark";
      const nextIdx = (bms.indexOf(current) + (key === "]" ? 1 : 2)) % bms.length;
      const targetBm = bms[nextIdx];
      document.querySelectorAll(".basemap-btn").forEach(b => {
        b.classList.toggle("active", b.getAttribute("data-bm") === targetBm);
      });
      MapController.switchBasemap(targetBm);
      return;
    }

    // Feature-specific shortcuts (require selectedItem)
    if (!selectedItem) return;

    const lat = selectedItem[1];
    const lon = selectedItem[2];
    const qid = `Q${selectedItem[0]}`;
    const osmRef = selectedItem[8] || "";

    if (key === "j" || key === "J") {
      e.preventDefault();
      MappingTools.josmLoadAndZoom(lat, lon, osmRef);
    } else if (key === "l" || key === "L") {
      e.preventDefault();
      const btnDirectLink = document.getElementById("btn-single-link-trigger") || document.getElementById("btn-direct-link");
      if (btnDirectLink) {
        btnDirectLink.click();
      } else {
        alert(currentLang === "ar" ? "الربط المباشر متاح للعناصر المرشحة (🟡) أو بعد التحقق المباشر." : "Direct linking is available for candidate matches (🟡) or verified items.");
      }
    } else if (key === "t" || key === "T") {
      e.preventDefault();
      if (osmRef) {
        MappingTools.josmAddTags(osmRef, qid);
      } else {
        alert(currentLang === "ar" ? "لا يوجد عنصر مرشح محدد لإرسال الوسم إليه في JOSM." : "No candidate element specified to tag.");
      }
    } else if (key === "i" || key === "I") {
      e.preventDefault();
      window.open(MappingTools.getIdEditorUrl(lat, lon), "_blank");
    } else if (key === "o" || key === "O") {
      e.preventDefault();
      const btnOp = document.getElementById("btn-overpass-turbo");
      if (btnOp) btnOp.click();
    } else if (key === "v" || key === "V") {
      e.preventDefault();
      const btnVerify = document.getElementById("btn-live-verify");
      if (btnVerify) btnVerify.click();
    } else if (key === "n" || key === "N") {
      // Next POI
      e.preventDefault();
      if (filteredItems.length > 0) {
        const nextIdx = (selectedItemIndex + 1) % filteredItems.length;
        selectItem(filteredItems[nextIdx]);
      }
    } else if (key === "p" || key === "P") {
      // Previous POI
      e.preventDefault();
      if (filteredItems.length > 0) {
        const prevIdx = (selectedItemIndex - 1 + filteredItems.length) % filteredItems.length;
        selectItem(filteredItems[prevIdx]);
      }
    }
  });
}

function setupEventListeners() {
  // Country Selector
  const countrySelect = document.getElementById("country-select");
  if (countrySelect) {
    countrySelect.addEventListener("change", (e) => {
      loadCountry(e.target.value);
    });
  }

  // Language Toggle
  const langBtn = document.getElementById("btn-toggle-lang");
  if (langBtn) {
    langBtn.addEventListener("click", () => {
      setLanguage(currentLang === "ar" ? "en" : "ar");
    });
  }

  // Search Input with Debounce
  const searchInput = document.getElementById("search-input");
  let searchTimer = null;
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        searchQuery = e.target.value;
        applyFilters();
      }, 250);
    });
  }

  // Viewport Stats Toggle Button
  const btnToggleVp = document.getElementById("btn-toggle-viewport-stats");
  if (btnToggleVp) {
    btnToggleVp.addEventListener("click", () => {
      viewportStatsEnabled = !viewportStatsEnabled;
      btnToggleVp.classList.toggle("active", viewportStatsEnabled);
      if (viewportStatsEnabled) {
        computeViewportStats();
      } else {
        ["stat-total-inview", "stat-missing-inview", "stat-candidates-inview", "stat-linked-inview"].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.style.display = "none";
        });
      }
    });
  }

  // Quality Filter Chips
  const chipWiki = document.getElementById("chip-wiki");
  if (chipWiki) {
    chipWiki.addEventListener("click", () => {
      filterHasWiki = !filterHasWiki;
      chipWiki.classList.toggle("active", filterHasWiki);
      applyFilters();
    });
  }

  const chipPhoto = document.getElementById("chip-photo");
  if (chipPhoto) {
    chipPhoto.addEventListener("click", () => {
      filterHasPhoto = !filterHasPhoto;
      chipPhoto.classList.toggle("active", filterHasPhoto);
      applyFilters();
    });
  }

  const chipDemolished = document.getElementById("chip-demolished");
  if (chipDemolished) {
    chipDemolished.addEventListener("click", () => {
      filterHideDemolished = !filterHideDemolished;
      chipDemolished.classList.toggle("active", filterHideDemolished);
      applyFilters();
    });
  }

  const chipMosques = document.getElementById("chip-mosques");
  if (chipMosques) {
    chipMosques.addEventListener("click", () => {
      filterHideMosques = !filterHideMosques;
      chipMosques.classList.toggle("active", filterHideMosques);
      applyFilters();
    });
  }

  const chipHideLinked = document.getElementById("chip-hide-linked");
  if (chipHideLinked) {
    chipHideLinked.addEventListener("click", () => {
      filterHideLinked = !filterHideLinked;
      chipHideLinked.classList.toggle("active", filterHideLinked);
      applyFilters();
    });
  }

  // Status Filter Buttons
  document.querySelectorAll(".status-filter-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      document.querySelectorAll(".status-filter-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const val = btn.getAttribute("data-status");
      activeStatusFilter = val === "all" ? "all" : parseInt(val);
      applyFilters();
    });
  });

  // Category Checkboxes
  document.querySelectorAll(".cat-checkbox").forEach(cb => {
    cb.addEventListener("change", () => {
      const catId = parseInt(cb.getAttribute("data-cat"));
      if (cb.checked) {
        activeCategoryFilters.add(catId);
      } else {
        activeCategoryFilters.delete(catId);
      }
      applyFilters();
    });
  });

  // Basemap Switcher
  document.querySelectorAll(".basemap-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".basemap-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      MapController.switchBasemap(btn.getAttribute("data-bm"));
    });
  });

  // Shortcuts Modal
  const btnShortcuts = document.getElementById("btn-shortcuts-modal");
  const shortcutsModal = document.getElementById("shortcuts-modal");
  const btnCloseShortcuts = document.getElementById("btn-close-shortcuts");
  if (btnShortcuts && shortcutsModal) {
    btnShortcuts.onclick = () => shortcutsModal.style.display = "flex";
  }
  if (btnCloseShortcuts && shortcutsModal) {
    btnCloseShortcuts.onclick = () => shortcutsModal.style.display = "none";
  }

  // About & Community / DWG Modal
  const btnAbout = document.getElementById("btn-about-modal");
  const linkDwg = document.getElementById("link-open-dwg-policy");
  const aboutModal = document.getElementById("about-modal");
  const btnCloseAbout = document.getElementById("btn-close-about");
  if (btnAbout && aboutModal) {
    btnAbout.onclick = () => aboutModal.style.display = "flex";
  }
  if (linkDwg && aboutModal) {
    linkDwg.onclick = (e) => {
      e.preventDefault();
      aboutModal.style.display = "flex";
    };
  }
  if (btnCloseAbout && aboutModal) {
    btnCloseAbout.onclick = () => aboutModal.style.display = "none";
  }

  // Lightbox Modal
  const lightboxModal = document.getElementById("image-lightbox-modal");
  const btnCloseLightbox = document.getElementById("btn-close-lightbox");
  if (btnCloseLightbox && lightboxModal) {
    btnCloseLightbox.onclick = () => lightboxModal.style.display = "none";
  }

  // Export Tools
  const exportMrBtn = document.getElementById("btn-export-mr");
  if (exportMrBtn) {
    exportMrBtn.addEventListener("click", () => {
      MappingTools.exportMapRoulette(filteredItems, currentCountry.toUpperCase());
    });
  }

  const exportJosmBtn = document.getElementById("btn-export-josm-presets");
  if (exportJosmBtn) {
    exportJosmBtn.addEventListener("click", () => {
      if (!filteredItems || filteredItems.length === 0) {
        alert(currentLang === "ar" ? "لا توجد عناصر مطابقة للتصدير." : "No filtered items to export.");
        return;
      }
      MappingTools.exportJosmPresets(filteredItems, currentCountry.toUpperCase());
    });
  }

  const exportCsvBtn = document.getElementById("btn-export-csv");
  if (exportCsvBtn) {
    exportCsvBtn.addEventListener("click", () => {
      MappingTools.exportCsv(filteredItems, currentCountry.toUpperCase());
    });
  }
}

function parseUrlHash() {
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return;
  const params = new URLSearchParams(hash);
  const c = params.get("country");
  if (c && ["sa", "ae", "kw", "qa", "bh", "om"].includes(c.toLowerCase())) {
    currentCountry = c.toLowerCase();
  }
}

function updateUrlHash() {
  const hash = `country=${currentCountry}`;
  window.history.replaceState(null, "", `#${hash}`);
}

/**
 * Updates an item's status in loadedDataset.items and selectedItem.
 */
function updateDatasetItemStatus(qid, newStatus, osmRef = "") {
  const cleanQid = qid.startsWith("Q") ? qid : `Q${qid}`;
  const rawQid = parseInt(cleanQid.replace(/^Q/, ""), 10);

  if (loadedDataset && loadedDataset.items) {
    const found = loadedDataset.items.find(it => it[0] === rawQid);
    if (found) {
      // Keep the dataset status so summary counters can be adjusted against the static summary.json
      if (found.originalStatus === undefined) found.originalStatus = found[4];
      found[4] = newStatus;
      if (osmRef) found[8] = osmRef;
    }
  }

  if (selectedItem && `Q${selectedItem[0]}` === cleanQid) {
    if (selectedItem.originalStatus === undefined) selectedItem.originalStatus = selectedItem[4];
    selectedItem[4] = newStatus;
    if (osmRef) selectedItem[8] = osmRef;
  }
}

/**
 * Refreshes the application view immediately after an OSM push (single or batch).
 * Clears connector lines, updates counters, re-filters items (so linked items disappear from map),
 * and refreshes the inspector state.
 */
function refreshViewAfterPush() {
  MapController.clearCandidatesFromMap();
  renderSummaryStats();
  applyFilters();
  if (selectedItem) {
    selectItem(selectedItem, null, true);
  }
  if (viewportStatsEnabled) {
    computeViewportStats();
  }
}

// Global Window Exports
window.loadedDataset = loadedDataset;
window.selectedItem = selectedItem;
window.applyFilters = applyFilters;
window.renderSummaryStats = renderSummaryStats;
window.selectItem = selectItem;
window.updateDatasetItemStatus = updateDatasetItemStatus;
window.refreshViewAfterPush = refreshViewAfterPush;

