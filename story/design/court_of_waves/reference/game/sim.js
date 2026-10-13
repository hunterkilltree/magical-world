// Gameplay simulation. Pure logic — no three.js, no DOM.
// step(state, input, dt) advances the world and returns events for the renderer/HUD.
import { ELEMENTS, MAX_QUEUE, CANCELS, resolveSpell, makeSpell } from './spells.js';
import { ENEMY_TYPES, waveRoster } from './enemies.js';

export const ARENA_R = 15;
export const BOUND = ARENA_R - 0.9;
export const GATES = [0, 0.5, 1, 1.5].map((k) => ({ a: k * Math.PI, x: Math.sin(k * Math.PI) * 13.2, z: -Math.cos(k * Math.PI) * 13.2 }));
export const TUNING = { r: 0.42, speed: 5.4, hp: 100, energy: 100, regen: 18, dodgeSpeed: 13.5, dodgeTime: 0.26,
  dodgeCd: 1.0, novaCd: 3, selfCd: 1.4, novaR: 3.4, aimRange: 10, wallDist: 2.4 };
const P = TUNING;

const ENV = {
  charged: { parts: { lightning: 5 }, shock: 0.2, els: ['lightning'], knock: 0 },
  frost:   { parts: {}, chill: 1, els: ['ice'], knock: 0 },
  brush:   { parts: { fire: 3 }, burn: 2.5, burnDps: 5, els: ['fire'], knock: 0 },
  barrel:  { parts: { fire: 22, earth: 14 }, burn: 3, burnDps: 6, knock: 11, els: ['fire', 'earth'] },
  rime:    { parts: { ice: 3 }, chill: 1, els: ['ice'], knock: 0 }
};
const ZAP = makeSpell(['lightning'], { name: 'Discharge', shape: 'chain', mult: 0.9 });
const LEAVES = (l) => makeSpell(['fire'], { name: 'burning ground', shape: 'area', radius: l.radius, life: l.life, tick: l.tick, mult: l.mult, hitsAll: true }, 1, 'burning');

const status = () => ({ burn: 0, burnDps: 0, wet: 0, chill: 0, chillT: 0, frozen: 0, shock: 0, slow: 0, stoneskin: 0, ward: 0, wardT: 0, haste: 0 });
const ev = (s, type, o) => s.events.push({ type, ...o });
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const live = (s) => s.enemies.filter((e) => e.state !== 'spawn' && e.hp > 0);

function makeProps() {
  return {
    pillars: [[-6.2, -5.4, 0.75], [6.4, -5.0, 0.75], [-6.6, 5.2, 0.75], [6.0, 5.8, 0.75], [0, -7, 0.6]]
      .map(([x, z, r], i) => ({ id: 'pil' + i, x, z, r })),
    puddles: [[-4.2, 1.6, 1.9], [4.4, -1.8, 2.0], [1.0, 8.4, 1.6], [-1.5, -10.2, 1.7]]
      .map(([x, z, r], i) => ({ id: 'pud' + i, type: 'puddle', x, z, r, state: 'water', t: 0, tickT: 0 })),
    brush: [[4.8, 3.2, 1.6], [-5.0, -2.2, 1.5], [-9.4, 2.2, 1.6], [9.6, -1.4, 1.5], [2.4, -9.6, 1.4]]
      .map(([x, z, r], i) => ({ id: 'bru' + i, type: 'brush', x, z, r, state: 'dry', t: 0, tickT: 0, spreadT: 0 })),
    barrels: [[2.6, -3.6], [-3.2, -6.8], [-9.0, -6.0], [9.4, 6.0], [-2.2, 10.6]]
      .map(([x, z], i) => ({ id: 'bar' + i, type: 'barrel', x, z, r: 0.42, alive: true, fuse: 0 }))
  };
}

export function createGame(wizard) {
  return {
    mode: 'menu', t: 0, wave: 0, kills: 0, score: 0, waveT: 2.2, spawnQ: [], spawnT: 0, waveInfo: null,
    hitstop: 0, nid: 1, remaining: 0,
    player: {
      id: 'player', wizard, x: 0, z: 3.5, vx: 0, vz: 0, kvx: 0, kvz: 0, r: P.r, mass: 1.2,
      hp: P.hp, maxHp: P.hp, energy: P.energy, maxEnergy: P.energy, fx: 0, fz: -1,
      queue: [], last: null, cd: { cast: 0, nova: 0, self: 0, dodge: 0 }, shapeCd: {}, shapeMax: {},
      cdMax: { cast: 0.3, nova: P.novaCd, self: P.selfCd, dodge: P.dodgeCd },
      dodge: 0, ddx: 0, ddz: 0, st: status(), alive: true, castT: 0, hurtT: 0, speed: 0, deadT: 0, dotAcc: 0
    },
    enemies: [], shots: [], areas: [], walls: [], props: makeProps(), events: [],
    stats: { casts: 0, dealt: 0, taken: 0, selfDmg: 0, found: new Set() }
  };
}

