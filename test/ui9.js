// hauteurs : solaire, observatoire, héliport
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctxb = await browser.newContext({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctxb.newPage();
  const errs = [];
  page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  await page.route('**/*', (r) => { const u = r.request().url(); if (u.startsWith('file:')) r.continue(); else r.abort(); });
  await page.goto('file://' + __dirname + '/page.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  await page.click('[data-act="start"]');
  const info = await page.evaluate(() => {
    const { E, ui } = window.__verticale; const S = E.S; S.rank = 5; S.cash = 9e7;
    for (let i = 0; i < 3; i++) E.buyLand('r');
    const L = S.owned.l;
    const stack = (c0, c1, top) => { for (let f = 0; f < top; f++) for (let c = c0; c <= c1; c++) { const r = E.place('studio', f, c); if (!r.ok && f === 0) { /* hall voisin */ } } };
    stack(L, L + 3, 6); stack(L + 4, L + 8, 25); stack(L + 9, L + 13, 30);
    const out = {};
    out.solar = E.place('solar', 6, L).ok; out.obs = E.place('observatory', 25, L + 4).ok; out.heli = E.place('heli', 30, L + 9).ok;
    for (const r of S.rooms.values()) { r.reach = true; if (E.TYPES[r.type].lease) { r.tenant = true; r.sat = 80; } }
    ui.paused = true; out.L = L; return out;
  });
  console.log(JSON.stringify(info));
  const shot = async (name, f, c, hour) => {
    await page.evaluate(([f, c, hour]) => { const { cam, E } = window.__verticale; E.S.agents.length = 0; E.S.T = Math.floor(E.S.T / 1440) * 1440 + hour * 60; cam.z = 1.4; cam.x = c * 40; cam.y = -f * 56; cam.tx = null; }, [f, c, hour]);
    await page.waitForTimeout(250); await page.screenshot({ path: __dirname + '/' + name + '.png' });
  };
  await shot('h1', 6.5, info.L + 2, 13);
  await shot('h2', 25.5, info.L + 7, 22);
  await shot('h3', 30.5, info.L + 11, 13);
  console.log('errors:', errs.length ? errs.join('\n') : 'none');
  await browser.close();
})();
