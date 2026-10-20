// Gameplay simulation. Pure logic — no three.js, no DOM.
// step(state, input, dt) advances the world and returns events for the renderer/HUD.
// Rules: hunterkilltree/magical-world story/STORY.md R-037 … R-058, plus Ice Spear (water+ice) and tier-3 power.
import { ELEMENTS, MAX_QUEUE, CANCELS, resolveSpell, makeSpell } from './spells.js';
import { ENEMY_TYPES, waveRoster } from './enemies.js';
import { ROLES, STYLES, SHAPE_WEIGHT, WIZARD_ROLE, rolePair } from './roles.js';

export const ARENA_R = 24;
const SC = ARENA_R / 15; // layout authored at R=15, scaled out
export const BOUND = ARENA_R - 0.9;
export const GATES = [0, 0.5, 1, 1.5].map((k) => ({ a: k * Math.PI, x: Math.sin(k * Math.PI) * (ARENA_R - 1.8), z: -Math.cos(k * Math.PI) * (ARENA_R - 1.8) }));
export const TUNING = { r: 0.42, speed: 5.4, hp: 100, energy: 100, regen: 18, dodgeSpeed: 13.5, dodgeTime: 0.26,
  dodgeCd: 1.0, novaCd: 3, selfCd: 1.4, novaR: 3.4, aimRange: 10, wallDist: 2.4, shoveR: 2.6, fanR: 2.5,
  friendly: 0.5, reviveR: 1.8, reviveT: 3, reviveHp: 0.4, reviveDrain: 0.5 };
export const MAX_PLAYERS = 4;
const P = TUNING;

