// Binding chains ("Xiềng Xích Trói Buộc"): real iron link meshes that burst from rune portals in the floor,
// lash out to the target along a whipping curve, coil round it, tighten, hold, then shatter into glowing links.
// Links are one InstancedMesh per chain (alternating 90° twists); runes, sparks and dust are fx2d sprites/decals.
import * as THREE from 'three';
import { K, M, PAL } from './fx2d.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const LINK = (() => { const g = new THREE.TorusGeometry(0.075, 0.022, 6, 12); g.scale(1, 1.55, 1); return g; })();
const IRON = new THREE.MeshStandardMaterial({ color: 0x3a3442, roughness: 0.45, metalness: 0.85, emissive: new THREE.Color(0.55, 0.12, 0.95), emissiveIntensity: 0.6 });
IRON.name = 'chain_iron';
const SPACING = 0.15;

export function createChains(fx, R, scene) {
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
  const Y = new THREE.Vector3(0, 1, 0), _t = new THREE.Vector3();

  // One chain from an anchor on the floor to a target body. getT() → [x,y,z] of the target's chest.
  function bind(anchor, getT, { delay = 0, shoot = 0.22, hold = 1.6, pal = 'dark', coil = 2.2, coilR = 0.42, onLatch } = {}) {
    const N = 64, mesh = new THREE.InstancedMesh(LINK, IRON, N); mesh.name = 'chain_links'; mesh.count = 0; mesh.frustumCulled = false; scene.add(mesh);
    const P = PAL[pal] ?? pal, A = new THREE.Vector3(anchor[0], 0.02, anchor[2]);
    const pts = [];
    let t = -delay, latched = false, gone = false;
    fx.after(delay, () => {
      fx.decal({ kind: K.rune, pal, p: [A.x, 0.03, A.z], s: 1.3, life: shoot + hold + 0.6, rot: Math.random() * 6, tick: (q, dt) => { q.rot += dt * 2.5; } });
      fx.decal({ kind: K.crack, pal, p: [A.x, 0.03, A.z], s: 1.1, life: shoot + hold + 1 });
      R.flash([A.x, 0.25, A.z], pal, 0.7, 0);
      R.debris([A.x, 0.1, A.z], 'rock', 3, 3, 0.1);
    });
    const total = delay + shoot + hold + 0.4;
    fx.during(total, (dt) => {
      if (gone) return;
      t += dt; if (t < 0) return;
      const T = getT(), Tv = _t.set(T[0], T[1], T[2]);
      // Path: rises from the portal, whips over in an arc, then wraps the target as a tightening helix.
      const reach = Math.min(1, t / shoot), whip = (1 - reach) * Math.sin(t * 40) * 0.25;
      const d = Tv.clone().sub(A), L = d.length(), side = new THREE.Vector3(-d.z, 0, d.x).normalize();
      const tighten = latched ? Math.max(0, 1 - (t - shoot) / 0.18) : 1, rr = coilR * (0.75 + 0.5 * tighten);
      pts.length = 0;
      const nLine = Math.max(2, Math.floor((L * 1.15 * reach) / SPACING));
      for (let i = 0; i <= nLine; i++) { const k = (i / Math.max(1, nLine)) * reach;
        const p = A.clone().addScaledVector(d, k); p.y += Math.sin(Math.PI * k) * (0.6 + L * 0.12) * (1 - (latched ? 0.6 : 0)) + Math.sin(k * 9 + t * 20) * whip * k;
        p.addScaledVector(side, Math.sin(k * Math.PI * 2) * 0.18 * (1 - reach * 0.6));
        pts.push(p); }
      if (reach >= 1) {
        if (!latched) { latched = true; onLatch?.(T); R.flash(T, pal, 0.9, 0); R.sparks(T, pal, 10, 5, { up: 0.4, life: 0.4, s: 0.09 }); fx.shake(0.12); }
        const turns = coil * Math.min(1, (t - shoot) / 0.12 + 0.3), nC = Math.floor((turns * 6.283 * rr) / SPACING), a0 = Math.atan2(d.z, d.x) + Math.PI;
        for (let i = 0; i < nC; i++) { const k = i / Math.max(1, nC), a = a0 + k * turns * 6.283;
          pts.push(new THREE.Vector3(T[0] + Math.cos(a) * rr, T[1] + 0.45 - k * 1.05, T[2] + Math.sin(a) * rr)); }
      }
      // Lay links along the polyline; alternate twist so they read as interlocked.
      let n = 0;
      for (let i = 1; i < pts.length && n < N; i++) {
        const a = pts[i - 1], b = pts[i]; _p.copy(a).add(b).multiplyScalar(0.5);
        _q.setFromUnitVectors(Y, _t.copy(b).sub(a).normalize()); _q2.setFromAxisAngle(Y, (i % 2) * Math.PI / 2); _q.multiply(_q2);
        const sc = Math.min(1, (pts.length - i) / 3 + 0.4); _s.setScalar(sc);
        mesh.setMatrixAt(n++, _m.compose(_p, _q, _s));
      }
      mesh.count = n; mesh.instanceMatrix.needsUpdate = true;
      IRON.emissiveIntensity = 0.5 + 0.35 * Math.sin(fx.time * 6);
      if (latched && Math.random() < dt * 14) { const p = pts[(Math.random() * pts.length) | 0];
        fx.spawn({ kind: K.smoke, pal: 'smoke', p: p.toArray(), v: [0, 0.6, 0], s0: 0.12, s1: 0.4, life: 0.6, drag: 2, alpha: 0.55, curl: 1.5 });
        if (Math.random() < 0.4) fx.spawn({ kind: K.star, pal, p: p.toArray(), s0: 0.22, s1: 0, life: 0.15, add: 0.7 }); }
      if (t >= shoot + hold) {
        // Shatter: every few links become a spinning shard; a burst of void at the target.
        for (let i = 0; i < pts.length; i += 3) fx.spawn({ kind: K.shard, pal, p: pts[i].toArray(), v: R.dir(rnd(2, 4), 0.6), s: 0.11, life: rnd(0.5, 0.8), grav: -12, spin: rnd(-14, 14), bounce: 0.3, floor: 0.05 });
        R.flash(T, pal, 1, 0); R.ring([T[0], 0, T[2]], pal, 1.6, 0.25);
        scene.remove(mesh); mesh.dispose(); gone = true;
      }
    });
  }

  // Several chains from portals ringed round the target (signature / area binds).
  function prison(getT, { n = 4, r = 2.2, delay = 0, hold = 1.6, pal = 'dark', onLatch } = {}) {
    const T = getT(), a0 = Math.random() * 6.28;
    for (let i = 0; i < n; i++) { const a = a0 + (i / n) * 6.283 + rnd(-0.2, 0.2);
      bind([T[0] + Math.cos(a) * r, 0, T[2] + Math.sin(a) * r], getT, { delay: delay + i * 0.05, hold: hold - i * 0.05, pal, coil: 1.6 + (i % 2) * 0.6, coilR: 0.36 + (i % 3) * 0.05, onLatch: i === 0 ? onLatch : null }); }
    fx.after(delay, () => fx.decal({ kind: K.rune, pal, p: [T[0], 0.03, T[2]], s: r * 2.3, life: hold + 0.6, rot: 0, alpha: 0.75, tick: (q, dt) => { q.rot -= dt * 0.6; } }));
  }
  return { bind, prison };
}
