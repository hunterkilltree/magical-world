// Earth-shaping meshes for the Geomancer: rock spires that burst from the floor, levitated stones, hurled boulders.
// Real flat-shaded geometry (not sprites) so silhouettes read as solid rock; dust, cracks and debris come from fx2d.
import * as THREE from 'three';
import { K, M } from './fx2d.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const MATS = [0x7a6550, 0x8f785e, 0x6a5847].map((c, i) => { const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, flatShading: true }); m.name = 'geo_rock_' + i; return m; });
const SEAM = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.15, 0.55, 0.14), toneMapped: false }); SEAM.name = 'geo_seam';

function jag(geo, amt) {
  const p = geo.attributes.position, seen = new Map();
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    if (!seen.has(k)) seen.set(k, [rnd(-amt, amt), rnd(-amt, amt) * 0.5, rnd(-amt, amt)]);
    const o = seen.get(k); p.setXYZ(i, p.getX(i) + o[0], p.getY(i) + o[1], p.getZ(i) + o[2]);
  }
  geo.computeVertexNormals(); return geo;
}
export function rockMesh(r = 0.4) {
  const m = new THREE.Mesh(jag(new THREE.DodecahedronGeometry(r, 0), r * 0.22), MATS[(Math.random() * 3) | 0]);
  m.castShadow = true; m.name = 'geo_rock'; return m;
}
function spireMesh(h, r) {
  const g = new THREE.Group(); g.name = 'geo_spire';
  const main = new THREE.Mesh(jag(new THREE.ConeGeometry(r, h, 5, 3), r * 0.18), MATS[(Math.random() * 3) | 0]);
  main.position.y = h / 2; main.rotation.y = Math.random() * 6; g.add(main);
  // A glowing seam up one face: the earth's heat showing through the break.
  const seam = new THREE.Mesh(new THREE.ConeGeometry(r * 0.08, h * 0.5, 3), SEAM); seam.position.set(r * 0.4, h * 0.22, 0); seam.rotation.z = 0.18; main.add(seam);
  for (let i = 0; i < 2; i++) { const s = new THREE.Mesh(jag(new THREE.ConeGeometry(r * 0.5, h * rnd(0.35, 0.55), 4), r * 0.1), MATS[i]);
    const a = Math.random() * 6.28; s.position.set(Math.cos(a) * r * 0.8, h * 0.18, Math.sin(a) * r * 0.8); s.rotation.set(Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4); g.add(s); }
  return g;
}

