const { chromium } = require('playwright');
const assert = require('assert');
(async () => {
  const browser = await chromium.launch();
  const errs = [];
  // faux « claude.use » : db en mémoire (vérifie la parité des chemins), id d'utilisateur, comportements configurables
  const fake = () => {
    const store = (window.__store = window.__store || new Map());
    window.__log = [];
    window.__mode = { setErr: null, getHang: false, noUser: false, noDb: false };
    const doc = (path) => {
      if (path.split('/').length % 2) throw new TypeError('chemin de document impair: ' + path);
      return {
        async get() {
          window.__log.push('get ' + path);
          if (window.__mode.getHang) return new Promise(() => {});
          return { exists: store.has(path), data: () => store.get(path) && JSON.parse(JSON.stringify(store.get(path))), metadata: {} };
        },
        async set(d) {
          window.__log.push('set ' + path);
          if (window.__mode.setErr) throw { code: window.__mode.setErr, message: 'x' };
          if (JSON.stringify(d).length > 262144) throw { code: 'invalid_argument', message: 'trop gros' };
          store.set(path, JSON.parse(JSON.stringify(d)));
        }
      };
    };
    window.claude = { use: async (n) => {
      if (n === 'db') return window.__mode.noDb ? null : { doc, collection() { throw new Error('non utilisé'); } };
      if (n === 'user') return window.__mode.noUser ? null : { id: async () => 'u_abc123' };
      return null;
    } };
  };
  async function open(init) {
    const ctxb = await browser.newContext({ viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true });
    if (init) await ctxb.addInitScript(init);
    const page = await ctxb.newPage();
    page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/ERR_FAILED/.test(m.text())) errs.push(m.text()); });
    await page.route('**/*', (r) => r.request().url().startsWith('file:') ? r.continue() : r.abort());
    await page.goto('file://' + __dirname + '/page.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(300);
    await page.click('[data-act="start"]');
    return { ctxb, page };
  }
  const build = (page) => page.evaluate(() => {
    const V = window.__verticale, E = V.E, S = E.S; S.rank = 5; S.cash = 500000;
    E.place('shop', 0, 14); E.place('elev', 0, 17, { f1: 8 }); E.place('shop', 0, 22);
    for (let f = 1; f <= 8; f++) { E.place('apt', f, 18); E.place('apt', f, 20); E.place('apt', f, 15); }
    for (let i = 0; i < 2 * 2880; i++) E.step(0.1);
    V.ui.paused = true;
  });
  const st = (page) => page.evaluate(() => { const E = window.__verticale.E; return { rooms: E.S.rooms.size, cash: Math.round(E.S.cash), day: E.dateInfo().day }; });
  const info = (page) => page.locator('#cloud-info').innerText();
  const msg = (page) => page.locator('#cloud-msg').innerText();

  /* A. parcours normal */
  let { ctxb, page } = await open(fake);
  await build(page);
  const before = await st(page);
  await page.evaluate(() => window.__verticale.openMenu('save'));
  await page.waitForFunction(() => /Aucune partie/.test(document.querySelector('#cloud-info').textContent));
  console.log('1 info:', await info(page), '| Récupérer désactivé:', await page.locator('#btn-down').isDisabled(), '| Envoyer actif:', !(await page.locator('#btn-up').isDisabled()));
  await page.screenshot({ path: 's7.png' });
  await page.click('#btn-up');
  await page.waitForFunction(() => /envoyée/.test(document.querySelector('#cloud-msg').textContent));
  const stored = await page.evaluate(() => JSON.parse(JSON.stringify([...window.__store.entries()])));
  console.log('2 chemin:', stored[0][0], '| champs:', Object.keys(stored[0][1]).join(','), '| taille doc:', JSON.stringify(stored[0][1]).length, '| info:', await info(page));
  assert.strictEqual(stored[0][0], 'data/users/u_abc123/save');
  assert.strictEqual(stored[0][1].day, before.day); assert.strictEqual(stored[0][1].rooms, before.rooms);
  await page.screenshot({ path: 's8.png' });
  // nouvelle partie puis récupération
  await page.evaluate(() => document.querySelector('[data-close]').click());
  await page.evaluate(() => window.__verticale.openMenu('settings'));
  await page.click('[data-act="newgame"]'); await page.click('[data-act="newgame"]');
  await page.waitForTimeout(200); await page.click('[data-act="start"]');
  console.log('3 nouvelle partie:', JSON.stringify(await st(page)));
  await page.evaluate(() => window.__verticale.openMenu('save'));
  await page.waitForFunction(() => /jour/.test(document.querySelector('#cloud-info').textContent));
  await page.click('#btn-down');
  await page.waitForSelector('#cloud-msg [data-act="imp-go"]');
  console.log('4 récupération:', (await msg(page)).replace(/\n/g, ' '));
  await page.screenshot({ path: 's9.png' });
  await page.click('#cloud-msg [data-act="imp-go"]');
  await page.waitForTimeout(300);
  const after = await st(page);
  console.log('5 après remplacement:', JSON.stringify(after));
  assert.deepStrictEqual(after, before);

  // envoi d'une partie moins avancée par-dessus une plus avancée : confirmation demandée
  await page.evaluate(() => window.__verticale.openMenu('settings'));
  await page.click('[data-act="newgame"]'); await page.click('[data-act="newgame"]');
  await page.waitForTimeout(200); await page.click('[data-act="start"]');
  await page.evaluate(() => window.__verticale.openMenu('save'));
  await page.waitForFunction(() => /jour/.test(document.querySelector('#cloud-info').textContent));
  const setsBefore = await page.evaluate(() => window.__log.filter((l) => l.startsWith('set')).length);
  await page.click('#btn-up');
  await page.waitForSelector('[data-act="cloud-up-force"]');
  console.log('6 garde-fou:', (await msg(page)).replace(/\n/g, ' '));
  assert.strictEqual(await page.evaluate(() => window.__log.filter((l) => l.startsWith('set')).length), setsBefore);
  await page.screenshot({ path: 's10.png' });
  await page.click('[data-act="cloud-up-force"]');
  await page.waitForFunction(() => /envoyée dans le cloud/.test(document.querySelector('#cloud-msg').textContent));
  console.log('7 après forçage:', await info(page));

  // échecs
  await page.evaluate(() => { window.__mode.setErr = 'quota_exceeded'; });
  await page.click('#btn-up');
  await page.waitForFunction(() => document.querySelector('#cloud-msg .err'));
  console.log('8 quota:', await msg(page));
  await page.evaluate(() => { window.__mode.setErr = 'invalid_argument'; });
  await page.click('#btn-up');
  await page.waitForFunction(() => /refusé/.test(document.querySelector('#cloud-msg').textContent));
  console.log('9 droits:', await msg(page));
  assert.strictEqual(await page.locator('#btn-up').isDisabled(), false);
  // document du cloud altéré
  await page.evaluate(() => { window.__mode.setErr = null; window.__store.set('data/users/u_abc123/save', { v: 1, code: 'VERTICALE1.r.abc.00000000', day: 3, rooms: 9, rank: 1 }); });
  await page.click('#btn-down');
  await page.waitForFunction(() => document.querySelector('#cloud-msg .err'));
  console.log('10 cloud altéré:', await msg(page));
  assert.strictEqual(await page.locator('#cloud-msg [data-act="imp-go"]').count(), 0);
  // pas de réponse du cloud
  await page.evaluate(() => { window.__verticale.ui.cloudTimeout = 600; window.__mode.getHang = true; });
  await page.click('#btn-down');
  await page.waitForFunction(() => document.querySelector('#cloud-msg .err'), null, { timeout: 5000 });
  console.log('11 délai dépassé:', await msg(page), '| bouton réactivé:', !(await page.locator('#btn-up').isDisabled()));
  await ctxb.close();

  /* B. pas de capacité db (page ouverte hors claude.ai) */
  ({ ctxb, page } = await open(null));
  await page.evaluate(() => window.__verticale.openMenu('save'));
  await page.waitForFunction(() => /Indisponible/.test(document.querySelector('#cloud-info').textContent));
  console.log('12 sans claude:', await info(page), '| boutons désactivés:', await page.locator('#btn-up').isDisabled(), await page.locator('#btn-down').isDisabled());
  await page.screenshot({ path: 's11.png' });
  await ctxb.close();

  /* C. db présent mais pas d'identité, ou db null */
  for (const [label, mode] of [['sans identité', { noUser: true }], ['db null', { noDb: true }]]) {
    ({ ctxb, page } = await open('(' + fake.toString() + ')(); Object.assign(window.__mode, ' + JSON.stringify(mode) + ');'));
    await page.evaluate(() => window.__verticale.openMenu('save'));
    await page.waitForFunction(() => /Indisponible/.test(document.querySelector('#cloud-info').textContent));
    console.log('13 ' + label + ':', (await info(page)).slice(0, 40) + '…', '| boutons désactivés:', await page.locator('#btn-up').isDisabled(), await page.locator('#btn-down').isDisabled());
    await ctxb.close();
  }
  console.log('erreurs console:', errs.length ? errs.join('\n') : 'aucune');
  await browser.close();
})().catch((e) => { console.error('ÉCHEC', e); process.exit(1); });
