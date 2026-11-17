(async function () {
  let S;
  try {
    S = await getJSON("data/summary.json");
  } catch (e) {
    document.getElementById("asof").textContent = "โหลดข้อมูลไม่สำเร็จ: " + e.message;
    return;
  }
  const byId = Object.fromEntries(S.assets.map(a => [a.id, a]));

  document.getElementById("asof").innerHTML =
    `ข้อมูล ณ <b>${thDate(S.dataDate)}</b> · อัปเดตเมื่อ ${new Date(S.generated).toLocaleString("th-TH-u-ca-gregory", { dateStyle: "medium", timeStyle: "short" })}`;
  renderTicker(S);
  if (window.renderWorldMap) renderWorldMap(S);
  document.getElementById("foot").textContent =
    `ที่มา: TradingView (ผ่าน tvdatafeed) · Benchmark RRG: ${S.benchmark.name} ข้อมูลถึง ${thDate(S.benchmark.lastDate)} · ข้อมูลเพื่อการวิเคราะห์ ไม่ใช่คำแนะนำการลงทุน`;

  renderPulse(S);
  renderMovers(S);
  renderTable(S);
  renderPerformance(S, byId);
  renderRotation(S, byId);
  renderRRG(S, byId);
  // re-scroll once the content above has its final height
  openGlossaryFromHash();
  goToTabFromHash();
})();

// ------------------------------------------------------------ Glossary (collapsed by default)
// Links to #glossary (Strategy chips, chart page) open it before scrolling there.
function openGlossaryFromHash() {
  if (location.hash !== "#glossary") return;
  const g = document.getElementById("glossary");
  g.open = true;
  g.scrollIntoView({ block: "start" });
}
addEventListener("hashchange", openGlossaryFromHash);
addEventListener("DOMContentLoaded", openGlossaryFromHash);
document.addEventListener("click", ev => {
  const a = ev.target.closest('a[href="#glossary"]');
  if (a && location.hash === "#glossary") { ev.preventDefault(); openGlossaryFromHash(); }
});

// ------------------------------------------------------------ Ticker ribbon
// Current level + change vs previous close. US10Y shows change in basis points.
function renderTicker(S) {
  const item = a => {
    const isYield = a.id === "US10Y";
    const prev = a.prev != null ? a.prev : (a.chg1d != null ? a.last / (1 + a.chg1d) : null);
    let chgTxt = "–", dir = "flat";
    if (a.chg1d != null && prev != null) {
      dir = a.last > prev ? "up" : a.last < prev ? "down" : "flat";
      const arrow = dir === "up" ? "▲" : dir === "down" ? "▼" : "■";
      chgTxt = isYield
        ? `${arrow} ${(a.last - prev) * 100 >= 0 ? "+" : ""}${((a.last - prev) * 100).toFixed(1)} bp`
        : `${arrow} ${fmtPct(a.chg1d, 2)}`;
    }
    const lvl = isYield ? a.last.toFixed(3) + "%" : fmtNum(a.last, 2);
    return `<a class="ticker-item" href="chart.html?s=${a.id}" title="${esc(a.name)} · ข้อมูล ณ ${thDate(a.lastDate)}">` +
      `<b>${esc(a.name)}</b><span class="lvl">${lvl}</span><span class="chg ticker-${dir}">${chgTxt}</span></a>`;
  };
  const html = S.assets.map(item).join("");
  // Two copies so the -50% scroll loops seamlessly; the copy is hidden from screen readers.
  document.getElementById("ticker").innerHTML =
    html + `<div class="dup" aria-hidden="true">${html.replace(/<a /g, '<a tabindex="-1" ')}</div>`;
}

