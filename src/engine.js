'use strict';
/* Verticale — moteur de simulation (sans DOM, testable sous Node) */
(function (root) {

const COLS = 40, FMIN = -3, FMAX = 45, NF = FMAX - FMIN + 1;
const DAY = 1440;            // minutes de jeu par jour
const MPS = 5;               // minutes de jeu par seconde de simulation
const STEP = 0.1;            // pas de simulation (s)
const WALK = 3.2, STAIR_T = 2.6, ELEV_V = 2.8, CAP = 8, MAX_CARS = 4;
const CAR_COST = 2500, CAR_UPKEEP = 80;
const RANK_FLOORS = [0, 6, 12, 20, 32, 45];
const RANK_BASE = [0, -1, -1, -2, -3, -3];
const RANK_POP = [0, 0, 20, 60, 140, 260];
const RANK_SAT = [0, 0, 0, 52, 60, 66];
const BASE_DATE = [2027, 2, 1]; // lundi 1er mars

// lease = loué à un locataire ; floors : up (>=0) | basement (<0) | ground (=0) | any
// cat : base | home | work | shop | leisure | service (palette)
// Commerces : cap (visiteurs simultanés max), hours [ouverture, fermeture] en minutes (fermeture > 1440 = après minuit),
//   days 'week' (lun-ven), price [min, max] par visite, dur [min, max] minutes, flow (attrait), prof (profil horaire),
//   tgt (visites/jour pour une satisfaction pleine), tags (choix des clients), svc (commodités offertes), noise (poids sonore, négatif = apaise)
// Employés : wk 'office' (semaine, déjeuner) | 'shop' | 'resto' (horaires du commerce), staff [min, max]
// Logement : res (habitants), base/nk/sk/vk/amen : réglages de satisfaction
// Services (service: true) : toujours « occupés », sans loyer ; fx : effet global ; income : revenu par jour
const TYPES = {
  hall:    { cat: 'base', name: 'Hall', w: 4, h: 1, cost: 1500,  upkeep: 12, rank: 1, floors: 'ground',
             desc: 'Seule porte d’entrée de la tour. Plus de halls attirent plus de monde.' },
  elev:    { cat: 'base', name: 'Ascenseur', ab: 'Asc.', w: 1, h: 1, cost: 700,   upkeep: 10, rank: 1, floors: 'any', noise: 5,
             desc: 'Glissez sur la hauteur voulue. La première cabine est incluse.' },
  stair:   { cat: 'base', name: 'Escalier', w: 2, h: 2, cost: 1100,  upkeep: 8,  rank: 1, floors: 'any', noise: 2,
             desc: 'Relie deux étages. Pratique en bas de la tour, trop lent au-delà.' },

  studio:  { cat: 'home', name: 'Studio', w: 1, h: 1, cost: 1300, upkeep: 8, rent: 105, rank: 1, lease: true, floors: 'up', base: 80, res: [1, 1],
             desc: 'Une pièce pour une personne. Bon marché, moins confortable.' },
  apt:     { cat: 'home', name: 'Appartement', ab: 'Appart.', w: 2, h: 1, cost: 2400,  upkeep: 14, rent: 200, rank: 1, lease: true,  floors: 'up', base: 86,
             desc: 'Loge un ou deux habitants. Aime le calme, la hauteur et la propreté.' },
  loft:    { cat: 'home', name: 'Loft', w: 3, h: 1, cost: 6200, upkeep: 22, rent: 520, rank: 3, lease: true, floors: 'up', minF: 2, base: 88, nk: 1.25, vk: 1.4, amen: 1.4, res: [2, 3],
             desc: 'Grand volume pour deux ou trois personnes. Très sensible au bruit, adore la vue et les commodités.' },
  pent:    { cat: 'home', name: 'Penthouse', ab: 'Penth.', w: 4, h: 1, cost: 14000, upkeep: 30, rent: 1100, rank: 4, lease: true, floors: 'up', minF: 8, base: 92, nk: 1.5, sk: 1.3, res: [2, 2],
             desc: 'Luxe, à partir du 8e étage. Exige un ascenseur rapide.' },

  office:  { cat: 'work', name: 'Bureau', w: 3, h: 1, cost: 4800,  upkeep: 26, rent: 380, rank: 2, lease: true, floors: 'up', wk: 'office', staff: [3, 4], nk: 0.5, base: 86,
             desc: 'Quatre employés arrivent le matin et déjeunent à midi.' },
  cowork:  { cat: 'work', name: 'Coworking', ab: 'Cowork.', w: 4, h: 1, cost: 7600, upkeep: 40, rent: 520, rank: 3, lease: true, floors: 'up', wk: 'office', staff: [5, 7], nk: 0.5, base: 88, noise: 2,
             desc: 'Postes partagés, beaucoup de monde en semaine. Apprécie les cafés et la salle de sport.' },
  openspace: { cat: 'work', name: 'Open space', ab: 'Open sp.', w: 6, h: 1, cost: 15000, upkeep: 70, rent: 980, rank: 4, lease: true, floors: 'up', wk: 'office', staff: [8, 10], nk: 0.4, base: 86, noise: 3,
             desc: 'Un grand plateau de dix employés. Demande des ascenseurs rapides.' },
  bank:    { cat: 'work', name: 'Banque', w: 3, h: 1, cost: 9000, upkeep: 45, rent: 480, rank: 4, lease: true, floors: 'up', wk: 'office', staff: [3, 4], nk: 0.4, base: 86, noise: 1,
             cap: 3, hours: [540, 1020], days: 'week', price: [4, 16], dur: [8, 18], flow: 0.6, prof: 'day', tags: ['any'], fx: 'bank',
             desc: 'Agence ouverte en semaine. Un banquier installé ramène l’intérêt de vos prêts à 0,3 % par jour.' },
  clinic:  { cat: 'work', name: 'Clinique', ab: 'Clinique', w: 3, h: 1, cost: 8500, upkeep: 42, rent: 470, rank: 3, lease: true, floors: 'up', wk: 'office', staff: [2, 3], nk: 0.4, base: 86, noise: 1,
             cap: 3, hours: [480, 1140], days: 'week', price: [20, 60], dur: [20, 40], flow: 0.7, prof: 'day', tags: ['any'], svc: ['health'],
             desc: 'Médecins en semaine. Les habitants apprécient d’avoir un cabinet dans la tour.' },
  daycare: { cat: 'work', name: 'Crèche', w: 3, h: 1, cost: 6800, upkeep: 38, rent: 360, rank: 3, lease: true, floors: 'up', wk: 'office', staff: [2, 3], nk: 0.6, base: 86, noise: 4, svc: ['kids'],
             desc: 'Rassure les familles : un atout pour les logements. On y entend des enfants.' },

  shop:    { cat: 'shop', name: 'Boutique', w: 3, h: 1, cost: 4200,  upkeep: 22, rent: 240, rank: 2, lease: true, floors: 'up', cap: 4,
             hours: [600, 1170], price: [15, 23], dur: [8, 20], flow: 1, prof: 'day', tgt: 10, tags: ['shop', 'any'], svc: ['shop'], wk: 'shop', staff: [1, 2], noise: 6,
             desc: 'Vit des passages. Mieux placée près du hall et de l’ascenseur.' },
  bakery:  { cat: 'shop', name: 'Boulangerie', ab: 'Boulang.', w: 2, h: 1, cost: 2600, upkeep: 14, rent: 160, rank: 2, lease: true, floors: 'up', cap: 3,
             hours: [390, 1170], price: [3, 8], dur: [5, 10], flow: 0.9, prof: 'morn', tags: ['shop', 'lunch', 'any'], svc: ['shop'], wk: 'shop', staff: [1, 2], noise: 1,
             desc: 'Pain frais dès 6 h 30. Beaucoup de petites ventes le matin.' },
  cafe:    { cat: 'shop', name: 'Café', w: 2, h: 1, cost: 2800, upkeep: 14, rent: 170, rank: 2, lease: true, floors: 'up', cap: 3,
             hours: [420, 1140], price: [4, 9], dur: [10, 20], flow: 0.9, prof: 'morn', tags: ['lunch', 'any'], svc: ['food', 'cafe'], wk: 'shop', staff: [1, 2], noise: 3,
             desc: 'Le premier café des habitants et des employés. Un peu bruyant.' },
  salon:   { cat: 'shop', name: 'Coiffeur', w: 2, h: 1, cost: 3000, upkeep: 14, rent: 180, rank: 2, lease: true, floors: 'up', cap: 2,
             hours: [540, 1140], price: [18, 45], dur: [25, 45], flow: 0.5, prof: 'day', tags: ['any'], svc: ['beauty'], wk: 'shop', staff: [1, 2], noise: 1,
             desc: 'Peu de clients mais des tickets élevés.' },
  grocery: { cat: 'shop', name: 'Supérette', ab: 'Supér.', w: 4, h: 1, cost: 6500, upkeep: 34, rent: 380, rank: 3, lease: true, floors: 'up', cap: 6,
             hours: [480, 1260], price: [12, 40], dur: [10, 20], flow: 1.4, prof: 'day', tags: ['shop', 'any'], svc: ['shop', 'grocery'], wk: 'shop', staff: [2, 3], noise: 4,
             desc: 'Les courses sans sortir de chez soi : un vrai plus pour les logements.' },
  pharmacy: { cat: 'shop', name: 'Pharmacie', ab: 'Pharma.', w: 2, h: 1, cost: 3800, upkeep: 20, rent: 230, rank: 3, lease: true, floors: 'up', cap: 3,
             hours: [540, 1140], price: [8, 30], dur: [6, 12], flow: 0.6, prof: 'day', tags: ['shop', 'any'], svc: ['shop', 'health'], wk: 'shop', staff: [1, 2], noise: 1,
             desc: 'Rassure les habitants. Clientèle régulière.' },
  resto:   { cat: 'shop', name: 'Restaurant', ab: 'Resto', w: 4, h: 1, cost: 7800,  upkeep: 40, rent: 430, rank: 3, lease: true, floors: 'up', cap: 10,
             hours: [690, 1350], price: [24, 36], dur: [35, 55], flow: 1.3, prof: 'day', tgt: 10, tags: ['lunch', 'any'], svc: ['food'], wk: 'resto', staff: [2, 3], noise: 10,
             desc: 'Affluence à midi et le soir. Bruyant pour les voisins.' },

  gym:     { cat: 'leisure', name: 'Salle de sport', ab: 'Sport', w: 4, h: 1, cost: 8200, upkeep: 44, rent: 450, rank: 3, lease: true, floors: 'any', cap: 6,
             hours: [360, 1320], price: [6, 14], dur: [45, 75], flow: 1, prof: 'eve', tags: ['leisure', 'any'], svc: ['fitness'], wk: 'resto', staff: [2, 2], noise: 7,
             desc: 'Pic tôt le matin et en soirée. Sa musique s’entend dans les étages voisins.' },
  cinema:  { cat: 'leisure', name: 'Cinéma', w: 5, h: 1, cost: 14000, upkeep: 70, rent: 760, rank: 4, lease: true, floors: 'up', cap: 16,
             hours: [840, 1500], price: [7, 13], dur: [90, 125], flow: 2.2, prof: 'eve', tags: ['leisure', 'any'], svc: ['leisure'], wk: 'resto', staff: [3, 3], noise: 6,
             desc: 'Séances de 14 h à 1 h. Grosse affluence le soir et le week-end.' },
  bar:     { cat: 'leisure', name: 'Bar-lounge', ab: 'Bar', w: 4, h: 1, cost: 7600, upkeep: 40, rent: 420, rank: 4, lease: true, floors: 'up', minF: 4, cap: 8,
             hours: [1020, 1560], price: [6, 24], dur: [40, 90], flow: 1.3, prof: 'eve', tags: ['leisure', 'any'], svc: ['leisure'], wk: 'resto', staff: [2, 2], noise: 9,
             desc: 'Ouvert de 17 h à 2 h, de l’étage 4 au sommet. Une belle vue vaut un bon chiffre d’affaires.' },
  club:    { cat: 'leisure', name: 'Club', w: 5, h: 1, cost: 12000, upkeep: 60, rent: 620, rank: 4, lease: true, floors: 'basement', cap: 14,
             hours: [1260, 1740], price: [15, 45], dur: [60, 120], flow: 2, prof: 'night', tags: ['leisure', 'any'], svc: ['leisure'], wk: 'resto', staff: [3, 3], noise: 16,
             desc: 'Sous-sol uniquement, de 21 h à 5 h. Très bruyant : loin des logements.' },
  observatory: { cat: 'leisure', name: 'Observatoire', ab: 'Observ.', w: 5, h: 1, cost: 24000, upkeep: 110, rent: 900, rank: 5, lease: true, floors: 'up', minF: 25, cap: 20,
             hours: [540, 1320], price: [12, 22], dur: [20, 45], flow: 2.5, prof: 'day', tags: ['leisure', 'any'], svc: ['leisure'], wk: 'resto', staff: [3, 3], noise: 3,
             desc: 'Panorama payant à partir du 25e étage. Les touristes montent en nombre.' },

  janitor: { cat: 'service', name: 'Conciergerie', ab: 'Concierge', w: 2, h: 1, cost: 2000, upkeep: 70, rank: 2, floors: 'any', service: true, noise: 2,
             desc: 'Un concierge nettoie les pièces sales, de 7 h à 19 h.' },
  trash:   { cat: 'service', name: 'Local déchets', ab: 'Déchets', w: 2, h: 1, cost: 1800, upkeep: 10, rank: 2, floors: 'any', service: true, fx: 'trash',
             desc: 'Les poubelles quittent les étages : la saleté s’accumule 20 % moins vite.' },
  security: { cat: 'service', name: 'Poste de sécurité', ab: 'Sécurité', w: 2, h: 1, cost: 3500, upkeep: 55, rank: 3, floors: 'any', service: true, fx: 'sec', svc: ['sec'],
             desc: 'Déjoue les cambriolages et rassure les habitants.' },
  tech:    { cat: 'service', name: 'Local technique', ab: 'Technique', w: 3, h: 1, cost: 5200, upkeep: 40, rank: 3, floors: 'any', service: true, fx: 'tech',
             desc: 'Moins de pannes d’ascenseur, réparées plus vite, et 20 % de moins sur leur entretien.' },
  garden:  { cat: 'service', name: 'Jardin', w: 3, h: 1, cost: 4200, upkeep: 16, rank: 3, floors: 'up', service: true, noise: -6,
             desc: 'Apaise et embellit les pièces proches (même étage ou voisins directs) : moins de bruit, plus de vue.' },
  parking: { cat: 'service', name: 'Parking', ab: 'Parking', w: 4, h: 1, cost: 3200,  upkeep: 12, rent: 170, rank: 3, lease: true, floors: 'basement', noise: 3,
             desc: 'Sous-sol uniquement. Un revenu calme qui valorise la tour.' },
  solar:   { cat: 'service', name: 'Panneaux solaires', ab: 'Solaire', w: 3, h: 1, cost: 6500, upkeep: 6, rank: 4, floors: 'up', minF: 6, service: true, fx: 'solar', income: 75,
             desc: 'Rapporte 75 € par jour, sans accès nécessaire. À poser en hauteur.' },
  metro:   { cat: 'service', name: 'Station de métro', ab: 'Métro', w: 4, h: 1, cost: 20000, upkeep: 130, rank: 4, floors: 'basement', service: true, fx: 'metro',
             desc: 'Sous-sol. Amène 30 % de clients en plus et rend la tour plus attirante.' },
  heli:    { cat: 'service', name: 'Héliport', ab: 'Hélipad', w: 4, h: 1, cost: 30000, upkeep: 150, rank: 5, floors: 'up', minF: 30, service: true, fx: 'heli',
             desc: 'Le luxe en toit-terrasse : penthouses loués plus vite et 10 % plus cher.' }
};
const ORDER = ['hall', 'elev', 'stair', 'studio', 'apt', 'loft', 'pent', 'office', 'cowork', 'openspace', 'bank', 'clinic', 'daycare',
  'shop', 'bakery', 'cafe', 'grocery', 'pharmacy', 'salon', 'resto', 'gym', 'cinema', 'bar', 'club', 'observatory',
  'janitor', 'trash', 'security', 'tech', 'garden', 'parking', 'solar', 'metro', 'heli'];
const CATS = [['base', 'Base'], ['home', 'Logement'], ['work', 'Travail'], ['shop', 'Commerces'], ['leisure', 'Loisirs'], ['service', 'Services']];

let S = null;
let nav = { nodes: [], byFloor: new Map(), byShaft: new Map() };
let segGrid = [];
let reachSeg = new Set();
let acc = 0;
let pending = [];

const rnd = () => Math.random();
const rr = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sgn = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);

/* ───────────────────────── état ───────────────────────── */

function newState() {
  S = {
    v: 1, T: 7 * 60, simT: 0, lastHour: 7, lastDay: 0,
    cash: 40000, debt: 0, owned: { l: 14, r: 25 }, landBuys: 0, rank: 1,
    nextId: 1, rooms: new Map(), shafts: new Map(),
    grid: Array.from({ length: NF }, () => new Int32Array(COLS)),
    agents: [], events: [], hist: [], today: { sales: 0 },
    attr: 55, pop: 0, avgSat: 70, svc: {}, fx: {}, venues: 0, log: [],
    goalIdx: 0, spawnAcc: 0, advice: [], over: false, debtDays: 0, stats: { moves: 0, outs: 0 }
  };
  segGrid = Array.from({ length: NF }, () => new Int32Array(COLS));
  nav = { nodes: [], byFloor: new Map(), byShaft: new Map() };
  addRoomRaw('hall', 0, 18);
  rebuild();
  return S;
}

function addRoomRaw(type, f, c, extra) {
  const T = TYPES[type];
  const r = Object.assign({
    id: S.nextId++, type, f, c, w: T.w, h: T.h, tenant: false, sat: 70, dirt: 0,
    vis: 0, visToday: 0, visAvg: 5, visY: 0, lost: 0, low: 0, trip: 10, reach: false,
    cleaner: 0, noise: 0, green: 0, lvl: 0, pol: 0, bd: {}, shaft: 0, paid: T.cost
  }, extra || {});
  S.rooms.set(r.id, r);
  for (let rowf = f; rowf < f + r.h; rowf++)
    for (let k = c; k < c + r.w; k++) S.grid[rowf - FMIN][k] = r.id;
  if (type === 'hall' || T.service) r.tenant = true;
  return r;
}

function roomAt(f, c) {
  if (f < FMIN || f > FMAX || c < 0 || c >= COLS) return null;
  const id = S.grid[f - FMIN][c];
  return id ? S.rooms.get(id) : null;
}
const segAt = (f, c) => (f < FMIN || f > FMAX || c < 0 || c >= COLS) ? 0 : segGrid[f - FMIN][c];
const maxFloor = () => RANK_FLOORS[S.rank];
const minFloor = () => RANK_BASE[S.rank];
const dayOf = (T) => Math.floor(T / DAY);
const wdayOf = (T) => dayOf(T) % 7;      // 0 = lundi
const label = (f) => (f === 0 ? 'RDC' : f > 0 ? 'R+' + f : 'S' + f);

function dateInfo() {
  const d = new Date(BASE_DATE[0], BASE_DATE[1], BASE_DATE[2] + dayOf(S.T));
  const jours = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  const mois = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const m = Math.floor(S.T % DAY);
  return {
    day: dayOf(S.T) + 1, wd: wdayOf(S.T), jour: jours[d.getDay()], date: d.getDate(), mois: mois[d.getMonth()],
    hh: String(Math.floor(m / 60)).padStart(2, '0'), mm: String(m % 60).padStart(2, '0'), minute: m
  };
}

function emit(e) { S.events.push(e); if (S.events.length > 300) S.events.splice(0, 100); }
function toast(msg, level) { emit({ k: 'toast', msg, level: level || 'info' }); }

/* ───────────────────────── construction ───────────────────────── */

function costOf(type, f, c, o) {
  const T = TYPES[type];
  if (type !== 'elev') return T.cost;
  o = o || {};
  const f1 = o.f1 != null ? o.f1 : f;
  const fa = Math.min(f, f1), fb = Math.max(f, f1);
  let cost = (fb - fa + 1) * T.cost;
  const below = roomAt(fa - 1, c), above = roomAt(fb + 1, c);
  if (!((below && below.type === 'elev') || (above && above.type === 'elev'))) cost += CAR_COST;
  return cost;
}

function canPlace(type, f, c, o) {
  o = o || {};
  const T = TYPES[type];
  if (!T) return { ok: false, reason: 'Type inconnu' };
  if (S.rank < T.rank) return { ok: false, reason: 'Rang ★' + T.rank + ' requis' };
  const f1 = type === 'elev' && o.f1 != null ? o.f1 : f;
  const fa = Math.min(f, f1), fb = Math.max(f, f1) + (type === 'elev' ? 0 : T.h - 1);
  if (c < S.owned.l || c + T.w - 1 > S.owned.r) return { ok: false, reason: 'Hors de votre terrain' };
  if (fa < minFloor()) return { ok: false, reason: 'Sous-sol limité (rang ★' + (S.rank + 1) + ')' };
  if (fb > maxFloor()) return { ok: false, reason: 'Hauteur limitée à ' + label(maxFloor()) + ' (rang ★' + S.rank + ')' };
  if (T.floors === 'ground' && f !== 0) return { ok: false, reason: 'Rez-de-chaussée uniquement' };
  if (T.floors === 'basement' && fb >= 0) return { ok: false, reason: 'Sous-sol uniquement' };
  if (T.floors === 'up' && fa < 0) return { ok: false, reason: 'Pas en sous-sol' };
  if (T.minF && f < T.minF) return { ok: false, reason: 'À partir de ' + label(T.minF) };
  for (let rowf = fa; rowf <= fb; rowf++)
    for (let k = c; k < c + T.w; k++)
      if (S.grid[rowf - FMIN][k]) return { ok: false, reason: 'Emplacement occupé' };
  if (fa > 0)
    for (let k = c; k < c + T.w; k++)
      if (!S.grid[fa - 1 - FMIN][k]) return { ok: false, reason: 'Rien en dessous pour porter' };
  return { ok: true, cost: costOf(type, f, c, o) };
}

function place(type, f, c, o) {
  o = o || {};
  const chk = canPlace(type, f, c, o);
  if (!chk.ok) return chk;
  if (S.cash < chk.cost) return { ok: false, reason: 'Fonds insuffisants' };
  S.cash -= chk.cost;
  let made = null;
  if (type === 'elev') {
    const f1 = o.f1 != null ? o.f1 : f;
    const fa = Math.min(f, f1), fb = Math.max(f, f1);
    const share = (chk.cost) / (fb - fa + 1);
    for (let k = fa; k <= fb; k++) made = addRoomRaw('elev', k, c, { paid: share });
  } else {
    made = addRoomRaw(type, f, c, { paid: chk.cost });
    if (type === 'janitor') { made.tenant = true; }
  }
  rebuild();
  if (type === 'janitor') spawnTenantAgents(made, true);
  emit({ k: 'sound', name: 'build' });
  return { ok: true, id: made.id, cost: chk.cost };
}

function canDemolish(r) {
  if (r.type === 'hall') {
    let halls = 0;
    for (const x of S.rooms.values()) if (x.type === 'hall') halls++;
    if (halls <= 1) return { ok: false, reason: 'Gardez au moins un hall' };
  }
  const topf = r.f + r.h;
  for (let k = r.c; k < r.c + r.w; k++) {
    const above = roomAt(topf, k);
    if (!above) continue;
    if (r.type === 'elev' && above.type === 'elev') {
      // on ne retire un ascenseur que par ses extrémités
      return { ok: false, reason: 'Retirez l’ascenseur par le haut' };
    }
    return { ok: false, reason: 'Retirez d’abord ce qui est au-dessus' };
  }
  if (r.type === 'elev') {
    const below = roomAt(r.f - 1, r.c);
    const above = roomAt(r.f + 1, r.c);
    if (below && below.type === 'elev' && above && above.type === 'elev') return { ok: false, reason: 'Retirez l’ascenseur par une extrémité' };
  }
  return { ok: true, refund: Math.round(r.paid * 0.5) };
}

function demolish(id) {
  const r = S.rooms.get(id);
  if (!r) return { ok: false, reason: 'Introuvable' };
  const chk = canDemolish(r);
  if (!chk.ok) return chk;
  S.cash += chk.refund;
  removeAgentsOf(r);
  for (let rowf = r.f; rowf < r.f + r.h; rowf++)
    for (let k = r.c; k < r.c + r.w; k++) S.grid[rowf - FMIN][k] = 0;
  S.rooms.delete(id);
  rebuild();
  emit({ k: 'sound', name: 'demolish' });
  return { ok: true, refund: chk.refund };
}

function landCost() { return Math.round(9000 * Math.pow(1.7, S.landBuys) / 100) * 100; }
function buyLand(side) {
  const cost = landCost();
  if (side === 'l' && S.owned.l - 4 < 0) return { ok: false, reason: 'Limite du quartier' };
  if (side === 'r' && S.owned.r + 4 > COLS - 1) return { ok: false, reason: 'Limite du quartier' };
  if (S.cash < cost) return { ok: false, reason: 'Fonds insuffisants' };
  S.cash -= cost; S.landBuys++;
  if (side === 'l') S.owned.l -= 4; else S.owned.r += 4;
  emit({ k: 'sound', name: 'cash' });
  return { ok: true, cost };
}

function addCar(sid) {
  const sh = S.shafts.get(sid);
  if (!sh) return { ok: false, reason: 'Introuvable' };
  if (sh.ncars >= MAX_CARS) return { ok: false, reason: 'Maximum ' + MAX_CARS + ' cabines' };
  if (S.cash < CAR_COST) return { ok: false, reason: 'Fonds insuffisants' };
  S.cash -= CAR_COST; sh.ncars++; syncCars(sh);
  emit({ k: 'sound', name: 'build' });
  return { ok: true };
}
function removeCar(sid) {
  const sh = S.shafts.get(sid);
  if (!sh || sh.ncars <= 1) return { ok: false, reason: 'Une cabine minimum' };
  S.cash += Math.round(CAR_COST / 2); sh.ncars--;
  const gone = sh.cars.pop();
  for (const p of gone.pass) { p.f = Math.round(gone.y); p.x = sh.col + 0.5; p.fy = p.f; p.car = null; p.st = 'free'; resume(p); }
  syncCars(sh);
  return { ok: true };
}
function upgradeCost(sh) { return 4000 * sh.lvl; }
function upgradeShaft(sid) {
  const sh = S.shafts.get(sid);
  if (!sh) return { ok: false, reason: 'Introuvable' };
  if (sh.lvl >= 3) return { ok: false, reason: 'Déjà au maximum' };
  if (S.rank < 3) return { ok: false, reason: 'Rang ★3 requis' };
  const c = upgradeCost(sh);
  if (S.cash < c) return { ok: false, reason: 'Fonds insuffisants' };
  S.cash -= c; sh.lvl++;
  emit({ k: 'sound', name: 'build' });
  return { ok: true };
}
function upgradeRoomCost(r) { return Math.round(TYPES[r.type].cost * 0.5 * ((r.lvl || 0) + 1) / 10) * 10; }
function upgradeRoom(id) {
  const r = S.rooms.get(id);
  if (!r) return { ok: false, reason: 'Introuvable' };
  const T = TYPES[r.type];
  if (!T.lease || r.type === 'parking') return { ok: false, reason: 'Pas de rénovation possible ici' };
  if ((r.lvl || 0) >= 2) return { ok: false, reason: 'Déjà au niveau maximal' };
  const c = upgradeRoomCost(r);
  if (S.cash < c) return { ok: false, reason: 'Fonds insuffisants' };
  S.cash -= c; r.lvl = (r.lvl || 0) + 1; r.paid += c;
  emit({ k: 'sound', name: 'build' });
  return { ok: true, cost: c };
}
function setPolicy(id, v) {
  const r = S.rooms.get(id);
  if (!r || !TYPES[r.type].rent) return { ok: false, reason: 'Pas de loyer ici' };
  if (v !== -1 && v !== 0 && v !== 1) return { ok: false, reason: 'Réglage inconnu' };
  r.pol = v;
  return { ok: true };
}
function statsNow() {
  const cats = {};
  let leased = 0, tenants = 0, up = 0;
  for (const r of S.rooms.values()) {
    const T = TYPES[r.type], c = T.cat || 'base';
    const o = cats[c] || (cats[c] = { n: 0, vac: 0, rent: 0, up: 0 });
    o.n++; o.up += T.upkeep || 0; up += T.upkeep || 0;
    if (T.lease) { leased++; if (r.tenant) { tenants++; o.rent += rentNow(r); } else o.vac++; }
  }
  let waits = 0, nw = 0;
  for (const sh of S.shafts.values()) { waits += sh.wavg; nw++; }
  return { cats, leased, tenants, occ: leased ? tenants / leased : 1, kinds: kindsBuilt(), wait: nw ? waits / nw : 0, interest: interestRate(), log: S.log };
}
function borrow() {
  if (S.debt >= 60000) return { ok: false, reason: 'Plafond de dette atteint' };
  S.cash += 20000; S.debt += 22000; emit({ k: 'sound', name: 'cash' });
  return { ok: true };
}
function repay() {
  const amt = Math.min(S.debt, 22000);
  if (amt <= 0) return { ok: false, reason: 'Aucune dette' };
  if (S.cash < amt) return { ok: false, reason: 'Fonds insuffisants' };
  S.cash -= amt; S.debt -= amt; emit({ k: 'sound', name: 'cash' });
  return { ok: true };
}

/* ───────────────────────── reconstruction (segments, ascenseurs, nav) ───────────────────────── */

function homeFloor(sh, i) {
  const lo = sh.f0 <= 0 && sh.f1 >= 0 ? 0 : sh.f0;
  if (i === 0) return lo;
  return clamp(Math.round(lo + (sh.f1 - lo) * (i / Math.max(1, sh.ncars))), sh.f0, sh.f1);
}

function syncCars(sh) {
  while (sh.cars.length < sh.ncars) {
    const i = sh.cars.length;
    sh.cars.push({ id: S.nextId++, y: homeFloor(sh, i), dir: 0, nf: 0, st: 'idle', t: 0, pass: [], idle: 0, home: homeFloor(sh, i) });
  }
  while (sh.cars.length > sh.ncars) sh.cars.pop();
  sh.cars.forEach((car, i) => { car.home = homeFloor(sh, i); });
}

function rebuildShafts() {
  const used = new Set(), next = new Map();
  for (let c = 0; c < COLS; c++) {
    let f = FMIN;
    while (f <= FMAX) {
      const r = roomAt(f, c);
      if (r && r.type === 'elev') {
        const f0 = f, cells = [];
        while (f <= FMAX) {
          const rr2 = roomAt(f, c);
          if (rr2 && rr2.type === 'elev') { cells.push(rr2); f++; } else break;
        }
        let best = null;
        for (const cell of cells) {
          const s = S.shafts.get(cell.shaft);
          if (s && !used.has(s.id) && (!best || s.ncars > best.ncars)) best = s;
        }
        let sh;
        if (best) { sh = best; used.add(sh.id); }
        else sh = { id: S.nextId++, ncars: 1, lvl: 1, cars: [], q: {}, res: {}, wavg: 6 };
        sh.col = c; sh.f0 = f0; sh.f1 = f - 1;
        for (const cell of cells) cell.shaft = sh.id;
        next.set(sh.id, sh);
      } else f++;
    }
  }
  for (const [id, old] of S.shafts) if (!next.has(id)) evictShaft(old);
  S.shafts = next;
  for (const sh of S.shafts.values()) {
    sh.q = sh.q || {}; sh.res = sh.res || {};
    syncCars(sh);
    for (const car of sh.cars) {
      if (car.y < sh.f0 || car.y > sh.f1) {
        for (const p of car.pass) { p.f = clamp(Math.round(car.y), sh.f0, sh.f1); p.x = sh.col + 0.5; p.fy = p.f; p.car = null; later(p); }
        car.pass = []; car.y = clamp(Math.round(car.y), sh.f0, sh.f1); car.st = 'idle'; car.dir = 0;
      }
      for (let i = car.pass.length - 1; i >= 0; i--) {
        const p = car.pass[i];
        if (p.dest < sh.f0 || p.dest > sh.f1) { car.pass.splice(i, 1); p.f = Math.round(car.y); p.x = sh.col + 0.5; p.fy = p.f; p.car = null; later(p); }
      }
    }
    for (const k of Object.keys(sh.q)) {
      const f = +k;
      if (f < sh.f0 || f > sh.f1) {
        for (const p of sh.q[k]) later(p);
        delete sh.q[k];
      }
    }
  }
}

function later(p) { p.st = 'free'; p.route = null; p.car = null; if (pending.indexOf(p) < 0) pending.push(p); }

function evictShaft(old) {
  for (const car of old.cars) for (const p of car.pass) {
    p.f = Math.round(car.y); p.x = old.col + 0.5; p.fy = p.f; later(p);
  }
  for (const k of Object.keys(old.q || {})) for (const p of old.q[k]) later(p);
}

function flushPending() {
  const list = pending; pending = [];
  for (const p of list) {
    if (p.dead) continue;
    if (p.goal && p.goal.room && S.rooms.has(p.goal.room.id)) resume(p);
    else { p.goal = null; p.cur = 0; decide(p); }
  }
}

function rebuild() {
  rebuildShafts();
  // segments : suites de cases occupées sur un même étage
  let sid = 1;
  for (let i = 0; i < NF; i++) {
    const row = S.grid[i], seg = segGrid[i];
    let cur = 0;
    for (let c = 0; c < COLS; c++) {
      if (row[c]) { if (!cur) cur = sid++; seg[c] = cur; } else { cur = 0; seg[c] = 0; }
    }
  }
  // noeuds de navigation
  const nodes = [], byFloor = new Map(), byShaft = new Map();
  const add = (n) => {
    n.i = nodes.length; nodes.push(n);
    if (!byFloor.has(n.f)) byFloor.set(n.f, []);
    byFloor.get(n.f).push(n.i);
    return n;
  };
  for (const sh of S.shafts.values()) {
    const list = [];
    for (let f = sh.f0; f <= sh.f1; f++) list.push(add({ kind: 'E', ref: sh.id, f, x: sh.col + 0.5, seg: segAt(f, sh.col) }).i);
    byShaft.set(sh.id, list);
  }
  for (const r of S.rooms.values()) {
    if (r.type !== 'stair') continue;
    const a = add({ kind: 'S', ref: r.id, f: r.f, x: r.c + 0.5, seg: segAt(r.f, r.c) });
    const b = add({ kind: 'S', ref: r.id, f: r.f + 1, x: r.c + 1.5, seg: segAt(r.f + 1, r.c + 1) });
    a.partner = b.i; b.partner = a.i;
  }
  nav = { nodes, byFloor, byShaft };
  // accessibilité depuis un hall
  reachSeg = new Set();
  const todo = [];
  for (const r of S.rooms.values()) if (r.type === 'hall') {
    const s = segAt(0, r.c);
    if (s && !reachSeg.has(s)) { reachSeg.add(s); todo.push(s); }
  }
  const nodesBySeg = new Map();
  for (const n of nodes) { if (!nodesBySeg.has(n.seg)) nodesBySeg.set(n.seg, []); nodesBySeg.get(n.seg).push(n); }
  while (todo.length) {
    const s = todo.pop();
    for (const n of nodesBySeg.get(s) || []) {
      const others = n.kind === 'E' ? byShaft.get(n.ref).map((i) => nodes[i]) : [nodes[n.partner]];
      for (const o of others) if (o.seg && !reachSeg.has(o.seg)) { reachSeg.add(o.seg); todo.push(o.seg); }
    }
  }
  for (const r of S.rooms.values()) r.reach = reachSeg.has(segAt(r.f, r.c));
  computeNoise();
  S.navVer = (S.navVer || 0) + 1;
  fixStranded();
  flushPending();
}

function computeNoise() {
  const rooms = [...S.rooms.values()];
  for (const r of rooms) {
    r.noise = 0; r.green = 0;
    const TR = TYPES[r.type];
    if (TR.cat !== 'home' && TR.wk !== 'office') continue;
    let n = 0, g = 0;
    for (const o of rooms) {
      if (o === r) continue;
      const w = TYPES[o.type].noise;
      if (!w) continue;
      const gap = Math.max(o.c - (r.c + r.w), r.c - (o.c + o.w), 0);
      let df = Infinity;
      for (let rowf = o.f; rowf < o.f + o.h; rowf++) df = Math.min(df, Math.abs(rowf - r.f));
      let k = 0;
      if (df === 0) k = gap <= 0 ? 1 : gap <= 2 ? 0.45 : 0;
      else if (df === 1 && gap <= 0) k = o.type === 'elev' ? 0.3 : 0.55;
      n += w * k;
      if (w < 0 && k > 0) g = Math.max(g, k);
    }
    r.noise = clamp(n, 0, 35); r.green = g;
  }
}

function fixStranded() {
  for (const a of S.agents) {
    if (a.dead || a.st === 'ride' || a.st === 'away' || a.st === 'stair' || a.st === 'wait') continue;
    const c = clamp(Math.floor(a.x), 0, COLS - 1);
    if (segAt(a.f, c)) continue;
    let best = -1, bd = 99;
    for (let k = 0; k < COLS; k++) if (segAt(a.f, k) && Math.abs(k - a.x) < bd) { bd = Math.abs(k - a.x); best = k; }
    if (best >= 0) { a.x = best + 0.5; }
    else { sendAway(a); }
  }
}

function removeAgentsOf(r) {
  for (const a of S.agents) {
    if (a.dead) continue;
    if (a.home === r.id) dropAgent(a);
    else if (a.goal && a.goal.room === r) { leaveQueues(a); a.goal = null; a.cur = 0; later(a); }
    else if (a.cur === r.id) a.cur = 0;
  }
  S.agents = S.agents.filter((a) => !a.dead);
}


/* ───────────────────────── pathfinding ───────────────────────── */

function Heap() { this.a = []; }
Heap.prototype.push = function (c, i) {
  const a = this.a; a.push([c, i]);
  let k = a.length - 1;
  while (k > 0) { const p = (k - 1) >> 1; if (a[p][0] <= a[k][0]) break; const t = a[p]; a[p] = a[k]; a[k] = t; k = p; }
};
Heap.prototype.pop = function () {
  const a = this.a, top = a[0], last = a.pop();
  if (a.length) {
    a[0] = last; let k = 0;
    for (;;) {
      const l = 2 * k + 1, r = l + 1; let m = k;
      if (l < a.length && a[l][0] < a[m][0]) m = l;
      if (r < a.length && a[r][0] < a[m][0]) m = r;
      if (m === k) break;
      const t = a[m]; a[m] = a[k]; a[k] = t; k = m;
    }
  }
  return top;
};

const queueLen = (sh, f) => (sh.q[f] ? sh.q[f].length : 0);
const shaftSpeed = (sh) => ELEV_V * (1 + 0.3 * (sh.lvl - 1)) * (sh.slowUntil > S.T ? 0.45 : 1);

function findRoute(f0, x0, f1, x1) {
  const c0 = clamp(Math.floor(x0), 0, COLS - 1), c1 = clamp(Math.floor(x1), 0, COLS - 1);
  const s0 = segAt(f0, c0), s1 = segAt(f1, c1);
  if (!s0 || !s1) return null;
  if (f0 === f1 && s0 === s1) return [{ t: 'walk', x: x1 }];
  const N = nav.nodes, n = N.length;
  if (!n) return null;
  const dist = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1);
  const H = new Heap();
  for (const i of nav.byFloor.get(f0) || []) {
    const u = N[i];
    if (u.seg === s0) { const d = Math.abs(u.x - x0) / WALK; dist[i] = d; H.push(d, i); }
  }
  const relax = (j, i, nd) => { if (nd < dist[j]) { dist[j] = nd; prev[j] = i; H.push(nd, j); } };
  while (H.a.length) {
    const top = H.pop(), d = top[0], i = top[1];
    if (d > dist[i]) continue;
    const u = N[i];
    for (const j of nav.byFloor.get(u.f)) {
      if (j === i) continue;
      const v = N[j];
      if (v.seg !== u.seg) continue;
      relax(j, i, d + Math.abs(v.x - u.x) / WALK + 0.05);
    }
    if (u.kind === 'E') {
      const sh = S.shafts.get(u.ref);
      const base = 2.2 / sh.ncars + queueLen(sh, u.f) * 0.9 / sh.ncars;
      for (const j of nav.byShaft.get(u.ref)) {
        if (j === i) continue;
        relax(j, i, d + base + Math.abs(N[j].f - u.f) / shaftSpeed(sh) + 0.6);
      }
    } else relax(u.partner, i, d + STAIR_T);
  }
  let best = -1, bc = Infinity;
  for (const i of nav.byFloor.get(f1) || []) {
    const u = N[i];
    if (u.seg !== s1 || dist[i] === Infinity) continue;
    const c = dist[i] + Math.abs(u.x - x1) / WALK;
    if (c < bc) { bc = c; best = i; }
  }
  if (best < 0) return null;
  const path = [];
  for (let i = best; i >= 0; i = prev[i]) path.push(N[i]);
  path.reverse();
  const steps = [{ t: 'walk', x: path[0].x }];
  for (let i = 0; i < path.length - 1; i++) {
    const u = path[i], v = path[i + 1];
    if (u.f !== v.f && u.kind === 'E' && v.kind === 'E' && u.ref === v.ref) steps.push({ t: 'elev', sid: u.ref, from: u.f, to: v.f });
    else if (u.f !== v.f && u.kind === 'S' && v.kind === 'S' && u.ref === v.ref) steps.push({ t: 'stair', rid: u.ref, from: u.f, to: v.f, x: v.x });
    else steps.push({ t: 'walk', x: v.x });
  }
  steps.push({ t: 'walk', x: x1 });
  return steps;
}

