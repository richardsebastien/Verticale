const E = require('../src/engine.js');
const assert = require('assert');
E.newGame(); const S = E.S; S.rank = 5; S.cash = 1e6;
E.place('shop', 0, 14); E.place('elev', 0, 17, { f1: 8 }); E.place('shop', 0, 22);
for (let f = 1; f <= 8; f++) { E.place('apt', f, 18); E.place('apt', f, 20); E.place('apt', f, 15); }
E.addCar([...S.shafts.keys()][0]);
for (let i = 0; i < 3 * 2880; i++) E.step(0.1);
const d = JSON.parse(JSON.stringify(E.serialize()));
const before = { rooms: S.rooms.size, cash: Math.round(S.cash), pop: S.pop, T: Math.round(S.T), cars: [...S.shafts.values()].map(s => s.ncars) };
console.log('validate ok:', JSON.stringify(E.validate(d)));
E.newGame();
assert(E.deserialize(d));
const S2 = E.S;
const after = { rooms: S2.rooms.size, cash: Math.round(S2.cash), pop: S2.pop, T: Math.round(S2.T), cars: [...S2.shafts.values()].map(s => s.ncars) };
console.log(JSON.stringify(before)); console.log(JSON.stringify(after));
assert.strictEqual(before.rooms, after.rooms); assert.strictEqual(before.cash, after.cash); assert.deepStrictEqual(before.cars, after.cars);
for (let i = 0; i < 2 * 2880; i++) E.step(0.1);
console.log('continues ok: day', E.dateInfo().day, 'pop', E.S.pop);
// altérations : chaque cas doit être refusé sans toucher à la partie en cours
const keep = JSON.stringify(E.serialize());
const bad = {
  'version': (x) => { x.v = 2; }, 'cash NaN': (x) => { x.cash = 'beaucoup'; }, 'type inconnu': (x) => { x.rooms[1].type = '__proto__'; },
  'chevauchement': (x) => { x.rooms.push(Object.assign({}, x.rooms[1], { id: 9999 })); }, 'hors terrain': (x) => { x.rooms[1].c = 39; },
  'sans hall': (x) => { x.rooms = x.rooms.filter(r => r.type !== 'hall'); }, 'rang': (x) => { x.rank = 9; },
  'ids dupliqués': (x) => { x.rooms[2].id = x.rooms[1].id; }, 'owned': (x) => { x.owned = { l: 30, r: 3 }; },
  'cabines': (x) => { x.shafts[0].ncars = 99; }, 'rooms non tableau': (x) => { x.rooms = {}; }, 'null': (x) => { Object.keys(x).forEach(k => delete x[k]); }
};
for (const [name, mut] of Object.entries(bad)) {
  const x = JSON.parse(JSON.stringify(d)); mut(x);
  const r = E.deserialize(x);
  assert.strictEqual(r, null, 'devait être refusé : ' + name);
  assert.strictEqual(JSON.stringify(E.serialize()), keep, 'partie modifiée par un refus : ' + name);
}
console.log('rejets OK:', Object.keys(bad).length);
// injection : champs inattendus ignorés
const x = JSON.parse(JSON.stringify(d)); x.rooms[1].reach = 'x'; x.rooms[1].w = 99; x.rooms[1].evil = '<img onerror=1>'; x.hist[0] && (x.hist[0].day = '<b>');
assert(E.deserialize(x)); const r1 = [...E.S.rooms.values()][1];
assert(!('evil' in r1) && r1.w !== 99); console.log('champs inattendus ignorés OK');
