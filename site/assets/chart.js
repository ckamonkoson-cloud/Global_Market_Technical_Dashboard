(async function () {
  const id = new URLSearchParams(location.search).get("s");
  const LW = window.LightweightCharts;
  if (!id) { location.href = "index.html"; return; }

  let A;
  try {
    A = await getJSON(`data/assets/${encodeURIComponent(id)}.json`);
  } catch (e) {
    document.getElementById("title").textContent = "ไม่พบข้อมูล: " + id;
    return;
  }
  if (!A.bars.ema50) { document.getElementById("title").textContent = "ไม่มีกราฟสำหรับ " + A.name; return; }

  const b = A.bars, N = b.t.length, LAST = N - 1;
  document.title = `Technical Chart: ${A.name}`;
  document.getElementById("title").innerHTML = `${assetIcon(A)}Technical Chart: ${esc(A.name)}`;
  document.getElementById("src").textContent = `${A.group} · ${A.source} · Daily`;
  document.getElementById("foot").textContent =
    `ที่มา: TradingView (ผ่าน tvdatafeed) ณ วันที่ ${thDate(b.t[LAST])} · ข้อมูลเพื่อการวิเคราะห์ ไม่ใช่คำแนะนำการลงทุน`;

  const dp = b.c[LAST] >= 1000 ? 2 : b.c[LAST] >= 10 ? 2 : 3;
  const C = name => cssVar(name);

  // ---------------------------------------------------------------- chart
  const el = document.getElementById("tvchart");
  const chart = LW.createChart(el, {
    autoSize: true,
    layout: {
      background: { type: "solid", color: C("--surface") }, textColor: C("--text-2"),
      fontFamily: getComputedStyle(document.body).fontFamily,
      panes: { separatorColor: C("--border"), enableResize: true },
      attributionLogo: true,
    },
    grid: { vertLines: { color: C("--grid") }, horzLines: { color: C("--grid") } },
    rightPriceScale: { borderColor: C("--border") },
    timeScale: { borderColor: C("--border"), rightOffset: 6 },
    crosshair: { mode: LW.CrosshairMode.Normal },
    localization: { priceFormatter: p => fmtNum(p, dp) },
  });

  const candles = chart.addSeries(LW.CandlestickSeries, {
    upColor: C("--candle-up"), downColor: C("--candle-down"), borderVisible: false,
    wickUpColor: C("--candle-up"), wickDownColor: C("--candle-down"),
    priceFormat: { type: "price", precision: dp, minMove: 1 / 10 ** dp },
  });
  candles.setData(b.t.map((t, i) => ({ time: t, open: b.o[i], high: b.h[i], low: b.l[i], close: b.c[i] })));

  // what is drawn; toggled by the checkboxes above the chart
  const show = { ema50: true, ema200: true, rsi: true, sr: true };

  const lineOpts = { lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false };
  const ema50S = chart.addSeries(LW.LineSeries, { ...lineOpts, color: C("--ema50") });
  ema50S.setData(b.t.map((t, i) => ({ time: t, value: b.ema50[i] })).slice(49));
  const ema200S = chart.addSeries(LW.LineSeries, { ...lineOpts, color: C("--ema200") });
  ema200S.setData(b.t.map((t, i) => ({ time: t, value: b.ema200[i] })).slice(199));

  // RSI lives in pane 1; removing all its series removes the pane, so the price chart takes the full height
  let rsiSeries = null;
  function addRSI() {
    rsiSeries = chart.addSeries(LW.LineSeries, {
      lineWidth: 1.5, color: C("--rsi"), priceLineVisible: false,
      priceFormat: { type: "price", precision: 1, minMove: 0.1 },
      autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }),
    }, 1);
    rsiSeries.priceScale().applyOptions({ scaleMargins: { top: 0.06, bottom: 0.06 } });
    rsiSeries.setData(b.t.map((t, i) => ({ time: t, value: b.rsi[i] })).slice(14));
    [70, 30].forEach(v => rsiSeries.createPriceLine({ price: v, color: C("--text-3"), lineWidth: 1, lineStyle: LW.LineStyle.Dashed, axisLabelVisible: true, title: "" }));
    rsiSeries.createPriceLine({ price: 50, color: C("--grid"), lineWidth: 1, lineStyle: LW.LineStyle.Dotted, axisLabelVisible: false, title: "" });
  }
  addRSI();

  const setPaneHeights = () => {
    const panes = chart.panes();
    if (panes[1]) panes[1].setHeight(Math.round(el.clientHeight * 0.24));
  };
  setPaneHeights();
  new ResizeObserver(setPaneHeights).observe(el);

  // ---------------------------------------------------------------- range-dependent overlays
  const RANGES = { "1M": 21, "3M": 63, "6M": 126, "1Y": 252, "All": N };
  let priceLines = [], divSeries = [];

  function clearOverlays() {
    priceLines.forEach(l => candles.removePriceLine(l));
    divSeries.forEach(s => chart.removeSeries(s));
    priceLines = []; divSeries = [];
  }

  let curRange = "1Y";

  // resetView=false keeps the user's zoom/scroll when only a checkbox changed
  function apply(rangeKey, resetView = true) {
    curRange = rangeKey;
    const len = Math.min(RANGES[rangeKey], N);
    const from = N - len, to = LAST;
    clearOverlays();

    ema50S.applyOptions({ visible: show.ema50 });
    ema200S.applyOptions({ visible: show.ema200 });
    if (show.rsi && !rsiSeries) addRSI();
    if (!show.rsi && rsiSeries) { chart.removeSeries(rsiSeries); rsiSeries = null; }

    const z = TA.srZones(b, from, to);
    const maxT = Math.max(2, ...[...z.support, ...z.resistance].map(x => x.touches));
    for (const zone of show.sr ? [...z.support, ...z.resistance] : []) {
      const w = zone.touches >= maxT && maxT > 2 ? 3 : zone.touches >= 3 ? 2 : 1;
      priceLines.push(candles.createPriceLine({
        price: zone.price, color: C(zone.side === "S" ? "--support" : "--resist"),
        lineWidth: w, lineStyle: LW.LineStyle.Dashed, axisLabelVisible: true,
        title: `${zone.name} ${fmtNum(zone.price, dp)}`,
      }));
    }

    const divs = TA.divergences(b, from, to);
    for (const d of show.rsi ? divs : []) {
      const color = C(d.type === "bullish" ? "--div-bull" : "--div-bear");
      const o = { color, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, autoscaleInfoProvider: () => null };
      const s1 = chart.addSeries(LW.LineSeries, o, 0);
      s1.setData([{ time: b.t[d.a], value: d.pa }, { time: b.t[d.b], value: d.pb }]);
      const s2 = chart.addSeries(LW.LineSeries, o, 1);
      s2.setData([{ time: b.t[d.a], value: d.ra }, { time: b.t[d.b], value: d.rb }]);
      divSeries.push(s1, s2);
    }

    if (resetView) chart.timeScale().setVisibleLogicalRange({ from: from - 0.5, to: to + 6 });
    setPaneHeights();
    syncLegend();
    updateInfo(z, divs, to, rangeKey);
  }

  // ---------------------------------------------------------------- info box + narrative
  const TREND_TH = { UPTREND: "ขาขึ้น", DOWNTREND: "ขาลง", SIDEWAYS: "ออกข้าง (Sideways)" };
  const RSI_TH = { Overbought: "อยู่ในโซน Overbought (สูงกว่า 70)", Oversold: "อยู่ในโซน Oversold (ต่ำกว่า 30)", Neutral: "อยู่โซนกลาง" };

  function updateInfo(z, divs, to, rangeKey) {
    const last = b.c[to], e50 = b.ema50[to], e200 = b.ema200[to], r = b.rsi[to];
    const trend = A.trend;
    const rs = TA.rsiState(r);
    const recent = divs.filter(d => to - d.b <= 15).pop();
    const divTxt = recent ? (recent.type === "bullish" ? "Bullish divergence" : "Bearish divergence") : "";

    const lvl = arr => arr.length
      ? arr.map(x => `<span class="lv">${x.name} ${fmtNum(x.price, dp)} <span class="tc">(แตะ ${x.touches} ครั้ง)</span></span>`).join("")
      : `<span class="muted">ไม่พบโซนในช่วง ${rangeKey}</span>`;

    document.getElementById("i-trend").innerHTML = trendChip(trend);
    document.getElementById("i-last").textContent = fmtNum(last, dp);
    document.getElementById("i-sup").innerHTML = lvl(z.support);
    document.getElementById("i-res").innerHTML = lvl(z.resistance);
    document.getElementById("i-rsi").innerHTML = `${rs} (${r.toFixed(1)})${divTxt ? `<span class="lv" style="color:var(${recent.type === "bullish" ? "--div-bull" : "--div-bear"})">${divTxt}</span>` : ""}`;
    document.getElementById("i-strat").innerHTML = `<a class="chip-link" href="index.html#glossary" title="ดูคำอธิบาย Strategy">${stratChip(A.strategy)}</a>` +(A.quadrant ? ` <span class="muted">· ${A.quadrant}</span>` : "");

    const vs = (p, e) => p >= e ? "อยู่เหนือ" : "อยู่ต่ำกว่า";
    let crossNote = "";
    if (to > 0) {
      const p0 = b.c[to - 1], m0 = b.ema50[to - 1];
      if (p0 >= m0 && last < e50) crossNote = "ล่าสุดหลุดต่ำกว่า";
      else if (p0 <= m0 && last > e50) crossNote = "ล่าสุดยืนกลับเหนือ";
    }
    const two = arr => arr.slice(0, 2).map(x => fmtNum(x.price, dp)).join("/") || "–";
    let txt = `${A.name} อยู่ในแนวโน้ม${TREND_TH[trend]} ราคาล่าสุด ${fmtNum(last, dp)} `;
    txt += crossNote ? `${crossNote}เส้น EMA50 ที่ ${fmtNum(e50, dp)}` : `${vs(last, e50)}เส้น EMA50 ที่ ${fmtNum(e50, dp)}`;
    txt += ` และ${vs(last, e200)} EMA200 ที่ ${fmtNum(e200, dp)} `;
    txt += `RSI ${r.toFixed(1)} ${RSI_TH[rs]}`;
    if (recent) txt += recent.type === "bullish"
      ? " และเกิด Bullish divergence (ราคาทำจุดต่ำใหม่แต่ RSI ไม่ทำตาม) ส่งสัญญาณแรงขายเริ่มอ่อนลง"
      : " และเกิด Bearish divergence (ราคาทำจุดสูงใหม่แต่ RSI ไม่ทำตาม) ส่งสัญญาณแรงซื้อเริ่มอ่อนลง";
    const res = z.resistance.length ? `ต้าน ${two(z.resistance)}` : "ไม่พบแนวต้านเหนือราคา";
    const sup = z.support.length ? `รับ ${two(z.support)}` : "ไม่พบแนวรับใต้ราคา";
    txt += ` กรอบสำคัญ (ช่วง ${rangeKey}) ${res} ${sup}`;
    document.getElementById("narr").textContent = txt;
    document.getElementById("i-note").textContent =
      `แนวรับ/แนวต้านคำนวณจาก swing high/low ช่วง ${rangeKey} (หน้าต่าง ±${z.window} แท่ง) รวมจุดที่ห่างกันไม่เกิน ${fmtNum(z.tol, dp)} (0.5×ATR) และแตะอย่างน้อย 2 ครั้ง`;
  }

  // ---------------------------------------------------------------- range buttons
  const btns = document.getElementById("ranges");
  btns.addEventListener("click", ev => {
    const btn = ev.target.closest("button"); if (!btn) return;
    btns.querySelectorAll("button").forEach(x => x.classList.toggle("on", x === btn));
    apply(btn.dataset.r);
  });
  // ---------------------------------------------------------------- toggles
  function syncLegend() {
    document.querySelectorAll(".legend-line [data-k]").forEach(s => {
      s.style.display = show[s.dataset.k] ? "" : "none";
    });
  }
  document.querySelectorAll("#toggles input[type=checkbox]").forEach(cb => {
    cb.checked = show[cb.dataset.k];
    cb.addEventListener("change", () => { show[cb.dataset.k] = cb.checked; apply(curRange, false); });
  });

  // ---------------------------------------------------------------- export PDF (browser print → Save as PDF)
  // The live canvas is swapped for a static screenshot so the printed chart keeps its on-screen layout.
  const printImg = document.getElementById("print-chart");
  const baseTitle = document.title;
  function preparePrint() {
    printImg.src = chart.takeScreenshot(true, false).toDataURL("image/png");
    document.getElementById("print-meta").textContent =
      `ช่วงข้อมูล: ${curRange} · ข้อมูล ณ ${thDate(b.t[LAST])} · พิมพ์เมื่อ ${new Date().toLocaleString("th-TH-u-ca-gregory", { dateStyle: "medium", timeStyle: "short" })}`;
    document.title = `Technical Report - ${A.name} - ${b.t[LAST]} (${curRange})`; // default PDF file name
  }
  window.addEventListener("beforeprint", preparePrint);
  window.addEventListener("afterprint", () => { document.title = baseTitle; });
  document.getElementById("export").addEventListener("click", () => { preparePrint(); window.print(); });

  apply("1Y");
})();