/* ───────────────────────── ascenseurs ───────────────────────── */

function hasTarget(sh, car, f, dir) {
  const lim = dir > 0 ? sh.f1 : sh.f0;
  for (let k = f + dir; dir > 0 ? k <= lim : k >= lim; k += dir) {
    if (sh.q[k] && sh.q[k].length) return true;
    for (const p of car.pass) if (p.dest === k) return true;
  }
  return false;
}

function chooseDir(sh, car, f) {
  if (car.dir !== 0) {
    if (hasTarget(sh, car, f, car.dir)) return car.dir;
    if (hasTarget(sh, car, f, -car.dir)) return -car.dir;
    return 0;
  }
  let best = 0, bd = 99, bf = null;
  for (let k = sh.f0; k <= sh.f1; k++) {
    if (k === f) continue;
    const waiting = sh.q[k] && sh.q[k].length;
    const mine = car.pass.some((p) => p.dest === k);
    if (!waiting && !mine) continue;
    const r = sh.res[k];
    if (waiting && !mine && r && r !== car.id && sh.cars.some((c) => c.id === r)) continue;
    if (Math.abs(k - f) < bd) { bd = Math.abs(k - f); best = sgn(k - f); bf = k; }
  }
  if (bf !== null && sh.q[bf] && sh.q[bf].length) sh.res[bf] = car.id;
  return best;
}