// The sim's random numbers. Tests and replays seed them (seedRandom); a live game uses Math.random.
let rand = Math.random;
export function seedRandom(seed) {
  let a = seed >>> 0;
  rand = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function unseedRandom() { rand = Math.random; }
const DECAY = ['frozen', 'shock', 'slow', 'stoneskin', 'haste', 'root', 'blind', 'curse', 'stun', 'silence', 'weaken', 'inaccurate', 'confuse', 'regen', 'armor', 'reflect', 'invuln', 'amp'];
const MOVES = new Set(['guard', 'blink', 'dash', 'decoy', 'swap']);
const LONG = new Set(['area', 'wall', ...MOVES]);

const ENV = {
  charged: { parts: { lightning: 5 }, shock: 0.2, els: ['lightning'], knock: 0 },
  frost:   { parts: {}, chill: 1, els: ['ice'], knock: 0 },
  brush:   { parts: { fire: 3 }, burn: 2.5, burnDps: 5, els: ['fire'], knock: 0 },
  barrel:  { parts: { fire: 22, earth: 14 }, burn: 3, burnDps: 6, knock: 11, els: ['fire', 'earth'] },
  rime:    { parts: { ice: 3 }, chill: 1, els: ['ice'], knock: 0 }
};
const ZAP = makeSpell(['lightning'], { name: 'Discharge', shape: 'chain', mult: 0.9 });
const REFLECTED = makeSpell(['arcane'], { name: 'Reflected hex', shape: 'bolt', mult: 12 / 11 }, 1, 'reflected');
const LEAVES = (l, burnMult) => makeSpell(['fire'], { name: l.name ?? 'burning ground', shape: 'area', radius: l.radius, life: l.life,
  tick: l.tick, mult: l.mult, hitsAll: true, burnMult, visual: 'burning_land' }, 1, 'burning');

const status = () => ({ burn: 0, burnDps: 0, kindled: false, wet: 0, chill: 0, chillT: 0, frozen: 0, shock: 0, slow: 0, slowPct: 0.4,
  stoneskin: 0, ward: 0, wardT: 0, haste: 0, root: 0, blind: 0, curse: 0, stun: 0, silence: 0, weaken: 0, inaccurate: 0, confuse: 0,
  regen: 0, regenHp: 0, armor: 0, reflect: 0, invuln: 0, revive: 0, amp: 0 });
export const newStatus = () => status();
const ev = (s, type, o) => s.events.push({ type, ...o });
const stop = (s, v) => { if (!s.coop) s.hitstop = Math.max(s.hitstop, v); };
const byId = (s, id) => (id === undefined ? null : s.players.find((q) => q.id === id) ?? null);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const live = (s) => s.enemies.filter((e) => e.state !== 'spawn' && e.hp > 0);
const clampIn = (x, z, m) => { const L = Math.hypot(x, z); return L > m ? [(x * m) / L, (z * m) / L] : [x, z]; };
const matFor = (els) => (els.includes('ice') ? 'ice' : els.includes('nature') ? 'wood' : els.some((e) => e === 'light' || e === 'arcane' || e === 'lightning') ? 'crystal' : 'stone');

function makeProps() {
  return {
    // Inner ring (original layout, spread ×SC) + an outer ring that fills the larger floor.
    pillars: [[-6.2, -5.4, 0.75], [6.4, -5.0, 0.75], [-6.6, 5.2, 0.75], [6.0, 5.8, 0.75], [0, -7, 0.6]].map(([x, z, r]) => [x * SC, z * SC, r])
      .concat([[-15.5, -6, 0.9], [15.8, -7.5, 0.9], [-14, 11, 0.85], [13.5, 12.5, 0.85], [-5, 17, 0.75], [6.5, -17.5, 0.75], [0, 9.5, 0.6]])
      .map(([x, z, r], i) => ({ id: 'pil' + i, x, z, r })),
    puddles: [[-4.2, 1.6, 1.9], [4.4, -1.8, 2.0], [1.0, 8.4, 1.6], [-1.5, -10.2, 1.7]].map(([x, z, r]) => [x * SC, z * SC, r * 1.2])
      .concat([[-17, 2, 2.1], [17.5, 3.5, 2.0], [-10, -16, 1.8], [11, 18, 1.8]])
      .map(([x, z, r], i) => ({ id: 'pud' + i, type: 'puddle', x, z, r, state: 'water', t: 0, tickT: 0 })),
    brush: [[4.8, 3.2, 1.6], [-5.0, -2.2, 1.5], [-9.4, 2.2, 1.6], [9.6, -1.4, 1.5], [2.4, -9.6, 1.4]].map(([x, z, r]) => [x * SC, z * SC, r * 1.2])
      .concat([[-12, 15.5, 1.7], [14.5, -14, 1.7], [-18, -10, 1.5], [19, 9, 1.5], [-3, -19, 1.4], [3.5, 19.5, 1.4]])
      .map(([x, z, r], i) => ({ id: 'bru' + i, type: 'brush', x, z, r, state: 'dry', t: 0, tickT: 0, spreadT: 0 })),
    barrels: [[2.6, -3.6], [-3.2, -6.8], [-9.0, -6.0], [9.4, 6.0], [-2.2, 10.6]].map(([x, z]) => [x * SC, z * SC])
      .concat([[-17.5, -3], [18, -1], [-8, 18.5], [9, -19], [16, 15.5], [-15.5, -15]])
      .map(([x, z], i) => ({ id: 'bar' + i, type: 'barrel', x, z, r: 0.42, alive: true, fuse: 0 }))
  };
}

function makePlayer(id, wizard, role, x, z, name) {
  return {
    id, name: name ?? id, isPlayer: true, wizard, role: ROLES[role] ? role : WIZARD_ROLE[wizard] ?? 'destroyer', x, z,
    wind: null, castMax: 0.3, castStyle: 'thrust', castW: 0.5, dashT: 0, dashVx: 0, dashVz: 0, dashSp: null, dashW: 0, dashHit: null, vx: 0, vz: 0, kvx: 0, kvz: 0, r: P.r, mass: 1.2,
    hp: P.hp, maxHp: P.hp, energy: P.energy, maxEnergy: P.energy, fx: 0, fz: -1,
    queue: [], last: null, cd: { cast: 0, nova: 0, self: 0, dodge: 0 }, shapeCd: {}, shapeMax: {}, spellCd: {}, spellMax: {},
    cdMax: { cast: 0.3, nova: P.novaCd, self: P.selfCd, dodge: P.dodgeCd },
    dodge: 0, ddx: 0, ddz: 0, st: status(), alive: true, down: false, reviveT: 0, castT: 0, hurtT: 0, speed: 0, deadT: 0, dotAcc: 0, healAcc: 0,
    stats: { kills: 0, dealt: 0, taken: 0, casts: 0, revives: 0, downs: 0 } // this wizard's share of the run (R-084)
  };
}

function baseGame() {
  return {
    mode: 'menu', t: 0, wave: 0, kills: 0, score: 0, waveT: 2.2, spawnQ: [], spawnT: 0, waveInfo: null,
    hitstop: 0, nid: 1, remaining: 0, coop: false, friendly: 0, who: null,
    players: [], player: null,
    enemies: [], shots: [], areas: [], walls: [], decoys: [], regrow: [], props: makeProps(), events: [],
    stats: { casts: 0, dealt: 0, taken: 0, selfDmg: 0, healed: 0, found: new Set() }
  };
}

// One wizard, the original game. `game.player` is that wizard.
export function createGame(wizard, role) {
  const s = baseGame();
  s.players.push(makePlayer('player', wizard, role, 0, 3.5));
  s.player = s.players[0];
  return s;
}

// Co-op (R-080): one to four wizards. slots: [{id?, wizard, role?, name?}]. No pause, no hit-stop,
// allies take half of your blasts, and waves grow with the party.
export function createCoopGame(slots = []) {
  const s = baseGame();
  s.coop = true;
  s.friendly = P.friendly;
  for (const slot of slots) addPlayer(s, slot);
  s.player = s.players[0] ?? null;
  return s;
}

// Joins a wizard (null when the party is full). Ids are p1..p4; a free one is reused.
export function addPlayer(s, { id, wizard, role, name } = {}) {
  if (s.players.length >= MAX_PLAYERS) return null;
  if (!id) id = [1, 2, 3, 4].map((n) => 'p' + n).find((x) => !s.players.some((q) => q.id === x));
  if (s.players.some((q) => q.id === id)) return null;
  const k = Math.max(0, (+String(id).replace(/\D/g, '') || 1) - 1) % MAX_PLAYERS, a = (k * Math.PI) / 2;
  const q = makePlayer(id, wizard, role, Math.sin(a) * 3.5, Math.cos(a) * 3.5, name);
  s.players.push(q);
  s.players.sort((m, n) => m.id.localeCompare(n.id));
  if (!s.player) s.player = q;
  return q;
}

export function removePlayer(s, id) {
  const i = s.players.findIndex((q) => q.id === id);
  if (i < 0) return false;
  s.players.splice(i, 1);
  if (s.player && s.player.id === id) s.player = s.players[0] ?? null;
  return true;
}

// Inputs: {players: {id: {move, aim, actions}}}, or the single-player shape {move, aim, actions}
// which drives the first wizard.
function inputOf(p, raw) {
  return { move: raw?.move ?? { x: 0, z: 0 }, aim: raw?.aim ?? { x: p.x + p.fx, z: p.z + p.fz }, actions: raw?.actions ?? [] };
}

export function step(s, inp, dt) {
  s.events = [];
  const raw = inp.players ?? (s.players[0] ? { [s.players[0].id]: inp } : {});
  const ins = new Map(s.players.map((q) => [q.id, inputOf(q, raw[q.id])]));
  for (const p of s.players) for (const a of ins.get(p.id).actions) act(s, p, a, ins.get(p.id));
  if (s.mode !== 'play' && s.mode !== 'dead') return s.events;
  if (s.hitstop > 0) { s.hitstop -= dt; dt *= 0.2; }
  s.t += dt;
  for (const p of s.players) {
    s.who = p;
    if (p.alive) updatePlayer(s, p, ins.get(p.id), dt); else p.deadT += dt;
  }
  s.who = null;
  if (s.mode === 'play') updateRevives(s, dt);
  if (s.mode === 'play') updateWaves(s, dt);
  for (const e of s.enemies) updateEnemy(s, e, dt);
  separate(s);
  updateShots(s, dt);
  updateAreas(s, dt);
  updateWalls(s, dt);
  updateDecoys(s, dt);
  updateProps(s, dt);
  s.enemies = s.enemies.filter((e) => (e.hp > 0 ? true : (kill(s, e), false)));
  for (const p of s.players) {
    if (!p.alive || p.hp > 0) continue;
    if (p.st.revive > 0) { p.st.revive = 0; p.hp = p.maxHp * 0.5; p.st.invuln = 1.5; ev(s, 'revive', { pid: p.id, x: p.x, z: p.z }); continue; }
    p.alive = false; p.hp = 0; p.down = true; p.reviveT = 0; p.wind = null; p.dashT = 0; p.deadT = 0; p.stats.downs++;
    ev(s, 'playerDown', { pid: p.id, id: p.id, x: p.x, z: p.z });
  }
  if (s.players.length && s.players.every((q) => !q.alive) && s.mode === 'play') {
    s.mode = 'dead';
    const p = s.player ?? s.players[0];
    ev(s, 'playerDeath', { pid: p.id, x: p.x, z: p.z });
  }
  s.remaining = s.spawnQ.length + s.enemies.length;
  return s.events;
}

// A downed wizard is raised by a living ally standing close (R-080); the progress drains when nobody is near.
function updateRevives(s, dt) {
  for (const p of s.players) {
    if (p.alive || !p.down) continue;
    const near = s.players.filter((q) => q.alive && q !== p && Math.hypot(q.x - p.x, q.z - p.z) < P.reviveR);
    if (near.length > 0) p.reviveT += dt * (1 + 0.5 * (near.length - 1));
    else p.reviveT = Math.max(0, p.reviveT - dt * P.reviveDrain);
    if (p.reviveT >= P.reviveT) { raise(s, p, P.reviveHp); for (const q of near) q.stats.revives++; }
  }
}

function raise(s, p, hpFrac) {
  p.alive = true; p.down = false; p.reviveT = 0; p.deadT = 0;
  p.hp = p.maxHp * hpFrac;
  p.st = status();
  p.st.invuln = 1.5;
  ev(s, 'revived', { pid: p.id, id: p.id, x: p.x, z: p.z });
}

// ---------------------------------------------------------------- actions
function act(s, p, a, inp) {
  if (a === 'pause') {
    if (s.coop) return; // the court does not wait for anyone
    if (s.mode === 'play') s.mode = 'paused'; else if (s.mode === 'paused') s.mode = 'play';
    return;
  }
  if (s.mode !== 'play' || !p.alive) return;
  if (a.startsWith('el:')) return queueEl(s, p, a.slice(3));
  if (a === 'clear') { if (p.queue.length) { p.queue = []; ev(s, 'clear', { pid: p.id }); } return; }
  if (a === 'cast') return cast(s, p, inp, 'aim', false);
  if (a === 'recast') return cast(s, p, inp, 'aim', true);
  if (a === 'nova') return cast(s, p, inp, 'nova', false);
  if (a === 'self') return cast(s, p, inp, 'self', false);
  if (a === 'dodge') return dodge(s, p, inp);
}

function queueEl(s, p, el) {
  if (!ELEMENTS[el]) return;
  const opp = CANCELS[el];
  // Opposites cancel — unless the caster's role knows a spell for the clash.
  const i = opp && !rolePair(p.role, el, opp) ? p.queue.lastIndexOf(opp) : -1;
  if (i >= 0) { p.queue.splice(i, 1); ev(s, 'cancel', { pid: p.id, a: el, b: opp, x: p.x, z: p.z }); return; }
  if (p.queue.length >= MAX_QUEUE) { ev(s, 'queueFull', { pid: p.id }); return; }
  p.queue.push(el);
  ev(s, 'queue', { pid: p.id, el });
}

// Matrix spells recharge on their own timer (R-055); areas and walls on their shape's (R-039).
function ownTimer(sp) {
  const d = sp.def;
  if (d.role && LONG.has(d.shape)) return { bag: 'spellCd', max: 'spellMax', id: sp.sid, t: sp.cd };
  if (d.matrix !== undefined && d.cd) return { bag: 'spellCd', max: 'spellMax', id: sp.key, t: d.cd };
  if (d.shape === 'area' || d.shape === 'wall') return { bag: 'shapeCd', max: 'shapeMax', id: d.shape, t: sp.cd };
  return null;
}

function cast(s, p, inp, mode, held) {
  const st = p.st;
  if (st.frozen > 0 || st.stun > 0 || p.wind || p.dashT > 0) return;
  let q = p.queue;
  if (held && q.length) return;
  if (!q.length) {
    if (mode === 'aim' && p.last) q = p.last;
    else { if (!held) ev(s, 'fizzle', { pid: p.id, x: p.x, z: p.z }); return; }
  }
  const slot = mode === 'aim' ? 'cast' : mode;
  if (p.cd[slot] > 0) return;
  const sp = resolveSpell(q, p.role);
  if (!sp) { p.queue = []; ev(s, 'fizzle', { pid: p.id, x: p.x, z: p.z }); return; }
  const d = sp.def, own = mode === 'aim' ? ownTimer(sp) : null;
  if (own && p[own.bag][own.id] > 0) {
    if (!held) ev(s, 'cooldown', { pid: p.id, shape: d.shape, name: sp.name, spell: own.bag === 'spellCd', t: p[own.bag][own.id] });
    return;
  }
  const cost = Math.round(sp.cost * (mode === 'nova' ? 1.3 : mode === 'self' ? 0.5 : 1));
  if (p.energy < cost) { if (!held) ev(s, 'noEnergy', { pid: p.id, cost }); return; }
  p.energy -= cost;
  const cd = mode === 'aim' ? Math.min(sp.cd, 0.45) : mode === 'nova' ? P.novaCd : P.selfCd;
  p.cd[slot] = cd; p.cdMax[slot] = cd;
  if (own) { p[own.bag][own.id] = own.t; p[own.max][own.id] = own.t; }
  const fromQueue = p.queue.length > 0, isNew = !s.stats.found.has(sp.sid);
  if (fromQueue) p.last = [...p.queue];
  p.queue = [];
  s.stats.casts++; s.stats.found.add(sp.sid); p.stats.casts++;
  // Anticipation: the body loads the spell before it leaves. Heavier spells and heavier styles wind up longer.
  const style = ROLES[p.role]?.style ?? 'thrust', S = STYLES[style];
  const weight = Math.min(1.3, (SHAPE_WEIGHT[d.shape] ?? 0.5) * (0.75 + 0.25 * sp.tier) + (mode === 'nova' ? 0.3 : 0));
  const t0 = mode === 'self' ? 0.08 : Math.min(0.34, S.windup * (0.55 + 0.6 * weight));
  const hold = mode === 'self' ? 0 : 0.03 + 0.07 * Math.min(1, weight); // the held breath at full anticipation
  const t = t0 + hold;
  p.wind = { t, max: t, hold, sp, mode, fromQueue, isNew, style, weight };
  ev(s, 'windup', { pid: p.id, style, weight, t, hold, mode, shape: d.shape, x: p.x, z: p.z, dx: p.fx, dz: p.fz, els: sp.els, color: sp.color,
    key: sp.key, role: p.role, tier: sp.tier, name: sp.name });
}

// Release: the spell leaves the staff, aimed where the cursor is now.
function release(s, p, inp) {
  const st = p.st, w = p.wind, mode = w.mode;
  s.who = p;
  p.wind = null;
  let sp = w.sp;
  const d = sp.def;
  if (st.amp > 0 && d.shape !== 'guard' && mode !== 'self') sp = { ...makeSpell(sp.els, d, sp.power * 1.35, sp.key, sp.name), amped: true };
  p.castT = p.castMax = STYLES[w.style].recoil * (0.7 + 0.5 * w.weight); p.castStyle = w.style; p.castW = w.weight;
  const distinct = sp.tier;
  if (w.fromQueue && distinct >= 2) stop(s, w.isNew ? 0.16 : distinct >= 3 ? 0.07 : 0.035);
  if (w.style === 'slam' && mode !== 'self') stop(s, 0.04 + 0.05 * w.weight);
  const ax = inp.aim.x - p.x, az = inp.aim.z - p.z, aimDist = Math.hypot(ax, az);
  if (aimDist > 0.05) { p.fx = ax / aimDist; p.fz = az / aimDist; }
  const dx = p.fx, dz = p.fz;
  ev(s, 'cast', { pid: p.id, mode, shape: d.shape, name: sp.name, key: sp.key, sid: sp.sid, role: d.role, arch: d.arch, style: w.style, weight: w.weight,
    els: sp.els, color: sp.color, x: p.x, z: p.z, dx, dz, fromQueue: w.fromQueue, isNew: w.isNew, distinct, tier: sp.tier,
    visual: d.visual, spear: !!d.spear, amped: !!sp.amped });
  if (sp.counts.lightning && st.wet > 0 && mode !== 'self') {
    hurt(s, p, 7 * sp.counts.lightning, 'lightning', { self: true, reason: 'Cast lightning while wet' });
    st.shock = Math.max(st.shock, 0.35);
  }
  if (mode === 'self') return selfCast(s, sp, p);
  if (d.revive) { st.revive = 1; ev(s, 'tag', { tag: 'blessing', x: p.x, z: p.z, id: p.id }); }
  if (d.armor) st.armor = Math.max(st.armor, d.armor);
  if (d.reflectPlayer) st.reflect = Math.max(st.reflect, d.reflectPlayer);
  if (mode === 'nova' && !MOVES.has(d.shape)) return nova(s, sp, p);
  (CAST[d.shape] ?? CAST.bolt)(s, sp, p, dx, dz, Math.max(1.2, aimDist));
}

const CAST = {
  cone(s, sp, p, dx, dz) {
    const d = sp.def, range = d.range ?? 5, cos = Math.cos(((d.arc ?? 50) * Math.PI) / 360);
    const inside = (o, pad) => {
      const vx = o.x - p.x, vz = o.z - p.z, L = Math.hypot(vx, vz);
      if (L > range + pad) return false;
      return L < pad + 0.4 || (vx * dx + vz * dz) / L >= cos;
    };
    for (const e of live(s)) if (inside(e, e.r)) {
      const L = dist(e, p) || 1;
      applyPayload(s, e, sp.payload, { kx: (e.x - p.x) / L, kz: (e.z - p.z) / L, scale: 1 - 0.35 * Math.min(1, L / range), block: shieldBlocks(e, p.x, p.z) ? 0.5 : 1 });
    }
    for (const w of s.walls) if (inside(w, w.r)) wallHit(s, w, sp.payload, 0.5);
    for (const o of envList(s)) if (inside(o, o.r)) envHit(s, o, sp.els, false);
    if (d.deflect) for (const b of s.shots) if (b.owner === 'enemy' && inside(b, b.r)) { b.dead = true; ev(s, 'deflect', { x: b.x, z: b.z }); }
    if (d.pool) addPool(s, p.x + dx * range * 0.55, p.z + dz * range * 0.55, d.pool);
    if (d.channel) sprayStart(s, sp, p);
    ev(s, 'cone', { pid: p.id, x: p.x, z: p.z, dx, dz, range, arc: d.arc ?? 50, els: sp.els, color: sp.color, key: sp.key, tier: sp.tier, channel: d.channel });
  },
  bolt(s, sp, p, dx, dz) {
    const d = sp.def, n = d.count ?? 1, spread = ((d.spread ?? 0) * Math.PI) / 180, speed = d.speed ?? 20;
    for (let i = 0; i < n; i++) {
      const a = n > 1 ? (i - (n - 1) / 2) * spread : 0, c = Math.cos(a), sn = Math.sin(a);
      const vx = dx * c + dz * sn, vz = -dx * sn + dz * c;
      const heavy = !!d.explode && (d.radius ?? 0.24) >= 0.3; // bombs lob in an arc and skip once
      s.shots.push({ id: s.nid++, kind: d.spear ? 'spear' : 'bolt', owner: 'player', pid: p.id, x: p.x + vx * 0.6, z: p.z + vz * 0.6, vx: vx * speed, vz: vz * speed,
        r: d.radius ?? 0.24, life: d.life ?? 1.2, pierce: d.pierce ?? 0, hits: [], sp, color: sp.color, els: sp.els,
        ...(heavy ? { arc: true, y: 1.15, vy: 2.6, bounces: 1 } : {}) });
    }
  },
  boulder(s, sp, p, dx, dz) {
    const speed = sp.def.speed ?? 11;
    s.shots.push({ id: s.nid++, kind: 'boulder', owner: 'player', pid: p.id, x: p.x + dx * 0.7, z: p.z + dz * 0.7, vx: dx * speed, vz: dz * speed,
      r: 0.4, life: 1.7, pierce: 0, hits: [], sp, color: sp.color, els: sp.els, arc: true, y: 1.0, vy: 3.2, bounces: 2 });
  },
  chain(s, sp, p, dx, dz, aimDist) {
    const d = sp.def, range = d.range ?? 7.5;
    if (d.forks) return forkChain(s, sp, p, dx, dz, aimDist);
    let first = null, best = Infinity;
    for (const e of live(s)) {
      const vx = e.x - p.x, vz = e.z - p.z, L = Math.hypot(vx, vz);
      if (L > range + e.r) continue;
      const dot = (vx * dx + vz * dz) / (L || 1);
      if (dot < 0.72) continue;
      const score = L * (2.2 - dot);
      if (score < best) { best = score; first = e; }
    }
    const pts = [[p.x + dx * 0.5, p.z + dz * 0.5]];
    if (first) chainWalk(s, sp, first, d.jumps ?? 2, pts, 1, new Set());
    else {
      const L = Math.min(range, aimDist), ex = p.x + dx * L, ez = p.z + dz * L;
      pts.push([ex, ez]);
      envAt(s, ex, ez, 0.9, sp.els, false);
    }
    ev(s, 'chain', { pid: p.id, pts, els: sp.els, color: sp.color, key: sp.key, tier: sp.tier });
  },
  area(s, sp, p, dx, dz, aimDist) {
    if (sp.def.self) return spawnArea(s, sp, p.x, p.z);
    const L = Math.min(aimDist, sp.def.range ?? P.aimRange);
    spawnArea(s, sp, p.x + dx * L, p.z + dz * L);
  },
  wall(s, sp, p, dx, dz, aimDist) {
    const d = sp.def, n = d.segments ?? 5, mat = d.mat ?? matFor(sp.els);
    if (d.ring) { // cage around the aim point, or a dome around yourself
      const self = d.around === 'self', L = Math.min(aimDist, P.aimRange);
      const [cx, cz] = self ? [p.x, p.z] : clampIn(p.x + dx * L, p.z + dz * L, BOUND - d.ring - 0.4);
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; addWall(s, cx + Math.sin(a) * d.ring, cz + Math.cos(a) * d.ring, sp); }
      ev(s, 'wall', { pid: p.id, x: cx, z: cz, mat, key: sp.key, dx, dz, n, ring: d.ring, self, els: sp.els, color: sp.color, arch: d.arch });
      if (!self) explode(s, cx, cz, d.ring, sp.payload, { color: sp.color, els: sp.els, key: sp.key, tier: sp.tier });
      return;
    }
    const cx = p.x + dx * P.wallDist, cz = p.z + dz * P.wallDist;
    for (let i = 0; i < n; i++) { const o = (i - (n - 1) / 2) * 0.95; addWall(s, cx - dz * o, cz + dx * o, sp); }
    ev(s, 'wall', { pid: p.id, x: cx, z: cz, mat, key: sp.key, dx, dz, n, els: sp.els, color: sp.color, arch: d.arch });
  },
  beam(s, sp, p, dx, dz) {
    const d = sp.def, n = d.count ?? 1, spr = ((d.spread ?? 0) * Math.PI) / 180;
    for (let i = 0; i < n; i++) {
      const a = n > 1 ? (i - (n - 1) / 2) * spr : 0, c = Math.cos(a), sn = Math.sin(a);
      beamOne(s, sp, p, dx * c + dz * sn, -dx * sn + dz * c);
    }
  },
  guard(s, sp, p) { guardCast(s, sp, p); },
  blink(s, sp, p, dx, dz, aimDist) {
    const d = sp.def, L = Math.min(d.dist ?? 7, Math.max(2, aimDist)), x0 = p.x, z0 = p.z;
    [p.x, p.z] = clampIn(p.x + dx * L, p.z + dz * L, BOUND - p.r);
    collide(s, p);
    p.vx = p.vz = p.kvx = p.kvz = 0;
    p.st.invuln = Math.max(p.st.invuln, 0.3);
    if (d.ward) { p.st.ward = Math.max(p.st.ward, d.ward * sp.power); p.st.wardT = 5; }
    ev(s, 'blink', { pid: p.id, x0, z0, x1: p.x, z1: p.z, els: sp.els, color: sp.color, key: sp.key, arch: d.arch, role: d.role });
    const o = { color: sp.color, els: sp.els, key: sp.key, tier: sp.tier };
    if (d.burstFrom) explode(s, x0, z0, d.burstFrom, sp.payload, o);
    if (d.burstTo) explode(s, p.x, p.z, d.burstTo, sp.payload, o);
    if (d.delayedFrom) spawnArea(s, makeSpell(sp.els, { name: sp.name, shape: 'area', radius: d.delayedFrom, delay: 0.9, life: 0.01, burst: true, mult: d.mult }, sp.power, sp.key), x0, z0);
  },
  dash(s, sp, p, dx, dz) {
    const d = sp.def, L = d.dist ?? 6, T = 0.18;
    if (d.decoy) spawnDecoy(s, sp, p.x, p.z, d.decoy, p);
    Object.assign(p, { dashT: T, dashVx: (dx * L) / T, dashVz: (dz * L) / T, dashSp: sp, dashW: d.width ?? 0.9, dashHit: [] });
    ev(s, 'dash', { pid: p.id, x: p.x, z: p.z, dx, dz, dist: L, t: T, els: sp.els, color: sp.color, key: sp.key, arch: d.arch, role: d.role });
  },
  // Doubles stand where you were (or fan out toward the enemy) while you slip back out of reach.
  decoy(s, sp, p, dx, dz) {
    const d = sp.def, n = d.count ?? 1;
    for (let i = 0; i < n; i++) {
      const o = n > 1 ? i - (n - 1) / 2 : 0;
      const D = spawnDecoy(s, sp, p.x - dz * o * 1.3, p.z + dx * o * 1.3, d, p);
      if (n > 1) { const a = o * 0.6, c = Math.cos(a), sn = Math.sin(a); D.vx = (dx * c + dz * sn) * 2.4; D.vz = (-dx * sn + dz * c) * 2.4; }
    }
    if (d.hop) {
      const x0 = p.x, z0 = p.z;
      [p.x, p.z] = clampIn(p.x - dx * d.hop, p.z - dz * d.hop, BOUND - p.r);
      collide(s, p);
      p.st.invuln = Math.max(p.st.invuln, 0.25);
      ev(s, 'blink', { pid: p.id, x0, z0, x1: p.x, z1: p.z, els: sp.els, color: sp.color, key: sp.key, arch: d.arch, hop: true });
    }
  },
  swap(s, sp, p, dx, dz, aimDist) {
    const d = sp.def, range = d.range ?? 10;
    let tg = null, best = Infinity;
    for (const e of live(s)) {
      const vx = e.x - p.x, vz = e.z - p.z, L = Math.hypot(vx, vz);
      if (L > range || (vx * dx + vz * dz) / (L || 1) < 0.8) continue;
      if (L < best) { best = L; tg = e; }
    }
    if (!tg) return CAST.blink(s, { ...sp, def: { ...d, dist: 6, burstTo: 1.6 } }, p, dx, dz, aimDist);
    const x0 = p.x, z0 = p.z;
    p.x = tg.x; p.z = tg.z; tg.x = x0; tg.z = z0;
    collide(s, p); collide(s, tg);
    p.vx = p.vz = p.kvx = p.kvz = 0;
    p.st.invuln = Math.max(p.st.invuln, 0.35);
    applyPayload(s, tg, { ...sp.payload, stun: Math.max(sp.payload.stun || 0, 0.9) }, {});
    ev(s, 'swap', { pid: p.id, x0, z0, x1: p.x, z1: p.z, id: tg.id, els: sp.els, color: sp.color, key: sp.key, arch: d.arch });
  }
};

