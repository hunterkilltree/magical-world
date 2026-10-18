// Painterly 2D-FX layer, after Gilland's Elemental Magic. Every effect is a hard-edged, hand-drawn-looking shape:
// flat colour bands (hot core → mid → dark rim) instead of soft gradients, noise-eroded silhouettes that break apart
// as they die, and HDR cores that drive bloom. One instanced sprite pool + one ground-decal pool, own post chain
// (bloom, heat haze, chromatic split, impact frames), dynamic lights and a trauma camera shake. No addons needed.
import * as THREE from 'three';

export const PAL = {
  fire:      [[3.6, 3.0, 1.9], [2.6, 1.35, 0.3], [1.5, 0.42, 0.06]],
  blast:     [[4.6, 4.3, 3.6], [3.6, 2.8, 1.5], [2.5, 1.2, 0.25]],
  char:      [[2.4, 0.8, 0.15], [0.09, 0.06, 0.05], [0.05, 0.035, 0.03]],
  rock:      [[0.6, 0.45, 0.3], [0.3, 0.21, 0.13], [0.12, 0.08, 0.05]],
  magma:     [[2.4, 1.35, 0.4], [1.35, 0.3, 0.04], [0.2, 0.045, 0.035]],
  smoke:     [[1.6, 0.42, 0.06], [0.12, 0.095, 0.105], [0.045, 0.035, 0.045]],
  dust:      [[0.7, 0.58, 0.42], [0.36, 0.3, 0.24], [0.17, 0.14, 0.13]],
  earth:     [[0.8, 0.64, 0.44], [0.34, 0.26, 0.19], [0.14, 0.1, 0.08]],
  water:     [[1.7, 2.1, 2.3], [0.18, 0.7, 1.35], [0.03, 0.15, 0.42]],
  ice:       [[2.2, 2.5, 2.7], [0.4, 0.9, 1.25], [0.12, 0.32, 0.65]],
  icefield:  [[1.1, 1.35, 1.55], [0.26, 0.5, 0.72], [0.13, 0.27, 0.46]],
  frost:     [[1.2, 1.4, 1.6], [0.5, 0.62, 0.74], [0.26, 0.36, 0.5]],
  light:     [[2.5, 2.3, 1.6], [1.6, 1.1, 0.3], [0.65, 0.3, 0.06]],
  lightning: [[3.2, 3.1, 3.7], [1.5, 1.1, 3.0], [0.6, 0.25, 1.4]],
  mist:      [[2.0, 2.2, 2.4], [0.9, 0.96, 1.02], [0.55, 0.64, 0.76]],
  crystal:   [[2.2, 2.7, 3.1], [0.3, 0.72, 1.55], [0.08, 0.26, 0.8]],
  sheet:     [[1.9, 2.2, 2.5], [0.3, 0.62, 1.15], [0.16, 0.38, 0.85]],
  wind:      [[1.2, 1.45, 1.4], [0.5, 0.66, 0.62], [0.24, 0.34, 0.34]],
  gale:      [[2.4, 2.7, 2.8], [0.8, 1.08, 1.25], [0.3, 0.46, 0.68]],
  galedark:  [[1.5, 1.7, 1.85], [0.46, 0.55, 0.64], [0.2, 0.25, 0.32]],
  arcane:    [[2.4, 1.9, 2.8], [1.05, 0.3, 1.75], [0.24, 0.05, 0.46]],
  plasma:    [[2.8, 2.6, 2.2], [1.85, 0.85, 0.15], [0.75, 0.1, 0.3]],
  dark:      [[1.1, 0.45, 1.8], [0.3, 0.06, 0.55], [0.05, 0.01, 0.09]],
  nature:    [[1.4, 2.0, 0.5], [0.3, 0.85, 0.14], [0.07, 0.24, 0.05]]
};
// Sprite kinds (fragment shader branches).
export const K = { flame: 0, smoke: 1, spark: 2, star: 3, ring: 4, crack: 5, icefield: 6, rune: 7, shard: 8, spike: 9, beam: 10, bolt: 11, billow: 12, scorch: 13, strand: 14, sheet: 15, arc: 16 };
// Orientation modes: billboard, flat on ground, billboard aligned to velocity, upright (spins on Y only), world axis = vel.
export const M = { bill: 0, ground: 1, vel: 2, up: 3, axis: 4 };

const VERT = `
attribute vec3 iPos, iVel, iC0, iC1, iC2; attribute vec4 iXf, iA, iV;
varying vec2 vUv; varying vec4 vA, vV; varying vec3 vC0, vC1, vC2; varying float vDepth;
void main() {
  vUv = position.xy; vA = iA; vV = iV; vC0 = iC0; vC1 = iC1; vC2 = iC2;
  vec2 c = position.xy * iXf.xy; float m = iXf.w, r = iXf.z; vec4 mv;
  if (m < 0.5 || (m > 1.5 && m < 2.5)) {
    if (m > 1.5) { vec3 vv = (viewMatrix * vec4(iVel, 0.0)).xyz; r += atan(vv.y, vv.x + 1e-6); }
    float s = sin(r), co = cos(r); c = vec2(co * c.x - s * c.y, s * c.x + co * c.y);
    mv = viewMatrix * vec4(iPos, 1.0); mv.xy += c;
  } else if (m < 1.5) {
    float s = sin(r), co = cos(r);
    mv = viewMatrix * vec4(iPos + vec3(co * c.x - s * c.y, 0.0, s * c.x + co * c.y), 1.0);
  } else if (m < 3.5) {
    vec3 R = vec3(viewMatrix[0][0], 0.0, viewMatrix[2][0]); R = normalize(R + vec3(1e-5, 0.0, 0.0));
    mv = viewMatrix * vec4(iPos + R * c.x + vec3(0.0, c.y, 0.0), 1.0);
  } else {
    vec3 ax = normalize(iVel + vec3(0.0, 1e-5, 0.0)); vec3 sd = normalize(cross(ax, cameraPosition - iPos));
    mv = viewMatrix * vec4(iPos + ax * c.x + sd * c.y, 1.0);
  }
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = `
uniform float uTime, uNear;
varying vec2 vUv; varying vec4 vA, vV; varying vec3 vC0, vC1, vC2; varying float vDepth;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { return vn(p) * 0.55 + vn(p * 2.03 + 7.1) * 0.3 + vn(p * 4.1 + 3.7) * 0.15; }
vec2 vor(vec2 p) { vec2 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 g = vec2(float(x), float(y));
    vec2 o = vec2(h(i + g), h(i + g + 19.3)); float d = length(g + o - f);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
  return vec2(d1, d2); }
