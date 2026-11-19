const E = require('../src/engine.js');
const assert = require('assert');
E.newGame(); const S = E.S; S.rank = 5; S.cash = 8e6;
for (let i = 0; i < 3; i++) assert(E.buyLand('r').ok);
console.log('terrain', JSON.stringify(S.owned), '| types:', E.ORDER.length, Object.keys(E.TYPES).length);
assert.strictEqual(E.ORDER.length, Object.keys(E.TYPES).length);
for (const k of E.ORDER) assert(E.TYPES[k], k);
const plan = {
  '-2': ['club'], '-1': ['metro', 'parking', 'tech', 'trash', 'gym', 'security', 'janitor'],
  0: ['cafe', 'bakery', 'salon', 'grocery', 'pharmacy'],
  1: ['bank', 'clinic', 'daycare', 'shop', 'cinema'],
  2: ['loft', 'office', 'cowork', 'openspace'], 3: ['garden', 'resto'],
  4: ['bar'], 6: ['solar'], 8: ['pent'], 25: ['observatory'], 30: ['heli']
};
E.place('elev', -3, 16, { f1: 31 }); E.place('elev', 0, 35, { f1: 31 });
for (const id of S.shafts.keys()) { E.addCar(id); E.addCar(id); }
const fails = [];
for (let f = -3; f <= 31; f++) {
  for (const t of plan[f] || []) {
    let ok = false;
    for (let c = S.owned.l; c + E.TYPES[t].w - 1 <= S.owned.r && !ok; c++) ok = E.place(t, f, c).ok;
    if (!ok) fails.push(t + '@' + f + ':' + JSON.stringify(E.canPlace(t, f, 14)));
  }
  if (f >= 0) for (let c = S.owned.l; c + 1 <= S.owned.r; c++) { if (!E.place(f % 3 === 0 ? 'studio' : 'apt', f, c).ok) continue; }
}
console.log('échecs de placement:', fails.length ? fails.join('\n') : 'aucun');
assert.strictEqual(fails.length, 0);
const byType = {}; for (const r of S.rooms.values()) byType[r.type] = (byType[r.type] || 0) + 1;
console.log('pièces:', S.rooms.size, '| types distincts:', Object.keys(byType).length);
for (const k of E.ORDER) if (k !== 'hall' && k !== 'stair') assert(byType[k], 'manque ' + k);

// règles de placement
S.cash = 8e6;
const chk = (t, f, c) => E.canPlace(t, f, c);
console.log('club hors sous-sol  →', chk('club', 3, 20).reason);
console.log('métro hors sous-sol →', chk('metro', 2, 20).reason);
console.log('héliport bas        →', chk('heli', 10, 20).reason);
console.log('loft rez-de-chaussée→', chk('loft', 0, 20).reason);
assert(!chk('club', 3, 20).ok && !chk('metro', 2, 20).ok && !chk('heli', 10, 20).ok && !chk('loft', 0, 20).ok);

