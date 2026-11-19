const E = require('../src/engine.js');
E.newGame(); const S = E.S; S.rank = 5; S.cash = 5e6;
const ok = (r, w) => { if (!r.ok) console.log('FAIL', w, r.reason); return r; };
// RDC: hall 18-21 ; escalier 22-23 (rows 0,1) ; apt 24 sur RDC ; boutique 14-16 ; elev 17
ok(E.place('shop', 0, 14), 'shop'); ok(E.place('elev', 0, 17, { f1: 6 }), 'elev');
ok(E.place('stair', 0, 22), 'stair'); ok(E.place('apt', 0, 24), 'apt0');
// R+1 : rooms continuous from 14 to 21 over shop(14-16), elev(17), hall(18-21)
ok(E.place('apt', 1, 14), 'a'); ok(E.place('apt', 1, 16), 'b'); ok(E.place('apt', 1, 18), 'c'); ok(E.place('apt', 1, 20), 'd');
// R+2 : col 22-23 above stair top row (f1) -> stair occupies rows 0,1 at cols 22-23 ; apt at row 2 cols 22
ok(E.place('apt', 2, 22), 'e');
// basement parking + stair from -1 to 0 at cols 24..25 -> rows -1,0 : (0,24) occupied by apt0 -> collision, so place basement stair at 26? owned.r=25
ok(E.place('parking', -1, 14), 'parking');
ok(E.place('elev', -1, 17, { f1: -1 }), 'elev basement');
const rooms = [...S.rooms.values()];
console.log('unreachable:', rooms.filter(r => !r.reach).map(r => r.type + '@' + E.label(r.f) + ':' + r.c));
console.log('shafts', [...S.shafts.values()].map(s => [s.col, s.f0, s.f1, s.ncars]));
// demolish tests
console.log('demolish elev mid', E.demolish([...S.rooms.values()].find(r => r.type === 'elev' && r.f === 3).id));
console.log('demolish apt with stuff above', E.demolish([...S.rooms.values()].find(r => r.type === 'apt' && r.f === 0).id));
// run 5 days
for (let i = 0; i < 5 * 2880; i++) E.step(0.1);
const t = rooms.filter(r => r.tenant && E.TYPES[r.type].lease).length;
console.log('tenants', t, 'pop', S.pop, 'cash', Math.round(S.cash), 'agents', S.agents.length);
// demolish while running: remove top elevator cell and a room with agents inside
const topE = [...S.rooms.values()].filter(r => r.type === 'elev' && r.shaft === [...S.shafts.keys()][0]).sort((a, b) => b.f - a.f)[0];
console.log('rm top elev', E.demolish(topE.id).ok);
for (let i = 0; i < 2 * 2880; i++) E.step(0.1);
console.log('after', 'pop', S.pop, 'agents', S.agents.length, 'stuck?', S.agents.filter(a => a.st === 'wait').length);
// save / load
const d = JSON.parse(JSON.stringify(E.serialize()));
E.deserialize(d);
for (let i = 0; i < 3 * 2880; i++) E.step(0.1);
console.log('reloaded', 'rooms', E.S.rooms.size, 'pop', E.S.pop, 'agents', E.S.agents.length, 'cash', Math.round(E.S.cash));
// stat agents states
const st = {}; for (const a of E.S.agents) st[a.st] = (st[a.st] || 0) + 1; console.log(st);