function guardCast(s, sp, p) {
  const st = p.st, d = sp.def, pw = sp.power;
  if (d.ward) { st.ward = Math.max(st.ward, d.ward * pw); st.wardT = 6; }
  if (d.armor) st.armor = Math.max(st.armor, d.armor);
  if (d.reflect) st.reflect = Math.max(st.reflect, d.reflect);
  if (d.invuln) st.invuln = Math.max(st.invuln, d.invuln);
  if (d.stoneskin) st.stoneskin = Math.max(st.stoneskin, d.stoneskin);
  if (d.haste) st.haste = Math.max(st.haste, d.haste);
  if (d.amp) st.amp = Math.max(st.amp, d.amp);
  if (d.regen) { st.regen = Math.max(st.regen, d.regen); st.regenHp = Math.max(st.regenHp, 4 * pw); }
  if (d.rootSelf) st.root = Math.max(st.root, d.invuln ?? 1.5);
  if (d.cleanse) {
    if (st.burn > 0 || st.chill > 0 || st.slow > 0 || st.curse > 0 || st.shock > 0) ev(s, 'tag', { tag: 'cleanse', x: p.x, z: p.z, id: p.id });
    Object.assign(st, { burn: 0, kindled: false, chill: 0, slow: 0, frozen: 0, shock: 0, curse: 0, wet: 0 });
  }
  if (d.heal) heal(s, p, d.heal * pw, true);
  if (d.energy) p.energy = Math.min(p.maxEnergy, p.energy + d.energy);
  if (d.revive) { st.revive = 1; ev(s, 'tag', { tag: 'blessing', x: p.x, z: p.z, id: p.id }); }
  if (d.near) {
    const pl = { ...sp.payload, parts: {}, knock: 3 };
    for (const k in sp.payload.parts) pl.parts[k] = sp.payload.parts[k] * 0.5;
    if (d.blind) pl.blind = Math.max(pl.blind || 0, d.blind);
    if (d.confuse) pl.confuse = d.confuse;
    for (const e of live(s)) { const L = dist(e, p); if (L < d.near + e.r) applyPayload(s, e, pl, { kx: (e.x - p.x) / (L || 1), kz: (e.z - p.z) / (L || 1) }); }
  }
  ev(s, 'guard', { pid: p.id, x: p.x, z: p.z, arch: d.arch, els: sp.els, color: sp.color, key: sp.key, near: d.near ?? 0, ward: !!d.ward, invuln: !!d.invuln,
    heal: !!(d.heal || d.regen), amp: !!d.amp, stone: !!d.stoneskin, reflect: !!d.reflect, revive: !!d.revive });
}

function spawnDecoy(s, sp, x, z, o, owner = s.who ?? s.players[0]) {
  [x, z] = clampIn(x, z, BOUND - 0.5);
  const hp = (o.hp ?? 60) * sp.power;
  const D = { id: s.nid++, decoy: true, x, z, vx: 0, vz: 0, kvx: 0, kvz: 0, r: 0.42, mass: 1.5, hp, maxHp: hp, life: o.life ?? 5, max: o.life ?? 5,
    burst: o.burst ?? 0, pulse: o.pulse ?? 0, pulseT: 0.4, heal: o.heal ?? 0, st: status(), sp, flash: 0, face: Math.atan2(owner.fx, owner.fz), pid: owner.id };
  s.decoys.push(D);
  ev(s, 'decoy', { pid: owner.id, id: D.id, x, z, els: sp.els, color: sp.color, key: sp.key, arch: sp.def.arch, life: D.life, summon: !!D.pulse });
  return D;
}

function updateDecoys(s, dt) {
  for (const D of s.decoys) {
    s.who = byId(s, D.pid);
    D.life -= dt; D.flash = Math.max(0, D.flash - dt);
    move(s, D, dt);
    const k = Math.exp(-0.8 * dt); D.vx *= k; D.vz *= k;
    if (!D.pulse || (D.pulseT -= dt) > 0) continue;
    D.pulseT = D.pulse;
    for (const e of live(s)) { const L = dist(e, D); if (L < 2.6 + e.r) applyPayload(s, e, D.sp.payload, { kx: (e.x - D.x) / (L || 1), kz: (e.z - D.z) / (L || 1) }); }
    if (D.heal) for (const p of s.players) if (p.alive && dist(D, p) < 3.4) heal(s, p, D.heal * D.pulse * 2, true);
    ev(s, 'decoyPulse', { id: D.id, x: D.x, z: D.z, r: 2.6, els: D.sp.els, color: D.sp.color, heal: !!D.heal });
  }
  const keep = [];
  for (const D of s.decoys) {
    if (D.life > 0 && D.hp > 0) { keep.push(D); continue; }
    if (D.burst) explode(s, D.x, D.z, D.burst, D.sp.payload, { color: D.sp.color, els: D.sp.els, key: D.sp.key, tier: D.sp.tier, big: true });
    ev(s, 'decoyEnd', { id: D.id, x: D.x, z: D.z, broken: D.hp <= 0, els: D.sp.els, color: D.sp.color });
  }
  s.decoys = keep;
}

// R-052: an instant line that hits everything within its width; a pillar stops it.
function beamOne(s, sp, p, dx, dz) {
  {
    const d = sp.def, half = (d.width ?? 0.6) / 2, ox = p.x + dx * 0.5, oz = p.z + dz * 0.5;
    let len = d.range ?? 10, stop = null;
    const b = ox * dx + oz * dz, c = ox * ox + oz * oz - ARENA_R * ARENA_R;
    len = Math.min(len, -b + Math.sqrt(Math.max(0, b * b - c)));
    for (const o of s.props.pillars) {
      const vx = o.x - ox, vz = o.z - oz, t = vx * dx + vz * dz, perp = Math.abs(vx * dz - vz * dx);
      if (t < 0 || perp >= o.r) continue;
      const hitT = t - Math.sqrt(o.r * o.r - perp * perp);
      if (hitT < len) { len = Math.max(0, hitT); stop = o.id; }
    }
    const along = (o, pad) => {
      const vx = o.x - ox, vz = o.z - oz, t = vx * dx + vz * dz;
      return t > -pad && t < len + pad && Math.abs(vx * dz - vz * dx) < half + pad;
    };
    const hits = [];
    for (const e of live(s)) if (along(e, e.r)) {
      applyPayload(s, e, sp.payload, { kx: dx, kz: dz, block: shieldBlocks(e, p.x, p.z) ? 0.5 : 1 });
      if (d.energyDrain) p.energy = Math.min(p.maxEnergy, p.energy + d.energyDrain);
      hits.push([e.x, e.z]);
    }
    for (const o of envList(s)) if (along(o, o.r)) envHit(s, o, sp.els, false);
    ev(s, 'beam', { pid: p.id, x: ox, z: oz, dx, dz, len, w: half * 2, els: sp.els, color: sp.color, key: sp.key, visual: d.visual, hits, stop, tier: sp.tier, arch: d.arch });
  }
}