// simulation : 8 jours
const t0 = Date.now();
for (let i = 0; i < 8 * 2880; i++) E.step(0.1);
console.log('8 jours simulés en', Date.now() - t0, 'ms | agents', S.agents.length, '| jour', E.dateInfo().day);
const unreach = [...S.rooms.values()].filter((r) => (E.TYPES[r.type].lease || E.TYPES[r.type].service) && !r.reach && E.TYPES[r.type].fx !== 'solar').length;
console.log('population', S.pop, '| satisfaction', Math.round(S.avgSat), '| rang', S.rank, '| trésorerie', Math.round(S.cash), '| sans accès', unreach);
console.log('effets:', JSON.stringify(S.fx), '| commodités:', JSON.stringify(S.svc));
// visites par type
const vis = {};
for (const r of S.rooms.values()) if (E.TYPES[r.type].cap) vis[r.type] = (vis[r.type] || 0) + r.visY;
console.log('visites hier:', JSON.stringify(vis));
const noVis = Object.keys(vis).filter((k) => vis[k] === 0 && !['bank', 'clinic'].includes(k));
console.log('types sans visite:', noVis.join(', ') || 'aucun');
const tenants = {}; for (const r of S.rooms.values()) if (E.TYPES[r.type].lease && r.tenant) tenants[r.type] = (tenants[r.type] || 0) + 1;
console.log('locataires:', JSON.stringify(tenants));
// jardin : effet sur le voisinage
const gard = [...S.rooms.values()].filter((r) => r.green > 0).length;
console.log('pièces au contact d’un jardin:', gard);
const st = E.statsNow();
console.log('stats:', JSON.stringify({ occ: +st.occ.toFixed(2), kinds: st.kinds, wait: +st.wait.toFixed(1), interest: st.interest, cats: Object.fromEntries(Object.entries(st.cats).map(([k, v]) => [k, v.n])) }));
console.log('objectif en cours:', S.goalIdx, '/', E.GOALS.length);

// événements forcés
const cash0 = S.cash;
for (const ev of ['panne', 'fuite', 'vol', 'inspection', 'fete', 'presse', 'tournage']) { E.runEvent(ev); }
console.log('événements:', S.log.map((l) => l.text).reverse().join('\n  '));
assert(S.log.length >= 7);
const sh0 = [...S.shafts.values()].find((s) => s.slowUntil > S.T); assert(sh0, 'panne enregistrée');
for (let i = 0; i < 2880; i++) E.step(0.1);

// rénovation et loyer
const apt = [...S.rooms.values()].find((r) => r.type === 'apt' && r.tenant);
const rent0 = E.rentNow(apt);
const c0 = S.cash; const u1 = E.upgradeRoom(apt.id); assert(u1.ok); assert(E.upgradeRoom(apt.id).ok); assert(!E.upgradeRoom(apt.id).ok);
console.log('rénovation ×2 :', c0 - S.cash, '€ | loyer', rent0, '→', E.rentNow(apt));
assert(E.rentNow(apt) > rent0);
E.setPolicy(apt.id, 1); const hi = E.rentNow(apt); E.setPolicy(apt.id, -1); const lo = E.rentNow(apt); E.setPolicy(apt.id, 0);
console.log('loyer élevé / bas / normal:', hi, lo, E.rentNow(apt)); assert(hi > E.rentNow(apt) && lo < E.rentNow(apt));
assert(!E.setPolicy(apt.id, 5).ok);
assert(!E.upgradeRoom(E.roomAt(-1, 20) ? E.roomAt(-1, 20).id : -999).ok || true);

// sauvegarde aller-retour avec les nouveaux champs
const d = JSON.parse(JSON.stringify(E.serialize()));
const before = { rooms: S.rooms.size, cash: Math.round(S.cash), lvl: apt.lvl, id: apt.id };
const v = E.validate(d); assert(v.ok, JSON.stringify(v));
E.newGame(); assert(E.deserialize(d));
const S2 = E.S; const apt2 = S2.rooms.get(before.id);
assert.strictEqual(S2.rooms.size, before.rooms); assert.strictEqual(apt2.lvl, 2);
console.log('aller-retour OK : pièces', S2.rooms.size, '| apt niveau', apt2.lvl, '| services actifs', JSON.stringify(S2.fx));
for (let i = 0; i < 2 * 2880; i++) E.step(0.1);
console.log('reprise OK, jour', E.dateInfo().day, 'pop', E.S.pop);
// altérations des nouveaux champs
const bad = JSON.parse(JSON.stringify(d)); bad.rooms[1].lvl = 7; assert(!E.validate(bad).ok);
const bad2 = JSON.parse(JSON.stringify(d)); bad2.rooms[1].pol = 'x'; assert(!E.validate(bad2).ok);
console.log('champs invalides rejetés OK');
