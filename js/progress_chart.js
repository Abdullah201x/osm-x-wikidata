/**
 * Progress over time (About panel): per-country sparklines from data/progress.json,
 * written by the data pipeline (one row per country per run).
 *
 * Plain inline SVG built with DOM calls: no chart library, and geometry lives in
 * SVG attributes, so the strict CSP (no inline styles) is respected.
 */

const ProgressChart = (() => {
  const NS = "http://www.w3.org/2000/svg";
  const W = 96;
  const H = 24;
  const PAD = 2;
  // [field, label key, true when a falling value is good]
  const SERIES = [
    ["linked", "progressLinked", false],
    ["missing_backlink", "progressMissingBacklink", true],
  ];
  let cache = null;

  /** rows -> { cc: [rows oldest..newest] } */
  function groupByCountry(rows) {
    const out = {};
    for (const r of rows || []) {
      if (!r || !r.cc) continue;
      (out[r.cc] = out[r.cc] || []).push(r);
    }
    for (const cc of Object.keys(out)) out[cc].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    return out;
  }

  /** SVG polyline points for values scaled into the sparkline box. */
  function sparkPoints(values) {
    if (!values.length) return "";
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const step = values.length > 1 ? (W - 2 * PAD) / (values.length - 1) : 0;
    return values
      .map((v, i) => {
        const x = values.length > 1 ? PAD + i * step : W / 2;
        const y = max === min ? H / 2 : PAD + (H - 2 * PAD) * (1 - (v - min) / span);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }

  function sparkline(values, trendClass, label) {
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("class", `progress-spark ${trendClass}`);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", label);
    const line = document.createElementNS(NS, "polyline");
    line.setAttribute("points", sparkPoints(values));
    line.setAttribute("fill", "none");
    svg.appendChild(line);
    const last = sparkPoints(values).split(" ").pop();
    if (last) {
      const [cx, cy] = last.split(",");
      const dot = document.createElementNS(NS, "circle");
      dot.setAttribute("cx", cx);
      dot.setAttribute("cy", cy);
      dot.setAttribute("r", "2");
      svg.appendChild(dot);
    }
    return svg;
  }

  function trendClass(delta, fallingIsGood) {
    if (!delta) return "trend-flat";
    return (delta < 0) === fallingIsGood ? "trend-good" : "trend-bad";
  }

  /**
   * Renders the per-country table into `container`.
   * @param {HTMLElement} container
   * @param {Array} rows - progress.json rows
   * @param {Object} opts - { t: translations, lang, countries: { CC: {name_en, name_ar} } }
   */
  function render(container, rows, { t = {}, lang = "en", countries = {} } = {}) {
    container.textContent = "";
    const byCc = groupByCountry(rows);
    const codes = Object.keys(byCc).sort();
    if (!codes.length) {
      const p = document.createElement("p");
      p.className = "progress-empty";
      p.textContent = t.progressEmpty || "No progress history yet.";
      container.appendChild(p);
      return;
    }
    const locale = lang === "ar" ? "ar-SA" : "en-US";
    const fmt = (n) => Number(n).toLocaleString(locale);

    const table = document.createElement("table");
    table.className = "progress-table";
    const head = document.createElement("tr");
    for (const text of [t.progressCountry || "Country", ...SERIES.map(([, key]) => t[key] || key)]) {
      const th = document.createElement("th");
      th.textContent = text;
      head.appendChild(th);
    }
    const thead = document.createElement("thead");
    thead.appendChild(head);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    for (const cc of codes) {
      const series = byCc[cc];
      const tr = document.createElement("tr");
      tr.dataset.cc = cc;
      const info = countries[cc.toUpperCase()] || {};
      const name = document.createElement("td");
      name.className = "progress-country";
      name.textContent = (lang === "ar" ? info.name_ar : info.name_en) || cc.toUpperCase();
      tr.appendChild(name);

      for (const [field, key, fallingIsGood] of SERIES) {
        const values = series.map((r) => Number(r[field]) || 0);
        const latest = values[values.length - 1];
        const delta = values.length > 1 ? latest - values[0] : 0;
        const cls = trendClass(delta, fallingIsGood);
        const td = document.createElement("td");
        td.className = `progress-cell ${cls}`;
        td.dataset.field = field;
        const label = `${t[key] || key}: ${values.map(fmt).join(" → ")}`;
        td.appendChild(sparkline(values, cls, label));
        const val = document.createElement("span");
        val.className = "progress-val";
        val.textContent = fmt(latest);
        td.appendChild(val);
        if (values.length > 1) {
          const d = document.createElement("span");
          d.className = "progress-delta";
          d.textContent = `${delta > 0 ? "+" : delta < 0 ? "−" : "±"}${fmt(Math.abs(delta))}`;
          td.appendChild(d);
        }
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    container.appendChild(table);

    const first = rows.reduce((a, r) => (!a || r.date < a ? r.date : a), "");
    const last = rows.reduce((a, r) => (!a || r.date > a ? r.date : a), "");
    const caption = document.createElement("p");
    caption.className = "progress-caption";
    caption.textContent = (t.progressRange || "{from} → {to}").replace("{from}", first).replace("{to}", last);
    container.appendChild(caption);
  }

  /** Loads data/progress.json once and renders it into #about-progress. */
  async function show({ t, lang, countries } = {}) {
    const container = document.getElementById("about-progress");
    if (!container) return;
    try {
      if (!cache) {
        const res = await fetch("data/progress.json", { cache: "no-cache" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        cache = (await res.json()).rows || [];
      }
      render(container, cache, { t, lang, countries });
    } catch (err) {
      console.warn("Could not load progress.json:", err);
      container.textContent = "";
      const p = document.createElement("p");
      p.className = "progress-empty";
      p.textContent = (t && t.progressUnavailable) || "Progress history is unavailable right now.";
      container.appendChild(p);
    }
  }

  return { show, render, sparkPoints, groupByCountry };
})();

if (typeof window !== "undefined") {
  window.ProgressChart = ProgressChart;
}