function serveFloor(sh, car, f) {
  let moved = 0;
  for (let i = car.pass.length - 1; i >= 0; i--) {
    const p = car.pass[i];
    if (p.dest === f) {
      car.pass.splice(i, 1);
      p.car = null; p.f = f; p.fy = f; p.x = sh.col + 0.5; p.ri++; moved++;
      beginStep(p);
    }
  }
  const q = sh.q[f];
  if (q && q.length && car.pass.length < CAP) {
    let want = car.dir;
    if (car.dir === 0 || (car.pass.length === 0 && !hasTarget(sh, car, f, car.dir))) { want = sgn(q[0].dest - f); car.dir = want; }
    for (let j = 0; j < q.length && car.pass.length < CAP;) {
      const p = q[j];
      if (sgn(p.dest - f) === want) {
        q.splice(j, 1);
        const w = S.simT - p.w0;
        sh.wavg += (w - sh.wavg) * 0.08;
        p.st = 'ride'; p.car = car; p.fy = f;
        car.pass.push(p); moved++;
      } else j++;
    }
    if (!q.length) delete sh.q[f];
    if (sh.res[f] === car.id) delete sh.res[f];
  }
  if (moved) { car.st = 'dwell'; car.t = 0.8 + 0.12 * moved; return true; }
  return false;
}

