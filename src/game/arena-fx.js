// Arena port of the fx-showcase casting language: gather → pin-point hold → style-shaped release, painterly beams,
// dashes, wards, zones, chains and projectile trails, all on the fx2d sprite layer. Render-only, driven by sim events.
import { K, M, PAL } from './fx2d.js';
import { conjureSpear } from './ice-spear.js';
import { createEarth } from './earth-fx.js';
import { createChains } from './chain-fx.js';

const rnd = (a, b) => a + Math.random() * (b - a);
export function palOf(els = []) {
  const has = (x) => els.includes(x);
  if (has('fire') && has('lightning')) return { fire: 'plasma', smoke: 'smoke', crack: 'magma', zone: 'crack' };
  if (has('fire') && has('earth')) return { fire: 'magma', smoke: 'smoke', crack: 'magma', zone: 'crack' };
  if (has('ice') && has('water')) return { fire: 'water', smoke: 'frost', crack: 'icefield', zone: 'icefield' };
  const T = [['fire', 'fire', 'smoke', 'magma', 'crack'], ['lightning', 'lightning', 'wind', 'lightning', 'crack'], ['ice', 'ice', 'frost', 'icefield', 'icefield'],
    ['water', 'water', 'frost', 'water', 'ring'], ['earth', 'dust', 'dust', 'earth', 'crack'], ['light', 'light', 'frost', 'light', 'rune'], ['dark', 'dark', 'smoke', 'dark', 'rune'],
    ['arcane', 'arcane', 'smoke', 'arcane', 'rune'], ['nature', 'nature', 'dust', 'nature', 'ring'], ['wind', 'wind', 'wind', 'wind', 'ring']];
  for (const [el, fire, smoke, crack, zone] of T) if (has(el)) return { fire, smoke, crack, zone };
  return { fire: 'fire', smoke: 'smoke', crack: 'magma', zone: 'crack' };
}

