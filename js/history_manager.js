/**
 * History & Activity Page Manager.
 * Shows what has been done: all OSM changesets created, features linked,
 * search, filters, export to CSV/JSON, and interactive map navigation.
 */

const HistoryManager = {
  activeTab: "osm", // "osm" | "wikidata" | "fixes" (reverse-mode OSM tag repairs)
  activeFilter: "all", // "all", "batch", "single"
  searchQuery: "",

  /** Batches are hard-capped at this many items (see WikidataEdit / BatchManager). */
  BATCH_CAP: 25,
  /** Above this many edits in one local day the pace panel suggests a pause. */
  PACE_SOFT_LIMIT: 100,
  PACE_DAYS: 7,

  /**
   * True for OSM changesets made by the reverse-mode tag repair. Records saved
   * before `isRepair` existed are recognised by their default comment.
   */
  isRepairRecord(cs) {
    if (!cs) return false;
    if (cs.isRepair) return true;
    return !cs.isBatch && /^(Update|Migrate|Remove invalid) \S*wikidata tag\b/.test(cs.comment || "");
  },

  /** Local calendar day key (YYYY-MM-DD) for a timestamp. */
  _dayKey(ts) {
    const d = new Date(ts);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  },

  /**
   * Edits per local day for the last PACE_DAYS days (oldest first, today last).
   * An OSM changeset counts its elements; a Wikidata record is one statement.
   *
   * @returns {{days: Array<{key: string, osm: number, wd: number, total: number}>,
   *            today: {key: string, osm: number, wd: number, total: number}, batchesToday: number}}
   */
  computePace(osmHistory = [], wdHistory = [], now = Date.now()) {
    const days = [];
    const byKey = new Map();
    const base = new Date(now);
    for (let i = this.PACE_DAYS - 1; i >= 0; i--) {
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() - i, 12);
      const day = { key: this._dayKey(d.getTime()), osm: 0, wd: 0, total: 0 };
      days.push(day);
      byKey.set(day.key, day);
    }
    const todayKey = days[days.length - 1].key;
    let batchesToday = 0;

    for (const cs of osmHistory) {
      const day = byKey.get(this._dayKey(cs.timestamp));
      if (!day) continue;
      const n = cs.itemCount || (cs.items ? cs.items.length : 1);
      day.osm += n;
      day.total += n;
      if (cs.isBatch && day.key === todayKey) batchesToday++;
    }
    const wdBatchesToday = new Set();
    for (const rec of wdHistory) {
      const day = byKey.get(this._dayKey(rec.timestamp));
      if (!day) continue;
      day.wd += 1;
      day.total += 1;
      if (rec.batchId && day.key === todayKey) wdBatchesToday.add(rec.batchId);
    }
    batchesToday += wdBatchesToday.size;

    return { days, today: days[days.length - 1], batchesToday };
  },

  renderPace() {
    const box = document.getElementById("history-pace");
    if (!box) return;
    const t = TRANSLATIONS[window.currentLang || "ar"];
    const osmHistory = OsmAuth.getChangesetHistory();
    const wdHistory = typeof WikidataEdit !== "undefined" ? WikidataEdit.getEditHistory() : [];
    const pace = this.computePace(osmHistory, wdHistory);
    const fill = (tpl, values) => String(tpl || "").replace(/\{(\w+)\}/g, (m, k) => (k in values ? values[k] : m));

    const todayEl = document.getElementById("history-pace-today-val");
    if (todayEl) todayEl.textContent = pace.today.total.toLocaleString();
    const breakdown = document.getElementById("history-pace-breakdown");
    if (breakdown) {
      breakdown.textContent = fill(t.histPaceBreakdown, {
        osm: pace.today.osm, wd: pace.today.wd, batches: pace.batchesToday, cap: this.BATCH_CAP,
      });
    }
    const high = pace.today.total > this.PACE_SOFT_LIMIT;
    box.classList.toggle("is-high", high);
    const hint = document.getElementById("history-pace-hint");
    if (hint) {
      hint.textContent = high
        ? fill(t.histPaceHigh, { n: pace.today.total })
        : fill(t.histPaceHint, { cap: this.BATCH_CAP });
    }

    const svg = document.getElementById("history-pace-chart");
    if (!svg) return;
    const NS = "http://www.w3.org/2000/svg";
    const W = 20, BAR = 14, H = 32;
    const max = Math.max(1, ...pace.days.map((d) => d.total));
    svg.textContent = "";
    svg.setAttribute("viewBox", `0 0 ${W * pace.days.length} ${H}`);
    const locale = window.currentLang === "ar" ? "ar-SA" : "en-US";
    pace.days.forEach((day, i) => {
      const h = day.total === 0 ? 1 : Math.max(3, Math.round((day.total / max) * (H - 2)));
      const rect = document.createElementNS(NS, "rect");
      rect.setAttribute("x", String(i * W + (W - BAR) / 2));
      rect.setAttribute("y", String(H - h));
      rect.setAttribute("width", String(BAR));
      rect.setAttribute("height", String(h));
      rect.setAttribute("rx", "2");
      rect.setAttribute("class", `pace-bar${i === pace.days.length - 1 ? " is-today" : ""}${day.total === 0 ? " is-empty" : ""}`);
      rect.dataset.day = day.key;
      rect.dataset.total = String(day.total);
      const title = document.createElementNS(NS, "title");
      const [y, m, d] = day.key.split("-").map(Number);
      const label = new Date(y, m - 1, d).toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric" });
      title.textContent = fill(t.histPaceDayTitle, { date: label, n: day.total });
      rect.appendChild(title);
      svg.appendChild(rect);
    });
    svg.setAttribute("aria-label", fill(t.histPaceChartLabel, {
      list: pace.days.map((d) => `${d.key}: ${d.total}`).join(", "),
    }));
  },

  setTab(tab) {
    this.activeTab = ["osm", "wikidata", "fixes"].includes(tab) ? tab : "osm";
    document.querySelectorAll(".history-tab-btn").forEach((btn) => {
      const on = btn.dataset.tab === this.activeTab;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-selected", String(on));
    });
    this.render();
  },

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
    const wdHistory = typeof WikidataEdit !== "undefined" ? WikidataEdit.getEditHistory() : [];
    let totalItems = wdHistory.length;
    history.forEach(cs => {
      totalItems += (cs.itemCount || (cs.items ? cs.items.length : 1));
    });

    const badges = document.querySelectorAll(".history-counter");
    badges.forEach(badge => {
      badge.innerText = history.length + wdHistory.length;
    });

    const totalBadges = document.querySelectorAll(".history-items-counter");
    totalBadges.forEach(b => {
      b.innerText = totalItems;
    });
  },

  render() {
    this.renderPace();
    if (this.activeTab === "wikidata") {
      const wdHistory = typeof WikidataEdit !== "undefined" ? WikidataEdit.getEditHistory() : [];
      this.renderWikidataKpis(wdHistory);
      this.renderWikidataList(wdHistory);
    } else {
      // "osm" = linking changesets; "fixes" = reverse-mode tag repairs.
      const wantRepairs = this.activeTab === "fixes";
      const history = OsmAuth.getChangesetHistory().filter((cs) => this.isRepairRecord(cs) === wantRepairs);
      this.renderKpis(history);
      this.renderList(history);
    }
  },

  renderWikidataKpis(wdHistory) {
    const csCountEl = document.getElementById("history-kpi-changesets");
    if (csCountEl) csCountEl.innerText = wdHistory.length.toLocaleString();

    const elemCountEl = document.getElementById("history-kpi-elements");
    if (elemCountEl) elemCountEl.innerText = wdHistory.length.toLocaleString();

    const batchCountEl = document.getElementById("history-kpi-batch");
    if (batchCountEl) {
      const uniqueBatches = new Set(wdHistory.map(h => h.batchId)).size;
      batchCountEl.innerText = `${uniqueBatches} (Batches)`;
    }

    const singleCountEl = document.getElementById("history-kpi-single");
    if (singleCountEl) singleCountEl.innerText = `${wdHistory.length} (Statements)`;
  },

  renderWikidataList(wdHistory) {
    const container = document.getElementById("history-timeline-container");
    const emptyState = document.getElementById("history-empty-state");

    if (!container) return;

    let filtered = wdHistory.filter(h => {
      if (this.searchQuery) {
        const q = this.searchQuery.toLowerCase().trim();
        return (h.qid || "").toLowerCase().includes(q) ||
               (h.osmId || "").includes(q) ||
               (h.batchId || "").toLowerCase().includes(q);
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

    container.innerHTML = filtered.map(it => {
      const date = new Date(it.timestamp);
      const formattedDate = date.toLocaleDateString(window.currentLang === "ar" ? "ar-SA" : "en-US", {
        year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
      });

      const egUrl = `https://editgroups.toolforge.org/b/CB/${it.batchId}/`;
      const wdUrl = `https://www.wikidata.org/wiki/${it.qid}`;
      const osmUrl = `https://www.openstreetmap.org/${it.osmType}/${it.osmId}`;

      return `
        <div class="history-card" data-qid="${escapeHtml(it.qid)}">
          <div class="history-card-header">
            <div class="history-header-left">
              <a href="${escapeHtml(wdUrl)}" target="_blank" rel="noopener" class="history-cs-link">
                🏛️ ${escapeHtml(it.qid)} ↗
              </a>
              <span class="history-type-pill batch">
                <a href="${escapeHtml(egUrl)}" target="_blank" rel="noopener" class="link-plain">
                  📦 EditGroups: <code>${escapeHtml(it.batchId)}</code> ↗
                </a>
              </span>
              <span class="history-date">${formattedDate}</span>
            </div>
            <div class="history-user-tag">
              👤 ${escapeHtml(it.user || 'Wikidata Mapper')}
            </div>
          </div>

          <div class="history-items-container">
            <div class="history-item-subrow">
              <div class="history-sub-name">
                <strong>${escapeHtml(it.property)} (${escapeHtml(it.osmType)} backlink)</strong>
              </div>
              <div class="history-sub-links">
                <a href="${escapeHtml(wdUrl)}" target="_blank" rel="noopener" class="qid-link"><code>${escapeHtml(it.qid)}</code> ↗</a>
                <span class="batch-sep">➔</span>
                <a href="${escapeHtml(osmUrl)}" target="_blank" rel="noopener" class="osm-link"><code>${escapeHtml(it.osmType)}/${escapeHtml(it.osmId)}</code> ↗</a>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join("");
  },

  renderKpis(history) {
    const t = TRANSLATIONS[window.currentLang || "ar"];
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

      const isRepair = this.isRepairRecord(cs);
      const typeBadge = isRepair
        ? `<span class="history-type-pill repair">🛠️ ${t.histRepairPill || 'Repair'}${cs.repairType ? ` (${escapeHtml(cs.repairType)})` : ''}</span>`
        : cs.isBatch
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
              <strong>${escapeHtml(it.name || it.qid)}</strong>
            </div>
            <div class="history-sub-links">
              <a href="${escapeHtml(wdUrl)}" target="_blank" rel="noopener" class="qid-link"><code>${escapeHtml(it.qid)}</code> ↗</a>
              <span class="batch-sep">➔</span>
              <a href="${escapeHtml(osmUrl)}" target="_blank" rel="noopener" class="osm-link"><code>${escapeHtml(it.osmRef)}</code> ${it.version ? `(v${escapeHtml(it.version)})` : ''} ↗</a>
            </div>
            <div class="history-sub-actions">
              ${hasCoords ? `<button class="btn btn-history-zoom" data-lat="${Number(it.lat)}" data-lon="${Number(it.lon)}" data-qid="${escapeHtml(it.qid)}">📍 ${t.btnShowOnMap || 'Show on Map'}</button>` : ''}
            </div>
          </div>
        `;
      }).join("");

      return `
        <div class="history-card" data-csid="${escapeHtml(cs.changesetId)}">
          <div class="history-card-header">
            <div class="history-header-left">
              <a href="${escapeHtml(cs.changesetUrl)}" target="_blank" rel="noopener" class="history-cs-link">
                #${escapeHtml(cs.changesetId)} ↗
              </a>
              ${typeBadge}
              <span class="history-date">${formattedDate}</span>
            </div>
            <div class="history-user-tag">
              👤 ${escapeHtml(cs.user || 'OSM Mapper')}
            </div>
          </div>
          
          <div class="history-comment-bubble">
            <span class="comment-quote-icon">💬</span>
            <span class="comment-text">${escapeHtml(cs.comment || '(No comment)')}</span>
          </div>

          <div class="history-items-container">
            <div class="history-items-header">
              <span>${isRepair ? (t.histRepairedElements || 'Repaired elements') : (t.statTotalLinkedItems || 'Linked Elements')} (${(cs.items || []).length}):</span>
            </div>
            <div class="history-items-list">
              ${itemsHtml}
            </div>
          </div>
        </div>
      `;
    }).join("");

    container.querySelectorAll(".btn-history-zoom").forEach(btn => {
      btn.onclick = () => this.zoomToItem(Number(btn.dataset.lat), Number(btn.dataset.lon), btn.dataset.qid);
    });
  },

  zoomToItem(lat, lon, qid) {
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

    // Tabs: OSM changesets | Wikidata edits | Reverse fixes
    document.querySelectorAll(".history-tab-btn").forEach((btn) => {
      btn.onclick = () => this.setTab(btn.dataset.tab);
    });

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
      if (modal && getComputedStyle(modal).display !== "none") {
        this.render();
      }
    });
  }
};

if (typeof window !== "undefined") {
  window.HistoryManager = HistoryManager;
}

