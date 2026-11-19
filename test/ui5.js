const { chromium } = require('playwright');
const assert = require('assert');
(async () => {
  const browser = await chromium.launch();
  const errs = [];
  async function open(opts, init) {
    const ctxb = await browser.newContext(Object.assign({ viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true }, opts || {}));
    await ctxb.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
    if (init) await ctxb.addInitScript(init);
    const page = await ctxb.newPage();
    page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/ERR_FAILED/.test(m.text())) errs.push(m.text()); });
    await page.route('**/*', (r) => r.request().url().startsWith('file:') ? r.continue() : r.abort());
    await page.goto('file://' + __dirname + '/page.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(300);
    return { ctxb, page };
  }
  const state = (page) => page.evaluate(() => { const E = window.__verticale.E; return { rooms: E.S.rooms.size, cash: Math.round(E.S.cash), T: Math.round(E.S.T), rank: E.S.rank, cars: [...E.S.shafts.values()].map(s => s.ncars) }; });

  /* ── A. export → nouvelle partie → import ── */
  let { ctxb, page } = await open();
  await page.click('[data-act="start"]');
  await page.evaluate(() => {
    const V = window.__verticale, E = V.E, S = E.S; S.rank = 5; S.cash = 500000;
    E.place('shop', 0, 14); E.place('elev', 0, 17, { f1: 8 }); E.place('shop', 0, 22);
    for (let f = 1; f <= 8; f++) { E.place('apt', f, 18); E.place('apt', f, 20); E.place('apt', f, 15); }
    E.addCar([...S.shafts.keys()][0]);
    for (let i = 0; i < 2 * 2880; i++) E.step(0.1);
    V.ui.paused = true;
  });
  const before = await state(page);
  console.log('avant', JSON.stringify(before));
  await page.evaluate(() => window.__verticale.openMenu('save'));
  console.log('onglet actif:', await page.locator('.tabs [aria-selected="true"]').innerText(), '| dernière sauvegarde:', await page.locator('#save-at').innerText());
  await page.screenshot({ path: 's3.png' });
  await page.click('[data-act="save-now"]');
  console.log('après sauvegarde manuelle:', await page.locator('#save-at').innerText(), '| toast:', await page.locator('.toast').last().innerText());
  assert.strictEqual(await page.locator('#btn-copy').isDisabled(), true);
  await page.click('[data-act="exp"]');
  await page.waitForFunction(() => document.querySelector('#exp').value.startsWith('VERTICALE1.'));
  const code = await page.inputValue('#exp');
  console.log('code:', code.slice(0, 30) + '…', code.length, 'car.', '| copier actif:', !(await page.locator('#btn-copy').isDisabled()));
  console.log('message:', await page.locator('#exp-msg').innerText());
  await page.click('[data-act="copy"]');
  await page.waitForTimeout(200);
  const clip = await page.evaluate(() => navigator.clipboard.readText().catch((e) => 'ERR ' + e.message));
  console.log('presse-papiers identique:', clip === code, '| message:', await page.locator('#exp-msg').innerText());
  await page.screenshot({ path: 's4.png' });

  // nouvelle partie
  await page.evaluate(() => { document.querySelector('[data-close]').click(); });
  await page.evaluate(() => window.__verticale.openMenu('settings'));
  await page.click('[data-act="newgame"]'); await page.click('[data-act="newgame"]');
  await page.waitForTimeout(200);
  const fresh = await state(page);
  console.log('nouvelle partie', JSON.stringify(fresh));
  assert.notStrictEqual(fresh.rooms, before.rooms);
  await page.click('[data-act="start"]');

  // import : code altéré, tronqué, non reconnu, vide, valide
  await page.evaluate(() => window.__verticale.openMenu('save'));
  async function tryImport(label, text) {
    await page.fill('#imp', text);
    await page.click('[data-act="imp-check"]');
    await page.waitForFunction(() => document.querySelector('#imp-msg').textContent.length > 0);
    console.log(' ', label.padEnd(22), '→', (await page.locator('#imp-msg').innerText()).replace(/\n/g, ' ').slice(0, 130));
  }
  const flip = code.slice(0, 40) + (code[40] === 'A' ? 'B' : 'A') + code.slice(41);
  await tryImport('vide', '');
  await tryImport('texte quelconque', 'bonjour');
  await tryImport('tronqué', code.slice(0, code.length - 30));
  await tryImport('un caractère modifié', flip);
  await tryImport('json brut', JSON.stringify({ v: 1 }));
  // faux code bien formé mais contenu invalide : checksum correct, JSON invalide
  const fake = await page.evaluate(async (c) => { return null; }, code);
  await tryImport('avec espaces/retours', code.replace(/(.{60})/g, '$1\n  '));
  console.log('bouton Remplacer présent:', await page.locator('[data-act="imp-go"]').count());
  assert.strictEqual(await page.locator('[data-act="imp-go"]').count(), 1);
  await page.screenshot({ path: 's5.png' });
  // modifier le champ efface le résumé
  await page.fill('#imp', code + 'x');
  console.log('après saisie, résumé effacé:', (await page.locator('#imp-msg').innerText()) === '');
  await page.fill('#imp', code);
  await page.click('[data-act="imp-check"]');
  await page.waitForSelector('[data-act="imp-go"]');
  await page.click('[data-act="imp-go"]');
  await page.waitForTimeout(300);
  const after = await state(page);
  console.log('après import', JSON.stringify(after));
  assert.strictEqual(after.rooms, before.rooms); assert.strictEqual(after.cash, before.cash); assert.deepStrictEqual(after.cars, before.cars);
  console.log('feuille fermée:', (await page.locator('.sheet').count()) === 0, '| toast:', await page.locator('.toast').last().innerText());
  // la partie importée est bien dans localStorage
  const ls = await page.evaluate(() => JSON.parse(localStorage.getItem('verticale-save-v1')).rooms.length);
  console.log('rooms dans localStorage:', ls);
  assert.strictEqual(ls, before.rooms);
  // la simulation continue sans erreur
  await page.evaluate(() => { window.__verticale.ui.paused = false; });
  await page.waitForTimeout(1200);
  console.log('simulation continue, T =', (await state(page)).T);
  // recharger la page : on reprend la partie importée
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(400);
  console.log('après rechargement', JSON.stringify(await state(page)).slice(0, 80));
  await ctxb.close();

  /* ── B. mauvais JSON avec bon checksum : l'import est refusé proprement ── */
  ({ ctxb, page } = await open());
  await page.click('[data-act="start"]');
  const bad = await page.evaluate(async () => {
    // on fabrique un code bien formé à partir d'une partie corrompue, en réutilisant les mêmes fonctions
    const E = window.__verticale.E; const d = JSON.parse(JSON.stringify(E.serialize())); d.cash = 'beaucoup';
    const raw = new TextEncoder().encode(JSON.stringify(d));
    let s = ''; raw.forEach((b) => { s += String.fromCharCode(b); });
    const body = btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    let h = 0x811c9dc5; const str = 'r' + body; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return 'VERTICALE1.r.' + body + '.' + (h >>> 0).toString(16).padStart(8, '0');
  });
  await page.evaluate(() => window.__verticale.openMenu('save'));
  await page.fill('#imp', bad); await page.click('[data-act="imp-check"]');
  await page.waitForFunction(() => document.querySelector('#imp-msg').textContent.length > 0);
  console.log('partie corrompue bien formée →', (await page.locator('#imp-msg').innerText()).slice(0, 120));
  assert.strictEqual(await page.locator('[data-act="imp-go"]').count(), 0);
  // bombe de décompression : petit code, énorme contenu
  const bomb = await page.evaluate(async () => {
    const big = new Uint8Array(20 * 1024 * 1024);
    const cs = new Blob([big]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    const buf = new Uint8Array(await new Response(cs).arrayBuffer());
    let s = ''; buf.forEach((b) => { s += String.fromCharCode(b); });
    const body = btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    let h = 0x811c9dc5; const str = 'z' + body; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return 'VERTICALE1.z.' + body + '.' + (h >>> 0).toString(16).padStart(8, '0');
  });
  console.log('taille du code-bombe:', bomb.length);
  await page.fill('#imp', bomb); await page.click('[data-act="imp-check"]');
  await page.waitForFunction(() => document.querySelector('#imp-msg').textContent.length > 0, null, { timeout: 15000 });
  console.log('bombe de décompression →', (await page.locator('#imp-msg').innerText()).slice(0, 100));
  await ctxb.close();

  /* ── C. localStorage bloqué ── */
  ({ ctxb, page } = await open({}, () => {
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });
  }));
  await page.click('[data-act="start"]');
  await page.evaluate(() => window.__verticale.openMenu('save'));
  await page.click('[data-act="save-now"]');
  await page.waitForTimeout(150);
  console.log('stockage bloqué, toast:', await page.locator('.toast').last().innerText());
  console.log('bandeau d’avertissement:', (await page.locator('.warnp').count()) === 1, '| dernière sauvegarde:', await page.locator('#save-at').innerText());
  await page.click('[data-act="exp"]');
  await page.waitForFunction(() => document.querySelector('#exp').value.startsWith('VERTICALE1.'));
  console.log('export possible sans stockage:', (await page.inputValue('#exp')).length, 'car.');
  await page.screenshot({ path: 's6.png' });
  await ctxb.close();

  /* ── D. sans CompressionStream : mode brut r ── */
  ({ ctxb, page } = await open({}, () => { delete window.CompressionStream; delete window.DecompressionStream; }));
  await page.click('[data-act="start"]');
  await page.evaluate(() => window.__verticale.openMenu('save'));
  await page.click('[data-act="exp"]');
  await page.waitForFunction(() => document.querySelector('#exp').value.startsWith('VERTICALE1.'));
  const raw = await page.inputValue('#exp');
  console.log('sans compression, mode:', raw.split('.')[1], '| longueur:', raw.length);
  await page.evaluate(() => document.querySelector('[data-close]').click());
  await page.evaluate(() => window.__verticale.openMenu('save'));
  await page.fill('#imp', raw); await page.click('[data-act="imp-check"]');
  await page.waitForSelector('[data-act="imp-go"]');
  console.log('import du code brut: OK');
  await ctxb.close();

  console.log('erreurs console:', errs.length ? errs.join('\n') : 'aucune');
  await browser.close();
})().catch((e) => { console.error('ÉCHEC', e); process.exit(1); });
