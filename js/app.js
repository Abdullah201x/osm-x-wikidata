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

// Viewport Stats state
let viewportStatsEnabled = false;
let viewportTimer = null;

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
    let localLinkedCount = 0;
    for (let it of loadedDataset.items) {
      if (it[4] !== 2 && LiveVerifier.isLocallyVerified(`Q${it[0]}`)) {
        localLinkedCount++;
      }
    }
    linked += localLinkedCount;
    candidates = Math.max(0, candidates - localLinkedCount);
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

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const cat = item[3];
    const qid = `Q${item[0]}`;
    const localVer = LiveVerifier.isLocallyVerified(qid);
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

    // Category filter
    if (!activeCategoryFilters.has(cat)) {
      continue;
    }

    // Quality Filter: Hide Demolished / Historical Ruins
    if (filterHideDemolished) {
      if (
        p31 === "Q19860854" || // destroyed building or structure
        p31 === "Q21014589" || // demolished building
        p31 === "Q1656682"  || // former entity
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

  for (let i = 0; i < filteredItems.length; i++) {
    const it = filteredItems[i];
    const lat = it[1];
    const lon = it[2];
    if (lat >= s && lat <= n && lon >= w && lon <= e) {
      vpTotal++;
      const qid = `Q${it[0]}`;
      const localVer = LiveVerifier.isLocallyVerified(qid);
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

function selectItem(item, marker = null) {
  selectedItem = item;
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
  const imageUrl = item[10] || "";
  const wikiAr = item[11] || "";
  const website = item[12] || "";
  const dissolvedYear = item[13] || "";
  const socialPipe = item[14] || "";

  // Fly to feature
  MapController.flyTo(lat, lon, 17);

  // Clear previous candidate preview connector lines from map
  MapController.clearCandidatesFromMap();

  // Check if locally verified
  const localVer = LiveVerifier.isLocallyVerified(qid);
  const effectiveStatus = localVer ? 2 : status;
  const effectiveOsmRef = localVer ? localVer.osm_ref : osmRef;

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
    ? `<span class="badge badge-linked">${t.liveFound} (${localVer.osm_ref})</span>`
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
        <div class="cand-details">${displayInfo} (OSM ID: <code>${effectiveOsmRef}</code>)</div>
      </div>
    `;
  }

  let mediaHtml = "";
  if (imageUrl) {
    mediaHtml += `
      <div class="inspector-image-container">
        <img src="${imageUrl}?width=400" alt="${nameAr || nameEn}" class="inspector-thumb clickable" loading="lazy" title="${currentLang === 'ar' ? 'انقر لتكبير الصورة' : 'Click to enlarge'}" />
        <div class="image-zoom-hint">🔍 ${currentLang === 'ar' ? 'تكبير' : 'Zoom'}</div>
      </div>
    `;
  }

  let wikiHtml = "";
  if (wikiAr) {
    wikiHtml = `<a href="${wikiAr}" target="_blank" rel="noopener" class="btn btn-wiki">📖 ${t.labelWikipedia}</a>`;
  }

  // NSI Dissolution Alert Banner
  let dissolvedHtml = "";
  if (dissolvedYear) {
    dissolvedHtml = `
      <div class="dissolved-alert-banner">
        <span>${t.dissolvedWarning} (${dissolvedYear})</span>
      </div>
    `;
  }

  // NSI Website & Social Pills
  let websiteRow = "";
  if (website) {
    const cleanWeb = website.replace(/^https?:\/\//, '').replace(/\/$/, '');
    websiteRow = `<tr><td>${t.contactWebsite}</td><td><a href="${website}" target="_blank" rel="noopener" class="external-url-link"><code>${cleanWeb.length > 26 ? cleanWeb.slice(0, 24) + '...' : cleanWeb}</code> ↗</a></td></tr>`;
  }

  let socialRow = "";
  if (socialPipe) {
    const parts = socialPipe.split("|");
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
        <h3>${nameAr || nameEn || qid}</h3>
        ${nameEn && nameAr ? `<div class="inspector-subtitle">${nameEn}</div>` : ""}
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
        ${nameAr ? `<tr><td>${t.labelNameAr}</td><td><strong>${nameAr}</strong></td></tr>` : ""}
        ${nameEn ? `<tr><td>${t.labelNameEn}</td><td>${nameEn}</td></tr>` : ""}
        ${p31 ? `<tr><td>${t.labelP31}</td><td><a href="https://www.wikidata.org/wiki/${p31}" target="_blank" rel="noopener"><code>${p31}</code></a></td></tr>` : ""}
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
      <pre class="tags-code-block" id="tags-code">${tagsLines}</pre>
    </div>

    <!-- Power-User Action Bar (NSI Aligned) -->
    <div class="inspector-actions">
      ${effectiveStatus === 1 ? `<button id="btn-direct-link" class="btn btn-direct-link" title="Direct 1-Click OSM Link (API 0.6) - Shortcut: L">${t.btnDirectLinkOsm} <kbd class="kbd-inline">L</kbd></button>` : ""}
      <button id="btn-josm-zoom" class="btn btn-josm" title="Shortcut: J">🎯 ${t.btnJosmZoom} <kbd class="kbd-inline">J</kbd></button>
      ${effectiveStatus === 1 ? `<button id="btn-josm-tags" class="btn btn-josm-action" title="Shortcut: T">🏷️ ${t.btnJosmAddTags} <kbd class="kbd-inline">T</kbd></button>` : ""}
      ${effectiveStatus === 0 ? `<button id="btn-josm-add-node" class="btn btn-josm-action">➕ ${t.btnJosmAddNode}</button>` : ""}
      <button id="btn-overpass-turbo" class="btn btn-overpass" title="Shortcut: O">⚡ Overpass <kbd class="kbd-inline">O</kbd></button>
      <a href="${MappingTools.getIdEditorUrl(lat, lon)}" target="_blank" rel="noopener" class="btn btn-id" title="Shortcut: I">✏️ ${t.btnEditId} <kbd class="kbd-inline">I</kbd></a>
      <button id="btn-add-note" class="btn btn-note">📝 ${t.btnAddNote}</button>
      <button id="btn-copy-qs" class="btn btn-qs">⚡ ${t.btnQuickStatements}</button>
    </div>
  `;

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

  const btnDirectLink = document.getElementById("btn-direct-link");
  if (btnDirectLink) {
    btnDirectLink.onclick = () => {
      window.handleDirectLink(effectiveOsmRef, qid, nameAr || nameEn);
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
        resBox.innerHTML = `<div>✓ ${t.liveFound} (OSM ID: <code>${result.ref}</code>)</div>`;
        MapController.showCandidatesOnMap([lat, lon], result.candidates);
        selectItem(item, marker); // refresh view with linked status
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
              const oType = cand.ref.charAt(0) === 'w' ? 'way' : cand.ref.charAt(0) === 'r' ? 'relation' : 'node';
              const oId = cand.ref.slice(1);
              return `
                <div class="candidate-card-item">
                  <div class="cand-card-top">
                    <span class="cand-num-badge">#${idx + 1}</span>
                    <span class="cand-name-title">${cand.name}</span>
                    <span class="cand-distance-pill">${cand.distance_m} ${t.distanceMeters}</span>
                  </div>
                  <div class="cand-meta-line">
                    <a href="https://www.openstreetmap.org/${oType}/${oId}" target="_blank" rel="noopener"><code>${cand.ref}</code> ↗</a>
                    · <span class="cand-reason-tag">${cand.matchedReason}</span>
                  </div>
                  <div class="cand-button-bar">
                    <button class="btn btn-cand-mini btn-cand-direct-link" onclick="window.handleDirectLink('${cand.ref}', '${qid}', '${(cand.name || '').replace(/'/g, "\\'")}')">${t.btnDirectLinkOsm}</button>
                    <button class="btn btn-cand-mini" onclick="MappingTools.josmLoadAndZoom(${cand.lat}, ${cand.lon}, '${cand.ref}')">🎯 JOSM</button>
                    <button class="btn btn-cand-mini" onclick="MappingTools.josmAddTags('${cand.ref}', '${qid}')">🏷️ ${t.btnJosmAddTags}</button>
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
 * Executes a direct 1-click Assisted Conflation link via OSM API 0.6.
 * Adds wikidata=Q... to the existing OSM object under the user's authenticated OSM account.
 */
window.handleDirectLink = async function(osmRef, qid, featureName, callback) {
  const t = TRANSLATIONS[currentLang];

  if (!OsmAuth.isLoggedIn()) {
    const doLogin = confirm(`${t.needLoginToLink}\n\n${currentLang === "ar" ? "هل ترغب في تسجيل الدخول الآن عبر OpenStreetMap؟" : "Would you like to log in with OpenStreetMap now?"}`);
    if (doLogin) {
      OsmAuth.startLogin();
    }
    return;
  }

  const confirmMsg = (t.confirmLinkPrompt || "Confirm adding tag {qid} to OSM element ({osmRef})?")
    .replace("{qid}", qid)
    .replace("{osmRef}", osmRef);

  if (!confirm(confirmMsg)) {
    return;
  }

  // Find if we have extra tags (like wikipedia) from selectedItem
  let extraTags = {};
  if (selectedItem && `Q${selectedItem[0]}` === qid) {
    const wikiAr = selectedItem[11];
    if (wikiAr) {
      try {
        const u = new URL(wikiAr);
        const art = decodeURIComponent(u.pathname.replace(/^\/wiki\//, ""));
        if (art) extraTags.wikipedia = `ar:${art}`;
      } catch (e) {}
    }
  }

  // Show status feedback
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
  feedbackEl.className = "verify-feedback loading";
  feedbackEl.innerText = `⏳ ${t.linkingInProgress}`;

  try {
    const res = await OsmAuth.linkOsmElement(osmRef, qid, extraTags);

    if (res.alreadyLinked) {
      feedbackEl.className = "verify-feedback info";
      feedbackEl.innerHTML = `ℹ️ ${t.alreadyLinkedNotice} (<code>${osmRef}</code>)`;
    } else {
      feedbackEl.className = "verify-feedback success";
      feedbackEl.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <div><strong>✓ ${t.linkSuccess}</strong> <a href="${res.changesetUrl}" target="_blank" rel="noopener" class="qid-link">#${res.changesetId} ↗</a></div>
          <div style="font-size: 0.72rem;"><a href="${res.url}" target="_blank" rel="noopener">OSM: <code>${osmRef}</code> (v${res.version}) ↗</a></div>
        </div>
      `;
    }

    // Mark locally verified so it turns status 2 (Linked)
    LiveVerifier.markVerifiedLocally(qid, osmRef, featureName);

    // Update in-memory item
    if (selectedItem && `Q${selectedItem[0]}` === qid) {
      selectedItem[4] = 2; // Linked
      selectedItem[8] = osmRef;
    }

    // Refresh stats & re-render inspector with linked state
    renderSummaryStats();
    if (viewportStatsEnabled) {
      computeViewportStats();
    }
    if (selectedItem && `Q${selectedItem[0]}` === qid) {
      selectItem(selectedItem);
    }

    if (callback) callback(res);
  } catch (err) {
    console.error("Direct link error:", err);
    feedbackEl.className = "verify-feedback error";

    if (err.message === "AUTH_EXPIRED" || err.message === "NOT_AUTHENTICATED") {
      feedbackEl.innerHTML = `⚠️ ${t.needLoginToLink} <button class="btn btn-verify" onclick="OsmAuth.startLogin()" style="margin-top: 4px;">${t.loginOsm}</button>`;
    } else {
      feedbackEl.innerText = `❌ ${t.linkError} ${err.message}`;
    }
  }
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
      const btnDirectLink = document.getElementById("btn-direct-link");
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

