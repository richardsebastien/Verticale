const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctxb = await browser.newContext({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true, colorScheme: process.argv[2] || 'light' });
  const page = await ctxb.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message + '\n' + e.stack));
  await page.route('**/*', (r) => { const u = r.request().url(); if (u.startsWith('file:')) r.continue(); else r.abort(); });
  await page.goto('file://' + __dirname + '/page.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  // fermer l'accueil
  console.log('welcome visible', await page.locator('[data-act="start"]').count());
  await page.click('[data-act="start"]');
  // choisir Appartement
  await page.click('.tool[data-tool="apt"]');
  console.log('build bar:', (await page.locator('#build').innerText()).replace(/\n/g, ' | '));
  for (let i = 0; i < 6; i++) { await page.click('[data-b="ok"]'); await page.waitForTimeout(120); }
  console.log('after builds cash', await page.locator('#h-cash').innerText());
  // elevator
  await page.click('[data-cat="base"]'); await page.click('.tool[data-tool="elev"]');
  console.log('elev bar:', (await page.locator('#build').innerText()).replace(/\n/g, ' | '));
  await page.evaluate(() => { window.__verticale.E.S.rank = 2; window.__verticale.E.S.cash = 90000; });
  await page.waitForTimeout(300);
  await page.screenshot({ path: __dirname + '/s0.png' });
  console.log('errors:', errs.length ? errs.join('\n') : 'none');
  await browser.close();
})();
