/**
 * Changeset Batch & Staging Manager.
 * Allows users to freely stage multiple candidate items and upload them together
 * in a single, well-documented OSM Changeset.
 */

const BatchManager = {
  STORAGE_KEY: "osm_wd_staged_batch",

  getStagedItems() {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.warn("Error reading staged batch:", e);
      return [];
    }
  },

  saveStagedItems(items) {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(items));
      this.updateBadgeCount();
      window.dispatchEvent(new CustomEvent("osm-batch-updated", { detail: items }));
    } catch (e) {
      console.error("Failed to save staged batch:", e);
    }
  },

  isStaged(qid) {
    const cleanQid = qid.startsWith("Q") ? qid : `Q${qid}`;
    const items = this.getStagedItems();
    return items.some(it => it.qid === cleanQid);
  },

  add(item, candidateRef, candidateName = "", extraTags = {}, countryCode = "") {
    const qid = `Q${item[0]}`;
    if (this.isStaged(qid)) {
      return false; // already added
    }

    const nameAr = item[5] || "";
    const nameEn = item[6] || "";
    let displayName = candidateName || nameAr || nameEn || qid;
    if (nameAr && nameEn && nameAr !== nameEn && !candidateName) {
      displayName = `${nameAr} (${nameEn})`;
    }

    const stagedItem = {
      qid: qid,
      osmRef: candidateRef || item[8],
      nameAr: nameAr,
      nameEn: nameEn,
      displayName: displayName,
      category: item[3],
      lat: item[1],
      lon: item[2],
      country: countryCode || (window.currentCountry || "sa"),
      extraTags: extraTags || {},
      stagedAt: Date.now()
    };

    if (!stagedItem.osmRef) {
      alert(window.currentLang === "ar" ? "لا يمكن إضافة عنصر بدون تحديد عنصر OSM المرشح للربط." : "Cannot add to batch without a candidate OSM element reference.");
      return false;
    }

    const items = this.getStagedItems();
    items.push(stagedItem);
    this.saveStagedItems(items);
    return true;
  },

  remove(qid) {
    const cleanQid = qid.startsWith("Q") ? qid : `Q${qid}`;
    const items = this.getStagedItems().filter(it => it.qid !== cleanQid);
    this.saveStagedItems(items);
  },

  clear() {
    this.saveStagedItems([]);
  },

  count() {
    return this.getStagedItems().length;
  },

  updateBadgeCount() {
    const count = this.count();
    const badges = document.querySelectorAll(".batch-counter");
    badges.forEach(badge => {
      badge.innerText = count;
      if (count > 0) {
        badge.classList.add("has-items");
      } else {
        badge.classList.remove("has-items");
      }
    });

    const floatingBtn = document.getElementById("floating-batch-btn");
    if (floatingBtn) {
      if (count > 0) {
        floatingBtn.style.display = "flex";
      } else {
        floatingBtn.style.display = "none";
      }
    }
  },

  openModal() {
    const modal = document.getElementById("batch-modal");
    if (!modal) return;

    this.renderModalContent();
    modal.style.display = "flex";
  },

  closeModal() {
    const modal = document.getElementById("batch-modal");
    if (modal) modal.style.display = "none";
  },

  renderModalContent() {
    const items = this.getStagedItems();
    const t = TRANSLATIONS[window.currentLang || "ar"];
    const country = window.currentCountry || "sa";

    const countEl = document.getElementById("batch-modal-count");
    if (countEl) countEl.innerText = items.length;

    const listContainer = document.getElementById("batch-items-list");
    const emptyState = document.getElementById("batch-modal-empty");
    const configSection = document.getElementById("batch-config-section");
    const uploadBtn = document.getElementById("btn-batch-upload-confirm");
    const clearBtn = document.getElementById("btn-batch-clear-all");

    if (items.length === 0) {
      if (listContainer) listContainer.style.display = "none";
      if (configSection) configSection.style.display = "none";
      if (emptyState) emptyState.style.display = "flex";
      if (uploadBtn) uploadBtn.disabled = true;
      if (clearBtn) clearBtn.disabled = true;
      return;
    }

    if (emptyState) emptyState.style.display = "none";
    if (listContainer) listContainer.style.display = "flex";
    if (configSection) configSection.style.display = "block";
    if (uploadBtn) uploadBtn.disabled = false;
    if (clearBtn) clearBtn.disabled = false;

    // Render items list
    listContainer.innerHTML = items.map((it, idx) => {
      const ref = OsmAuth.parseOsmRef(it.osmRef);
      const oType = ref ? ref.type : "node";
      const oId = ref ? ref.id : it.osmRef;
      const osmUrl = `https://www.openstreetmap.org/${oType}/${oId}`;
      const wdUrl = `https://www.wikidata.org/wiki/${it.qid}`;

      return `
        <div class="batch-item-row" data-qid="${it.qid}">
          <div class="batch-item-left">
            <span class="batch-index-badge">${idx + 1}</span>
            <div class="batch-item-info">
              <div class="batch-item-title">${it.displayName}</div>
              <div class="batch-item-sub">
                <a href="${wdUrl}" target="_blank" rel="noopener" class="qid-link"><code>${it.qid}</code> ↗</a>
                <span class="batch-sep">➔</span>
                <a href="${osmUrl}" target="_blank" rel="noopener" class="osm-link"><code>${it.osmRef}</code> ↗</a>
                ${it.extraTags?.wikipedia ? `<span class="batch-tag-chip">wiki: ${it.extraTags.wikipedia}</span>` : ""}
              </div>
            </div>
          </div>
          <button class="btn-remove-batch-item" onclick="BatchManager.handleRemoveClick('${it.qid}')" title="${t.btnRemoveFromBatch || 'Remove'}">&times;</button>
        </div>
      `;
    }).join("");

    // Auto-generate suggested comment
    const commentInput = document.getElementById("batch-comment-input");
    if (commentInput) {
      commentInput.value = OsmAuth.generateChangesetComment(items, country);
      this.updateCommentLength();
    }

    // Reset progress container
    const progressBox = document.getElementById("batch-progress-box");
    if (progressBox) progressBox.style.display = "none";
  },

  handleRemoveClick(qid) {
    this.remove(qid);
    this.renderModalContent();
    // Also re-render inspector drawer if currently showing this item
    if (window.selectedItem && `Q${window.selectedItem[0]}` === qid) {
      if (typeof window.selectItem === "function") {
        window.selectItem(window.selectedItem);
      }
    }
  },

  updateCommentLength() {
    const input = document.getElementById("batch-comment-input");
    const countEl = document.getElementById("batch-comment-char-count");
    if (input && countEl) {
      countEl.innerText = input.value.length;
    }
  },

  appendPresetChip(text) {
    const input = document.getElementById("batch-comment-input");
    if (!input) return;
    const current = input.value.trim();
    if (!current.includes(text)) {
      input.value = current ? `${current} ${text}` : text;
      this.updateCommentLength();
    }
  },

  async executeUpload() {
    const t = TRANSLATIONS[window.currentLang || "ar"];

    if (!OsmAuth.isLoggedIn()) {
      const doLogin = confirm(`${t.needLoginToLink}\n\n${window.currentLang === "ar" ? "هل ترغب في تسجيل الدخول الآن عبر OpenStreetMap؟" : "Would you like to log in with OpenStreetMap now?"}`);
      if (doLogin) {
        OsmAuth.startLogin();
      }
      return;
    }

    const items = this.getStagedItems();
    if (items.length === 0) return;

    const commentInput = document.getElementById("batch-comment-input");
    const comment = commentInput ? commentInput.value.trim() : "";

    const confirmMsg = window.currentLang === "ar"
      ? `هل تؤكد رفع مجموعة التعديل بعدد (${items.length}) عناصر إلى خوادم OpenStreetMap؟`
      : `Confirm uploading changeset with (${items.length}) items to OpenStreetMap?`;

    if (!confirm(confirmMsg)) return;

    // Show Progress Box
    const progressBox = document.getElementById("batch-progress-box");
    const progressText = document.getElementById("batch-progress-text");
    const progressBar = document.getElementById("batch-progress-bar-fill");
    const uploadBtn = document.getElementById("btn-batch-upload-confirm");
    const clearBtn = document.getElementById("btn-batch-clear-all");

    if (progressBox) progressBox.style.display = "block";
    if (uploadBtn) uploadBtn.disabled = true;
    if (clearBtn) clearBtn.disabled = true;

    try {
      const res = await OsmAuth.linkOsmElementsBatch(
        items,
        comment,
        window.currentCountry || "sa",
        (prog) => {
          if (progressText) progressText.innerText = prog.message;
          if (progressBar) {
            const pct = Math.round((prog.current / prog.total) * 100);
            progressBar.style.width = `${pct}%`;
          }
        }
      );

      // Mark all successful items as locally verified and update dataset status
      for (let r of res.results) {
        if (r.success) {
          LiveVerifier.markVerifiedLocally(r.qid, r.osmRef, r.name);
          if (typeof window.updateDatasetItemStatus === "function") {
            window.updateDatasetItemStatus(r.qid, 2, r.osmRef);
          }
        }
      }

      // Clear batch
      this.clear();

      // Refresh map & stats immediately so pushed features disappear from map
      if (typeof window.refreshViewAfterPush === "function") {
        window.refreshViewAfterPush();
      } else {
        if (typeof window.renderSummaryStats === "function") window.renderSummaryStats();
        if (typeof window.applyFilters === "function") window.applyFilters();
        if (window.selectedItem && typeof window.selectItem === "function") {
          window.selectItem(window.selectedItem, null, true);
        }
      }

      // Show completion celebration in modal
      if (progressBox) {
        progressBox.innerHTML = `
          <div class="batch-success-box">
            <div class="batch-success-icon">🎉</div>
            <h4>${t.batchSuccessTitle || "Changeset Uploaded Successfully!"}</h4>
            <p>${t.batchSuccessMessage || "All items were linked in a single changeset on OSM."}</p>
            <div class="batch-success-links">
              <a href="${res.changesetUrl}" target="_blank" rel="noopener" class="btn btn-direct-link">
                OSM Changeset #${res.changesetId} ↗
              </a>
              <button class="btn btn-secondary-batch" onclick="BatchManager.closeModal(); HistoryManager.openModal();">
                📜 ${t.viewChangesetInHistory || "View in History"}
              </button>
            </div>
            <div class="batch-success-stats">
              <span>✓ ${res.successCount} ${window.currentLang === "ar" ? "عنصر تم ربطه بنجاح" : "items linked successfully"}</span>
              ${res.failCount > 0 ? `<span style="color: var(--color-missing);">✕ ${res.failCount} failed</span>` : ""}
            </div>
          </div>
        `;
      }

    } catch (err) {
      console.error("Batch upload failed:", err);
      if (progressText) {
        progressText.innerHTML = `<span style="color: var(--color-missing);">❌ Error: ${err.message}</span>`;
      }
      if (uploadBtn) uploadBtn.disabled = false;
      if (clearBtn) clearBtn.disabled = false;
    }
  },

  init() {
    this.updateBadgeCount();

    // Wire Batch open buttons
    const openBtns = document.querySelectorAll(".btn-open-batch-modal");
    openBtns.forEach(btn => {
      btn.onclick = () => this.openModal();
    });

    const closeBtn = document.getElementById("btn-close-batch-modal");
    if (closeBtn) {
      closeBtn.onclick = () => this.closeModal();
    }

    const clearAllBtn = document.getElementById("btn-batch-clear-all");
    if (clearAllBtn) {
      clearAllBtn.onclick = () => {
        const msg = window.currentLang === "ar" ? "هل ترغب في تفريغ سلة التعديلات بالكامل؟" : "Clear all items from batch queue?";
        if (confirm(msg)) {
          this.clear();
          this.renderModalContent();
          if (window.selectedItem && typeof window.selectItem === "function") {
            window.selectItem(window.selectedItem);
          }
        }
      };
    }

    const uploadBtn = document.getElementById("btn-batch-upload-confirm");
    if (uploadBtn) {
      uploadBtn.onclick = () => this.executeUpload();
    }

    const commentInput = document.getElementById("batch-comment-input");
    if (commentInput) {
      commentInput.oninput = () => this.updateCommentLength();
    }

    // Quick preset chips
    document.querySelectorAll(".batch-preset-chip").forEach(chip => {
      chip.onclick = () => {
        const val = chip.getAttribute("data-preset");
        if (val) this.appendPresetChip(val);
      };
    });

    // Listen to storage sync across tabs
    window.addEventListener("storage", (e) => {
      if (e.key === this.STORAGE_KEY) {
        this.updateBadgeCount();
      }
    });
  }
};

if (typeof window !== "undefined") {
  window.BatchManager = BatchManager;
}

