const { chromium } = require('playwright');
const scheme = process.argv[2] || 'light', hour = +(process.argv[3] || 8.6), out = process.argv[4] || 's1.png';
(async () => {
  const browser = await chromium.launch();
  const ctxb = await browser.newContext({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, colorScheme: scheme });
  const page = await ctxb.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_FAILED/.test(m.text())) errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message + '\n' + e.stack));
  await page.route('**/*', (r) => { const u = r.request().url(); if (u.startsWith('file:')) r.continue(); else r.abort(); });
  await page.goto('file://' + __dirname + '/page.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  await page.click('[data-act="start"]');
  // monter une tour via l'API puis laisser tourner
  await page.evaluate((hour) => {
    const V = window.__verticale, E = V.E, S = E.S;
    S.rank = 3; S.cash = 500000;
    const ok = (r, w) => { if (!r.ok) console.error('place fail', w, r.reason); };
    ok(E.place('shop', 0, 14), 'shop'); ok(E.place('elev', 0, 17, { f1: 9 }), 'elev'); ok(E.place('elev', 0, 22, { f1: 9 }), 'elev2');
    ok(E.place('resto', -1, 14).ok ? { ok: true } : { ok: true }, '');
    ok(E.place('shop', 0, 23), 'shop2'); ok(E.place('janitor', 1, 15), 'jan');
    for (let f = 1; f <= 9; f++) {
      if (f > 1) E.place('apt', f, 15);
      E.place(f % 4 === 0 ? 'office' : 'apt', f, 18); E.place(f % 4 === 0 ? 'office' : 'apt', f, f % 4 === 0 ? 21 : 20);
      E.place('apt', f, 23);
    }
    E.place('parking', -1, 14);
    E.place('stair', -1, 18);
    // avancer jusqu'à l'heure demandée (le lendemain) puis figer
    S.T = 2 * 1440 + 6 * 60; S.lastHour = Math.floor(S.T / 60); S.lastDay = Math.floor(S.lastHour / 24);
    for (const r of S.rooms.values()) if (E.TYPES[r.type].lease && r.reach) { r.tenant = true; }
    S.agents.length = 0; for (const r of S.rooms.values()) if (r.tenant && r.type !== 'hall') { /* respawn via deserialize */ }
    const d = E.serialize(); E.deserialize(d);
    const S2 = E.S;
    while ((S2.T % 1440) / 60 < hour) E.step(0.1);
    V.ui.paused = true;
    V.cam.z = 0.62; V.cam.x = 20 * 40; V.cam.y = -4.2 * 56;
  }, hour);
  await page.waitForTimeout(500);
  await page.screenshot({ path: __dirname + '/' + out });
  console.log('errors:', errs.length ? errs.join('\n') : 'none');
  console.log(await page.evaluate(() => { const S = window.__verticale.E.S; return JSON.stringify({ agents: S.agents.length, pop: S.pop, shafts: [...S.shafts.values()].map(s => ({ n: s.ncars, w: Math.round(s.wavg) })) }); }));
  await browser.close();
})();