// ------------------------------------------------------------ Performance
function renderPerformance(S, byId) {
  const keys = ["MTD", "1M", "3M", "6M", "12M"];
  const ids = Object.keys(S.performance);

  const root = document.getElementById("perf");
  root.innerHTML = keys.map(k => {
    const rows = ids.map(id => ({ id, v: S.performance[id][k] })).filter(r => r.v != null)
      .sort((a, b) => b.v - a.v);
    // each panel has its own scale; the value labels need ~38px either side of the bars
    const hi = Math.max(0, ...rows.map(r => r.v)), lo = Math.min(0, ...rows.map(r => r.v));
    const span = (hi - lo) || 0.01;
    const padL = lo < 0 ? 22 : 2, padR = hi > 0 ? 22 : 2; // percent of track reserved for labels
    const scale = (100 - padL - padR) / span;
    const zero = padL + (-lo) * scale;
    return `<div class="perf-panel"><h3>${k} Return (%)</h3>${rows.map(r => {
      const a = byId[r.id];
      const w = Math.abs(r.v) * scale;
      const pos = r.v >= 0;
      const bar = pos ? `left:${zero}%;width:${w}%` : `left:${zero - w}%;width:${w}%`;
      const val = pos ? `left:calc(${zero + w}% + 3px)` : `right:calc(${100 - zero + w}% + 3px)`;
      return `<div class="perf-row" data-id="${r.id}" data-k="${k}">
        <div class="lbl">${esc(a.name)}</div>
        <div class="perf-track"><div class="zero" style="left:${zero}%"></div>
          <div class="perf-bar ${pos ? "pos" : "neg"}" style="${bar};background:${a.color}"></div>
          <div class="perf-val" style="${val}">${fmtPct(r.v)}</div></div></div>`;
    }).join("")}</div>`;
  }).join("");

  root.addEventListener("mousemove", ev => {
    const row = ev.target.closest(".perf-row");
    if (!row) return Tip.hide();
    const a = byId[row.dataset.id], v = S.performance[row.dataset.id][row.dataset.k];
    Tip.show(`<b>${esc(a.name)}</b>${row.dataset.k}: ${fmtPct(v, 2)}<br><span class="muted">ข้อมูลถึง ${thDate(a.lastDate)}</span>`, ev);
  });
  root.addEventListener("mouseleave", () => Tip.hide());
}

// ------------------------------------------------------------ Rotation heatmap
function renderRotation(S, byId) {
  const cols = S.rotation;
  const root = document.getElementById("rot");
  root.style.gridTemplateColumns = `repeat(${cols.length}, minmax(96px, 1fr))`;
  const nRows = Math.max(...cols.map(c => c.cells.length));
  let html = cols.map(c => `<div class="mh">${c.label}${c.mtd ? "<small>MTD</small>" : "<small>&nbsp;</small>"}</div>`).join("");
  for (let i = 0; i < nRows; i++) {
    for (const c of cols) {
      const cell = c.cells[i];
      if (!cell) { html += "<div></div>"; continue; }
      const a = byId[cell.id];
      html += `<div class="cell" data-id="${cell.id}" data-m="${c.label}" style="background:${a.color}">
        <b>${esc(a.name)}</b><span>${fmtPct(cell.ret)}</span></div>`;
    }
  }
  root.innerHTML = html;

  root.addEventListener("mousemove", ev => {
    const cell = ev.target.closest(".cell");
    if (!cell) { root.classList.remove("focus"); root.querySelectorAll(".cell.on").forEach(c => c.classList.remove("on")); return Tip.hide(); }
    const id = cell.dataset.id;
    root.classList.add("focus");
    root.querySelectorAll(".cell").forEach(c => c.classList.toggle("on", c.dataset.id === id));
    const hist = cols.map(c => {
      const k = c.cells.findIndex(x => x.id === id);
      return k < 0 ? "" : `${c.label}${c.mtd ? " (MTD)" : ""}: ${fmtPct(c.cells[k].ret, 2)} · อันดับ ${k + 1}`;
    }).filter(Boolean).join("<br>");
    Tip.show(`<b>${esc(byId[id].name)}</b>${hist}`, ev);
  });
  root.addEventListener("mouseleave", () => {
    root.classList.remove("focus"); root.querySelectorAll(".cell.on").forEach(c => c.classList.remove("on")); Tip.hide();
  });
}

