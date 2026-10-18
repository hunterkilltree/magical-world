// The rest of the fx-showcase signatures in the arena (R-089): Flash Step afterimages, Tectonic Rupture's giant spire,
// Arcane Missiles, Chain Hook's yank, Grave Chains' prison, Magma Crush's lava, Hurricane Eye walking through the
// enemy line and Arc Plasma's burst. Render-only: reads sim events and state, never writes gameplay.
import * as THREE from 'three';
import { K, M } from './fx2d.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const only = (els, el) => Array.isArray(els) && els.length === 1 && els[0] === el;

export function createSignatureFx({ scene, fx, R, earth, chains, tip, getState, bodyOf }) {
  const foes = () => (getState()?.enemies ?? []).filter((e) => e.hp > 0 && e.state !== 'spawn');

  // The nearest enemy inside a cone ahead of (x, z), else null.
  function aimed(x, z, dx, dz, range = 14, cos = 0.85) {
    let best = null, bd = Infinity;
    for (const e of foes()) {
      const vx = e.x - x, vz = e.z - z, L = Math.hypot(vx, vz);
      if (L > range || L < 0.3 || (vx * dx + vz * dz) / L < cos) continue;
      if (L < bd) { bd = L; best = e; }
    }
    return best;
  }
  const ahead = (e, L) => [e.x + (e.dx ?? 0) * L, 0, e.z + (e.dz ?? 1) * L];

  // Flash Step: ghosts of the wizard left along the path, fading one after another.
  const ghostMats = new Map();
  const ghostMat = (hex) => {
    if (!ghostMats.has(hex)) ghostMats.set(hex, new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }));
    return ghostMats.get(hex);
  };
  function afterimages(e) {
    const view = bodyOf?.(e.pid, getState()?.player?.id), src = view?.group;
    if (!src) return 0;
    const a = e.x0 !== undefined ? [e.x0, e.z0] : [e.x, e.z], b = e.x1 !== undefined ? [e.x1, e.z1] : [e.x + e.dx * e.dist, e.z + e.dz * e.dist];
    const ghosts = [];
    for (let i = 0; i < 4; i++) {
      const k = i / 4, gh = src.clone(true), mats = [];
      gh.traverse((o) => { if (o.isMesh) { o.material = ghostMat(e.color ?? 0xf4e15c).clone(); mats.push(o.material); } });
      gh.position.set(a[0] + (b[0] - a[0]) * k, src.position.y, a[1] + (b[1] - a[1]) * k);
      gh.quaternion.copy(src.quaternion); gh.scale.copy(src.scale);
      scene.add(gh);
      ghosts.push({ gh, mats, life: 0.28 + i * 0.07 });
    }
    let age = 0;
    fx.during(0.6, (dt) => {
      age += dt;
      for (const g of ghosts) {
        if (!g.gh.parent) continue;
        const k = Math.max(0, 1 - age / g.life);
        for (const m of g.mats) m.opacity = 0.45 * k;
        if (!k) { scene.remove(g.gh); for (const m of g.mats) m.dispose(); }
      }
    });
    return ghosts.length;
  }

  // Tectonic Rupture: after the spires march out, one last great spire launches the enemy ahead.
  function spire(e) {
    if (!earth) return false;
    const T = aimed(e.x, e.z, e.dx ?? 0, e.dz ?? 1, 14, 0.8), p = T ? [T.x, 0, T.z] : ahead(e, 7);
    fx.after(0.34, () => {
      fx.impact?.([1, 0.75, 0.4]); fx.shake(0.4);
      earth.spire(p, { h: 2.6, r: 0.55, life: 1.8, tilt: 0.05 });
      R.debris([p[0], 0.2, p[2]], 'rock', 14, 7, 0.22); R.ring(p, 'dust', 3.4, 0.4);
      for (let i = 0; i < 6; i++) fx.spawn({ kind: K.smoke, pal: 'dust', p: [p[0], 0.3, p[2]], v: R.dir(2.2, 0.5), s0: 0.35, s1: 1, life: 1.2, drag: 2.8, split: 0.5, alpha: 0.65 });
    });
    return true;
  }

  // Arcane Missiles: three missiles bow out sideways and curve in on the target.
  function missiles(e) {
    const T = aimed(e.x, e.z, e.dx ?? 0, e.dz ?? 1, 18, 0.8), end = T ? [T.x, 1.15, T.z] : (([x, , z]) => [x, 1.15, z])(ahead(e, 10));
    for (let i = 0; i < 3; i++) fx.after(i * 0.08, () => {
      const t0 = tip(), from = [t0[0], t0[1] - 0.1, t0[2]], side = (i - 1) * 2.2;
      const m = R.projectile(from, end, { pal: 'arcane', speed: 12, r: 0.24, trail: 45,
        onTrail: (q) => { R.lick([...q.p], 'arcane', rnd(0.3, 0.45), { v: [rnd(-0.3, 0.3), rnd(0.2, 0.8), 0], life: 0.3 }); },
        onHit: (p) => { R.flash(p, 'arcane', 1.2, 5); R.ring(p, 'arcane', 1.6, 0.25, false); R.sparks(p, 'arcane', 10, 5, { grav: 0 });
          for (let k = 0; k < 4; k++) R.lick(p, 'arcane', 0.6, { v: R.dir(2.5, 0.5), life: 0.4 }); } });
      if (!m) return;
      const base = m.tick; let prev = 0;
      m.tick = (q, dt, k, F) => { const off = side * 0.45 * Math.sin(Math.PI * k), oy = 0.5 * Math.sin(Math.PI * k); q.p[0] += off - prev; q.p[1] += oy - (q.oy || 0); q.oy = oy; prev = off; base?.(q, dt, k, F); };
    });
    return 3;
  }

  // Chain Hook: the chain flies out, coils the target and drags it back toward the staff.
  function yank(e) {
    if (!chains) return false;
    const t0 = tip(), at = [e.x, 1.0, e.z];
    chains.bind([t0[0], t0[1] - 1.0, t0[2]], () => at, { shoot: 0.18, hold: 0.7, coil: 1.6, coilR: 0.38, pal: 'dark', onLatch: () => {
      fx.after(0.3, () => {
        fx.shake(0.15);
        const to = tip();
        for (let i = 0; i < 10; i++) fx.spawn({ kind: K.spark, mode: M.vel, pal: 'dark', p: [at[0] + rnd(-0.4, 0.4), rnd(0.4, 1.5), at[2] + rnd(-0.4, 0.4)],
          v: [(to[0] - at[0]) * 2.5, 0, (to[2] - at[2]) * 2.5], s: 0.12, aspect: 0.2, life: 0.35, drag: 3, stretch: 0.1 });
      });
    } });
    return true;
  }

  // Grave Chains: rune portals open round every enemy and iron chains cage them.
  function prison(e) {
    if (!chains || !(e.pts?.length > 1)) return false;
    const s = tip();
    fx.decal({ kind: K.rune, pal: 'dark', p: [s[0], 0.03, s[2]], s: 2.4, life: 2.4, rot: 0, tick: (q, dt) => { q.rot += dt; } });
    R.flash([s[0], 0.3, s[2]], 'dark', 1.2, 4);
    e.pts.slice(1).forEach((q, i) => chains.prison(() => [q[0], 1.0, q[1]], { n: i === 0 ? 5 : 3, r: i === 0 ? 1.9 : 1.5, delay: 0.08 + i * 0.07, hold: 1.7, pal: 'dark' }));
    fx.after(0.4, () => { fx.impact?.([0.75, 0.4, 1]); fx.shake(0.25); });
    return true;
  }

  // Magma Crush: lava drops that splat and cool, geysers along the fissure, a low dust wave, rockfire on both flanks.
  function magma(e) {
    const P = [e.x, 0, e.z];
    fx.after(e.delay ?? 0, () => {
      fx.impact?.([1, 0.55, 0.2]);
      [[-1.7, 1.2], [1.8, 1.0]].forEach(([dx, dz], i) => fx.after(0.12 + i * 0.08, () => R.rockfire([P[0] + dx, 0, P[2] + dz], { r: 0.7, life: 2.6, rocks: 8 })));
      for (let i = 0; i < 18; i++) {
        const v = R.dir(rnd(5, 9), 0.85);
        fx.spawn({ kind: K.spark, mode: M.vel, pal: 'magma', p: [P[0], 0.4, P[2]], v, s: rnd(0.14, 0.24), aspect: 0.55, life: rnd(0.9, 1.4), grav: -15, drag: 0.4, stretch: 0.05, bounce: 0, floor: 0.05,
          onBounce: (q) => { q.life = q.age + 0.01; fx.decal({ kind: K.crack, pal: 'magma', p: [q.p[0], 0.03, q.p[2]], s: 0.45, life: 1.6 }); } });
      }
      fx.during(0.7, (dt, k) => {
        if (Math.random() < dt * 40 * (1 - k)) { const a = Math.random() * 6.28, r = Math.random() * 2;
          R.lick([P[0] + Math.cos(a) * r, 0.25, P[2] + Math.sin(a) * r], 'magma', rnd(0.4, 0.8), { v: [0, rnd(3, 5.5), 0], life: rnd(0.35, 0.6), aspect: 1.6 }); }
      });
      for (let i = 0; i < 10; i++) { const a = (i / 10) * 6.28;
        fx.spawn({ kind: K.smoke, pal: 'dust', p: [P[0] + Math.cos(a) * 0.8, 0.3, P[2] + Math.sin(a) * 0.8], v: [Math.cos(a) * 7, 0.4, Math.sin(a) * 7], s0: 0.35, s1: 0.9, life: 0.9, drag: 3.6, curl: 1, alpha: 0.6, delay: 0.1 }); }
    });
    return true;
  }

  // Hurricane Eye: a tornado spun off the staff walks through the enemy line, then bursts into gusts.
  function eye(e) {
    const D = Math.min(2.2, Math.max(0.8, e.life ?? 2.2)), near = foes().filter((f) => Math.hypot(f.x - e.x, f.z - e.z) < (e.r ?? 3) * 2.2).slice(0, 3);
    const path = [[e.x, e.z], ...near.map((f) => [f.x, f.z])];
    if (path.length < 2) path.push([e.x + (e.dx ?? 0) * 2, e.z + (e.dz ?? 1) * 2]);
    let tt = 0;
    const at = () => {
      const k = Math.min(1, tt / D) * (path.length - 1), i = Math.min(path.length - 2, Math.floor(k)), f = k - i;
      return [path[i][0] + (path[i + 1][0] - path[i][0]) * f, 0, path[i][1] + (path[i + 1][1] - path[i][1]) * f];
    };
    R.tornado(() => at(), D + 0.3, { h: 3.6, r0: 0.28, r1: 1.35, rate: 110 });
    fx.during(D, (dt) => { tt += dt; });
    fx.after(D, () => {
      const p = at();
      fx.impact?.([0.75, 0.9, 1]); fx.shake(0.25); R.flash([p[0], 1.2, p[2]], 'gale', 1.4, 0); R.ring(p, 'gale', 4, 0.4);
      for (let i = 0; i < 10; i++) { const a = (i / 10) * 6.28; R.gust([p[0], 1.2, p[2]], [Math.cos(a) * 9, rnd(-0.5, 1.5), Math.sin(a) * 9], { s: 0.8, life: 0.35 }); }
      R.curls?.([p[0], 1.6, p[2]], 12, { s: 0.45, sp: 2.4 });
    });
    return path.length;
  }

  // Arc Plasma: the strands snap and the last energy pops off the far end as a small burst.
  function plasmaEnd(e) {
    const L = e.len ?? 8, E = [e.x + e.dx * L, 1.15, e.z + e.dz * L], D = 0.4;
    fx.light?.([e.x + e.dx * L * 0.4, 1.2, e.z + e.dz * L * 0.4], [2.2, 1.4, 0.6], 8, 10, D + 0.2);
    fx.heat?.(E, 1.2, 0.8, D + 0.3);
    fx.after(D, () => {
      R.flash(E, 'plasma', 1.3, 6); R.sparks(E, 'plasma', 14, 6, { up: 0.6 });
      for (let i = 0; i < 4; i++) fx.spawn({ kind: K.smoke, pal: 'smoke', p: E, v: R.dir(1, 0.8), s0: 0.3, s1: 0.8, life: 1, curl: 1.3, drag: 2, alpha: 0.6, delay: 0.1 });
    });
    return true;
  }

  return { afterimages, spire, missiles, yank, prison, magma, eye, plasmaEnd, only };
}
