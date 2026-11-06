/**
 * Tag-repair review dialog (reverse mode).
 *
 * Shows the element's LIVE tags next to the proposed change (from
 * OsmAuth.previewOsmTagRepair), lets the mapper edit the changeset comment,
 * and only then calls `onConfirm(comment)` to publish. A preview whose live
 * value no longer matches the scanned dataset ("stale") or that would change
 * nothing cannot be published.
 *
 * All text goes in through textContent, so tag keys/values from OSM are never
 * parsed as HTML.
 */

const TagRepairDialog = (() => {
  const MAX_COMMENT = 255; // OSM tag values are limited to 255 characters
  let active = null; // { finish } of the open session

  const $ = (id) => document.getElementById(id);

  function fill(template, values) {
    return String(template || "").replace(/\{(\w+)\}/g, (m, key) => (key in values ? values[key] : m));
  }

  function errorText(err, t) {
    const msg = (err && err.message) || String(err);
    if (msg === "NO_CHANGES") return t.tagRepairNoChanges || msg;
    if (msg === "AUTH_EXPIRED" || msg === "NOT_AUTHENTICATED") return t.tagRepairAuthExpired || msg;
    return msg;
  }

  /** Changed rows first (in tag order), then the unchanged ones. */
  function renderDiff(tbody, diff, t) {
    tbody.textContent = "";
    const absent = t.tagRepairAbsent || "(absent)";
    const rows = [...diff.filter((r) => r.op !== "same"), ...diff.filter((r) => r.op === "same")];
    for (const row of rows) {
      const tr = document.createElement("tr");
      tr.className = `diff-${row.op}`;
      tr.dataset.key = row.key;

      const keyCell = document.createElement("td");
      const code = document.createElement("code");
      code.textContent = row.key;
      keyCell.appendChild(code);

      const beforeCell = document.createElement("td");
      beforeCell.className = "diff-before";
      beforeCell.textContent = row.before === null ? absent : row.before;
      if (row.before === null) beforeCell.classList.add("diff-absent");

      const afterCell = document.createElement("td");
      afterCell.className = "diff-after";
      afterCell.textContent = row.after === null ? absent : row.after;
      if (row.after === null) afterCell.classList.add("diff-absent");

      tr.append(keyCell, beforeCell, afterCell);
      tbody.appendChild(tr);
    }
  }

  /**
   * @param {Object} preview - from OsmAuth.previewOsmTagRepair()
   * @param {Object} opts - { t: translations, onConfirm: async (comment) => result }
   * @returns {Promise<Object|null>} onConfirm's result, or null if cancelled
   */
  function open(preview, { t = {}, onConfirm } = {}) {
    const modal = $("tag-repair-modal");
    if (!modal) return Promise.resolve(null);
    if (active) active.finish(null);

    const tbody = $("tag-repair-diff-body");
    const comment = $("tag-repair-comment");
    const counter = $("tag-repair-char-count");
    const staleBox = $("tag-repair-stale");
    const noChangeBox = $("tag-repair-nochange");
    const errorBox = $("tag-repair-error");
    const confirmBtn = $("btn-confirm-tag-repair");
    const cancelBtn = $("btn-cancel-tag-repair");
    const closeBtn = $("btn-close-tag-repair");
    const link = $("tag-repair-element-link");

    $("tag-repair-osmref").textContent = preview.osmRef;
    $("tag-repair-version").textContent = preview.version ? `${t.tagRepairVersion || "version"} ${preview.version}` : "";
    if (link) link.href = `https://www.openstreetmap.org/${preview.osmRef}`;
    renderDiff(tbody, preview.diff, t);

    staleBox.hidden = !preview.stale;
    staleBox.textContent = preview.stale
      ? fill(t.tagRepairStale, {
          tag: preview.fromTag,
          live: preview.liveValue === null ? (t.tagRepairAbsent || "(absent)") : preview.liveValue,
          expected: preview.expectedValue,
        })
      : "";
    noChangeBox.hidden = preview.stale || preview.changed;
    errorBox.hidden = true;
    errorBox.textContent = "";

    comment.value = preview.defaultComment || "";
    comment.maxLength = MAX_COMMENT;
    const updateCounter = () => { counter.textContent = String(comment.value.length); };
    updateCounter();

    const publishLabel = t.tagRepairPublish || "Publish";
    const blocked = preview.stale || !preview.changed;
    confirmBtn.textContent = publishLabel;
    confirmBtn.disabled = blocked;
    comment.disabled = blocked;

    return new Promise((resolve) => {
      let done = false;
      let busy = false;
      let observer = null;

      const finish = (value) => {
        if (done) return;
        done = true;
        if (observer) observer.disconnect();
        modal.removeEventListener("keydown", onKeydown);
        active = null;
        modal.style.display = "none";
        resolve(value);
      };
      const cancel = () => { if (!busy) finish(null); };
      const onKeydown = (e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          cancel();
        }
      };

      comment.oninput = updateCounter;
      cancelBtn.onclick = cancel;
      if (closeBtn) closeBtn.onclick = cancel;
      modal.onclick = (e) => { if (e.target === modal) cancel(); };
      modal.addEventListener("keydown", onKeydown);

      confirmBtn.onclick = async () => {
        if (busy || blocked || typeof onConfirm !== "function") return;
        busy = true;
        confirmBtn.disabled = true;
        cancelBtn.disabled = true;
        comment.disabled = true;
        confirmBtn.textContent = t.tagRepairPublishing || "Publishing...";
        errorBox.hidden = true;
        try {
          const result = await onConfirm(comment.value.trim() || preview.defaultComment);
          busy = false;
          finish(result);
        } catch (err) {
          busy = false;
          confirmBtn.disabled = false;
          cancelBtn.disabled = false;
          comment.disabled = false;
          confirmBtn.textContent = publishLabel;
          errorBox.textContent = errorText(err, t);
          errorBox.hidden = false;
          modal.style.display = "flex";
        }
      };

      active = { finish };
      modal.style.display = "flex";

      // Closed from outside (e.g. the global Escape handler hides every overlay).
      observer = new MutationObserver(() => {
        if (!busy && getComputedStyle(modal).display === "none") finish(null);
      });
      observer.observe(modal, { attributes: true, attributeFilter: ["style", "class", "hidden"] });
    });
  }

  return { open, renderDiff, MAX_COMMENT };
})();

if (typeof window !== "undefined") {
  window.TagRepairDialog = TagRepairDialog;
}