export function step(s, inp, dt) {
  s.events = [];
  for (const a of inp.actions) act(s, a, inp);
  if (s.mode !== 'play' && s.mode !== 'dead') return s.events;
  if (s.hitstop > 0) { s.hitstop -= dt; dt *= 0.2; }
  s.t += dt;
  const p = s.player;
  if (p.alive) updatePlayer(s, inp, dt); else p.deadT += dt;
  if (s.mode === 'play') updateWaves(s, dt);
  for (const e of s.enemies) updateEnemy(s, e, dt);
  separate(s);
  updateShots(s, dt);
  updateAreas(s, dt);
  updateWalls(s, dt);
  updateProps(s, dt);
  s.enemies = s.enemies.filter((e) => (e.hp > 0 ? true : (kill(s, e), false)));
  if (p.alive && p.hp <= 0) { p.alive = false; p.hp = 0; s.mode = 'dead'; ev(s, 'playerDeath', { x: p.x, z: p.z }); }
  s.remaining = s.spawnQ.length + s.enemies.length;
  return s.events;
}

// ---------------------------------------------------------------- actions
function act(s, a, inp) {
  if (a === 'pause') { if (s.mode === 'play') s.mode = 'paused'; else if (s.mode === 'paused') s.mode = 'play'; return; }
  if (s.mode !== 'play' || !s.player.alive) return;
  if (a.startsWith('el:')) return queueEl(s, a.slice(3));
  if (a === 'clear') { if (s.player.queue.length) { s.player.queue = []; ev(s, 'clear', {}); } return; }
  if (a === 'cast') return cast(s, inp, 'aim', false);
  if (a === 'recast') return cast(s, inp, 'aim', true);
  if (a === 'nova') return cast(s, inp, 'nova', false);
  if (a === 'self') return cast(s, inp, 'self', false);
  if (a === 'dodge') return dodge(s, inp);
}

function queueEl(s, el) {
  const p = s.player;
  if (!ELEMENTS[el]) return;
  const opp = CANCELS[el];
  const i = opp ? p.queue.lastIndexOf(opp) : -1;
  if (i >= 0) { p.queue.splice(i, 1); ev(s, 'cancel', { a: el, b: opp, x: p.x, z: p.z }); return; }
  if (p.queue.length >= MAX_QUEUE) { ev(s, 'queueFull', {}); return; }
  p.queue.push(el);
  ev(s, 'queue', { el });
}

function cast(s, inp, mode, held) {
  const p = s.player;
  if (p.st.frozen > 0) return;
  let q = p.queue;
  if (held && q.length) return;
  if (!q.length) {
    if (mode === 'aim' && p.last) q = p.last;
    else { if (!held) ev(s, 'fizzle', { x: p.x, z: p.z }); return; }
  }
  const slot = mode === 'aim' ? 'cast' : mode;
  if (p.cd[slot] > 0) return;
  const sp = resolveSpell(q);
  if (!sp) { p.queue = []; ev(s, 'fizzle', { x: p.x, z: p.z }); return; }
  const shape = sp.def.shape;
  if (mode === 'aim' && (p.shapeCd[shape] || 0) > 0) { if (!held) ev(s, 'cooldown', { shape, t: p.shapeCd[shape] }); return; }
  const cost = Math.round(sp.cost * (mode === 'nova' ? 1.3 : mode === 'self' ? 0.5 : 1));
  if (p.energy < cost) { if (!held) ev(s, 'noEnergy', { cost }); return; }
  p.energy -= cost;
  // Fast shapes share a short global cooldown; slow shapes (areas, walls) recharge on their own timer.
  const cd = mode === 'aim' ? Math.min(sp.cd, 0.45) : mode === 'nova' ? P.novaCd : P.selfCd;
  p.cd[slot] = cd; p.cdMax[slot] = cd;
  if (mode === 'aim' && sp.cd > 0.45) { p.shapeCd[shape] = sp.cd; p.shapeMax[shape] = sp.cd; }
  if (p.queue.length) p.last = [...p.queue];
  p.queue = [];
  p.castT = 0.3;
  s.stats.casts++; s.stats.found.add(sp.key);
  const ax = inp.aim.x - p.x, az = inp.aim.z - p.z, aimDist = Math.hypot(ax, az);
  if (aimDist > 0.05) { p.fx = ax / aimDist; p.fz = az / aimDist; }
  const dx = p.fx, dz = p.fz;
  ev(s, 'cast', { mode, shape: sp.def.shape, name: sp.name, key: sp.key, els: sp.els, color: sp.color, x: p.x, z: p.z, dx, dz });
  if (sp.counts.lightning && p.st.wet > 0 && mode !== 'self') {
    hurt(s, p, 7 * sp.counts.lightning, 'lightning', { self: true, reason: 'Cast lightning while wet' });
    p.st.shock = Math.max(p.st.shock, 0.35);
  }
  if (mode === 'self') return selfCast(s, sp);
  if (mode === 'nova') return nova(s, sp);
  CAST[sp.def.shape](s, sp, p, dx, dz, Math.max(1.2, aimDist));
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
    ev(s, 'cone', { x: p.x, z: p.z, dx, dz, range, arc: d.arc ?? 50, els: sp.els, color: sp.color, key: sp.key });
  },
  bolt(s, sp, p, dx, dz) {
    const d = sp.def, n = d.count ?? 1, spread = ((d.spread ?? 0) * Math.PI) / 180, speed = d.speed ?? 20;
    for (let i = 0; i < n; i++) {
      const a = n > 1 ? (i - (n - 1) / 2) * spread : 0, c = Math.cos(a), sn = Math.sin(a);
      const vx = dx * c + dz * sn, vz = -dx * sn + dz * c;
      s.shots.push({ id: s.nid++, kind: 'bolt', owner: 'player', x: p.x + vx * 0.6, z: p.z + vz * 0.6, vx: vx * speed, vz: vz * speed,
        r: d.radius ?? 0.24, life: d.life ?? 1.2, pierce: d.pierce ?? 0, hits: [], sp, color: sp.color, els: sp.els });
    }
  },
  boulder(s, sp, p, dx, dz) {
    const speed = sp.def.speed ?? 11;
    s.shots.push({ id: s.nid++, kind: 'boulder', owner: 'player', x: p.x + dx * 0.7, z: p.z + dz * 0.7, vx: dx * speed, vz: dz * speed,
      r: 0.4, life: 1.5, pierce: 0, hits: [], sp, color: sp.color, els: sp.els });
  },
  chain(s, sp, p, dx, dz, aimDist) {
    const d = sp.def, range = d.range ?? 7.5;
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
    ev(s, 'chain', { pts, els: sp.els, color: sp.color });
  },
  area(s, sp, p, dx, dz, aimDist) {
    const L = Math.min(aimDist, sp.def.range ?? P.aimRange);
    spawnArea(s, sp, p.x + dx * L, p.z + dz * L);
  },
  wall(s, sp, p, dx, dz) {
    const n = sp.def.segments ?? 5, cx = p.x + dx * P.wallDist, cz = p.z + dz * P.wallDist;
    for (let i = 0; i < n; i++) { const o = (i - (n - 1) / 2) * 0.95; addWall(s, cx - dz * o, cz + dx * o, sp); }
    ev(s, 'wall', { x: cx, z: cz, mat: sp.def.mat });
  }
};

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