function stepCar(sh, car, dt) {
  const v = shaftSpeed(sh);
  let rem = dt;
  if (car.st === 'dwell') { car.t -= rem; if (car.t > 0) return; rem = -car.t; car.st = 'idle'; }
  let guard = 0;
  while (rem > 1e-6 && guard++ < 6) {
    if (car.st === 'idle') {
      const f = car.y;
      if (serveFloor(sh, car, f)) return;
      car.dir = chooseDir(sh, car, f);
      if (car.dir === 0) {
        car.idle += rem;
        if (car.idle > 4 && f !== car.home) { car.dir = sgn(car.home - f); car.nf = f + car.dir; car.st = 'move'; car.homing = true; }
        else return;
      } else { car.idle = 0; car.homing = false; car.nf = f + car.dir; car.st = 'move'; }
    }
    if (car.st === 'move') {
      const need = Math.abs(car.nf - car.y) / v;
      if (rem >= need) { car.y = car.nf; rem -= need; car.st = 'idle'; }
      else { car.y += sgn(car.nf - car.y) * v * rem; return; }
    }
  }
}

/* ───────────────────────── agents ───────────────────────── */

function mkAgent(kind, room, wk) {
  const a = {
    id: S.nextId++, kind, wk: wk || null, home: room ? room.id : 0, cur: 0, f: 0, x: 0, fy: 0, st: 'away', wakeAt: S.T,
    col: Math.floor(rnd() * 8), ox: 0.2 + rnd() * 0.6, sp: 0.85 + rnd() * 0.3, s: {}, p: null, goal: null,
    route: null, ri: 0, nv: 0, dir: 1, tripStart: null, awayUntil: 0, arrived: false
  };
  if (kind === 'res') { a.s.leave = 410 + rnd() * 120; a.s.ret = 1020 + rnd() * 150; }
  else if (kind === 'work') {
    const H = room && TYPES[room.type].hours;
    if (wk === 'office') { a.s.arr = 470 + rnd() * 90; a.s.lun = 710 + rnd() * 100; a.s.lea = 1005 + rnd() * 90; }
    else if (H) { a.s.arr = clamp(H[0] - rr(10, 30), 0, 1300); a.s.lea = Math.min(1435, H[1] + rr(5, 30)); }
    else if (wk === 'shop') { a.s.arr = 560 + rnd() * 30; a.s.lea = 1155 + rnd() * 30; }
    else { a.s.arr = 620 + rnd() * 30; a.s.lea = 1350 + rnd() * 60; }
  }
  return a;
}

function spawnTenantAgents(r, silent, restore) {
  const list = [], T = TYPES[r.type];
  if (r.type === 'apt') { const n = r.id % 5 < 3 ? 2 : 1; for (let i = 0; i < n; i++) list.push(mkAgent('res', r)); }
  else if (T.res) { const n = T.res[0] + (r.id % (T.res[1] - T.res[0] + 1)); for (let i = 0; i < n; i++) list.push(mkAgent('res', r)); }
  else if (T.staff && T.wk) { const n = T.staff[0] + (r.id % (T.staff[1] - T.staff[0] + 1)); for (let i = 0; i < n; i++) list.push(mkAgent('work', r, T.wk)); }
  else if (r.type === 'janitor') list.push(mkAgent('jan', r));
  for (const a of list) {
    initAgent(a, r, restore);
    S.agents.push(a);
  }
}

function initAgent(a, r, restore) {
  const m = S.T % DAY, wd = wdayOf(S.T);
  a.p = { day: dayOf(S.T), left: true, shopDone: true, localDone: true, evDone: true, lunchDone: !!(a.s.lun && m > a.s.lun) };
  const here = () => { a.f = r.f; a.fy = r.f; a.x = r.c + r.w * a.ox; a.cur = r.id; a.st = 'in'; a.wakeAt = S.T; };
  if (a.kind === 'jan') { here(); return; }
  if (a.kind === 'res') {
    if (restore) {
      if (wd < 5 && m > a.s.leave && m < a.s.ret) { a.st = 'away'; a.wakeAt = dayOf(S.T) * DAY + a.s.ret; } else here();
    } else { a.st = 'away'; a.wakeAt = S.T + rr(8, 70); }
    return;
  }
  const atWork = shouldBeAtWork(a);
  if (restore) {
    if (atWork) here(); else { a.st = 'away'; a.wakeAt = nextStart(a, S.T); }
  } else { a.st = 'away'; a.wakeAt = atWork ? S.T + rr(8, 70) : nextStart(a, S.T); }
}

