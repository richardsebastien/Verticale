const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctxb = await browser.newContext({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const page = await ctxb.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_FAILED/.test(m.text())) errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message + '\n' + e.stack));
  await page.route('**/*', (r) => { const u = r.request().url(); if (u.startsWith('file:')) r.continue(); else r.abort(); });
  await page.goto('file://' + __dirname + '/page.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);
  await page.click('[data-act="start"]');
  const scr = (c, f) => page.evaluate(([c, f]) => { const V = window.__verticale; const z = V.cam.z; return [(c * 40 + 20 - V.cam.x) * z + innerWidth / 2, (-(f + 0.5) * 56 - V.cam.y) * z + innerHeight / 2]; }, [c, f]);
  const log = (...a) => console.log(...a);

  // 1. construire des apparts au sol via tap sur la tour
  await page.click('.tool[data-tool="apt"]');
  let p = await scr(16, 0); await page.mouse.click(p[0], p[1]);
  log('ghost bar:', (await page.locator('#build').innerText()).replace(/\n/g, ' | '));
  await page.click('[data-b="ok"]');
  p = await scr(22, 0); await page.mouse.click(p[0], p[1]);
  await page.click('[data-b="ok"]');
  log('cash after 2 apts', await page.locator('#h-cash').innerText());
  // tap on occupied -> reason
  p = await scr(16, 0); await page.mouse.click(p[0], p[1]);
  log('occupied bar:', (await page.locator('#build').innerText()).replace(/\n/g, ' | '));
  await page.click('[data-b="cancel"]');
  // 2. sélection d'une pièce
  p = await scr(16, 0); await page.mouse.click(p[0], p[1]);
  log('room sheet:', (await page.locator('.sheet').innerText()).replace(/\n/g, ' | ').slice(0, 200));
  // démolir
  await page.click('[data-act="demolish"]');
  log('after demolish rooms', await page.evaluate(() => window.__verticale.E.S.rooms.size), 'cash', await page.locator('#h-cash').innerText());
  // 3. ascenseur : autoghost, build
  await page.evaluate(() => { window.__verticale.E.S.cash = 80000; });
  await page.click('.tool[data-tool="apt"]'); await page.click('[data-b="ok"]'); await page.click('[data-b="ok"]');
  await page.click('[data-cat="base"]'); await page.click('.tool[data-tool="elev"]');
  log('elev bar:', (await page.locator('#build').innerText()).replace(/\n/g, ' | '));
  await page.click('[data-b="up"]'); await page.click('[data-b="ok"]');
  log('shafts', await page.evaluate(() => window.__verticale.E.S.shafts.size));
  await page.click('.tool[data-tool=""]');
  // sélection de l'ascenseur
  const sh = await page.evaluate(() => { const s = [...window.__verticale.E.S.shafts.values()][0]; return [s.col, s.f0]; });
  p = await scr(sh[0], sh[1]); await page.mouse.click(p[0], p[1]);
  log('shaft sheet:', (await page.locator('.sheet').innerText()).replace(/\n/g, ' | ').slice(0, 160));
  await page.click('[data-act="car+"]');
  log('cars', await page.evaluate(() => [...window.__verticale.E.S.shafts.values()][0].ncars));
  // 4. menus
  await page.click('#btn-menu');
  for (const t of ['goals', 'report', 'bank', 'land', 'settings', 'help']) {
    await page.click('[data-tab="' + t + '"]');
    log('tab', t, (await page.locator('.sbody').innerText()).replace(/\n/g, ' ').slice(0, 90));
  }
  await page.click('[data-tab="bank"]'); await page.click('[data-act="borrow"]');
  log('debt', await page.evaluate(() => window.__verticale.E.S.debt));
  await page.click('[data-tab="land"]'); await page.click('[data-act="land-l"]');
  log('owned', await page.evaluate(() => JSON.stringify(window.__verticale.E.S.owned)));
  await page.click('[data-tab="settings"]'); await page.click('[data-act="mute"]');
  await page.click('.sheet .x');
  // 5. simulation au 8x pendant 4 s réelles
  await page.evaluate(() => { window.__verticale.ui.speed = 8; });
  await page.waitForTimeout(4000);
  log('after 8x', await page.locator('#h-date').innerText(), await page.locator('#h-time').innerText(), 'pop', await page.locator('#h-pop').innerText());
  // 6. sauvegarde puis rechargement
  await page.evaluate(() => { window.dispatchEvent(new Event('pagehide')); });
  const saved = await page.evaluate(() => localStorage.getItem('verticale-save-v1') && localStorage.getItem('verticale-save-v1').length);
  log('saved bytes', saved);
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(500);
  log('reload toast:', await page.locator('.toast').first().innerText().catch(() => '(none)'), 'rooms', await page.evaluate(() => window.__verticale.E.S.rooms.size));
  // 7. nouvelle partie
  await page.click('#btn-menu'); await page.click('[data-tab="settings"]'); await page.click('[data-act="newgame"]'); await page.click('[data-act="newgame"]');
  log('new game rooms', await page.evaluate(() => window.__verticale.E.S.rooms.size), 'welcome', await page.locator('[data-act="start"]').count());
  // frame time
  const ft = await page.evaluate(() => new Promise((res) => { let n = 0, t0 = performance.now(); const f = () => { if (++n < 60) requestAnimationFrame(f); else res((performance.now() - t0) / 60); }; requestAnimationFrame(f); }));
  log('avg frame ms', ft.toFixed(1));
  console.log('errors:', errs.length ? errs.join('\n') : 'none');
  await browser.close();
})();
