/**
 * History & Activity Page Manager.
 * Shows what has been done: all OSM changesets created, features linked,
 * search, filters, export to CSV/JSON, and interactive map navigation.
 */

const HistoryManager = {
  activeFilter: "all", // "all", "batch", "single"
  searchQuery: "",

  openModal() {
    const modal = document.getElementById("history-page-modal");
    if (!modal) return;
    this.render();
    modal.style.display = "flex";
  },

  closeModal() {
    const modal = document.getElementById("history-page-modal");
    if (modal) modal.style.display = "none";
  },

  updateBadgeCount() {
    const history = OsmAuth.getChangesetHistory();
    let totalItems = 0;
    history.forEach(cs => {
      totalItems += (cs.itemCount || (cs.items ? cs.items.length : 1));
    });

    const badges = document.querySelectorAll(".history-counter");
    badges.forEach(badge => {
      badge.innerText = history.length;
    });

    const totalBadges = document.querySelectorAll(".history-items-counter");
    totalBadges.forEach(b => {
      b.innerText = totalItems;
    });
  },

  render() {
    const history = OsmAuth.getChangesetHistory();
    const t = TRANSLATIONS[window.currentLang || "ar"];

    this.renderKpis(history);
    this.renderList(history);
  },

  renderKpis(history) {
    let totalChangesets = history.length;
    let totalElements = 0;
    let batchCount = 0;
    let singleCount = 0;
    const countryCounts = {};

    history.forEach(cs => {
      const count = cs.itemCount || (cs.items ? cs.items.length : 1);
      totalElements += count;
      if (cs.isBatch) {
        batchCount++;
      } else {
        singleCount++;
      }
      const c = (cs.country || "gcc").toUpperCase();
      countryCounts[c] = (countryCounts[c] || 0) + count;
    });

    const csCountEl = document.getElementById("history-kpi-changesets");
    if (csCountEl) csCountEl.innerText = totalChangesets.toLocaleString();

    const elemCountEl = document.getElementById("history-kpi-elements");
    if (elemCountEl) elemCountEl.innerText = totalElements.toLocaleString();

    const batchCountEl = document.getElementById("history-kpi-batch");
    if (batchCountEl) batchCountEl.innerText = `${batchCount} (${t.statBatchChangesets || 'Batch'})`;

    const singleCountEl = document.getElementById("history-kpi-single");
    if (singleCountEl) singleCountEl.innerText = `${singleCount} (${t.statSingleChangesets || 'Single'})`;
  },

  renderList(history) {
    const container = document.getElementById("history-timeline-container");
    const emptyState = document.getElementById("history-empty-state");
    const t = TRANSLATIONS[window.currentLang || "ar"];

    if (!container) return;

    // Filter and search
    let filtered = history.filter(cs => {
      if (this.activeFilter === "batch" && !cs.isBatch) return false;
      if (this.activeFilter === "single" && cs.isBatch) return false;

      if (this.searchQuery) {
        const q = this.searchQuery.toLowerCase().trim();
        const matchesComment = (cs.comment || "").toLowerCase().includes(q);
        const matchesId = String(cs.changesetId).includes(q);
        const matchesItem = (cs.items || []).some(it => {
          return (it.name || "").toLowerCase().includes(q) ||
                 (it.qid || "").toLowerCase().includes(q) ||
                 (it.osmRef || "").toLowerCase().includes(q);
        });
        return matchesComment || matchesId || matchesItem;
      }
      return true;
    });

    if (filtered.length === 0) {
      container.style.display = "none";
      if (emptyState) emptyState.style.display = "flex";
      return;
    }

    if (emptyState) emptyState.style.display = "none";
    container.style.display = "flex";

    container.innerHTML = filtered.map((cs) => {
      const date = new Date(cs.timestamp);
      const formattedDate = date.toLocaleDateString(window.currentLang === "ar" ? "ar-SA" : "en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });

      const typeBadge = cs.isBatch
        ? `<span class="history-type-pill batch">📦 ${t.statBatchChangesets || 'Batch'} (${cs.itemCount || cs.items.length})</span>`
        : `<span class="history-type-pill single">⚡ ${t.statSingleChangesets || 'Single'}</span>`;

      const itemsHtml = (cs.items || []).map(it => {
        const ref = OsmAuth.parseOsmRef(it.osmRef);
        const oType = ref ? ref.type : "node";
        const oId = ref ? ref.id : it.osmRef;
        const osmUrl = `https://www.openstreetmap.org/${oType}/${oId}`;
        const wdUrl = `https://www.wikidata.org/wiki/${it.qid}`;

        const hasCoords = it.lat !== undefined && it.lon !== undefined;

        return `
          <div class="history-item-subrow">
            <div class="history-sub-name">
              <strong>${it.name || it.qid}</strong>
            </div>
            <div class="history-sub-links">
              <a href="${wdUrl}" target="_blank" rel="noopener" class="qid-link"><code>${it.qid}</code> ↗</a>
              <span class="batch-sep">➔</span>
              <a href="${osmUrl}" target="_blank" rel="noopener" class="osm-link"><code>${it.osmRef}</code> ${it.version ? `(v${it.version})` : ''} ↗</a>
            </div>
            <div class="history-sub-actions">
              ${hasCoords ? `<button class="btn btn-history-zoom" onclick="HistoryManager.zoomToItem(${it.lat}, ${it.lon}, '${it.qid}', '${cs.country}')">📍 ${t.btnShowOnMap || 'Show on Map'}</button>` : ''}
            </div>
          </div>
        `;
      }).join("");

      return `
        <div class="history-card" data-csid="${cs.changesetId}">
          <div class="history-card-header">
            <div class="history-header-left">
              <a href="${cs.changesetUrl}" target="_blank" rel="noopener" class="history-cs-link">
                #${cs.changesetId} ↗
              </a>
              ${typeBadge}
              <span class="history-date">${formattedDate}</span>
            </div>
            <div class="history-user-tag">
              👤 ${cs.user || 'OSM Mapper'}
            </div>
          </div>
          
          <div class="history-comment-bubble">
            <span class="comment-quote-icon">💬</span>
            <span class="comment-text">${cs.comment || '(No comment)'}</span>
          </div>

          <div class="history-items-container">
            <div class="history-items-header">
              <span>${t.statTotalLinkedItems || 'Linked Elements'} (${(cs.items || []).length}):</span>
            </div>
            <div class="history-items-list">
              ${itemsHtml}
            </div>
          </div>
        </div>
      `;
    }).join("");
  },

  zoomToItem(lat, lon, qid, country) {
    this.closeModal();

    if (window.MapController) {
      window.MapController.flyTo(lat, lon, 18);
    }

    // If item exists in current loaded dataset, select it
    if (window.loadedDataset && window.loadedDataset.items) {
      const rawQid = parseInt(qid.replace(/^Q/, ""), 10);
      const found = window.loadedDataset.items.find(it => it[0] === rawQid);
      if (found && typeof window.selectItem === "function") {
        window.selectItem(found);
      }
    }
  },

  init() {
    this.updateBadgeCount();

    // Wire open buttons
    const openBtns = document.querySelectorAll(".btn-open-history-modal");
    openBtns.forEach(btn => {
      btn.onclick = () => this.openModal();
    });

    const closeBtn = document.getElementById("btn-close-history-modal");
    if (closeBtn) {
      closeBtn.onclick = () => this.closeModal();
    }

    // Filter pills
    document.querySelectorAll(".history-filter-btn").forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll(".history-filter-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        this.activeFilter = btn.getAttribute("data-filter") || "all";
        this.render();
      };
    });

    // Search input
    const searchInput = document.getElementById("history-search-input");
    if (searchInput) {
      searchInput.oninput = (e) => {
        this.searchQuery = e.target.value;
        this.render();
      };
    }

    // Export CSV & JSON buttons
    const btnCsv = document.getElementById("btn-history-export-csv");
    if (btnCsv) {
      btnCsv.onclick = () => OsmAuth.exportHistoryCsv();
    }

    const btnJson = document.getElementById("btn-history-export-json");
    if (btnJson) {
      btnJson.onclick = () => OsmAuth.exportHistoryJson();
    }

    // Clear history button
    const btnClear = document.getElementById("btn-history-clear");
    if (btnClear) {
      btnClear.onclick = () => {
        const msg = window.currentLang === "ar"
          ? "هل أنت متأكد من تفريغ سجل التعديلات المحلي؟ لن يؤثر ذلك على التعديلات المنشورة في OSM."
          : "Are you sure you want to clear local changeset history? This will not affect edits on OSM.";
        if (confirm(msg)) {
          OsmAuth.clearChangesetHistory();
          this.render();
        }
      };
    }

    // Global event listener for updates
    window.addEventListener("osm-history-updated", () => {
      this.updateBadgeCount();
      const modal = document.getElementById("history-page-modal");
      if (modal && modal.style.display !== "none") {
        this.render();
      }
    });
  }
};

if (typeof window !== "undefined") {
  window.HistoryManager = HistoryManager;
}