// ------------------------------------------------------------ RRG
function renderRRG(S, byId) {
  const ids = Object.keys(S.rrg);
  const on = new Set(ids);
  const host = document.getElementById("rrg");
  const legend = document.getElementById("rrg-legend");
  const W = 760, H = 560, M = { l: 52, r: 16, t: 16, b: 44 };
  const last = S.rrg[ids[0]]?.slice(-1)[0];
  if (last) document.getElementById("rrg-sub").textContent =
    `ดัชนีหุ้นเทียบ ${S.benchmark.name} · รายสัปดาห์ (ข้อมูลร่วมล่าสุด: ${thDate(last.d)}) · หาง ${S.rrg[ids[0]].length} สัปดาห์ · RS-Ratio / RS-Momentum (สูตรประมาณของ JdK RRG)`;

  function draw(hlId) {
    const pts = ids.filter(id => on.has(id)).flatMap(id => S.rrg[id]);
    const spanX = Math.max(1.5, ...pts.map(p => Math.abs(p.x - 100))) * 1.15;
    const spanY = Math.max(1.5, ...pts.map(p => Math.abs(p.y - 100))) * 1.15;
    const sx = x => M.l + (x - (100 - spanX)) / (2 * spanX) * (W - M.l - M.r);
    const sy = y => M.t + ((100 + spanY) - y) / (2 * spanY) * (H - M.t - M.b);
    const cx = sx(100), cy = sy(100);
    const x0 = M.l, x1 = W - M.r, y0 = M.t, y1 = H - M.b;

    const ticks = (span) => { const st = span > 6 ? 2 : span > 3 ? 1 : 0.5; const out = []; for (let v = Math.ceil((100 - span) / st) * st; v <= 100 + span; v += st) out.push(+v.toFixed(2)); return out; };
    let g = `<rect x="${cx}" y="${y0}" width="${x1 - cx}" height="${cy - y0}" fill="var(--q-leading)"/>
      <rect x="${cx}" y="${cy}" width="${x1 - cx}" height="${y1 - cy}" fill="var(--q-weakening)"/>
      <rect x="${x0}" y="${cy}" width="${cx - x0}" height="${y1 - cy}" fill="var(--q-lagging)"/>
      <rect x="${x0}" y="${y0}" width="${cx - x0}" height="${cy - y0}" fill="var(--q-improving)"/>`;
    ticks(spanX).forEach(v => { const x = sx(v); g += `<line x1="${x}" x2="${x}" y1="${y0}" y2="${y1}" stroke="var(--grid)"/><text x="${x}" y="${y1 + 16}" font-size="11" fill="var(--text-3)" text-anchor="middle">${v}</text>`; });
    ticks(spanY).forEach(v => { const y = sy(v); g += `<line x1="${x0}" x2="${x1}" y1="${y}" y2="${y}" stroke="var(--grid)"/><text x="${x0 - 6}" y="${y + 4}" font-size="11" fill="var(--text-3)" text-anchor="end">${v}</text>`; });
    g += `<line x1="${cx}" x2="${cx}" y1="${y0}" y2="${y1}" stroke="var(--text-3)"/><line x1="${x0}" x2="${x1}" y1="${cy}" y2="${cy}" stroke="var(--text-3)"/>`;
    const ql = (x, y, t, c, a) => `<text x="${x}" y="${y}" font-size="13" font-weight="700" fill="${c}" text-anchor="${a}">${t}</text>`;
    g += ql(x1 - 8, y0 + 18, "LEADING", "var(--up)", "end") + ql(x1 - 8, y1 - 8, "WEAKENING", "var(--warn)", "end")
       + ql(x0 + 8, y1 - 8, "LAGGING", "var(--down)", "start") + ql(x0 + 8, y0 + 18, "IMPROVING", "var(--accent)", "start");
    g += `<text x="${(x0 + x1) / 2}" y="${H - 6}" font-size="12" fill="var(--text-2)" text-anchor="middle">JdK RS-Ratio →</text>
      <text transform="translate(14 ${(y0 + y1) / 2}) rotate(-90)" font-size="12" fill="var(--text-2)" text-anchor="middle">JdK RS-Momentum →</text>`;

    for (const id of ids) {
      if (!on.has(id)) continue;
      const a = byId[id], tail = S.rrg[id];
      const path = tail.map((p, i) => `${i ? "L" : "M"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join("");
      const head = tail[tail.length - 1];
      const hx = sx(head.x), hy = sy(head.y);
      g += `<g class="rrg-series${hlId === id ? " on" : ""}" data-id="${id}">
        <path d="${path}" fill="none" stroke="${a.color}" stroke-width="2" stroke-linejoin="round" opacity=".75"/>
        ${tail.slice(0, -1).map(p => `<circle cx="${sx(p.x)}" cy="${sy(p.y)}" r="2.6" fill="${a.color}" opacity=".75"/>`).join("")}
        <circle cx="${hx}" cy="${hy}" r="6" fill="${a.color}" stroke="var(--surface)" stroke-width="2"/>
        <circle cx="${hx}" cy="${hy}" r="14" fill="transparent" class="hit"/>
        <text x="${hx + 9}" y="${hy - 7}" font-size="11.5" font-weight="700" fill="var(--text)" paint-order="stroke" stroke="var(--surface)" stroke-width="3">${esc(a.name)}</text>
      </g>`;
    }
    host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Relative Rotation Graph">${g}</svg>`;
    host.classList.toggle("hl", !!hlId);
  }

  function legendHTML() {
    return `<div class="tools"><button data-all="1">แสดงทั้งหมด</button><button data-all="0">ซ่อนทั้งหมด</button></div>` +
      ids.map(id => {
        const a = byId[id];
        return `<button data-id="${id}" class="${on.has(id) ? "" : "off"}"><span class="sw" style="background:${a.color}"></span>${esc(a.name)}<span class="q">${a.quadrant || ""}</span></button>`;
      }).join("");
  }

  draw(null);
  legend.innerHTML = legendHTML();
  legend.addEventListener("click", ev => {
    const b = ev.target.closest("button"); if (!b) return;
    if (b.dataset.all != null) { b.dataset.all === "1" ? ids.forEach(i => on.add(i)) : on.clear(); }
    else { on.has(b.dataset.id) ? on.delete(b.dataset.id) : on.add(b.dataset.id); }
    legend.innerHTML = legendHTML();
    draw(null);
  });
  legend.addEventListener("mouseover", ev => {
    const b = ev.target.closest("button[data-id]");
    if (b && on.has(b.dataset.id)) draw(b.dataset.id);
  });
  legend.addEventListener("mouseleave", () => draw(null));

  host.addEventListener("mousemove", ev => {
    const s = ev.target.closest(".rrg-series");
    if (!s) { if (host.classList.contains("hl")) draw(null); return Tip.hide(); }
    const id = s.dataset.id, a = byId[id], hd = S.rrg[id][S.rrg[id].length - 1];
    if (!s.classList.contains("on")) draw(id);
    Tip.show(`<b>${esc(a.name)}</b>${a.quadrant} · RS-Ratio ${hd.x.toFixed(2)} · RS-Mom ${hd.y.toFixed(2)}<br><span class="muted">สัปดาห์ ${thDate(hd.d)}</span>`, ev);
  });
  host.addEventListener("mouseleave", () => { draw(null); Tip.hide(); });
}

// ------------------------------------------------------------ Summary table
// Grouped by market by default. Clicking a column header sorts a flat list
// (desc → asc → back to grouped). Region chips filter rows.
const REGIONS = [
  { k: "all", label: "ทั้งหมด", test: () => true },
  { k: "us", label: "สหรัฐฯ", test: a => a.group === "หุ้นสหรัฐฯ" },
  { k: "eu", label: "ยุโรป", test: a => a.group === "หุ้นยุโรป" },
  { k: "asia", label: "เอเชีย", test: a => a.kind === "equity" && !["หุ้นสหรัฐฯ", "หุ้นยุโรป"].includes(a.group) },
  { k: "other", label: "สินทรัพย์อื่น", test: a => a.kind !== "equity" },
];
const ORDER = {
  trend: { UPTREND: 3, SIDEWAYS: 2, DOWNTREND: 1 },
  strategy: { BREAKOUT: 5, "BUY DIP": 4, WATCH: 3, CORRECTION: 2, AVOID: 1 },
  quadrant: { Leading: 4, Improving: 3, Weakening: 2, Lagging: 1 },
};
const COLS = [
  { k: "name", label: "Index / Asset", val: a => a.name, text: true },
  { k: "last", label: "ราคาล่าสุด", num: true, val: a => a.last },
  { k: "chg1d", label: "%1D", num: true, val: a => a.chg1d },
  { k: "spark", label: "3 เดือน", num: true, val: a => sparkRet(a) },
  { k: "distHigh", label: "จาก High 52W", num: true, val: a => a.distHigh },
  { k: "rsi", label: "RSI", num: true, val: a => a.rsi },
  { k: "trend", label: "แนวโน้ม", val: a => ORDER.trend[a.trend] },
  { k: "strategy", label: "Strategy", val: a => ORDER.strategy[a.strategy] },
  { k: "quadrant", label: "Quadrant", val: a => ORDER.quadrant[a.quadrant] },
  { k: "lastDate", label: "ข้อมูล ณ", val: a => a.lastDate, text: true },
];

function sparkRet(a) {
  const s = a.spark;
  return s && s.length > 1 && s[0] ? s[s.length - 1] / s[0] - 1 : null;
}

function sparkSVG(a) {
  const s = (a.spark || []).filter(v => v != null);
  // Same footprint as a drawn sparkline so rows don't change height when data arrives.
  if (s.length < 2) return `<span class="spark"><svg width="92" height="26" aria-hidden="true"></svg><span class="muted">–</span></span>`;
  const W = 92, H = 26, lo = Math.min(...s), hi = Math.max(...s), span = hi - lo || 1;
  const pts = s.map((v, i) => `${(i / (s.length - 1) * (W - 4) + 2).toFixed(1)},${(H - 3 - (v - lo) / span * (H - 6)).toFixed(1)}`);
  const r = sparkRet(a), c = r > 0 ? "var(--up)" : r < 0 ? "var(--down)" : "var(--neutral)";
  const [lx, ly] = pts[pts.length - 1].split(",");
  return `<span class="spark" title="3 เดือน: ${fmtPct(r, 1)}"><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">` +
    `<polyline points="${pts.join(" ")}" fill="none" stroke="${c}" stroke-width="1.5" stroke-linejoin="round"/>` +
    `<circle cx="${lx}" cy="${ly}" r="2.2" fill="${c}"/></svg><span class="${cls(r)}">${fmtPct(r, 1)}</span></span>`;
}

// Older summary.json files have no "spark": fall back to each asset's bar file.
async function ensureSparks(S) {
  const missing = S.assets.filter(a => !a.spark);
  if (!missing.length) return false;
  await Promise.all(missing.map(async a => {
    try { const d = await getJSON(`data/assets/${encodeURIComponent(a.id)}.json`); a.spark = d.bars.c.slice(-63); }
    catch (e) { a.spark = null; }
  }));
  return true;
}

function renderTable(S) {
  const state = { region: "all", sort: null, dir: -1 };
  const table = document.getElementById("sum");
  const filter = document.getElementById("region-filter");

  filter.innerHTML = REGIONS.map(r => `<button data-r="${r.k}" aria-pressed="${r.k === "all"}">${r.label}</button>`).join("");
  filter.addEventListener("click", ev => {
    const b = ev.target.closest("button"); if (!b) return;
    state.region = b.dataset.r;
    filter.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b));
    draw();
  });

  const rowHTML = a => `<tr>
    <td><span class="dot" style="background:${a.color}"></span><a href="chart.html?s=${a.id}">${esc(a.name)}</a></td>
    <td class="num">${a.id === "US10Y" ? a.last.toFixed(3) + "%" : fmtNum(a.last)}</td>
    <td class="num ${cls(a.chg1d)}">${fmtPct(a.chg1d, 2)}</td>
    <td class="num">${sparkSVG(a)}</td>
    <td class="num ${cls(a.distHigh)}">${fmtPct(a.distHigh, 1)}</td>
    <td class="num">${a.rsi?.toFixed(1) ?? "–"}</td>
    <td>${trendChip(a.trend)}</td>
    <td><a class="chip-link" href="#glossary" title="ดูคำอธิบาย Strategy">${stratChip(a.strategy)}</a></td>
    <td>${quadChip(a.quadrant)}</td>
    <td class="muted">${thDate(a.lastDate)}</td></tr>`;

  function draw() {
    const test = REGIONS.find(r => r.k === state.region).test;
    const rows = S.assets.filter(test);
    let html = `<thead><tr>${COLS.map(c => {
      const on = state.sort === c.k;
      const aria = on ? (state.dir < 0 ? "descending" : "ascending") : "none";
      return `<th class="${c.num ? "num" : ""}" aria-sort="${aria}"><button data-k="${c.k}">${c.label}<span class="si">${on ? (state.dir < 0 ? "▼" : "▲") : "↕"}</span></button></th>`;
    }).join("")}</tr></thead><tbody>`;
    if (state.sort) {
      const col = COLS.find(c => c.k === state.sort);
      const sorted = [...rows].sort((a, b) => {
        const x = col.val(a), y = col.val(b);
        if (x == null) return 1; if (y == null) return -1;
        return (col.text ? String(x).localeCompare(String(y)) : x - y) * state.dir;
      });
      html += sorted.map(rowHTML).join("");
    } else {
      const groups = [];
      for (const a of rows) {
        let g = groups.find(x => x.name === a.group);
        if (!g) groups.push(g = { name: a.group, items: [] });
        g.items.push(a);
      }
      for (const g of groups) html += `<tr class="grp"><td class="g" colspan="${COLS.length}">${esc(g.name)}</td></tr>` + g.items.map(rowHTML).join("");
    }
    table.innerHTML = html + "</tbody>";
  }

  table.addEventListener("click", ev => {
    const b = ev.target.closest("th button"); if (!b) return;
    const k = b.dataset.k, text = COLS.find(c => c.k === k).text;
    if (state.sort !== k) { state.sort = k; state.dir = text ? 1 : -1; }
    else if (state.dir === (text ? 1 : -1)) state.dir = -state.dir;
    else state.sort = null;   // third click: back to grouped view
    draw();
  });

  draw();
  ensureSparks(S).then(changed => { if (changed) draw(); });
}
