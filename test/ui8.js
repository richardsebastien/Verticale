// galerie : toutes les pièces, sans foule, de jour puis de nuit
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctxb = await browser.newContext({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, colorScheme: 'light' });
  const page = await ctxb.newPage();
  const errs = [];
  page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message + '\n' + e.stack));
  await page.route('**/*', (r) => { const u = r.request().url(); if (u.startsWith('file:')) r.continue(); else r.abort(); });
  await page.goto('file://' + __dirname + '/page.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  await page.click('[data-act="start"]');
  await page.evaluate(() => {
    const { E, ui } = window.__verticale; const S = E.S;
    S.rank = 5; S.cash = 8e6;
    for (let i = 0; i < 3; i++) E.buyLand('r');
    E.place('elev', -3, 20, { f1: 12 });
    const rows = {
      '-2': ['club', 'gym'], '-1': ['metro', 'parking', 'tech', 'trash'],
      0: ['cafe', 'bakery', 'salon', 'grocery', 'pharmacy', 'security', 'janitor'],
      1: ['bank', 'clinic', 'daycare', 'shop', 'resto'], 2: ['loft', 'office', 'cowork', 'openspace', 'studio'],
      3: ['cinema', 'bar', 'garden', 'apt', 'pent'], 4: ['solar', 'observatory', 'heli'],
    };
    for (const f of Object.keys(rows).map(Number)) {
      let c = S.owned.l; const L = rows[f];
      for (const t of L) { const T = E.TYPES[t]; if (c === 20) c++; for (; c + T.w - 1 <= S.owned.r; c++) { if (c <= 20 && c + T.w > 20) continue; if (E.place(t, f, c).ok) { c += T.w; break; } } }
    }
    ui.paused = true;
  });
  const shot = async (name, f, c, z, hour) => {
    await page.evaluate(([f, c, z, hour]) => { const { cam, E } = window.__verticale; E.S.agents.length = 0; for (const r of E.S.rooms.values()) { r.reach = true; if (E.TYPES[r.type].lease) { r.tenant = true; r.sat = 80; } } E.S.T = Math.floor(E.S.T / 1440) * 1440 + hour * 60; cam.z = z; cam.x = (E.S.owned.l + c) * 40; cam.y = -f * 56; cam.tx = null; }, [f, c, z, hour]);
    await page.waitForTimeout(250);
    await page.screenshot({ path: __dirname + '/' + name + '.png' });
  };
  const n = await page.evaluate(() => { const { E } = window.__verticale; const o = {}; for (const r of E.S.rooms.values()) o[r.type] = 1; return Object.keys(o).length; });
  console.log('types posés', n);
  console.log('owned', JSON.stringify(await page.evaluate(() => window.__verticale.E.S.owned)));
  await shot('g1', 0.5, 4, 1.25, 15);
  await shot('g1b', 0.5, 12, 1.25, 15);
  await shot('g2', 2.5, 5, 1.25, 15);
  await shot('g2b', 2.5, 13, 1.25, 15);
  await shot('g3', 4, 5, 1.25, 15);
  await shot('g3b', 4, 13, 1.25, 15);
  await shot('g4', -1.5, 5, 1.25, 22);
  await shot('g5', 1.5, 6, 1.25, 22);
  await shot('g6', 3, 6, 1.25, 22);
  console.log('errors:', errs.length ? errs.join('\n') : 'none');
  await browser.close();
})();
