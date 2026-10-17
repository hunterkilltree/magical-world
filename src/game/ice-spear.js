// Conjured ice spear for the Rime Cryomancer's Water + Ice cast (Frozen Domain).
// buildIceSpear(): faceted crystal javelin — twisted shaft, barbed blade, splayed shard tail — with a painterly ice shader
// (flat facet bands, white crack seams, HDR rim for bloom) and a uGrow uniform that freezes it into being from the grip.
// conjureSpear(): forms it above the caster, holds, hurls it on an arc, buries it in the ground and shatters into the field.
import * as THREE from 'three';
import { K, M } from './fx2d.js';

const VS = `
uniform float uGrow, uLen; varying vec3 vP, vW; varying float vAx;
void main() { vP = position; vAx = position.y / uLen; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const FS = `
uniform float uGrow, uFade, uTime, uLen; uniform vec3 uC0, uC1, uC2; varying vec3 vP, vW; varying float vAx;
float h(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
vec2 vor(vec3 p) { vec3 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec3 g = vec3(float(x), float(y), float(z));
    vec3 o = vec3(h(i + g), h(i + g + 17.1), h(i + g + 31.7)); float d = length(g + o - f); if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
  return vec2(d1, d2); }
void main() {
  float front = uGrow * 0.56, ax = abs(vAx - 0.04);              // grows outward from the grip in both directions
  if (ax > front) discard;
  vec3 N = normalize(cross(dFdx(vW), dFdy(vW))), V = normalize(cameraPosition - vW);
  float f = 1.0 - abs(dot(N, V)), lit = dot(N, normalize(vec3(-0.4, 0.8, 0.3))) * 0.5 + 0.5;
  float v = lit * 0.75 + f * 0.6;
  vec3 col = v > 0.95 ? uC0 : (v > 0.6 ? uC1 : uC2);               // three flat facet bands
  vec2 F = vor(vP * vec3(14.0, 5.0, 14.0)); if (F.y - F.x < 0.05) col = mix(col, uC0, 0.75);   // crack seams
  col += uC0 * pow(f, 3.0) * 0.9;                                    // rim
  col += uC0 * 2.2 * (1.0 - smoothstep(0.0, 0.05, front - ax)) * step(uGrow, 0.999);          // white-hot freezing front
  col *= 1.0 + 0.15 * sin(uTime * 3.0 + vP.y * 6.0);
  float a = (0.72 + f * 0.28) * (1.0 - uFade);
  gl_FragColor = vec4(col * a, a);
}`;

export function buildIceSpear({ len = 2.4 } = {}) {
  const g = new THREE.Group(); g.name = 'ice_spear';
  const uniforms = { uGrow: { value: 1 }, uFade: { value: 0 }, uTime: { value: 0 }, uLen: { value: len },
    uC0: { value: new THREE.Vector3(2.6, 3.0, 3.3) }, uC1: { value: new THREE.Vector3(0.38, 1.05, 1.6) }, uC2: { value: new THREE.Vector3(0.07, 0.3, 0.72) } };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor });
  mat.name = 'ice_crystal';
  const add = (geo, name, p, r, s) => { const m = new THREE.Mesh(geo, mat); m.name = name; m.position.set(...p); if (r) m.rotation.set(...r); if (s) m.scale.set(...s); m.renderOrder = 18; g.add(m); return m; };
  const L = len, y0 = -L * 0.5;
  // Shaft: knotted, twisted crystal segments along a slight S-curve; thickest near the tail like the reference.
  const n = 7, shaftTop = L * 0.22;
  for (let i = 0; i < n; i++) {
    const k0 = i / n, k1 = (i + 1) / n, ya = y0 + L * 0.18 + (shaftTop - y0 - L * 0.18) * k0, yb = y0 + L * 0.18 + (shaftTop - y0 - L * 0.18) * k1;
    const r = 0.05 + 0.035 * Math.sin(k0 * 9) * 0.5 + (1 - k0) * 0.025, hh = yb - ya + 0.06;
    const geo = new THREE.CylinderGeometry(r * 0.85, r * 1.1, hh, 5, 1).toNonIndexed();
    add(geo, `shaft_${i}`, [Math.sin(k0 * 5.5) * 0.045, (ya + yb) / 2, Math.cos(k0 * 4) * 0.02], [Math.sin(i * 1.7) * 0.06, i * 0.9, Math.cos(i * 2.3) * 0.06]);
    if (i % 2) add(new THREE.OctahedronGeometry(r * 1.5, 0), `knot_${i}`, [Math.sin(k0 * 5.5) * 0.045, yb, 0], [0.3, i, 0.2], [1, 1.6, 1]);
  }
  // Blade: long four-sided point plus a collar of back-swept barbs.
  const blade = new THREE.ConeGeometry(0.13, L * 0.36, 4, 1); blade.translate(0, L * 0.18, 0);
  add(blade, 'blade', [0.02, shaftTop + 0.02, 0], [0, 0.4, -0.03], [1, 1, 0.55]);
  add(new THREE.OctahedronGeometry(0.15, 0), 'blade_collar', [0.02, shaftTop + 0.04, 0], [0, 0.4, 0], [1, 0.7, 0.6]);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2, b = new THREE.ConeGeometry(0.03, 0.32, 3); b.translate(0, -0.16, 0);
    add(b, `barb_${i}`, [0.02 + Math.cos(a) * 0.08, shaftTop + 0.1, Math.sin(a) * 0.05], [Math.sin(a) * 0.55, 0, -Math.cos(a) * 0.55 + Math.PI * 0.0]); }
  // Tail: splayed shards like a frozen tassel.
  for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2, s = new THREE.ConeGeometry(0.035, 0.42 + (i % 3) * 0.08, 3); s.translate(0, -0.21, 0);
    add(s, `tail_${i}`, [Math.cos(a) * 0.035, y0 + L * 0.2, Math.sin(a) * 0.035], [Math.sin(a) * 0.38, 0, -Math.cos(a) * 0.38]); }
  g.userData = { uniforms, mat, len: L };
  return g;
}

// fx: fx2d facade, R: recipes. getHand(): world [x,y,z] the spear hovers over. to: [x,0,z] impact point.
// Timeline (seconds): form 0..tForm, hold, throw over `flight`, stick, shatter. onImpact fires at touchdown.
export function conjureSpear(fx, R, scene, { getHand, to, tForm = 0.6, hold = 0.12, flight = 0.32, onImpact, scale = 1 }) {
  const sp = buildIceSpear(); sp.scale.setScalar(scale); scene.add(sp);
  const U = sp.userData.uniforms, up = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion(), d = new THREE.Vector3();
  let age = 0, from = null, done = false, stuckAt = null;
  const aimFrom = (p) => { d.set(to[0] - p[0], 0.5 - p[1], to[2] - p[2]).normalize(); return d; };
  const total = tForm + hold + flight + 1.4;
  fx.during(total, (dt) => {
    if (done) return;
    age += dt; U.uTime.value = fx.time;
    const tThrow = tForm + hold;
    if (age < tThrow) {
      // Forming: hovers above the shoulder, pointing at the target, drawn back a touch during the hold.
      const h = getHand(), dir = aimFrom(h), pull = age > tForm ? Math.min(1, (age - tForm) / hold) * 0.35 : 0, bob = Math.sin(age * 9) * 0.03;
      sp.position.set(h[0] - dir.x * (0.15 + pull) + dir.z * 0.35, h[1] + 0.05 + bob, h[2] - dir.z * (0.15 + pull) - dir.x * 0.35);
      q.setFromUnitVectors(up, d.set(to[0] - sp.position.x, 0.6 - sp.position.y, to[2] - sp.position.z).normalize()); sp.quaternion.slerp(q, 1 - Math.exp(-dt * 20));
      sp.rotateY(age * 2);
      U.uGrow.value = Math.min(1, Math.pow(age / tForm, 0.7));
      // Frost condensing onto it: mist drawn inward and glints along the length.
      if (Math.random() < dt * 60) { const k = (Math.random() - 0.5) * 2.2 * U.uGrow.value * scale, p = sp.localToWorld(new THREE.Vector3(0, k * 0.5, 0)).toArray();
        const a = Math.random() * 6.28, o = [Math.cos(a) * 0.6, Math.random() * 0.4 - 0.2, Math.sin(a) * 0.6];
        fx.spawn({ kind: K.smoke, pal: 'frost', p: [p[0] + o[0], p[1] + o[1], p[2] + o[2]], v: [-o[0] * 2.5, -o[1] * 2.5, -o[2] * 2.5], s0: 0.2, s1: 0.05, life: 0.3, drag: 1, alpha: 0.45 }); }
      if (Math.random() < dt * 25) fx.spawn({ kind: K.star, pal: 'crystal', p: sp.localToWorld(new THREE.Vector3(0, (Math.random() - 0.5) * 2.2, 0)).toArray(), s0: 0.3, s1: 0, life: 0.18, add: 0.7 });
      return;
    }
    if (!from) { from = sp.position.toArray(); fx.kick?.(0, 0, -0.08); R.flash(from, 'crystal', 0.9, 0);
      for (let i = 0; i < 6; i++) fx.spawn({ kind: K.smoke, pal: 'frost', p: [...from], v: R.dir(2, 0.2), s0: 0.15, s1: 0.45, life: 0.4, drag: 4, alpha: 0.55 }); }
    const tf = (age - tThrow) / flight;
    if (tf < 1) {
      // Flight: slight arc, nose follows the tangent, frost streams off the tail.
      const k = tf * tf * (3 - 2 * tf) * 0.4 + tf * 0.6, arc = Math.sin(Math.PI * k) * 0.45;
      const P = [from[0] + (to[0] - from[0]) * k, from[1] + (0.35 - from[1]) * k + arc, from[2] + (to[2] - from[2]) * k];
      const vel = d.set(P[0] - sp.position.x, P[1] - sp.position.y, P[2] - sp.position.z);
      if (vel.lengthSq() > 1e-6) { q.setFromUnitVectors(up, vel.normalize()); sp.quaternion.copy(q); }
      sp.position.set(...P);
      const tail = sp.localToWorld(new THREE.Vector3(0, -1.1, 0)).toArray();
      if (Math.random() < 0.45) fx.spawn({ kind: K.smoke, pal: 'frost', p: [tail[0] + Math.random() * 0.1 - 0.05, tail[1], tail[2] + Math.random() * 0.1 - 0.05], v: [0, 0.15, 0], s0: 0.14, s1: 0.4, life: 0.4, drag: 2, alpha: 0.5, curl: 1 });
      if (Math.random() < 0.6) fx.spawn({ kind: K.spark, mode: M.vel, pal: 'crystal', p: tail, v: [vel.x * -3 + Math.random() - 0.5, Math.random(), vel.z * -3 + Math.random() - 0.5], s: 0.08, aspect: 0.4, life: 0.35, grav: -6, add: 0.4 });
      return;
    }
    if (!stuckAt) {
      // Touchdown: the spear buries its point, the ground freezes outward from it.
      stuckAt = age; sp.position.set(to[0], 0.7 * scale, to[2]);
      R.flash([to[0], 0.6, to[2]], 'crystal', 1.6, 0); R.ring([to[0], 0, to[2]], 'ice', 3.2, 0.35);
      R.debris([to[0], 0.2, to[2]], 'crystal', 8, 5, 0.16);
      fx.shake(0.28); fx.chroma(0.6); fx.impact?.([0.6, 0.9, 1]);
      onImpact?.([to[0], 0, to[2]]);
    }
    const ts = age - stuckAt;
    sp.position.y = 0.7 * scale - Math.min(1, ts / 0.06) * 0.25 * scale;
    if (ts > 0.75) {
      // Shatter: fades in a flash, leaving shards and a puff of frost.
      const k = Math.min(1, (ts - 0.75) / 0.12); U.uFade.value = k;
      if (k >= 1) { R.debris(sp.position.toArray(), 'crystal', 12, 4, 0.14); R.flash(sp.position.toArray(), 'crystal', 1, 0);
        for (let i = 0; i < 6; i++) fx.spawn({ kind: K.smoke, pal: 'frost', p: sp.position.toArray(), v: R.dir(1.5, 0.4), s0: 0.4, s1: 1.1, life: 1, drag: 2.5, split: 0.5, alpha: 0.7 });
        scene.remove(sp); done = true; }
    }
  });
  return sp;
}
