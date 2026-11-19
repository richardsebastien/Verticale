// compatibilité : une sauvegarde produite par l'ancien moteur se charge et continue avec le nouveau
const Old = require('/tmp/claude-0/-home-claude/f782166a-eab9-5d93-bfe2-60f88224f7ac/scratchpad/engine.before.js');
Old.newGame(); const So = Old.S; So.rank = 5; So.cash = 1e6;
Old.place('shop', 0, 14); Old.place('elev', 0, 17, { f1: 8 }); Old.place('shop', 0, 22); Old.place('resto', 0, 26);
for (let f = 1; f <= 8; f++) { Old.place('apt', f, 18); Old.place('apt', f, 20); Old.place('office', f, 22); }
for (let i = 0; i < 4 * 2880; i++) Old.step(0.1);
const d = JSON.parse(JSON.stringify(Old.serialize()));
const E = require('../src/engine.js');
const v = E.validate(d); console.log('ancienne sauvegarde valide:', JSON.stringify(v));
if (!v.ok) process.exit(1);
E.newGame(); if (!E.deserialize(d)) process.exit(2);
const S = E.S;
console.log('chargée : pièces', S.rooms.size, 'cash', Math.round(S.cash), 'pop', S.pop, 'objectif', S.goalIdx, '/', E.GOALS.length);
for (let i = 0; i < 3 * 2880; i++) E.step(0.1);
console.log('reprise OK : jour', E.dateInfo().day, 'pop', S.pop, 'net', Math.round(S.last.net), 'sat', Math.round(S.avgSat));
