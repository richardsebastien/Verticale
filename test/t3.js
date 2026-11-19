const E = require('../src/engine.js');
E.newGame(); const S = E.S; S.rank = 5; S.cash = 5e6;
const ok = (r, w) => { if (!r.ok) console.log('FAIL', w, r.reason); return r; };
// tour mixte propre : RDC shop 14-16 | elev 17 | hall 18-21 | elev 22 | resto 23-25?? (resto 4 wide) -> owned r=25: 22 is elev, so resto can't. use shop2 23-25.
ok(E.place('shop', 0, 14), 'shop'); ok(E.place('elev', 0, 17, { f1: 12 }), 'elevA');
ok(E.place('elev', 0, 22, { f1: 12 }), 'elevB'); ok(E.place('shop', 0, 23), 'shop2');
ok(E.place('janitor', 1, 15), 'jan');
ok(E.place('apt', 1, 15 + 1 - 0 - 1 + 1 + 1 - 1), 'x'); // dummy to see collision
for (let f = 1; f <= 12; f++) {
  const kinds = f % 4 === 0 ? ['office', 'office'] : ['apt', 'apt', 'apt'];
  // left block: cols 14..16 (3 wide) for office or apt+(1 gap) ; right of elevA: 18..21 ; right of elevB: 23..25
  if (f !== 1) E.place(f % 4 === 0 ? 'office' : 'apt', f, 14); else E.place('apt', 1, 14);
  E.place(f % 4 === 0 ? 'office' : 'apt', f, 18); E.place(f % 4 === 0 ? 'office' : 'apt', f, f % 4 === 0 ? 19 : 20);
  E.place(f % 4 === 0 ? 'office' : 'apt', f, 23);
}
E.addCar([...S.shafts.keys()][0]); E.addCar([...S.shafts.keys()][1]);
const rooms = [...S.rooms.values()];
console.log('rooms', rooms.length, 'lease', rooms.filter(r => E.TYPES[r.type].lease).length, 'unreach', rooms.filter(r => !r.reach && E.TYPES[r.type].lease).length);
let nightStates = [];
for (let d = 0; d < 6; d++) {
  for (let i = 0; i < 2880; i++) {
    E.step(0.1);
    // check 03:00 of each day
    const m = S.T % 1440;
    if (Math.abs(m - 180) < 0.26 && i % 1 === 0 && !nightStates[d]) {
      const st = {}; for (const a of S.agents) st[a.st] = (st[a.st] || 0) + 1; nightStates[d] = st;
    }
    for (const a of S.agents) {
      if (!isFinite(a.x) || !isFinite(a.fy)) { console.log('NaN agent', a.kind, a.st); process.exit(1); }
    }
  }
  const h = S.hist[S.hist.length - 1];
  console.log('J' + (d + 1), 'pop', S.pop, 'agents', S.agents.length, 'sat', Math.round(S.avgSat), 'net', h && h.net, 'sales', h && h.sales, 'rank', S.rank, 'wait', [...S.shafts.values()].map(s => s.wavg.toFixed(1)).join('/'), 'night', JSON.stringify(nightStates[d]));
}
const dirt = [...S.rooms.values()].filter(r => r.tenant && E.TYPES[r.type].lease).map(r => r.dirt);
console.log('avg dirt', (dirt.reduce((a, b) => a + b, 0) / dirt.length).toFixed(1), 'max', Math.max(...dirt).toFixed(1));
