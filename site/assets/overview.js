// Overview widgets: market clocks, Market Pulse tiles, Top Movers,
// the Performance / Rotation / RRG tabs and the sticky section nav.

// ------------------------------------------------------------ Market clocks
// Regular cash-session hours in each exchange's local time. Public holidays are
// not modelled, so a market can show "เปิด" on a holiday.
const MARKETS = [
  { city: "Tokyo", tz: "Asia/Tokyo", s: [["09:00", "11:30"], ["12:30", "15:30"]] },
  { city: "Seoul", tz: "Asia/Seoul", s: [["09:00", "15:30"]] },
  { city: "Shanghai", tz: "Asia/Shanghai", s: [["09:30", "11:30"], ["13:00", "15:00"]] },
  { city: "Hong Kong", tz: "Asia/Hong_Kong", s: [["09:30", "12:00"], ["13:00", "16:00"]] },
  { city: "Bangkok", tz: "Asia/Bangkok", s: [["10:00", "12:30"], ["14:30", "16:30"]] },
  { city: "Mumbai", tz: "Asia/Kolkata", s: [["09:15", "15:30"]] },
  { city: "Frankfurt", tz: "Europe/Berlin", s: [["09:00", "17:30"]] },
  { city: "New York", tz: "America/New_York", s: [["09:30", "16:00"]] },
];

function marketStatus(m, now) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: m.tz, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now).map(p => [p.type, p.value]));
  const hm = `${parts.hour}:${parts.minute}`;
  const weekend = parts.weekday === "Sat" || parts.weekday === "Sun";
  let st = "closed";
  if (!weekend) {
    if (m.s.some(([a, b]) => hm >= a && hm < b)) st = "open";
    else if (hm >= m.s[0][0] && hm < m.s[m.s.length - 1][1]) st = "lunch";
  }
  return { hm, st };
}

function renderClocks() {
  const host = document.getElementById("clocks");
  if (!host) return;
  const label = { open: "เปิด", lunch: "พักเที่ยง", closed: "ปิด" };
  const draw = () => {
    const now = new Date();
    host.innerHTML = `<div class="clocks-inner">` + MARKETS.map(m => {
      const { hm, st } = marketStatus(m, now);
      const hours = m.s.map(x => x.join("–")).join(", ");
      return `<div class="clk ${st}" title="${m.city} · เวลาซื้อขาย ${hours} (เวลาท้องถิ่น) · ไม่รวมวันหยุดนักขัตฤกษ์">` +
        `<span class="city">${m.city}</span><span class="time">${hm}</span><span class="st"><i></i>${label[st]}</span></div>`;
    }).join("") + `</div>`;
  };
  draw();
  setInterval(draw, 30000);
}
renderClocks();

// ------------------------------------------------------------ Market Pulse
function stackBar(parts) {
  const total = parts.reduce((s, p) => s + p.n, 0) || 1;
  return `<div class="stack">${parts.filter(p => p.n).map(p =>
    `<span style="width:${(p.n / total) * 100}%;background:${p.c}" title="${p.label}: ${p.n}"></span>`).join("")}</div>` +
    `<div class="stack-key">${parts.map(p => `<span><i style="background:${p.c}"></i>${p.label} <b>${p.n}</b></span>`).join("")}</div>`;
}

function renderPulse(S) {
  const eq = S.assets.filter(a => a.kind === "equity");
  const up = eq.filter(a => a.chg1d > 0).length, down = eq.filter(a => a.chg1d < 0).length;
  const flat = eq.length - up - down;
  const chg = eq.map(a => a.chg1d).filter(v => v != null);
  const avg = chg.length ? chg.reduce((s, v) => s + v, 0) / chg.length : null;
  const count = (arr, key, val) => arr.filter(a => a[key] === val).length;

  const tiles = [
    {
      k: "ตลาดหุ้นวันนี้", v: `<span class="pos">${up} ▲</span> <span class="sep">/</span> <span class="neg">${down} ▼</span>`,
      d: stackBar([{ label: "ขึ้น", n: up, c: "var(--up)" }, { label: "ไม่เปลี่ยน", n: flat, c: "var(--neutral)" }, { label: "ลง", n: down, c: "var(--down)" }]),
    },
    {
      k: `เฉลี่ย ${eq.length} ดัชนี (1 วัน)`, v: `<span class="${cls(avg)}">${fmtPct(avg, 2)}</span>`,
      d: `<div class="muted">ถ่วงน้ำหนักเท่ากันทุกดัชนี · สกุลเงินท้องถิ่น</div>`,
    },
    {
      k: `แนวโน้ม (${S.assets.length} สินทรัพย์)`, v: `${count(S.assets, "trend", "UPTREND")} <small>UPTREND</small>`,
      d: stackBar([
        { label: "UP", n: count(S.assets, "trend", "UPTREND"), c: "var(--up)" },
        { label: "SIDE", n: count(S.assets, "trend", "SIDEWAYS"), c: "var(--neutral)" },
        { label: "DOWN", n: count(S.assets, "trend", "DOWNTREND"), c: "var(--down)" }]),
    },
    {
      k: `RRG (${eq.length} ดัชนี)`, v: `${count(eq, "quadrant", "Leading")} <small>Leading</small>`,
      d: stackBar([
        { label: "Lead", n: count(eq, "quadrant", "Leading"), c: "var(--up)" },
        { label: "Weak", n: count(eq, "quadrant", "Weakening"), c: "var(--warn)" },
        { label: "Lag", n: count(eq, "quadrant", "Lagging"), c: "var(--down)" },
        { label: "Impr", n: count(eq, "quadrant", "Improving"), c: "var(--accent)" }]),
    },
    {
      k: "Strategy", v: `${count(S.assets, "strategy", "BREAKOUT") + count(S.assets, "strategy", "BUY DIP")} <small>BREAKOUT + BUY DIP</small>`,
      d: `<div class="strat-counts">${["BREAKOUT", "BUY DIP", "WATCH", "CORRECTION", "AVOID"].map(s =>
        `<a href="#glossary" class="chip-link">${stratChip(s)} <b>${count(S.assets, "strategy", s)}</b></a>`).join("")}</div>`,
    },
  ];
  document.getElementById("pulse").innerHTML = tiles.map(t =>
    `<div class="tile"><div class="k">${t.k}</div><div class="v">${t.v}</div><div class="d">${t.d}</div></div>`).join("");
}