vec3 band3(float v, float b1, float b2) { return v > b2 ? vC0 : (v > b1 ? vC1 : vC2); }
void main() {
  vec2 uv = vUv; float t = vA.x, sd = vA.y, k = vA.z, bias = vA.w, AA = 0.035;
  float r = length(uv) * 2.0, a = 0.0; vec3 col = vC1;
  if (k < 0.5) {                       // flame tongue: noise-eroded blob, three flat bands, hot core low
    float n = fbm(uv * 2.6 + vec2(sd * 13.0, sd * 7.0 - uTime * 1.7 - t * 2.2));
    float d = 1.0 - r + (n - 0.5) * 1.05, e = pow(t, 1.25) * 1.05 + bias;
    a = smoothstep(e, e + AA, d);
    col = band3(d - e - uv.y * 0.18, 0.16, 0.44);
  } else if (k < 1.5) {                // smoke: two-tone cel shade lit from upper left, ember underglow while young
    float n = fbm(uv * 2.2 + vec2(sd * 11.0, sd * 5.0 - t * 1.3));
    float d = 1.0 - r + (n - 0.5) * 0.95, e = pow(t, 1.6) + bias;
    a = smoothstep(e, e + AA, d);
    float lit = d - e + dot(uv, vec2(-0.55, 0.75)) * 0.9;
    col = lit > 0.34 ? vC1 : vC2;
    float heat = 1.0 - smoothstep(0.0, 0.4, t);
    if (heat * (0.35 - uv.y) * (d - e) > 0.1) col = vC0;
  } else if (k < 2.5) {                // spark / droplet: teardrop along x, thin tail
    float w = mix(0.14, 1.0, smoothstep(-0.5, 0.35, uv.x));
    float d = 1.0 - length(vec2(uv.x * 2.0, uv.y * 2.0 / w)), e = t * 0.7 + bias;
    a = smoothstep(e, e + 0.05, d); col = band3(d - e, 0.1, 0.32);
  } else if (k < 3.5) {                // star flash: 4/6/8 sharp points, white core
    float an = atan(uv.y, uv.x) + sd * 6.283, pts = 4.0 + floor(mod(sd * 10.0, 3.0)) * 2.0;
    float edge = 0.2 + 0.8 * pow(abs(cos(an * pts * 0.5)), 16.0), d = edge - r, e = t * 0.2 + bias;
    a = smoothstep(e, e + 0.03, d); col = r < edge * 0.42 ? vC0 : vC1;
  } else if (k < 4.5) {                // shock ring: thins and breaks into dashes as it dies
    float n = fbm(uv * 5.0 + sd * 9.0), w = mix(0.24, 0.025, t);
    float d = w - abs(r - 0.84) + (n - 0.5) * 0.1;
    a = smoothstep(0.0, 0.02, d) * step(t * 0.95, n + 0.3); col = d > w * 0.45 ? vC0 : vC1;
  } else if (k < 5.5) {                // ground crack: voronoi fissures glowing, then cooling to char
    float n = fbm(uv * 4.0 + sd * 5.0), reach = 1.0 - r + (n - 0.5) * 0.55;
    vec2 F = vor(uv * 6.5 + sd * 31.0); float ed = F.y - F.x;
    float wd = 0.015 + 0.07 * reach, mask = step(0.42, fbm(uv * 3.2 + sd * 13.0) + reach * 0.35);
    float crack = (1.0 - smoothstep(wd, wd + 0.02, ed)) * step(0.0, reach) * mask;
    float scorch = smoothstep(0.0, 0.06, reach - 0.18) * 0.72, glow = 1.0 - smoothstep(0.0, 0.75, t);
    float hot = glow * (1.2 - r);
    col = crack > 0.5 ? (hot > 0.55 ? vC0 : (hot > 0.12 ? vC1 : vC2 * 0.7)) : vC2 * 0.55;
    a = max(crack, scorch) * step(smoothstep(0.72, 1.0, t), n * 0.8 + reach * 0.4);
  } else if (k < 6.5) {                // ice field: faceted cells grow outward, white seams
    float n = fbm(uv * 3.0 + sd * 3.0), grow = smoothstep(0.0, 0.12, t) * 1.05;
    vec2 F = vor(uv * 5.0 + sd * 17.0); float ed = F.y - F.x, reach = grow - r + (n - 0.5) * 0.35;
    a = step(0.0, reach) * 0.88 * step(smoothstep(0.78, 1.0, t), n + 0.04);
    col = ed < 0.05 ? vC0 : (F.x + uv.x * 0.3 < 0.3 ? vC1 : vC2);
    if (reach < 0.022) col = vC0;
  } else if (k < 7.5) {                // rune circle: draws itself on by angle, then erodes
    float an = atan(uv.y, uv.x), L = 0.0;
    L += 1.0 - step(0.022, abs(r - 0.94)); L += 1.0 - step(0.014, abs(r - 0.78)); L += 1.0 - step(0.016, abs(r - 0.3));
    L += (1.0 - step(0.06, abs(r - 0.86))) * step(0.86, abs(cos(an * 12.0)));
    for (int i = 0; i < 2; i++) { float off = float(i) * 1.0472;
      float rt = 0.5 / cos(mod(an + off, 2.0944) - 1.0472) * 0.78; L += 1.0 - step(0.014, abs(r - rt)); }
    float draw = step((an + 3.1416) / 6.2832, smoothstep(0.0, 0.18, t) * 1.01);
    float n = fbm(uv * 6.0 + sd * 4.0), live = step(smoothstep(0.75, 1.0, t), n);
    a = max(min(L, 1.0), 0.16 * step(r, 0.94)) * draw * live * step(r, 1.0);
    col = L > 0.5 ? vC0 : vC1;
  } else if (k < 8.5) {                // shard: two-tone diamond with a lit edge
    vec2 p = uv * 2.0; float d = 1.0 - abs(p.x) - abs(p.y), e = t * t * 0.8 + bias;
    a = smoothstep(e, e + 0.04, d);
    col = p.x < -p.y * 0.2 ? vC1 : vC2; if (d - e < 0.16 && p.x < 0.0 && p.y > 0.0) col = vC0;
  } else if (k < 9.5) {                // spike: upright triangle, facet split, white leading edge
    float y = uv.y + 0.5, hw = 0.5 * pow(max(0.0, 1.0 - y), 0.85), d = hw - abs(uv.x + (y - 0.5) * 0.06);
    a = step(0.0, d) * step(bias, y);
    col = uv.x < 0.0 ? vC1 : vC2; if (d < 0.05 && uv.x < 0.0) col = vC0;
  } else if (k < 10.5) {               // beam body: ragged scrolling stream, tapered ends
    float len = vV.z;
    float n = fbm(vec2(uv.x * len * 1.3 - uTime * 10.0, uv.y * 3.0 + sd * 7.0));
    float d = 1.0 - abs(uv.y) * 2.0 + (n - 0.5) * 0.95 - (1.0 - smoothstep(0.5, 0.44, abs(uv.x)));
    float e = pow(t, 2.2) * 1.1 + bias;
    a = smoothstep(e, e + AA, d); col = band3(d - e, 0.2, 0.52);
  } else if (k > 11.5 && k < 12.5) {   // billow: cauliflower fireball, lit top-left, white-hot core that blows out under bloom
    float an = atan(uv.y, uv.x), lobe = sin(an * 5.0 + sd * 21.0) * 0.07 + sin(an * 9.0 - sd * 13.0) * 0.04;
    float n = fbm(uv * 1.9 + vec2(sd * 17.0, sd * 9.0 - t * 0.9)), n2 = vn(uv * 5.0 + sd * 5.0);
    float d = 1.0 - r + lobe + (n - 0.5) * 0.6 + (n2 - 0.5) * 0.22, e = pow(t, 1.7) * 1.1 + bias;
    a = smoothstep(e, e + 0.07, d);
    float v = d - e + dot(uv, vec2(-0.32, 0.42)) * 0.55;
    col = mix(vC2, vC1, smoothstep(0.03, 0.15, v)); col = mix(col, vC0, smoothstep(0.2, 0.36, v));
  } else if (k > 12.5 && k < 13.5) {   // scorch: char with radial blast streaks, embers that die out
    float an = atan(uv.y, uv.x), n = fbm(uv * 3.0 + sd * 7.0);
    float streak = vn(vec2(an * 6.0 + sd * 30.0, sd)) * 0.7 + vn(vec2(an * 17.0 + sd * 11.0, 2.0)) * 0.3;
    float reach = 0.42 + streak * 0.55 - r + (n - 0.5) * 0.28;
    a = smoothstep(0.0, 0.14, reach) * 0.85 * step(smoothstep(0.7, 1.0, t), n + reach * 0.6);
    col = (1.0 - smoothstep(0.0, 0.45, t)) * step(0.6, n) * step(0.22, reach) > 0.5 ? vC0 : (reach > 0.25 ? vC2 : vC1);
  } else if (k > 13.5 && k < 14.5) {   // strand: steady glowing filament, white core, coloured halo
    float d = 1.0 - abs(uv.y) * 2.0, e = t * 0.35 + bias;
    a = smoothstep(e, e + 0.18, d); col = d > 0.7 ? vC0 : (d > 0.38 ? vC1 : vC2);
  } else if (k > 14.5 && k < 15.5) {   // sheet: frost cone laid on the ground, jagged edges, grows outward from the caster
    float x = uv.x + 0.5, hw = mix(0.14, 0.5, x), jag = (vn(vec2(uv.x * 22.0 + sd * 10.0, sign(uv.y))) - 0.5) * 0.16 + abs(fract(uv.x * 14.0) - 0.5) * 0.06;
    float d = hw + jag - abs(uv.y), grow = smoothstep(0.0, 0.14, t);
    vec2 F = vor(uv * vec2(9.0, 4.0) + sd * 9.0); float n = fbm(uv * 5.0 + sd * 3.0);
    a = smoothstep(0.0, 0.015, d) * step(x, grow) * 0.85 * step(smoothstep(0.72, 1.0, t), n + x * 0.25);
    col = d < 0.035 || grow - x < 0.03 ? vC0 : (F.y - F.x < 0.06 ? vC0 * 0.8 : (F.x < 0.32 ? vC1 : vC2));
  } else if (k > 15.5 && k < 16.5) {   // arc: tapered wind crescent that curls into a hook at its head (hurricane sigil stroke)
    vec2 p = uv * 2.0; float rr = length(p), an = atan(p.y, p.x);
    float span = 0.62 + bias, s = (an + 3.14159) / 6.28318 / span;
    float rc = 0.78 - 0.42 * pow(clamp(s, 0.0, 1.0), 3.0), w = 0.2 * pow(clamp(s, 0.0, 1.0), 0.55) * (1.0 - 0.75 * smoothstep(0.82, 1.0, s));
    float n = fbm(vec2(s * 6.0 - uTime * 2.0, sd * 9.0));
    float d = w - abs(rr - rc) + (n - 0.5) * 0.05;
    float grow = smoothstep(0.0, 0.28, t) * 1.02, tail = (t - 0.35) * 1.55 + (n - 0.5) * 0.15;
    a = smoothstep(0.0, 0.025, d) * step(s, grow) * step(tail, s) * step(s, 1.0);
    col = d > w * 0.55 ? vC0 : (d > w * 0.2 ? vC1 : vC2);
  } else {                             // bolt segment: flickering capsule
    float d = 1.0 - abs(uv.y) * 2.0, e = t * 0.6 + bias;
    a = smoothstep(e, e + 0.06, d) * step(0.18, h(vec2(floor(uTime * 32.0), sd)));
    col = d - e > 0.5 ? vC0 : vC1;
  }
  a *= vV.x * smoothstep(uNear * 0.4, uNear, vDepth);   // fade sprites that drift into the lens
  if (a < 0.004) discard;
  gl_FragColor = vec4(col * a, a * (1.0 - vV.y));
}`;

const rnd = (a, b) => a + Math.random() * (b - a);
const easeOut = (t, p = 2) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), p);

class Pool {
  constructor(scene, max, order, depthWrite = false) {
    this.max = max; this.list = [];
    const g = new THREE.InstancedBufferGeometry();
    const q = new THREE.PlaneGeometry(1, 1);
    g.index = q.index; g.setAttribute('position', q.attributes.position);
    const A = (name, n) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(max * n), n).setUsage(THREE.DynamicDrawUsage); g.setAttribute(name, a); return a; };
    this.a = { pos: A('iPos', 3), vel: A('iVel', 3), xf: A('iXf', 4), st: A('iA', 4), v: A('iV', 4), c0: A('iC0', 3), c1: A('iC1', 3), c2: A('iC2', 3) };
    g.instanceCount = 0; this.geo = g;
    this.mat = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uNear: { value: 3.5 } }, vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite, depthTest: true, blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(g, this.mat); mesh.frustumCulled = false; mesh.renderOrder = order;
    scene.add(mesh); this.mesh = mesh;
  }
  add(o) { if (this.list.length >= this.max) this.list.shift(); this.list.push(o); return o; }
  update(dt, cam, time, fx) {
    this.mat.uniforms.uTime.value = time;
    const L = this.list, cp = cam.position, cd = cam.getWorldDirection(_v);
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      p.age += dt;
      if (p.delay > 0) { p.delay -= dt; p.age = 0; continue; }
      const t = p.age / p.life;
      if (p.split && !p.didSplit && t >= p.split) { p.didSplit = true; fx._split(p); }
      if (t >= 1) { L.splice(i, 1); p.onDie?.(p, fx); continue; }
      const dr = Math.exp(-p.drag * dt);
      p.v[0] *= dr; p.v[1] *= dr; p.v[2] *= dr; p.v[1] += p.grav * dt;
      if (p.curl) { const ph = p.age * p.curlF + p.seed * 9; p.v[0] += Math.sin(ph) * p.curl * dt; p.v[2] += Math.cos(ph * 0.8) * p.curl * dt; p.v[1] += Math.sin(ph * 1.3) * p.curl * 0.4 * dt; }
      p.p[0] += p.v[0] * dt; p.p[1] += p.v[1] * dt; p.p[2] += p.v[2] * dt;
      if (p.bounce != null && p.p[1] < p.floor) { p.p[1] = p.floor; if (p.v[1] < 0) p.v[1] *= -p.bounce; p.v[0] *= 0.6; p.v[2] *= 0.6; p.spin *= 0.6; p.onBounce?.(p, fx); }
      p.rot += p.spin * dt;
      p.tick?.(p, dt, t, fx);
    }
    if (this.sort) {
      for (const p of L) p.z = (p.p[0] - cp.x) * cd.x + (p.p[1] - cp.y) * cd.y + (p.p[2] - cp.z) * cd.z;
      L.sort((a, b) => b.z - a.z);
    }
    const A = this.a; let n = 0;
    for (const p of L) {
      if (p.delay > 0) continue;
      const t = Math.min(1, p.age / p.life), s = p.s0 + (p.s1 - p.s0) * easeOut(t, p.ease);
      let sx = s, sy = s * p.aspect;
      if (p.mode === M.vel) { const sp = Math.hypot(p.v[0], p.v[1], p.v[2]); sx = s * (1 + sp * p.stretch); }
      if (p.len) sx = p.len;
      let y = p.p[1]; if (p.mode === M.up) y += sy * 0.5;
      A.pos.array.set([p.p[0], y, p.p[2]], n * 3);
      A.vel.array.set(p.axis || p.v, n * 3);
      A.xf.array.set([sx, sy, p.rot, p.mode], n * 4);
      A.st.array.set([t, p.seed, p.kind, p.bias], n * 4);
      A.v.array.set([p.alpha * (p.fadeIn ? Math.min(1, p.age / p.fadeIn) : 1), p.add, p.len || 0, 0], n * 4);
      A.c0.array.set(p.c[0], n * 3); A.c1.array.set(p.c[1], n * 3); A.c2.array.set(p.c[2], n * 3);
      n++;
    }
    for (const k in A) A[k].needsUpdate = true;
    this.geo.instanceCount = n;
  }
}
const _v = new THREE.Vector3(), _w = new THREE.Vector3();

// ------------------------------------------------------------------------------------------------ post chain
const QV = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const DOWN = `uniform sampler2D t; uniform vec2 px; uniform float thr; varying vec2 vUv;
void main() { vec3 c = (texture2D(t, vUv + vec2(-px.x, -px.y)).rgb + texture2D(t, vUv + vec2(px.x, -px.y)).rgb
  + texture2D(t, vUv + vec2(-px.x, px.y)).rgb + texture2D(t, vUv + px).rgb) * 0.25;
  if (thr > 0.0) { float l = max(c.r, max(c.g, c.b)); c *= max(0.0, l - thr) / max(l, 1e-4); }
  gl_FragColor = vec4(min(c, vec3(40.0)), 1.0); }`;
const UP = `uniform sampler2D t; uniform vec2 px; uniform float k; varying vec2 vUv;
void main() { vec3 c = texture2D(t, vUv).rgb * 4.0;
  c += (texture2D(t, vUv + vec2(px.x, 0)).rgb + texture2D(t, vUv - vec2(px.x, 0)).rgb + texture2D(t, vUv + vec2(0, px.y)).rgb + texture2D(t, vUv - vec2(0, px.y)).rgb) * 2.0;
  c += texture2D(t, vUv + px).rgb + texture2D(t, vUv - px).rgb + texture2D(t, vUv + vec2(px.x, -px.y)).rgb + texture2D(t, vUv - vec2(px.x, -px.y)).rgb;
  gl_FragColor = vec4(c / 16.0 * k, 1.0); }`;
const COMP = `uniform sampler2D tS, tB; uniform float uBloom, uChroma, uImpact, uMode, uTime, uAspect, uExposure; uniform vec3 uTint; uniform vec4 uHeat[8];
varying vec2 vUv;
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
void main() {
  vec2 uv = vUv;
  for (int i = 0; i < 8; i++) { vec4 h = uHeat[i]; if (h.w <= 0.0) continue;
    vec2 d = uv - h.xy; d.x *= uAspect; float m = (1.0 - smoothstep(h.z * 0.25, h.z, length(d))) * h.w;
    uv += m * 0.005 * vec2(sin(uv.y * 95.0 + uTime * 9.0 + float(i) * 2.0), cos(uv.x * 70.0 - uTime * 7.5)); }
  vec2 cd = uv - 0.5; float ch = uChroma * (0.25 + dot(cd, cd) * 3.0) * 0.018;
  vec3 c = vec3(texture2D(tS, uv + cd * ch).r, texture2D(tS, uv).g, texture2D(tS, uv - cd * ch).b);
  c += texture2D(tB, uv).rgb * uBloom;
  c = aces(c * uExposure);
  c *= 1.0 - dot(cd, cd) * 0.85;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  vec3 inv = (1.0 - c) * mix(vec3(1.0), uTint, 0.35);
  vec3 bw = mix(vec3(0.03, 0.02, 0.05), mix(vec3(1.0), uTint, 0.2) * 1.1, smoothstep(0.3, 0.4, l));
  c = mix(c, mix(inv, bw, uMode), uImpact);
  gl_FragColor = vec4(pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0);
}`;

function createPost(renderer) {
  const HF = { type: THREE.HalfFloatType, depthBuffer: false };
  const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
  const mips = Array.from({ length: 5 }, () => new THREE.WebGLRenderTarget(4, 4, HF));
  const qs = new THREE.Scene(), qc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); quad.frustumCulled = false; qs.add(quad);
  const SM = (fs, u, o = {}) => new THREE.ShaderMaterial({ uniforms: u, vertexShader: QV, fragmentShader: fs, depthTest: false, depthWrite: false, ...o });
  const down = SM(DOWN, { t: { value: null }, px: { value: new THREE.Vector2() }, thr: { value: 0 } });
  const up = SM(UP, { t: { value: null }, px: { value: new THREE.Vector2() }, k: { value: 1 } }, { blending: THREE.AdditiveBlending, transparent: true });
  const heat = Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 0, 0));
  const comp = SM(COMP, { tS: { value: rt.texture }, tB: { value: mips[0].texture }, uBloom: { value: 0.65 }, uChroma: { value: 0 }, uImpact: { value: 0 },
    uMode: { value: 0 }, uTime: { value: 0 }, uAspect: { value: 1 }, uExposure: { value: 1 }, uTint: { value: new THREE.Color(1, 1, 1) }, uHeat: { value: heat } });
  const pass = (m, target) => { quad.material = m; renderer.setRenderTarget(target); renderer.render(qs, qc); };
  let W = 0, H = 0;
  return {
    comp, heat,
    resize(w, h) { W = w; H = h; rt.setSize(w, h); mips.forEach((m, i) => m.setSize(Math.max(1, w >> (i + 1)), Math.max(1, h >> (i + 1)))); comp.uniforms.uAspect.value = w / h; },
    render(scene, camera) {
      renderer.setRenderTarget(rt); renderer.render(scene, camera);
      let src = rt;
      mips.forEach((m, i) => { down.uniforms.t.value = src.texture; down.uniforms.px.value.set(1 / src.width, 1 / src.height); down.uniforms.thr.value = i ? 0 : 1.0; pass(down, m); src = m; });
      for (let i = mips.length - 1; i > 0; i--) { up.uniforms.t.value = mips[i].texture; up.uniforms.px.value.set(1 / mips[i].width, 1 / mips[i].height); up.uniforms.k.value = 1; renderer.autoClear = false; pass(up, mips[i - 1]); renderer.autoClear = true; }
      pass(comp, null);
    }
  };
}

// ------------------------------------------------------------------------------------------------ fx facade
// post: false → sprite + decal layer only, for hosts with their own composer (the arena).
export function createFx2d({ scene, camera, renderer, lights = 4, post: withPost = true }) {
  const sprites = new Pool(scene, 3600, 20); sprites.sort = true;
  const decals = new Pool(scene, 64, 5);
  decals.mat.polygonOffset = true; decals.mat.polygonOffsetFactor = -2; decals.mat.polygonOffsetUnits = -2;
  const post = withPost ? createPost(renderer) : { comp: { uniforms: { uTint: { value: new THREE.Color() }, uAspect: { value: 1 }, uTime: { value: 0 }, uChroma: { value: 0 }, uImpact: { value: 0 }, uMode: { value: 0 } } }, heat: [], render() {}, resize() {} };
  const timers = [], heats = [];
  const L = Array.from({ length: lights }, () => { const l = new THREE.PointLight(0xffffff, 0, 10, 2); scene.add(l); return { l, life: 0, age: 0, I: 0 }; });
  const S = { time: 0, trauma: 0, chroma: 0, impactF: 0, impactCd: 0, kick: new THREE.Vector3(), kickV: new THREE.Vector3(), reduced: false, density: 1 };
  const shakeOff = new THREE.Vector3();
  const funnels = [];
  const FUN_V = 'uniform float uH; varying vec3 vN, vV, vP; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vP = position; vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }';
  const FUN_F = `uniform float uA, uTime, uH; uniform vec3 uC0, uC1, uC2; varying vec3 vN, vV, vP;
    float h1(float x) { return fract(sin(x * 91.7) * 43758.5); }
    void main() { float an = atan(vP.z, vP.x) / 6.2832, y = vP.y / uH;
      float u = an * 3.0 + y * 2.2 - uTime * 2.6, band = fract(u), id = floor(u);
      float w = 0.28 + 0.3 * h1(id), streak = smoothstep(0.0, 0.05, band) * (1.0 - smoothstep(w, w + 0.06, band));
      float u2 = an * 5.0 + y * 3.5 - uTime * 4.1, s2 = step(0.82, fract(u2));
      float f = 1.0 - abs(dot(normalize(vN), vV)), edge = smoothstep(0.0, 0.08, y) * (1.0 - smoothstep(0.9, 1.0, y));
      float a = max(streak * 0.85, s2 * 0.6) * (0.45 + f * 0.55) * edge * uA;
      if (a < 0.02) discard;
      vec3 c = s2 > 0.5 ? uC0 : (f > 0.55 ? uC1 : uC2);
      gl_FragColor = vec4(c * a, a * 0.85); }`;
  const domes = [], domeGeo = new THREE.SphereGeometry(1, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2);
  const DOME_V = 'varying vec3 vN, vV, vP; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vP = position; vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }';
  const DOME_F = `uniform vec3 uC; uniform float uA, uTime; varying vec3 vN, vV, vP;
    void main() { float f = 1.0 - abs(dot(normalize(vN), vV)), rim = pow(f, 2.2), base = 1.0 - smoothstep(0.0, 0.1, vP.y);
      float scan = smoothstep(0.92, 1.0, sin(vP.y * 22.0 - uTime * 5.0)), hexl = smoothstep(0.93, 1.0, abs(sin(atan(vP.z, vP.x) * 12.0)) * step(0.15, vP.y));
      float a = clamp(0.1 + rim * 0.9 + base * 0.7 + scan * 0.18 + hexl * 0.08, 0.0, 1.0) * uA;
      gl_FragColor = vec4(uC * (0.4 + rim * 1.3 + base * 1.1 + scan) * a * 0.75, a * 0.4); }`;

  function make(o, pool) {
    const c = o.pal ? (typeof o.pal === 'string' ? PAL[o.pal] : o.pal) : PAL.fire;
    return pool.add({
      p: [...(o.p || [0, 0, 0])], v: [...(o.v || [0, 0, 0])], kind: o.kind ?? K.flame, mode: o.mode ?? M.bill,
      life: o.life ?? 0.6, age: 0, delay: o.delay ?? 0, s0: o.s0 ?? o.s ?? 0.5, s1: o.s1 ?? o.s ?? 0.5, ease: o.ease ?? 2,
      aspect: o.aspect ?? 1, rot: o.rot ?? Math.random() * 6.28, spin: o.spin ?? 0, drag: o.drag ?? 1, grav: o.grav ?? 0,
      stretch: o.stretch ?? 0.06, seed: Math.random(), bias: o.bias ?? 0, alpha: o.alpha ?? 1, add: o.add ?? 0, fadeIn: o.fadeIn ?? 0,
      c, curl: o.curl ?? 0, curlF: o.curlF ?? rnd(2, 4), split: o.split ?? 0, bounce: o.bounce, floor: o.floor ?? 0.05,
      len: o.len ?? 0, axis: o.axis, tick: o.tick, onDie: o.onDie, onBounce: o.onBounce, tag: o.tag
    });
  }
  const fx = {
    S, PAL, K, M, post,
    get time() { return S.time; },
    spawn: (o) => make(o, sprites),
    // R-110: a quality tier caps how many sprites live at once (the buffers keep their full size)
    budget(n) { sprites.max = Math.max(64, Math.min(3600, n | 0)); while (sprites.list.length > sprites.max) sprites.list.shift(); },
    decal: (o) => make({ mode: M.ground, rot: 0, ...o }, decals),
    kill(tag) { for (const P of [sprites, decals]) P.list = P.list.filter((p) => p.tag !== tag); },
    clear() { funnels.forEach((d) => scene.remove(d.m)); funnels.length = 0; domes.forEach((d) => scene.remove(d.m)); domes.length = 0; sprites.list.length = 0; decals.list.length = 0; timers.length = 0; heats.length = 0; L.forEach((s) => { s.I = 0; s.l.intensity = 0; }); },
    after(t, fn) { timers.push({ t, fn }); },
    during(d, fn) { timers.push({ t: 0, d, age: 0, fn, every: true }); },
    light(p, color, I, dist = 8, life = 0.3) {
      if (!L.length || !I) return null;
      const s = L.reduce((a, b) => (b.I * (1 - b.age / Math.max(1e-3, b.life)) < a.I * (1 - a.age / Math.max(1e-3, a.life)) ? b : a));
      s.l.position.set(...p); s.l.color.setRGB(...(Array.isArray(color) ? color : new THREE.Color(color).toArray())); s.l.distance = dist;
      s.I = I; s.life = life; s.age = 0; return s;
    },
    heat(p, r, s, life) { heats.push({ p, r, s, life, age: 0 }); },
    // Tornado funnel: open cone mesh with diagonal scrolling wind streaks; follows getC, sways, grows and dies.
    funnel(getC, dur, { h = 3.6, r0 = 0.25, r1 = 1.4, pal = 'gale', spin = 1 } = {}) {
      const pts = []; for (let i = 0; i <= 16; i++) { const k = i / 16; pts.push(new THREE.Vector2(r0 + (r1 - r0) * k * k, k * h)); }
      const P = PAL[pal] ?? pal;
      const mat = new THREE.ShaderMaterial({ uniforms: { uA: { value: 0 }, uTime: { value: 0 }, uH: { value: h }, uC0: { value: new THREE.Vector3(...P[0]) }, uC1: { value: new THREE.Vector3(...P[1]) }, uC2: { value: new THREE.Vector3(...P[2]) } },
        vertexShader: FUN_V, fragmentShader: FUN_F, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor });
      const m = new THREE.Mesh(new THREE.LatheGeometry(pts, 40), mat); m.renderOrder = 16; m.name = 'fx_funnel'; scene.add(m);
      funnels.push({ m, getC, dur, age: 0, spin });
    },
    // Shield dome: fresnel hemisphere that pops in with overshoot and dissolves out.
    dome(p, r, color, life = 2) {
      const mat = new THREE.ShaderMaterial({ uniforms: { uC: { value: new THREE.Vector3(...color) }, uA: { value: 0 }, uTime: { value: 0 } }, vertexShader: DOME_V, fragmentShader: DOME_F,
        transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor });
      const m = new THREE.Mesh(domeGeo, mat); m.position.set(p[0], 0, p[2]); m.renderOrder = 15; scene.add(m);
      domes.push({ m, r, life, age: 0 });
    },
    shake(a) { S.trauma = Math.min(1, S.trauma + a); },
    kick(x, y, z) { S.kickV.x += x; S.kickV.y += y; S.kickV.z += z; },
    chroma(a) { S.chroma = Math.max(S.chroma, a); },
    impact(tint = [1, 1, 1], force = false) {
      if (S.reduced || (S.impactCd > 0 && !force)) return;
      S.impactF = 2; S.impactCd = 0.4; post.comp.uniforms.uTint.value.setRGB(...tint);
    },
    _split(p) {
      // Breakup: the puff hands its volume to two smaller curls that peel away in opposite directions.
      for (let i = 0; i < 2; i++) {
        const a = p.seed * 6.28 + i * Math.PI, sp = rnd(0.5, 1.1);
        const s = p.s0 + (p.s1 - p.s0) * easeOut(p.split, p.ease);
        make({ kind: p.kind, pal: p.c, p: [p.p[0] + Math.cos(a) * s * 0.3, p.p[1] + s * 0.15, p.p[2] + Math.sin(a) * s * 0.3],
          v: [p.v[0] * 0.5 + Math.cos(a) * sp, p.v[1] * 0.5 + 0.35, p.v[2] * 0.5 + Math.sin(a) * sp], s0: s * 0.5, s1: s * 0.8,
          life: p.life * (1 - p.split) * 1.25, grav: p.grav * 0.7, drag: p.drag, curl: 1.4, bias: 0.05, alpha: p.alpha }, sprites);
      }
      p.life = p.age + (p.life - p.age) * 0.6;
    },
    update(dt) {
      S.time += dt;
      for (let i = timers.length - 1; i >= 0; i--) {
        const T = timers[i];
        if (T.every) { T.age += dt; T.fn(dt, Math.min(1, T.age / T.d)); if (T.age >= T.d) timers.splice(i, 1); }
        else if ((T.t -= dt) <= 0) { timers.splice(i, 1); T.fn(); }
      }
      sprites.update(dt, camera, S.time, fx); decals.update(dt, camera, S.time, fx);
      for (let i = funnels.length - 1; i >= 0; i--) { const F = funnels[i]; F.age += dt; const k = F.age / F.dur;
        if (k >= 1) { scene.remove(F.m); F.m.material.dispose(); F.m.geometry.dispose(); funnels.splice(i, 1); continue; }
        const C = F.getC(); F.m.position.set(C[0], 0, C[2]); F.m.rotation.set(Math.sin(S.time * 3) * 0.07, F.m.rotation.y - dt * 7 * F.spin, Math.cos(S.time * 2.4) * 0.07);
        const g = Math.min(1, F.age / 0.25); F.m.scale.set(0.6 + 0.4 * g, g, 0.6 + 0.4 * g);
        F.m.material.uniforms.uA.value = g * (1 - Math.max(0, (k - 0.8) / 0.2)); F.m.material.uniforms.uTime.value = S.time; }
      for (let i = domes.length - 1; i >= 0; i--) { const d = domes[i]; d.age += dt; const k = d.age / d.life;
        if (k >= 1) { scene.remove(d.m); d.m.material.dispose(); domes.splice(i, 1); continue; }
        const sc = d.r * (1 - Math.exp(-d.age * 14) * Math.cos(d.age * 20)); d.m.scale.set(sc, sc * 0.92, sc);
        d.m.material.uniforms.uA.value = Math.min(1, d.age * 10) * (1 - Math.max(0, (k - 0.75) / 0.25)); d.m.material.uniforms.uTime.value = S.time; }
      for (const s of L) { s.age += dt; const k = Math.max(0, 1 - s.age / s.life); s.l.intensity = s.I * k * k; }
      // Heat haze sources → screen space.
      for (let i = heats.length - 1; i >= 0; i--) if ((heats[i].age += dt) >= heats[i].life) heats.splice(i, 1);
      const H = post.heat; H.forEach((h) => h.set(0, 0, 0, 0)); if (!withPost) heats.length = 0;
      camera.updateMatrixWorld();
      heats.slice(-8).forEach((h, i) => {
        _v.set(...h.p).project(camera); if (_v.z > 1) return;
        _w.set(...h.p).addScaledVector(_w.setFromMatrixColumn(camera.matrixWorld, 0), h.r).project(camera);
        const k = h.age / h.life, env = Math.min(1, k * 6) * (1 - k);
        H[i].set(_v.x * 0.5 + 0.5, _v.y * 0.5 + 0.5, Math.abs(_w.x - _v.x) * 0.5 * post.comp.uniforms.uAspect.value + 0.02, h.s * env);
      });
      // Camera: trauma shake + spring kick.
      S.trauma = Math.max(0, S.trauma - dt * 1.6); S.chroma = Math.max(0, S.chroma - dt * 2.5);
      const tr = S.reduced ? 0 : S.trauma * S.trauma, tt = S.time * 31;
      shakeOff.set(Math.sin(tt * 1.13) + Math.sin(tt * 2.7) * 0.5, Math.sin(tt * 1.37 + 1) + Math.sin(tt * 3.1) * 0.5, Math.sin(tt * 0.9 + 2)).multiplyScalar(tr * 0.16);
      S.kickV.addScaledVector(S.kick, -170 * dt); S.kickV.multiplyScalar(Math.exp(-14 * dt)); S.kick.addScaledVector(S.kickV, dt);
      S.impactCd -= dt;
      const u = post.comp.uniforms;
      u.uTime.value = S.time; u.uChroma.value = S.chroma + tr * 0.5;
    },
    cameraOffset() { return _w.copy(shakeOff).add(S.kick); },
    render() {
      if (!withPost) return;
      const u = post.comp.uniforms;
      if (S.impactF > 0) { u.uImpact.value = 1; u.uMode.value = S.impactF === 2 ? 0 : 1; S.impactF--; } else u.uImpact.value = 0;
      post.render(scene, camera);
    },
    resize(w, h) { post.resize(w, h); },
    count() { return sprites.list.length + decals.list.length; }
  };
  return fx;
}

// ------------------------------------------------------------------------------------------------ recipes
// Small building blocks. `n` counts pass through S.density so the arena can trim them without retuning.
export function recipes(fx) {
  const N = (n) => Math.max(1, Math.round(n * fx.S.density));
  const dir = (sp, up = 0) => { const a = Math.random() * 6.28, b = Math.acos(rnd(-1, 1)); return [Math.sin(b) * Math.cos(a) * sp, Math.abs(Math.cos(b)) * sp * up + Math.cos(b) * sp * (1 - up), Math.sin(b) * Math.sin(a) * sp]; };
  const R = {
    dir,
    // Instant key-frame flash: a sharp star and a light. Elemental Magic: the first frame of a hit is pure shape.
    flash(p, pal, s = 1.6, light = 6) {
      fx.spawn({ kind: K.star, pal, p, s0: s, s1: s * 0.3, life: 0.14, ease: 1, rot: Math.random() * 6.28, add: 0.6 });
      fx.spawn({ kind: K.star, pal, p, s0: s * 0.55, s1: s * 1.4, life: 0.1, add: 0.8, rot: Math.random() * 6.28 });
      fx.light(p, PAL[pal]?.[1] ?? pal[1], light, 9, 0.35);
    },
    sparks(p, pal, n = 16, sp = 7, o = {}) {
      for (let i = 0; i < N(n); i++) { const v = dir(sp * rnd(0.4, 1), o.up ?? 0.4);
        fx.spawn({ kind: K.spark, mode: M.vel, pal, p, v, s0: o.s ?? 0.16, s1: (o.s ?? 0.16) * 0.6, aspect: 0.32, life: rnd(0.25, o.life ?? 0.6), grav: o.grav ?? -9, drag: o.drag ?? 1.2, stretch: o.stretch ?? 0.09, add: 0.4, bounce: o.bounce, floor: 0.04 }); }
    },
    ring(p, pal, r = 3, life = 0.35, ground = true) {
      (ground ? fx.decal : fx.spawn)({ kind: K.ring, pal, p: [p[0], ground ? 0.04 : p[1], p[2]], s0: 0.4, s1: r * 2, life, ease: 3, add: 0.3 });
    },
    // Fireball blossom → smoke column. Fire is hot, fast and rises; it hands off to slow, curling smoke.
    explosion(p, o = {}) {
      const r = o.r ?? 1.5, fire = o.pal ?? 'fire', smoke = o.smoke ?? 'smoke', ss = o.smokeScale ?? 1, sa = o.smokeAlpha ?? 1;
      const hot = fire === 'fire' || fire === 'magma' ? 'blast' : fire, y = p[1] + 0.35;
      R.flash([p[0], y + r * 0.3, p[2]], hot, r * 1.8, 9 * r);
      fx.spawn({ kind: K.billow, pal: hot, p: [p[0], y + r * 0.25, p[2]], s0: r * 1.1, s1: r * 2.3, life: 0.34, ease: 4, add: 0.45 });
      for (let i = 0; i < N(12 * r); i++) { const a = Math.random() * 6.28, sp = rnd(3, 7) * r;
        fx.spawn({ kind: K.billow, pal: i % 3 ? fire : hot, p: [p[0] + Math.cos(a) * r * 0.3, y + Math.random() * r * 0.4, p[2] + Math.sin(a) * r * 0.3],
          v: [Math.cos(a) * sp, rnd(0.5, 2.5) * r, Math.sin(a) * sp], s0: r * rnd(0.5, 0.75), s1: r * rnd(1.0, 1.45), life: rnd(0.5, 0.85), drag: 4.5, grav: 2.5, ease: 3, curl: 1, add: 0.45 }); }
      for (let i = 0; i < N(22 * r); i++) { const a = (i / (22 * r)) * 6.28 + rnd(-0.1, 0.1), sp = rnd(7, 12) * r;
        fx.spawn({ kind: K.spark, mode: M.vel, pal: fire, p: [p[0] + Math.cos(a) * r * 0.9, 0.3, p[2] + Math.sin(a) * r * 0.9], v: [Math.cos(a) * sp, rnd(0.3, 1.5), Math.sin(a) * sp],
          s0: r * rnd(0.35, 0.55), s1: r * 0.2, aspect: 0.4, life: rnd(0.22, 0.34), drag: 6, stretch: 0.1, add: 0.45 }); }
      for (let i = 0; i < N(6 * r); i++) { const v = R.dir(rnd(0.8, 2) * r, 0.8);
        fx.spawn({ kind: K.smoke, pal: smoke, p: [p[0] + v[0] * 0.2, y + r * 0.6, p[2] + v[2] * 0.2], v, s0: r * 0.4 * ss, s1: r * rnd(1, 1.4) * ss, delay: rnd(0.3, 0.5), alpha: 0.55 * sa,
          life: rnd(1.2, 1.8), drag: 2.4, grav: 1.6, ease: 2.5, curl: 1.1, split: Math.random() < 0.5 ? 0.55 : 0 }); }
      R.sparks([p[0], y, p[2]], fire, 26 * r, 9 * r, { up: 0.75, grav: -6, life: 1.1, s: 0.11 });
      R.ring(p, hot, r * 2.6, 0.28);
      fx.decal({ kind: K.scorch, pal: 'char', p: [p[0], 0.025, p[2]], s: r * 3.2, life: o.scorch ?? 5 });
      if (o.crackPal) fx.decal({ kind: K.crack, pal: o.crackPal, p: [p[0], 0.03, p[2]], s: r * 2, life: (o.scorch ?? 5) * 0.6 });
      fx.heat([p[0], y + r, p[2]], r * 2.4, 1, 1.6);
      fx.shake(0.35 + 0.2 * r); fx.chroma(0.8);
    },
    // Ground fire, after Magicka's earth+fire: a crater of rock shards jutting out, flames licking up between them.
    rockfire(p, o = {}) {
      const R0 = o.r ?? 0.9, life = o.life ?? 2.6, n = o.rocks ?? 9;
      for (let i = 0; i < n; i++) { const a = (i / n) * 6.28 + rnd(-0.2, 0.2), rr = R0 * rnd(0.75, 1.05), h = rnd(0.45, 0.8) * (o.h ?? 1);
        fx.spawn({ kind: K.shard, pal: 'rock', p: [p[0] + Math.cos(a) * rr, 0, p[2] + Math.sin(a) * rr], s: h * 0.55, aspect: 1.9, rot: rnd(-0.5, 0.5), life, delay: rnd(0, 0.06), ease: 1,
          tick: (q) => { const k = Math.min(1, q.age / 0.09); q.p[1] = -0.35 * h + (0.35 * h + h * 0.18) * (1 - Math.pow(1 - k, 3)) - Math.max(0, q.age / q.life - 0.8) * h * 2; },
          onDie: (q) => { R.debris([q.p[0], 0.1, q.p[2]], 'rock', 2, 2.5, 0.12); } }); }
      fx.decal({ kind: K.scorch, pal: 'char', p: [p[0], 0.025, p[2]], s: R0 * 3, life: life + 2 });
      fx.decal({ kind: K.crack, pal: 'magma', p: [p[0], 0.03, p[2]], s: R0 * 2.2, life: life + 1 });
      fx.during(life * 0.85, (dt, k) => {
        const m = dt * 42 * (1 - k * 0.6); let c = Math.floor(m) + (Math.random() < m % 1 ? 1 : 0);
        while (c--) { const a = Math.random() * 6.28, rr = Math.random() * R0 * 0.8, at = [p[0] + Math.cos(a) * rr, 0.15, p[2] + Math.sin(a) * rr];
          if (Math.random() < 0.55) fx.spawn({ kind: K.billow, pal: 'fire', p: at, v: [rnd(-0.3, 0.3), rnd(2, 3.5), rnd(-0.3, 0.3)], s0: rnd(0.7, 1.0) * R0, s1: rnd(0.3, 0.5) * R0, life: rnd(0.4, 0.65), drag: 1.4, grav: 2.5, curl: 2.5, add: 0.4 });
          else R.lick(at, 'fire', rnd(0.7, 1.0) * R0, { v: [rnd(-0.4, 0.4), rnd(3, 4.5), rnd(-0.4, 0.4)], aspect: 1.9, life: rnd(0.35, 0.55), add: 0.35 });
          if (Math.random() < 0.25) fx.spawn({ kind: K.spark, mode: M.vel, pal: 'fire', p: [at[0], 0.5, at[2]], v: [rnd(-0.6, 0.6), rnd(1.5, 3), rnd(-0.6, 0.6)], s: 0.07, aspect: 0.5, life: rnd(0.8, 1.4), drag: 0.8, curl: 3, add: 0.6 }); }
      });
      fx.heat([p[0], 1, p[2]], R0 * 1.8, 0.7, life);
      fx.light([p[0], 0.8, p[2]], [2.2, 1.0, 0.3], 4, 6, life);
    },
    // Fire stream: billows pushed down a line, swelling as they travel and blowing out where they overlap.
    firestream(getA, getDir, len, dur, o = {}) {
      const pal = o.pal ?? 'fire', speed = len / (o.travel ?? 0.4);
      fx.during(dur, (dt) => { const m = dt * (o.rate ?? 55); let c = Math.floor(m) + (Math.random() < m % 1 ? 1 : 0);
        while (c--) { const A = getA(), D = getDir(), jit = [rnd(-0.12, 0.12), rnd(-0.1, 0.1), rnd(-0.12, 0.12)];
          fx.spawn({ kind: K.billow, pal: Math.random() < 0.3 ? 'blast' : pal, p: [A[0] + jit[0], A[1] + jit[1], A[2] + jit[2]], v: [D[0] * speed + jit[0] * 8, D[1] * speed + rnd(0, 1.5), D[2] * speed + jit[2] * 8],
            s0: o.s0 ?? 0.35, s1: o.s1 ?? 1.5, life: o.travel ?? 0.4, ease: 1.4, drag: 0.6, grav: 2, add: 0.5, curl: 2 }); } });
    },
    // Braided beam, after Magicka's arcane beam: thin white-hot filaments twisting round each other along a slight sag,
    // tight at both ends, loose in the middle, flaring at the source and splashing at the end. Rebuilt every frame.
    strands(getA, getB, pal, dur, o = {}) {
      const n = o.n ?? 5, seg = o.seg ?? 26, amp = o.amp ?? 0.28, w = o.w ?? 0.11, sag = o.sag ?? 0.35, turns = o.turns ?? 2.2;
      const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], nrm = (v) => { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
      const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
      fx.during(dur, (dt, kk) => {
        const A = getA(), B = getB(), ax = sub(B, A), sd = nrm(cross(ax, [0, 1, 0])), up = nrm(cross(sd, ax)), life = Math.max(0.012, dt * 2.2);
        const grow = Math.min(1, kk * dur / 0.06), fade = 1 - Math.max(0, (kk - 0.8) / 0.2);
        for (let st = 0; st < n; st++) {
          const ph = (st / n) * 6.283, dirn = st % 2 ? 1 : -1, ww = w * (st === 0 ? 1.5 : rnd(0.7, 1.05)) * fade; let prev = A;
          for (let i = 1; i <= seg; i++) {
            const k = (i / seg) * grow, env = Math.pow(Math.sin(Math.PI * Math.min(1, k)), 0.75) * amp * (st === 0 ? 0.35 : 1) * (1 + 0.5 * Math.sin(fx.time * 7 + st));
            const an = k * turns * 6.283 + ph + fx.time * 9 * dirn, sg = sag * Math.sin(Math.PI * k);
            const P = [A[0] + ax[0] * k + sd[0] * Math.cos(an) * env + up[0] * (Math.sin(an) * env * 0.7) , A[1] + ax[1] * k + up[1] * Math.sin(an) * env * 0.7 - sg, A[2] + ax[2] * k + sd[2] * Math.cos(an) * env + up[2] * Math.sin(an) * env * 0.7];
            const sx = sub(P, prev), L = Math.hypot(...sx);
            fx.spawn({ kind: K.strand, mode: M.axis, pal, p: [(P[0] + prev[0]) / 2, (P[1] + prev[1]) / 2, (P[2] + prev[2]) / 2], axis: sx, len: L * 1.2, s: ww, life, add: 0.65 });
            prev = P;
          }
        }
        if (o.orbs) for (const E of [A, B]) fx.spawn({ kind: K.billow, pal: [PAL.blast[0], (PAL[pal] ?? pal)[0], (PAL[pal] ?? pal)[1]], p: E, s: rnd(0.45, 0.6) * (E === A ? 0.8 : 1), life: Math.max(0.012, dt * 2.2), add: 0.7, bias: -0.3 });
        if (Math.random() < dt * 40) fx.spawn({ kind: K.star, pal, p: A, s0: rnd(0.5, 0.9), s1: 0.1, life: 0.08, add: 0.7 });
        if (grow >= 1 && Math.random() < dt * 30) { const E = [B[0], B[1] - sag * 0.1, B[2]];
          fx.spawn({ kind: K.star, pal, p: E, s0: rnd(0.6, 1), s1: 0.1, life: 0.08, add: 0.7 });
          fx.spawn({ kind: K.billow, pal: o.splash ?? pal, p: E, v: [rnd(-1, 1), rnd(0.5, 2), rnd(-1, 1)], s0: 0.35, s1: 0.75, life: 0.3, drag: 3, add: 0.5 });
          if (Math.random() < 0.6) R.sparks(E, pal, 3, 5, { up: 0.6, grav: -8, life: 0.5, s: 0.08 }); }
      });
    },
    // Spray: a widening cone of mist and droplets (water, frost, steam), dense at the nozzle, billowing at the far end.
    spray(getA, getDir, len, dur, o = {}) {
      const pal = o.pal ?? 'mist', drop = o.drop ?? 'water', cone = o.cone ?? 0.22, speed = o.speed ?? 14, life = len / speed;
      fx.during(dur, (dt) => { const m = dt * (o.rate ?? 110); let c = Math.floor(m) + (Math.random() < m % 1 ? 1 : 0);
        const A = getA(), D = getDir(), yaw = Math.atan2(D[0], D[2]);
        while (c--) { const a = yaw + rnd(-cone, cone), sp = speed * rnd(0.8, 1.1), v = [Math.sin(a) * sp, rnd(-0.6, 0.9), Math.cos(a) * sp];
          fx.spawn({ kind: K.smoke, pal, p: [...A], v, s0: 0.12, s1: len * rnd(0.16, 0.24), life: life * rnd(0.9, 1.25), ease: 1.3, drag: 0.7, grav: o.grav ?? 0.4, curl: 1.2, alpha: o.alpha ?? 0.8, bias: 0.04 });
          if (Math.random() < 0.35) fx.spawn({ kind: K.spark, mode: M.vel, pal: drop, p: [...A], v: [v[0] * 1.1, v[1] + 1, v[2] * 1.1], s: 0.07, aspect: 0.4, life: life * 0.8, grav: -9, drag: 0.4, stretch: 0.05, add: 0.3 }); }
        if (Math.random() < dt * 20) fx.spawn({ kind: K.star, pal: drop, p: A, s0: 0.5, s1: 0.1, life: 0.07, add: 0.6 });
      });
    },
    // Frost sheet: a jagged cone of ice painted onto the ground along a direction.
    sheet(from, dir, len, width, life = 3, pal = 'sheet') {
      fx.decal({ kind: K.sheet, pal, p: [from[0] + dir[0] * len / 2, 0.03, from[2] + dir[2] * len / 2], s: len, aspect: width / len, rot: Math.atan2(dir[2], dir[0]), life });
    },
    // Crystal ring: clusters of faceted blue crystals erupting in a circle; they shatter when they go.
    crystals(c, r, n = 12, o = {}) {
      const life = o.life ?? 3;
      for (let i = 0; i < n; i++) { const a = (i / n) * 6.28 + rnd(-0.15, 0.15);
        for (let j = 0; j < 3; j++) { const rr = r + rnd(-0.25, 0.25), H = rnd(0.5, 1.05) * (o.h ?? 1) * (j ? 0.7 : 1), w = H * rnd(0.3, 0.42), at = [c[0] + Math.cos(a + j * 0.09) * rr, 0, c[2] + Math.sin(a + j * 0.09) * rr];
          fx.spawn({ kind: K.spike, mode: M.up, pal: 'crystal', p: at, s: w, aspect: 0.01, life: life * rnd(0.9, 1.1), delay: (o.delay ?? 0) + i * 0.012, ease: 1,
            tick: (q) => { q.aspect = (H / w) * (1 - Math.pow(1 - Math.min(1, q.age / 0.1), 3)); },
            onDie: (q) => { R.debris([q.p[0], H * 0.4, q.p[2]], 'crystal', 2, 3, 0.12); } }); }
        fx.after((o.delay ?? 0) + i * 0.012, () => R.sparks([c[0] + Math.cos(a) * r, 0.3, c[2] + Math.sin(a) * r], 'crystal', 2, 3, { up: 0.8, grav: -10, life: 0.5 }));
      }
    },
    // Chain lightning: violet-white bolts hopping from the caster through each target, re-striking while it holds.
    chain(getFrom, pts, dur = 0.35, pal = 'lightning') {
      let acc = 1;
      fx.during(dur, (dt) => { acc += dt; if (acc < 0.05) return; acc = 0;
        let prev = getFrom();
        for (const p of pts) { R.bolt(prev, p, pal, { seg: 9, w: 0.1, life: 0.09, jit: 0.45, fork: 0.35 });
          fx.spawn({ kind: K.star, pal, p, s0: rnd(0.8, 1.2), s1: 0.1, life: 0.08, add: 0.7 }); R.sparks(p, pal, 3, 5, { up: 0.5, grav: -6, life: 0.4, s: 0.08 }); prev = p; } });
      fx.decal({ kind: K.crack, pal, p: [pts[0][0], 0.03, pts[0][2]], s: 1.2, life: 1.2 });
    },
    // Self nova: rune circle with a white-hot starburst at its heart and radial streaks along the floor.
    nova(p, pal, r = 2.4) {
      fx.decal({ kind: K.rune, pal, p: [p[0], 0.03, p[2]], s: r * 2, life: 1.6, rot: 0, tick: (q, dt) => { q.rot += dt * 0.6; } });
      R.flash([p[0], 0.5, p[2]], 'blast', 2.2, 6);
      for (let i = 0; i < 18; i++) { const a = (i / 18) * 6.28 + rnd(-0.1, 0.1), sp = rnd(8, 13);
        fx.spawn({ kind: K.spark, mode: M.vel, pal: 'blast', p: [p[0], 0.25, p[2]], v: [Math.cos(a) * sp, 0, Math.sin(a) * sp], s: 0.2, aspect: 0.18, life: 0.22, drag: 6, stretch: 0.14, add: 0.6 }); }
      R.ring(p, pal, r * 2, 0.35);
    },
    // Wind crescent blade: a billboarded hooked stroke flying along v, with curl wisps peeling off.
    gust(p, v, o = {}) {
      const pal = o.pal ?? 'gale', sz = o.s ?? 1.1;
      return fx.spawn({ kind: K.arc, mode: M.vel, pal, p, v, s0: sz * 0.75, s1: sz * 1.1, life: o.life ?? 0.45, drag: o.drag ?? 1.5, rot: o.rot ?? -0.6, stretch: 0, add: 0.15, bias: o.span ?? 0,
        tick: (q, dt) => { if (Math.random() < dt * 30) fx.spawn({ kind: K.arc, pal: 'wind', p: [...q.p], v: [q.v[0] * 0.15, 0.4, q.v[2] * 0.15], s0: sz * 0.3, s1: sz * 0.45, life: 0.35, spin: (Math.random() < 0.5 ? -1 : 1) * 6, add: 0.3, alpha: 0.75, bias: -0.1 }); }, onDie: o.onDie });
    },
    // Zephyr curls: little spiral wisps drifting and turning (idle air, dissipation, launch puffs).
    curls(p, n = 6, o = {}) {
      for (let i = 0; i < N(n); i++) { const v = dir(o.sp ?? 1.6, 0.5);
        fx.spawn({ kind: K.arc, pal: o.pal ?? 'gale', p: [p[0] + v[0] * 0.15, p[1] + v[1] * 0.15, p[2] + v[2] * 0.15], v, s0: o.s ?? 0.35, s1: (o.s ?? 0.35) * 1.6, life: rnd(0.4, 0.7), drag: 2.5, spin: (i % 2 ? 1 : -1) * rnd(4, 8), curl: 2, add: 0.35, bias: -0.08 }); }
    },
    // Tornado: stacked horizontal crescents spinning round a moving axis, widening with height; dust skirt and lifted debris.
    tornado(getC, dur, o = {}) {
      const H = o.h ?? 3.4, r0 = o.r0 ?? 0.3, r1 = o.r1 ?? 1.3, rate = (o.rate ?? 90) * 0.5;
      fx.funnel(getC, dur, { h: H, r0, r1, pal: 'gale' }); fx.funnel(getC, dur, { h: H * 0.9, r0: r0 * 0.6, r1: r1 * 0.7, pal: 'galedark', spin: 1.4 });
      fx.during(dur, (dt, kk) => {
        const C = getC(), env = Math.min(1, kk * dur / 0.25) * (1 - Math.max(0, (kk - 0.85) / 0.15));
        let m = dt * rate * env, c = Math.floor(m) + (Math.random() < m % 1 ? 1 : 0);
        while (c--) { const y = Math.pow(Math.random(), 0.8) * H * env, k = y / H, sway = Math.sin(fx.time * 3 + k * 2.5) * k * 0.35;
          const rad = r0 + (r1 - r0) * k * k, off = [sway, y, Math.cos(fx.time * 2.3 + k * 2) * k * 0.2];
          fx.spawn({ kind: K.arc, mode: M.ground, pal: k > 0.15 && Math.random() < 0.55 ? 'gale' : 'galedark', p: [C[0] + off[0], C[1] + off[1], C[2] + off[2]], s: rad * 2.2, life: rnd(0.25, 0.4), spin: -rnd(9, 14), rot: Math.random() * 6.28, add: 0.3, bias: rnd(-0.12, 0.05),
            tick: (q) => { const C2 = getC(); q.p[0] = C2[0] + off[0]; q.p[2] = C2[2] + off[2]; } });
        }
        if (Math.random() < dt * 16 * env) { const a = Math.random() * 6.28, rr = r0 + 0.5;
          fx.spawn({ kind: K.smoke, pal: o.dust ?? 'dust', p: [C[0] + Math.cos(a) * rr, 0.2, C[2] + Math.sin(a) * rr], v: [-Math.sin(a) * 4, 0.6, Math.cos(a) * 4], s0: 0.22, s1: 0.6, life: 0.6, drag: 2.5, alpha: 0.45 }); }
        if (Math.random() < dt * 20 * env) { const a = Math.random() * 6.28, y0 = Math.random() * H * 0.6;
          fx.spawn({ kind: K.shard, pal: o.debris ?? 'rock', p: [C[0] + Math.cos(a) * 0.6, y0, C[2] + Math.sin(a) * 0.6], s: rnd(0.06, 0.12), life: rnd(0.6, 1), spin: 12,
            tick: (q, dt2) => { const C2 = getC(), ang = Math.atan2(q.p[2] - C2[2], q.p[0] - C2[0]) + dt2 * 7, hk = q.p[1] / H, R2 = r0 + (r1 - r0) * hk * hk + 0.15;
              q.p[0] = C2[0] + Math.cos(ang) * R2; q.p[2] = C2[2] + Math.sin(ang) * R2; q.p[1] += dt2 * 2.2; } }); }
      });
      fx.decal({ kind: K.arc, pal: 'galedark', p: [getC()[0], 0.03, getC()[2]], s: 2.4, life: dur, spin: -6, alpha: 0.6, tick: (q) => { const C = getC(); q.p[0] = C[0]; q.p[2] = C[2]; } });
    },
    debris(p, pal, n = 10, sp = 6, s = 0.22) {
      for (let i = 0; i < N(n); i++) { const v = dir(sp * rnd(0.5, 1), 0.75);
        fx.spawn({ kind: K.shard, pal, p: [p[0], p[1] + 0.2, p[2]], v, s: s * rnd(0.6, 1.4), aspect: rnd(0.8, 1.4), life: rnd(1.0, 1.6), grav: -16, drag: 0.3,
          spin: rnd(-14, 14), bounce: 0.35, floor: 0.08, bias: 0,
          onBounce: (q) => { if (Math.abs(q.v[1]) > 1.5) fx.spawn({ kind: K.smoke, pal: 'dust', p: [...q.p], v: [0, 0.4, 0], s0: 0.2, s1: 0.6, life: 0.6, drag: 3 }); } }); }
    },
    // Anticipation: streaks pulled into the tip on a shrinking sphere, plus an orb that swells.
    gather(getTip, pal, dur, o = {}) {
      const rate = o.rate ?? 70, R0 = o.r ?? 1.4; let acc = 0;
      const orb = fx.spawn({ kind: K.flame, pal, p: getTip(), s0: 0.05, s1: o.orb ?? 0.55, life: dur + 0.12, ease: 1.4, add: 0.35, tag: o.tag,
        tick: (q, dt) => { const t = getTip(); q.p[0] = t[0]; q.p[1] = t[1]; q.p[2] = t[2]; q.bias = -0.25 + 0.05 * Math.sin(fx.time * 40); } });
      orb.age = 0; orb.ease = 1;
      fx.during(dur, (dt, k) => {
        acc += rate * dt * (0.6 + k);
        const tip = getTip();
        while (acc >= 1) { acc--;
          const d = dir(1, 0), r = R0 * rnd(0.7, 1.1) * (1 - k * 0.4), sp = rnd(4, 7) * (0.7 + k);
          const p = [tip[0] + d[0] * r, tip[1] + d[1] * r, tip[2] + d[2] * r], life = r / sp;
          fx.spawn({ kind: K.spark, mode: M.vel, pal, p, v: [-d[0] * sp, -d[1] * sp, -d[2] * sp], s0: 0.12, s1: 0.2, aspect: 0.3, life, drag: -1.2, stretch: 0.12, add: 0.5, tag: o.tag });
        }
      });
      return orb;
    },
    // Dissipation that breaks apart rather than fades: a flame tongue that buoys up and erodes.
    lick(p, pal, s = 0.6, o = {}) {
      fx.spawn({ kind: K.flame, pal, p, v: o.v ?? [rnd(-0.4, 0.4), rnd(1.5, 3), rnd(-0.4, 0.4)], s0: s, s1: s * (o.grow ?? 0.5), life: o.life ?? rnd(0.35, 0.6), grav: o.grav ?? 4, drag: 2.2, ease: 1.5, curl: o.curl ?? 3, curlF: 8, aspect: o.aspect ?? 1.25, rot: rnd(-0.3, 0.3), bias: o.bias ?? 0, add: o.add ?? 0.15 });
    },
    // A jagged bolt from a to b, built from flickering capsule segments, with a fork or two.
    bolt(a, b, pal, o = {}) {
      const seg = o.seg ?? 9, w = o.w ?? 0.14, life = o.life ?? 0.18, jit = o.jit ?? 0.5, pts = [a];
      for (let i = 1; i < seg; i++) { const k = i / seg, s = Math.sin(k * Math.PI) * jit;
        pts.push([a[0] + (b[0] - a[0]) * k + rnd(-s, s), a[1] + (b[1] - a[1]) * k + rnd(-s, s) * 0.7, a[2] + (b[2] - a[2]) * k + rnd(-s, s)]); }
      pts.push(b);
      for (let i = 0; i < pts.length - 1; i++) { const p = pts[i], q = pts[i + 1], ax = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], L = Math.hypot(...ax) + 0.02;
        const mid = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2], P = PAL[pal] ?? pal;
        fx.spawn({ kind: K.bolt, mode: M.axis, pal, p: mid, axis: ax, len: L * 1.08, s: w, life, add: 0.5 });
        if (o.halo !== false) fx.spawn({ kind: K.strand, mode: M.axis, pal: [P[1], P[2], P[2]], p: mid, axis: ax, len: L * 1.15, s: w * 2.2, life: life * 0.9, add: 0.85, alpha: 0.35 });
        if (o.fork && Math.random() < o.fork && i > 1) { const f = [q[0] + rnd(-1, 1) * L * 1.5, q[1] + rnd(-0.6, 0.4) * L * 1.5, q[2] + rnd(-1, 1) * L * 1.5]; R.bolt(q, f, pal, { seg: 3, w: w * 0.6, life, jit: jit * 0.4 }); }
      }
      return pts;
    },
    // Projectile: squash on launch, stretch with speed, element-flavoured trail, impact callback.
    projectile(from, to, o = {}) {
      const pal = o.pal ?? 'fire', speed = o.speed ?? 16, arc = o.arc ?? 0, r = o.r ?? 0.32;
      const d = [to[0] - from[0], to[1] - from[1], to[2] - from[2]], L = Math.hypot(...d), T = L / speed;
      const v = [d[0] / T, d[1] / T + (arc ? 0.5 * 13 * T : 0), d[2] / T];
      let acc = 0; const trail = o.trail ?? 60;
      const head = fx.spawn({ kind: o.kind ?? K.flame, mode: M.vel, pal, p: [...from], v: [...v], s0: r * 2.6, s1: r * 2, life: T, ease: 4, aspect: 0.9, stretch: 0.035, grav: arc ? -13 : 0, drag: 0, add: 0.25, bias: -0.2,
        tick: (q, dt) => {
          q.aspect = 0.62 + 0.4 * Math.max(0, 1 - q.age / 0.07);  // launch squash → flight stretch
          acc += trail * dt;
          while (acc >= 1) { acc--; o.onTrail ? o.onTrail(q) : R.lick([q.p[0] + rnd(-0.08, 0.08), q.p[1] + rnd(-0.08, 0.08), q.p[2] + rnd(-0.08, 0.08)], pal, r * rnd(1.2, 1.8), { v: [q.v[0] * 0.08 + rnd(-0.5, 0.5), rnd(0.6, 1.6), q.v[2] * 0.08 + rnd(-0.5, 0.5)], life: rnd(0.25, 0.4) }); }
          if (o.core !== false && Math.random() < 0.5) fx.spawn({ kind: K.flame, pal: [PAL[pal][0], PAL[pal][0], PAL[pal][1]], p: [...q.p], s: r * 1.1, life: 0.05, add: 0.6 });
        },
        onDie: (q) => o.onHit?.([...q.p], q.v) });
      return head;
    }
  };
  return R;
}