function chainWalk(s, sp, cur, jumps, pts, k, hit) {
  while (cur) {
    hit.add(cur.id);
    const [px, pz] = pts[pts.length - 1];
    pts.push([cur.x, cur.z]);
    const L = Math.hypot(cur.x - px, cur.z - pz) || 1;
    applyPayload(s, cur, sp.payload, { scale: k, kx: (cur.x - px) / L, kz: (cur.z - pz) / L });
    envAt(s, cur.x, cur.z, cur.r + 0.2, sp.els, false);
    if (jumps-- <= 0) break;
    k *= 0.85;
    let nx = null, nb = 4.8;
    for (const e of live(s)) if (!hit.has(e.id)) { const dd = dist(e, cur); if (dd < nb) { nb = dd; nx = e; } }
    cur = nx;
  }
}

function scatterPt(a) {
  if (!a.scatter) return [a.x, a.z];
  const ang = rand() * Math.PI * 2, r = Math.sqrt(rand()) * a.scatter;
  return clampIn(a.x + Math.sin(ang) * r, a.z + Math.cos(ang) * r, BOUND - 0.5);
}

// Mines (area + mine): a rune that lies armed until an enemy comes near, then goes off after a short fuse as a normal burst.
function updateMine(s, a, dt) {
  a.life -= dt;
  a.mine.arm -= dt;
  if (a.mine.arm > 0 || a.life <= 0) return;
  if (!live(s).some((e) => Math.hypot(e.x - a.x, e.z - a.z) < a.mine.trig + e.r)) return;
  a.mine.fired = true;
  a.delay = a.delayMax = a.mine.fuse;
  ev(s, 'mineTrip', { id: a.id, x: a.x, z: a.z, r: a.r, key: a.key, els: a.els, color: a.color });
}

// Sprays (cone + channel): the jet follows the caster for a while, hurting what stands in the cone.
function sprayStart(s, sp, p) {
  const d = sp.def, range = d.range ?? 5;
  s.areas.push({ id: s.nid++, x: p.x, z: p.z, r: 0.01, life: d.channel, max: d.channel, tick: d.tick ?? 0.12, tickT: d.tick ?? 0.12,
    delay: 0, delayMax: 0, burst: false, repeat: 1, interval: 0, scatter: 0, n: 0, els: sp.els, color: sp.color, key: sp.key, name: sp.name,
    tier: sp.tier, sp, pid: p.id, spray: { range, cos: Math.cos(((d.arc ?? 50) * Math.PI) / 360) } });
}

function updateSpray(s, a, dt) {
  const p = byId(s, a.pid);
  if (!p || !p.alive) { a.life = 0; return; }
  a.life -= dt;
  a.x = p.x; a.z = p.z;
  a.tickT -= dt;
  if (a.tickT > 0) return;
  a.tickT = a.tick;
  const { range, cos } = a.spray, pl = { ...a.sp.payload, knock: 0 };
  for (const e of live(s)) {
    const vx = e.x - p.x, vz = e.z - p.z, L = Math.hypot(vx, vz);
    if (L > range + e.r || (L > e.r + 0.4 && (vx * p.fx + vz * p.fz) / L < cos)) continue;
    applyPayload(s, e, pl, { area: true });
  }
  envAt(s, p.x + p.fx * range * 0.6, p.z + p.fz * range * 0.6, 1.2, a.els, false);
}

// Arcs (chain + forks): lightning leaves the staff as several bolts, each jumping on from its own first target.
function forkChain(s, sp, p, dx, dz, aimDist) {
  const d = sp.def, range = d.range ?? 8, start = [p.x + dx * 0.5, p.z + dz * 0.5];
  const near = live(s).map((e) => {
    const vx = e.x - p.x, vz = e.z - p.z, L = Math.hypot(vx, vz), dot = (vx * dx + vz * dz) / (L || 1);
    return { e, score: L * (2.2 - dot), ok: L <= range + e.r && dot >= 0.5 };
  }).filter((c) => c.ok).sort((a, b) => a.score - b.score).slice(0, d.forks);
  const hit = new Set(near.map((c) => c.e.id)); // every fork keeps its own first target: no bolt jumps onto another fork's
  if (!near.length) {
    const L = Math.min(range, aimDist), ex = p.x + dx * L, ez = p.z + dz * L;
    envAt(s, ex, ez, 0.9, sp.els, false);
    ev(s, 'chain', { pid: p.id, pts: [start, [ex, ez]], els: sp.els, color: sp.color, key: sp.key, tier: sp.tier });
    return;
  }
  for (const { e } of near) {
    const pts = [start];
    chainWalk(s, sp, e, d.jumps ?? 1, pts, 1, hit);
    ev(s, 'chain', { pid: p.id, pts, els: sp.els, color: sp.color, key: sp.key, tier: sp.tier });
  }
}

function spawnArea(s, sp, x, z) {
  const d = sp.def;
  [x, z] = clampIn(x, z, BOUND - 0.5);
  const a = { id: s.nid++, x, z, r: d.radius ?? 3, life: d.life ?? 3, max: d.life ?? 3, tick: d.tick ?? 0.5, tickT: 0,
    delay: d.delay ?? 0, delayMax: d.delay ?? 0, pull: d.pull ?? 0, burst: !!d.burst, hitsAll: !!d.hitsAll,
    heal: d.heal ?? 0, invuln: !!d.invulnerable, cleanse: !!d.cleanse, swallow: !!d.swallow, field: !!d.deflectField, repel: d.repel ?? 0,
    drainPct: d.drainPct ?? 0, repeat: d.repeat ?? 1, interval: d.interval ?? 0.35, scatter: d.scatter ?? 0, n: 0,
    ...(d.mine ? { mine: { arm: d.arm ?? 0.7, trig: d.trig ?? 1.8, fuse: d.fuse ?? 0.25, fired: false } } : {}),
    els: sp.els, color: sp.color, key: sp.key, name: sp.name, visual: d.visual, tier: sp.tier, sp, pid: s.who?.id };
  [a.bx, a.bz] = scatterPt(a);
  s.areas.push(a);
  ev(s, 'area', { id: a.id, x, z, bx: a.bx, bz: a.bz, r: a.r, life: a.life, delay: a.delay, key: sp.key, els: sp.els, color: sp.color,
    visual: d.visual, name: sp.name, pull: a.pull, tier: sp.tier, heal: a.heal, mine: !!d.mine, storm: !!d.storm, scatter: a.scatter,
    repeat: a.repeat, interval: a.interval, trig: a.mine?.trig });
}

// Tsunami's water pool (R-058) is a real puddle: it soaks, can be charged and frozen, then drains away.
function addPool(s, x, z, pl) {
  [x, z] = clampIn(x, z, BOUND - pl.radius * 0.5);
  const pd = { id: 'pool' + s.nid++, type: 'puddle', x, z, r: pl.radius, state: 'water', t: 0, tickT: 0, temp: pl.life, max: pl.life };
  s.props.puddles.push(pd);
  ev(s, 'pool', { id: pd.id, x, z, r: pd.r, life: pl.life });
}

function addWall(s, x, z, sp, life) {
  if (Math.hypot(x, z) > BOUND - 0.3) return;
  for (const o of s.props.pillars) if (Math.hypot(o.x - x, o.z - z) < o.r + 0.3) return;
  const d = sp.def, hp = (d.hp ?? 100) * sp.power;
  const w = { id: s.nid++, x, z, r: 0.5, hp, maxHp: hp, life: life ?? d.life ?? 9, max: d.life ?? 9, mat: d.mat ?? matFor(sp.els),
    chill: !!d.touchChill, touchT: 0, regen: d.regen ?? 0, reflect: !!d.reflect, touch: d.touch ? sp : null, tT: 0, sp };
  s.walls.push(w);
  for (const e of live(s)) pushOut(e, w);
  for (const q of s.players) if (q.alive) pushOut(q, w);
  return w;
}

function nova(s, sp, p) {
  const d = sp.def;
  const r = d.shape === 'area' ? d.radius ?? 3 : d.shape === 'wall' ? 2.2 : P.novaR;
  ev(s, 'nova', { pid: p.id, x: p.x, z: p.z, r, els: sp.els, color: sp.color, shape: d.shape, key: sp.key, tier: sp.tier });
  if (d.shape === 'wall') {
    for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; addWall(s, p.x + Math.sin(a) * 2.2, p.z + Math.cos(a) * 2.2, sp); }
    return;
  }
  if (d.shape === 'area') { spawnArea(s, sp, p.x, p.z); return; }
  const pl = { ...sp.payload, knock: (sp.payload.knock || 0) + 5 };
  for (const e of live(s)) {
    const L = dist(e, p);
    if (L < P.novaR + e.r) applyPayload(s, e, pl, { scale: 0.85, kx: (e.x - p.x) / (L || 1), kz: (e.z - p.z) / (L || 1), knockMul: 1.4 });
  }
  for (const w of s.walls) if (dist(w, p) < P.novaR + w.r) wallHit(s, w, sp.payload, 0.5);
  envAt(s, p.x, p.z, P.novaR, sp.els, !!d.explode);
  if (d.explode) applyPayload(s, p, sp.payload, { scale: 0.25, reason: 'Point-blank ' + sp.name });
}

function heal(s, p, amt, burst = false) {
  if (!p || !p.alive || amt <= 0) return 0;
  const a = Math.min(amt, p.maxHp - p.hp);
  if (a <= 0) return 0;
  p.hp += a; s.stats.healed += a; p.healAcc += a;
  if (burst || p.healAcc >= 3) { ev(s, 'heal', { pid: p.id, x: p.x, z: p.z, amt: p.healAcc }); p.healAcc = 0; }
  return a;
}

function selfCast(s, sp, p) {
  const st = p.st;
  for (const [el, n] of Object.entries(sp.counts)) {
    const f = ELEMENTS[el].self;
    if (f.thaw) { st.frozen = 0; st.chill = 0; st.wet = 0; }
    if (f.burn) { st.burn = Math.max(st.burn, f.burn); st.burnDps = Math.max(st.burnDps, 5 * n); }
    if (f.cool) { st.burn = 0; st.kindled = false; }
    if (f.chill) { st.chill += f.chill * n; st.chillT = 2.5; if (st.chill >= 3) freeze(p, 1.5); }
    if (f.haste) st.haste = Math.max(st.haste, f.haste * n);
    if (f.zap) hurt(s, p, f.zap * n * (st.wet > 0 ? 3 : 1), 'lightning', { self: true, reason: 'Lightning self-cast' });
    if (f.stoneskin) st.stoneskin = Math.max(st.stoneskin, f.stoneskin * n);
    if (f.ward) { st.ward = f.ward * n; st.wardT = 6; }
    if (f.cleanse) { st.burn = 0; st.kindled = false; st.chill = 0; st.slow = 0; st.frozen = 0; }
    if (f.wet) st.wet = Math.max(st.wet, f.wet);
    if (f.regen) { st.regen = 4; st.regenHp = f.regen * n; }
    if (f.heal) heal(s, p, f.heal * n, true);
    if (f.sacrifice) {
      const c = f.sacrifice * n;
      p.hp -= c; p.hurtT = 0.3; s.stats.taken += c; s.stats.selfDmg += c;
      p.energy = Math.min(p.maxEnergy, p.energy + 50 * n);
      ev(s, 'hurt', { id: p.id, x: p.x, z: p.z, dmg: c, el: 'dark', self: true, reason: 'Dark pact' });
      ev(s, 'tag', { tag: 'pact', x: p.x, z: p.z, id: p.id });
    }
    if (f.gust) {
      const to = [];
      for (const e of live(s)) {
        const L = dist(e, p);
        if (L >= P.shoveR + e.r) continue;
        const k = ((12 * n) / e.mass) * (e.st.root > 0 ? 0.3 : 1);
        e.kvx += ((e.x - p.x) / (L || 1)) * k; e.kvz += ((e.z - p.z) / (L || 1)) * k;
        to.push([e.x, e.z]);
      }
      ev(s, 'tag', { tag: 'gust', x: p.x, z: p.z, id: p.id, to });
    }
  }
  ev(s, 'selfcast', { pid: p.id, els: sp.els, color: sp.color, x: p.x, z: p.z, key: sp.key });
}

function dodge(s, p, inp) {
  if (p.cd.dodge > 0 || p.st.frozen > 0 || p.st.stun > 0) return;
  let dx = inp.move.x, dz = inp.move.z;
  if (!dx && !dz) { dx = p.fx; dz = p.fz; }
  const L = Math.hypot(dx, dz) || 1;
  p.ddx = dx / L; p.ddz = dz / L;
  p.dodge = P.dodgeTime; p.cd.dodge = P.dodgeCd; p.cdMax.dodge = P.dodgeCd;
  if (p.st.burn > 0) p.st.burn = Math.max(0, p.st.burn - 1.2);
  if (p.st.root > 0) { p.st.root = 0; ev(s, 'tag', { tag: 'breakfree', x: p.x, z: p.z, id: p.id }); }
  ev(s, 'dodge', { pid: p.id, x: p.x, z: p.z, dx: p.ddx, dz: p.ddz });
}