function shouldBeAtWork(a) {
  const m = S.T % DAY, wd = wdayOf(S.T);
  if (a.wk === 'office' && wd >= 5) return false;
  return m >= a.s.arr && m < a.s.lea;
}

function nextStart(a, fromT) {
  let d = dayOf(fromT);
  for (let i = 0; i < 9; i++, d++) {
    if (a.wk === 'office' && d % 7 >= 5) continue;
    const t = d * DAY + a.s.arr;
    if (t > fromT + 5) return t;
  }
  return fromT + DAY;
}

function leaveQueues(a) {
  if (a.car) { const i = a.car.pass.indexOf(a); if (i >= 0) a.car.pass.splice(i, 1); a.car = null; }
  if (a.st === 'wait') {
    for (const sh of S.shafts.values()) for (const k of Object.keys(sh.q)) {
      const i = sh.q[k].indexOf(a);
      if (i >= 0) { sh.q[k].splice(i, 1); if (!sh.q[k].length) delete sh.q[k]; }
    }
  }
  if (a.vroom) { const rm = S.rooms.get(a.vroom); if (rm && rm.vis > 0) rm.vis--; a.vroom = 0; }
}

function dropAgent(a) { leaveQueues(a); a.dead = true; }

function sendAway(a) {
  if (a.kind === 'cust') { dropAgent(a); return; }
  leaveQueues(a);
  a.cur = 0; a.route = null; a.goal = null; a.st = 'away'; a.wakeAt = a.awayUntil > S.T ? a.awayUntil : S.T + 30;
}

function planOf(a) {
  const d = dayOf(S.T);
  if (a.p && a.p.day === d) return a.p;
  const wd = d % 7, wk = wd < 5;
  const p = { day: d, left: false, shopDone: false, localDone: false, lunchDone: false };
  if (a.kind === 'res') {
    p.out = rnd() < (wk ? 0.9 : 0.55);
    p.leave = wk ? a.s.leave : 600 + rnd() * 180;
    p.ret = wk ? a.s.ret : 960 + rnd() * 360;
    p.shopAfter = rnd() < (wk ? 0.3 : 0.55);
    p.local = !p.out && rnd() < 0.55 ? 840 + rnd() * 360 : 0;
    p.ev = rnd() < (wk ? 0.18 : 0.3) ? 1150 + rnd() * 170 : 0; p.evDone = false;
  }
  a.p = p;
  return p;
}

function hallsOf() {
  const out = [];
  for (const r of S.rooms.values()) if (r.type === 'hall' && r.reach) out.push(r);
  return out;
}

function flowOf(r, hr) { const T = TYPES[r.type]; return (T.flow || 0) * ((PROFILES[T.prof || 'day'] || HOUR_PROFILE)[hr] || 0); }

function isOpen(r, m) {
  if (!r.tenant || !r.reach) return false;
  const T = TYPES[r.type];
  if (!T.hours) return false;
  if (T.days === 'week' && wdayOf(S.T) >= 5) return false;
  const a = T.hours[0], b = T.hours[1];
  return (m >= a && m < b) || (b > DAY && m < b - DAY);
}

function pickOpen(tag, m) {
  const hr = Math.floor(m / 60), list = [];
  let tot = 0;
  for (const r of S.rooms.values()) {
    const T = TYPES[r.type];
    if (!T.tags || T.tags.indexOf(tag) < 0 || !isOpen(r, m)) continue;
    if (r.vis >= T.cap) continue;
    const w = Math.max(0.05, flowOf(r, hr));
    tot += w; list.push([r, w]);
  }
  if (!list.length) return null;
  let x = rnd() * tot;
  for (const e of list) { x -= e[1]; if (x <= 0) return e[0]; }
  return list[list.length - 1][0];
}

function visitDur(r) { const d = TYPES[r.type].dur || [8, 20]; return rr(d[0], d[1]); }

function goTo(a, room, then, o) {
  o = o || {};
  if (!room || (room.id && !S.rooms.has(room.id))) { return goExitOrFail(a); }
  a.goal = { room, then, dur: o.dur || 0, clean: !!o.clean };
  let tx;
  if (then === 'exit') tx = room.c + room.w / 2 + rr(-0.6, 0.6);
  else tx = room.c + room.w * a.ox;
  const route = findRoute(a.f, a.x, room.f, tx);
  if (!route) return failTrip(a);
  if (a.tripStart == null && a.kind !== 'cust') a.tripStart = S.simT;
  a.route = route; a.ri = 0; a.nv = S.navVer; a.cur = 0;
  if (a.st === 'visit' || a.st === 'in' || a.st === 'free') a.st = 'free';
  beginStep(a);
}

function goExit(a, until) {
  a.awayUntil = until;
  const halls = hallsOf();
  if (!halls.length) { a.cur = 0; a.st = 'away'; a.wakeAt = until; return; }
  let best = halls[0], bd = 1e9;
  for (const h of halls) { const d = Math.abs(h.c + h.w / 2 - a.x) + (h.reach ? 0 : 100); if (d < bd) { bd = d; best = h; } }
  goTo(a, best, 'exit');
}

function goExitOrFail(a) {
  if (a.kind === 'cust') { dropAgent(a); return; }
  sendAway(a);
}

function failTrip(a) {
  a.route = null;
  if (a.kind === 'cust') { dropAgent(a); return; }
  const g = a.goal;
  if (g && g.then === 'exit') { sendAway(a); return; }
  const home = S.rooms.get(a.home);
  if (home) {
    a.f = home.f; a.fy = home.f; a.x = home.c + home.w * a.ox; a.cur = home.id; a.st = 'in'; a.wakeAt = S.T + 30; a.tripStart = null;
  } else dropAgent(a);
}

function resume(a) {
  if (a.dead) return;
  a.route = null;
  if (a.goal && a.goal.room && S.rooms.has(a.goal.room.id)) goTo(a, a.goal.room, a.goal.then, a.goal);
  else goExitOrFail(a);
}

function beginStep(a) {
  if (a.nv !== S.navVer && a.route) {
    // la tour a changé : on recalcule depuis la position actuelle
    const g = a.goal; a.nv = S.navVer;
    if (g && S.rooms.has(g.room.id)) {
      const tx = g.then === 'exit' ? g.room.c + g.room.w / 2 : g.room.c + g.room.w * a.ox;
      const route = findRoute(a.f, a.x, g.room.f, tx);
      if (!route) return failTrip(a);
      a.route = route; a.ri = 0;
    } else return goExitOrFail(a);
  }
  const s = a.route && a.route[a.ri];
  if (!s) return arrived(a);
  if (s.t === 'walk') {
    a.tx = s.x; a.st = 'walk';
    if (Math.abs(a.tx - a.x) < 0.03) { a.ri++; beginStep(a); }
  } else if (s.t === 'elev') {
    const sh = S.shafts.get(s.sid);
    if (!sh || s.from < sh.f0 || s.from > sh.f1 || s.to < sh.f0 || s.to > sh.f1) return resume(a);
    a.dest = s.to; a.st = 'wait'; a.w0 = S.simT; a.shaft = sh.id; a.wf = s.from;
    (sh.q[s.from] = sh.q[s.from] || []).push(a);
  } else if (s.t === 'stair') {
    if (!S.rooms.has(s.rid)) return resume(a);
    a.st = 'stair'; a.sp = 0; a.sx0 = a.x; a.sx1 = s.x; a.sf0 = s.from; a.sf1 = s.to;
  }
}

function recordTrip(a) {
  if (a.tripStart == null) return;
  const r = S.rooms.get(a.home);
  const dt = S.simT - a.tripStart;
  a.tripStart = null;
  if (r) r.trip += (dt - r.trip) * 0.12;
}

function arrived(a) {
  a.route = null;
  const g = a.goal;
  if (!g) { a.st = 'free'; return; }
  if (g.then === 'stay') {
    a.cur = g.room.id; a.st = 'in'; recordTrip(a); a.wakeAt = S.T; return;
  }
  if (g.then === 'visit') { recordTrip(a); return startVisit(a, g); }
  if (g.then === 'exit') {
    recordTrip(a);
    if (a.kind === 'cust') { a.dead = true; return; }
    a.cur = 0; a.st = 'away'; a.wakeAt = a.awayUntil > S.T ? a.awayUntil : S.T + 20;
    return;
  }
}

function startVisit(a, g) {
  const room = g.room;
  a.cur = room.id;
  if (g.clean) { a.st = 'visit'; a.vroom = 0; a.wakeAt = S.T + g.dur; return; }
  const T = TYPES[room.type];
  if (T.cap) {
    if (room.vis >= T.cap) { room.lost++; a.st = 'free'; a.cur = 0; return decide(a); }
    room.vis++; room.visToday++; a.vroom = room.id;
    const pr = T.price || [15, 23];
    const price = Math.round((pr[0] + rnd() * (pr[1] - pr[0])) * (0.75 + room.sat / 200));
    S.cash += price; S.today.sales += price;
    room.dirt = Math.min(100, room.dirt + 1.1);
    emit({ k: 'cash', amt: price, f: room.f, x: room.c + room.w / 2 });
  }
  a.st = 'visit'; a.wakeAt = S.T + (g.dur || 15);
}

function endVisit(a) {
  const g = a.goal;
  if (a.vroom) { const rm = S.rooms.get(a.vroom); if (rm && rm.vis > 0) rm.vis--; a.vroom = 0; }
  if (g && g.clean) {
    const rm = g.room;
    if (S.rooms.has(rm.id)) { rm.dirt = Math.max(0, rm.dirt - 70); rm.cleaner = 0; }
  }
  a.st = 'free';
  decide(a);
}

/* — décisions — */

function decide(a) {
  if (a.dead) return;
  const room = S.rooms.get(a.home);
  if (a.kind !== 'cust' && (!room || !room.tenant)) { return goExit(a, S.T + 60); }
  const m = S.T % DAY, ds = dayOf(S.T) * DAY;
  const kind = a.kind;

  if (kind === 'cust') {
    if (a.visitsLeft > 0 && a.goal && a.goal.then === 'visit') {
      a.visitsLeft--;
      const r = pickOpen('any', m);
      if (r) return goTo(a, r, 'visit', { dur: visitDur(r) });
    }
    return goExit(a, S.T + 10);
  }

  if (kind === 'jan') {
    const shift = m >= 420 && m < 1140;
    if (shift) {
      let tgt = null, bd = 29;
      for (const r of S.rooms.values()) {
        if (!r.tenant || !r.reach || r.cleaner || !TYPES[r.type].lease || r.type === 'parking') continue;
        if (r.dirt > bd) { bd = r.dirt; tgt = r; }
      }
      if (tgt) { tgt.cleaner = a.id; return goTo(a, tgt, 'visit', { dur: 8, clean: true }); }
    }
    if (a.cur !== a.home) return goTo(a, room, 'stay');
    a.st = 'in';
    a.wakeAt = shift ? S.T + 8 : (m < 420 ? ds + 420 : ds + DAY + 420);
    return;
  }

  const p = planOf(a);

  if (kind === 'res') {
    if (a.arrived) {
      a.arrived = false;
      if (p.shopAfter && !p.shopDone) {
        p.shopDone = true;
        const r = pickOpen('any', m);
        if (r) return goTo(a, r, 'visit', { dur: visitDur(r) });
      }
      return goTo(a, room, 'stay');
    }
    if (a.cur !== a.home) return goTo(a, room, 'stay');
    if (p.out && !p.left) {
      if (S.T < ds + p.leave) { a.st = 'in'; a.wakeAt = ds + p.leave; return; }
      p.left = true;
      return goExit(a, Math.max(S.T + 25, ds + p.ret + rr(-15, 15)));
    }
    if (!p.out && p.local && !p.localDone) {
      if (S.T < ds + p.local) { a.st = 'in'; a.wakeAt = ds + p.local; return; }
      p.localDone = true;
      const r = pickOpen('any', m);
      if (r) return goTo(a, r, 'visit', { dur: visitDur(r) });
    }
    if (p.ev && !p.evDone) {
      if (S.T < ds + p.ev) { a.st = 'in'; a.wakeAt = ds + p.ev; return; }
      p.evDone = true;
      const r = pickOpen('leisure', m);
      if (r) return goTo(a, r, 'visit', { dur: visitDur(r) });
    }
    a.st = 'in'; a.wakeAt = ds + DAY + 5;
    return;
  }

  // employés
  if (a.arrived) { a.arrived = false; return goTo(a, room, 'stay'); }
  if (shouldBeAtWork(a)) {
    if (a.cur !== a.home) return goTo(a, room, 'stay');
    if (a.wk === 'office' && !p.lunchDone) {
      const lt = ds + a.s.lun;
      if (S.T < lt) { a.st = 'in'; a.wakeAt = lt; return; }
      p.lunchDone = true;
      const r = pickOpen('lunch', m);
      if (r && rnd() < 0.5) return goTo(a, r, 'visit', { dur: rr(30, 45) });
      return goExit(a, S.T + rr(40, 65));
    }
    a.st = 'in'; a.wakeAt = ds + a.s.lea; return;
  }
  // fin de journée
  if (S.T < ds + a.s.arr && (a.wk !== 'office' || wdayOf(S.T) < 5)) { a.st = 'in'; a.wakeAt = ds + a.s.arr; return; }
  if (!p.shopDone && rnd() < 0.2 && a.wk !== 'shop') {
    p.shopDone = true;
    const r = pickOpen('shop', m);
    if (r) return goTo(a, r, 'visit', { dur: rr(6, 14) });
  }
  return goExit(a, nextStart(a, S.T));
}

