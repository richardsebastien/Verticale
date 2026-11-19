const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  for (const [name, vp, scheme] of [['small', { width: 360, height: 640 }, 'dark'], ['desk', { width: 1100, height: 760 }, 'light']]) {
    const c = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, colorScheme: scheme, hasTouch: name === 'small' });
    const page = await c.newPage(); const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.route('**/*', (r) => { r.request().url().startsWith('file:') ? r.continue() : r.abort(); });
    await page.goto('file://' + __dirname + '/page.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400); await page.click('[data-act="start"]');
    await page.evaluate(() => { const { E } = window.__verticale; E.S.rank = 5; E.S.cash = 5e5; });
    await page.waitForTimeout(300);
    await page.click('[data-cat="shop"]'); await page.click('.tool[data-tool="bakery"]'); await page.waitForTimeout(400);
    await page.screenshot({ path: __dirname + '/v-' + name + '.png' });
    const ov = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    console.log(name, 'scroll horizontal:', ov, 'erreurs:', errs.join(';') || 'aucune');
    await c.close();
  }
  await browser.close();
})();
