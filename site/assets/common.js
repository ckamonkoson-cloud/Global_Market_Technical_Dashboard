// Shared helpers for both pages.
const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

function thDate(iso) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${TH_MONTHS[m - 1]} ${y}`;
}

function fmtNum(v, dp) {
  if (v == null) return "–";
  if (dp == null) dp = Math.abs(v) >= 1000 ? 2 : Math.abs(v) >= 10 ? 2 : 3;
  return v.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

function fmtPct(v, dp = 1, sign = true) {
  if (v == null) return "–";
  const s = (v * 100).toFixed(dp);
  return (sign && v > 0 ? "+" : "") + s + "%";
}

function cls(v) { return v == null ? "muted" : v > 0 ? "pos" : v < 0 ? "neg" : ""; }

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const TREND_ICON = { UPTREND: "▲", DOWNTREND: "▼", SIDEWAYS: "►" };
const STRAT_ICON = { "BREAKOUT": "🚀", "BUY DIP": "🟢", "WATCH": "⚠️", "CORRECTION": "📉", "AVOID": "❌" };

function trendChip(t) { return `<span class="chip t-${t}">${TREND_ICON[t] || ""} ${t}</span>`; }
function stratChip(s) { return `<span class="chip s-${s.replace(" ", "-")}">${STRAT_ICON[s] || ""} ${s}</span>`; }
function quadChip(q) { return q ? `<span class="chip q-${q}">${q}</span>` : `<span class="muted">–</span>`; }

async function getJSON(url) {
  const r = await fetch(url, { cache: "no-cache" });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// Shared hover tooltip
const Tip = {
  el: null,
  show(html, ev) {
    if (!this.el) { this.el = document.createElement("div"); this.el.id = "tip"; document.body.appendChild(this.el); }
    this.el.innerHTML = html;
    this.el.style.display = "block";
    this.move(ev);
  },
  move(ev) {
    if (!this.el || !ev) return;
    const pad = 14, w = this.el.offsetWidth, h = this.el.offsetHeight;
    let x = ev.clientX + pad, y = ev.clientY + pad;
    if (x + w > innerWidth - 8) x = ev.clientX - w - pad;
    if (y + h > innerHeight - 8) y = ev.clientY - h - pad;
    this.el.style.left = x + "px"; this.el.style.top = y + "px";
  },
  hide() { if (this.el) this.el.style.display = "none"; },
};