function spawnArea(s, sp, x, z) {
  const d = sp.def, L = Math.hypot(x, z);
  if (L > BOUND - 0.5) { x *= (BOUND - 0.5) / L; z *= (BOUND - 0.5) / L; }
  s.areas.push({ id: s.nid++, x, z, r: d.radius ?? 3, life: d.life ?? 3, max: d.life ?? 3, tick: d.tick ?? 0.5, tickT: 0,
    delay: d.delay ?? 0, delayMax: d.delay ?? 0, pull: d.pull ?? 0, burst: !!d.burst, hitsAll: !!d.hitsAll,
    els: sp.els, color: sp.color, key: sp.key, name: sp.name, sp });
}

function addWall(s, x, z, sp) {
  if (Math.hypot(x, z) > BOUND - 0.3) return;
  for (const o of s.props.pillars) if (Math.hypot(o.x - x, o.z - z) < o.r + 0.3) return;
  const d = sp.def, hp = (d.hp ?? 100) * sp.power;
  const w = { id: s.nid++, x, z, r: 0.5, hp, maxHp: hp, life: d.life ?? 9, max: d.life ?? 9, mat: d.mat ?? 'stone', chill: !!d.touchChill, touchT: 0 };
  s.walls.push(w);
  for (const e of live(s)) pushOut(e, w);
  if (s.player.alive) pushOut(s.player, w);
}

