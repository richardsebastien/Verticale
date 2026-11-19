const { chromium } = require('playwright');
const assert = require('assert');
(async () => {
  const browser = await chromium.launch();
  const ctxb = await browser.newContext({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true, colorScheme: process.argv[2] || 'light' });
  const page = await ctxb.newPage();
  const errs = [];
  page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/Failed to load resource/.test(m.text())) errs.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message + '\n' + e.stack));
  await page.route('**/*', (r) => { const u = r.request().url(); if (u.startsWith('file:')) r.continue(); else r.abort(); });
  await page.goto('file://' + __dirname + '/page.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  await page.click('[data-act="start"]');
  // catégories
  const cats = await page.locator('.cat').allInnerTexts();
  console.log('catégories:', cats.join(' | '));
  assert.strictEqual(cats.length, 6);
  const names = async () => (await page.locator('.tool .nm').allInnerTexts()).join(', ');
  console.log('home:', await names());
  await page.click('[data-cat="shop"]'); console.log('shop:', await names());
  await page.click('[data-cat="leisure"]'); console.log('leisure:', await names());
  await page.screenshot({ path: __dirname + '/s20.png' });
  await page.click('[data-cat="service"]'); console.log('service:', await names());
  await page.click('[data-cat="base"]'); console.log('base:', await names());
  // verrouillé : toast
  await page.click('[data-cat="leisure"]');
  await page.click('.tool[data-tool="cinema"]');
  console.log('toast:', await page.locator('.toast').last().innerText());
  assert.strictEqual(await page.locator('#build').isHidden(), true);
  // construit une tour de test via le moteur
  await page.evaluate(() => {
    const { E, cam, ui } = window.__verticale; const S = E.S;
    S.rank = 5; S.cash = 8e6;
    for (let i = 0; i < 3; i++) E.buyLand('r');
    const plan = { '-2': ['club'], '-1': ['metro', 'parking', 'tech', 'trash', 'gym', 'security', 'janitor'], 0: ['cafe', 'bakery', 'salon', 'grocery', 'pharmacy'], 1: ['bank', 'clinic', 'daycare', 'shop', 'cinema'], 2: ['loft', 'office', 'cowork', 'openspace'], 3: ['garden', 'resto'], 4: ['bar'], 6: ['solar'], 8: ['pent'], 25: ['observatory'], 30: ['heli'] };
    E.place('elev', -3, 16, { f1: 31 }); E.place('elev', 0, 35, { f1: 31 });
    for (const id of S.shafts.keys()) { E.addCar(id); E.addCar(id); }
    for (let f = -3; f <= 31; f++) {
      for (const t of plan[f] || []) { for (let c = S.owned.l; c + E.TYPES[t].w - 1 <= S.owned.r; c++) if (E.place(t, f, c).ok) break; }
      if (f >= 0) for (let c = S.owned.l; c + 1 <= S.owned.r; c++) E.place(f % 3 === 0 ? 'studio' : 'apt', f, c);
    }
    for (let i = 0; i < 3 * 2880; i++) E.step(0.1);
    S.T = Math.floor(S.T / 1440) * 1440 + 21 * 60;   // 21 h
    ui.paused = true;
  });
  const look = async (name, f, c, z) => {
    await page.evaluate(([f, c, z]) => { const { cam } = window.__verticale; cam.z = z; cam.x = c * 40; cam.y = -f * 56; cam.tx = null; }, [f, c, z]);
    await page.waitForTimeout(250);
    await page.screenshot({ path: __dirname + '/' + name + '.png' });
  };
  await look('s21', 0.5, 20, 1.15);
  await look('s22', -1.5, 20, 1.0);
  await look('s23', 3, 20, 1.0);
  await look('s24', 29, 20, 0.9);
  await page.evaluate(() => { const { E } = window.__verticale; E.S.T = Math.floor(E.S.T / 1440) * 1440 + 13 * 60; });
  await look('s25', 1.5, 20, 1.1);
  // fiche pièce : appartement
  const id = await page.evaluate(() => { const { E, select, cam } = window.__verticale; const r = [...E.S.rooms.values()].find((r) => r.type === 'apt' && r.tenant && r.f > 5); cam.tx = null; cam.x = (r.c + 1) * 40; cam.y = -(r.f) * 56; select({ kind: 'room', id: r.id }); return r.id; });
  await page.waitForTimeout(300);
  console.log('fiche apt:', (await page.locator('#sheet, .sheet').first().innerText()).replace(/\n+/g, ' | ').slice(0, 400));
  const c0 = await page.evaluate(() => window.__verticale.E.S.cash);
  await page.click('[data-act="reno"]'); await page.waitForTimeout(150);
  const lvl = await page.evaluate((id) => window.__verticale.E.S.rooms.get(id).lvl, id);
  assert.strictEqual(lvl, 1);
  const c1 = await page.evaluate(() => window.__verticale.E.S.cash); assert(c1 < c0);
  await page.click('[data-act="pol"]'); await page.waitForTimeout(100);
  assert.strictEqual(await page.evaluate((id) => window.__verticale.E.S.rooms.get(id).pol, id), 1);
  await page.click('[data-act="pol"]'); assert.strictEqual(await page.evaluate((id) => window.__verticale.E.S.rooms.get(id).pol, id), -1);
  await page.click('[data-act="pol"]'); assert.strictEqual(await page.evaluate((id) => window.__verticale.E.S.rooms.get(id).pol, id), 0);
  await page.screenshot({ path: __dirname + '/s26.png' });
  // fiche service et commerce
  for (const t of ['security', 'solar', 'cafe', 'club']) {
    await page.evaluate((t) => { const { E, select } = window.__verticale; const r = [...E.S.rooms.values()].find((r) => r.type === t); select({ kind: 'room', id: r.id }); }, t);
    await page.waitForTimeout(150);
    console.log('fiche', t + ':', (await page.locator('.sheet').first().innerText()).replace(/\n+/g, ' | ').slice(0, 330));
  }
  // onglet Tour
  await page.evaluate(() => { window.__verticale.E.runEvent('inspection'); window.__verticale.E.runEvent('presse'); window.__verticale.openMenu(); });
  await page.waitForTimeout(200);
  await page.click('[data-tab="tower"]'); await page.waitForTimeout(200);
  console.log('Tour:', (await page.locator('.sheet').first().innerText()).replace(/\n+/g, ' | ').slice(0, 900));
  await page.screenshot({ path: __dirname + '/s27.png' });
  await page.evaluate(() => { document.querySelector('.sheet [data-tab="tower"]').parentElement.scrollLeft = 0; document.querySelector('.sheet .body, .sheet .sb') && 0; });
  await page.click('[data-tab="report"]'); await page.waitForTimeout(150);
  console.log('Bilan:', (await page.locator('.sheet').first().innerText()).replace(/\n+/g, ' | ').slice(0, 300));
  await page.click('[data-tab="bank"]'); console.log('Banque:', (await page.locator('.sheet').first().innerText()).replace(/\n+/g, ' | ').slice(0, 300));
  await page.click('[data-tab="goals"]'); console.log('Objectifs:', (await page.locator('.sheet').first().innerText()).replace(/\n+/g, ' | ').slice(0, 400));
  console.log('errors:', errs.length ? errs.join('\n') : 'none');
  await browser.close();
})();