export function createEarth(fx, R, scene) {
  // Spire: erupts with overshoot, holds, then sinks back crumbling.
  function spire(p, { h = 1.6, r = 0.36, delay = 0, life = 1.8, tilt = 0.18, dir = null } = {}) {
    fx.after(delay, () => {
      const m = spireMesh(h, r); m.position.set(p[0], -h, p[2]);
      const a = dir ? Math.atan2(dir[0], dir[2]) : Math.random() * 6.28;
      m.rotation.set(Math.cos(a) * tilt, Math.random() * 6, -Math.sin(a) * tilt); scene.add(m);
      fx.decal({ kind: K.crack, pal: 'earth', p: [p[0], 0.03, p[2]], s: r * 4.5, life: life + 1.2 });
      R.debris([p[0], 0.1, p[2]], 'rock', 4, 4.5, 0.12);
      for (let i = 0; i < 2; i++) fx.spawn({ kind: K.smoke, pal: 'dust', p: [p[0], 0.2, p[2]], v: R.dir(1.6, 0.3), s0: 0.25, s1: 0.7, life: 0.7, drag: 3, alpha: 0.6 });
      let t = 0;
      fx.during(life + 0.5, (dt) => {
        t += dt;
        const up = t < 0.09 ? 1 - Math.pow(1 - t / 0.09, 3) : 1 + Math.sin(Math.min(1, (t - 0.09) / 0.18) * Math.PI) * 0.06 * Math.exp(-(t - 0.09) * 10);
        const down = Math.max(0, (t - life) / 0.45);
        m.position.y = -h + h * up - h * down * down;
        if (t > life && Math.random() < dt * 25) R.debris([p[0], h * 0.5 * (1 - down), p[2]], 'rock', 1, 2, 0.1);
        if (t >= life + 0.45) scene.remove(m);
      });
    });
  }
  // Rocks lifted from the floor to orbit the caster; returns a handle that can hurl them.
  function orbit(getC, n = 6, { r = 0.9, y = 1.2, dur = 1 } = {}) {
    const rocks = Array.from({ length: n }, (_, i) => { const m = rockMesh(rnd(0.1, 0.18)); const a = (i / n) * 6.28; const c = getC();
      m.position.set(c[0] + Math.cos(a) * r, 0.05, c[2] + Math.sin(a) * r); scene.add(m);
      fx.spawn({ kind: K.smoke, pal: 'dust', p: m.position.toArray(), v: [0, 0.5, 0], s0: 0.2, s1: 0.5, life: 0.6, drag: 3, alpha: 0.6 });
      return { m, a, k: rnd(0.8, 1.2), free: false }; });
    let t = 0;
    fx.during(dur, (dt) => { t += dt; const c = getC();
      for (const o of rocks) { if (o.free) continue; o.a += dt * 2.4 * o.k;
        const lift = Math.min(1, t / 0.3), tx = c[0] + Math.cos(o.a) * r, tz = c[2] + Math.sin(o.a) * r, ty = 0.05 + (y + Math.sin(o.a * 2) * 0.12 - 0.05) * (1 - Math.pow(1 - lift, 3));
        o.m.position.lerp(new THREE.Vector3(tx, ty, tz), 1 - Math.exp(-dt * 14)); o.m.rotation.x += dt * 2; o.m.rotation.y += dt * 3; } });
    return {
      hurl(to, { speed = 18, spread = 0.6, onHit } = {}) {
        rocks.forEach((o, i) => fx.after(i * 0.03, () => { o.free = true;
          const T = [to[0] + rnd(-spread, spread), 0.15, to[2] + rnd(-spread, spread)];
          throwRock(o.m, T, { speed, onHit: (p) => { R.debris(p, 'rock', 4, 4, 0.12); fx.spawn({ kind: K.smoke, pal: 'dust', p, v: [0, 0.8, 0], s0: 0.3, s1: 0.8, life: 0.7, drag: 3 }); onHit?.(p); } }); }));
      },
      drop() { rocks.forEach((o) => { o.free = true; fx.during(0.5, (dt) => { o.m.position.y = Math.max(0.05, o.m.position.y - dt * 6); }); fx.after(0.6, () => scene.remove(o.m)); }); }
    };
  }
  // Ballistic toss of a mesh to a ground point, spinning; removes the mesh on impact.
  function throwRock(m, to, { speed = 14, arc = 1, onHit } = {}) {
    const a = m.position.clone(), b = new THREE.Vector3(...to), L = a.distanceTo(b), T = Math.max(0.15, L / speed);
    const H = arc * Math.min(2.2, L * 0.18); let t = 0;
    const spin = new THREE.Vector3(rnd(4, 9), rnd(-3, 3), rnd(-3, 3));
    fx.during(T + 0.02, (dt) => { if (t > T) return; t += dt; const k = Math.min(1, t / T);
      m.position.lerpVectors(a, b, k); m.position.y += Math.sin(Math.PI * k) * H;
      m.rotation.x += spin.x * dt; m.rotation.y += spin.y * dt; m.rotation.z += spin.z * dt;
      if (Math.random() < 0.5) fx.spawn({ kind: K.smoke, pal: 'dust', p: m.position.toArray(), v: [0, 0.2, 0], s0: 0.12, s1: 0.35, life: 0.4, drag: 2, alpha: 0.5 });
      if (k >= 1) { scene.remove(m); onHit?.(to); } });
  }
  // Boulder ripped up from the floor in front of the caster, held, then hurled.
  function boulder(at, to, { r = 0.55, rise = 0.35, hold = 0.12, onHit } = {}) {
    const m = rockMesh(r); m.scale.set(1, 0.85, 1.1); m.position.set(at[0], -r, at[2]); scene.add(m);
    fx.decal({ kind: K.crack, pal: 'earth', p: [at[0], 0.03, at[2]], s: r * 4, life: 2.5 });
    R.debris([at[0], 0.1, at[2]], 'rock', 7, 4, 0.12);
    for (let i = 0; i < 6; i++) fx.spawn({ kind: K.smoke, pal: 'dust', p: [at[0], 0.2, at[2]], v: R.dir(1.8, 0.4), s0: 0.35, s1: 1, life: 0.9, drag: 3, alpha: 0.7 });
    let t = 0;
    fx.during(rise + hold, (dt) => { t += dt; const k = Math.min(1, t / rise); m.position.y = -r + (r + 1.4) * (1 - Math.pow(1 - k, 3)) + (t > rise ? Math.sin(t * 30) * 0.015 : 0); m.rotation.y += dt * 1.5;
      if (Math.random() < dt * 30) fx.spawn({ kind: K.spark, mode: M.vel, pal: 'rock', p: [m.position.x + rnd(-r, r) * 0.6, m.position.y - r * 0.6, m.position.z + rnd(-r, r) * 0.6], v: [0, -2, 0], s: 0.07, aspect: 0.6, life: 0.4, grav: -10 }); });
    fx.after(rise + hold, () => { fx.kick?.(0, 0, -0.1); throwRock(m, to, { speed: 13, arc: 0.8, onHit }); });
    return m;
  }
  // Ground wave: a line of spires marching out along a direction.
  function rupture(from, dir, { n = 8, step = 0.75, h0 = 0.9, h1 = 2, every = 0.045, life = 1.6 } = {}) {
    for (let i = 0; i < n; i++) { const k = i / (n - 1), side = (i % 2 ? 1 : -1) * rnd(0.1, 0.35), d = 0.8 + i * step;
      const p = [from[0] + dir[0] * d + dir[2] * side, 0, from[2] + dir[2] * d - dir[0] * side];
      spire(p, { h: h0 + (h1 - h0) * k * rnd(0.85, 1.1), r: 0.26 + k * 0.18, delay: i * every, life: life - i * every * 0.5, dir });
      if (i % 2 === 0) fx.after(i * every, () => fx.shake(0.05)); }
  }
  // Spire ring: a crown of rock closing round a point (arena earth zones).
  function ring(c, r, n = 9, o = {}) {
    for (let i = 0; i < n; i++) { const a = (i / n) * 6.28 + rnd(-0.1, 0.1);
      spire([c[0] + Math.cos(a) * r, 0, c[2] + Math.sin(a) * r], { h: rnd(0.9, 1.4) * (o.h ?? 1), r: 0.28, delay: (o.delay ?? 0) + i * 0.015, life: o.life ?? 1.8, dir: [-Math.cos(a), 0, -Math.sin(a)], tilt: 0.3 }); }
  }
  return { spire, orbit, throwRock, boulder, rupture, ring };
}