function nova(s, sp) {
  const p = s.player, d = sp.def;
  const r = d.shape === 'area' ? d.radius ?? 3 : d.shape === 'wall' ? 2.2 : P.novaR;
  ev(s, 'nova', { x: p.x, z: p.z, r, els: sp.els, color: sp.color, shape: d.shape });
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

function selfCast(s, sp) {
  const p = s.player, st = p.st;
  for (const [el, n] of Object.entries(sp.counts)) {
    const f = ELEMENTS[el].self;
    if (f.thaw) { st.frozen = 0; st.chill = 0; st.wet = 0; }
    if (f.burn) { st.burn = Math.max(st.burn, f.burn); st.burnDps = Math.max(st.burnDps, 5 * n); }
    if (f.cool) st.burn = 0;
    if (f.chill) { st.chill += f.chill * n; st.chillT = 2.5; if (st.chill >= 3) freeze(p, 1.5); }
    if (f.haste) st.haste = f.haste * n;
    if (f.zap) hurt(s, p, f.zap * n * (st.wet > 0 ? 3 : 1), 'lightning', { self: true, reason: 'Lightning self-cast' });
    if (f.stoneskin) st.stoneskin = f.stoneskin * n;
    if (f.ward) { st.ward = f.ward * n; st.wardT = 6; }
    if (f.cleanse) { st.burn = 0; st.chill = 0; st.slow = 0; st.frozen = 0; }
    if (f.wet) st.wet = Math.max(st.wet, f.wet);
  }
  ev(s, 'selfcast', { els: sp.els, color: sp.color, x: p.x, z: p.z });
}

function dodge(s, inp) {
  const p = s.player;
  if (p.cd.dodge > 0 || p.st.frozen > 0) return;
  let dx = inp.move.x, dz = inp.move.z;
  if (!dx && !dz) { dx = p.fx; dz = p.fz; }
  const L = Math.hypot(dx, dz) || 1;
  p.ddx = dx / L; p.ddz = dz / L;
  p.dodge = P.dodgeTime; p.cd.dodge = P.dodgeCd; p.cdMax.dodge = P.dodgeCd;
  if (p.st.burn > 0) p.st.burn = Math.max(0, p.st.burn - 1.2);
  ev(s, 'dodge', { x: p.x, z: p.z, dx: p.ddx, dz: p.ddz });
}

// ---------------------------------------------------------------- damage
function freeze(t, dur) {
  const st = t.st;
  st.frozen = Math.max(st.frozen, dur); st.chill = 0; st.wet = 0; st.burn = 0;
}

function hurt(s, t, dmg, el, o = {}) {
  if (dmg <= 0 || t.hp <= 0) return 0;
  const isP = t === s.player;
  if (isP) {
    if (!t.alive) return 0;
    if (t.dodge > 0 && !o.dot) { ev(s, 'tag', { tag: 'evade', x: t.x, z: t.z }); return 0; }
    if (t.st.stoneskin > 0) dmg *= 0.5;
    if (t.st.ward > 0) {
      const a = Math.min(t.st.ward, dmg);
      t.st.ward -= a; dmg -= a;
      if (!o.dot) ev(s, 'ward', { x: t.x, z: t.z, amt: a });
    }
    if (dmg <= 0) return 0;
    s.stats.taken += dmg;
    if (o.self) s.stats.selfDmg += dmg;
    if (!o.dot) t.hurtT = 0.3;
  } else {
    if (!o.dot) t.flash = 0.14;
    s.stats.dealt += dmg;
  }
  t.hp -= dmg;
  let shown = dmg;
  if (o.dot) {
    t.dotAcc = (t.dotAcc || 0) + dmg;
    if (t.dotAcc < 4) return dmg;
    shown = t.dotAcc; t.dotAcc = 0;
  }
  ev(s, isP ? 'hurt' : 'hit', { id: t.id, x: t.x, z: t.z, dmg: shown, el, dot: !!o.dot, self: !!o.self, reason: o.reason });
  return dmg;
}

// The one place elements meet bodies. Order matters: water, fire, ice, then damage.
function applyPayload(s, t, pl, c = {}) {
  const isP = t === s.player;
  if (isP && (!t.alive || (t.dodge > 0 && !c.area))) return 0;
  if (t.hp <= 0) return 0;
  const st = t.st, k = c.scale ?? 1, tags = [];
  const wasWet = st.wet > 0, wasFrozen = st.frozen > 0;
  if (pl.wet) {
    if (st.burn > 0) { st.burn = 0; tags.push('steam'); }
    if (!wasFrozen) st.wet = Math.max(st.wet, pl.wet);
  }
  if (pl.burn) {
    if (st.wet > 0) { st.wet = 0; tags.push('steam'); }
    else if (st.frozen > 0) { st.frozen = 0; st.chill = 0; tags.push('thaw'); }
    else { st.burn = Math.max(st.burn, pl.burn); st.burnDps = Math.max(st.burnDps, pl.burnDps); }
  }
  if (pl.chill) {
    if (st.burn > 0) { st.burn = 0; tags.push('steam'); }
    else if (st.wet > 0) { freeze(t, 2.4); tags.push('freeze'); }
    else if (st.frozen <= 0) {
      st.chill += pl.chill; st.chillT = 2.5;
      if (st.chill >= 3) { freeze(t, 1.8); tags.push('freeze'); }
    } else st.frozen = Math.max(st.frozen, 0.6);
  }
  let dmg = 0, top = pl.els[0], topV = -1;
  for (const el in pl.parts) {
    let d = pl.parts[el] * k * (t.resist?.[el] ?? 1);
    if (el === 'lightning' && wasWet) { d *= 2; tags.push('conduct'); }
    if (el === 'earth' && wasFrozen) { d *= 2.2; tags.push('shatter'); }
    if (d > topV) { topV = d; top = el; }
    dmg += d;
  }
  if (tags.includes('shatter')) { st.frozen = 0; st.chill = 0; }
  if (pl.shock && st.frozen <= 0) st.shock = Math.max(st.shock, pl.shock * (wasWet ? 2 : 1));
  if (pl.slow) st.slow = Math.max(st.slow, pl.slow);
  if (c.block) dmg *= c.block;
  const kn = (pl.knock || 0) * k * (c.knockMul ?? 1) * (c.block ?? 1);
  if (kn > 0 && c.kx !== undefined) { t.kvx += (c.kx * kn) / t.mass; t.kvz += (c.kz * kn) / t.mass; }
  if (dmg > 0.05) hurt(s, t, dmg, top, { self: isP, reason: c.reason, dot: !!c.area });
  for (const tag of new Set(tags)) ev(s, 'tag', { tag, x: t.x, z: t.z, id: t.id });
  return dmg;
}

function explode(s, x, z, R, pl, o = {}) {
  for (const e of live(s)) {
    const L = Math.hypot(e.x - x, e.z - z);
    if (L > R + e.r) continue;
    applyPayload(s, e, pl, { scale: 1 - (0.5 * Math.max(0, L - e.r)) / R, kx: (e.x - x) / (L || 1), kz: (e.z - z) / (L || 1) });
  }
  const p = s.player;
  if (o.selfMul && p.alive) {
    const L = Math.hypot(p.x - x, p.z - z);
    if (L < R + p.r) applyPayload(s, p, pl, { scale: (1 - (0.5 * Math.max(0, L - p.r)) / R) * o.selfMul,
      kx: (p.x - x) / (L || 1), kz: (p.z - z) / (L || 1), reason: o.reason ?? 'Caught in your own blast' });
  }
  for (const w of s.walls) if (Math.hypot(w.x - x, w.z - z) < R + w.r) wallHit(s, w, pl, 0.8);
  envAt(s, x, z, R, pl.els, true);
  ev(s, 'explode', { x, z, r: R, els: o.els ?? pl.els, color: o.color ?? 0xffa040, big: !!o.big });
  if (o.big) s.hitstop = Math.max(s.hitstop, 0.05);
}

function shieldBlocks(e, sx, sz) {
  if (!e.T.shield || e.st.frozen > 0 || e.st.shock > 0 || e.state === 'windup') return false;
  const vx = sx - e.x, vz = sz - e.z, L = Math.hypot(vx, vz) || 1;
  return (vx * Math.sin(e.face) + vz * Math.cos(e.face)) / L > Math.cos((e.T.shield * Math.PI) / 180);
}

function wallHit(s, w, pl, k) {
  let d = 0;
  for (const el in pl.parts) d += pl.parts[el] * k;
  if (w.mat === 'ice' && pl.burn) d *= 3;
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
  ev(s, 'ignite', { x: br.x, z: br.z, r: br.r });
}

function envHit(s, o, els, blast) {
  const has = (e) => els.includes(e);
  if (o.type === 'barrel') {
    if (o.alive && !o.fuse && (blast || has('fire') || has('lightning') || has('arcane'))) o.fuse = blast ? 0.15 : 0.05;
    return;
  }
  if (o.type === 'brush') {
    if ((has('water') || has('ice')) && o.state === 'burning') { o.state = 'dry'; o.t = 0; ev(s, 'steam', { x: o.x, z: o.z, r: o.r }); }
    else if (has('fire') || (has('lightning') && blast)) ignite(s, o);
    return;
  }
  if (has('ice')) {
    if (o.state !== 'frozen') ev(s, 'tag', { tag: 'freeze', x: o.x, z: o.z });
    o.state = 'frozen'; o.t = 10; o.tickT = 1.2;
    return;
  }
  if (has('lightning') && o.state !== 'frozen') {
    if (o.state !== 'charged') ev(s, 'charge', { x: o.x, z: o.z, r: o.r });
    o.state = 'charged'; o.t = 2.6; o.tickT = Math.min(o.tickT, 0.1);
    return;
  }
  if (has('fire')) {
    if (o.state === 'frozen') o.state = 'water';
    ev(s, 'steam', { x: o.x, z: o.z, r: o.r * 0.8 });
  }
}

function updateProps(s, dt) {
  const ents = live(s);
  if (s.player.alive) ents.push(s.player);
  const inside = (o, e) => Math.hypot(e.x - o.x, e.z - o.z) < o.r * 0.92;
  for (const pd of s.props.puddles) {
    if (pd.state === 'water') {
      for (const e of ents) if (inside(pd, e) && e.st.frozen <= 0) {
        if (e.st.burn > 0) { e.st.burn = 0; ev(s, 'tag', { tag: 'steam', x: e.x, z: e.z }); }
        e.st.wet = Math.max(e.st.wet, 1.2);
      }
      continue;
    }
    pd.t -= dt; pd.tickT -= dt;
    if (pd.state === 'charged' && pd.tickT <= 0) {
      pd.tickT = 0.45;
      for (const e of ents) if (inside(pd, e)) { e.st.wet = Math.max(e.st.wet, 1.2); applyPayload(s, e, ENV.charged, { area: true, reason: 'Standing in charged water' }); }
    }
    if (pd.state === 'frozen' && pd.tickT <= 0) {
      pd.tickT = 1.2;
      for (const e of ents) if (inside(pd, e)) applyPayload(s, e, ENV.frost, { area: true });
    }
    if (pd.t <= 0) pd.state = 'water';
  }
  for (const br of s.props.brush) {
    if (br.state === 'dry') {
      for (const e of ents) if (inside(br, e) && e.st.burn > 0) { ignite(s, br); break; }
    } else if (br.state === 'burning') {
      br.t -= dt; br.tickT -= dt; br.spreadT -= dt;
      if (br.tickT <= 0) {
        br.tickT = 0.5;
        for (const e of ents) if (inside(br, e)) applyPayload(s, e, ENV.brush, { area: true, reason: 'Walked through burning brush' });
      }
      if (br.spreadT <= 0) {
        br.spreadT = 99;
        for (const o of s.props.brush) if (o.state === 'dry' && Math.hypot(o.x - br.x, o.z - br.z) < o.r + br.r + 2.5) ignite(s, o);
      }
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
function slowMul(st) { return Math.max(0.35, 1 - st.chill * 0.16) * (st.slow > 0 ? 0.6 : 1); }

function tickStatus(s, t, dt) {
  const st = t.st;
  if (st.burn > 0) { st.burn -= dt; hurt(s, t, st.burnDps * dt, 'fire', { dot: true, self: t === s.player, reason: 'Burning' }); if (st.burn <= 0) st.burnDps = 0; }
  if (st.wet > 0) st.wet -= dt;
  if (st.chill > 0) { st.chillT -= dt; if (st.chillT <= 0) { st.chill = Math.max(0, st.chill - 1); st.chillT = 1.2; } }
  for (const k of ['frozen', 'shock', 'slow', 'stoneskin', 'haste']) if (st[k] > 0) st[k] = Math.max(0, st[k] - dt);
  if (st.ward > 0) { st.wardT -= dt; if (st.wardT <= 0) st.ward = 0; }
}

function updatePlayer(s, inp, dt) {
  const p = s.player, st = p.st;
  tickStatus(s, p, dt);
  for (const k in p.cd) p.cd[k] = Math.max(0, p.cd[k] - dt);
  for (const k in p.shapeCd) p.shapeCd[k] = Math.max(0, p.shapeCd[k] - dt);
  p.energy = Math.min(p.maxEnergy, p.energy + P.regen * dt);
  p.castT = Math.max(0, p.castT - dt);
  p.hurtT = Math.max(0, p.hurtT - dt);
  const stunned = st.frozen > 0 || st.shock > 0;
  if (p.dodge > 0) {
    p.dodge -= dt;
    p.vx = p.ddx * P.dodgeSpeed; p.vz = p.ddz * P.dodgeSpeed;
  } else if (!stunned) {
    const spd = P.speed * slowMul(st) * (st.haste > 0 ? 1.4 : 1);
    const L = Math.hypot(inp.move.x, inp.move.z);
    const tvx = L ? (inp.move.x / L) * spd : 0, tvz = L ? (inp.move.z / L) * spd : 0;
    const a = Math.min(1, dt * 14);
    p.vx += (tvx - p.vx) * a; p.vz += (tvz - p.vz) * a;
  } else { p.vx *= 0.8; p.vz *= 0.8; }
  move(s, p, dt);
  p.speed = Math.hypot(p.vx, p.vz);
  if (!stunned) {
    const ax = inp.aim.x - p.x, az = inp.aim.z - p.z, L = Math.hypot(ax, az);
    if (L > 0.3) { p.fx = ax / L; p.fz = az / L; }
  }
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
    const p = s.player, heal = Math.round(p.maxHp * 0.35);
    p.hp = Math.min(p.maxHp, p.hp + heal); p.energy = p.maxEnergy;
    ev(s, 'waveClear', { n: s.wave, heal });
  }
  for (const b of s.props.barrels) { b.alive = true; b.fuse = 0; }
  s.waveT = 3.5;
}

function startWave(s) {
  s.wave++;
  s.waveInfo = waveRoster(s.wave);
  s.spawnQ = [...s.waveInfo.list];
  s.spawnT = 0.3;
  ev(s, 'wave', { n: s.wave, count: s.spawnQ.length });
}

function spawnEnemy(s, kind) {
  const T = ENEMY_TYPES[kind], w = s.waveInfo, p = s.player;
  const gates = [...GATES].sort((a, b) => Math.hypot(b.x - p.x, b.z - p.z) - Math.hypot(a.x - p.x, a.z - p.z)).slice(0, 3);
  const g = gates[(Math.random() * gates.length) | 0];
  const x = g.x + (Math.random() - 0.5) * 2.4, z = g.z + (Math.random() - 0.5) * 2.4;
  const e = { id: s.nid++, kind, T, x, z, vx: 0, vz: 0, kvx: 0, kvz: 0, r: T.r, mass: T.mass,
    hp: T.hp * w.hpScale, maxHp: T.hp * w.hpScale, speed: T.speed * w.speedScale, resist: T.resist,
    face: Math.atan2(-x, -z), st: status(), state: 'spawn', stateT: 0.9, atkCd: 0.6 + Math.random(),
    flash: 0, dotAcc: 0, strafe: Math.random() < 0.5 ? 1 : -1, aimX: 0, aimZ: 1, slamX: 0, slamZ: 0, hitDone: false };
  collide(s, e);
  s.enemies.push(e);
  ev(s, 'spawn', { id: e.id, x: e.x, z: e.z, kind });
}

function kill(s, e) {
  s.kills++;
  s.score += Math.round(e.T.score * (1 + 0.25 * (s.wave - 1)));
  ev(s, 'death', { id: e.id, x: e.x, z: e.z, kind: e.kind, frozen: e.st.frozen > 0 });
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

const AI = {
  thrall(s, e, dt, c) {
    const A = e.T.atk, p = s.player;
    if (e.state === 'chase') {
      if (!p.alive) { e.vx *= 0.9; e.vz *= 0.9; return; }
      steer(s, e, c.ux, c.uz, c.spd, dt);
      turnTo(e, Math.atan2(c.ux, c.uz), e.T.turn * dt);
      e.atkCd -= dt;
      if (e.atkCd <= 0 && (c.dist < A.range + p.r || wallAhead(s, e, c.ux, c.uz))) {
        e.state = 'windup'; e.stateT = A.windup; e.aimX = c.ux; e.aimZ = c.uz;
      }
    } else if (e.state === 'windup') {
      e.vx *= 0.82; e.vz *= 0.82;
      if (e.stateT > 0.12) { e.aimX = c.ux; e.aimZ = c.uz; turnTo(e, Math.atan2(c.ux, c.uz), 8 * dt); }
      if (e.stateT <= 0) { e.state = 'strike'; e.stateT = A.dur; e.hitDone = false; }
    } else if (e.state === 'strike') {
      e.vx = e.aimX * A.lunge; e.vz = e.aimZ * A.lunge;
      if (!e.hitDone) {
        if (p.alive && c.dist < e.r + p.r + 0.5) {
          e.hitDone = true;
          if (hurt(s, p, A.dmg, 'phys')) { p.kvx += e.aimX * 5; p.kvz += e.aimZ * 5; ev(s, 'claw', { x: p.x, z: p.z }); }
        }
        const w = wallAhead(s, e, e.aimX, e.aimZ);
        if (w) { e.hitDone = true; w.hp -= 18; ev(s, 'claw', { x: w.x, z: w.z }); }
      }
      if (e.stateT <= 0) { e.state = 'recover'; e.stateT = A.recover; }
    } else if (e.state === 'recover') {
      e.vx *= 0.85; e.vz *= 0.85;
      if (e.stateT <= 0) { e.state = 'chase'; e.atkCd = 0.3 + Math.random() * 0.5; }
    }
  },
  bulwark(s, e, dt, c) {
    const A = e.T.atk, p = s.player, fx = Math.sin(e.face), fz = Math.cos(e.face);
    if (e.state === 'chase') {
      if (!p.alive) { e.vx *= 0.9; e.vz *= 0.9; return; }
      turnTo(e, Math.atan2(c.ux, c.uz), e.T.turn * dt);
      const facing = fx * c.ux + fz * c.uz;
      steer(s, e, fx, fz, c.spd * Math.max(0.2, facing), dt);
      e.atkCd -= dt;
      if (e.atkCd <= 0 && ((c.dist < A.range + p.r && facing > 0.6) || wallAhead(s, e, fx, fz))) {
        e.state = 'windup'; e.stateT = A.windup; e.slamX = e.x + fx * A.reach; e.slamZ = e.z + fz * A.reach;
      }
    } else if (e.state === 'windup') {
      e.vx *= 0.8; e.vz *= 0.8;
      if (e.stateT <= 0) {
        const L = Math.hypot(p.x - e.slamX, p.z - e.slamZ);
        if (p.alive && L < A.radius + p.r && hurt(s, p, A.dmg, 'phys')) {
          p.kvx += ((p.x - e.slamX) / (L || 1)) * A.knock; p.kvz += ((p.z - e.slamZ) / (L || 1)) * A.knock;
        }
        for (const w of s.walls) if (Math.hypot(w.x - e.slamX, w.z - e.slamZ) < A.radius + w.r) w.hp -= 70;
        ev(s, 'slam', { x: e.slamX, z: e.slamZ, r: A.radius });
        e.state = 'recover'; e.stateT = A.recover;
      }
    } else if (e.state === 'recover') {
      e.vx *= 0.85; e.vz *= 0.85;
      if (e.stateT <= 0) { e.state = 'chase'; e.atkCd = 0.6 + Math.random() * 0.6; }
    }
  },
  hexcaller(s, e, dt, c) {
    const T = e.T, A = T.atk, p = s.player;
    turnTo(e, Math.atan2(c.ux, c.uz), T.turn * dt);
    if (e.state === 'chase') {
      if (!p.alive) { e.vx *= 0.9; e.vz *= 0.9; return; }
      let mx = 0, mz = 0;
      if (c.dist > T.keep[1]) { mx = c.ux; mz = c.uz; } else if (c.dist < T.keep[0]) { mx = -c.ux; mz = -c.uz; }
      mx += -c.uz * e.strafe * 0.8; mz += c.ux * e.strafe * 0.8;
      if (Math.random() < dt * 0.4) e.strafe *= -1;
      const L = Math.hypot(mx, mz) || 1;
      steer(s, e, mx / L, mz / L, c.spd, dt);
      e.atkCd -= dt;
      if (e.atkCd <= 0 && c.dist < A.range) { e.state = 'charge'; e.stateT = A.windup; }
    } else if (e.state === 'charge') {
      e.vx *= 0.9; e.vz *= 0.9;
      e.aimX = c.ux; e.aimZ = c.uz;
      if (e.stateT <= 0) {
        s.shots.push({ id: s.nid++, kind: 'orb', owner: 'enemy', x: e.x + c.ux * 0.6, z: e.z + c.uz * 0.6,
          vx: c.ux * A.speed, vz: c.uz * A.speed, r: 0.3, life: 3, dmg: A.dmg, hits: [] });
        e.state = 'recover'; e.stateT = A.recover;
        e.atkCd = A.cd[0] + Math.random() * (A.cd[1] - A.cd[0]);
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
  const p = s.player, st = e.st;
  const dx = p.x - e.x, dz = p.z - e.z, L = Math.hypot(dx, dz) || 1;
  const c = { ux: dx / L, uz: dz / L, dist: L, spd: e.speed * slowMul(st) };
  if (st.frozen > 0 || st.shock > 0) {
    if (e.state === 'windup' || e.state === 'charge') { e.state = 'recover'; e.stateT = 0.35; ev(s, 'tag', { tag: 'interrupt', x: e.x, z: e.z }); }
    e.vx *= 0.8; e.vz *= 0.8;
  } else {
    e.stateT -= dt;
    AI[e.kind](s, e, dt, c);
  }
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
  const p = s.player;
  if (!p.alive) return;
  for (const e of L) {
    const dx = p.x - e.x, dz = p.z - e.z, d = Math.hypot(dx, dz), m = p.r + e.r;
    if (d >= m || d < 1e-4) continue;
    const push = m - d, wp = e.mass / (e.mass + p.mass);
    p.x += (dx / d) * push * wp; p.z += (dz / d) * push * wp;
    e.x -= (dx / d) * push * (1 - wp); e.z -= (dz / d) * push * (1 - wp);
  }
  collide(s, p);
}

// ---------------------------------------------------------------- projectiles
function updateShots(s, dt) {
  const keep = [];
  for (const b of s.shots) {
    b.life -= dt;
    let ok = true;
    for (let i = 0; i < 3 && ok; i++) { b.x += (b.vx * dt) / 3; b.z += (b.vz * dt) / 3; ok = shotStep(s, b); }
    if (ok && b.life <= 0) { if (b.owner === 'player' && b.kind === 'boulder') impact(s, b, null); ok = false; }
    if (ok) keep.push(b);
  }
  s.shots = keep;
}

function shotStep(s, b) {
  if (Math.hypot(b.x, b.z) > BOUND + 0.4) { impact(s, b, null); return false; }
  for (const o of s.props.pillars) if (Math.hypot(b.x - o.x, b.z - o.z) < b.r + o.r) { impact(s, b, null); return false; }
  for (const o of s.props.barrels) if (o.alive && Math.hypot(b.x - o.x, b.z - o.z) < b.r + o.r) {
    if (b.owner === 'player') o.fuse = o.fuse || 0.05;
    impact(s, b, null); return false;
  }
  if (b.owner === 'enemy') {
    for (const w of s.walls) if (Math.hypot(b.x - w.x, b.z - w.z) < b.r + w.r) { w.hp -= b.dmg * 1.5; impact(s, b, null); return false; }
    const p = s.player;
    if (p.alive && Math.hypot(b.x - p.x, b.z - p.z) < b.r + p.r) {
      if (p.dodge > 0) { if (!b.evaded) { b.evaded = true; ev(s, 'tag', { tag: 'evade', x: p.x, z: p.z }); } return true; }
      hurt(s, p, b.dmg, 'hex');
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
    if (shielded && b.kind !== 'boulder') {
      ev(s, 'tag', { tag: 'blocked', x: e.x, z: e.z });
      ev(s, 'block', { x: b.x, z: b.z, color: sp.color });
      if (d.explode) impact(s, b, null); else applyPayload(s, e, sp.payload, { scale: 0.15, kx, kz, knockMul: 0.2 });
      return false;
    }
    if (!d.explode && !d.splash) applyPayload(s, e, sp.payload, { kx, kz, scale: shielded ? 0.6 : 1 });
    if (b.pierce > 0 && !d.explode && !d.splash) { b.pierce--; continue; }
    impact(s, b, e);
    return false;
  }
  return true;
}

function impact(s, b, target) {
  if (b.owner === 'enemy') { ev(s, 'impact', { x: b.x, z: b.z, color: 0x5cffb0, els: [], enemy: true }); return; }
  const sp = b.sp, d = sp.def, R = d.explode || d.splash || 0;
  if (R) explode(s, b.x, b.z, R, sp.payload, { selfMul: d.explode ? 0.45 : 0.3, big: !!d.explode, color: sp.color, els: sp.els });
  else envAt(s, b.x, b.z, 0.5, sp.els, b.kind === 'boulder');
  if (d.chainOnImpact) {
    const hit = new Set(target ? [target.id] : []);
    let nx = null, nb = 5;
    for (const e of live(s)) if (!hit.has(e.id)) { const dd = Math.hypot(e.x - b.x, e.z - b.z); if (dd < nb) { nb = dd; nx = e; } }
    if (nx) { const pts = [[b.x, b.z]]; chainWalk(s, ZAP, nx, d.chainOnImpact - 1, pts, 0.9, hit); ev(s, 'chain', { pts, els: ['lightning'], color: 0xf4e15c }); }
  }
  if (d.leaves) spawnArea(s, LEAVES(d.leaves), b.x, b.z);
  ev(s, 'impact', { x: b.x, z: b.z, els: sp.els, color: sp.color, kind: b.kind, r: R });
}

// ---------------------------------------------------------------- areas & walls
function updateAreas(s, dt) {
  const p = s.player;
  for (const a of s.areas) {
    if (a.delay > 0) {
      a.delay -= dt;
      if (a.delay <= 0 && a.burst) {
        explode(s, a.x, a.z, a.r, a.sp.payload, { selfMul: a.hitsAll ? 0.6 : 0, big: true, color: a.color, els: a.els, reason: 'Stood under your own ' + a.name });
        a.life = 0;
      }
      continue;
    }
    a.life -= dt;
    if (a.pull) for (const e of live(s)) {
      const vx = a.x - e.x, vz = a.z - e.z, L = Math.hypot(vx, vz);
      if (L < a.r + e.r && L > 0.3) { e.kvx += ((vx / L) * a.pull * dt * 6) / e.mass; e.kvz += ((vz / L) * a.pull * dt * 6) / e.mass; }
    }
    a.tickT -= dt;
    if (a.tickT <= 0) {
      a.tickT = a.tick;
      const pl = { ...a.sp.payload, knock: 0 };
      for (const e of live(s)) if (Math.hypot(e.x - a.x, e.z - a.z) < a.r + e.r * 0.5) applyPayload(s, e, pl, { area: true });
      if (a.hitsAll && p.alive && Math.hypot(p.x - a.x, p.z - a.z) < a.r) applyPayload(s, p, pl, { area: true, reason: 'Standing in your own ' + a.name });
      envAt(s, a.x, a.z, a.r * 0.8, a.els, false);
    }
  }
  s.areas = s.areas.filter((a) => a.life > 0);
}

function updateWalls(s, dt) {
  for (const w of s.walls) {
    w.life -= dt;
    if (w.chill) {
      w.touchT -= dt;
      if (w.touchT <= 0) { w.touchT = 0.8; for (const e of live(s)) if (dist(e, w) < e.r + w.r + 0.2) applyPayload(s, e, ENV.rime, {}); }
    }
  }
  const out = [];
  for (const w of s.walls) {
    if (w.life > 0 && w.hp > 0) out.push(w);
    else ev(s, 'wallBreak', { id: w.id, x: w.x, z: w.z, mat: w.mat });
  }
  s.walls = out;
}
