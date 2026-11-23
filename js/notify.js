/**
 * In-app notifications that replace window.alert().
 *
 * alert() blocks the map, cannot be styled or translated consistently, and gives no way to
 * retry. Notify keeps the editor in flow:
 *  - success / info: polite live region, auto-dismiss.
 *  - error: assertive (role="alert"), stays until dismissed, optional Retry action.
 * Message text is always set with textContent, so err.message and names from OSM/Wikidata
 * can be passed in safely.
 */
const Notify = (() => {
  const TIMEOUT_MS = { success: 6000, info: 6000, error: 0 };
  const MAX_VISIBLE = 4;

  function region() {
    let el = document.getElementById("toast-region");
    if (!el) {
      el = document.createElement("div");
      el.id = "toast-region";
      el.className = "toast-region";
      document.body.appendChild(el);
    }
    return el;
  }

  function dismiss(toast) {
    if (!toast || !toast.isConnected) return;
    clearTimeout(toast._timer);
    toast.remove();
  }

  /**
   * @param {"success"|"error"|"info"} kind
   * @param {string} message  plain text; newlines are preserved
   * @param {{action?: {label: string, onClick: Function}, link?: {href: string, label: string}, timeout?: number}} [opts]
   * @returns {HTMLElement} the toast element
   */
  function show(kind, message, opts = {}) {
    const host = region();
    const toast = document.createElement("div");
    toast.className = `toast toast--${kind}`;
    toast.setAttribute("role", kind === "error" ? "alert" : "status");

    const iconName = kind === "error" ? "alert" : kind === "success" ? "check" : "info";
    if (typeof icon === "function") toast.insertAdjacentHTML("afterbegin", icon(iconName));

    const body = document.createElement("div");
    body.className = "toast-body";
    const text = document.createElement("p");
    text.className = "toast-text";
    text.textContent = String(message ?? "");
    body.appendChild(text);

    const safeHref = opts.link && typeof safeUrl === "function" ? safeUrl(opts.link.href) : "";
    if (opts.action || safeHref) {
      const row = document.createElement("div");
      row.className = "toast-actions";
      if (opts.action) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "toast-action";
        btn.textContent = opts.action.label;
        btn.addEventListener("click", () => {
          dismiss(toast);
          opts.action.onClick();
        });
        row.appendChild(btn);
      }
      if (safeHref) {
        const a = document.createElement("a");
        a.className = "toast-link";
        a.href = safeHref;
        a.target = "_blank";
        a.rel = "noopener";
        a.textContent = `${opts.link.label} ↗`;
        row.appendChild(a);
      }
      body.appendChild(row);
    }
    toast.appendChild(body);

    const close = document.createElement("button");
    close.type = "button";
    close.className = "toast-close";
    close.setAttribute("aria-label", typeof i18n === "function" ? i18n("dismiss") : "Dismiss");
    close.textContent = "×";
    close.addEventListener("click", () => dismiss(toast));
    toast.appendChild(close);

    host.appendChild(toast);
    while (host.children.length > MAX_VISIBLE) dismiss(host.firstElementChild);

    const timeout = opts.timeout ?? TIMEOUT_MS[kind] ?? 0;
    if (timeout > 0) toast._timer = setTimeout(() => dismiss(toast), timeout);
    return toast;
  }

  return {
    success: (msg, opts) => show("success", msg, opts),
    error: (msg, opts) => show("error", msg, opts),
    info: (msg, opts) => show("info", msg, opts),
    dismiss,
    clear() {
      const host = document.getElementById("toast-region");
      if (host) [...host.children].forEach(dismiss);
    },
  };
})();

window.Notify = Notify;
