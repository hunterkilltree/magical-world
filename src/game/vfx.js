// Layered realistic VFX: flash → fireball → smoke, with sparks, shockwave, distortion.
// Render-only. Used by wow.js; never touches gameplay state.
import * as THREE from 'three';

const SNOISE = `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

// Fireball colour ramps: core → body → edge → soot.
const RAMPS = {
  fire: [0xfff4d6, 0xffb340, 0xd8400c, 0x160d0a],
  hexfire: [0xfff0ff, 0xff8ac8, 0xb02ad0, 0x140818],
  arcane: [0xffeaff, 0xe07bff, 0x6a1ad0, 0x120820],
  lightning: [0xffffff, 0xfff2a0, 0x5f9cff, 0x0e1626],
  earth: [0xfff0c0, 0xff8f30, 0x8a3008, 0x1a120e],
  ice: [0xffffff, 0xc8f2ff, 0x4aa8ff, 0x0c1828],
  water: [0xffffff, 0xa8dcff, 0x2f7fff, 0x0a1830]
};
const pickRamp = (els) => {
  const h = (e) => els.includes(e);
  if (h('fire') && h('arcane')) return 'hexfire';
  if (h('fire') && h('earth')) return 'earth';
  for (const e of ['fire', 'arcane', 'lightning', 'earth', 'ice', 'water']) if (h(e)) return e;
  return 'fire';
};

// Textured billboard presets (flame/smoke/dust/mist all share one atlas).
// c0 → c1 over `heat` fraction of life; glow 1 = additive, 0 = alpha (premultiplied blend).
const SM = {
  flame:    { life: [0.45, 0.75], s0: 0.5, s1: 1.5, a: 0.95, c0: [3.2, 2.0, 0.85], c1: [0.09, 0.065, 0.06], heat: 0.6, glow: 1, drag: 2.5, buoy: 2.6 },
  hotsmoke: { life: [1.5, 2.4], s0: 0.8, s1: 2.8, a: 0.72, c0: [2.4, 0.9, 0.22], c1: [0.075, 0.065, 0.07], heat: 0.2, glow: 1, drag: 1.4, buoy: 1.2 },
  smoke:    { life: [1.3, 2.1], s0: 0.6, s1: 2.2, a: 0.5, c0: [0.17, 0.15, 0.16], c1: [0.08, 0.075, 0.08], heat: 1, glow: 0, drag: 1.6, buoy: 0.9 },
  dust:     { life: [0.9, 1.5], s0: 0.5, s1: 2.0, a: 0.5, c0: [0.40, 0.35, 0.31], c1: [0.33, 0.30, 0.28], heat: 1, glow: 0, drag: 3.2, buoy: 0.25 },
  mud:      { life: [0.7, 1.1], s0: 0.4, s1: 1.3, a: 0.75, c0: [0.25, 0.17, 0.11], c1: [0.2, 0.15, 0.11], heat: 1, glow: 0, drag: 2.2, buoy: -1.5 },
  mist:     { life: [1.0, 1.8], s0: 0.6, s1: 2.2, a: 0.32, c0: [0.85, 0.96, 1.05], c1: [0.7, 0.86, 1.0], heat: 1, glow: 0.35, drag: 2.6, buoy: 0.12 },
  steam:    { life: [0.9, 1.5], s0: 0.5, s1: 2.4, a: 0.42, c0: [1.0, 1.0, 1.02], c1: [0.85, 0.88, 0.92], heat: 1, glow: 0.2, drag: 2.0, buoy: 1.8 },
  spray:    { life: [0.45, 0.8], s0: 0.3, s1: 1.2, a: 0.55, c0: [0.85, 1.0, 1.2], c1: [0.4, 0.68, 1.1], heat: 1, glow: 0.5, drag: 2.4, buoy: -2.5 },
  arcane:   { life: [0.5, 0.9], s0: 0.45, s1: 1.6, a: 0.85, c0: [2.6, 1.3, 3.2], c1: [0.25, 0.05, 0.45], heat: 0.65, glow: 1, drag: 2.6, buoy: 0.7 },
  plasma:   { life: [0.25, 0.45], s0: 0.4, s1: 1.4, a: 0.9, c0: [2.8, 2.8, 3.2], c1: [0.6, 0.9, 2.4], heat: 0.8, glow: 1, drag: 3, buoy: 0.4 },
  hex:      { life: [0.4, 0.7], s0: 0.35, s1: 1.2, a: 0.8, c0: [1.2, 3.0, 2.0], c1: [0.05, 0.4, 0.25], heat: 0.7, glow: 1, drag: 2.8, buoy: 0.5 }
};
// Velocity-stretched spark presets.
const SP = {
  fire:      { c0: [3.2, 2.4, 1.3], c1: [2.4, 0.5, 0.08], w: 0.05, life: [0.35, 0.75], grav: 9, drag: 1.1, st: 0.035 },
  lightning: { c0: [3.2, 3.2, 3.4], c1: [2.6, 2.3, 0.6], w: 0.035, life: [0.14, 0.35], grav: 3, drag: 2.2, st: 0.03 },
  ice:       { c0: [2.6, 3.1, 3.3], c1: [0.6, 1.6, 2.7], w: 0.045, life: [0.4, 0.75], grav: 14, drag: 0.7, st: 0.03 },
  water:     { c0: [1.6, 2.3, 3.0], c1: [0.3, 0.8, 2.2], w: 0.05, life: [0.5, 0.85], grav: 16, drag: 0.5, st: 0.04 },
  arcane:    { c0: [3.0, 2.2, 3.3], c1: [1.4, 0.3, 2.7], w: 0.045, life: [0.35, 0.7], grav: 0, drag: 2.2, st: 0.035 },
  earth:     { c0: [2.4, 1.9, 1.2], c1: [0.6, 0.38, 0.2], w: 0.05, life: [0.35, 0.65], grav: 16, drag: 0.5, st: 0.03 },
  hex:       { c0: [1.6, 3.2, 2.4], c1: [0.2, 1.6, 0.9], w: 0.04, life: [0.25, 0.5], grav: 2, drag: 2, st: 0.03 }
};
const SPARK_OF = { fire: 'fire', lightning: 'lightning', ice: 'ice', water: 'water', arcane: 'arcane', earth: 'earth' };
const rnd = (a, b) => a + Math.random() * (b - a);
const rateN = (r, dt) => { const n = r * dt; return Math.floor(n) + (Math.random() < n % 1 ? 1 : 0); };
const ease = (k) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);

function cloudAtlas() {
  const S = 256, C = 128, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  for (let v = 0; v < 4; v++) {
    const ox = (v % 2) * C, oy = Math.floor(v / 2) * C;
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * 6.28, r = Math.random() * 26, x = ox + C / 2 + Math.cos(a) * r, y = oy + C / 2 + Math.sin(a) * r, R = 14 + Math.random() * 26;
      const gr = g.createRadialGradient(x, y, 0, x, y, R);
      gr.addColorStop(0, 'rgba(255,255,255,.34)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(ox, oy, C, C);
    }
  }
  const img = g.getImageData(0, 0, S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4, lx = (x % C) / C - 0.5, ly = (y % C) / C - 0.5, rr = Math.hypot(lx, ly);
    const mask = Math.max(0, Math.min(1, (0.48 - rr) / 0.16));
    const n = 0.75 + 0.25 * Math.sin(x * 0.31 + Math.sin(y * 0.17) * 2) * Math.sin(y * 0.27 + Math.sin(x * 0.13) * 2);
    const a = Math.min(1, (d[i + 3] / 255) * 1.25) * mask * n;
    const shade = 0.5 + 0.5 * Math.min(1, a * 1.4);
    d[i] = d[i + 1] = d[i + 2] = 255 * shade; d[i + 3] = 255 * a;
  }
  g.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(c);
}

function starTexture() {
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d'), h = S / 2;
  const gr = g.createRadialGradient(h, h, 0, h, h, h);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.12, 'rgba(255,255,255,.75)'); gr.addColorStop(0.4, 'rgba(255,255,255,.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'lighter';
  [[S, 7, 0], [S * 0.85, 5, Math.PI / 2], [S * 0.45, 3, Math.PI / 4], [S * 0.45, 3, -Math.PI / 4]].forEach(([L, w, a]) => {
    g.save(); g.translate(h, h); g.rotate(a);
    const lg = g.createLinearGradient(-L / 2, 0, L / 2, 0);
    lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.5, 'rgba(255,255,255,.95)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = lg; g.beginPath(); g.ellipse(0, 0, L / 2, w, 0, 0, Math.PI * 2); g.fill(); g.restore();
  });
  return new THREE.CanvasTexture(c);
}

class Smoke {
  constructor(scene, max, tex) {
    this.max = max; this.next = 0;
    const F = (n) => new Float32Array(max * n);
    Object.assign(this, { p: F(3), c: F(3), sz: F(1), al: F(1), rot: F(1), vr: F(1), gl: F(1),
      v: F(3), life: F(1), L: F(1), s0: F(1), s1: F(1), a0: F(1), c0: F(3), c1: F(3), heat: F(1), g0: F(1), drag: F(1), buoy: F(1), rs: F(1) });
    const geo = new THREE.BufferGeometry(), at = (arr, n) => new THREE.BufferAttribute(arr, n).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', (this.aP = at(this.p, 3)));
    geo.setAttribute('pcolor', (this.aC = at(this.c, 3)));
    geo.setAttribute('psize', (this.aS = at(this.sz, 1)));
    geo.setAttribute('palpha', (this.aA = at(this.al, 1)));
    geo.setAttribute('prot', (this.aR = at(this.rot, 1)));
    geo.setAttribute('pvar', at(this.vr, 1));
    geo.setAttribute('pglow', (this.aG = at(this.gl, 1)));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 500 }, uTex: { value: tex } },
      vertexShader: `attribute vec3 pcolor; attribute float psize, palpha, prot, pvar, pglow; uniform float uScale;
        varying vec3 vC; varying float vA, vR, vV, vG;
        void main() { vC = pcolor; vA = palpha; vR = prot; vV = pvar; vG = pglow;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = palpha > 0.0 ? min(psize * uScale / -mv.z, 900.0) : 0.0; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D uTex; varying vec3 vC; varying float vA, vR, vV, vG;
        void main() { vec2 c = gl_PointCoord - 0.5; float s = sin(vR), co = cos(vR);
          c = vec2(co * c.x - s * c.y, s * c.x + co * c.y) + 0.5;
          vec2 uv = (clamp(c, 0.01, 0.99) + vec2(mod(vV, 2.0), floor(vV / 2.0))) * 0.5;
          vec4 t = texture2D(uTex, uv); float a = t.a * vA;
          gl_FragColor = vec4(vC * t.r * a, a * (1.0 - vG)); }`,
      transparent: true, depthWrite: false, blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
    scene.add(this.points);
  }
  emit(P, x, y, z, vx, vy, vz, o = {}) {
    const i = this.next, j = i * 3, k = o.k ?? 1;
    this.next = (i + 1) % this.max;
    const L = o.life ?? rnd(P.life[0], P.life[1]);
    this.p[j] = x; this.p[j + 1] = y; this.p[j + 2] = z;
    this.v[j] = vx; this.v[j + 1] = vy; this.v[j + 2] = vz;
    this.life[i] = L; this.L[i] = L;
    this.s0[i] = P.s0 * k * rnd(0.8, 1.2); this.s1[i] = P.s1 * k * rnd(0.8, 1.25);
    this.a0[i] = (o.a ?? P.a); this.heat[i] = P.heat; this.g0[i] = o.glow ?? P.glow;
    const c0 = o.c0 ?? P.c0, c1 = o.c1 ?? P.c1;
    for (let q = 0; q < 3; q++) { this.c0[j + q] = c0[q]; this.c1[j + q] = c1[q]; this.c[j + q] = c0[q]; }
    this.drag[i] = o.drag ?? P.drag; this.buoy[i] = o.buoy ?? P.buoy;
    this.rot[i] = Math.random() * 6.28; this.rs[i] = rnd(-1.6, 1.6); this.vr[i] = (Math.random() * 4) | 0;
    this.sz[i] = this.s0[i]; this.al[i] = 0; this.gl[i] = this.g0[i];
  }
  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      const l = (this.life[i] -= dt);
      if (l <= 0) { this.al[i] = 0; continue; }
      const j = i * 3, age = this.L[i] - l, k = age / this.L[i], dr = Math.max(0, 1 - this.drag[i] * dt);
      this.v[j] *= dr; this.v[j + 1] = this.v[j + 1] * dr + this.buoy[i] * dt; this.v[j + 2] *= dr;
      this.p[j] += this.v[j] * dt; this.p[j + 1] += this.v[j + 1] * dt; this.p[j + 2] += this.v[j + 2] * dt;
      if (this.p[j + 1] < 0.1) { this.p[j + 1] = 0.1; this.v[j + 1] = Math.abs(this.v[j + 1]) * 0.2; }
      const h = Math.min(1, k / this.heat[i]);
      for (let q = 0; q < 3; q++) this.c[j + q] = this.c0[j + q] + (this.c1[j + q] - this.c0[j + q]) * h;
      this.gl[i] = this.g0[i] * (1 - h);
      this.sz[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * (1 - (1 - k) * (1 - k));
      this.rot[i] += this.rs[i] * dt * (1 - k * 0.7);
      const fin = Math.min(1, age / (0.06 * this.L[i] + 0.02)), fout = k < 0.5 ? 1 : 1 - (k - 0.5) / 0.5;
      this.al[i] = this.a0[i] * fin * fout * fout;
    }
    this.aP.needsUpdate = this.aC.needsUpdate = this.aS.needsUpdate = this.aA.needsUpdate = this.aR.needsUpdate = this.aG.needsUpdate = true;
  }
  clear() { this.life.fill(0); this.al.fill(0); this.aA.needsUpdate = true; }
}

class Streaks {
  constructor(scene, max) {
    this.max = max; this.next = 0;
    const base = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.attributes.position);
    const F = (n) => new Float32Array(max * n), at = (arr, n) => new THREE.InstancedBufferAttribute(arr, n).setUsage(THREE.DynamicDrawUsage);
    Object.assign(this, { ip: F(3), iv: F(3), ic: F(4), iw: F(1), v: F(3), life: F(1), L: F(1), c0: F(3), c1: F(3), grav: F(1), drag: F(1), st: F(1), w0: F(1) });
    geo.setAttribute('iPos', (this.aP = at(this.ip, 3)));
    geo.setAttribute('iVel', (this.aV = at(this.iv, 3)));
    geo.setAttribute('iCol', (this.aC = at(this.ic, 4)));
    geo.setAttribute('iW', (this.aW = at(this.iw, 1)));
    geo.instanceCount = max;
    const mat = new THREE.ShaderMaterial({
      vertexShader: `attribute vec3 iPos, iVel; attribute vec4 iCol; attribute float iW; varying vec4 vC; varying vec2 vUv;
        void main() {
          vec4 a = viewMatrix * vec4(iPos, 1.0), b = viewMatrix * vec4(iPos - iVel, 1.0);
          vec2 d = b.xy - a.xy; float L = length(d); vec2 dir = L > 1e-4 ? d / L : vec2(0.0, 1.0); vec2 perp = vec2(-dir.y, dir.x);
          vec4 p = mix(a, b, position.y); p.xy += perp * position.x * iW + dir * iW * (position.y - 0.5);
          vC = iCol; vUv = vec2(position.x + 0.5, position.y); gl_Position = projectionMatrix * p; }`,
      fragmentShader: `varying vec4 vC; varying vec2 vUv;
        void main() { float x = 1.0 - abs(vUv.x * 2.0 - 1.0); float a = x * x * (1.0 - vUv.y * 0.8) * vC.a; gl_FragColor = vec4(vC.rgb * a, 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    scene.add(this.mesh);
  }
  emit(P, x, y, z, vx, vy, vz, o = {}) {
    const i = this.next, j = i * 3;
    this.next = (i + 1) % this.max;
    const L = o.life ?? rnd(P.life[0], P.life[1]);
    this.ip[j] = x; this.ip[j + 1] = y; this.ip[j + 2] = z;
    this.v[j] = vx; this.v[j + 1] = vy; this.v[j + 2] = vz;
    this.life[i] = L; this.L[i] = L;
    for (let q = 0; q < 3; q++) { this.c0[j + q] = P.c0[q]; this.c1[j + q] = P.c1[q]; }
    this.grav[i] = o.grav ?? P.grav; this.drag[i] = P.drag; this.st[i] = o.st ?? P.st; this.w0[i] = P.w * (o.w ?? 1) * rnd(0.7, 1.3);
  }
  update(dt) {
    for (let i = 0; i < this.max; i++) {
      const j = i * 3;
      if (this.life[i] <= 0) { if (this.iw[i]) { this.iw[i] = 0; this.ic[i * 4 + 3] = 0; } continue; }
      const l = (this.life[i] -= dt), k = 1 - Math.max(0, l) / this.L[i], dr = Math.max(0, 1 - this.drag[i] * dt);
      this.v[j] *= dr; this.v[j + 1] = this.v[j + 1] * dr - this.grav[i] * dt; this.v[j + 2] *= dr;
      this.ip[j] += this.v[j] * dt; this.ip[j + 1] += this.v[j + 1] * dt; this.ip[j + 2] += this.v[j + 2] * dt;
      if (this.ip[j + 1] < 0.04) { this.ip[j + 1] = 0.04; this.v[j + 1] *= -0.35; this.v[j] *= 0.6; this.v[j + 2] *= 0.6; }
      for (let q = 0; q < 3; q++) { this.iv[j + q] = this.v[j + q] * this.st[i]; this.ic[i * 4 + q] = this.c0[j + q] + (this.c1[j + q] - this.c0[j + q]) * Math.min(1, k * 1.6); }
      this.ic[i * 4 + 3] = l <= 0 ? 0 : Math.pow(1 - k, 0.8);
      this.iw[i] = l <= 0 ? 0 : this.w0[i] * (1 - k * 0.5);
    }
    this.aP.needsUpdate = this.aV.needsUpdate = this.aC.needsUpdate = this.aW.needsUpdate = true;
  }
  clear() { this.life.fill(0); }
}

const STRIP_VS = `attribute float aU, aF; varying float vU, vF; void main() { vU = aU; vF = aF; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const STRIP_FS = `uniform vec3 uColor; uniform float uA, uPow; varying float vU, vF;
  void main() { float f = 1.0 - abs(vU * 2.0 - 1.0); gl_FragColor = vec4(uColor * pow(f, uPow) * vF * uA, 1.0); }`;
const stripMat = (hex, k, pw) => new THREE.ShaderMaterial({
  uniforms: { uColor: { value: new THREE.Color(hex).multiplyScalar(k) }, uA: { value: 1 }, uPow: { value: pw } },
  vertexShader: STRIP_VS, fragmentShader: STRIP_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
});

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _s = new THREE.Vector3(), _r = new THREE.Vector3(), _cp = new THREE.Vector3();

// Camera-facing quads for a list of [a, b, width, fade] segments.
function segGeo(segs, cam) {
  const n = segs.length, pos = new Float32Array(n * 12), u = new Float32Array(n * 4), f = new Float32Array(n * 4), idx = [];
  segs.forEach(([a, b, w, fd], i) => {
    _d.subVectors(b, a); const L = _d.length() || 1; _d.divideScalar(L);
    _s.crossVectors(_d, _cp.subVectors(cam, a)).normalize().multiplyScalar(w);
    const ea = _a.copy(a).addScaledVector(_d, -w * 0.6), eb = _b.copy(b).addScaledVector(_d, w * 0.6), o = i * 12;
    pos.set([ea.x + _s.x, ea.y + _s.y, ea.z + _s.z, ea.x - _s.x, ea.y - _s.y, ea.z - _s.z, eb.x + _s.x, eb.y + _s.y, eb.z + _s.z, eb.x - _s.x, eb.y - _s.y, eb.z - _s.z], o);
    u.set([0, 1, 0, 1], i * 4); f.set([fd, fd, fd, fd], i * 4);
    const v = i * 4; idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aU', new THREE.BufferAttribute(u, 1));
  g.setAttribute('aF', new THREE.BufferAttribute(f, 1));
  g.setIndex(idx);
  return g;
}

function fractal(a, b, depth, rough, out) {
  if (!depth) { out.push(b.clone()); return; }
  const L = a.distanceTo(b), m = a.clone().lerp(b, 0.5);
  _d.subVectors(b, a).normalize();
  _r.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
  _r.addScaledVector(_d, -_r.dot(_d)).normalize();
  m.addScaledVector(_r, (Math.random() - 0.5) * L * rough);
  fractal(a, m, depth - 1, rough, out);
  fractal(m, b, depth - 1, rough, out);
}

function boltSegs(pts) {
  const segs = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], L = a.distanceTo(b), path = [a.clone()];
    fractal(a, b, L > 6 ? 5 : L > 2.5 ? 4 : 3, 0.32, path);
    for (let k = 0; k < path.length - 1; k++) {
      segs.push([path[k], path[k + 1], 1, 1]);
      if (k > 0 && k < path.length - 2 && Math.random() < 0.28) {
        _d.subVectors(path[k + 1], path[k]).normalize();
        _r.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
        const dir = _d.clone().multiplyScalar(0.75).addScaledVector(_r, 0.7).normalize();
        const end = path[k].clone().addScaledVector(dir, L * rnd(0.12, 0.3));
        if (end.y < 0.05) end.y = 0.05;
        const br = [path[k].clone()];
        fractal(path[k], end, 3, 0.4, br);
        for (let q = 0; q < br.length - 1; q++) segs.push([br[q], br[q + 1], 0.55 * (1 - q / br.length), 0.6 * (1 - q / br.length)]);
      }
    }
  }
  return segs;
}

export function createVfx({ scene, camera, renderer, flash }) {
  const cloud = cloudAtlas(), star = starTexture();
  const smoke = new Smoke(scene, 1800, cloud);
  const sparks = new Streaks(scene, 1600);
  const FB_GEO = new THREE.IcosahedronGeometry(1, 5);
  const SHELL_GEO = new THREE.SphereGeometry(1, 40, 20);
  const DOME_GEO = new THREE.SphereGeometry(1, 40, 14, 0, Math.PI * 2, 0, Math.PI / 2);
  const live = [], heats = [], trails = new Map();
  const kick = new THREE.Vector3();
  const lights = Array.from({ length: 4 }, () => { const l = new THREE.PointLight(0xffffff, 0, 6, 2); scene.add(l); return l; });
  const flarePool = Array.from({ length: 10 }, () => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: star, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true }));
    s.visible = false; s.renderOrder = 6; scene.add(s); return { s, life: 0, max: 1, size: 1 };
  });
  let flareI = 0, t = 0;
  const camPos = new THREE.Vector3();

  function add(obj, life, tick) { scene.add(obj); live.push({ obj, life, max: life, tick }); }

  const S = (name, x, y, z, vx, vy, vz, o) => smoke.emit(SM[name], x, y, z, vx, vy, vz, o);
  const K = (name, x, y, z, vx, vy, vz, o) => sparks.emit(SP[name], x, y, z, vx, vy, vz, o);

  function flare(x, y, z, hex, size, life = 0.14) {
    const f = flarePool[flareI++ % flarePool.length];
    f.s.position.set(x, y, z); f.s.material.color.set(hex).multiplyScalar(2.2); f.s.material.rotation = Math.random() * 6.28;
    f.life = f.max = life; f.size = size; f.s.visible = true;
  }

  function heat(x, y, z, r, life, s = 1) { heats.push({ x, y, z, r, life, max: life, s }); if (heats.length > 8) heats.shift(); }

  function fireball(x, y, z, r, ramp, life = 0.6) {
    const R = RAMPS[ramp] || RAMPS.fire;
    const m = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: Math.random() * 20 }, uAge: { value: 0 }, uC0: { value: new THREE.Color(R[0]) }, uC1: { value: new THREE.Color(R[1]) }, uC2: { value: new THREE.Color(R[2]) }, uC3: { value: new THREE.Color(R[3]) } },
      vertexShader: SNOISE + `uniform float uTime; varying float vN; varying vec3 vNor, vView;
        void main() { vec3 q = position * 1.5 + vec3(0.0, -uTime * 2.2, 0.0);
          float n = snoise(q) * 0.62 + snoise(q * 2.4 + 7.1) * 0.3 + snoise(q * 5.0 - 3.0) * 0.12; vN = n;
          vec3 p = position * (1.0 + n * 0.32); vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vNor = normalize(normalMatrix * normal); vView = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float uAge; uniform vec3 uC0, uC1, uC2, uC3; varying float vN; varying vec3 vNor, vView;
        void main() { float fr = clamp(dot(normalize(vNor), normalize(vView)), 0.0, 1.0);
          float h = clamp(0.3 + fr * 0.8 + vN * 0.5 - uAge * 1.3, 0.0, 1.0);
          if (vN * 0.5 + 0.5 < uAge * 1.45 - 0.35) discard;
          vec3 c = h > 0.66 ? mix(uC1, uC0, (h - 0.66) / 0.34) : h > 0.33 ? mix(uC2, uC1, (h - 0.33) / 0.33) : mix(uC3, uC2, h / 0.33);
          gl_FragColor = vec4(c * (0.3 + h * h * 3.4), 1.0); }`
    });
    const o = new THREE.Mesh(FB_GEO, m);
    o.position.set(x, y, z);
    add(o, life, (k, dt) => {
      m.uniforms.uAge.value = k; m.uniforms.uTime.value += dt;
      o.scale.setScalar(r * (0.3 + 0.75 * ease(k * 2.6)));
      o.position.y = y + k * r * 0.5;
    });
  }

  function shell(x, y, z, r, hex, life = 0.3, dome = false, k0 = 2.4) {
    const m = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(hex).multiplyScalar(k0) }, uA: { value: 1 } },
      vertexShader: `varying vec3 vNor, vView; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vNor = normalize(normalMatrix * normal); vView = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 uColor; uniform float uA; varying vec3 vNor, vView;
        void main() { float f = 1.0 - abs(dot(normalize(vNor), normalize(vView))); gl_FragColor = vec4(uColor * pow(f, 2.6) * uA, 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
    });
    const o = new THREE.Mesh(dome ? DOME_GEO : SHELL_GEO, m);
    o.position.set(x, y, z);
    add(o, life, (k) => { o.scale.set(r * (0.15 + 0.85 * ease(k)), r * (0.15 + 0.85 * ease(k)) * (dome ? 0.55 : 1), r * (0.15 + 0.85 * ease(k))); m.uniforms.uA.value = (1 - k) * (1 - k); });
  }

  function bolt(pts3, hex, o = {}) {
    const life = o.life ?? 0.26, glowW = o.w ?? 0.2, g = new THREE.Group();
    const glowM = stripMat(hex, 1.7, 2.2), coreM = stripMat(0xfff8e8, 3.2, 0.9);
    const build = () => {
      for (const c of [...g.children]) { c.geometry.dispose(); g.remove(c); }
      const segs = boltSegs(pts3);
      g.add(new THREE.Mesh(segGeo(segs.map(([a, b, w, f]) => [a, b, glowW * w, f]), camPos), glowM));
      g.add(new THREE.Mesh(segGeo(segs.map(([a, b, w, f]) => [a, b, 0.045 * w, f]), camPos), coreM));
    };
    build();
    let next = 0.07;
    add(g, life, (k, dt, el) => {
      if (el > next && k < 0.8) { next += 0.07; build(); }
      const fl = Math.random() > 0.22 ? 1 : 0.25;
      glowM.uniforms.uA.value = coreM.uniforms.uA.value = fl * (1 - k * k);
    });
    const end = pts3[pts3.length - 1];
    for (let i = 0; i < (o.quiet ? 2 : 8); i++) K('lightning', end.x, end.y, end.z, rnd(-7, 7), rnd(1, 7), rnd(-7, 7));
    if (!o.quiet) { flare(end.x, end.y, end.z, hex, 1.6, 0.1); flash?.(end.x, end.z, hex, 30); }
  }

  function dustRing(x, z, r, n = 18, speed = 6, kind = 'dust') {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.28 + Math.random() * 0.3, sp = speed * rnd(0.7, 1.2);
      S(kind, x + Math.sin(a) * r * 0.3, 0.25, z + Math.cos(a) * r * 0.3, Math.sin(a) * sp, rnd(0.2, 1.2), Math.cos(a) * sp);
    }
  }

  function radialSparks(name, x, y, z, n, s0, s1, up = 0.6) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, u = Math.random() * up + 0.05, sp = rnd(s0, s1), h = Math.sqrt(1 - u * u);
      K(name, x, y, z, Math.cos(a) * h * sp, u * sp, Math.sin(a) * h * sp);
    }
  }

  function crown(x, z, r, n = 26) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.28 + Math.random() * 0.2, sp = rnd(3, 6);
      K('water', x + Math.sin(a) * r * 0.5, 0.15, z + Math.cos(a) * r * 0.5, Math.sin(a) * sp, rnd(6, 10), Math.cos(a) * sp);
      if (i % 2 === 0) S('spray', x + Math.sin(a) * r * 0.5, 0.3, z + Math.cos(a) * r * 0.5, Math.sin(a) * sp * 0.6, rnd(3, 5), Math.cos(a) * sp * 0.6);
    }
    for (let i = 0; i < 10; i++) S('mist', x + rnd(-r, r) * 0.6, 0.3, z + rnd(-r, r) * 0.6, rnd(-1, 1), 0.4, rnd(-1, 1));
  }

  // ---------------------------------------------------------------- recipes
  function release(e, tip, tier) {
    if (!tip) return;
    const els = [...new Set(e.els)], dx = e.dx, dz = e.dz, has = (x) => els.includes(x);
    const shape = e.shape, power = Math.max(1, tier), mode = e.mode;
    const fx = tip.x, fy = tip.y, fz = tip.z;
    flare(fx, fy, fz, e.color, 1.1 + power * 0.55, 0.1 + power * 0.03);
    shell(fx, fy, fz, 0.5 + power * 0.35, e.color, 0.22);
    kick.addScaledVector(new THREE.Vector3(-dx, 0.15, -dz), 0.12 * power);
    const spread = shape === 'cone' ? 0.6 : shape === 'area' || shape === 'wall' || mode !== 'aim' ? Math.PI : 0.22;
    const base = Math.atan2(dx, dz), n = Math.round(8 + 10 * power);
    for (const el of els) {
      const sk = SPARK_OF[el];
      for (let i = 0; i < n; i++) {
        const a = base + rnd(-spread, spread), sp = rnd(8, 18) * (mode === 'aim' ? 1 : 0.6);
        K(sk, fx, fy, fz, Math.sin(a) * sp, rnd(-1, 3), Math.cos(a) * sp);
      }
      const m = Math.round(3 + 3 * power);
      for (let i = 0; i < m; i++) {
        const a = base + rnd(-spread, spread) * 0.7, sp = rnd(2, 5);
        if (el === 'fire') S('flame', fx, fy, fz, Math.sin(a) * sp, rnd(0, 1), Math.cos(a) * sp, { k: 0.7 });
        else if (el === 'arcane') S('arcane', fx, fy, fz, Math.sin(a) * sp, rnd(0, 1), Math.cos(a) * sp, { k: 0.7 });
        else if (el === 'water') S('spray', fx, fy, fz, Math.sin(a) * sp * 1.5, rnd(0, 2), Math.cos(a) * sp * 1.5, { k: 0.7 });
        else if (el === 'ice') S('mist', fx, fy, fz, Math.sin(a) * sp, rnd(0, 0.5), Math.cos(a) * sp, { k: 0.6 });
        else if (el === 'lightning') S('plasma', fx, fy, fz, Math.sin(a) * sp, rnd(0, 1), Math.cos(a) * sp, { k: 0.6 });
      }
      if (el === 'fire') heat(fx, fy, fz, 1.0, 0.5, 0.7);
      if (el === 'lightning') for (let i = 0; i < Math.ceil(power); i++) {
        const a = base + rnd(-0.6, 0.6), L = rnd(1.2, 2.4);
        bolt([new THREE.Vector3(fx, fy, fz), new THREE.Vector3(fx + Math.sin(a) * L, fy + rnd(-0.6, 0.3), fz + Math.cos(a) * L)], 0xf4e15c, { life: 0.12, w: 0.12, quiet: true });
      }
    }
    if (tier >= 2) {
      // anticipation → climax: streaks converge on the staff then blow out
      for (let i = 0; i < 22; i++) {
        const a = Math.random() * 6.28, b = rnd(-0.6, 0.9), R = rnd(1.2, 1.8);
        const ox = Math.cos(a) * Math.cos(b) * R, oy = Math.sin(b) * R, oz = Math.sin(a) * Math.cos(b) * R;
        K(SPARK_OF[els[i % els.length]], fx + ox, fy + oy, fz + oz, -ox * 9, -oy * 9, -oz * 9, { life: 0.11, grav: 0, st: 0.05 });
      }
      dustRing(e.x, e.z, 1.2, Math.round(8 + 4 * tier), 4 + tier, has('ice') ? 'mist' : 'dust');
      shell(e.x, 0, e.z, 1.6 + tier * 0.4, e.color, 0.35, true, 1.6);
    }
  }

  function blast(e) {
    const R = e.r, has = (x) => e.els.includes(x), big = !!e.big, noKey = !e.key;
    shell(e.x, 0, e.z, R * 1.25, e.color, big ? 0.38 : 0.28, true);
    flare(e.x, 1.0, e.z, e.color, R * (big ? 2.4 : 1.6), big ? 0.16 : 0.1);
    if (noKey || has('fire') || has('arcane') || has('lightning')) fireball(e.x, 0.75, e.z, R * (big ? 0.72 : 0.55), noKey ? 'fire' : pickRamp(e.els), big ? 0.85 : 0.6);
    const n = big ? 60 : 32, els = noKey ? ['fire'] : [...new Set(e.els)];
    els.forEach((el) => radialSparks(SPARK_OF[el] || 'fire', e.x, 0.8, e.z, Math.round(n / els.length) + 6, 8, big ? 24 : 16, 0.8));
    dustRing(e.x, e.z, R, big ? 26 : 14, R * 3, has('ice') && !has('fire') ? 'mist' : 'dust');
    if (noKey || has('fire')) {
      for (let i = 0; i < (big ? 16 : 9); i++) S('flame', e.x + rnd(-R, R) * 0.4, rnd(0.4, 1.2), e.z + rnd(-R, R) * 0.4, rnd(-3, 3), rnd(1, 4), rnd(-3, 3), { k: R * 0.55 });
      for (let i = 0; i < (big ? 14 : 7); i++) S('hotsmoke', e.x + rnd(-R, R) * 0.35, rnd(0.6, 1.6), e.z + rnd(-R, R) * 0.35, rnd(-1.5, 1.5), rnd(1.5, 3.2), rnd(-1.5, 1.5), { k: R * 0.5 });
      heat(e.x, 1.2, e.z, R * 1.5, 1.3, 1);
    } else if (has('arcane')) {
      for (let i = 0; i < 18; i++) { const a = Math.random() * 6.28, sp = rnd(3, 7); S('arcane', e.x, 0.9, e.z, Math.sin(a) * sp, rnd(-0.5, 2), Math.cos(a) * sp, { k: R * 0.45 }); }
      for (let i = 0; i < 6; i++) S('smoke', e.x + rnd(-1, 1), 0.8, e.z + rnd(-1, 1), rnd(-1, 1), rnd(0.5, 1.5), rnd(-1, 1), { k: R * 0.45 });
    }
    if (has('lightning')) {
      bolt([new THREE.Vector3(e.x + rnd(-2, 2), 16, e.z - rnd(2, 5)), new THREE.Vector3(e.x, 0.05, e.z)], 0xf4e15c, { life: 0.3, w: 0.32 });
      shell(e.x, 0.9, e.z, R * 0.9, 0xc8e0ff, 0.2);
      for (let i = 0; i < 8; i++) S('plasma', e.x, 0.9, e.z, rnd(-4, 4), rnd(0, 3), rnd(-4, 4), { k: R * 0.4 });
    }
    if (has('ice')) { radialSparks('ice', e.x, 0.6, e.z, 24, 6, 14, 0.9); for (let i = 0; i < 12; i++) S('mist', e.x + rnd(-R, R) * 0.5, 0.4, e.z + rnd(-R, R) * 0.5, rnd(-2, 2), 0.3, rnd(-2, 2), { k: R * 0.5 }); }
    if (has('water')) crown(e.x, e.z, R);
    if (has('earth')) for (let i = 0; i < (big ? 10 : 6); i++) S('dust', e.x + rnd(-R, R) * 0.3, rnd(0.4, 1.4), e.z + rnd(-R, R) * 0.3, rnd(-1.5, 1.5), rnd(1, 3), rnd(-1.5, 1.5), { k: R * 0.5, buoy: 0.6 });
    kick.y += big ? 0.35 : 0.15;
  }

  function hit(e) {
    if (e.enemy) { radialSparks('hex', e.x, 1.1, e.z, 12, 3, 8); for (let i = 0; i < 4; i++) S('hex', e.x, 1.1, e.z, rnd(-2, 2), rnd(0, 1.5), rnd(-2, 2)); return; }
    const els = [...new Set(e.els)], y = e.kind === 'boulder' ? 0.8 : 1.1;
    flare(e.x, y, e.z, e.color, 1.0, 0.08);
    for (const el of els) {
      radialSparks(SPARK_OF[el], e.x, y, e.z, 10, 4, 11);
      if (el === 'fire') for (let i = 0; i < 4; i++) S('flame', e.x, y, e.z, rnd(-2, 2), rnd(0, 2), rnd(-2, 2), { k: 0.6 });
      if (el === 'arcane') for (let i = 0; i < 4; i++) S('arcane', e.x, y, e.z, rnd(-2.5, 2.5), rnd(0, 2), rnd(-2.5, 2.5), { k: 0.55 });
      if (el === 'water') for (let i = 0; i < 4; i++) S('spray', e.x, y, e.z, rnd(-3, 3), rnd(1, 3), rnd(-3, 3), { k: 0.6 });
      if (el === 'ice') for (let i = 0; i < 3; i++) S('mist', e.x, y, e.z, rnd(-1.5, 1.5), 0.2, rnd(-1.5, 1.5), { k: 0.6 });
    }
    if (e.kind === 'boulder') { dustRing(e.x, e.z, 1.2, 14, 4.5); shell(e.x, 0, e.z, 1.8, 0xffd9a0, 0.25, true, 1.2); kick.y += 0.12; }
  }

  function cone(e) {
    const a0 = Math.atan2(e.dx, e.dz), half = (e.arc * Math.PI) / 360, els = e.els, steam = els.includes('fire') && els.includes('water');
    const mud = els.includes('earth') && els.includes('water'), R = e.range;
    const along = (fn, n, k0, k1) => { for (let i = 0; i < n; i++) { const a = a0 + rnd(-half, half) * 0.9, sp = R * rnd(k0, k1); fn(e.x + Math.sin(a) * 0.6, 1.0, e.z + Math.cos(a) * 0.6, Math.sin(a) * sp, rnd(-0.2, 0.6), Math.cos(a) * sp); } };
    if (steam) along((x, y, z, vx, vy, vz) => S('steam', x, y, z, vx, vy, vz, { drag: 2.6, k: 1.1 }), 34, 2.2, 3);
    else if (els.includes('fire')) {
      along((x, y, z, vx, vy, vz) => S('flame', x, y, z, vx, vy, vz, { drag: 2.6, k: 1.0 }), 40, 2.2, 3.1);
      along((x, y, z, vx, vy, vz) => S('hotsmoke', x, y + 0.3, z, vx * 0.6, vy + 1, vz * 0.6, { k: 0.7, life: rnd(1, 1.5) }), 6, 2, 2.6);
      along((x, y, z, vx, vy, vz) => K('fire', x, y, z, vx * 1.3, vy + 2, vz * 1.3), 26, 2.4, 3.6);
      heat(e.x + Math.sin(a0) * R * 0.5, 1, e.z + Math.cos(a0) * R * 0.5, R * 0.7, 0.7, 1);
    }
    if (mud) along((x, y, z, vx, vy, vz) => S('mud', x, y, z, vx, vy + 3, vz, { drag: 2.4, k: 1.2 }), 24, 2.2, 3);
    else if (els.includes('water') && !steam) {
      along((x, y, z, vx, vy, vz) => S('spray', x, y, z, vx, vy + 1, vz, { drag: 2.4, k: 1.1 }), 30, 2.2, 3);
      along((x, y, z, vx, vy, vz) => K('water', x, y, z, vx * 1.4, vy + 3, vz * 1.4), 30, 2.4, 3.4);
    }
  }

  function areaStart(e) {
    if (e.key === 'ice+water') { for (let i = 0; i < 30; i++) { const a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * e.r; S('mist', e.x + Math.sin(a) * r, 0.3, e.z + Math.cos(a) * r, Math.sin(a) * 2.5, 0.3, Math.cos(a) * 2.5, { k: 1.2 }); } radialSparks('ice', e.x, 0.3, e.z, 34, 4, 10, 0.95); shell(e.x, 0, e.z, e.r * 1.1, 0xbfefff, 0.4, true, 1.6); }
    else if (e.key === 'lightning+water') { crown(e.x, e.z, e.r, 30); for (let i = 0; i < 2; i++) bolt([new THREE.Vector3(e.x + rnd(-3, 3), 15, e.z - rnd(2, 5)), new THREE.Vector3(e.x + rnd(-1, 1), 0.05, e.z + rnd(-1, 1))], 0xf4e15c, { life: 0.3, w: 0.3 }); shell(e.x, 0, e.z, e.r * 1.1, 0x9fd0ff, 0.35, true); }
    else if (e.key === 'arcane+water') { for (let i = 0; i < 30; i++) { const a = Math.random() * 6.28, r = e.r * rnd(0.6, 1); S('arcane', e.x + Math.sin(a) * r, 0.4, e.z + Math.cos(a) * r, Math.cos(a) * 4 - Math.sin(a) * 2, 0.4, -Math.sin(a) * 4 - Math.cos(a) * 2, { k: 0.8 }); } }
    else if (e.key === 'burning') { for (let i = 0; i < 14; i++) S('flame', e.x + rnd(-e.r, e.r) * 0.6, 0.3, e.z + rnd(-e.r, e.r) * 0.6, 0, rnd(0.5, 2), 0, { k: 0.9 }); }
    else if (e.delay > 0) { radialSparks('arcane', e.x, 0.2, e.z, 20, 2, 5, 1); }
  }

  function wall(e) {
    for (let i = 0; i < e.n; i++) {
      const o = (i - (e.n - 1) / 2) * 0.95, x = e.x - e.dz * o, z = e.z + e.dx * o;
      for (let k = 0; k < 4; k++) S(e.mat === 'ice' ? 'mist' : 'dust', x, 0.3, z, rnd(-2.5, 2.5), rnd(0.4, 1.5), rnd(-2.5, 2.5), { k: 0.9 });
      radialSparks(e.mat === 'ice' ? 'ice' : 'earth', x, 0.5, z, 4, 3, 7, 0.9);
    }
    kick.y += 0.2;
  }

  function tag(e) {
    if (e.tag === 'shatter') { radialSparks('ice', e.x, 1, e.z, 34, 6, 16, 0.85); for (let i = 0; i < 8; i++) S('mist', e.x, 0.8, e.z, rnd(-2.5, 2.5), rnd(0, 1), rnd(-2.5, 2.5)); shell(e.x, 1, e.z, 1.8, 0xe0f8ff, 0.22); flare(e.x, 1, e.z, 0xbfefff, 2, 0.1); }
    else if (e.tag === 'freeze') for (let i = 0; i < 8; i++) S('mist', e.x, 0.4, e.z, rnd(-1.5, 1.5), 0.2, rnd(-1.5, 1.5), { k: 0.7 });
    else if (e.tag === 'conduct') radialSparks('lightning', e.x, 1, e.z, 14, 5, 12);
    else if (e.tag === 'steam') for (let i = 0; i < 8; i++) S('steam', e.x, 1, e.z, rnd(-1, 1), rnd(0.5, 1.5), rnd(-1, 1), { k: 0.8 });
  }

  // ---------------------------------------------------------------- per-frame
  function updateTrails(s, dt) {
    const seen = new Set();
    let li = 0;
    for (const b of s.shots) {
      seen.add(b.id);
      let tr = trails.get(b.id);
      const y = b.kind === 'boulder' ? 0.95 : 1.15;
      if (!tr) {
        const hex = b.owner === 'enemy' ? 0x5cffb0 : b.sp.color, w = b.kind === 'boulder' ? 0.42 : b.kind === 'orb' ? 0.3 : 0.16 + b.r * 0.6;
        const glowM = stripMat(hex, 1.6, 1.6), coreM = stripMat(0xffffff, 1.2, 1.0);
        const g = new THREE.Group(); scene.add(g);
        tr = { pts: [], g, glowM, coreM, w, dying: 0, hot: b.owner === 'player' && b.els?.includes('fire'), arc: b.owner === 'player' && b.els?.includes('arcane'), dusty: b.kind === 'boulder' };
        trails.set(b.id, tr);
      }
      tr.pts.unshift(new THREE.Vector3(b.x, y, b.z));
      if (tr.pts.length > 14) tr.pts.length = 14;
      tr.last = tr.pts[0];
      if (tr.hot) for (let i = rateN(b.kind === 'boulder' ? 40 : 26, dt); i--;) S('flame', b.x, y, b.z, rnd(-0.6, 0.6) - b.vx * 0.05, rnd(0, 0.8), rnd(-0.6, 0.6) - b.vz * 0.05, { k: b.kind === 'boulder' ? 0.8 : 0.5 });
      if (tr.hot && b.kind === 'boulder') for (let i = rateN(6, dt); i--;) S('hotsmoke', b.x, y + 0.3, b.z, 0, 0.8, 0, { k: 0.5 });
      if (tr.arc) for (let i = rateN(18, dt); i--;) S('arcane', b.x, y, b.z, rnd(-0.5, 0.5), rnd(0, 0.5), rnd(-0.5, 0.5), { k: 0.45 });
      if (tr.dusty && !tr.hot) for (let i = rateN(8, dt); i--;) S('dust', b.x, y - 0.3, b.z, 0, 0.3, 0, { k: 0.5 });
      if (li < lights.length && (b.owner === 'enemy' || b.kind !== 'boulder' || tr.hot)) {
        const L = lights[li++]; L.position.set(b.x, y + 0.2, b.z); L.color.set(b.owner === 'enemy' ? 0x5cffb0 : b.sp.color); L.intensity = 7;
      }
    }
    for (; li < lights.length; li++) lights[li].intensity *= Math.exp(-20 * dt);
    for (const [id, tr] of trails) {
      if (!seen.has(id)) {
        tr.dying += dt;
        if (tr.dying > 0.18 || !tr.last) { for (const c of tr.g.children) c.geometry.dispose(); tr.glowM.dispose(); tr.coreM.dispose(); scene.remove(tr.g); trails.delete(id); continue; }
        tr.pts.unshift(tr.last.clone()); tr.pts.length = Math.min(tr.pts.length, 14);
      }
      for (const c of [...tr.g.children]) { c.geometry.dispose(); tr.g.remove(c); }
      if (tr.pts.length < 2) continue;
      const N = tr.pts.length, fade = 1 - tr.dying / 0.18, glow = [], core = [];
      for (let i = 0; i < N - 1; i++) {
        const k = 1 - i / (N - 1);
        glow.push([tr.pts[i], tr.pts[i + 1], tr.w * k, k * k * fade]);
        core.push([tr.pts[i], tr.pts[i + 1], tr.w * 0.3 * k, k * fade]);
      }
      tr.g.add(new THREE.Mesh(segGeo(glow, camPos), tr.glowM), new THREE.Mesh(segGeo(core, camPos), tr.coreM));
    }
  }

  function ambient(s, dt) {
    for (const a of s.areas) {
      if (a.delay > 0) continue;
      const ang = Math.random() * 6.28, r = Math.sqrt(Math.random()) * a.r, x = a.x + Math.sin(ang) * r, z = a.z + Math.cos(ang) * r;
      if (a.key === 'ice+water') { if (Math.random() < dt * 14) S('mist', x, 0.25, z, rnd(-0.4, 0.4), 0.15, rnd(-0.4, 0.4), { k: 1.1 }); }
      else if (a.key === 'burning') { for (let i = rateN(16 * a.r, dt); i--;) S('flame', a.x + rnd(-a.r, a.r) * 0.6, 0.2, a.z + rnd(-a.r, a.r) * 0.6, 0, rnd(0.3, 1.2), 0, { k: 0.7 }); if (Math.random() < dt * 4) S('hotsmoke', x, 1, z, 0, 1, 0, { k: 0.7 }); if (Math.random() < dt * 3) heat(a.x, 1, a.z, a.r, 0.6, 0.6); }
      else if (a.key === 'lightning+water') { for (let i = rateN(14, dt); i--;) K('lightning', x, 0.1, z, rnd(-3, 3), rnd(2, 6), rnd(-3, 3)); if (Math.random() < dt * 5) S('plasma', x, 0.3, z, 0, 0.6, 0, { k: 0.8 }); }
      else if (a.key === 'arcane+water') { for (let i = rateN(16, dt); i--;) { const tx = -(z - a.z), tz = x - a.x; S('arcane', x, 0.3, z, tx * 1.6 + (a.x - x) * 0.8, 0.3, tz * 1.6 + (a.z - z) * 0.8, { k: 0.6 }); } }
    }
    for (const br of s.props.brush) if (br.state === 'burning') {
      for (let i = rateN(14, dt); i--;) S('flame', br.x + rnd(-br.r, br.r) * 0.6, 0.3, br.z + rnd(-br.r, br.r) * 0.6, 0, rnd(0.4, 1.4), 0, { k: 0.8 });
      if (Math.random() < dt * 3) S('hotsmoke', br.x, 1.2, br.z, 0, 1, 0, { k: 0.8 });
      if (Math.random() < dt * 2) heat(br.x, 1, br.z, br.r * 1.2, 0.6, 0.5);
    }
    const bodies = s.enemies.filter((e) => e.state !== 'spawn');
    if (s.player.alive) bodies.push(s.player);
    for (const b of bodies) if (b.st.burn > 0) for (let i = rateN(9, dt); i--;) S('flame', b.x + rnd(-0.3, 0.3), rnd(0.4, 1.4), b.z + rnd(-0.3, 0.3), 0, rnd(0.5, 1.2), 0, { k: 0.45 });
  }

  const _p = new THREE.Vector3(), _q = new THREE.Vector3(), _right = new THREE.Vector3();
  return {
    kick, release, blast, hit, cone, areaStart, wall, tag, fireball, shell, flare, bolt, dustRing, radialSparks,
    smokeAt: (name, x, y, z, vx, vy, vz, o) => S(name, x, y, z, vx, vy, vz, o),
    reset() {
      smoke.clear(); sparks.clear(); heats.length = 0; kick.set(0, 0, 0);
      for (const L of live.splice(0)) scene.remove(L.obj);
      for (const tr of trails.values()) scene.remove(tr.g);
      trails.clear();
    },
    update(dt, s) {
      t += dt;
      camera.getWorldPosition(camPos);
      smoke.mat.uniforms.uScale.value = renderer.domElement.height / (2 * Math.tan((camera.fov * Math.PI) / 360));
      for (let i = live.length - 1; i >= 0; i--) {
        const L = live[i]; L.life -= dt;
        L.tick(Math.min(1, 1 - L.life / L.max), dt, L.max - L.life);
        if (L.life <= 0) {
          scene.remove(L.obj);
          L.obj.traverse((o) => { if (o.material && o.material !== smoke.mat) o.material.dispose?.(); if (o.geometry && o.geometry !== FB_GEO && o.geometry !== SHELL_GEO && o.geometry !== DOME_GEO) o.geometry.dispose(); });
          live.splice(i, 1);
        }
      }
      for (const f of flarePool) {
        if (!f.s.visible) continue;
        f.life -= dt;
        if (f.life <= 0) { f.s.visible = false; continue; }
        const k = 1 - f.life / f.max;
        f.s.scale.setScalar(f.size * (k < 0.2 ? 0.6 + k * 2 : 1 - (k - 0.2) * 0.6));
        f.s.material.opacity = 1 - k * k;
      }
      if (s.mode !== 'menu') { updateTrails(s, dt); ambient(s, dt); }
      smoke.update(dt);
      sparks.update(dt);
      kick.multiplyScalar(Math.exp(-10 * dt));
      // heat sources → screen space for the distortion pass
      _right.setFromMatrixColumn(camera.matrixWorld, 0);
      const out = [];
      for (let i = heats.length - 1; i >= 0; i--) {
        const h = heats[i]; h.life -= dt;
        if (h.life <= 0) { heats.splice(i, 1); continue; }
        _p.set(h.x, h.y, h.z).project(camera);
        _q.set(h.x, h.y, h.z).addScaledVector(_right, h.r).project(camera);
        if (_p.z > 1) continue;
        out.push([(_p.x + 1) / 2, (_p.y + 1) / 2, Math.abs(_q.x - _p.x) * 0.5 * camera.aspect, h.s * Math.min(1, h.life / (h.max * 0.5))]);
      }
      return out;
    }
  };
}
