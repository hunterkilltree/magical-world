// Spectacle layer: charge-up, combo casts, signature spell visuals, reactions and screen effects.
// Render-only — consumes sim events and reads state; never writes gameplay.
import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { ELEMENTS, ORDER, resolveSpell } from './spells.js';
import { createVfx } from './vfx.js';

const MAXW = 6;
const SCREEN = {
  uniforms: {
    tDiffuse: { value: null },
    uWaves: { value: Array.from({ length: MAXW }, () => new THREE.Vector4(0, 0, -1, 0)) },
    uAspect: { value: 1 },
    uAberr: { value: 0 },
    uFlash: { value: new THREE.Vector4(1, 1, 1, 0) },
    uHeat: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 0, 0)) },
    uTime: { value: 0 }
  },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec4 uWaves[${MAXW}]; uniform float uAspect; uniform float uAberr; uniform vec4 uFlash; uniform vec4 uHeat[8]; uniform float uTime;
    varying vec2 vUv;
    void main() {
      vec2 off = vec2(0.0); float ring = 0.0;
      for (int i = 0; i < ${MAXW}; i++) {
        vec4 w = uWaves[i];
        if (w.z >= 0.0) {
          vec2 d = vUv - w.xy; d.x *= uAspect;
          float L = length(d), r = w.z * (0.16 + 0.42 * w.w);
          float band = 1.0 - smoothstep(0.0, 0.05 + 0.04 * w.w, abs(L - r));
          float fade = (1.0 - w.z) * (1.0 - w.z);
          vec2 dir = d / max(L, 0.0001); dir.x /= uAspect;
          off += dir * band * fade * w.w * 0.04;
          ring += band * fade * w.w;
        }
      }
      for (int i = 0; i < 8; i++) {
        vec4 h = uHeat[i];
        if (h.w > 0.0) {
          vec2 d = vUv - h.xy; d.x *= uAspect;
          float f = smoothstep(h.z, 0.0, length(d)) * h.w;
          off += vec2(sin(vUv.y * 95.0 + uTime * 11.0 + float(i) * 1.7), cos(vUv.x * 80.0 - uTime * 8.0)) * 0.0032 * f;
        }
      }
      vec2 uv = vUv - off, cd = uv - 0.5;
      float ab = uAberr * (0.002 + 0.014 * length(cd)) + ring * 0.006;
      vec2 ad = normalize(cd + 0.0001) * ab;
      vec4 c = texture2D(tDiffuse, uv);
      c.r = texture2D(tDiffuse, uv + ad).r;
      c.b = texture2D(tDiffuse, uv - ad).b;
      c.rgb += uFlash.rgb * uFlash.a + vec3(ring * 0.05);
      gl_FragColor = c;
    }`
};

const ease = (k) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);
const rateN = (r, dt) => { const n = r * dt; return Math.floor(n) + (Math.random() < n % 1 ? 1 : 0); };

function canvasTex(S, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  draw(c.getContext('2d'), S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function runeTexture() {
  return canvasTex(512, (g, S) => {
    g.translate(S / 2, S / 2);
    g.strokeStyle = '#fff'; g.lineCap = 'round';
    const ring = (r, w) => { g.lineWidth = w; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke(); };
    ring(248, 5); ring(228, 2.5); ring(150, 3.5); ring(66, 3);
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2, r1 = i % 6 ? 238 : 246;
      g.lineWidth = i % 6 ? 2 : 4;
      g.beginPath(); g.moveTo(Math.cos(a) * 229, Math.sin(a) * 229); g.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); g.stroke();
    }
    g.lineWidth = 3.5;
    for (let k = 0; k < 2; k++) {
      g.beginPath();
      for (let i = 0; i <= 3; i++) {
        const a = (i / 3) * Math.PI * 2 + (k * Math.PI) / 3 - Math.PI / 2;
        if (i) g.lineTo(Math.cos(a) * 150, Math.sin(a) * 150); else g.moveTo(Math.cos(a) * 150, Math.sin(a) * 150);
      }
      g.stroke();
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.lineWidth = 2; g.beginPath(); g.moveTo(Math.cos(a) * 70, Math.sin(a) * 70); g.lineTo(Math.cos(a) * 100, Math.sin(a) * 100); g.stroke();
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2, x = Math.cos(a) * 188, y = Math.sin(a) * 188;
      g.lineWidth = 3; g.beginPath(); g.arc(x, y, 24, 0, Math.PI * 2); g.stroke();
      g.save(); g.translate(x, y); g.rotate(a + Math.PI / 2); g.beginPath();
      const s = i % 3;
      g.moveTo(0, -13); g.lineTo(0, 13); g.moveTo(0, -6 + s * 4); g.lineTo(9, -12 + s * 6);
      if (i > 2) { g.moveTo(0, 4); g.lineTo(-9, 10); }
      g.stroke(); g.restore();
    }
  });
}

function decalTexture(kind) {
  const STOPS = {
    scorch: ['rgba(12,7,5,.92)', 'rgba(22,13,9,.55)', 'rgba(22,13,9,0)'],
    frost: ['rgba(235,250,255,.6)', 'rgba(200,236,255,.22)', 'rgba(200,236,255,0)'],
    crack: ['rgba(20,16,22,.4)', 'rgba(20,16,22,.12)', 'rgba(20,16,22,0)'],
    glow: ['rgba(255,255,255,1)', 'rgba(255,255,255,.25)', 'rgba(255,255,255,0)']
  };
  return canvasTex(256, (g, S) => {
    const h = S / 2, rad = g.createRadialGradient(h, h, 0, h, h, h), st = STOPS[kind];
    rad.addColorStop(0, st[0]); rad.addColorStop(0.55, st[1]); rad.addColorStop(1, st[2]);
    g.fillStyle = rad; g.fillRect(0, 0, S, S);
    if (kind === 'glow') return;
    g.strokeStyle = kind === 'frost' ? 'rgba(255,255,255,.9)' : 'rgba(8,5,6,.9)';
    g.lineCap = 'round';
    const br = (x, y, a, len, w, d) => {
      if (d > 3 || len < 5) return;
      const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
      g.lineWidth = w; g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke();
      br(x2, y2, a + (Math.random() - 0.5) * 0.9, len * 0.62, w * 0.7, d + 1);
      if (Math.random() < 0.6) br(x2, y2, a + (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.5), len * 0.5, w * 0.6, d + 1);
    };
    const n = kind === 'frost' ? 10 : kind === 'crack' ? 6 : 8;
    for (let i = 0; i < n; i++) br(h, h, (i / n) * Math.PI * 2 + Math.random() * 0.4, h * (kind === 'crack' ? 0.5 : 0.4), kind === 'frost' ? 2.5 : 3.5, 0);
  });
}

function beamTexture() {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 128;
  const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.7, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,1)');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 128);
  return new THREE.CanvasTexture(c);
}

export function createWow(o) {
  const { scene, camera, composer, glow, puff, burst, lightning, ringFx, flash, callout, shake } = o;
  const pass = new ShaderPass(SCREEN);
  composer.insertPass(pass, composer.passes.length - 1);
  const U = pass.uniforms;
  const vfx = createVfx({ scene, camera, renderer: composer.renderer, flash });
  const tierOf = (e) => { const d = e.distinct ?? new Set(e.els).size; return d >= 3 ? 3 : d >= 2 ? 2 : e.els.length >= 2 ? 1.3 : 1; };

  const runeTex = runeTexture(), beamTex = beamTexture();
  const DT = { scorch: decalTexture('scorch'), frost: decalTexture('frost'), crack: decalTexture('crack'), glow: decalTexture('glow') };
  const PLANE = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
  const BEAM = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true).translate(0, 0.5, 0);
  const NODE = new THREE.CircleGeometry(0.1, 20).rotateX(-Math.PI / 2);
  const SPIKE = new THREE.ConeGeometry(0.22, 1, 5).translate(0, 0.5, 0);
  const DG = { shard: new THREE.ConeGeometry(0.07, 0.38, 4), rock: new THREE.DodecahedronGeometry(0.14, 0), chunk: new THREE.IcosahedronGeometry(0.12, 0) };
  const DM = {
    ice: new THREE.MeshStandardMaterial({ color: 0xd6f6ff, emissive: 0x5ab8ff, emissiveIntensity: 0.7, roughness: 0.12, flatShading: true }),
    rock: new THREE.MeshStandardMaterial({ color: 0x7a6e62, roughness: 0.95, flatShading: true }),
    lava: new THREE.MeshStandardMaterial({ color: 0x3a1a10, emissive: 0xff5a1a, emissiveIntensity: 2.2, roughness: 0.8, flatShading: true }),
    arcane: new THREE.MeshStandardMaterial({ color: 0x5a2a90, emissive: 0xd04bff, emissiveIntensity: 1.8, roughness: 0.3, flatShading: true }),
    mud: new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 1, flatShading: true })
  };
  const SPIKE_MAT = new THREE.MeshStandardMaterial({ color: 0xcff4ff, emissive: 0x4ab0ff, emissiveIntensity: 0.6, roughness: 0.1, flatShading: true, transparent: true, opacity: 0.9 });

  const live = [], debris = [], decals = [], waves = [];
  let aberr = 0, flashA = 0, fov = 0, t = 0, lastTip = null;
  const flashC = new THREE.Color(), _v = new THREE.Vector3(), _c = new THREE.Color(1, 1, 1), _c2 = new THREE.Color();
  const hexc = (h, k = 1) => new THREE.Color(h).multiplyScalar(k);
  const css = (h) => '#' + new THREE.Color(h).lerp(new THREE.Color(1, 1, 1), 0.35).getHexString();
  const addMat = (hex, k = 2, opacity = 1, map = null) => new THREE.MeshBasicMaterial({ map, color: hexc(hex, k), transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });

  function add(obj, life, tick, end) { scene.add(obj); live.push({ obj, life, max: life, tick, end }); return obj; }
  function wave(x, y, z, s) { waves.push({ x, y, z, s: Math.min(1.6, s), age: 0, dur: 0.45 + s * 0.3 }); if (waves.length > MAXW) waves.shift(); }
  function punch(ab, fovK = 0, sh = 0) { aberr = Math.min(1.6, aberr + ab); fov += fovK; if (sh) shake(sh); }
  function screenFlash(hex, a) { flashC.set(hex); flashA = Math.min(0.18, flashA + a); }

  function rune(x, z, hex, r, life, opt = {}) {
    const m = addMat(hex, opt.k ?? 2.2, 0, runeTex), g = new THREE.Mesh(PLANE, m);
    g.position.set(x, opt.y ?? 0.05, z);
    g.rotation.y = Math.random() * 6.28;
    const spin = opt.spin ?? 2.5, r0 = opt.r0 ?? r * 0.4;
    return add(g, life, (k, dt, el) => {
      g.rotation.y += dt * spin * (1 - k * 0.6);
      g.scale.setScalar(r0 + (r - r0) * ease(el / 0.3));
      const f = opt.hold ? (k < 0.08 ? k / 0.08 : k > 0.85 ? (1 - k) / 0.15 : 1) : k < 0.12 ? k / 0.12 : 1 - (k - 0.12) / 0.88;
      m.opacity = f * (opt.a ?? 1);
    });
  }

  function beam(x, z, hex, r, h, life, opt = {}) {
    const m = addMat(hex, opt.k ?? 2.4, 1, beamTex), b = new THREE.Mesh(BEAM, m);
    b.position.set(x, 0, z);
    add(b, life, (k, dt, el) => {
      const w = opt.grow ? r * (0.3 + 0.7 * k) : r * (1 - 0.85 * ease(k));
      b.scale.set(w, opt.grow ? h : h * (0.5 + 0.5 * ease(el / 0.1)), w);
      m.opacity = opt.grow ? 0.2 + 0.8 * k : 1 - k;
    });
  }

  function groundGlow(x, z, hex, r, life, k = 1.6) {
    const m = addMat(hex, k, 1, DT.glow), g = new THREE.Mesh(PLANE, m);
    g.position.set(x, 0.045, z); g.scale.setScalar(r);
    add(g, life, (kk) => { m.opacity = 1 - kk; });
  }

  function decal(kind, x, z, r, life = 7, hot = false) {
    const m = new THREE.MeshBasicMaterial({ map: DT[kind], transparent: true, opacity: 0, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const d = new THREE.Mesh(PLANE, m);
    d.position.set(x, 0.02 + (decals.length % 8) * 0.0015, z);
    d.rotation.y = Math.random() * 6.28;
    d.scale.setScalar(r);
    d.renderOrder = 1;
    scene.add(d);
    decals.push({ d, m, life, max: life });
    while (decals.length > 16) scene.remove(decals.shift().d);
    if (hot) groundGlow(x, z, 0xff5a1a, r * 1.1, 1.8, 1.3);
  }

  function spray(type, x, y, z, n, speed, opt = {}) {
    for (let i = 0; i < n; i++) {
      const geo = type === 'ice' || type === 'arcane' ? DG.shard : type === 'lava' ? DG.chunk : DG.rock;
      const m = new THREE.Mesh(geo, DM[type]);
      m.castShadow = type === 'rock' || type === 'lava';
      const a = Math.random() * Math.PI * 2, sp = speed * (0.4 + Math.random() * 0.8), sz = (opt.size ?? 1) * (0.6 + Math.random() * 0.8);
      const j = opt.spread ?? 0.3;
      m.scale.setScalar(sz);
      m.position.set(x + (Math.random() - 0.5) * j, y, z + (Math.random() - 0.5) * j);
      m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      scene.add(m);
      debris.push({ m, type, vx: Math.cos(a) * sp + (opt.dir?.[0] ?? 0), vy: sp * (opt.up ?? 0.9) * (0.5 + Math.random()), vz: Math.sin(a) * sp + (opt.dir?.[1] ?? 0),
        sx: (Math.random() - 0.5) * 14, sz: (Math.random() - 0.5) * 14, life: 1.3 + Math.random() * 0.8, size: sz, r: 0.1 * sz });
    }
    while (debris.length > 180) scene.remove(debris.shift().m);
  }

  function spikes(x, z, r, n, life, opt = {}) {
    const g = new THREE.Group(), list = [];
    g.position.set(x, 0, z);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, rr = opt.ring ? r * (0.75 + Math.random() * 0.3) : Math.sqrt(Math.random()) * r;
      const s = new THREE.Mesh(SPIKE, SPIKE_MAT), tilt = opt.ring ? 0.45 : (Math.random() - 0.5) * 0.5;
      s.castShadow = true;
      s.position.set(Math.sin(a) * rr, 0, Math.cos(a) * rr);
      s.rotation.set(Math.cos(a) * tilt, 0, -Math.sin(a) * tilt);
      s.scale.setScalar(0.001);
      list.push({ s, h: (opt.h ?? 1.1) * (0.5 + Math.random() * 0.8), w: 0.6 + Math.random() * 0.8, delay: Math.random() * 0.14 });
      g.add(s);
    }
    add(g, life, (k, dt, el) => {
      const out = el > life - 0.2 ? Math.max(0, (life - el) / 0.2) : 1;
      for (const sp of list) {
        const u = ease((el - sp.delay) / 0.12);
        sp.s.scale.set(Math.max(0.001, sp.w * u), Math.max(0.001, sp.h * u * out), Math.max(0.001, sp.w * u));
      }
    }, () => spray('ice', x, 0.5, z, Math.min(16, Math.round(n * 0.8)), 4, { spread: r }));
  }

  function helix(el, x, z, n) {
    const off = Math.random() * 6.28;
    for (let i = 0; i < n; i++) {
      const a = off + i * 0.55;
      puff(el, x + Math.sin(a) * 0.75, 0.15 + i * 0.03, z + Math.cos(a) * 0.75, Math.cos(a) * 2.2, 3.5 + Math.random() * 1.5, -Math.sin(a) * 2.2,
        { grav: 0, drag: 1.2, life: 0.6 + Math.random() * 0.3, size: 1.1 });
    }
  }

  function spiral(a1, a2, x, z, r) {
    for (let i = 0; i < 60; i++) {
      const a = i * 0.35, rr = 0.2 + (i / 60) * r;
      puff(i % 2 ? a1 : a2, x + Math.sin(a) * rr, 0.4 + Math.random() * 0.6, z + Math.cos(a) * rr, Math.cos(a) * 4, 1.5, -Math.sin(a) * 4, { grav: 0, drag: 2, size: 1.2 });
    }
  }

  function forks(x, z, r, hex, n) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.28 + Math.random() * 0.5, L = r * (0.9 + Math.random() * 0.6);
      lightning([[x, z], [x + Math.sin(a) * L * 0.55, z + Math.cos(a) * L * 0.55], [x + Math.sin(a + 0.3) * L, z + Math.cos(a + 0.3) * L]], hex, 0.9, 0.12);
    }
  }

  function wallDebris(e, type) {
    for (let i = 0; i < e.n; i++) { const o = (i - (e.n - 1) / 2) * 0.95; spray(type, e.x - e.dz * o, 0.4, e.z + e.dx * o, 3, 3.5); }
    wave(e.x, 0.5, e.z, 0.4);
    punch(0.2, -0.8, 0.25);
  }

  function prismFan(e) {
    const a0 = Math.atan2(e.dx, e.dz);
    for (let i = 0; i < 46; i++) {
      const a = a0 + (Math.random() - 0.5) * 0.6, sp = 8 + Math.random() * 10;
      _c2.setHSL(Math.random(), 0.9, 0.62);
      glow.emit(e.x, 1.2, e.z, Math.sin(a) * sp, (Math.random() - 0.5) * 2, Math.cos(a) * sp, 0.35, 0.2, 0.02, _c2, 1, 0, 2);
    }
  }

  // Per-spell signatures, keyed like COMBOS. Each hook is optional.
  const SIG = {
    'fire+lightning': { explode: (e) => forks(e.x, e.z, e.r * 1.4, 0xf4e15c, 7) },
    'arcane+fire': { explode: (e) => { rune(e.x, e.z, 0xd04bff, e.r * 1.25, 0.9, { spin: -4, r0: 0.5 }); spiral('arcane', 'fire', e.x, e.z, e.r); } },
    'arcane+earth': { explode: (e) => { beam(e.x, e.z, 0xd04bff, 0.7, 10, 0.55); rune(e.x, e.z, 0xd04bff, e.r * 1.1, 0.9, { spin: 5 }); spray('arcane', e.x, 0.8, e.z, 10, 6); } },
    'earth+fire': { impact: (e) => { spray('lava', e.x, 0.8, e.z, 16, 6); decal('scorch', e.x, e.z, 2, 6, true); wave(e.x, 0.6, e.z, 0.5); punch(0.3, -1, 0.2); } },
    'earth+lightning': { impact: (e) => forks(e.x, e.z, 2.2, 0xf4e15c, 5) },
    'arcane+fire+lightning': {
      area: (e) => beam(e.x, e.z, e.color, 0.3, 30, e.delay, { grow: true, k: 1.6 }),
      explode: (e) => {
        wave(e.x, 0.6, e.z, 1.5); punch(0.9, -5, 0.6); screenFlash(0xfff2d0, 0.03);
        beam(e.x, e.z, e.color, 1.0, 16, 0.6, { k: 1.4 });
        rune(e.x, e.z, e.color, e.r * 1.6, 1.4, { spin: 3, r0: 1 });
        forks(e.x, e.z, e.r * 1.6, 0xf4e15c, 10);
        spray('lava', e.x, 0.8, e.z, 22, 8); spray('rock', e.x, 0.6, e.z, 14, 6);
        decal('scorch', e.x, e.z, e.r * 1.2, 9, true);
      }
    },
    'ice+water': { area: (e) => { spikes(e.x, e.z, e.r * 0.9, 22, e.life, { h: 1.2 }); decal('frost', e.x, e.z, e.r * 1.15, e.life + 3); wave(e.x, 0.4, e.z, 0.5); punch(0.3, -1, 0.15); } },
    'lightning+water': { area: (e) => { beam(e.x, e.z, 0xf4e15c, e.r * 0.85, 4, 0.5); ringFx(e.x, e.z, e.r * 1.1, 0x3d9bff, 0.5); burst('water', e.x, 0.2, e.z, 40, 5, { up: 1.4, spread: e.r }); forks(e.x, e.z, e.r, 0xf4e15c, 6); } },
    'arcane+water': { area: (e) => rune(e.x, e.z, e.color, e.r, e.life, { hold: true, spin: -3.5, r0: e.r * 0.5, a: 0.75 }) },
    'earth+ice': { wall: (e) => { wallDebris(e, 'ice'); decal('frost', e.x, e.z, 2.4, 9); } },
    'earth+earth': { wall: (e) => { wallDebris(e, 'rock'); decal('crack', e.x, e.z, 2.6, 9); } },
    'arcane+ice': { cast: prismFan },
    'arcane+lightning': { chain: (e) => { lightning(e.pts, 0xd04bff, 1.15, 1.0); for (const [x, z] of e.pts.slice(1)) rune(x, z, 0xd04bff, 1.0, 0.45, { spin: 6 }); } },
    'ice+lightning': { chain: (e) => { for (const [x, z] of e.pts.slice(1)) spray('ice', x, 1, z, 4, 3); } },
    'fire+water': { cone: (e) => { const a0 = Math.atan2(e.dx, e.dz); for (let i = 0; i < 50; i++) { const a = a0 + (Math.random() - 0.5) * ((e.arc * Math.PI) / 180), sp = 4 + Math.random() * 6; puff('steam', e.x, 1, e.z, Math.sin(a) * sp, 0.5 + Math.random(), Math.cos(a) * sp, { size: 1.8, drag: 1.2 }); } } },
    'earth+water': { cone: (e) => { const a0 = Math.atan2(e.dx, e.dz); for (let i = 0; i < 12; i++) { const a = a0 + (Math.random() - 0.5) * ((e.arc * Math.PI) / 180), d = 1 + Math.random() * e.range * 0.7; spray('mud', e.x + Math.sin(a) * d, 0.3, e.z + Math.cos(a) * d, 1, 2, { dir: [Math.sin(a) * 5, Math.cos(a) * 5] }); } } }
  };
  const sig = (key, hook, e, x) => SIG[key]?.[hook]?.(e, x);

  function castFx(e) {
    const distinct = e.distinct ?? new Set(e.els).size, combo = distinct >= 2;
    const tier = distinct >= 3 ? 3 : combo ? 2 : e.els.length >= 2 ? 1.3 : 1;
    if (!e.fromQueue) { if (combo) rune(e.x, e.z, e.color, 1.3, 0.35, { a: 0.5, spin: 5 }); sig(e.key, 'cast', e, tier); return; }
    rune(e.x, e.z, e.color, 1.1 + tier * 0.45, 0.55 + tier * 0.1, { spin: 4 + tier, r0: 0.5 });
    if (tier >= 1.3) {
      beam(e.x, e.z, e.color, 0.35 + 0.18 * tier, 4 + tier * 2.2, 0.4 + tier * 0.05);
      wave(e.x, 1, e.z, 0.18 * tier);
      punch(0.25 * tier, -0.9 * tier, 0.08 * tier);
      for (const el of new Set(e.els)) helix(el, e.x, e.z, 18 + tier * 8);
    }
    if (combo) { screenFlash(e.color, 0.04 * tier); callout(e.x, e.z, e.name, css(e.color), e.isNew ? 'NEW SPELL' : ''); }
    if (combo && e.isNew) { wave(e.x, 1, e.z, 0.8); punch(0.4, -2.5, 0.2); rune(e.x, e.z, 0xf0c84a, 3.2, 1.1, { spin: -2, r0: 1, a: 0.7 }); }
    sig(e.key, 'cast', e, tier);
  }

  function explodeFx(e) {
    const has = (x) => e.els.includes(x), R = e.r;
    wave(e.x, 0.8, e.z, e.big ? 0.85 : 0.4);
    punch(e.big ? 0.7 : 0.25, e.big ? -2.2 : -0.6);
    screenFlash(e.color, e.big ? 0.035 : 0.015);
    groundGlow(e.x, e.z, e.color, R * 1.3, 0.6, 1.2);
    if (!e.key) { spray('lava', e.x, 0.7, e.z, 12, 6); decal('scorch', e.x, e.z, R * 0.9, 8, true); return; }
    if (has('fire') || has('arcane') || has('lightning')) decal('scorch', e.x, e.z, R * 0.85, 7, has('fire'));
    if (has('ice')) { decal('frost', e.x, e.z, R * 0.9); spray('ice', e.x, 0.8, e.z, 10, 5); }
    if (has('earth')) spray(has('fire') ? 'lava' : 'rock', e.x, 0.6, e.z, e.big ? 14 : 8, 5);
    if (has('arcane')) spray('arcane', e.x, 0.8, e.z, e.big ? 8 : 4, 4.5);
    if (e.big) beam(e.x, e.z, e.color, R * 0.4, 7, 0.45, { k: 1.6 });
    sig(e.key, 'explode', e);
  }

  function tagFx(e) {
    switch (e.tag) {
      case 'shatter':
        spray('ice', e.x, 1, e.z, 16, 5.5, { size: 1.3 }); wave(e.x, 1, e.z, 0.45); punch(0.45, -1.2, 0.25);
        screenFlash(0xffffff, 0.05); groundGlow(e.x, e.z, 0xa8ecff, 2, 0.5);
        break;
      case 'freeze': spikes(e.x, e.z, 0.75, 6, 1.1, { ring: true, h: 0.9 }); decal('frost', e.x, e.z, 1.2, 5); break;
      case 'conduct':
        for (let i = 0; i < 3; i++) { const a = Math.random() * 6.28, r = 1.2 + Math.random(); lightning([[e.x, e.z], [e.x + Math.sin(a) * r, e.z + Math.cos(a) * r]], 0xf4e15c, 1.0, 0.1); }
        flash(e.x, e.z, 0xf4e15c, 30); punch(0.2, 0, 0.1);
        break;
      case 'steam': burst('steam', e.x, 0.8, e.z, 22, 2.2, { size: 1.3 }); break;
      case 'interrupt': ringFx(e.x, e.z, 1.2, 0xffffff, 0.3); break;
    }
  }

  // Charge-up: rune circle under the caster, lit nodes per queued element, fusion orb at the staff tip.
  const charge = new THREE.Group();
  const chargeMat = addMat(0xffffff, 1, 0.6, runeTex);
  charge.add(new THREE.Mesh(PLANE, chargeMat));
  const nodes = ORDER.map((el, i) => {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2, m = new THREE.Mesh(NODE, addMat(ELEMENTS[el].color, 3));
    m.position.set(Math.cos(a) * 0.734, 0.004, Math.sin(a) * 0.734);
    m.visible = false;
    charge.add(m);
    return m;
  });
  charge.visible = false;
  scene.add(charge);
  const chargeLight = new THREE.PointLight(0xffffff, 0, 6, 2);
  scene.add(chargeLight);
  const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
  orb.visible = false;
  scene.add(orb);
  let chargeS = 0;

  function updateCharge(dt, s, tip) {
    const p = s.player, active = (s.mode === 'play' || s.mode === 'paused') && p.alive;
    const q = active ? p.queue : [], n = q.length, sp = n ? resolveSpell(q) : null, combo = new Set(q).size >= 2;
    if (sp) _c.set(sp.color);
    chargeS += ([0, 0.95, 1.35, 1.8][n] - chargeS) * Math.min(1, dt * 12);
    charge.visible = chargeS > 0.03;
    if (charge.visible) {
      charge.position.set(p.x, 0.05, p.z);
      charge.scale.setScalar(chargeS);
      charge.rotation.y += dt * (0.5 + n * 0.7);
      chargeMat.color.copy(_c).multiplyScalar(1.5 + (combo ? 0.9 : 0) + Math.sin(t * 7) * 0.3);
      chargeMat.opacity = 0.35 + 0.15 * n;
      ORDER.forEach((el, i) => { nodes[i].visible = q.includes(el); nodes[i].scale.setScalar(1 + 0.3 * Math.sin(t * 9 + i)); });
    }
    chargeLight.position.set(p.x, 0.6, p.z);
    chargeLight.color.copy(_c);
    chargeLight.intensity += ((n ? 4 + n * 4 : 0) - chargeLight.intensity) * Math.min(1, dt * 10);
    orb.visible = !!(n && tip);
    if (!orb.visible) return;
    orb.position.copy(tip);
    orb.scale.setScalar(0.07 + 0.035 * n + Math.sin(t * 12) * 0.012);
    orb.material.color.copy(_c).multiplyScalar(2.6);
    for (let i = rateN(20 * n, dt); i--;) {
      const a = Math.random() * 6.28, b = Math.random() * 3.14, R = 0.45 + Math.random() * 0.25;
      const ox = Math.sin(b) * Math.cos(a) * R, oy = Math.cos(b) * R, oz = Math.sin(b) * Math.sin(a) * R;
      _c2.set(ELEMENTS[q[(Math.random() * n) | 0]].color);
      glow.emit(tip.x + ox, tip.y + oy, tip.z + oz, -ox * 3.2, -oy * 3.2, -oz * 3.2, 0.28, 0.14, 0.02, _c2, 1, 0, 0);
    }
  }

  return {
    get fov() { return fov; },
    get kick() { return vfx.kick; },
    vfx,
    reset() {
      for (const L of live.splice(0)) scene.remove(L.obj);
      for (const d of debris.splice(0)) scene.remove(d.m);
      for (const d of decals.splice(0)) scene.remove(d.d);
      waves.length = 0; aberr = flashA = fov = 0;
      vfx.reset();
    },
    onEvent(e, s) {
      switch (e.type) {
        case 'queue': {
          const p = s.player, c = ELEMENTS[e.el].color;
          ringFx(p.x, p.z, 1.1, c, 0.35, 0.06);
          groundGlow(p.x, p.z, c, 1.4, 0.35, 1.2);
          if (lastTip) burst(e.el, lastTip.x, lastTip.y, lastTip.z, 12, 2.5);
          const q = p.queue;
          if (new Set(q).size >= 2 && q[q.length - 1] === e.el) { rune(p.x, p.z, resolveSpell(q).color, 1.7, 0.45, { r0: 0.6, spin: 6, a: 0.8 }); punch(0.15); }
          break;
        }
        case 'cast': castFx(e); vfx.release(e, lastTip, e.fromQueue ? tierOf(e) : 0.8); break;
        case 'nova': vfx.dustRing(e.x, e.z, e.r, 22, e.r * 2.6); vfx.shell(e.x, 0, e.z, e.r * 1.15, e.color, 0.35, true); wave(e.x, 0.5, e.z, 0.5); punch(0.3, -1); rune(e.x, e.z, e.color, e.r, 0.6, { spin: 5 }); sig(e.key, 'nova', e); break;
        case 'explode': explodeFx(e); vfx.blast(e); break;
        case 'impact':
          vfx.hit(e);
          if (e.enemy) break;
          if (e.kind === 'boulder') { spray(e.els.includes('fire') ? 'lava' : 'rock', e.x, 0.7, e.z, 7, 4); decal('crack', e.x, e.z, 1.1, 5); wave(e.x, 0.6, e.z, 0.2); }
          sig(e.key, 'impact', e);
          break;
        case 'area': vfx.areaStart(e); rune(e.x, e.z, e.color, e.r, (e.delay || 0) + 0.6, { r0: e.r * 0.3, spin: 3, a: 0.7 }); sig(e.key, 'area', e); break;
        case 'wall': vfx.wall(e); if (!SIG[e.key]?.wall) wallDebris(e, e.mat === 'ice' ? 'ice' : 'rock'); sig(e.key, 'wall', e); break;
        case 'chain': if (e.pts.length > 2) wave(e.pts[1][0], 1, e.pts[1][1], 0.2); sig(e.key, 'chain', e); break;
        case 'cone': vfx.cone(e); sig(e.key, 'cone', e); break;
        case 'tag': tagFx(e); vfx.tag(e); break;
        case 'death': if (e.frozen) spray('ice', e.x, 1, e.z, 14, 5); else vfx.dustRing(e.x, e.z, 0.8, 10, 2.5); break;
        case 'slam': vfx.dustRing(e.x, e.z, e.r, 24, 7); vfx.shell(e.x, 0, e.z, e.r * 1.2, 0xffd9a0, 0.3, true, 1.2); vfx.radialSparks('earth', e.x, 0.3, e.z, 20, 5, 12, 0.9); wave(e.x, 0.3, e.z, 0.5); decal('crack', e.x, e.z, 2.4, 6); spray('rock', e.x, 0.3, e.z, 8, 4); break;
        case 'cancel': wave(e.x, 1.6, e.z, 0.2); punch(0.2); break;
        case 'playerDeath': wave(e.x, 1, e.z, 1); punch(0.8, 3); screenFlash(0xef4444, 0.12); break;
      }
    },
    update(dt, s, tip) {
      t += dt;
      lastTip = tip ? tip.clone() : null;
      updateCharge(dt, s, tip);
      for (let i = live.length - 1; i >= 0; i--) {
        const L = live[i];
        L.life -= dt;
        L.tick?.(Math.min(1, 1 - L.life / L.max), dt, L.max - L.life);
        if (L.life <= 0) { scene.remove(L.obj); live.splice(i, 1); L.end?.(); }
      }
      for (let i = debris.length - 1; i >= 0; i--) {
        const d = debris[i], p = d.m.position;
        d.life -= dt;
        if (d.life <= 0) { scene.remove(d.m); debris.splice(i, 1); continue; }
        d.vy -= 20 * dt;
        p.x += d.vx * dt; p.y += d.vy * dt; p.z += d.vz * dt;
        if (p.y < d.r) { p.y = d.r; d.vy *= -0.32; d.vx *= 0.6; d.vz *= 0.6; d.sx *= 0.5; d.sz *= 0.5; }
        d.m.rotation.x += d.sx * dt; d.m.rotation.z += d.sz * dt;
        if (d.life < 0.4) d.m.scale.setScalar(d.size * (d.life / 0.4));
        if (d.type === 'lava' && p.y > 0.2 && Math.random() < dt * 30) puff('fire', p.x, p.y, p.z, 0, 0.5, 0, { size: 0.7, life: 0.3 });
        if (d.type === 'arcane' && Math.random() < dt * 20) puff('arcane', p.x, p.y, p.z, 0, 0.3, 0, { size: 0.6, life: 0.3 });
      }
      for (let i = decals.length - 1; i >= 0; i--) {
        const d = decals[i];
        d.life -= dt;
        if (d.life <= 0) { scene.remove(d.d); decals.splice(i, 1); continue; }
        d.m.opacity = Math.min(1, (d.max - d.life) / 0.15, d.life / 1.5);
      }
      for (const b of s.shots) {
        if (b.owner !== 'player' || !b.sp) continue;
        if (b.sp.key === 'arcane+ice') {
          for (let i = rateN(70, dt); i--;) { _c2.setHSL((t * 1.5 + b.id * 0.13 + Math.random() * 0.2) % 1, 0.9, 0.62); glow.emit(b.x, 1.15, b.z, (Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5), 0.4, 0.18, 0.02, _c2, 1, 0, 1); }
        } else if (Object.keys(b.sp.counts).length >= 2) {
          _c2.set(b.sp.color);
          for (let i = rateN(40, dt); i--;) glow.emit(b.x, b.kind === 'boulder' ? 0.95 : 1.15, b.z, -b.vx * 0.04, 0.3, -b.vz * 0.04, 0.45, 0.32, 0.02, _c2, 0.9, 0, 1);
        }
      }
      camera.updateMatrixWorld();
      const heats = vfx.update(dt, s);
      for (const w of waves) w.age += dt / w.dur;
      for (let i = waves.length - 1; i >= 0; i--) if (waves[i].age >= 1) waves.splice(i, 1);
      for (let i = 0; i < MAXW; i++) {
        const w = waves[i], u = U.uWaves.value[i];
        if (!w) { u.z = -1; continue; }
        _v.set(w.x, w.y, w.z).project(camera);
        u.set((_v.x + 1) / 2, (_v.y + 1) / 2, w.age, w.s);
      }
      U.uAspect.value = camera.aspect;
      aberr *= Math.exp(-5 * dt);
      flashA *= Math.exp(-9 * dt);
      fov *= Math.exp(-6 * dt);
      U.uAberr.value = aberr;
      U.uFlash.value.set(flashC.r, flashC.g, flashC.b, flashA);
      for (let i = 0; i < 8; i++) { const h = heats[i], u = U.uHeat.value[i]; if (h) u.set(h[0], h[1], h[2], h[3]); else u.w = 0; }
      U.uTime.value = t;
    }
  };
}