// ---------------------------------------------------------------- damage
function freeze(t, dur) {
  const st = t.st;
  st.frozen = Math.max(st.frozen, dur); st.chill = 0; st.wet = 0; st.burn = 0; st.kindled = false;
}

function hurt(s, t, dmg, el, o = {}) {
  if (dmg <= 0 || t.hp <= 0) return 0;
  const isP = !!t.isPlayer, st = t.st;
  if (isP) {
    if (!t.alive) return 0;
    if ((t.dodge > 0 || t.dashT > 0) && !o.dot) { ev(s, 'tag', { tag: 'evade', x: t.x, z: t.z, id: t.id }); return 0; }
    if (st.invuln > 0) { if (!o.dot) ev(s, 'tag', { tag: 'immune', x: t.x, z: t.z, id: t.id }); return 0; }
    if (st.armor > 0) dmg /= 1.75;
    if (st.stoneskin > 0) dmg *= 0.5;
    if (st.ward > 0) {
      const a = Math.min(st.ward, dmg);
      st.ward -= a; dmg -= a;
      if (!o.dot) ev(s, 'ward', { x: t.x, z: t.z, amt: a });
    }
    if (dmg <= 0) return 0;
    s.stats.taken += dmg;
    if (t.stats) t.stats.taken += dmg;
    if (o.self) s.stats.selfDmg += dmg;
    if (!o.dot) t.hurtT = 0.3;
    if (o.src && o.src.hp > 0 && st.reflect > 0) {
      hurt(s, o.src, dmg * 0.5, 'arcane', {});
      ev(s, 'tag', { tag: 'reflect', x: o.src.x, z: o.src.z, id: o.src.id, from: [t.x, t.z] });
    }
  } else {
    if (st.curse > 0) dmg *= 1.25;
    if (!o.dot) t.flash = 0.14;
    if (!t.decoy) {
      s.stats.dealt += dmg;
      const by = s.who?.stats ? s.who : o.dot ? byId(s, t.lastBy) : null; // burns and other ticks count for the last wizard who hit
      if (by) { by.stats.dealt += dmg; t.lastBy = by.id; } // and so does the kill
    }
  }
  t.hp -= dmg;
  let shown = dmg;
  if (o.dot) {
    t.dotAcc = (t.dotAcc || 0) + dmg;
    if (t.dotAcc < 4) return dmg;
    shown = t.dotAcc; t.dotAcc = 0;
  }
  ev(s, isP ? 'hurt' : 'hit', { id: t.id, x: t.x, z: t.z, dmg: shown, el, dot: !!o.dot, self: !!o.self, reason: o.reason, crit: !!o.crit });
  return dmg;
}

// Wind on a burning enemy throws its fire to dry enemies within 2.5 m (FANNED, R-051).
function fan(s, src) {
  const to = [];
  for (const e of live(s)) {
    if (e === src || e.st.burn > 0 || e.st.wet > 0 || e.st.frozen > 0 || dist(e, src) > P.fanR + e.r) continue;
    e.st.burn = Math.max(e.st.burn, 3); e.st.burnDps = Math.max(e.st.burnDps, src.st.burnDps);
    to.push([e.x, e.z]);
  }
  return to;
}

// The one place elements meet bodies (R-038, R-051). Order: water, fire, ice, nature, wind, light, damage, then dark.
function applyPayload(s, t, pl, c = {}) {
  const isP = !!t.isPlayer;
  if (isP && (!t.alive || ((t.dodge > 0 || t.dashT > 0) && !c.area))) return 0;
  if (t.hp <= 0) return 0;
  const st = t.st, k = c.scale ?? 1, tags = [];
  const wasWet = st.wet > 0, wasFrozen = st.frozen > 0, wasCursed = st.curse > 0;
  const tag = (name, via, extra) => tags.push({ tag: name, via, ...extra });
  if (pl.wet) {
    if (st.burn > 0) { st.burn = 0; st.kindled = false; tag('steam', 'douse'); }
    if (st.frozen <= 0) st.wet = Math.max(st.wet, pl.wet);
  }
  let thermal = false;
  if (pl.burn) {
    if (st.wet > 0) { st.wet = 0; tag('steam', 'dry'); }
    else if (st.frozen > 0) { st.frozen = 0; st.chill = 0; thermal = true; tag('thaw', 'thermal'); }
    else {
      const kindle = st.root > 0, dps = pl.burnDps * (pl.burnMult ?? 1) * (kindle ? 1.5 : 1);
      if (kindle && !(st.burn > 0 && st.kindled)) tag('kindle');
      st.burn = Math.max(st.burn, pl.burn); st.burnDps = Math.max(st.burnDps, dps); st.kindled = st.kindled || kindle;
    }
  }
  if (pl.chill) {
    if (st.burn > 0) { st.burn = 0; st.kindled = false; tag('steam', 'quench'); }
    else if (st.wet > 0) { freeze(t, 2.4); tag('freeze', 'wet'); }
    else if (st.frozen <= 0) {
      st.chill += pl.chill; st.chillT = 2.5;
      if (st.chill >= 3) { freeze(t, 1.8); tag('freeze', 'chill'); }
    } else st.frozen = Math.max(st.frozen, 0.6);
  }
  if (pl.root && st.frozen <= 0) {
    const soaked = st.wet > 0;
    if (soaked && st.root < 1.5) tag('entangle');
    else if (!soaked && st.root <= 0 && pl.root >= 1) tag('root');
    st.root = Math.max(st.root, soaked ? Math.max(2, pl.root) : pl.root);
  }
  if (pl.gust) {
    if (st.burn > 0 && !isP) { const to = fan(s, t); if (to.length) tag('fan', null, { to }); }
    else if (st.wet > 0 && st.frozen <= 0) {
      st.chill += 1; st.chillT = 2.5; tag('windchill');
      if (st.chill >= 3) { freeze(t, 1.8); tag('freeze', 'chill'); }
    }
  }
  const purge = !!pl.parts.light && wasCursed;
  if (purge) { st.curse = 0; tag('purge'); }
  let dmg = 0, top = pl.els[0], topV = -1;
  for (const el in pl.parts) {
    let d = pl.parts[el] * k * (pl.trueDamage ? 1 : t.resist?.[el] ?? 1);
    if (el === 'lightning' && wasWet) { d *= 2; tag('conduct'); }
    if (el === 'earth' && wasFrozen) { d *= 2.2; tag('shatter'); }
    if (el === 'fire' && thermal) d *= 1.8;
    if (el === 'light' && purge) d *= 1.5;
    if (d > topV) { topV = d; top = el; }
    dmg += d;
  }
  if (tags.some((g) => g.tag === 'shatter')) { st.frozen = 0; st.chill = 0; stop(s, 0.08); }
  if (pl.freeze) { if (st.frozen <= 0) tag('freeze', 'prison'); freeze(t, pl.freeze); }
  if (pl.shock && st.frozen <= 0) st.shock = Math.max(st.shock, pl.shock * (wasWet ? 2 : 1));
  if (pl.stun && st.frozen <= 0) { if (st.stun <= 0) tag('stun'); st.stun = Math.max(st.stun, pl.stun); }
  if (pl.blind) { if (st.blind <= 0 && pl.blind >= 1) tag('blind'); st.blind = Math.max(st.blind, pl.blind); }
  if (pl.silence) { if (st.silence <= 0) tag('silence'); st.silence = Math.max(st.silence, pl.silence); }
  if (pl.weaken) { if (st.weaken <= 0) tag('weaken'); st.weaken = Math.max(st.weaken, pl.weaken); }
  if (pl.inaccurate) { if (st.inaccurate <= 0) tag('sand'); st.inaccurate = Math.max(st.inaccurate, pl.inaccurate); }
  if (pl.confuse) { if (st.confuse <= 0) tag('confuse'); st.confuse = Math.max(st.confuse, pl.confuse); }
  if (pl.slow) { const pct = pl.slowPct ?? 0.4; st.slowPct = st.slow > 0 ? Math.max(st.slowPct, pct) : pct; st.slow = Math.max(st.slow, pl.slow); }
  if (c.block) dmg *= c.block;
  const kn = (pl.knock || 0) * k * (c.knockMul ?? 1) * (c.block ?? 1) * (st.root > 0 ? 0.3 : 1);
  if (kn > 0 && c.kx !== undefined) { t.kvx += (c.kx * kn) / t.mass; t.kvz += (c.kz * kn) / t.mass; }
  let dealt = 0;
  if (dmg > 0.05) dealt = hurt(s, t, dmg, top, { self: isP, reason: c.reason, dot: !!c.area, crit: thermal, src: c.src });
  if (pl.curse && !purge) { if (st.curse <= 0) tag('curse'); st.curse = Math.max(st.curse, pl.curse); }
  const dr = c.drain ?? pl.drain;
  if (dr && !isP && dealt > 0) heal(s, s.who, dealt * dr);
  if (c.drained) c.drained.v += dealt;
  const seen = new Set();
  for (const g of tags) { if (seen.has(g.tag)) continue; seen.add(g.tag); ev(s, 'tag', { ...g, x: t.x, z: t.z, id: t.id }); }
  return dmg;
}

function explode(s, x, z, R, pl, o = {}) {
  for (const e of live(s)) {
    const L = Math.hypot(e.x - x, e.z - z);
    if (L > R + e.r) continue;
    applyPayload(s, e, pl, { scale: 1 - (0.5 * Math.max(0, L - e.r)) / R, kx: (e.x - x) / (L || 1), kz: (e.z - z) / (L || 1) });
  }
  if (o.selfMul) for (const p of s.players) {
    if (!p.alive) continue;
    const L = Math.hypot(p.x - x, p.z - z);
    const mul = o.selfMul * (o.pid === undefined || o.pid === p.id ? 1 : s.friendly); // allies take half of a friend's blast
    if (L < R + p.r && mul > 0) applyPayload(s, p, pl, { scale: (1 - (0.5 * Math.max(0, L - p.r)) / R) * mul,
      kx: (p.x - x) / (L || 1), kz: (p.z - z) / (L || 1), reason: o.reason ?? 'Caught in your own blast' });
  }
  for (const w of s.walls) if (Math.hypot(w.x - x, w.z - z) < R + w.r) wallHit(s, w, pl, 0.8);
  envAt(s, x, z, R, pl.els, true);
  ev(s, 'explode', { x, z, r: R, els: o.els ?? pl.els, color: o.color ?? 0xffa040, big: !!o.big, key: o.key, tier: o.tier ?? 1, visual: o.visual });
  if (o.big) stop(s, 0.05);
}

function shieldBlocks(e, sx, sz) {
  if (!e.T.shield || e.st.frozen > 0 || e.st.shock > 0 || e.st.stun > 0 || e.state === 'windup') return false;
  const vx = sx - e.x, vz = sz - e.z, L = Math.hypot(vx, vz) || 1;
  return (vx * Math.sin(e.face) + vz * Math.cos(e.face)) / L > Math.cos((e.T.shield * Math.PI) / 180);
}

function wallHit(s, w, pl, k) {
  let d = 0;
  for (const el in pl.parts) d += pl.parts[el] * k;
  if (w.mat === 'ice' && pl.burn) d *= 3;
  if (w.mat === 'wood' && pl.burn) d *= 1.5;
  w.hp -= d;
}

// ---------------------------------------------------------------- environment
const envList = (s) => [...s.props.puddles, ...s.props.brush, ...s.props.barrels.filter((b) => b.alive)];

function envAt(s, x, z, R, els, blast) {
  for (const o of envList(s)) if (Math.hypot(o.x - x, o.z - z) < R + o.r * 0.9) envHit(s, o, els, blast);
}

function ignite(s, br) {
  if (br.state !== 'dry') return;
  br.state = 'burning'; br.t = 5; br.tickT = 0; br.spreadT = 1.2;
  ev(s, 'ignite', { x: br.x, z: br.z, r: br.r, id: br.id });
}

function spreadBrush(s, br, reach, wind) {
  for (const o of s.props.brush) {
    if (o === br || o.state !== 'dry' || Math.hypot(o.x - br.x, o.z - br.z) >= o.r + br.r + reach) continue;
    ignite(s, o);
    ev(s, 'spread', { x: br.x, z: br.z, tx: o.x, tz: o.z, wind });
  }
}

