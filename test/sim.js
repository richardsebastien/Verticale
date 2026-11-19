const E = require('../src/engine.js');
const arg = process.argv[2] || 'A';
const days = +(process.argv[3] || 10);

function must(r, what) { if (!r.ok) { console.log('FAIL', what, r.reason); } return r; }
function run(d) {
  const t0 = Date.now();
  const log = [];
  for (let i = 0; i < d * 288 / 0.1; i++) {
    E.step(0.1);
    const S = E.S;
    if (i % 2880 === 2879) {
      const h = S.hist[S.hist.length - 1];
      const rooms = [...S.rooms.values()];
      const tenants = rooms.filter(r => r.tenant && E.TYPES[r.type].lease).length;
      const lease = rooms.filter(r => E.TYPES[r.type].lease).length;
      const trips = rooms.filter(r => r.tenant && E.TYPES[r.type].lease).map(r => r.trip);
      const avgTrip = trips.length ? trips.reduce((a, b) => a + b, 0) / trips.length : 0;
      const sh = [...S.shafts.values()].map(s => s.wavg.toFixed(1) + '/' + s.ncars + 'c').join(' ');
      console.log(`J${h.day + 1} cash=${Math.round(S.cash)} net=${h.net} rent=${h.rent} sales=${h.sales} costs=${h.costs} pop=${S.pop} agents=${S.agents.length} tenants=${tenants}/${lease} sat=${Math.round(S.avgSat)} trip=${avgTrip.toFixed(1)} wait=${sh} attr=${Math.round(S.attr)} rank=${S.rank}`);
    }
    if (!isFinite(E.S.cash)) { console.log('NaN cash'); process.exit(1); }
  }
  console.log('time', Date.now() - t0, 'ms');
}
E.newGame();
const S = E.S;
if (arg === 'A') {
  for (const c of [14, 16, 22, 24]) must(E.place('apt', 0, c), 'apt ' + c);
  run(days);
}
if (arg === 'B' || arg === 'C') {
  S.rank = 5; S.cash = 2e6;
  for (const c of [14, 16, 23]) must(E.place('apt', 0, c), 'apt0 ' + c);
  must(E.place('elev', 0, 22, { f1: 15 }), 'elev');
  for (let f = 1; f <= 15; f++) for (const c of [14, 16, 18, 20, 23]) must(E.place('apt', f, c), 'apt f' + f + ' c' + c);
  if (arg === 'C') { E.addCar(S.shafts.values().next().value.id); E.addCar(S.shafts.values().next().value.id); }
  run(days);
}
if (arg === 'D') { // mixte : bureaux, boutiques, resto, conciergerie, escalier, parking
  S.rank = 5; S.cash = 3e6;
  must(E.place('shop', 0, 15), 'shop');        // 15-17
  must(E.place('resto', 0, 22), 'resto');      // 22-25
  must(E.place('stair', 0, 14 ), 'stair?');    // 14-15 collides -> expected fail
  must(E.place('janitor', 0, 26 - 1), 'jan?'); // 25 collides
  must(E.place('elev', 0, 21, { f1: 12 }), 'elev collides w/ hall (expected)');
  run(days);
}
if (arg === 'F') { // tour mixte réaliste
  S.rank = 5; S.cash = 3e6;
  // RDC : shop 14-16, hall 18-21 (existant), elev 17, resto 22-25
  must(E.place('shop', 0, 14), 'shop');
  must(E.place('elev', 0, 17, { f1: 14 }), 'elev');
  must(E.place('resto', 0, 22), 'resto');
  // S-1 : parking sous les cases 14..17 (sous-sol: pas de support requis)
  must(E.place('parking', -1, 14), 'parking');
  must(E.place('stair', -1, 18), 'stair basement');  // escalier -1 -> 0 ? collisions hall? (rows -1,0)
  // R+1 : conciergerie + appartements
  must(E.place('janitor', 1, 14), 'jan');
  for (let f = 1; f <= 14; f++) {
    if (f > 1) { must(E.place('apt', f, 14), 'apt'); }
    for (const c of [15, 18, 20]) if (c !== 15 || f > 1) { const r = E.place(f % 3 === 0 ? 'office' : 'apt', f, c); if (!r.ok && f < 4) console.log('place', f, c, r.reason); }
  }
  run(days);
}
