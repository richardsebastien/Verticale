const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const c = await browser.newContext({ viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true });
  const page = await c.newPage(); const errs = [];
  page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  await page.route('**/*', (r) => { r.request().url().startsWith('file:') ? r.continue() : r.abort(); });
  await page.goto('file://' + __dirname + '/../dist/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  await page.click('[data-act="start"]');
  await page.click('[data-cat="home"]'); await page.click('.tool[data-tool="studio"]');
  for (let i = 0; i < 3; i++) { await page.click('[data-b="ok"]'); await page.waitForTimeout(100); }
  await page.click('#btn-menu, [aria-label="Menu"]').catch(() => {});
  console.log('exposé en prod:', await page.evaluate(() => typeof window.__verticale));
  console.log('cash', await page.locator('#h-cash').innerText(), '| catégories', await page.locator('.cat').count());
  console.log('errors:', errs.join('\n') || 'none');
  await browser.close();
})();