function wake(a) {
  if (a.st === 'away') {
    const halls = hallsOf();
    if (!halls.length) { a.wakeAt = S.T + 20; return; }
    const h = halls[Math.floor(rnd() * halls.length)];
    a.f = 0; a.fy = 0; a.x = h.c + h.w / 2 + rr(-0.5, 0.5); a.cur = 0; a.arrived = true; a.st = 'free'; a.tripStart = S.simT;
    return decide(a);
  }
  if (a.st === 'visit') return endVisit(a);
  a.st = 'free';
  decide(a);
}

function spawnCustomer() {
  const m = S.T % DAY;
  const r = pickOpen('any', m);
  if (!r) return;
  const halls = hallsOf();
  if (!halls.length) return;
  const a = mkAgent('cust', null);
  const h = halls[Math.floor(rnd() * halls.length)];
  a.f = 0; a.fy = 0; a.x = h.c + h.w / 2 + rr(-0.5, 0.5); a.st = 'free'; a.visitsLeft = rnd() < 0.35 ? 1 : 0;
  a.goal = { then: 'visit' };
  S.agents.push(a);
  goTo(a, r, 'visit', { dur: visitDur(r) });
}

const HOUR_PROFILE = [0, 0, 0, 0, 0, 0, 0, 0, 0.2, 0.5, 0.8, 1, 1.4, 1.3, 0.9, 0.8, 0.9, 1.2, 1.3, 0.9, 0.6, 0.4, 0.15, 0];
const PROFILES = {
  day: HOUR_PROFILE,
  morn: [0, 0, 0, 0, 0, 0, 0.3, 1, 1.4, 1, 0.6, 0.5, 0.8, 0.7, 0.5, 0.5, 0.6, 0.7, 0.6, 0.3, 0.1, 0, 0, 0],
  eve: [0.1, 0, 0, 0, 0, 0, 0.4, 0.7, 0.5, 0.3, 0.3, 0.4, 0.6, 0.5, 0.6, 0.7, 0.9, 1.3, 1.5, 1.5, 1.4, 1.2, 0.8, 0.3],
  night: [1, 0.6, 0.3, 0.1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.1, 0.2, 0.4, 0.7, 1.2, 1.6, 1.4]
};
// objectif de visites par jour (satisfaction pleine) : 85 % de l'affluence attendue, d'après horaires, profil et jours d'ouverture
for (const k of ORDER) {
  const T = TYPES[k];
  if (!T.hours || T.tgt) continue;
  let sum = 0;
  for (let m = T.hours[0]; m < T.hours[1]; m += 30) sum += PROFILES[T.prof || 'day'][Math.floor((m % DAY) / 60)] * 0.5;
  T.tgt = Math.max(3, Math.round(0.85 * T.flow * sum * (T.days === 'week' ? 5 / 7 : 1)));
}

function updateAgent(a, dt) {
  switch (a.st) {
    case 'walk': {
      const dx = a.tx - a.x, v = WALK * a.sp * dt;
      if (Math.abs(dx) <= v) { a.x = a.tx; a.ri++; beginStep(a); }
      else { a.x += sgn(dx) * v; a.dir = sgn(dx); }
      break;
    }
    case 'wait': {
      const sh = S.shafts.get(a.shaft);
      if (!sh) { a.st = 'free'; resume(a); break; }
      const q = sh.q[a.wf] || [];
      const i = Math.max(0, q.indexOf(a));
      const slot = sh.col + 0.5 + (i % 2 ? 1 : -1) * (0.55 + 0.32 * Math.floor(i / 2));
      a.x += (slot - a.x) * Math.min(1, dt * 5);
      break;
    }
    case 'ride': if (a.car) { a.fy = a.car.y; a.f = Math.round(a.car.y); } break;
    case 'stair': {
      a.sp += dt / STAIR_T;
      if (a.sp >= 1) { a.f = a.sf1; a.fy = a.sf1; a.x = a.sx1; a.ri++; beginStep(a); }
      else { a.x = a.sx0 + (a.sx1 - a.sx0) * a.sp; a.fy = a.sf0 + (a.sf1 - a.sf0) * a.sp; a.dir = sgn(a.sx1 - a.sx0); }
      break;
    }
    case 'in': case 'visit': case 'away': case 'free':
      if (S.T >= a.wakeAt) wake(a);
      break;
  }
}

/* ───────────────────────── boucle de simulation ───────────────────────── */

function step(dt) {
  S.simT += dt; S.T += dt * MPS;
  while (Math.floor(S.T / 60) > S.lastHour) {
    S.lastHour++;
    hourly();
    if (Math.floor(S.lastHour / 24) > S.lastDay) { S.lastDay++; endOfDay(); }
  }
  // clientels externes
  let rate = 0;
  const mnow = S.T % DAY, hnow = Math.floor(mnow / 60);
  for (const r of S.rooms.values()) if (TYPES[r.type].hours && isOpen(r, mnow)) rate += flowOf(r, hnow);
  rate *= (S.attr / 60) * (wdayOf(S.T) >= 5 ? 1.25 : 1) * (S.fx.metro ? 1.3 : 1) * (S.boostUntil > S.T ? 1.8 : 1);
  S.spawnAcc += rate * (dt * MPS / 60);
  while (S.spawnAcc >= 1) { S.spawnAcc -= 1; if (S.agents.length < 700) spawnCustomer(); }
  for (const sh of S.shafts.values()) for (const car of sh.cars) stepCar(sh, car, dt);
  const ag = S.agents;
  for (let i = 0; i < ag.length; i++) if (!ag[i].dead) updateAgent(ag[i], dt);
  let dead = false;
  for (let i = 0; i < ag.length; i++) if (ag[i].dead) { dead = true; break; }
  if (dead) S.agents = ag.filter((a) => !a.dead);
}

function tick(simSeconds) {
  if (S.over) return;
  acc += simSeconds;
  let n = 0;
  while (acc >= STEP && n < 800) { step(STEP); acc -= STEP; n++; }
  if (acc > 2) acc = 0;
}

/* ───────────────────────── économie ───────────────────────── */

const AMEN = { grocery: 3, health: 2, fitness: 2, leisure: 2, kids: 2, sec: 2, beauty: 1, cafe: 1 };
function amenity(T) {
  const sv = S.svc;
  if (T.cat === 'home') {
    let b = 0;
    for (const k in AMEN) if (sv[k]) b += AMEN[k];
    return Math.min(12, b) * (T.amen || 1);
  }
  if (T.wk === 'office') return Math.min(6, (sv.food ? 2 : 0) + (sv.fitness ? 2 : 0) + (sv.kids ? 1 : 0) + (sv.sec ? 1 : 0));
  return 0;
}

function satTarget(r) {
  const T = TYPES[r.type], bd = { stress: 0, noise: 0, dirt: 0, view: 0, svc: 0, biz: 0, bonus: 0, reno: 0, pol: 0 };
  if (r.type === 'parking') { bd.dirt = 0; r.bd = bd; return 74; }
  bd.stress = Math.min(50, Math.max(0, r.trip - 14) * 1.5);
  bd.dirt = Math.min(30, Math.max(0, r.dirt - 30) * 0.45);
  bd.reno = 4 * (r.lvl || 0);
  bd.pol = r.pol === -1 ? 6 : r.pol === 1 ? -10 : 0;
  let t;
  if (T.cap) {
    bd.biz = clamp(30 + 55 * r.visAvg / (T.tgt || 10), 0, 100);
    t = bd.biz - bd.dirt - bd.stress * 0.5;
  } else {
    const sv = S.svc, home = T.cat === 'home', office = T.wk === 'office';
    bd.noise = Math.min(30, r.noise * (T.nk != null ? T.nk : 1));
    bd.view = (r.f > 0 ? Math.min(10, r.f * 0.7) * (T.vk || 1) : r.f < 0 ? -8 : 0) + 5 * (r.green || 0);
    if (home) bd.svc = (sv.shop ? 0 : 7) + (sv.food || S.rank < 3 ? 0 : 4);
    else if (office) bd.svc = sv.food || S.rank < 3 ? 0 : 7;
    bd.bonus = amenity(T);
    if (T.sk) bd.stress *= T.sk;
    t = (T.base || 86) + bd.view - bd.stress - bd.noise - bd.dirt - bd.svc + bd.bonus;
  }
  t += bd.reno + bd.pol;
  r.bd = bd;
  return clamp(t, 0, 100);
}

function rentNow(r) {
  const T = TYPES[r.type];
  if (!T.rent) return 0;
  const prem = Math.min(1.6, 1 + 0.025 * Math.max(0, r.f));
  let k = 1 + 0.12 * (r.lvl || 0);
  k *= r.pol === 1 ? 1.25 : r.pol === -1 ? 0.82 : 1;
  if (r.type === 'pent' && S.fx && S.fx.heli) k *= 1.1;
  return Math.round(T.rent * prem * k * (0.55 + 0.65 * r.sat / 100));
}

function rentOut(r) {
  r.tenant = true; r.sat = 65; r.low = 0; r.trip = 10;
  spawnTenantAgents(r, false);
  S.stats.moves++;
  emit({ k: 'move', f: r.f, x: r.c + r.w / 2 });
}

function moveOut(r) {
  r.tenant = false; r.sat = 65; r.low = 0;
  removeAgentsOf(r);
  S.stats.outs++;
  toast('Un locataire est parti (' + TYPES[r.type].name + ', ' + label(r.f) + ').', 'warn');
}

function computeAttr() {
  let n = 0, sum = 0, halls = 0, parking = 0;
  for (const r of S.rooms.values()) {
    if (r.type === 'hall') halls++;
    if (!r.tenant || !TYPES[r.type].lease) continue;
    n++; sum += r.sat;
    if (r.type === 'parking') parking++;
  }
  S.avgSat = n ? sum / n : 70;
  const fx = S.fx || {};
  return clamp(35 + S.avgSat * 0.35 + S.rank * 3 + Math.min(8, halls * 2) + Math.min(5, parking * 2) + (fx.metro ? 6 : 0) + (fx.heli ? 5 : 0) + (S.pressUntil > S.T ? 8 : 0), 10, 100);
}

function computeSvc() {
  const svc = {}, fx = {};
  let venues = 0;
  for (const r of S.rooms.values()) {
    const T = TYPES[r.type];
    if (!r.tenant || !(r.reach || T.fx === 'solar')) continue;
    if (T.svc) for (const k of T.svc) svc[k] = (svc[k] || 0) + 1;
    if (T.fx) fx[T.fx] = (fx[T.fx] || 0) + 1;
    if (T.cap) venues++;
  }
  S.svc = svc; S.fx = fx; S.venues = venues;
}
const interestRate = () => (S.fx && S.fx.bank ? 0.003 : 0.004);