function envHit(s, o, els, blast) {
  const has = (e) => els.includes(e);
  if (o.type === 'barrel') {
    if (o.alive && !o.fuse && (blast || has('fire') || has('lightning') || has('arcane'))) o.fuse = blast ? 0.15 : 0.05;
    return;
  }
  if (o.type === 'brush') {
    if (has('nature') && o.state === 'ash') { o.state = 'dry'; o.t = 0; ev(s, 'regrow', { x: o.x, z: o.z, r: o.r, kind: 'brush', id: o.id }); }
    if ((has('water') || has('ice')) && o.state === 'burning') { o.state = 'dry'; o.t = 0; ev(s, 'steam', { x: o.x, z: o.z, r: o.r }); return; }
    if (has('fire') || (has('lightning') && blast)) ignite(s, o);
    if (has('wind') && o.state === 'burning') spreadBrush(s, o, P.fanR + 4, true);
    return;
  }
  if (has('ice')) {
    if (o.state !== 'frozen') ev(s, 'tag', { tag: 'freeze', via: 'puddle', x: o.x, z: o.z, r: o.r, id: o.id });
    o.state = 'frozen'; o.t = 10; o.tickT = 1.2;
    return;
  }
  if (has('lightning') && o.state !== 'frozen') {
    if (o.state !== 'charged') ev(s, 'charge', { x: o.x, z: o.z, r: o.r, id: o.id });
    o.state = 'charged'; o.t = 2.6; o.tickT = Math.min(o.tickT, 0.1);
    return;
  }
  if (has('fire')) {
    if (o.state === 'frozen') { o.state = 'water'; ev(s, 'tag', { tag: 'thaw', via: 'puddle', x: o.x, z: o.z, r: o.r, id: o.id }); }
    ev(s, 'steam', { x: o.x, z: o.z, r: o.r * 0.8 });
  }
}

function updateProps(s, dt) {
  const ents = live(s);
  for (const q of s.players) if (q.alive) ents.push(q);
  const inside = (o, e) => Math.hypot(e.x - o.x, e.z - o.z) < o.r * 0.92;
  let drained = false;
  for (const pd of s.props.puddles) {
    if (pd.temp !== undefined && (pd.temp -= dt) <= 0) { drained = true; continue; }
    if (pd.state === 'water') {
      for (const e of ents) if (inside(pd, e) && e.st.frozen <= 0) {
        if (e.st.burn > 0) { e.st.burn = 0; e.st.kindled = false; ev(s, 'tag', { tag: 'steam', via: 'douse', x: e.x, z: e.z, id: e.id }); }
        e.st.wet = Math.max(e.st.wet, 1.2);
      }
      continue;
    }
    pd.t -= dt; pd.tickT -= dt;
    if (pd.state === 'charged' && pd.tickT <= 0) {
      pd.tickT = 0.45;
      for (const e of ents) if (inside(pd, e)) { e.st.wet = Math.max(e.st.wet, 1.2); applyPayload(s, e, ENV.charged, { area: true, reason: 'Standing in charged water' }); }
      ev(s, 'zap', { x: pd.x, z: pd.z, r: pd.r, id: pd.id });
    }
    if (pd.state === 'frozen' && pd.tickT <= 0) {
      pd.tickT = 1.2;
      for (const e of ents) if (inside(pd, e)) applyPayload(s, e, ENV.frost, { area: true });
    }
    if (pd.t <= 0) pd.state = 'water';
  }
  if (drained) s.props.puddles = s.props.puddles.filter((pd) => pd.temp === undefined || pd.temp > 0);
  for (const br of s.props.brush) {
    if (br.state === 'dry') {
      for (const e of ents) if (inside(br, e) && e.st.burn > 0) { ignite(s, br); break; }
    } else if (br.state === 'burning') {
      br.t -= dt; br.tickT -= dt; br.spreadT -= dt;
      if (br.tickT <= 0) {
        br.tickT = 0.5;
        for (const e of ents) if (inside(br, e)) applyPayload(s, e, ENV.brush, { area: true, reason: 'Walked through burning brush' });
      }
      if (br.spreadT <= 0) { br.spreadT = 99; spreadBrush(s, br, P.fanR, false); }
      if (br.t <= 0) { br.state = 'ash'; br.t = 25; }
    } else { br.t -= dt; if (br.t <= 0) br.state = 'dry'; }
  }
  for (const b of s.props.barrels) if (b.alive && b.fuse > 0) {
    b.fuse -= dt;
    if (b.fuse <= 0) {
      b.alive = false; b.fuse = 0;
      explode(s, b.x, b.z, 2.8, ENV.barrel, { selfMul: 0.7, big: true, color: 0xff7a2f, els: ['fire', 'earth'], reason: 'Too close to a rune barrel' });
    }
  }
}

// ---------------------------------------------------------------- player
function slowMul(st) { return Math.max(0.35, 1 - st.chill * 0.16) * (st.slow > 0 ? 1 - st.slowPct : 1); }

function tickStatus(s, t, dt) {
  const st = t.st;
  if (st.burn > 0) {
    st.burn -= dt;
    hurt(s, t, st.burnDps * dt, 'fire', { dot: true, self: !!t.isPlayer, reason: 'Burning' });
    if (st.burn <= 0) { st.burnDps = 0; st.kindled = false; }
  }
  if (st.wet > 0) st.wet -= dt;
  if (st.chill > 0) { st.chillT -= dt; if (st.chillT <= 0) { st.chill = Math.max(0, st.chill - 1); st.chillT = 1.2; } }
  for (const k of DECAY) if (st[k] > 0) st[k] = Math.max(0, st[k] - dt);
  if (st.ward > 0) { st.wardT -= dt; if (st.wardT <= 0) st.ward = 0; }
}

function updatePlayer(s, p, inp, dt) {
  const st = p.st;
  tickStatus(s, p, dt);
  if (st.regen > 0) heal(s, p, st.regenHp * dt);
  for (const k in p.cd) p.cd[k] = Math.max(0, p.cd[k] - dt);
  for (const bag of [p.shapeCd, p.spellCd]) for (const k in bag) bag[k] = Math.max(0, bag[k] - dt);
  p.energy = Math.min(p.maxEnergy, p.energy + P.regen * dt);
  p.castT = Math.max(0, p.castT - dt);
  p.hurtT = Math.max(0, p.hurtT - dt);
  if (p.wind) {
    if (st.frozen > 0 || st.stun > 0) { p.wind = null; ev(s, 'tag', { tag: 'interrupt', x: p.x, z: p.z, id: p.id }); }
    else if ((p.wind.t -= dt) <= 0) release(s, p, inp);
  }
  const stunned = st.frozen > 0 || st.shock > 0 || st.stun > 0;
  if (p.dashT > 0) {
    p.dashT -= dt;
    p.vx = p.dashVx; p.vz = p.dashVz;
    const sp = p.dashSp, Lv = Math.hypot(p.dashVx, p.dashVz) || 1, sx = -p.dashVz / Lv, sz = p.dashVx / Lv;
    for (const e of live(s)) if (!p.dashHit.includes(e.id) && dist(e, p) < e.r + p.r + p.dashW * 0.5) {
      p.dashHit.push(e.id);
      const side = (e.x - p.x) * sx + (e.z - p.z) * sz >= 0 ? 1 : -1;
      applyPayload(s, e, sp.payload, { kx: sx * side, kz: sz * side });
    }
    if (p.dashT <= 0) { p.vx *= 0.25; p.vz *= 0.25; ev(s, 'dashEnd', { pid: p.id, x: p.x, z: p.z, dx: p.dashVx / Lv, dz: p.dashVz / Lv, els: sp.els, color: sp.color, key: sp.key, arch: sp.def.arch }); }
  } else if (p.dodge > 0) {
    p.dodge -= dt;
    p.vx = p.ddx * P.dodgeSpeed; p.vz = p.ddz * P.dodgeSpeed;
  } else if (!stunned && st.root <= 0) walk(p, inp.move, dt);
  else { p.vx *= 0.8; p.vz *= 0.8; }
  move(s, p, dt);
  p.speed = Math.hypot(p.vx, p.vz);
  if (!stunned && !(p.dashT > 0)) {
    const ax = inp.aim.x - p.x, az = inp.aim.z - p.z, L = Math.hypot(ax, az);
    if (L > 0.3) { p.fx = ax / L; p.fz = az / L; }
  }
}

// Steers a wizard's velocity toward where the stick points (slowed while casting, chilled or slowed).
function walk(p, mv, dt) {
  const st = p.st;
  const planted = p.wind ? (p.wind.style === 'flick' ? 0.75 : 0.3) : p.castT > p.castMax * 0.55 && p.castStyle !== 'flick' ? 0.55 : 1;
  const spd = P.speed * slowMul(st) * (st.haste > 0 ? 1.4 : 1) * planted;
  const L = Math.hypot(mv.x, mv.z);
  const tvx = L ? (mv.x / L) * spd : 0, tvz = L ? (mv.z / L) * spd : 0;
  const a = Math.min(1, dt * 14);
  p.vx += (tvx - p.vx) * a; p.vz += (tvz - p.vz) * a;
}

// The client's prediction of its own wizard (R-084): one step of walking with the same rules and collisions as
// updatePlayer. False (and nothing moved) while the wizard is not walking: dodging, dashing, stunned, rooted or down.
export function predictWalk(s, p, mv, dt) {
  const st = p.st;
  if (!p.alive || p.dodge > 0 || p.dashT > 0 || st.frozen > 0 || st.shock > 0 || st.stun > 0 || st.root > 0) return false;
  walk(p, mv, dt);
  move(s, p, dt);
  return true;
}

function move(s, e, dt) {
  e.x += (e.vx + e.kvx) * dt; e.z += (e.vz + e.kvz) * dt;
  const kd = Math.exp(-6 * dt);
  e.kvx *= kd; e.kvz *= kd;
  collide(s, e);
}

function collide(s, e) {
  for (const o of s.props.pillars) pushOut(e, o);
  for (const w of s.walls) pushOut(e, w);
  for (const b of s.props.barrels) if (b.alive) pushOut(e, b);
  const d = Math.hypot(e.x, e.z), max = BOUND - e.r;
  if (d > max) { e.x *= max / d; e.z *= max / d; }
}

function pushOut(e, o) {
  const dx = e.x - o.x, dz = e.z - o.z, d = Math.hypot(dx, dz), m = e.r + o.r;
  if (d >= m) return;
  if (d < 1e-4) { e.x += m; return; }
  e.x = o.x + (dx / d) * m; e.z = o.z + (dz / d) * m;
}

// ---------------------------------------------------------------- waves
function updateWaves(s, dt) {
  if (s.spawnQ.length) {
    s.spawnT -= dt;
    if (s.spawnT <= 0) { spawnEnemy(s, s.spawnQ.shift()); s.spawnT = s.waveInfo.interval; }
    return;
  }
  if (s.enemies.length) return;
  if (s.waveT > 0) { s.waveT -= dt; if (s.waveT <= 0) startWave(s); return; }
  if (s.wave > 0) {
    let amt = 0;
    for (const p of s.players) {
      if (p.down) { raise(s, p, 0.5); p.energy = p.maxEnergy; continue; } // a cleared wave raises the downed
      amt = Math.round(p.maxHp * 0.35);
      p.hp = Math.min(p.maxHp, p.hp + amt); p.energy = p.maxEnergy;
    }
    ev(s, 'waveClear', { n: s.wave, heal: amt });
  }
  for (const b of s.props.barrels) { b.alive = true; b.fuse = 0; }
  s.waveT = 3.5;
}

function startWave(s) {
  s.wave++;
  s.waveInfo = waveRoster(s.wave, s.players.length || 1, rand);
  s.spawnQ = [...s.waveInfo.list];
  s.spawnT = 0.3;
  ev(s, 'wave', { n: s.wave, count: s.spawnQ.length });
}

function spawnEnemy(s, kind) {
  const T = ENEMY_TYPES[kind], w = s.waveInfo;
  // the three gates farthest from the party (the middle of the living wizards)
  const crew = s.players.filter((q) => q.alive).length ? s.players.filter((q) => q.alive) : s.players;
  const p = { x: crew.reduce((a, q) => a + q.x, 0) / crew.length, z: crew.reduce((a, q) => a + q.z, 0) / crew.length };
  const gates = [...GATES].sort((a, b) => Math.hypot(b.x - p.x, b.z - p.z) - Math.hypot(a.x - p.x, a.z - p.z)).slice(0, 3);
  const g = gates[(rand() * gates.length) | 0];
  const x = g.x + (rand() - 0.5) * 2.4, z = g.z + (rand() - 0.5) * 2.4;
  const e = { id: s.nid++, kind, T, x, z, vx: 0, vz: 0, kvx: 0, kvz: 0, r: T.r, mass: T.mass,
    hp: T.hp * w.hpScale, maxHp: T.hp * w.hpScale, speed: T.speed * w.speedScale, resist: T.resist,
    face: Math.atan2(-x, -z), st: status(), state: 'spawn', stateT: 0.9, atkCd: 0.6 + rand(),
    flash: 0, dotAcc: 0, strafe: rand() < 0.5 ? 1 : -1, aimX: 0, aimZ: 1, slamX: 0, slamZ: 0, hitDone: false };
  collide(s, e);
  s.enemies.push(e);
  ev(s, 'spawn', { id: e.id, x: e.x, z: e.z, kind });
}

function kill(s, e) {
  s.kills++;
  const by = byId(s, e.lastBy);
  if (by) by.stats.kills++;
  s.score += Math.round(e.T.score * (1 + 0.25 * (s.wave - 1)));
  ev(s, 'death', { id: e.id, x: e.x, z: e.z, kind: e.kind, frozen: e.st.frozen > 0, burning: e.st.burn > 0, cursed: e.st.curse > 0 });
}