// ------------------------------------------------------------ Top movers
function renderMovers(S) {
  const eq = S.assets.filter(a => a.kind === "equity" && a.chg1d != null).sort((a, b) => b.chg1d - a.chg1d);
  const max = Math.max(0.001, ...eq.map(a => Math.abs(a.chg1d)));
  const row = a => {
    const w = Math.abs(a.chg1d) / max * 100;
    return `<a class="mv" href="chart.html?s=${a.id}" title="${esc(a.name)} · ข้อมูล ณ ${thDate(a.lastDate)}">
      <span class="nm"><span class="dot" style="background:${a.color}"></span>${esc(a.name)}</span>
      <span class="bar"><i class="${a.chg1d >= 0 ? "pos" : "neg"}" style="width:${w.toFixed(1)}%"></i></span>
      <span class="pc ${cls(a.chg1d)}">${fmtPct(a.chg1d, 2)}</span></a>`;
  };
  const n = Math.min(4, Math.floor(eq.length / 2));
  const top = eq.slice(0, n), bottom = eq.slice(-n);
  document.getElementById("movers").innerHTML =
    `<div class="mv-h">ดีที่สุด ${n} อันดับ</div>${top.map(row).join("")}` +
    `<div class="mv-h">แย่ที่สุด ${n} อันดับ</div>${bottom.map(row).join("")}`;
}

// ------------------------------------------------------------ Tabs
const TABS = ["performance", "rotation", "rrg"];
function activateTab(name) {
  if (!TABS.includes(name)) return;
  for (const t of TABS) {
    const on = t === name;
    document.getElementById("tab-" + t).setAttribute("aria-selected", on);
    document.getElementById("tab-" + t).tabIndex = on ? 0 : -1;
    document.getElementById("pane-" + t).hidden = !on;
  }
  try { localStorage.setItem("gmtd-tab", name); } catch (e) { /* storage unavailable */ }
  syncNav();
}
document.getElementById("tabs").addEventListener("click", ev => {
  const b = ev.target.closest("button[data-tab]");
  if (b) activateTab(b.dataset.tab);
});
document.getElementById("tabs").addEventListener("keydown", ev => {
  if (ev.key !== "ArrowRight" && ev.key !== "ArrowLeft") return;
  const cur = TABS.findIndex(t => !document.getElementById("pane-" + t).hidden);
  const next = TABS[(cur + (ev.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length];
  activateTab(next);
  document.getElementById("tab-" + next).focus();
});
(function initTab() {
  let t = location.hash.slice(1);
  if (!TABS.includes(t)) { try { t = localStorage.getItem("gmtd-tab"); } catch (e) { t = null; } }
  activateTab(TABS.includes(t) ? t : "performance");
})();

// Nav links / hashes for a tab open that tab, then scroll to the tab card.
function goToTabFromHash() {
  const t = location.hash.slice(1);
  if (!TABS.includes(t)) return;
  activateTab(t);
  document.getElementById("analysis").scrollIntoView({ block: "start" });
}
addEventListener("hashchange", goToTabFromHash);
document.getElementById("secnav").addEventListener("click", ev => {
  const a = ev.target.closest("a[data-tab]");
  if (a && location.hash === "#" + a.dataset.tab) { ev.preventDefault(); goToTabFromHash(); }
});

// ------------------------------------------------------------ Sticky nav highlight
var currentSection = "overview";  // var: read by syncNav() during the earlier initTab() call
function syncNav() {
  const tab = TABS.find(t => !document.getElementById("pane-" + t).hidden);
  document.querySelectorAll("#secnav a").forEach(a => {
    const id = a.getAttribute("href").slice(1);
    const on = a.dataset.tab ? currentSection === "analysis" && a.dataset.tab === tab : currentSection === id;
    a.classList.toggle("on", on);
  });
}
(function observeSections() {
  const secs = ["overview", "summary", "analysis", "glossary"].map(id => document.getElementById(id));
  const pick = () => {
    const line = document.getElementById("secnav").getBoundingClientRect().bottom + 40;
    let cur = secs[0].id;
    for (const s of secs) if (s.getBoundingClientRect().top <= line) cur = s.id;
    if (cur !== currentSection) { currentSection = cur; syncNav(); }
  };
  addEventListener("scroll", pick, { passive: true });
  addEventListener("resize", pick);
  pick();
})();