function popCount() {
  let p = 0;
  for (const a of S.agents) if (!a.dead && (a.kind === 'res' || a.kind === 'work')) p++;
  return p;
}

function hourly() {
  const cnt = new Map();
  for (const a of S.agents) if ((a.st === 'in' || a.st === 'visit') && a.cur) cnt.set(a.cur, (cnt.get(a.cur) || 0) + 1);
  computeSvc();
  S.pop = popCount();
  const demandShops = Math.min(1, (S.pop + 6) / (12 * (S.venues + 1)));
  const dirtK = S.fx.trash ? 0.8 : 1;
  for (const r of S.rooms.values()) {
    const T = TYPES[r.type];
    if (r.tenant && (T.lease || r.type === 'janitor')) {
      r.dirt = Math.min(100, r.dirt + (0.15 + 0.3 * (cnt.get(r.id) || 0)) * dirtK);
      if (T.lease) r.sat += (satTarget(r) - r.sat) * 0.18;
    } else if (T.lease && r.reach) {
      let p = 0.02 + 0.08 * (S.attr / 100);
      if (T.cap) p *= demandShops;
      if (T.wk === 'office') p *= 0.6 + 0.4 * S.avgSat / 100;
      if (r.type === 'pent') p *= 0.6 * (S.fx.heli ? 1.6 : 1);
      if (rnd() < p) rentOut(r);
    }
  }
  S.attr = computeAttr();
  if (S.lastHour % 24 === 8) rollEvent();
  checkGoals();
  updateAdvice();
}

function costsPerDay() {
  let c = 0;
  for (const r of S.rooms.values()) c += TYPES[r.type].upkeep || 0;
  for (const sh of S.shafts.values()) c += sh.ncars * CAR_UPKEEP * (1 + 0.4 * (sh.lvl - 1)) * (S.fx.tech ? 0.8 : 1);
  return Math.round(c + S.debt * interestRate());
}

function endOfDay() {
  let rent = 0, other = 0;
  for (const r of S.rooms.values()) {
    const T = TYPES[r.type];
    if (T.income && r.tenant) other += T.income;
    if (!T.lease || !r.tenant) continue;
    rent += rentNow(r);
    if (T.cap) { r.visAvg += (r.visToday - r.visAvg) * 0.35; }
    r.visY = r.visToday; r.visToday = 0; r.lost = 0;
    if (r.sat < 28) r.low++; else r.low = 0;
    if (r.low >= 2) moveOut(r);
  }
  const costs = costsPerDay();
  S.cash += rent + other - costs;
  const sales = S.today.sales;
  S.pop = popCount();
  S.hist.push({ day: dayOf(S.T), rent, sales, other, costs, net: rent + sales + other - costs, pop: S.pop, sat: Math.round(S.avgSat), cash: S.cash });
  if (S.hist.length > 30) S.hist.shift();
  S.last = S.hist[S.hist.length - 1];
  S.today = { sales: 0 };
  // rang
  while (S.rank < 5 && S.pop >= RANK_POP[S.rank + 1] && S.avgSat >= RANK_SAT[S.rank + 1]) {
    S.rank++;
    const bonus = 5000 * S.rank;
    S.cash += bonus;
    emit({ k: 'rank', rank: S.rank, bonus });
    emit({ k: 'sound', name: 'rank' });
  }
  if (S.cash < -30000) { S.debtDays++; if (S.debtDays >= 3) { S.over = true; emit({ k: 'over' }); } } else S.debtDays = 0;
  emit({ k: 'day', rep: S.last });
  emit({ k: 'save' });
}

/* événements du matin */
function logEvent(text, lvl) {
  S.log.unshift({ t: S.T, text, lvl: lvl || 'info' });
  if (S.log.length > 12) S.log.pop();
  toast(text, lvl);
}
function pickWeighted(list) {
  let tot = 0;
  for (const e of list) tot += e[1];
  let x = rnd() * tot;
  for (const e of list) { x -= e[1]; if (x <= 0) return e[0]; }
  return list.length ? list[list.length - 1][0] : null;
}
function rollEvent() {
  if (S.over || dayOf(S.T) < 2 || rnd() > 0.3) return;
  const leased = [];
  for (const r of S.rooms.values()) if (TYPES[r.type].lease && r.tenant) leased.push(r);
  const opts = [];
  if (S.shafts.size) opts.push(['panne', 3]);
  if (leased.length) opts.push(['fuite', 3], ['vol', 2], ['inspection', 2]);
  if (S.pop >= 10) opts.push(['fete', 2], ['presse', 2]);
  if (maxBuilt() >= 8) opts.push(['tournage', 1]);
  runEvent(pickWeighted(opts));
}
function runEvent(ev) {
  const leased = [];
  for (const r of S.rooms.values()) if (TYPES[r.type].lease && r.tenant) leased.push(r);
  if (ev === 'panne' && S.shafts.size) {
    const list = [...S.shafts.values()], sh = list[Math.floor(rnd() * list.length)];
    const hrs = S.fx.tech ? 1.5 : 4, fee = S.fx.tech ? 150 : 350;
    sh.slowUntil = S.T + hrs * 60; S.cash -= fee;
    logEvent('Panne d’ascenseur : cabines au ralenti pendant ' + (S.fx.tech ? '1 h 30' : '4 h') + ' (réparation ' + fee + ' €).' + (S.fx.tech ? '' : ' Un local technique limite les pannes.'), 'warn');
  } else if (ev === 'fuite' && leased.length) {
    const r = leased[Math.floor(rnd() * leased.length)];
    r.dirt = Math.min(100, r.dirt + 35); r.sat = Math.max(0, r.sat - 6); S.cash -= 250;
    logEvent('Fuite d’eau : ' + TYPES[r.type].name + ', ' + label(r.f) + ' (réparation 250 €).', 'warn');
  } else if (ev === 'vol') {
    if (S.fx.sec) logEvent('Le poste de sécurité a déjoué un cambriolage.', 'good');
    else { const loss = Math.round((300 + rnd() * 900) / 10) * 10; S.cash -= loss; logEvent('Cambriolage : ' + loss + ' € volés. Un poste de sécurité (★3) les dissuade.', 'warn'); }
  } else if (ev === 'inspection' && leased.length) {
    let sum = 0;
    for (const r of leased) sum += r.dirt;
    if (sum / leased.length > 40) { S.cash -= 700; logEvent('Inspection : tour jugée sale, amende de 700 €.', 'warn'); }
    else { S.cash += 400; logEvent('Inspection réussie : subvention de 400 €.', 'good'); }
  } else if (ev === 'fete') {
    S.boostUntil = S.T + 12 * 60;
    logEvent('Fête de quartier : forte affluence dans les commerces jusqu’au soir.', 'good');
  } else if (ev === 'presse') {
    S.pressUntil = S.T + 3 * DAY;
    logEvent('Article de presse élogieux : la tour attire plus de monde pendant 3 jours.', 'good');
  } else if (ev === 'tournage') {
    const gain = 1200 + maxBuilt() * 60; S.cash += gain;
    logEvent('Un film se tourne dans la tour : +' + gain + ' €.', 'good');
  }
}

/* objectifs */
const GOALS = [
  { t: 'Construire 2 appartements', rw: 1500, ok: () => count('apt') >= 2 },
  { t: 'Loger 6 personnes', rw: 1500, ok: () => S.pop >= 6 },
  { t: 'Construire un ascenseur (3 étages)', rw: 2000, ok: () => [...S.shafts.values()].some((s) => s.f1 - s.f0 >= 2) },
  { t: 'Atteindre le rang ★2 (20 habitants)', rw: 3000, ok: () => S.rank >= 2 },
  { t: 'Ouvrir une boutique et une conciergerie', rw: 2500, ok: () => count('shop') >= 1 && count('janitor') >= 1 },
  { t: 'Monter jusqu’à R+8', rw: 3500, ok: () => maxBuilt() >= 8 },
  { t: 'Atteindre le rang ★3 (60 habitants)', rw: 5000, ok: () => S.rank >= 3 },
  { t: 'Ouvrir un restaurant', rw: 4000, ok: () => count('restoT') >= 1 },
  { t: 'Installer 3 cabines dans un ascenseur', rw: 4000, ok: () => [...S.shafts.values()].some((s) => s.ncars >= 3) },
  { t: 'Satisfaction moyenne ≥ 75 avec 80 habitants', rw: 6000, ok: () => S.pop >= 80 && S.avgSat >= 75 },
  { t: 'Atteindre le rang ★4 (140 habitants)', rw: 9000, ok: () => S.rank >= 4 },
  { t: 'Monter jusqu’à R+20', rw: 9000, ok: () => maxBuilt() >= 20 },
  { t: 'Louer un penthouse', rw: 12000, ok: () => count('pentT') >= 1 },
  { t: 'Atteindre le rang ★5 (260 habitants)', rw: 20000, ok: () => S.rank >= 5 },
  { t: 'Gagner 6 000 € par jour', rw: 25000, ok: () => S.last && S.last.net >= 6000 },
  { t: 'Ouvrir un café et une boulangerie', rw: 3500, ok: () => cnt('cafe', 1) >= 1 && cnt('bakery', 1) >= 1 },
  { t: 'Rénover 3 pièces', rw: 4000, ok: () => renovated() >= 3 },
  { t: 'Ouvrir une supérette et une pharmacie', rw: 6000, ok: () => cnt('grocery', 1) >= 1 && cnt('pharmacy', 1) >= 1 },
  { t: 'Installer un poste de sécurité et un local technique', rw: 7000, ok: () => cnt('security') >= 1 && cnt('tech') >= 1 },
  { t: 'Ouvrir une salle de sport', rw: 6000, ok: () => cnt('gym', 1) >= 1 },
  { t: 'Louer un loft', rw: 7000, ok: () => cnt('loft', 1) >= 1 },
  { t: 'Gagner 15 000 € par jour', rw: 12000, ok: () => S.last && S.last.net >= 15000 },
  { t: 'Ouvrir une banque', rw: 12000, ok: () => cnt('bank', 1) >= 1 },
  { t: 'Ouvrir un cinéma', rw: 15000, ok: () => cnt('cinema', 1) >= 1 },
  { t: 'Poser des panneaux solaires', rw: 10000, ok: () => cnt('solar') >= 1 },
  { t: 'Satisfaction moyenne ≥ 80 avec 200 habitants', rw: 20000, ok: () => S.pop >= 200 && S.avgSat >= 80 },
  { t: 'Ouvrir un club en sous-sol', rw: 15000, ok: () => cnt('club', 1) >= 1 },
  { t: 'Réunir 20 types de pièces différents', rw: 25000, ok: () => kindsBuilt() >= 20 },
  { t: 'Atteindre le sommet (R+45)', rw: 40000, ok: () => maxBuilt() >= 45 },
  { t: 'Ouvrir l’observatoire', rw: 40000, ok: () => cnt('observatory', 1) >= 1 },
  { t: 'Poser l’héliport', rw: 50000, ok: () => cnt('heli') >= 1 },
  { t: 'Gagner 40 000 € par jour', rw: 60000, ok: () => S.last && S.last.net >= 40000 },
  { t: 'Réunir 28 types de pièces différents', rw: 80000, ok: () => kindsBuilt() >= 28 }
];
function cnt(type, tenantOnly) {
  let n = 0;
  for (const r of S.rooms.values()) if (r.type === type && (!tenantOnly || r.tenant)) n++;
  return n;
}
function kindsBuilt() { const k = new Set(); for (const r of S.rooms.values()) k.add(r.type); return k.size; }
function renovated() { let n = 0; for (const r of S.rooms.values()) if ((r.lvl || 0) >= 1) n++; return n; }
function count(t) {
  let n = 0;
  for (const r of S.rooms.values()) {
    if (t === 'restoT') { if (r.type === 'resto' && r.tenant) n++; }
    else if (t === 'pentT') { if (r.type === 'pent' && r.tenant) n++; }
    else if (r.type === t) n++;
  }
  return n;
}
function maxBuilt() { let m = 0; for (const r of S.rooms.values()) m = Math.max(m, r.f + r.h - 1); return m; }
function checkGoals() {
  while (S.goalIdx < GOALS.length && GOALS[S.goalIdx].ok()) {
    const g = GOALS[S.goalIdx];
    S.cash += g.rw; S.goalIdx++;
    emit({ k: 'goal', text: g.t, reward: g.rw });
    emit({ k: 'sound', name: 'rank' });
  }
}