// ---------------------------------------------------------------- enemies
function turnTo(e, ang, maxStep) {
  const d = Math.atan2(Math.sin(ang - e.face), Math.cos(ang - e.face));
  e.face += Math.max(-maxStep, Math.min(maxStep, d));
}

function wallAhead(s, e, ux, uz) {
  for (const w of s.walls) {
    const vx = w.x - e.x, vz = w.z - e.z, L = Math.hypot(vx, vz);
    if (L < e.r + w.r + 0.45 && (vx * ux + vz * uz) / (L || 1) > 0.3) return w;
  }
  return null;
}

function steer(s, e, ux, uz, spd, dt) {
  let ax = ux, az = uz;
  const obs = [...s.props.pillars, ...s.walls, ...s.props.barrels.filter((b) => b.alive)];
  for (const o of obs) {
    const ox = o.x - e.x, oz = o.z - e.z, d = Math.hypot(ox, oz), reach = e.r + o.r + 1.2;
    if (d > reach || d < 1e-3) continue;
    if ((ox * ux + oz * uz) / d < 0.3) continue;
    const side = ox * -uz + oz * ux > 0 ? -1 : 1, w = (1 - d / reach) * 1.6;
    ax += -uz * side * w; az += ux * side * w;
  }
  const L = Math.hypot(ax, az) || 1, k = Math.min(1, dt * 8);
  e.vx += ((ax / L) * spd - e.vx) * k; e.vz += ((az / L) * spd - e.vz) * k;
}

// Confused enemies (R-056) go for the nearest other enemy instead of you.
function targetOf(s, e) {
  if (e.st.confuse <= 0 && s.decoys.length) { // doubles draw the eye
    let best = null, bd = 11;
    for (const D of s.decoys) { const L = dist(D, e); if (L < bd) { bd = L; best = D; } }
    if (best) return best;
  }
  if (e.st.confuse > 0) {
    let best = null, bd = Infinity;
    for (const o of s.enemies) {
      if (o === e || o.hp <= 0 || o.state === 'spawn') continue;
      const d = dist(o, e);
      if (d < bd) { bd = d; best = o; }
    }
    if (best) return best;
  }
  let best = null, bd = Infinity; // the nearest living wizard
  for (const q of s.players) { if (!q.alive) continue; const d = dist(q, e); if (d < bd) { bd = d; best = q; } }
  return best ?? s.players[0];
}

// An enemy attack landing on its target: sand makes it miss 60% (R-056), weaken cuts it by 40%.
function strike(s, e, tg, dmg, kx, kz, knock) {
  if (e.st.inaccurate > 0 && rand() < 0.6) { ev(s, 'tag', { tag: 'miss', x: tg.x, z: tg.z, id: tg.id }); return false; }
  if (e.st.weaken > 0) dmg *= 0.6;
  const d = hurt(s, tg, dmg, 'phys', { src: e });
  if (d > 0 && knock) { const m = tg.isPlayer ? 1 : tg.mass; tg.kvx += (kx * knock) / m; tg.kvz += (kz * knock) / m; }
  return d > 0;
}

const AI = {
  thrall(s, e, dt, c) {
    const A = e.T.atk, tg = c.t;
    if (e.state === 'chase') {
      if (!c.alive) { e.vx *= 0.9; e.vz *= 0.9; return; }
      steer(s, e, c.ux, c.uz, c.spd, dt);
      turnTo(e, Math.atan2(c.ux, c.uz), e.T.turn * dt);
      e.atkCd -= dt;
      if (c.can && e.atkCd <= 0 && (c.dist < A.range + tg.r || wallAhead(s, e, c.ux, c.uz))) {
        e.state = 'windup'; e.stateT = A.windup; e.aimX = c.ux; e.aimZ = c.uz;
      }
    } else if (e.state === 'windup') {
      e.vx *= 0.82; e.vz *= 0.82;
      if (e.stateT > 0.12) { e.aimX = c.ux; e.aimZ = c.uz; turnTo(e, Math.atan2(c.ux, c.uz), 8 * dt); }
      if (e.stateT <= 0) { e.state = 'strike'; e.stateT = A.dur; e.hitDone = false; }
    } else if (e.state === 'strike') {
      e.vx = e.aimX * A.lunge; e.vz = e.aimZ * A.lunge;
      if (!e.hitDone) {
        if (c.alive && c.dist < e.r + tg.r + 0.5) {
          e.hitDone = true;
          if (strike(s, e, tg, A.dmg, e.aimX, e.aimZ, 5)) ev(s, 'claw', { x: tg.x, z: tg.z });
        }
        const w = wallAhead(s, e, e.aimX, e.aimZ);
        if (w) { e.hitDone = true; w.hp -= 18; ev(s, 'claw', { x: w.x, z: w.z }); }
      }
      if (e.stateT <= 0) { e.state = 'recover'; e.stateT = A.recover; }
    } else if (e.state === 'recover') {
      e.vx *= 0.85; e.vz *= 0.85;
      if (e.stateT <= 0) { e.state = 'chase'; e.atkCd = 0.3 + rand() * 0.5; }
    }
  },
  bulwark(s, e, dt, c) {
    const A = e.T.atk, tg = c.t, fx = Math.sin(e.face), fz = Math.cos(e.face);
    if (e.state === 'chase') {
      if (!c.alive) { e.vx *= 0.9; e.vz *= 0.9; return; }
      turnTo(e, Math.atan2(c.ux, c.uz), e.T.turn * dt);
      const facing = fx * c.ux + fz * c.uz;
      steer(s, e, fx, fz, c.spd * Math.max(0.2, facing), dt);
      e.atkCd -= dt;
      if (c.can && e.atkCd <= 0 && ((c.dist < A.range + tg.r && facing > 0.6) || wallAhead(s, e, fx, fz))) {
        e.state = 'windup'; e.stateT = A.windup; e.slamX = e.x + fx * A.reach; e.slamZ = e.z + fz * A.reach;
      }
    } else if (e.state === 'windup') {
      e.vx *= 0.8; e.vz *= 0.8;
      if (e.stateT <= 0) {
        for (const p of s.players) {
          const L = Math.hypot(p.x - e.slamX, p.z - e.slamZ);
          if (p.alive && L < A.radius + p.r) strike(s, e, p, A.dmg, (p.x - e.slamX) / (L || 1), (p.z - e.slamZ) / (L || 1), A.knock);
        }
        for (const D of s.decoys) { const Ld = Math.hypot(D.x - e.slamX, D.z - e.slamZ); if (Ld < A.radius + D.r) strike(s, e, D, A.dmg, (D.x - e.slamX) / (Ld || 1), (D.z - e.slamZ) / (Ld || 1), A.knock); }
        if (e.st.confuse > 0) for (const o of live(s)) {
          const Lo = Math.hypot(o.x - e.slamX, o.z - e.slamZ);
          if (o !== e && Lo < A.radius + o.r) strike(s, e, o, A.dmg, (o.x - e.slamX) / (Lo || 1), (o.z - e.slamZ) / (Lo || 1), A.knock);
        }
        for (const w of s.walls) if (Math.hypot(w.x - e.slamX, w.z - e.slamZ) < A.radius + w.r) w.hp -= 70;
        ev(s, 'slam', { x: e.slamX, z: e.slamZ, r: A.radius });
        e.state = 'recover'; e.stateT = A.recover;
      }
    } else if (e.state === 'recover') {
      e.vx *= 0.85; e.vz *= 0.85;
      if (e.stateT <= 0) { e.state = 'chase'; e.atkCd = 0.6 + rand() * 0.6; }
    }
  },
  hexcaller(s, e, dt, c) {
    const T = e.T, A = T.atk;
    turnTo(e, Math.atan2(c.ux, c.uz), T.turn * dt);
    if (e.state === 'chase') {
      if (!c.alive) { e.vx *= 0.9; e.vz *= 0.9; return; }
      let mx = 0, mz = 0;
      if (c.dist > T.keep[1]) { mx = c.ux; mz = c.uz; } else if (c.dist < T.keep[0]) { mx = -c.ux; mz = -c.uz; }
      mx += -c.uz * e.strafe * 0.8; mz += c.ux * e.strafe * 0.8;
      if (rand() < dt * 0.4) e.strafe *= -1;
      const L = Math.hypot(mx, mz) || 1;
      steer(s, e, mx / L, mz / L, c.spd, dt);
      e.atkCd -= dt;
      if (c.can && e.atkCd <= 0 && c.dist < A.range) { e.state = 'charge'; e.stateT = A.windup; }
    } else if (e.state === 'charge') {
      e.vx *= 0.9; e.vz *= 0.9;
      e.aimX = c.ux; e.aimZ = c.uz;
      if (e.stateT <= 0) {
        let ux = c.ux, uz = c.uz;
        if (e.st.inaccurate > 0 && rand() < 0.6) {
          const a = (rand() < 0.5 ? -1 : 1) * (0.35 + rand() * 0.4), ca = Math.cos(a), sa = Math.sin(a);
          [ux, uz] = [ux * ca + uz * sa, -ux * sa + uz * ca];
        }
        s.shots.push({ id: s.nid++, kind: 'orb', owner: 'enemy', x: e.x + ux * 0.6, z: e.z + uz * 0.6, vx: ux * A.speed, vz: uz * A.speed,
          r: 0.3, life: 3, dmg: A.dmg * (e.st.weaken > 0 ? 0.6 : 1), hits: [], src: e, foe: !c.t.isPlayer && !c.t.decoy });
        e.state = 'recover'; e.stateT = A.recover;
        e.atkCd = A.cd[0] + rand() * (A.cd[1] - A.cd[0]);
      }
    } else if (e.state === 'recover') {
      e.vx *= 0.9; e.vz *= 0.9;
      if (e.stateT <= 0) e.state = 'chase';
    }
  }
};

function updateEnemy(s, e, dt) {
  e.flash = Math.max(0, e.flash - dt);
  if (e.state === 'spawn') { e.stateT -= dt; if (e.stateT <= 0) e.state = 'chase'; return; }
  tickStatus(s, e, dt);
  if (e.hp <= 0) return;
  const st = e.st, tg = targetOf(s, e);
  if (!tg) { e.vx *= 0.9; e.vz *= 0.9; move(s, e, dt); return; } // an empty court (everyone left): nobody to chase
  const dx = tg.x - e.x, dz = tg.z - e.z, L = Math.hypot(dx, dz) || 1;
  const c = { t: tg, alive: tg.isPlayer ? tg.alive : tg.hp > 0, ux: dx / L, uz: dz / L, dist: L,
    spd: e.speed * slowMul(st), can: st.blind <= 0 && st.silence <= 0 };
  const held = st.frozen > 0 || st.shock > 0 || st.stun > 0;
  if ((held || st.silence > 0) && (e.state === 'windup' || e.state === 'charge')) {
    e.state = 'recover'; e.stateT = 0.35; ev(s, 'tag', { tag: 'interrupt', x: e.x, z: e.z, id: e.id });
  }
  if (held) { e.vx *= 0.8; e.vz *= 0.8; } else { e.stateT -= dt; AI[e.kind](s, e, dt, c); }
  if (st.root > 0) { e.vx = 0; e.vz = 0; }
  move(s, e, dt);
}

function separate(s) {
  const L = s.enemies.filter((e) => e.state !== 'spawn' && e.hp > 0);
  for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
    const a = L[i], b = L[j], dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), m = a.r + b.r;
    if (d >= m || d < 1e-4) continue;
    const push = m - d, nx = dx / d, nz = dz / d, wa = b.mass / (a.mass + b.mass);
    a.x -= nx * push * wa; a.z -= nz * push * wa;
    b.x += nx * push * (1 - wa); b.z += nz * push * (1 - wa);
  }
  for (const p of s.players) {
    if (!p.alive || p.dashT > 0) continue;
    for (const e of L) {
      const dx = p.x - e.x, dz = p.z - e.z, d = Math.hypot(dx, dz), m = p.r + e.r;
      if (d >= m || d < 1e-4) continue;
      const push = m - d, wp = e.mass / (e.mass + p.mass);
      p.x += (dx / d) * push * wp; p.z += (dz / d) * push * wp;
      e.x -= (dx / d) * push * (1 - wp); e.z -= (dz / d) * push * (1 - wp);
    }
    collide(s, p);
  }
  // wizards lean on each other a little, so a party never stacks on one spot
  for (let i = 0; i < s.players.length; i++) for (let j = i + 1; j < s.players.length; j++) {
    const a = s.players[i], b = s.players[j];
    if (!a.alive || !b.alive || a.dashT > 0 || b.dashT > 0) continue;
    const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), m = a.r + b.r;
    if (d >= m || d < 1e-4) continue;
    const push = (m - d) / 2;
    a.x -= (dx / d) * push; a.z -= (dz / d) * push; b.x += (dx / d) * push; b.z += (dz / d) * push;
    collide(s, a); collide(s, b);
  }
}

