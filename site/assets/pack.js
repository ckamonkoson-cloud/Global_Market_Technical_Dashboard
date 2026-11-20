// Chart Pack: a cover page plus one A4-landscape page per asset, printed to PDF by the browser.
// Every chart is drawn off-screen with the same code as chart.html, then turned into an image.
(async function () {
  const $ = id => document.getElementById(id);
  const status = $("pack-status"), prog = $("pack-progress"), btn = $("pack-print"), pages = $("pages");
  const RANGE = "1Y", CW = 1000, CH = 800;   // chart image size (px), scaled down to fit the page

  // Asset classes in pack order; equities keep the dashboard's country order.
  const CLASSES = [
    { name: "หุ้น", test: a => a.kind === "equity" },
    { name: "พันธบัตร", test: a => a.id === "US10Y" || a.id === "US02Y" },
    { name: "ค่าเงิน", test: a => a.id === "DXY" || a.id === "USDTHB" },
    { name: "สินค้าโภคภัณฑ์", test: a => a.id === "XAUUSD" || a.id === "BRENT" },
    { name: "ความผันผวน", test: a => a.id === "VIX" },
  ];
  const EN_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const enDate = iso => { const [y, m, d] = iso.slice(0, 10).split("-").map(Number); return `${d} ${EN_MONTHS[m - 1]} ${y}`; };
  // setTimeout, not requestAnimationFrame: rAF stops when the tab is in the background
  // (takeScreenshot() flushes any pending chart paint itself)
  const frame = () => new Promise(r => setTimeout(r, 30));
  const eager = html => html.replace(/ loading="lazy"/g, "");   // lazy images may never load in print

  // The pack opens in its own tab, so "back" closes it and returns to the dashboard tab that is
  // still open (navigating would leave two dashboard tabs). Opened directly → go to the dashboard.
  $("pack-back").addEventListener("click", ev => {
    if (history.length > 1) return;              // there is a page to go back to: follow the link
    ev.preventDefault();
    window.close();
    setTimeout(() => { location.href = "index.html"; }, 300);   // close refused by the browser
  });

  let S;
  try { [S] = await Promise.all([getJSON("data/summary.json"), fontsReady]); }
  catch (e) { status.textContent = "โหลดข้อมูลไม่สำเร็จ: " + e.message; return; }

  const ordered = [];
  const used = new Set();
  for (const c of CLASSES) for (const a of S.assets) if (!used.has(a.id) && c.test(a)) { used.add(a.id); ordered.push({ cls: c.name, a }); }
  for (const a of S.assets) if (!used.has(a.id)) ordered.push({ cls: "อื่นๆ", a });

  // ---------------------------------------------------------------- picker
  // Choose which assets go into the pack. Rows: one per equity market (country), then one per
  // other asset class. The pack keeps this order whatever order the boxes were ticked in.
  // Starting selection: ?ids= in the link, else the viewer's last pack, else everything.
  const picker = $("picker"), editBtn = $("pack-edit");
  const allIds = ordered.map(o => o.a.id);
  const rowOf = o => o.cls === "หุ้น" ? o.a.group : o.cls;
  const rows = [];
  for (const o of ordered) {
    const r = rowOf(o);
    if (!rows.length || rows[rows.length - 1].name !== r) rows.push({ name: r, eq: o.cls === "หุ้น", items: [] });
    rows[rows.length - 1].items.push(o);
  }
  const PRESETS = [
    ["ทั้งหมด", () => true],
    ["หุ้นทั้งหมด", o => o.cls === "หุ้น"],
    ["หุ้นเอเชีย", o => o.cls === "หุ้น" && !["หุ้นสหรัฐฯ", "หุ้นยุโรป"].includes(o.a.group)],
    ["Cross-Asset", o => o.cls !== "หุ้น"],
  ];
  const STORE = "gmtd-pack-ids";
  const valid = list => list.filter(id => allIds.includes(id));
  let initial = valid((new URLSearchParams(location.search).get("ids") || "").split(",").filter(Boolean));
  if (!initial.length) { try { initial = valid(JSON.parse(localStorage.getItem(STORE) || "[]")); } catch (e) { initial = []; } }
  const sel = new Set(initial.length ? initial : allIds);

  function drawPicker() {
    const box = (id, on, label, extra = "") =>
      `<label class="pk-item"><input type="checkbox" data-id="${id}"${on ? " checked" : ""}${extra}>${label}</label>`;
    picker.innerHTML = `
      <div class="pk-head">
        <h2>เลือกสินทรัพย์สำหรับ Chart Pack <span class="muted" id="pk-count"></span></h2>
        <div class="pk-presets"><span class="muted">ชุดสำเร็จรูป:</span>
          ${PRESETS.map(([n], i) => `<button type="button" class="pk-chip" data-preset="${i}">${n}</button>`).join("")}
          <button type="button" class="pk-chip ghost" data-preset="clear">ล้าง</button></div>
      </div>
      <div class="pk-rows">${rows.map((r, ri) => {
        const n = r.items.filter(o => sel.has(o.a.id)).length;
        return `<div class="pk-row${ri && r.eq !== rows[ri - 1].eq ? " gap" : ""}">
          <label class="pk-group"><input type="checkbox" data-row="${ri}"${n === r.items.length ? " checked" : ""}>${esc(r.name)}</label>
          <div class="pk-items">${r.items.map(o => box(o.a.id, sel.has(o.a.id), `${assetIcon(o.a)}${esc(o.a.name)}`)).join("")}</div></div>`;
      }).join("")}</div>
      <div class="pk-foot"><button class="btn" id="pk-build" type="button"></button></div>`;
    // half-ticked group boxes
    rows.forEach((r, ri) => {
      const n = r.items.filter(o => sel.has(o.a.id)).length;
      picker.querySelector(`[data-row="${ri}"]`).indeterminate = n > 0 && n < r.items.length;
    });
    const k = sel.size;
    $("pk-count").textContent = `· เลือกแล้ว ${k} / ${allIds.length}`;
    const b = $("pk-build");
    b.textContent = k ? `สร้าง Chart Pack (${k} กราฟ)` : "เลือกอย่างน้อย 1 สินทรัพย์";
    b.disabled = !k;
    status.textContent = "เลือกสินทรัพย์ แล้วกดสร้าง Chart Pack";
  }
  picker.addEventListener("change", ev => {
    const t = ev.target;
    if (t.dataset.id) t.checked ? sel.add(t.dataset.id) : sel.delete(t.dataset.id);
    if (t.dataset.row) rows[t.dataset.row].items.forEach(o => t.checked ? sel.add(o.a.id) : sel.delete(o.a.id));
    drawPicker();
  });
  picker.addEventListener("click", ev => {
    const p = ev.target.closest("[data-preset]");
    if (p) {
      sel.clear();
      if (p.dataset.preset !== "clear") ordered.filter(PRESETS[p.dataset.preset][1]).forEach(o => sel.add(o.a.id));
      drawPicker();
    }
    if (ev.target.closest("#pk-build")) build();
  });
  editBtn.addEventListener("click", () => {
    pages.innerHTML = ""; btn.disabled = true; editBtn.hidden = true; prog.hidden = true;
    document.body.dataset.ready = "";
    picker.hidden = false; drawPicker();
  });

  async function build() {
    const ids = allIds.filter(id => sel.has(id));
    try { localStorage.setItem(STORE, JSON.stringify(ids)); } catch (e) { /* storage unavailable */ }
    const q = ids.length === allIds.length ? "" : `?ids=${ids.join(",")}`;   // link that reopens this selection
    history.replaceState(null, "", location.pathname + q);
    picker.hidden = true;
    await generate(ordered.filter(o => sel.has(o.a.id)));
    editBtn.hidden = false;
  }

  const cacheA = new Map();   // asset JSON already fetched (re-building after an edit reuses it)
  async function generate(chosen) {
    prog.hidden = false; prog.value = 0;
    status.textContent = "กำลังโหลดราคา…";
    const loaded = await Promise.all(chosen.map(o => {
      if (!cacheA.has(o.a.id)) cacheA.set(o.a.id, getJSON(`data/assets/${encodeURIComponent(o.a.id)}.json`));
      return cacheA.get(o.a.id).then(A => ({ ...o, A })).catch(() => null);
    }));
    const items = loaded.filter(x => x && x.A.bars && x.A.bars.ema50);
    if (!items.length) { status.textContent = "ไม่พบข้อมูลกราฟ"; return; }

    const TOTAL = items.length + 1;
    const foot = (n, left = "") =>
      `<footer class="pg-foot"><span class="l">${left}</span><span class="c">Internal Use Only</span><span class="r">${n} / ${TOTAL}</span></footer>`;

    // ---------------------------------------------------------------- cover
    pages.insertAdjacentHTML("beforeend", `
      <section class="page cover">
        <div class="cv-inner">
          <h1>Technical Charts</h1>
          <p class="cv-sub">กราฟแท่งเทียน + EMA50/200 + RSI + แนวรับ-แนวต้าน</p>
          <p class="cv-meta">${items.length} สินทรัพย์ • ข้อมูล ณ ${enDate(S.dataDate)}</p>
        </div>
        ${foot(1)}
      </section>`);

    // ---------------------------------------------------------------- one page per asset
    const stage = $("pack-stage");
    stage.style.width = CW + "px"; stage.style.height = CH + "px";
    const show = { ema50: true, ema200: true, rsi: true, sr: true };
    const source = "ข้อมูลและกราฟ: TradingView (tvdatafeed · Lightweight Charts) · ไม่ใช่คำแนะนำการลงทุน";
    prog.max = items.length;

    for (let i = 0; i < items.length; i++) {
      const { cls: clsName, A } = items[i];
      status.textContent = `กำลังสร้างกราฟ ${i + 1}/${items.length}: ${A.name}`;
      prog.value = i;
      const host = document.createElement("div");
      host.style.cssText = `width:${CW}px;height:${CH}px`;
      stage.appendChild(host);
      const tc = TechChart.create(host, A, { width: CW, height: CH, fontSize: 13 });
      const res = tc.apply(RANGE, show);
      await frame();
      const png = tc.chart.takeScreenshot(true, false).toDataURL("image/png");
      tc.remove(); host.remove();

      const d = TechChart.describe(A, tc.dp, res);
      const last = A.bars.t[A.bars.t.length - 1];
      const sub = A.group && A.group !== clsName ? `${clsName} · ${A.group}` : clsName;
      pages.insertAdjacentHTML("beforeend", `
        <section class="page chart-page">
          <header class="pg-head">
            <div>
              <div class="pg-class">${esc(sub)}</div>
              <h2>${eager(assetIcon(A))}${esc(A.name)}</h2>
            </div>
            <div class="pg-meta">${esc(A.source)} · Daily · ช่วง ${RANGE}<br>${esc(asOfTip({ ...A, lastDate: last }))}</div>
          </header>
          <div class="pg-body">
            <div class="pg-chart">
              <div class="legend-line">
                <span><i style="background:var(--ema50)"></i>EMA50</span>
                <span><i style="background:var(--ema200)"></i>EMA200</span>
                <span><i class="dash" style="border-color:var(--support)"></i>แนวรับ (S)</span>
                <span><i class="dash" style="border-color:var(--resist)"></i>แนวต้าน (R)</span>
                <span class="muted">ช่องล่าง: RSI(14) เส้น 70 / 30 · เส้นหนา = โซนที่ราคาแตะบ่อย</span>
              </div>
              <img class="pg-img" src="${png}" alt="กราฟ ${esc(A.name)}">
            </div>
            <aside class="info">
              <table>
                <tr class="head"><th>แนวโน้มหลัก</th><td>${d.trendHTML}</td></tr>
                <tr><th>ราคาล่าสุด</th><td>${d.last}</td></tr>
                <tr><th>แนวรับ</th><td>${d.supHTML}</td></tr>
                <tr><th>แนวต้าน</th><td>${d.resHTML}</td></tr>
                <tr><th>RSI (Signal)</th><td>${d.rsiHTML}</td></tr>
              </table>
              <div class="narr"><h3>แนวโน้ม:</h3><p>${esc(d.narr)}</p></div>
              <p class="pg-note">${esc(d.note)}</p>
            </aside>
          </div>
          ${foot(i + 2, source)}
        </section>`);
    }
    prog.value = items.length;

    // Wait until every image (charts and flags) is decoded, otherwise the first print can miss them.
    status.textContent = "กำลังเตรียมหน้าพิมพ์…";
    await Promise.all([...pages.querySelectorAll("img")].map(img => img.decode().catch(() => {})));
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    await frame();

    document.title = `Technical Chart Pack - ${S.dataDate}`;   // default PDF file name
    status.textContent = `พร้อมแล้ว · ${TOTAL} หน้า (หน้าปก + ${items.length} กราฟ)`;
    prog.hidden = true;
    btn.disabled = false;
    document.body.dataset.ready = "1";   // the user opens the print dialog with the button
  }

  btn.addEventListener("click", () => window.print());
  drawPicker();
  if (new URLSearchParams(location.search).has("auto")) build();   // ?auto: build at once (testing / bookmarks)
})();