function updateAdvice() {
  const adv = [];
  let unreach = 0, dirtySum = 0, tenants = 0, vacant = 0;
  for (const r of S.rooms.values()) {
    const T = TYPES[r.type];
    if ((T.lease || T.service) && !r.reach && T.fx !== 'solar') unreach++;
    if (T.lease && r.tenant) { tenants++; dirtySum += r.dirt; }
    if (T.lease && !r.tenant && r.reach) vacant++;
  }
  let maxF = 0; for (const r of S.rooms.values()) maxF = Math.max(maxF, r.f);
  if (unreach) adv.push({ id: 'reach', lvl: 'warn', text: unreach + ' pièce' + (unreach > 1 ? 's' : '') + ' sans accès : reliez-les au hall par un couloir continu, un escalier ou un ascenseur.' });
  if (maxF >= 3 && !S.shafts.size) adv.push({ id: 'noelev', lvl: 'warn', text: 'Au-delà du 2e étage, les escaliers ne suffisent plus. Construisez un ascenseur.' });
  for (const sh of S.shafts.values()) {
    if (sh.wavg > 16 && sh.ncars < MAX_CARS) { adv.push({ id: 'wait' + sh.id, lvl: 'bad', text: 'Longue attente à l’ascenseur (' + Math.round(sh.wavg) + ' s en moyenne). Ajoutez une cabine ou un second ascenseur.', shaft: sh.id }); break; }
  }
  if (tenants && dirtySum / tenants > 42 && !count('janitor')) adv.push({ id: 'dirt', lvl: 'warn', text: 'La saleté s’accumule. Une conciergerie (rang ★2) nettoie les pièces.' });
  if (S.rank >= 3 && S.pop >= 60 && !S.fx.sec) adv.push({ id: 'sec', lvl: 'info', text: 'Un poste de sécurité (★3) déjoue les cambriolages et rassure les habitants.' });
  if (S.rank >= 3 && S.pop >= 80 && S.shafts.size && !S.fx.tech) adv.push({ id: 'tech', lvl: 'info', text: 'Un local technique (★3) réduit les pannes d’ascenseur et leur coût.' });
  if (S.cash < 2500 && S.cash >= 0) adv.push({ id: 'cash', lvl: 'warn', text: 'Trésorerie basse. Attendez les loyers de minuit ou empruntez à la banque.' });
  if (S.cash < 0) adv.push({ id: 'neg', lvl: 'bad', text: 'Compte à découvert : en dessous de −30 000 € pendant 3 jours, c’est la faillite.' });
  if (vacant >= 4 && S.avgSat < 60) adv.push({ id: 'vac', lvl: 'info', text: 'Plusieurs pièces restent vides : la tour manque d’attrait. Améliorez les ascenseurs et la propreté.' });
  if (S.rank < 5 && S.pop >= RANK_POP[S.rank + 1] && S.avgSat < RANK_SAT[S.rank + 1]) adv.push({ id: 'rank', lvl: 'info', text: 'Il manque de la satisfaction (' + RANK_SAT[S.rank + 1] + ' %) pour le prochain rang.' });
  S.advice = adv;
}

/* ───────────────────────── sauvegarde ───────────────────────── */

function serialize() {
  const rooms = [];
  for (const r of S.rooms.values()) {
    rooms.push({ id: r.id, type: r.type, f: r.f, c: r.c, tenant: r.tenant, sat: r.sat, dirt: r.dirt, visAvg: r.visAvg, paid: r.paid, shaft: r.shaft, lvl: r.lvl || 0, pol: r.pol || 0 });
  }
  const shafts = [];
  for (const sh of S.shafts.values()) shafts.push({ id: sh.id, ncars: sh.ncars, lvl: sh.lvl });
  return {
    v: 1, T: S.T, simT: S.simT, cash: S.cash, debt: S.debt, owned: S.owned, landBuys: S.landBuys, rank: S.rank,
    nextId: S.nextId, rooms, shafts, hist: S.hist, goalIdx: S.goalIdx, attr: S.attr, lastHour: S.lastHour, lastDay: S.lastDay,
    debtDays: S.debtDays
  };
}

function validate(d) {
  const fail = (m) => ({ ok: false, reason: m });
  const num = (v, lo, hi) => typeof v === 'number' && isFinite(v) && v >= lo && v <= hi;
  if (!d || typeof d !== 'object' || d.v !== 1) return fail('Version de sauvegarde inconnue.');
  if (!num(d.T, 0, 1e7) || !num(d.cash, -1e7, 1e9) || !num(d.debt == null ? 0 : d.debt, 0, 1e7)) return fail('Valeurs de la partie invalides.');
  const o = d.owned;
  if (!o || !Number.isInteger(o.l) || !Number.isInteger(o.r) || o.l < 0 || o.r > COLS - 1 || o.l > o.r) return fail('Terrain invalide.');
  if (!Number.isInteger(d.rank) || d.rank < 1 || d.rank > 5) return fail('Rang invalide.');
  if (!Array.isArray(d.rooms) || d.rooms.length < 1 || d.rooms.length > 3000) return fail('Liste des pièces invalide.');
  const seen = new Set(), cells = new Set();
  let hall = false;
  for (const r of d.rooms) {
    if (!r || typeof r !== 'object') return fail('Pièce invalide.');
    const TT = typeof r.type === 'string' && Object.prototype.hasOwnProperty.call(TYPES, r.type) ? TYPES[r.type] : null;
    if (!TT) return fail('Type de pièce inconnu.');
    if (!Number.isInteger(r.id) || r.id < 1 || seen.has(r.id)) return fail('Identifiants de pièces invalides.');
    seen.add(r.id);
    if (!Number.isInteger(r.f) || !Number.isInteger(r.c)) return fail('Position invalide.');
    if (r.f < FMIN || r.f + TT.h - 1 > FMAX || r.c < o.l || r.c + TT.w - 1 > o.r) return fail('Une pièce sort du terrain.');
    for (let rowf = r.f; rowf < r.f + TT.h; rowf++) for (let k = r.c; k < r.c + TT.w; k++) {
      const key = rowf * 100 + k;
      if (cells.has(key)) return fail('Deux pièces se chevauchent.');
      cells.add(key);
    }
    if (r.lvl != null && (!Number.isInteger(r.lvl) || r.lvl < 0 || r.lvl > 2)) return fail('Niveau de rénovation invalide.');
    if (r.pol != null && (!Number.isInteger(r.pol) || r.pol < -1 || r.pol > 1)) return fail('Réglage de loyer invalide.');
    if (r.type === 'hall') { if (r.f !== 0) return fail('Hall hors du rez-de-chaussée.'); hall = true; }
  }
  if (!hall) return fail('Aucun hall dans cette partie.');
  if (!Array.isArray(d.shafts) || d.shafts.length > 400) return fail('Ascenseurs invalides.');
  for (const sh of d.shafts) if (!sh || !Number.isInteger(sh.id) || !Number.isInteger(sh.ncars) || sh.ncars < 1 || sh.ncars > MAX_CARS || !Number.isInteger(sh.lvl) || sh.lvl < 1 || sh.lvl > 3) return fail('Ascenseur invalide.');
  if (d.hist != null && (!Array.isArray(d.hist) || d.hist.length > 60)) return fail('Historique invalide.');
  return { ok: true, info: { rooms: d.rooms.length, day: Math.floor(d.T / DAY) + 1, cash: Math.round(d.cash), rank: d.rank } };
}

function deserialize(d) {
  if (!validate(d).ok) return null;
  newState();
  for (const r of [...S.rooms.values()]) { for (let k = r.c; k < r.c + r.w; k++) S.grid[r.f - FMIN][k] = 0; }
  S.rooms.clear();
  const n = (v, lo, hi, dflt) => (typeof v === 'number' && isFinite(v) ? clamp(v, lo, hi) : dflt);
  S.T = d.T; S.simT = n(d.simT, 0, 1e9, 0); S.cash = d.cash; S.debt = n(d.debt, 0, 1e7, 0);
  S.owned = { l: d.owned.l, r: d.owned.r }; S.landBuys = Math.floor(n(d.landBuys, 0, 50, 0)); S.rank = d.rank;
  S.hist = (d.hist || []).map((h) => ({
    day: Math.floor(n(h && h.day, 0, 1e5, 0)), rent: n(h && h.rent, -1e9, 1e9, 0), sales: n(h && h.sales, -1e9, 1e9, 0), other: n(h && h.other, -1e9, 1e9, 0), costs: n(h && h.costs, -1e9, 1e9, 0),
    net: n(h && h.net, -1e9, 1e9, 0), pop: n(h && h.pop, 0, 1e5, 0), sat: n(h && h.sat, 0, 100, 0), cash: n(h && h.cash, -1e9, 1e9, 0)
  }));
  S.goalIdx = Math.floor(n(d.goalIdx, 0, GOALS.length, 0)); S.attr = n(d.attr, 0, 100, 55);
  S.lastHour = Math.floor(S.T / 60); S.lastDay = Math.floor(S.lastHour / 24); S.debtDays = Math.floor(n(d.debtDays, 0, 99, 0));
  S.last = S.hist[S.hist.length - 1];
  S.shafts = new Map();
  let maxId = 0;
  for (const sh of d.shafts) { S.shafts.set(sh.id, { id: sh.id, ncars: sh.ncars, lvl: sh.lvl, cars: [], q: {}, res: {}, wavg: 6 }); maxId = Math.max(maxId, sh.id); }
  for (const r of d.rooms) {
    const T = TYPES[r.type];
    const room = {
      id: r.id, type: r.type, f: r.f, c: r.c, w: T.w, h: T.h, tenant: (r.type === 'hall' || T.service) ? true : !!r.tenant,
      sat: n(r.sat, 0, 100, 65), dirt: n(r.dirt, 0, 100, 0), visAvg: n(r.visAvg, 0, 60, 5), paid: n(r.paid, 0, 1e6, T.cost), shaft: Number.isInteger(r.shaft) ? r.shaft : 0,
      vis: 0, visToday: 0, visY: 0, lost: 0, low: 0, trip: 10, reach: false, cleaner: 0, noise: 0, green: 0, bd: {},
      lvl: Number.isInteger(r.lvl) ? clamp(r.lvl, 0, 2) : 0, pol: Number.isInteger(r.pol) ? clamp(r.pol, -1, 1) : 0
    };
    S.rooms.set(room.id, room); maxId = Math.max(maxId, room.id);
    for (let rowf = room.f; rowf < room.f + room.h; rowf++) for (let k = room.c; k < room.c + room.w; k++) S.grid[rowf - FMIN][k] = room.id;
  }
  S.nextId = Math.max(maxId + 1, Math.floor(n(d.nextId, 1, 1e9, 1)));
  rebuild();
  for (const r of S.rooms.values()) if (r.tenant && r.type !== 'hall') spawnTenantAgents(r, true, true);
  S.pop = popCount();
  hourlyLight();
  return S;
}
function hourlyLight() { computeSvc(); S.attr = computeAttr(); updateAdvice(); }

function newGame() { return newState(); }

root.Engine = {
  get S() { return S; },
  COLS, FMIN, FMAX, NF, DAY, MPS, CAP, MAX_CARS, CAR_COST, RANK_FLOORS, RANK_BASE, RANK_POP, RANK_SAT,
  TYPES, ORDER, CATS, GOALS, newGame, deserialize, serialize, validate, tick, step,
  canPlace, place, costOf, canDemolish, demolish, buyLand, landCost, addCar, removeCar, upgradeShaft, upgradeCost, borrow, repay,
  roomAt, segAt, label, dateInfo, rentNow, runEvent, upgradeRoom, upgradeRoomCost, setPolicy, statsNow, interestRate, isOpen, popCount, maxFloor, minFloor, costsPerDay, shaftSpeed, findRoute
};
if (typeof module !== 'undefined' && module.exports) module.exports = root.Engine;

})(typeof window !== 'undefined' ? window : globalThis);
