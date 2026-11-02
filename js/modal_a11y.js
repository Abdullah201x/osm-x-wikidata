/**
 * Modal accessibility: focus management for every `.modal-overlay` dialog.
 *
 * The app opens and closes modals by toggling `style.display` from many call
 * sites, so instead of touching each one this module watches the overlays and,
 * when one becomes visible, moves focus into it, keeps Tab inside the topmost
 * dialog, and gives focus back to the opener when it closes.
 * Escape handling stays in app.js.
 */

const ModalA11y = (() => {
  const FOCUSABLE = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled]):not([type='hidden'])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
  ].join(",");

  // Open overlays, oldest first; the last entry is the topmost dialog.
  const stack = [];
  const openers = new Map();
  let observer = null;

  const isOpen = (overlay) => getComputedStyle(overlay).display !== "none";

  function isVisible(el, overlay) {
    for (let node = el; node && node !== overlay; node = node.parentElement) {
      if (node.hidden || getComputedStyle(node).display === "none") return false;
    }
    return true;
  }

  function focusables(overlay) {
    return Array.from(overlay.querySelectorAll(FOCUSABLE)).filter((el) => isVisible(el, overlay));
  }

  function handleOpen(overlay) {
    if (stack.includes(overlay)) return;
    const active = document.activeElement;
    openers.set(overlay, active && active !== document.body && !overlay.contains(active) ? active : null);
    stack.push(overlay);

    const card = overlay.querySelector(".modal-card, .lightbox-content") || overlay;
    if (!card.hasAttribute("tabindex")) card.setAttribute("tabindex", "-1");
    const [first] = focusables(overlay);
    (first || card).focus();
  }

  function handleClose(overlay) {
    const index = stack.indexOf(overlay);
    if (index === -1) return;
    stack.splice(index, 1);
    const opener = openers.get(overlay);
    openers.delete(overlay);
    // Only restore when focus was inside the dialog (or lost); a modal that
    // closed because another one took over must not steal focus back.
    const active = document.activeElement;
    const focusLost = !active || active === document.body || overlay.contains(active);
    if (opener && focusLost && document.contains(opener)) opener.focus();
  }

  function sync(overlay) {
    if (isOpen(overlay)) handleOpen(overlay);
    else handleClose(overlay);
  }

  function onKeydown(event) {
    if (event.key !== "Tab" || stack.length === 0) return;
    const overlay = stack[stack.length - 1];
    const items = focusables(overlay);
    if (items.length === 0) {
      event.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (!overlay.contains(active)) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function init() {
    if (observer) return;
    const overlays = Array.from(document.querySelectorAll(".modal-overlay"));
    observer = new MutationObserver((records) => {
      for (const record of records) sync(record.target);
    });
    for (const overlay of overlays) {
      observer.observe(overlay, { attributes: true, attributeFilter: ["style", "class", "hidden"] });
      sync(overlay);
    }
    document.addEventListener("keydown", onKeydown);
  }

  function destroy() {
    if (observer) observer.disconnect();
    observer = null;
    document.removeEventListener("keydown", onKeydown);
    stack.length = 0;
    openers.clear();
  }

  return { init, destroy };
})();

window.ModalA11y = ModalA11y;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", ModalA11y.init);
} else {
  ModalA11y.init();
}
