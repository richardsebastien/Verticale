const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctxb = await browser.newContext({ viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true });
  const page = await ctxb.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_FAILED/.test(m.text())) errs.push(m.text()); });
  await page.route('**/*', (r) => r.request().url().startsWith('file:') ? r.continue() : r.abort());
  await page.goto('file://' + __dirname + '/page.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300); await page.click('[data-act="start"]');
  const cam = () => page.evaluate(() => { const c = window.__verticale.cam; return [Math.round(c.x), Math.round(c.y), +c.z.toFixed(2)]; });
  console.log('start', await cam());
  await page.mouse.move(200, 300); await page.mouse.down(); await page.mouse.move(120, 380, { steps: 6 }); await page.mouse.up();
  console.log('after drag', await cam());
  await page.mouse.move(200, 400); await page.mouse.wheel(0, -300);
  console.log('after wheel zoom in', await cam());
  // vrai pinch via CDP touch events
  const cdp = await ctxb.newCDPSession(page);
  const tp = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p[0], y: p[1], id: i })) });
  await tp('touchStart', [[150, 400], [250, 400]]);
  for (let i = 1; i <= 8; i++) await tp('touchMove', [[150 - i * 10, 400], [250 + i * 10, 400]]);
  await tp('touchEnd', []);
  console.log('after pinch out', await cam());
  // tap sur un panneau À VENDRE ouvre Terrain
  await page.evaluate(() => { const V = window.__verticale; V.cam.z = 0.8; V.cam.x = 14 * 40 - 74; V.cam.y = -60; });
  await page.waitForTimeout(100);
  await page.mouse.click(195, await page.evaluate(() => { const V = window.__verticale; return (-30 - V.cam.y) * V.cam.z + innerHeight / 2; }));
  console.log('sheet after tap on sign:', await page.locator('.sheet h2').innerText().catch(() => '(none)'), '|', (await page.locator('.tabs [aria-selected="true"]').innerText().catch(() => '')));
  console.log('errors:', errs.length ? errs.join('\n') : 'none');
  await browser.close();
})();
