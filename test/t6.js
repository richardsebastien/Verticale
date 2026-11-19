const E = require('../src/engine.js');
E.newGame(); const S = E.S; S.rank = 5; S.cash = 3e6;
for (let i = 0; i < 2; i++) E.buyLand('r');
const set = (t, f, c) => { const r = E.place(t, f, c); if (!r.ok) throw new Error(t + '@' + f + ',' + c + ' ' + r.reason); return r; };
E.place('elev', 0, 16, { f1: 12 }); E.place('elev', 0, 33, { f1: 12 });
for (const id of S.shafts.keys()) { E.addCar(id); E.addCar(id); }
E.place('janitor', -1, 20); E.place('studio', 0, 17);
// RDC : hall à 18..21 (existant)
[['cafe', 14], ['bakery', 22], ['shop', 24], ['grocery', 27]].forEach(([t, c]) => set(t, 0, c));
// f1
[['pharmacy', 14], ['bank', 17], ['salon', 20], ['clinic', 22], ['gym', 25]].forEach(([t, c]) => { const r = E.place(t, 1, c); if (!r.ok) console.log('  (placement)', t, r.reason); });
const fill = (f, t) => { for (let c = S.owned.l; c <= S.owned.r; c++) { if (E.roomAt(f, c)) continue; if (!E.place(t, f, c).ok) E.place('studio', f, c); } };
fill(1, 'apt');
for (let f = 2; f <= 9; f++) fill(f, f % 3 === 0 ? 'loft' : 'apt');
E.place('security', 0, 31); E.place('tech', -1, 14); E.place('trash', -1, 17);
console.log('pièces', S.rooms.size, 'cash', S.cash);
const rows = [];
for (let d = 1; d <= 25; d++) {
  for (let i = 0; i < 2880; i++) E.step(0.1);
  if (d % 5 === 0) {
    const L = S.last;
    rows.push(`J${d} cash=${Math.round(S.cash)} net=${Math.round(L.net)} rent=${Math.round(L.rent)} ventes=${Math.round(L.sales)} charges=${Math.round(L.costs)} pop=${S.pop} sat=${Math.round(S.avgSat)} attr=${Math.round(S.attr)} rang=${S.rank}`);
  }
}
console.log(rows.join('\n'));
const per = {};
for (const r of S.rooms.values()) { const T = E.TYPES[r.type]; if (!T.lease) continue; const o = per[r.type] || (per[r.type] = { n: 0, t: 0, sat: 0, vis: 0, rent: 0 }); o.n++; if (r.tenant) { o.t++; o.sat += r.sat; o.vis += r.visY; o.rent += E.rentNow(r); } }
for (const [k, o] of Object.entries(per)) console.log(k.padEnd(10), 'locataires', o.t + '/' + o.n, 'sat', o.t ? Math.round(o.sat / o.t) : '-', 'visites/j', o.t ? (o.vis / o.t).toFixed(1) : '-', 'tgt', E.TYPES[k].tgt || '-', 'loyer total', o.rent);
console.log('attente ascenseurs', [...S.shafts.values()].map((s) => Math.round(s.wavg) + ' s').join(', '), '| départs', S.stats.outs, '| emménagements', S.stats.moves);
console.log('objectif', S.goalIdx, '| effets', JSON.stringify(S.fx));