// ---------------------------------------------------------------- projectiles
// Heavy shots fly a ballistic arc: they bounce (losing speed) and either roll on or burst on the last landing.
function arcStep(s, b, h) {
  b.vy -= 13 * h; b.y += b.vy * h;
  if (b.y > b.r) return true;
  b.y = b.r;
  if (b.bounces > 0) {
    b.bounces--; b.vy = Math.abs(b.vy) * 0.42 + 1.2; b.vx *= 0.8; b.vz *= 0.8;
    ev(s, 'bounce', { x: b.x, z: b.z, kind: b.kind, els: b.els, color: b.color, id: b.id });
    return true;
  }
  if (b.kind !== 'boulder') { impact(s, b, null); return false; }
  b.vy = 0; b.vx *= 0.97; b.vz *= 0.97;
  return true;
}

function updateShots(s, dt) {
  const keep = [];
  for (const b of s.shots) {
    if (b.dead) continue;
    s.who = byId(s, b.pid);
    b.life -= dt;
    let ok = true;
    for (let i = 0; i < 3 && ok; i++) {
      b.x += (b.vx * dt) / 3; b.z += (b.vz * dt) / 3;
      if (b.arc) ok = arcStep(s, b, dt / 3);
      if (ok) ok = shotStep(s, b);
    }
    if (ok && b.life <= 0) { if (b.owner === 'player' && (b.kind === 'boulder' || b.kind === 'spear')) impact(s, b, null); ok = false; }
    if (ok && !b.dead) keep.push(b);
  }
  s.shots = keep;
}

// Crystal walls throw hexcaller orbs back as your own shot (R-052).
function reflectShot(s, b, w) {
  let tx = -b.vx, tz = -b.vz, best = 14;
  for (const e of live(s)) { const d = Math.hypot(e.x - b.x, e.z - b.z); if (d < best) { best = d; tx = e.x - b.x; tz = e.z - b.z; } }
  const L = Math.hypot(tx, tz) || 1, sp = Math.hypot(b.vx, b.vz) * 1.4;
  Object.assign(b, { owner: 'player', kind: 'bolt', sp: REFLECTED, els: REFLECTED.els, color: 0x5cffb0, hits: [], pierce: 0, life: 2, reflected: true,
    vx: (tx / L) * sp, vz: (tz / L) * sp, x: w.x + (tx / L) * (w.r + b.r + 0.05), z: w.z + (tz / L) * (w.r + b.r + 0.05) });
  ev(s, 'reflectShot', { x: b.x, z: b.z, id: b.id });
}

function shotStep(s, b) {
  if (Math.hypot(b.x, b.z) > BOUND + 0.4) { impact(s, b, null); return false; }
  for (const o of s.props.pillars) if (Math.hypot(b.x - o.x, b.z - o.z) < b.r + o.r) { impact(s, b, null); return false; }
  for (const o of s.props.barrels) if (o.alive && Math.hypot(b.x - o.x, b.z - o.z) < b.r + o.r) {
    if (b.owner === 'player') o.fuse = o.fuse || 0.05;
    impact(s, b, null); return false;
  }
  if (b.owner === 'enemy') {
    for (const w of s.walls) if (Math.hypot(b.x - w.x, b.z - w.z) < b.r + w.r) {
      if (w.reflect) { reflectShot(s, b, w); return true; }
      w.hp -= b.dmg * 1.5; impact(s, b, null); return false;
    }
    if (b.foe) for (const e of s.enemies) {
      if (e === b.src || e.state === 'spawn' || e.hp <= 0 || Math.hypot(b.x - e.x, b.z - e.z) >= b.r + e.r) continue;
      hurt(s, e, b.dmg, 'hex', {});
      e.kvx += (b.vx * 0.3) / e.mass; e.kvz += (b.vz * 0.3) / e.mass;
      impact(s, b, null); return false;
    }
    for (const D of s.decoys) if (Math.hypot(b.x - D.x, b.z - D.z) < b.r + D.r) { hurt(s, D, b.dmg, 'hex', {}); impact(s, b, null); return false; }
    for (const p of s.players) {
      if (!p.alive || Math.hypot(b.x - p.x, b.z - p.z) >= b.r + p.r) continue;
      if (p.dodge > 0 || p.dashT > 0) { if (!b.evaded) { b.evaded = true; ev(s, 'tag', { tag: 'evade', x: p.x, z: p.z, id: p.id }); } return true; }
      hurt(s, p, b.dmg, 'hex', { src: b.src });
      p.kvx += b.vx * 0.3; p.kvz += b.vz * 0.3;
      impact(s, b, null); return false;
    }
    return true;
  }
  for (const e of s.enemies) {
    if (e.state === 'spawn' || e.hp <= 0 || b.hits.includes(e.id)) continue;
    if (Math.hypot(b.x - e.x, b.z - e.z) >= b.r + e.r) continue;
    b.hits.push(e.id);
    const sp = b.sp, d = sp.def, L = Math.hypot(b.vx, b.vz) || 1, kx = b.vx / L, kz = b.vz / L;
    const shielded = shieldBlocks(e, b.x - kx, b.z - kz);
    if (shielded && b.kind === 'bolt') {
      ev(s, 'tag', { tag: 'blocked', x: e.x, z: e.z, id: e.id });
      ev(s, 'block', { x: b.x, z: b.z, color: sp.color });
      if (d.explode) impact(s, b, null); else applyPayload(s, e, sp.payload, { scale: 0.15, kx, kz, knockMul: 0.2 });
      return false;
    }
    if (!d.explode && !d.splash) {
      applyPayload(s, e, sp.payload, { kx, kz, scale: shielded ? 0.6 : 1 });
      if (b.kind === 'spear') ev(s, 'impale', { x: e.x, z: e.z, dx: kx, dz: kz, id: e.id, key: sp.key });
    }
    if (b.pierce > 0 && !d.explode && !d.splash) { b.pierce--; continue; }
    impact(s, b, e);
    return false;
  }
  return true;
}

function impact(s, b, target) {
  if (b.owner === 'enemy') { ev(s, 'impact', { x: b.x, z: b.z, color: 0x5cffb0, els: [], enemy: true }); return; }
  const sp = b.sp, d = sp.def, R = d.explode || d.splash || 0;
  if (R) explode(s, b.x, b.z, R, sp.payload, { pid: b.pid, selfMul: d.explode ? 0.45 : 0.3, big: !!d.explode, color: sp.color, els: sp.els, key: sp.key, tier: sp.tier });
  else envAt(s, b.x, b.z, 0.5, sp.els, b.kind === 'boulder');
  if (d.chainOnImpact) {
    const hit = new Set(target ? [target.id] : []);
    let nx = null, nb = 5;
    for (const e of live(s)) if (!hit.has(e.id)) { const dd = Math.hypot(e.x - b.x, e.z - b.z); if (dd < nb) { nb = dd; nx = e; } }
    if (nx) { const pts = [[b.x, b.z]]; chainWalk(s, ZAP, nx, d.chainOnImpact - 1, pts, 0.9, hit); ev(s, 'chain', { pts, els: ['lightning'], color: 0xf4e15c }); }
  }
  if (d.leaves) spawnArea(s, LEAVES(d.leaves, d.burnMult), b.x, b.z);
  ev(s, 'impact', { x: b.x, z: b.z, els: sp.els, color: sp.color, kind: b.kind, r: R, key: sp.key, tier: sp.tier, dx: b.vx, dz: b.vz });
}

// ---------------------------------------------------------------- areas & walls
function updateAreas(s, dt) {
  for (const a of s.areas) {
    s.who = byId(s, a.pid);
    if (a.spray) { updateSpray(s, a, dt); continue; }
    if (a.mine && !a.mine.fired) { updateMine(s, a, dt); continue; }
    if (a.swallow || a.field) for (const b of s.shots) {
      if (b.owner !== 'enemy' || b.dead || Math.hypot(b.x - a.x, b.z - a.z) >= a.r) continue;
      b.dead = true;
      ev(s, a.swallow ? 'swallow' : 'deflect', { x: b.x, z: b.z, ax: a.x, az: a.z });
    }
    if (a.delay > 0) {
      if (a.pull) tug(s, a, dt); // implosions drag in before they burst
      a.delay -= dt;
      if (a.delay <= 0 && a.burst) {
        explode(s, a.bx, a.bz, a.r, a.sp.payload, { selfMul: a.hitsAll ? 0.6 : 0, big: true, color: a.color, els: a.els, key: a.key,
          tier: a.tier, visual: a.visual, reason: 'Stood under your own ' + a.name });
        a.n++;
        if (a.n < a.repeat) {
          a.delay = a.delayMax = a.interval;
          [a.bx, a.bz] = scatterPt(a);
          ev(s, 'mark', { id: a.id, x: a.bx, z: a.bz, r: a.r, delay: a.interval, key: a.key, color: a.color, els: a.els });
        } else {
          if (a.sp.def.leaves) spawnArea(s, LEAVES(a.sp.def.leaves, a.sp.def.burnMult), a.x, a.z);
          a.life = 0;
        }
      }
      continue;
    }
    a.life -= dt;
    tug(s, a, dt);
    const inside = s.players.filter((q) => q.alive && Math.hypot(q.x - a.x, q.z - a.z) < a.r); // wizards standing in it
    if (a.invuln) for (const q of inside) q.st.invuln = Math.max(q.st.invuln, 0.25);
    a.tickT -= dt;
    if (a.tickT <= 0) {
      a.tickT = a.tick;
      const pl = { ...a.sp.payload, knock: 0 }, acc = { v: 0 };
      for (const e of live(s)) if (Math.hypot(e.x - a.x, e.z - a.z) < a.r + e.r * 0.5) applyPayload(s, e, pl, { area: true, drain: a.drainPct || undefined, drained: acc });
      for (const p of inside) {
        if (a.hitsAll) applyPayload(s, p, pl, { area: true, reason: 'Standing in your own ' + a.name });
        if (a.heal) heal(s, p, a.heal * a.tick);
        if (a.cleanse) {
          const st = p.st;
          if (st.burn > 0 || st.chill > 0 || st.slow > 0 || st.stun > 0 || st.shock > 0) ev(s, 'tag', { tag: 'cleanse', x: p.x, z: p.z, id: p.id });
          st.burn = 0; st.kindled = false; st.chill = 0; st.slow = 0; st.stun = 0; st.shock = 0;
        }
      }
      envAt(s, a.x, a.z, a.r * 0.8, a.els, false);
    }
  }
  s.who = null;
  s.areas = s.areas.filter((a) => a.life > 0);
}

function tug(s, a, dt) {
  for (const e of live(s)) {
    const vx = a.x - e.x, vz = a.z - e.z, L = Math.hypot(vx, vz);
    if (L >= a.r + e.r) continue;
    const anchor = e.st.root > 0 ? 0.3 : 1;
    if (a.pull && L > 0.3) { e.kvx += ((vx / L) * a.pull * dt * 6 * anchor) / e.mass; e.kvz += ((vz / L) * a.pull * dt * 6 * anchor) / e.mass; }
    if (a.repel) { e.kvx -= ((vx / (L || 1)) * a.repel * dt * 6 * anchor) / e.mass; e.kvz -= ((vz / (L || 1)) * a.repel * dt * 6 * anchor) / e.mass; }
  }
}

function updateWalls(s, dt) {
  for (const w of s.walls) {
    w.life -= dt;
    if (w.touch && (w.tT -= dt) <= 0) {
      w.tT = 0.6;
      for (const e of live(s)) { const L = dist(e, w); if (L < e.r + w.r + 0.25) applyPayload(s, e, w.touch.payload, { scale: 0.35, kx: (e.x - w.x) / (L || 1), kz: (e.z - w.z) / (L || 1) }); }
    }
    if (w.regen && w.hp > 0) w.hp = Math.min(w.maxHp, w.hp + w.regen * dt);
    if (w.chill) {
      w.touchT -= dt;
      if (w.touchT <= 0) { w.touchT = 0.8; for (const e of live(s)) if (dist(e, w) < e.r + w.r + 0.2) applyPayload(s, e, ENV.rime, {}); }
    }
  }
  const out = [];
  for (const w of s.walls) {
    if (w.life > 0 && w.hp > 0) { out.push(w); continue; }
    ev(s, 'wallBreak', { id: w.id, x: w.x, z: w.z, mat: w.mat, broken: w.hp <= 0 });
    if (w.mat === 'wood' && w.hp <= 0 && w.life > 2.5) s.regrow.push({ x: w.x, z: w.z, sp: w.sp, t: 2.5, life: w.life - 2.5 });
  }
  s.walls = out;
  // Wooden walls grow back (R-052) once nothing stands where they were.
  for (const g of s.regrow) {
    g.t -= dt;
    if (g.t > 0) continue;
    const blocked = [...live(s), ...s.players].some((e) => Math.hypot(e.x - g.x, e.z - g.z) < e.r + 0.55);
    if (blocked) { g.t = 0.3; g.life -= 0.3; continue; }
    g.done = true;
    if (g.life > 0.5 && addWall(s, g.x, g.z, g.sp, g.life)) ev(s, 'regrow', { x: g.x, z: g.z, kind: 'wood' });
  }
  s.regrow = s.regrow.filter((g) => !g.done && g.life > 0.5);
}