export function createArenaFx({ fx, R, tipPos, scene }) {
  const tip = () => { const v = tipPos(); return [v.x, v.y, v.z]; };
  const trails = new Map();
  const EARTH = scene ? createEarth(fx, R, scene) : null;
  const CHAINS = scene ? createChains(fx, R, scene) : null;
  let S = null;

  // Storms (R-088): a cloud over the mark and rain of the element for as long as the strikes last; lightning storms
  // also drop a bolt from the cloud on every strike (see the explode case).
  const stormKeys = new Set();
  function storm(e, P) {
    stormKeys.add(e.key);
    const els = e.els || [], sc = e.scatter ?? 4, dur = (e.delay ?? 0) + (e.repeat ?? 6) * (e.interval ?? 0.4);
    const rain = els.includes('ice') ? 'ice' : els.includes('fire') ? 'fire' : P.fire;
    fx.during(dur, (dt) => {
      if (Math.random() < dt * 12) fx.spawn({ kind: K.smoke, pal: 'smoke', p: [e.x + rnd(-sc, sc), rnd(6.5, 8), e.z + rnd(-sc, sc)], v: [rnd(-0.4, 0.4), 0, rnd(-0.4, 0.4)], s0: 2.2, s1: 3.6, life: 1.6, drag: 1 });
      for (let i = 0; i < 3; i++) if (Math.random() < dt * 30) fx.spawn({ kind: K.spark, mode: M.vel, pal: rain, p: [e.x + rnd(-sc, sc), rnd(5, 7), e.z + rnd(-sc, sc)], v: [0, -22, 0], s: 0.12, aspect: 0.14, life: 0.3 });
    });
  }

  function zone(x, z, r, P, life = 1.6) {
    R.ring([x, 0, z], P.fire, r * 2, 0.4);
    if (P.fire === 'wind') R.tornado(() => [x, 0, z], 1.4, { h: 2.6, r0: 0.25, r1: Math.min(1.4, r * 0.45), rate: 70 });
    if (EARTH && P.fire === 'dust') EARTH.ring([x, 0, z], Math.min(1.8, r * 0.55), 9, { life: 1.6 });
    if (P.fire === 'magma') R.rockfire([x, 0, z], { r: Math.min(1.1, r * 0.4), life: 2.2, rocks: 9 });
    if (P.fire === 'ice' || P.zone === 'icefield') R.crystals([x, 0, z], Math.min(1.6, r * 0.6), 11, { life: 2.4 });
    if (P.zone === 'icefield') fx.decal({ kind: K.icefield, pal: 'icefield', p: [x, 0.03, z], s: r * 2, life: life + 1 });
    else if (P.zone === 'rune') fx.decal({ kind: K.rune, pal: P.fire, p: [x, 0.03, z], s: r * 2, life, tick: (q, dt) => { q.rot += dt * 0.3; } });
    else if (P.zone === 'crack') fx.decal({ kind: K.crack, pal: P.crack, p: [x, 0.03, z], s: r * 1.6, life: life + 1 });
    for (let i = 0; i < 10; i++) { const a = (i / 10) * 6.28; R.lick([x + Math.cos(a) * r * 0.8, 0.25, z + Math.sin(a) * r * 0.8], P.fire, 0.5, { v: [Math.cos(a) * 1.5, rnd(1.5, 3), Math.sin(a) * 1.5], life: 0.4 }); }
  }

  function release(e) {
    fx.kill('arena-gather');
    const P = palOf(e.els), w = e.weight ?? 0.5, t = tip(), ax = e.dx ?? 0, az = e.dz ?? 1, x = e.x, z = e.z;
    R.flash(t, P.fire, 0.8 + 0.6 * w, 0);
    switch (e.style) {
      case 'slam':
        for (let i = 1; i <= 4; i++) { const k = i / 4, at = [x + ax * (0.6 + 1.8 * k), 0.03, z + az * (0.6 + 1.8 * k)];
          fx.after(k * 0.12, () => { fx.decal({ kind: K.crack, pal: P.crack, p: at, s: 0.9 + k * 0.5, life: 2, rot: Math.random() * 6 }); R.lick([at[0], 0.2, at[2]], P.fire, 0.45, { life: 0.3 }); }); }
        R.debris([x + ax * 0.6, 0, z + az * 0.6], P.fire === 'ice' ? 'ice' : 'earth', 4, 3, 0.14);
        if (EARTH && (e.els || []).includes('earth') && P.fire !== 'magma') EARTH.rupture([x, 0, z], [ax, 0, az], { n: 4, step: 0.6, h0: 0.5, h1: 1, life: 1 });
        break;
      case 'sweep':
        if (P.fire === 'wind') { for (let i = 0; i < 5; i++) { const a = Math.atan2(ax, az) - 0.7 + i * 0.35; R.gust([x + Math.sin(a) * 0.6, 1.1, z + Math.cos(a) * 0.6], [Math.sin(a) * 9, 0, Math.cos(a) * 9], { s: 0.9, life: 0.32 }); } break; }
        for (let i = 0; i < 14; i++) { const a = Math.atan2(ax, az) - 1.1 + (i / 13) * 2.2;
          fx.after(i * 0.008, () => { const d = [Math.sin(a), 0, Math.cos(a)];
            fx.spawn({ kind: K.flame, pal: P.fire, p: [x + d[0] * 0.9, 1.0, z + d[2] * 0.9], v: [d[0] * 8, -1, d[2] * 8], s0: 0.5, s1: 0.28, life: 0.36, drag: 2.2, aspect: 0.7, bias: -0.05 }); }); }
        break;
      case 'plant':
        fx.decal({ kind: K.rune, pal: P.fire, p: [x, 0.03, z], s: 2.8, life: 1.2, rot: 0, tick: (q, dt) => { q.rot += dt * 0.4; } });
        fx.decal({ kind: K.crack, pal: P.crack, p: [t[0], 0.03, t[2]], s: 1.1, life: 1.6 });
        break;
      case 'sweep_wind':
      case 'flick':
        if (P.fire === 'wind') { for (let i = 0; i < 3; i++) { const a = Math.atan2(ax, az) + (i - 1) * 0.3; R.gust([t[0], 1.1, t[2]], [Math.sin(a) * 10, 0, Math.cos(a) * 10], { s: 0.8, life: 0.35 }); } break; }
        for (let i = 0; i < 10; i++) { const a = Math.atan2(ax, az) + rnd(-0.6, 0.6), sp = rnd(5, 9);
          fx.spawn({ kind: K.spark, mode: M.vel, pal: P.fire, p: t, v: [Math.sin(a) * sp, rnd(-1, 2), Math.cos(a) * sp], s: 0.13, aspect: 0.3, life: 0.3, drag: 3, stretch: 0.1, add: 0.4 }); }
        break;
      default:
        for (let i = 0; i < 6; i++) R.lick(t, P.fire, 0.45, { v: [ax * rnd(1, 3) + rnd(-1.5, 1.5), rnd(-0.5, 1.5), az * rnd(1, 3) + rnd(-1.5, 1.5)], life: 0.2 });
    }
  }

  function beam(e) {
    const P = palOf(e.els), L = e.len ?? 8, a = [e.x, 1.1, e.z], b = [e.x + e.dx * L, 1.1, e.z + e.dz * L], D = 0.4;
    R.strands(() => a, () => b, P.fire, D, { orbs: true, n: 4 + Math.min(2, (e.els?.length ?? 2) - 1), amp: 0.22 + (e.w ?? 0.7) * 0.12, w: 0.1, sag: 0.25, seg: 22 });
    if (e.els.includes('fire')) R.firestream(() => a, () => [e.dx, 0, e.dz], L, D * 0.7, { pal: P.fire, rate: 35, s1: 1.1 });
    if (e.els.includes('lightning')) fx.after(D * 0.4, () => R.bolt(a, b, 'lightning', { seg: 10, w: 0.07, life: 0.08, jit: 0.4, fork: 0.25 }));
  }

  function blink(e) {
    const P = palOf(e.els), a = [e.x0, 1.05, e.z0], b = [e.x1, 1.05, e.z1];
    R.flash(a, P.fire, 1, 0); fx.after(0.03, () => { R.flash(b, P.fire, 1.3, 0); R.sparks(b, P.fire, 12, 6, { up: 0.5 }); R.ring([b[0], 0, b[2]], P.fire, 2, 0.3); });
    for (let i = 0; i < 8; i++) { const ang = (i / 8) * 6.28;
      fx.spawn({ kind: K.smoke, pal: 'wind', p: [a[0], 0.3, a[2]], v: [Math.cos(ang) * 3.5, 0.5, Math.sin(ang) * 3.5], s0: 0.25, s1: 0.8, life: 0.5, drag: 4, curl: 2, alpha: 0.8 }); }
    if (e.els.includes('lightning')) for (let s = 0; s < 2; s++) fx.after(s * 0.05, () => R.bolt(a, b, 'lightning', { seg: 10, w: 0.13 - s * 0.03, life: 0.15, jit: 0.5, fork: 0.3 }));
    else { const n = 14; for (let i = 0; i < n; i++) { const k = Math.random();
      fx.spawn({ kind: K.spark, mode: M.vel, pal: P.fire, p: [a[0] + (b[0] - a[0]) * k, rnd(0.4, 1.8), a[2] + (b[2] - a[2]) * k], v: [(b[0] - a[0]) * 3, 0, (b[2] - a[2]) * 3], s: 0.11, aspect: 0.12, life: 0.28, stretch: 0.1, drag: 6 }); } }
  }

  // Guardian healing field (showcase Sacred Spring): rune, pillar, fountain raining back, rising motes.
  function spring(x, z, r, P, life) {
    const pal = P.fire === 'water' ? 'light' : P.fire;
    fx.decal({ kind: K.rune, pal, p: [x, 0.03, z], s: r * 1.8, life: life + 0.5, rot: 0, alpha: 0.75, tick: (q, dt) => { q.rot += dt * 0.25; } });
    fx.spawn({ kind: K.beam, mode: M.axis, pal, p: [x, 4, z], axis: [0, 1, 0], len: 8, s: 0.8, life: 0.9, add: 0.3, alpha: 0.5 });
    R.flash([x, 0.4, z], pal, 1.2, 0);
    fx.during(Math.min(1.2, life), (dt, k) => { const n = Math.round(dt * 60 * (1 - k * 0.7));
      for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, sp = rnd(1.2, 2.4);
        fx.spawn({ kind: K.spark, mode: M.vel, pal: 'water', p: [x + Math.cos(a) * 0.4, 0.3, z + Math.sin(a) * 0.4], v: [Math.cos(a) * sp, rnd(5, 8), Math.sin(a) * sp], s: 0.14, aspect: 0.45, life: 1.2, grav: -14, drag: 0.2, stretch: 0.05, bounce: 0, floor: 0.04,
          onBounce: (q) => { q.life = q.age + 0.01; fx.spawn({ kind: K.ring, pal: 'water', mode: M.ground, p: [q.p[0], 0.04, q.p[2]], s0: 0.1, s1: 0.5, life: 0.25, rot: 0 }); } }); } });
    fx.during(life, (dt) => { if (Math.random() < dt * 14) { const a = Math.random() * 6.28, rr = rnd(0.4, r * 0.9);
      fx.spawn({ kind: K.star, pal, p: [x + Math.cos(a) * rr, 0.2, z + Math.sin(a) * rr], v: [0, rnd(1, 2), 0], s0: 0.2, s1: 0.05, life: rnd(1, 1.5), curl: 2, add: 0.5, spin: 2 }); } });
  }
  // Per-element projectile hits (showcase PROJ impacts); explosive shots are handled by the blast in render.js.
  function hitFx(e, P) {
    const p = [e.x, 1.0, e.z], g = [e.x, 0, e.z], els = e.els || [];
    if (P.fire === 'ice' || P.fire === 'water') { R.flash(p, 'crystal', 0.9, 0); R.debris(p, 'crystal', 8, 5, 0.14); R.ring(g, 'ice', 1.8, 0.25);
      fx.decal({ kind: K.icefield, pal: 'icefield', p: [e.x, 0.03, e.z], s: 1.8, life: 1.8 });
      for (let i = 0; i < 4; i++) fx.spawn({ kind: K.smoke, pal: 'frost', p, v: R.dir(1.4, 0.3), s0: 0.3, s1: 0.8, life: 0.9, drag: 2.5, alpha: 0.7 }); }
    else if (P.fire === 'light') { R.flash(p, 'light', 1.3, 0); fx.decal({ kind: K.rune, pal: 'light', p: [e.x, 0.03, e.z], s: 2, life: 1.2 });
      fx.spawn({ kind: K.beam, mode: M.axis, pal: 'light', p: [e.x, 2.2, e.z], axis: [0, 1, 0], len: 4.4, s: 0.6, life: 0.35, add: 0.4 }); R.sparks(p, 'light', 10, 4, { grav: 2 }); }
    else if (els.includes('lightning')) { R.flash(p, 'lightning', 1.1, 0); R.bolt([e.x + 0.3, 4.5, e.z], [e.x, 0.05, e.z], 'lightning', { seg: 9, w: 0.13, life: 0.18, fork: 0.4 });
      R.sparks(p, 'lightning', 14, 7, { grav: -8 }); fx.decal({ kind: K.crack, pal: 'lightning', p: [e.x, 0.03, e.z], s: 1.2, life: 1.2 }); }
    else if (P.fire === 'wind') { R.flash(p, 'gale', 0.7, 0); R.curls?.(p, 6, { s: 0.4, sp: 2 }); R.ring(g, 'wind', 2, 0.3);
      for (let k = 0; k < 3; k++) fx.spawn({ kind: K.smoke, pal: 'dust', p: [e.x, 0.3, e.z], v: R.dir(2.2, 0.3), s0: 0.25, s1: 0.6, life: 0.6, drag: 3, alpha: 0.5 }); }
    else if (P.fire === 'dust' || e.kind === 'boulder') { R.debris(p, 'rock', 10, 6, 0.18); R.ring(g, 'dust', 2.4, 0.3); fx.decal({ kind: K.crack, pal: 'earth', p: [e.x, 0.03, e.z], s: 1.8, life: 2.4 });
      for (let k = 0; k < 5; k++) fx.spawn({ kind: K.smoke, pal: 'dust', p: [e.x, 0.3, e.z], v: R.dir(2.4, 0.4), s0: 0.35, s1: 1, life: 1, drag: 2.8, split: 0.5, alpha: 0.65 });
      if (EARTH && e.kind === 'boulder') EARTH.ring(g, 1, 6, { h: 0.7, life: 1.2 }); }
    else if (P.fire === 'arcane' || P.fire === 'dark') { R.flash(p, P.fire, 1, 0); R.ring(p, P.fire, 1.4, 0.22, false); for (let k = 0; k < 4; k++) R.lick(p, P.fire, 0.5, { v: R.dir(2.2, 0.5), life: 0.35 }); }
    else { fx.spawn({ kind: K.billow, pal: Math.random() < 0.4 ? 'blast' : P.fire, p, s0: 0.5, s1: 1.1, life: 0.3, add: 0.5 }); R.sparks(p, P.fire, 10, 5, { up: 0.5 });
      fx.decal({ kind: K.scorch, pal: 'char', p: [e.x, 0.025, e.z], s: 1.2, life: 2 }); }
  }
  // Walls rising: dust + cracks per segment; earth gets spires, ice gets crystals.
  function wallFx(e, P) {
    const pts = [];
    if (e.ring) for (let i = 0; i < e.n; i++) { const a = (i / e.n) * 6.283; pts.push([e.x + Math.sin(a) * e.ring, 0, e.z + Math.cos(a) * e.ring]); }
    else for (let i = 0; i < e.n; i++) { const o = (i - (e.n - 1) / 2) * 0.95; pts.push([e.x - e.dz * o, 0, e.z + e.dx * o]); }
    pts.forEach((p, i) => fx.after(i * 0.02, () => {
      fx.decal({ kind: K.crack, pal: P.crack, p: [p[0], 0.03, p[2]], s: 1.1, life: 2 });
      fx.spawn({ kind: K.smoke, pal: P.fire === 'ice' ? 'frost' : 'dust', p: [p[0], 0.3, p[2]], v: R.dir(1.6, 0.3), s0: 0.3, s1: 0.8, life: 0.7, drag: 3, alpha: 0.65 });
      if (P.fire === 'magma' || P.fire === 'fire') R.lick([p[0], 0.3, p[2]], P.fire, 0.5, { v: [0, 3, 0], aspect: 1.6, life: 0.4 });
    }));
    if (P.fire === 'ice' || P.zone === 'icefield') R.crystals([e.x, 0, e.z], e.ring ?? 0.6, Math.max(6, e.n), { life: 1.4, h: 0.8 });
  }
  let stones = null;
  let spearTo = null; // the ice spear conjured during a Frozen Domain wind-up: its target is set when the spell is released

  return {
    onEvent(e, s) {
      S = s;
      const P = palOf(e.els || []);
      switch (e.type) {
        case 'windup':
          if (e.mode === 'self') break;
          if (scene && e.key === 'ice+water' && e.name === 'Frozen Domain') {
            // The showcase's signature: the spear forms over the shoulder through the wind-up and hold, and is thrown on release.
            const to = spearTo = [e.x + (e.dx ?? 0) * 6, 0, e.z + (e.dz ?? 1) * 6];
            const hold = e.hold ?? 0.05;
            conjureSpear(fx, R, scene, { getHand: () => { const t = tip(); return [t[0], t[1] - 0.2, t[2]]; }, to, tForm: Math.max(0.12, e.t - hold), hold, flight: 0.3, scale: 1,
              onImpact: (p) => { R.crystals(p, Math.min(1.6, (to.r ?? 3) * 0.45), 11, { life: 2.4 }); } });
          }
          R.gather(tip, P.fire, e.t, { r: 1.0, orb: 0.25 + 0.25 * (e.weight ?? 0.5), rate: 45, tag: 'arena-gather' });
          fx.after(Math.max(0, e.t - (e.hold ?? 0.05)), () => R.flash(tip(), P.fire, 0.45, 0));
          if (EARTH && P.fire === 'dust' && (e.weight ?? 0.5) > 0.4) { const pl = () => [S?.player?.x ?? e.x, 0, S?.player?.z ?? e.z]; stones = EARTH.orbit(pl, 5, { r: 0.8, y: 1.15, dur: e.t + 0.1 }); }
          if (P.fire === 'wind') fx.during(e.t, (dt) => { if (Math.random() < dt * 30) { const s0 = tip(), a = Math.random() * 6.28, r = rnd(0.8, 1.2);
            fx.spawn({ kind: K.arc, pal: 'gale', p: [s0[0] + Math.cos(a) * r, s0[1] + rnd(-0.4, 0.3), s0[2] + Math.sin(a) * r], v: [-Math.cos(a) * 3, 0, -Math.sin(a) * 3], s0: 0.4, s1: 0.15, life: 0.28, spin: 9, add: 0.2 }); } });
          break;
        case 'cast': if (e.mode !== 'self') release(e); else fx.kill('arena-gather');
          if (stones) { stones.hurl([e.x + (e.dx ?? 0) * 6, 0, e.z + (e.dz ?? 1) * 6], { speed: 20, spread: 1.4 }); stones = null; } break;
        case 'beam': beam(e); break;
        case 'blink': blink(e); break;
        case 'dash': fx.during(e.t ?? 0.2, () => { const p = S?.player; if (!p) return;
          fx.spawn({ kind: K.spark, mode: M.vel, pal: P.fire, p: [p.x + rnd(-0.3, 0.3), rnd(0.3, 1.7), p.z + rnd(-0.3, 0.3)], v: [-(e.dx ?? 0) * 6, 0, -(e.dz ?? 1) * 6], s: 0.12, aspect: 0.14, life: 0.25, stretch: 0.1, drag: 5 }); });
          { const a = [e.x, 1.05, e.z], b = [e.x + (e.dx ?? 0) * (e.dist ?? 4), 1.05, e.z + (e.dz ?? 1) * (e.dist ?? 4)];
            if ((e.els || []).includes('lightning')) fx.after(e.t ?? 0.2, () => { R.bolt(a, b, 'lightning', { seg: 10, w: 0.12, life: 0.15, jit: 0.5, fork: 0.3 }); R.flash(b, 'lightning', 1.1, 0); });
            if (P.fire === 'wind') R.curls?.(a, 6, { s: 0.35 }); } break;
        case 'guard':
          fx.dome([e.x, 0, e.z], 1.6, (PAL[P.fire] ?? PAL.light)[1], 1.8);
          fx.decal({ kind: K.rune, pal: P.fire, p: [e.x, 0.03, e.z], s: 3, life: 1.6, rot: 0, tick: (q, dt) => { q.rot += dt * 0.5; } });
          fx.spawn({ kind: K.beam, mode: M.axis, pal: P.fire, p: [e.x, 2.2, e.z], axis: [0, 1, 0], len: 4.4, s: 1.1, life: 0.5, add: 0.25, alpha: 0.85 });
          break;
        case 'nova': zone(e.x, e.z, e.r ?? 2.4, P); break;
        case 'area':
          if (e.mine) { // armed rune, turning slowly until the mine trips
            fx.decal({ kind: K.rune, pal: P.fire, p: [e.x, 0.03, e.z], s: 1.7, life: Math.min(e.life ?? 20, 30), rot: 0, tag: 'mine' + e.id, tick: (q, dt) => { q.rot += dt * 0.7; } });
            R.flash([e.x, 0.3, e.z], P.fire, 0.6, 0);
            break;
          }
          if (e.storm) { storm(e, P); break; }
          // Cryomancer's Water + Ice: the field is planted by a hurled ice spear (quick form — the sim field is already live).
          if (scene && e.key === 'ice+water' && e.name === 'Frozen Domain') {
            if (spearTo) { spearTo[0] = e.x; spearTo[2] = e.z; spearTo.r = e.r; spearTo = null; break; } // the spear from the wind-up flies to the field
            conjureSpear(fx, R, scene, { getHand: () => { const t = tip(); return [t[0], t[1] - 0.2, t[2]]; }, to: [e.x, 0, e.z], tForm: 0.12, hold: 0.03, flight: 0.22, scale: 0.8,
              onImpact: (p) => { R.crystals(p, Math.min(1.6, (e.r ?? 3) * 0.45), 11, { life: 2.4 }); } });
            break;
          }
          if (e.heal) { spring(e.x, e.z, e.r ?? 3, P, Math.min(3, e.life ?? 2)); break; }
          fx.after(e.delay ?? 0, () => zone(e.x, e.z, e.r ?? 3, P, Math.min(4, e.life ?? 1.6)));
          break;
        case 'explode':
          if (stormKeys.has(e.key) && (e.els || []).includes('lightning')) { R.bolt([e.x, 8, e.z], [e.x, 0.4, e.z], 'lightning', { seg: 12, w: 0.14, life: 0.18, jit: 0.6, fork: 0.35 }); R.flash([e.x, 0.6, e.z], 'lightning', 1.2, 0); }
          break;
        case 'mineTrip': fx.kill('mine' + e.id); R.flash([e.x, 0.4, e.z], P.fire, 1.2, 0); R.ring([e.x, 0, e.z], P.fire, Math.min(2.6, e.r ?? 2.4), 0.25); break;
        case 'impact': if (!e.enemy && !(e.r > 0)) hitFx(e, P); break;
        case 'wall': wallFx(e, P); break;
        case 'decoy': R.flash([e.x, 1, e.z], P.fire, 1, 0); R.ring([e.x, 0, e.z], P.fire, 1.8, 0.3); R.curls?.([e.x, 1, e.z], 6, { pal: P.fire === 'wind' ? 'gale' : P.fire, s: 0.3 }); break;
        case 'swap': { const a = [e.x0, 1, e.z0], b = [e.x1, 1, e.z1]; R.flash(a, P.fire, 1, 0); R.flash(b, P.fire, 1, 0);
          R.strands(() => a, () => b, P.fire, 0.18, { n: 3, amp: 0.2, w: 0.08, sag: 0.1, seg: 14 }); break; }
        case 'selfcast': R.nova([e.x, 0, e.z], P.fire, 1.6); break;
        case 'chain':
          if (CHAINS && e.pts?.length > 1 && !(e.els || []).includes('lightning')) {
            // Grave Chains / binds: an iron chain from a floor portal beside each struck target.
            e.pts.slice(1).forEach((q, i) => { const a = Math.random() * 6.28;
              CHAINS.bind([q[0] + Math.cos(a) * 1.4, 0, q[1] + Math.sin(a) * 1.4], () => [q[0], 1.0, q[1]], { delay: i * 0.06, shoot: 0.16, hold: 1.2, pal: P.fire === 'nature' ? 'nature' : 'dark', coil: 1.6, coilR: 0.36 }); });
            break;
          }
          if (e.pts?.length > 1) { const pts = e.pts.map((q) => [q[0], 1.1, q[1]]); R.chain(() => pts[0], pts.slice(1), 0.25); } break;
        case 'cone': { const ice = (e.els || []).includes('ice'), fire = P.fire === 'fire' || P.fire === 'magma', len = e.range ?? 4, d = [e.dx ?? 0, 0, e.dz ?? 1];
          const dur = e.channel ?? 0.3, me = () => (e.channel && S?.player && (!e.pid || e.pid === S.player.id) ? S.player : null); // a channelled jet turns with its wizard
          const org = () => { const p = me(); return p ? [p.x + p.fx * 0.5, 1.0, p.z + p.fz * 0.5] : [e.x + d[0] * 0.5, 1.0, e.z + d[2] * 0.5]; };
          const dir = () => { const p = me(); return p ? [p.fx, 0, p.fz] : d; };
          if (fire) R.firestream(org, dir, len, dur, { rate: 45, s1: 1.2 });
          else R.spray(org, dir, len, dur, { pal: (e.els || []).includes('dark') ? 'smoke' : 'mist', drop: ice ? 'crystal' : 'water', cone: ((e.arc ?? 40) * Math.PI) / 360 });
          if (ice) R.sheet([e.x, 0, e.z], d, len, len * 0.7, 2.6);
          break; }
      }
    },
    update(s) {
      S = s;
      const seen = new Set();
      for (const b of s.shots) {
        if (b.owner !== 'player') continue;
        seen.add(b.id);
        const y = b.y ?? (b.kind === 'boulder' ? 0.95 : 1.15), now = [b.x, y, b.z], P = palOf(b.els), last = trails.get(b.id);
        trails.set(b.id, now);
        if (!last) continue;
        if (b.els?.includes('lightning') && P.fire === 'lightning') { if (Math.random() < 0.6) R.bolt(last, now, 'lightning', { seg: 3, w: 0.06, life: 0.1, jit: 0.2 }); }
        else if (P.fire === 'ice' || P.fire === 'water') { if (Math.random() < 0.6) fx.spawn({ kind: K.smoke, pal: 'frost', p: now, v: [rnd(-0.3, 0.3), -0.1, rnd(-0.3, 0.3)], s0: 0.18, s1: 0.45, life: 0.6, drag: 2, alpha: 0.75 }); }
        else if (b.kind === 'boulder') { if (Math.random() < 0.3) fx.spawn({ kind: K.smoke, pal: 'dust', p: [b.x, 0.25, b.z], v: [0, 0.5, 0], s0: 0.25, s1: 0.7, life: 0.7, drag: 2.5 }); }
        else if (P.fire === 'wind') { if (Math.random() < 0.5) fx.spawn({ kind: K.arc, pal: 'gale', p: now, v: [0, 0.3, 0], s0: 0.35, s1: 0.55, life: 0.3, spin: 8, add: 0.2 }); }
        else if (P.fire === 'light') { if (Math.random() < 0.6) fx.spawn({ kind: K.star, pal: 'light', p: [now[0] + rnd(-0.12, 0.12), now[1] + rnd(-0.12, 0.12), now[2]], v: [0, rnd(0.2, 0.7), 0], s0: 0.2, s1: 0, life: 0.45, curl: 2, add: 0.5 }); }
        else if (P.fire === 'fire' || P.fire === 'magma') { if (Math.random() < 0.7) fx.spawn({ kind: K.billow, pal: Math.random() < 0.3 ? 'blast' : 'fire', p: now, v: [rnd(-0.3, 0.3), rnd(0.5, 1.2), rnd(-0.3, 0.3)], s0: rnd(0.35, 0.5), s1: 0.2, life: rnd(0.22, 0.35), drag: 2, add: 0.45 });
          if (Math.random() < 0.12) fx.spawn({ kind: K.smoke, pal: 'smoke', p: now, v: [0, 0.7, 0], s0: 0.2, s1: 0.6, life: 0.9, drag: 2, curl: 1.4, alpha: 0.6 }); }
        else if (Math.random() < 0.7) R.lick(now, P.fire, rnd(0.3, 0.5), { v: [rnd(-0.4, 0.4), rnd(0.6, 1.4), rnd(-0.4, 0.4)], life: rnd(0.2, 0.35) });
      }
      for (const id of trails.keys()) if (!seen.has(id)) trails.delete(id);
    }
  };
}
