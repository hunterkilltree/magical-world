// Rendering: reads sim state + events, never mutates gameplay.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildWizard, animateRig, GAIT, WIZARDS } from '../wizard-rig.js';
import { buildArena, buildEnemy, buildWall } from './models.js';
import { createFx2d, recipes as fxRecipes } from './fx2d.js';
import { createArenaFx } from './arena-fx.js';
import { ELEMENTS, resolveSpell } from './spells.js';
import { ARENA_R, GATES, TUNING } from './sim.js';
import { ENEMY_TYPES } from './enemies.js';
import { createWow } from './wow.js';
import { PROFILES, pixelRatioFor, createSafeRunner } from './quality.js';
import { frameParty } from './party.js';

const cols = (...h) => h.map((x) => new THREE.Color(x));
const STYLE = {
  fire:      { sys: 'glow', mo: 1, life: [0.35, 0.7], size: [0.42, 0.08], grav: -4, drag: 2.5, cols: cols(0xffd27a, 0xff7a2f, 0xff4a1a) },
  water:     { sys: 'glow', mo: 2, life: [0.4, 0.7], size: [0.16, 0.08], grav: 14, drag: 0.6, cols: cols(0x5cb8ff, 0x2f7fff, 0xbfe6ff) },
  ice:       { sys: 'glow', life: [0.5, 0.9], size: [0.17, 0.04], grav: 2, drag: 2, cols: cols(0xe8fbff, 0xa8ecff, 0x7dd3fc) },
  lightning: { sys: 'glow', life: [0.12, 0.3], size: [0.15, 0.02], grav: 0, drag: 4, cols: cols(0xffffff, 0xfff2a0, 0xf4e15c) },
  earth:     { sys: 'dust', life: [0.5, 0.9], size: [0.2, 0.12], grav: 16, drag: 0.4, cols: cols(0x7a5634, 0x9c7346, 0x5a4030) },
  arcane:    { sys: 'glow', life: [0.4, 0.8], size: [0.3, 0.04], grav: -1, drag: 3, cols: cols(0xf0a8ff, 0xd04bff, 0x9c4bff) },
  hex:       { sys: 'glow', life: [0.4, 0.8], size: [0.26, 0.04], grav: -1, drag: 3, cols: cols(0xb8ffe0, 0x5cffb0, 0x2fd59a) },
  steam:     { sys: 'dust', mo: 3, life: [0.8, 1.4], size: [0.4, 1.5], grav: -2.5, drag: 2, cols: cols(0xe8eef4, 0xcfd8e2), alpha: 0.35 },
  smoke:     { sys: 'dust', mo: 3, life: [0.8, 1.5], size: [0.4, 1.3], grav: -1.8, drag: 1.5, cols: cols(0x3a3440, 0x2a2630), alpha: 0.5 },
  spark:     { sys: 'glow', life: [0.15, 0.35], size: [0.12, 0.02], grav: 9, drag: 1, cols: cols(0xffffff, 0xffe2a0) },
  blood:     { sys: 'dust', life: [0.4, 0.7], size: [0.14, 0.08], grav: 14, drag: 0.5, cols: cols(0x4a1f1f, 0x2e1414) },
  rune:      { sys: 'glow', life: [0.5, 1.0], size: [0.22, 0.04], grav: -2, drag: 2, cols: cols(0xff5050, 0xff2a2a, 0xff8a6a) },
  wind:      { sys: 'dust', mo: 3, life: [0.5, 0.9], size: [0.4, 1.4], grav: -0.6, drag: 1.2, cols: cols(0xffffff, 0xeaf6ff, 0xcbe9ff), alpha: 0.7 },
  nature:    { sys: 'glow', life: [0.4, 0.7], size: [0.22, 0.06], grav: 2, drag: 2, cols: cols(0xa8f590, 0x5cc84a, 0x2e8a20) },
  light:     { sys: 'glow', life: [0.35, 0.7], size: [0.3, 0.05], grav: -1, drag: 2.5, cols: cols(0xffffff, 0xfff6c8, 0xffd966) },
  dark:      { sys: 'glow', life: [0.45, 0.8], size: [0.32, 0.06], grav: -1, drag: 2.5, cols: cols(0xd8a0ff, 0x8a3ad0, 0x3a0a6a) }
};
const TAGS = {
  steam: ['STEAM', '#e8eef4'], freeze: ['FROZEN', '#a8ecff'], shatter: ['SHATTER', '#ffffff'], conduct: ['CONDUCTED ×2', '#f4e15c'],
  thaw: ['THAW', '#ffb070'], blocked: ['BLOCKED', '#e0c060'], interrupt: ['INTERRUPTED', '#ffffff'], evade: ['EVADE', '#c4b5fd'],
  entangle: ['ENTANGLED', '#5cc84a'], root: ['ROOTED', '#7ac85a'], kindle: ['KINDLED', '#ffb040'], fan: ['FANNED', '#ff8a3a'],
  windchill: ['WINDCHILL', '#cfeee6'], purge: ['PURGED ×1.5', '#fff1a8'], blind: ['BLINDED', '#fff1a8'], curse: ['CURSED', '#c080ff'],
  stun: ['STUNNED', '#ffffff'], silence: ['SILENCED', '#d04bff'], confuse: ['CONFUSED', '#ff9ad8'], weaken: ['WEAKENED', '#9aa8d8'],
  sand: ['SAND IN THE EYES', '#d8b070'], miss: ['MISS', '#d8b070'], reflect: ['REFLECTED', '#e0d0ff'], immune: ['IMMUNE', '#f0e070'],
  cleanse: ['CLEANSED', '#bff0ff'], blessing: ['REVIVE READY', '#f0c84a'], pact: ['DARK PACT +50', '#c080ff'], breakfree: ['BROKE FREE', '#7ac85a']
};
const VIA = { 'steam:douse': ['DOUSED', '#bfe0ff'], 'steam:quench': ['QUENCHED', '#cfeeff'], 'freeze:wet': ['FLASH FROZEN', '#bff4ff'],
  'freeze:prison': ['ENCASED', '#a8ecff'], 'thaw:thermal': ['THERMAL SHOCK', '#ffb070'] };
const hexCss = (n) => '#' + n.toString(16).padStart(6, '0');
const elCss = (el) => (ELEMENTS[el] ? hexCss(ELEMENTS[el].color) : el === 'hex' ? '#5cffb0' : '#f4f1ff');
const lerpAngle = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
const ease = (k) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);
const rate = (r, dt) => { const n = r * dt; return Math.floor(n) + (Math.random() < n % 1 ? 1 : 0); };
const WHITE = new THREE.Color(1, 1, 1), ICE = new THREE.Color(0x6fc8ff), BURN = new THREE.Color(0xff6a2a);

const VS = `attribute vec3 pcolor; attribute float psize; attribute float palpha;
uniform float uScale; varying vec3 vC; varying float vA;
void main() { vC = pcolor; vA = palpha; vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = palpha > 0.0 ? psize * uScale / -mv.z : 0.0; gl_Position = projectionMatrix * mv; }`;
const FS_ADD = `varying vec3 vC; varying float vA;
void main() { float r = length(gl_PointCoord - 0.5); if (r > 0.5) discard; float f = pow(1.0 - r * 2.0, 1.5);
  gl_FragColor = vec4(vC * 1.8, f * vA); }`;
const FS_NORM = `varying vec3 vC; varying float vA;
void main() { float r = length(gl_PointCoord - 0.5); if (r > 0.5) discard;
  gl_FragColor = vec4(vC, vA * smoothstep(0.5, 0.15, r)); }`;

const DENSITY = 0.6, SIZE_K = 1.25;
class Particles {
  constructor(scene, max, additive) {
    this.max = max; this.limit = max; this.density = DENSITY; this.next = 0;
    this.p = new Float32Array(max * 3); this.c = new Float32Array(max * 3); this.sz = new Float32Array(max); this.al = new Float32Array(max);
    this.v = new Float32Array(max * 3); this.life = new Float32Array(max); this.L = new Float32Array(max); this.g = new Float32Array(max);
    this.d = new Float32Array(max); this.s0 = new Float32Array(max); this.s1 = new Float32Array(max); this.a0 = new Float32Array(max);
    this.mo = new Uint8Array(max); this.ph = new Float32Array(max); this.sp = new Uint8Array(max); this._c = new THREE.Color();
    const geo = new THREE.BufferGeometry();
    const attr = (arr, n) => new THREE.BufferAttribute(arr, n).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', (this.aP = attr(this.p, 3)));
    geo.setAttribute('pcolor', (this.aC = attr(this.c, 3)));
    geo.setAttribute('psize', (this.aS = attr(this.sz, 1)));
    geo.setAttribute('palpha', (this.aA = attr(this.al, 1)));
    this.mat = new THREE.ShaderMaterial({ uniforms: { uScale: { value: 500 } }, vertexShader: VS, fragmentShader: additive ? FS_ADD : FS_NORM,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 3 : 2;
    scene.add(this.points);
  }
  emit(x, y, z, vx, vy, vz, life, s0, s1, col, a0 = 1, g = 0, d = 0, mo = 0) {
    if (Math.random() > this.density) return; // fewer, bigger particles so silhouettes read
    s0 *= SIZE_K; s1 *= SIZE_K;
    const i = this.next, j = i * 3;
    this.mo[i] = mo; this.ph[i] = Math.random() * 6.28; this.sp[i] = s0 >= 0.24 && Math.random() < 0.6 ? 1 : 0;
    this.next = (i + 1) % this.limit;
    this.p[j] = x; this.p[j + 1] = y; this.p[j + 2] = z;
    this.v[j] = vx; this.v[j + 1] = vy; this.v[j + 2] = vz;
    this.c[j] = col.r; this.c[j + 1] = col.g; this.c[j + 2] = col.b;
    this.life[i] = life; this.L[i] = life; this.s0[i] = s0; this.s1[i] = s1; this.a0[i] = a0; this.g[i] = g; this.d[i] = d;
    this.sz[i] = s0; this.al[i] = a0;
  }
  // R-110: a tier caps how many particles live at once (the arrays stay as big as the biggest tier)
  setLimit(n) {
    this.limit = Math.max(16, Math.min(this.max, n | 0));
    if (this.next >= this.limit) this.next = 0;
    for (let i = this.limit; i < this.max; i++) { this.life[i] = 0; this.al[i] = 0; }
    this.points.geometry.setDrawRange(0, this.limit);
  }
  update(dt) {
    for (let i = 0; i < this.limit; i++) {
      if (this.life[i] <= 0) continue;
      const l = (this.life[i] -= dt);
      if (l <= 0) { this.al[i] = 0; continue; }
      const j = i * 3, k = 1 - l / this.L[i], dr = Math.max(0, 1 - this.d[i] * dt), mo = this.mo[i], age = this.L[i] - l;
      this.v[j] *= dr; this.v[j + 1] = this.v[j + 1] * dr - this.g[i] * dt; this.v[j + 2] *= dr;
      if (mo === 1) { const w = Math.sin(this.ph[i] + age * 13) * 2.4 * dt; this.v[j] += w * Math.cos(this.ph[i]); this.v[j + 2] += w * Math.sin(this.ph[i]); } // fire licks in S-curves
      else if (mo === 3) { const a = this.ph[i] + age * 3.2; this.v[j] += Math.cos(a) * 1.5 * dt; this.v[j + 2] += Math.sin(a) * 1.5 * dt; } // smoke rolls
      this.p[j] += this.v[j] * dt; this.p[j + 1] += this.v[j + 1] * dt; this.p[j + 2] += this.v[j + 2] * dt;
      if (this.p[j + 1] < 0.03) {
        if (mo === 2 && this.v[j + 1] < -2.5 && this.sp[i]) { this.crown(i); continue; } // water lands as a tiny crown of droplets
        this.p[j + 1] = 0.03; this.v[j + 1] *= -0.25; this.v[j] *= 0.7; this.v[j + 2] *= 0.7;
      }
      if (this.sp[i] && k > 0.62 && mo !== 2) this.split(i); // dissipate: break into smaller pieces that curl away
      this.sz[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * k;
      this.al[i] = this.a0[i] * Math.min(1, (1 - k) * 2.2) * Math.min(1, k * 12 + 0.2);
    }
    this.aP.needsUpdate = this.aC.needsUpdate = this.aS.needsUpdate = this.aA.needsUpdate = true;
  }
  split(i) {
    const j = i * 3, sz = this.sz[i], rem = this.life[i];
    this.sp[i] = 0; this.s1[i] *= 0.55;
    this._c.setRGB(this.c[j], this.c[j + 1], this.c[j + 2]);
    for (let n = 0; n < 2; n++) {
      const a = this.ph[i] + n * Math.PI + 1.2, sp = 0.9 + Math.random() * 0.8;
      const vx = this.v[j] * 0.5 + Math.cos(a) * sp, vz = this.v[j + 2] * 0.5 + Math.sin(a) * sp;
      const q = this.next; this.next = (q + 1) % this.limit;
      const t = q * 3;
      this.p[t] = this.p[j]; this.p[t + 1] = this.p[j + 1]; this.p[t + 2] = this.p[j + 2];
      this.v[t] = vx; this.v[t + 1] = this.v[j + 1] * 0.5 + 0.4; this.v[t + 2] = vz;
      this.c[t] = this._c.r; this.c[t + 1] = this._c.g; this.c[t + 2] = this._c.b;
      this.life[q] = this.L[q] = rem * 1.3 + 0.05; this.s0[q] = sz * 0.5; this.s1[q] = sz * 0.12; this.a0[q] = this.a0[i] * 0.8;
      this.g[q] = this.g[i] * 0.5; this.d[q] = this.d[i]; this.mo[q] = 3; this.ph[q] = a; this.sp[q] = 0; this.sz[q] = sz * 0.5; this.al[q] = this.a0[q];
    }
  }
  crown(i) {
    const j = i * 3, x = this.p[j], z = this.p[j + 2], s = this.s0[i] * 0.5;
    this.life[i] = 0; this.al[i] = 0;
    for (let n = 0; n < 3; n++) {
      const a = Math.random() * 6.28, q = this.next, t = q * 3; this.next = (q + 1) % this.limit;
      this.p[t] = x; this.p[t + 1] = 0.05; this.p[t + 2] = z;
      this.v[t] = Math.cos(a) * 1.2; this.v[t + 1] = 1.6 + Math.random(); this.v[t + 2] = Math.sin(a) * 1.2;
      this.c[t] = this.c[j]; this.c[t + 1] = this.c[j + 1]; this.c[t + 2] = this.c[j + 2];
      this.life[q] = this.L[q] = 0.28; this.s0[q] = s; this.s1[q] = s * 0.4; this.a0[q] = this.a0[i]; this.g[q] = 14; this.d[q] = 0.5; this.mo[q] = 0; this.sp[q] = 0;
      this.sz[q] = s; this.al[q] = this.a0[q];
    }
  }
  // Air push: a pressure wave shoves every live particle inside r outward (bends smoke and sparks around a cast).
  push(x, y, z, r, k) {
    for (let i = 0; i < this.limit; i++) {
      if (this.life[i] <= 0) continue;
      const j = i * 3, dx = this.p[j] - x, dy = this.p[j + 1] - y, dz = this.p[j + 2] - z, d = Math.hypot(dx, dy, dz);
      if (d >= r || d < 1e-3) continue;
      const f = (k * (1 - d / r)) / d;
      this.v[j] += dx * f; this.v[j + 1] += dy * f * 0.5 + f * d * 0.15; this.v[j + 2] += dz * f;
    }
  }
}

const TAIL = new THREE.ConeGeometry(1, 1, 14, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -0.5);
const glowMat = (hex, k = 2, o = {}) => new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), toneMapped: false, ...o });

// Illusions and afterimages: a fresnel-rim hologram of the caster's current pose.
const ghostMat = (hex) => new THREE.ShaderMaterial({
  uniforms: { uC: { value: new THREE.Color(hex).lerp(new THREE.Color(1, 1, 1), 0.25) }, uA: { value: 1 }, uT: { value: 0 } },
  vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
  fragmentShader: 'uniform vec3 uC; uniform float uA; uniform float uT; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2); float scan = 0.72 + 0.28 * sin(gl_FragCoord.y * 0.45 - uT * 14.0); gl_FragColor = vec4(uC * (0.18 + 2.3 * f) * scan * uA, 1.0); }',
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
});

// Casting body mechanics per style: A = anticipation peak, R = release peak (radians / metres).
// Springs between them give overshoot — staff whip, robe and hat follow-through.
const POSE = {
  flick:  { A: { arm: 0.25, tilt: -0.6, twist: -0.25, lean: -0.04 }, R: { arm: 1.25, tilt: 1.0, twist: 0.3, lean: 0.12, lunge: 0.06, trail: 0.15 } },
  thrust: { A: { arm: 0.35, tilt: 0.2, lean: -0.2, crouch: 0.25, lunge: -0.08, trail: -0.15 }, R: { arm: 1.45, tilt: 1.5, lean: 0.32, crouch: 0.35, lunge: 0.26, trail: 0.5, slide: -0.22 } },
  slam:   { A: { arm: 2.6, tilt: -0.5, lean: -0.24, crouch: -0.15, flare: -0.1 }, R: { arm: 0.75, tilt: 1.9, lean: 0.5, crouch: 0.85, lunge: 0.12, flare: 0.9, slide: -0.08 } },
  sweep:  { A: { arm: 0.9, tilt: 0.9, twist: -1.0, lean: 0.05, crouch: 0.3, roll: 0.12 }, R: { arm: 1.0, tilt: 1.1, twist: 1.0, lean: 0.14, crouch: 0.4, roll: -0.12, trail: 0.3, flare: 0.2, slide: -0.1 } },
  plant:  { A: { arm: 1.0, tilt: 0, lean: -0.06, crouch: -0.1 }, R: { arm: 0.35, tilt: 0.12, lean: 0.08, crouch: 0.6, flare: 0.7 } }
};
const DASH_POSE = { lean: 0.55, crouch: 0.3, arm: 0.6, tilt: 1.3, trail: 0.8 };
const CH = ['lean', 'twist', 'roll', 'crouch', 'lunge', 'arm', 'tilt', 'trail', 'flare', 'slide'];
const PROP_RX = /^(staff|shard_|crystal_socket|skull|jaw|horn_|rod_tip|coil_|club_|orb|geo_core|wind_)/;
function spring(sp, target, k, dt, zeta = 0.5) {
  const c = 2 * Math.sqrt(k) * zeta, n = Math.max(1, Math.ceil(dt * Math.sqrt(k) * 2)), h = dt / n;
  for (let i = 0; i < n; i++) { sp.v += (k * (target - sp.x) - c * sp.v) * h; sp.x += sp.v * h; }
  return sp.x;
}
const addMat = (hex, k = 1.6, opacity = 0.9) => glowMat(hex, k, { transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
const flatMat = (hex, opacity) => new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const SPHERE = new THREE.IcosahedronGeometry(1, 2);
const RING = new THREE.RingGeometry(0.9, 1, 64).rotateX(-Math.PI / 2);
const DISC = new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2);
const ICE_GEO = new THREE.IcosahedronGeometry(1, 0);
const ICE_MAT = new THREE.MeshStandardMaterial({ color: 0xcff4ff, emissive: 0x4ab0ff, emissiveIntensity: 0.35, roughness: 0.1, transparent: true, opacity: 0.55, flatShading: true, depthWrite: false });
const wedgeGeo = (r, arcDeg) => { const h = (arcDeg * Math.PI) / 360; return new THREE.CircleGeometry(r, 28, -Math.PI / 2 - h, 2 * h).rotateX(-Math.PI / 2); };
const ROCK = new THREE.MeshStandardMaterial({ color: 0x7a6e62, roughness: 0.95, flatShading: true });
const ROCK_HOT = new THREE.MeshStandardMaterial({ color: 0x5a3020, emissive: 0xff5a1a, emissiveIntensity: 1.4, roughness: 0.8, flatShading: true });
const ROCK_RUNE = new THREE.MeshStandardMaterial({ color: 0x4a3a5a, emissive: 0xb04bff, emissiveIntensity: 1.2, roughness: 0.8, flatShading: true });
const ROCK_ZAP = new THREE.MeshStandardMaterial({ color: 0x5a5440, emissive: 0xf4e15c, emissiveIntensity: 1.0, roughness: 0.8, flatShading: true });

function readCaps(renderer) {
  const gl = renderer.getContext();
  const get = (fn) => { try { return fn(); } catch { return undefined; } };
  const info = get(() => gl.getExtension('WEBGL_debug_renderer_info'));
  return {
    gpu: String(get(() => (info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER))) ?? ''),
    maxTexture: renderer.capabilities.maxTextureSize,
    maxFragUniforms: get(() => gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS))
  };
}

// Tries the usual settings, then plainer ones. With no WebGL at all it throws an error whose code is 'nowebgl'.
// No MSAA on the canvas: the scene is drawn into the composer's own targets, so a multisampled backbuffer smooths nothing.
function makeRenderer(canvas) {
  let cause = null;
  for (const powerPreference of ['high-performance', 'default', 'low-power']) {
    try { return new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference }); } catch (err) { cause = err; }
  }
  throw Object.assign(new Error('WebGL is not available'), { code: 'nowebgl', cause });
}

// opts: { choose(caps) -> tier name, onContext('lost' | 'restored'), onDisable(layer, err) }
export function createView(canvas, overlay, opts = {}) {
  const renderer = makeRenderer(canvas);
  const caps = readCaps(renderer);
  let tierName = opts.choose?.(caps);
  if (!PROFILES[tierName]) tierName = 'high';
  let prof = PROFILES[tierName];
  let lost = false;
  const safe = createSafeRunner({
    onFault: (name, err, n) => console.warn(`[view] ${name} threw (${n})`, err),
    onDisable: (name, err) => { console.error(`[view] ${name} switched off`, err); opts.onDisable?.(name, err); }
  });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1530);
  scene.fog = new THREE.Fog(0x1a1530, 30, 64);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 220);
  const hemi = new THREE.HemisphereLight(0xa49ce0, 0x2b2230, 1.35); scene.add(hemi);
  const moon = new THREE.DirectionalLight(0xccd2ff, 2.2);
  moon.position.set(-12, 30, 10);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  Object.assign(moon.shadow.camera, { left: -28, right: 28, top: 28, bottom: -28, near: 1, far: 80 });
  moon.shadow.bias = -0.0004;
  moon.shadow.normalBias = 0.02;
  scene.add(moon, moon.target);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.55, 0.45, 0.85);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const fx = { glow: new Particles(scene, 6000, true), dust: new Particles(scene, 2500, false) };
  const ctx = overlay.getContext('2d');
  let dpr = 1;

  const flashes = Array.from({ length: 4 }, () => { const l = new THREE.PointLight(0xffffff, 0, 10, 2); scene.add(l); return l; });
  let flashI = 0;
  const flash = (x, z, color, power = 40) => { const l = flashes[flashI++ % flashes.length]; l.color.setHex(color); l.intensity = power; l.position.set(x, 1.4, z); };

  // Arena themes: lighting, sky and fog per location.
  const THEMES = {
    court:  { bg: 0x1a1530, fog: [42, 92], sky: 0xa49ce0, ground: 0x2b2230, hemi: 1.35, sun: 0xccd2ff, sunI: 2.2, exp: 1.1 },
    forest: { bg: 0x9cc4b0, fog: [46, 100], sky: 0xe6f4ff, ground: 0x48612e, hemi: 1.5, sun: 0xfff0d2, sunI: 2.9, exp: 1.0 }
  };
  let theme = null;
  function applyTheme(id) {
    const T = THEMES[id] ?? THEMES.court;
    scene.background.setHex(T.bg); scene.fog.color.setHex(T.bg); scene.fog.near = T.fog[0]; scene.fog.far = T.fog[1];
    hemi.color.setHex(T.sky); hemi.groundColor.setHex(T.ground); hemi.intensity = T.hemi;
    moon.color.setHex(T.sun); moon.intensity = T.sunI; renderer.toneMappingExposure = T.exp;
  }
  let arena = null, pv = null, shake = 0, t = 0, camMode = 'menu', menuBlend = 1, camZoom = 1;
  const others = new Map(); // co-op (R-082): player id -> the view of every wizard but your own
  const camTarget = new THREE.Vector3(0, 0, 3.5);
  const enemyViews = new Map(), shotViews = new Map(), areaViews = new Map(), wallViews = new Map();
  const corpses = [], transients = [], texts = [];
  const aim = { x: 0, z: -1 };
  const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hitV = new THREE.Vector3();
  const _v = new THREE.Vector3();
  const tagSeen = new Map();
  const beamPrev = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), flatMat(0xffffff, 0.15));
  beamPrev.position.y = 0.04; beamPrev.visible = false; scene.add(beamPrev);
  const callouts = [];
  const callout = (x, z, name, color, kicker) => { callouts.push({ x, z, name, color, kicker, t: 0 }); if (callouts.length > 3) callouts.shift(); };
  const camK = { p: new THREE.Vector3(), v: new THREE.Vector3() };
  const ghosts = [], decoyViews = new Map();
  function ghost(o) {
    const V = o.view ?? pv;
    if (!V) return null;
    const mat = ghostMat(o.color ?? 0xffffff), g = V.group.clone(true);
    g.traverse((c) => { if (c.userData.fx) c.visible = false; if (c.isMesh) { c.material = mat; c.castShadow = false; c.receiveShadow = false; } });
    g.position.set(o.x ?? V.group.position.x, 0, o.z ?? V.group.position.z);
    g.rotation.y = o.yaw ?? V.yaw;
    g.scale.setScalar(o.scale ?? 1);
    mat.uniforms.uA.value = o.a ?? 1;
    scene.add(g);
    const G = { g, mat, life: o.life ?? 0.4, max: o.life ?? 0.4, a: o.a ?? 1, persist: !!o.persist, rise: o.rise ?? 0 };
    if (!G.persist) ghosts.push(G);
    return G;
  }
  const dropGhost = (G) => { scene.remove(G.g); G.mat.dispose(); };
  const wow = createWow({ scene, camera, composer, glow: fx.glow, puff: (...a) => puff(...a), burst: (...a) => burst(...a),
    lightning: (...a) => lightning(...a), ringFx: (...a) => ringFx(...a), flash, callout, shake: (k) => { shake = Math.min(1.4, shake + k); },
    body: {
      ghost,
      airPush: (x, y, z, r, k) => { fx.glow.push(x, y, z, r, k); fx.dust.push(x, y, z, r, k * 0.8); },
      kickCam: (x, y, z) => { camK.v.x += x * 9; camK.v.y += y * 9; camK.v.z += z * 9; }
    } });

  // reticle + previews
  const reticle = new THREE.Group();
  const retRing = new THREE.Mesh(RING, flatMat(0xffffff, 0.85)); retRing.scale.setScalar(0.34); retRing.position.y = 0.04;
  const retArea = new THREE.Mesh(RING, flatMat(0xffffff, 0.5)); retArea.position.y = 0.04;
  const ARC_N = 64, arcGeo = (r0, r1) => new THREE.RingGeometry(r0, r1, ARC_N, 1, Math.PI / 2, Math.PI * 2).rotateX(-Math.PI / 2);
  const retWind = new THREE.Mesh(arcGeo(0.44, 0.56), flatMat(0xffffff, 0.95)), retCd = new THREE.Mesh(arcGeo(0.62, 0.67), flatMat(0xffffff, 0.4));
  retWind.scale.x = retCd.scale.x = -1; retWind.position.y = retCd.position.y = 0.05;
  reticle.add(retRing, retArea, retWind, retCd);
  scene.add(reticle);
  const conePrev = new THREE.Mesh(wedgeGeo(5, 50), flatMat(0xffffff, 0.08)); conePrev.position.y = 0.035; scene.add(conePrev);
  let conePrevKey = '';
  const wallPrev = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.5).rotateX(-Math.PI / 2), flatMat(0xffffff, 0.18)); wallPrev.position.y = 0.04; scene.add(wallPrev);

  // The scene renders at the tier's ratio; the 2D overlay (bars, numbers) stays at least 1:1 so text reads on a small buffer.
  function resize() {
    const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
    const rpr = pixelRatioFor(prof, w, h, window.devicePixelRatio);
    dpr = Math.min(window.devicePixelRatio || 1, Math.max(1, rpr));
    renderer.setPixelRatio(rpr);
    composer.setPixelRatio(rpr);
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const s = (h * rpr) / (2 * Math.tan((camera.fov * Math.PI) / 360));
    fx.glow.mat.uniforms.uScale.value = s;
    fx.dust.mat.uniforms.uScale.value = s;
    overlay.width = Math.round(w * dpr); overlay.height = Math.round(h * dpr);
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);
  window.visualViewport?.addEventListener('resize', resize);
  resize();

  // A lost WebGL context (a driver reset, a tab starved of memory) must not end the page: stop drawing, say so, carry on when it is back.
  const onLost = (e) => { e.preventDefault(); lost = true; opts.onContext?.('lost'); };
  const onRestored = () => { lost = false; resize(); applyQuality(tierName); opts.onContext?.('restored'); };
  canvas.addEventListener('webglcontextlost', onLost, false);
  canvas.addEventListener('webglcontextrestored', onRestored, false);

  // ---------------------------------------------------------------- particles
  function puff(style, x, y, z, vx, vy, vz, o = {}) {
    const S = STYLE[style] || STYLE.arcane;
    const col = S.cols[(Math.random() * S.cols.length) | 0];
    const life = o.life ?? S.life[0] + Math.random() * (S.life[1] - S.life[0]);
    const k = o.size ?? 1;
    fx[S.sys].emit(x, y, z, vx, vy, vz, life, S.size[0] * k, S.size[1] * k, col, S.alpha ?? 1, o.grav ?? S.grav, o.drag ?? S.drag, S.mo ?? 0);
  }
  function burst(style, x, y, z, n, speed = 3, o = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, sq = Math.sqrt(1 - u * u), sp = speed * (0.4 + Math.random() * 0.8);
      const j = o.spread ?? 0;
      puff(style, x + (Math.random() - 0.5) * j, y, z + (Math.random() - 0.5) * j,
        Math.cos(a) * sq * sp, (o.up ?? 0.6) * Math.abs(u) * sp + (o.vy ?? 0), Math.sin(a) * sq * sp, o);
    }
  }
  const elStyle = (el) => (STYLE[el] ? el : 'arcane');

  function addText(x, y, z, text, color, size = 18, life = 0.9) {
    texts.push({ x: x + (Math.random() - 0.5) * 0.4, y, z, text: String(text), color, size, t: 0, life });
    if (texts.length > 80) texts.shift();
  }

  function transient(obj, max, update) {
    scene.add(obj);
    transients.push({ obj, t: 0, max, update });
  }

  function lightning(pts, color, y0 = 1.15, y1 = 1.0) {
    const quiet = y1 < 0.5;
    wow.vfx.bolt(pts.map((p, i) => new THREE.Vector3(p[0], i === 0 ? y0 : y1, p[1])), color, { quiet, w: quiet ? 0.11 : 0.22, life: quiet ? 0.14 : 0.26 });
  }

  function ringFx(x, z, r, color, dur = 0.4, y = 0.06) {
    const m = flatMat(color, 0.85);
    const o = new THREE.Mesh(RING, m);
    o.position.set(x, y, z);
    transient(o, dur, (k) => { o.scale.setScalar(0.2 + r * ease(k)); m.opacity = 0.85 * (1 - k); });
  }

  // ---------------------------------------------------------------- setup
  function setWizard(id) {
    if (pv) scene.remove(pv.group, ...pv.motes);
    pv = buildView(id);
  }

  const viewOf = (p, s) => (!p ? null : p === s.player ? pv : others.get(p.id) ?? null);
  function dropView(v) { scene.remove(v.group, ...v.motes); }

  // One wizard model, with its status shells and queue motes, added to the scene.
  function buildView(id) {
    const w = WIZARDS.find((x) => x.id === id) || WIZARDS[0];
    const built = buildWizard({ ...w });
    const group = built.group, root = built.rig.root;
    // The held prop gets its own pivot at the hand, so it can tilt, whip and lag behind the arm.
    const side = w.prop === 'orb' ? (w.raise === 'left' ? 0 : 1) : (w.propSide === 'left' ? 0 : 1);
    const hand = root.getObjectByName('hand_' + side);
    group.updateMatrixWorld(true);
    const grip = hand ? root.worldToLocal(hand.getWorldPosition(new THREE.Vector3())) : new THREE.Vector3(0.3, 0.8, 0.2);
    const pivot = new THREE.Group();
    pivot.name = 'prop_pivot'; pivot.position.copy(grip); root.add(pivot);
    for (const m of [...root.children]) if (PROP_RX.test(m.name)) { m.position.sub(grip); pivot.add(m); }
    const hatCone = group.getObjectByName('hat_cone');
    scene.add(group);
    let tip = null;
    for (const n of ['staff_gem', 'geo_core', 'wind_eye', 'shard_0', 'skull', 'rod_tip', 'orb', 'club_rune', 'hat_tip']) { tip = group.getObjectByName(n); if (tip) break; }
    const ice = new THREE.Mesh(ICE_GEO, ICE_MAT);
    ice.scale.set(0.7, 1.15, 0.7); ice.position.y = 1.0; ice.visible = false;
    group.add(ice);
    const ward = new THREE.Mesh(SPHERE, addMat(0xb48cff, 1, 0.14));
    ward.scale.setScalar(1.0); ward.position.y = 1.0; ward.visible = false;
    group.add(ward);
    const stones = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.11, 0), ROCK);
      const a = (i / 6) * Math.PI * 2;
      r.position.set(Math.sin(a) * 0.72, 0.2, Math.cos(a) * 0.72);
      stones.add(r);
    }
    stones.visible = false;
    group.add(stones);
    ice.userData.fx = ward.userData.fx = stones.userData.fx = true;
    const motes = [0, 1, 2].map(() => { const m = new THREE.Mesh(SPHERE, glowMat(0xffffff)); m.scale.setScalar(0.09); scene.add(m); return m; });
    const pose = {}; for (const c of CH) pose[c] = { x: 0, v: 0 };
    return { group, rig: built.rig, tip, ice, ward, stones, motes, phase: 0, yaw: Math.PI, w, pivot, hand, side, hatCone, hatX: hatCone?.rotation.x ?? 0,
      pose, hat: { x: 0, v: 0 }, whip: { x: 0, v: 0 } };
  }

  function clearViews() {
    for (const m of [enemyViews, shotViews, areaViews, wallViews]) {
      for (const v of m.values()) disposeView(v);
      m.clear();
    }
    for (const c of corpses.splice(0)) disposeView(c.v);
    for (const tr of transients.splice(0)) scene.remove(tr.obj);
    for (const G of ghosts.splice(0)) dropGhost(G);
    for (const G of decoyViews.values()) dropGhost(G);
    decoyViews.clear();
    for (const v of others.values()) dropView(v);
    others.clear();
    texts.length = 0;
  }
  function disposeView(v) { for (const o of v.objs || [v.obj]) if (o) scene.remove(o); }

  function reset(game) {
    const th = game.theme ?? 'court';
    if (!arena || theme !== th) { if (arena) scene.remove(arena.group); arena = buildArena(ARENA_R, game.props, GATES, th); scene.add(arena.group); theme = th; applyTheme(th); applyLights(); }
    clearViews();
    if (!pv || pv.w.id !== game.player.wizard) setWizard(game.player.wizard);
    camTarget.set(game.player.x, 0, game.player.z);
    camZoom = 1;
    shake = 0;
    wow.reset();
    callouts.length = 0;
  }

  function screenToGround(nx, ny) {
    ray.setFromCamera({ x: nx, y: ny }, camera);
    if (ray.ray.intersectPlane(plane, hitV)) { aim.x = hitV.x; aim.z = hitV.z; }
    return { x: aim.x, z: aim.z };
  }

  // ---------------------------------------------------------------- events
  // Painterly fx2d layer (see fx-showcase.html) on top of the existing particles; arena keeps its own post chain.
  const fx2 = createFx2d({ scene, camera, renderer, lights: 0, post: false }); fx2.S.density = 0.75;
  const FX = fxRecipes(fx2);
  const PAL_OF = (els) => { const has = (x) => els.includes(x);
    if (has('fire') && has('lightning')) return { fire: 'plasma', smoke: 'smoke', crack: 'magma' };
    if (has('fire') && has('earth')) return { fire: 'magma', smoke: 'smoke', crack: 'magma' };
    for (const [el, o] of [['fire', { fire: 'fire', smoke: 'smoke', crack: 'magma' }], ['lightning', { fire: 'lightning', smoke: 'wind', crack: 'lightning' }],
      ['ice', { fire: 'ice', smoke: 'frost', crack: 'icefield' }], ['water', { fire: 'water', smoke: 'frost', crack: 'water' }], ['earth', { fire: 'dust', smoke: 'dust', crack: 'earth' }],
      ['light', { fire: 'light', smoke: 'frost', crack: 'light' }], ['dark', { fire: 'dark', smoke: 'smoke', crack: 'dark' }], ['arcane', { fire: 'arcane', smoke: 'smoke', crack: 'arcane' }],
      ['nature', { fire: 'nature', smoke: 'dust', crack: 'nature' }], ['wind', { fire: 'wind', smoke: 'wind', crack: 'wind' }]]) if (has(el)) return o;
    return { fire: 'fire', smoke: 'smoke', crack: 'magma' }; };

  let fxTip = null; // another wizard's staff tip while their event is drawn (R-082)
  function tipPos(v = pv) {
    if (v?.tip) return v.tip.getWorldPosition(_v).clone();
    return v ? v.group.position.clone().add(new THREE.Vector3(0, 1.6, 0)) : new THREE.Vector3();
  }

  const afx = createArenaFx({ fx: fx2, R: FX, tipPos: () => fxTip ?? tipPos(), scene,
    bodyOf: (pid, selfId) => (!pid || pid === selfId ? pv : others.get(pid) ?? null) });

  // Events about the wizard on this screen use its body; another wizard's casts use theirs (R-082).
  const BODY_ONLY = new Set(['queue', 'windup', 'dash', 'dashEnd', 'dodge']);
  function consume(events, game) {
    for (const e of events) {
      const mine = !e.pid || !game.player || e.pid === game.player.id;
      const ov = mine ? null : others.get(e.pid) ?? null;
      if (mine) safe.run('wow', () => wow.onEvent(e, game));
      else if (!BODY_ONLY.has(e.type)) safe.run('wow', () => wow.onEvent(e, game, ov ? tipPos(ov) : null));
      if (mine) safe.run('afx', () => afx.onEvent(e, game));
      else if (!BODY_ONLY.has(e.type)) { fxTip = ov ? tipPos(ov) : null; safe.run('afx', () => afx.onEvent(e, game)); fxTip = null; }
      switch (e.type) {
        case 'cast': {
          const tp = tipPos(ov ?? pv);
          for (const el of e.els) burst(elStyle(el), tp.x, tp.y, tp.z, 6, 2.2);
          FX.flash([tp.x, tp.y, tp.z], PAL_OF(e.els).fire, 0.9, 0);
          flash(tp.x, tp.z, e.color, 14);
          break;
        }
        case 'explode': {
          { const P = PAL_OF(e.els); FX.explosion([e.x, 0, e.z], { r: Math.min(1.5, e.r * 0.5), pal: P.fire, smoke: P.smoke, crackPal: P.crack, scorch: e.big ? 4 : 2.5, smokeScale: 0.5, smokeAlpha: 0.75 });
            if (e.els.includes('earth') && e.els.includes('fire')) FX.rockfire([e.x, 0, e.z], { r: Math.min(1.1, e.r * 0.4), life: 2.4, rocks: 9 });
            else if (e.els.includes('earth') || e.els.includes('ice')) FX.debris([e.x, 0, e.z], e.els.includes('ice') ? 'ice' : 'earth', e.big ? 12 : 7, 6, 0.22); }

          flash(e.x, e.z, e.color, e.big ? 60 : 35);
          shake = Math.min(1.2, shake + (e.big ? 0.55 : 0.28));
          break;
        }
        case 'impact':
          if (e.enemy) { burst('hex', e.x, 1.1, e.z, 14, 3); break; }
          { const P = PAL_OF(e.els); FX.flash([e.x, 1.0, e.z], P.fire, 0.8, 0); FX.sparks([e.x, 1.0, e.z], P.fire, 8, 5); }
          for (const el of e.els) burst(elStyle(el), e.x, 1.0, e.z, 6, 3.2);
          if (e.kind === 'boulder') { burst('earth', e.x, 0.6, e.z, 16, 4); shake = Math.min(1, shake + 0.12); }
          flash(e.x, e.z, e.color, 18);
          break;
        case 'hit':
          if (e.crit) addText(e.x, 2.2, e.z, 'CRIT -' + Math.round(e.dmg) + '!', '#ffd166', 26, 1.2);
          else addText(e.x, 1.9, e.z, Math.max(1, Math.round(e.dmg)), elCss(e.el), e.dot ? 14 : e.dmg > 25 ? 26 : 20, e.dot ? 0.7 : 0.9);
          if (!e.dot) burst('spark', e.x, 1.0, e.z, 5, 3);
          break;
        case 'heal': addText(e.x, 2.5, e.z, '+' + Math.round(e.amt), '#7ee08a', e.amt >= 10 ? 22 : 16); break;
        case 'hurt':
          addText(e.x, 2.3, e.z, '-' + Math.max(1, Math.round(e.dmg)), e.self ? '#ffad5c' : '#ff5a5a', e.dot ? 15 : 22);
          if (!e.dot) { shake = Math.min(1, shake + 0.2); burst('blood', e.x, 1.1, e.z, 8, 3); }
          break;
        case 'tag': {
          const T = TAGS[e.tag];
          const TV = VIA[e.tag + ':' + e.via] ?? T, tk = e.id + ':' + e.tag;
          if (TV && t - (tagSeen.get(tk) ?? -9) > 0.8) { tagSeen.set(tk, t); addText(e.x, 2.7, e.z, TV[0], TV[1], e.via === 'thermal' ? 17 : 14, 1.0); }
          if (e.tag === 'shatter') burst('ice', e.x, 1.0, e.z, 40, 5, { size: 1.6 });
          if (e.tag === 'freeze') burst('ice', e.x, 0.9, e.z, 20, 2.5, { size: 1.3 });
          if (e.tag === 'steam') burst('steam', e.x, 0.9, e.z, 10, 1.4);
          break;
        }
        case 'death': {
          const v = enemyViews.get(e.id);
          if (!v) break;
          enemyViews.delete(e.id);
          disposeView({ objs: [v.tele.group, v.spawnRing] });
          if (e.frozen) { burst('ice', e.x, 1, e.z, 60, 6, { size: 1.8 }); disposeView({ objs: [v.R.group] }); addText(e.x, 2.6, e.z, 'SHATTERED', '#ffffff', 15); }
          else {
            burst(e.kind === 'hexcaller' ? 'hex' : 'smoke', e.x, 1.0, e.z, 22, 2.4);
            if (e.kind === 'bulwark') burst('spark', e.x, 1.2, e.z, 20, 5);
            corpses.push({ v: { objs: [v.R.group] }, R: v.R, t: 0 });
          }
          break;
        }
        case 'slam': {
          ringFx(e.x, e.z, e.r, 0xffb070, 0.45);
          burst('earth', e.x, 0.3, e.z, 40, 6, { up: 0.9 });
          burst('smoke', e.x, 0.3, e.z, 16, 3, { spread: e.r });
          shake = Math.min(1.2, shake + 0.5);
          break;
        }
        case 'bounce': {
          const sv = shotViews.get(e.id);
          if (sv) sv.squash = 1;
          burst(e.kind === 'boulder' ? 'earth' : elStyle(e.els[0]), e.x, 0.2, e.z, 8, 2.5, { up: 0.9 });
          burst('smoke', e.x, 0.2, e.z, 4, 1.2);
          shake = Math.min(1, shake + 0.12);
          break;
        }
        case 'claw': burst('spark', e.x, 1.1, e.z, 10, 4); burst('blood', e.x, 1.1, e.z, 6, 3); break;
        case 'dodge': burst('smoke', e.x, 0.2, e.z, 10, 2); for (let i = 0; i < 12; i++) puff('arcane', e.x, 0.6 + Math.random(), e.z, -e.dx * 4, 0.5, -e.dz * 4); break;
        case 'selfcast': {
          ringFx(e.x, e.z, 1.4, e.color, 0.5);
          for (const el of e.els) for (let i = 0; i < 24; i++) { const a = Math.random() * 6.28; puff(elStyle(el), e.x + Math.sin(a) * 0.7, 0.2, e.z + Math.cos(a) * 0.7, 0, 2 + Math.random() * 2, 0, { grav: -1 }); }
          break;
        }
        case 'nova': {
          ringFx(e.x, e.z, e.r, e.color, 0.45);
          for (const el of e.els) for (let i = 0; i < 16; i++) { const a = Math.random() * 6.28, sp = e.r * (2.6 + Math.random()); puff(elStyle(el), e.x, 0.6, e.z, Math.sin(a) * sp, 0.6, Math.cos(a) * sp, { life: e.r / sp, drag: 0.4, grav: 0, size: 1.3 }); }
          flash(e.x, e.z, e.color, 40);
          break;
        }
        case 'charge': for (let i = 0; i < 30; i++) { const a = Math.random() * 6.28, r = Math.random() * e.r; puff('lightning', e.x + Math.sin(a) * r, 0.1, e.z + Math.cos(a) * r, 0, 3 + Math.random() * 3, 0); } flash(e.x, e.z, 0xf4e15c, 30); break;
        case 'steam': burst('steam', e.x, 0.3, e.z, 18, 1.2, { spread: e.r }); break;
        case 'ignite': burst('fire', e.x, 0.3, e.z, 30, 2, { spread: e.r }); flash(e.x, e.z, 0xff7a2f, 25); break;
        case 'wallBreak': burst(e.mat === 'ice' ? 'ice' : 'earth', e.x, 0.7, e.z, 18, 3, { size: 1.4 }); break;
        case 'wall': burst('smoke', e.x, 0.2, e.z, 16, 2.2, { spread: 2.5 }); break;
        case 'block': burst('spark', e.x, 1.1, e.z, 14, 4); break;
        case 'cancel': addText(e.x, 2.6, e.z, 'CANCELLED', '#ffffff', 14); burst('steam', e.x, 1.6, e.z, 8, 1); break;
        case 'fizzle': burst('smoke', e.x, 1.6, e.z, 5, 0.8); break;
        case 'ward': burst('arcane', e.x, 1.0, e.z, 10, 2.5); break;
        case 'spawn': ringFx(e.x, e.z, 1.3, 0xff3b3b, 0.9, 0.05); break;
      }
    }
  }

  // ---------------------------------------------------------------- entity views
  function statusFx(st, x, z, h, dt) {
    if (st.burn > 0) for (let i = rate(38, dt); i--;) puff('fire', x + (Math.random() - 0.5) * 0.5, 0.3 + Math.random() * h * 0.7, z + (Math.random() - 0.5) * 0.5, 0, 0.8, 0);
    if (st.wet > 0 && st.frozen <= 0) for (let i = rate(7, dt); i--;) puff('water', x + (Math.random() - 0.5) * 0.6, h * 0.8, z + (Math.random() - 0.5) * 0.6, 0, -0.5, 0, { size: 0.8 });
    if (st.chill > 0 && st.frozen <= 0) for (let i = rate(6 * st.chill, dt); i--;) puff('ice', x + (Math.random() - 0.5) * 0.8, Math.random() * h, z + (Math.random() - 0.5) * 0.8, 0, 0.3, 0);
    if (st.shock > 0) for (let i = rate(40, dt); i--;) puff('lightning', x + (Math.random() - 0.5) * 0.7, Math.random() * h, z + (Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3);
    if (st.slow > 0) for (let i = rate(5, dt); i--;) puff('earth', x + (Math.random() - 0.5) * 0.6, 0.3, z + (Math.random() - 0.5) * 0.6, 0, 0.5, 0, { size: 0.7 });
    if (st.haste > 0) for (let i = rate(14, dt); i--;) puff('lightning', x + (Math.random() - 0.5) * 0.5, 0.2 + Math.random() * h, z + (Math.random() - 0.5) * 0.5, 0, 0, 0, { life: 0.3 });
  }

  function makeTelegraph(kind) {
    const group = new THREE.Group(), m = flatMat(0xff3b3b, 0), m2 = flatMat(0xff3b3b, 0);
    const parts = {};
    if (kind === 'thrall') parts.wedge = group.add(new THREE.Mesh(wedgeGeo(1.75, 90), m)) && group.children[0];
    else if (kind === 'bulwark') { parts.fill = new THREE.Mesh(DISC, m); parts.ring = new THREE.Mesh(RING, m2); group.add(parts.fill, parts.ring); }
    else { const geo = new THREE.PlaneGeometry(0.14, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5); parts.line = new THREE.Mesh(geo, m); group.add(parts.line); }
    group.position.y = 0.035;
    scene.add(group);
    return { group, m, m2, parts };
  }

  function syncEnemies(s, dt) {
    const seen = new Set();
    for (const e of s.enemies) {
      seen.add(e.id);
      let v = enemyViews.get(e.id);
      if (!v) {
        const R = buildEnemy(e.kind);
        scene.add(R.group);
        const ice = new THREE.Mesh(ICE_GEO, ICE_MAT);
        ice.scale.set(R.iceR, R.height * 0.55, R.iceR); ice.position.y = R.height * 0.45; ice.visible = false;
        R.group.add(ice);
        const spawnRing = new THREE.Mesh(DISC, flatMat(0x3a0a12, 0.85));
        spawnRing.position.set(e.x, 0.03, e.z); spawnRing.scale.setScalar(0.1);
        scene.add(spawnRing);
        v = { R, ice, spawnRing, tele: makeTelegraph(e.kind), phase: Math.random() * 6, yaw: e.face, arm: 0 };
        v.objs = [R.group, v.tele.group, spawnRing];
        enemyViews.set(e.id, v);
      }
      updateEnemyView(v, e, dt, s);
    }
    for (const [id, v] of enemyViews) if (!seen.has(id)) { disposeView(v); enemyViews.delete(id); }
  }

  function updateEnemyView(v, e, dt, s) {
    const R = v.R, g = R.group, st = e.st, A = e.T.atk;
    v.yaw = lerpAngle(v.yaw, e.face, 1 - Math.exp(-14 * dt));
    g.rotation.y = v.yaw;
    let y = 0;
    if (e.state === 'spawn') {
      const k = 1 - e.stateT / 0.9;
      y = -R.height * (1 - ease(k));
      v.spawnRing.visible = true;
      v.spawnRing.scale.setScalar(0.4 + 1.0 * Math.min(1, k * 2));
      for (let i = rate(40, dt); i--;) { const a = Math.random() * 6.28; puff('rune', e.x + Math.sin(a) * 1.1, 0.1, e.z + Math.cos(a) * 1.1, 0, 1.5 + Math.random() * 2, 0); }
    } else v.spawnRing.visible = false;
    if (R.float) y += 0.28 + Math.sin(t * 2.2 + e.id) * 0.08;
    const frozen = st.frozen > 0;
    const spd = Math.hypot(e.vx, e.vz);
    if (!frozen) v.phase += dt * (2 + spd * 2.6);
    R.legs.forEach((l, i) => { l.rotation.x = Math.sin(v.phase + i * Math.PI) * Math.min(1, spd / 2) * 0.7; });
    const w = e.state === 'windup' || e.state === 'charge' ? 1 - Math.max(0, e.stateT) / A.windup : 0;
    let lean = 0, squash = 1;
    if (!frozen) {
      if (e.kind === 'thrall') {
        const swing = Math.sin(v.phase) * Math.min(1, spd / 2) * 0.5;
        let target = 0;
        if (e.state === 'windup') { target = -2.6 * ease(w); squash = 1 - 0.14 * w; }
        else if (e.state === 'strike') { target = -0.4; lean = 0.45; }
        v.arm += (target - v.arm) * Math.min(1, dt * (e.state === 'strike' ? 30 : 14));
        R.arms.forEach((a, i) => { a.rotation.x = v.arm + (e.state === 'chase' ? (i ? swing : -swing) : 0); });
      } else if (e.kind === 'bulwark') {
        let target = 0;
        if (e.state === 'windup') target = -3.4 * ease(w);
        else if (e.state === 'recover') target = e.stateT > A.recover - 0.15 ? -0.9 : -0.9 * (e.stateT / A.recover);
        v.arm += (target - v.arm) * Math.min(1, dt * (e.state === 'recover' && e.stateT > A.recover - 0.15 ? 40 : 9));
        R.arms[0].rotation.x = v.arm;
        R.shield.position.x = e.state === 'windup' ? -0.34 - 0.2 * w : -0.34;
        R.shield.rotation.y = e.state === 'windup' ? 0.12 + 0.6 * w : 0.12;
      } else {
        R.orb.scale.setScalar(e.state === 'charge' ? 0.5 + 1.8 * w : 0.5);
        R.arms.forEach((h, i) => { h.position.y = 1.22 + (e.state === 'charge' ? 0.25 * w : Math.sin(t * 3 + i) * 0.04); });
        R.sigil.rotation.z += dt * (e.state === 'charge' ? 6 : 1.2);
        if (e.state === 'charge') for (let i = rate(30, dt); i--;) { _v.set(0, 1.25, 0.52).applyAxisAngle(THREE.Object3D.DEFAULT_UP, v.yaw); puff('hex', e.x + _v.x + (Math.random() - 0.5) * 0.8, y + _v.y + (Math.random() - 0.5) * 0.8, e.z + _v.z + (Math.random() - 0.5) * 0.8, -(Math.random() - 0.5), 0, 0, { life: 0.3 }); }
      }
    }
    const f = e.flash / 0.14;
    v.hit ??= { x: 0, v: 0 }; v.lean ??= { x: 0, v: 0 }; v.roll ??= { x: 0, v: 0 };
    if (e.flash > (v.lf ?? 0) + 0.01) v.hit.v += 14; // struck: squash, then wobble back
    v.lf = e.flash;
    const sy = Math.sin(v.yaw), cy = Math.cos(v.yaw), kz = e.kvx * sy + e.kvz * cy, kx = e.kvx * cy - e.kvz * sy;
    const hq = spring(v.hit, 0, 260, dt, 0.3);
    const lp = spring(v.lean, Math.max(-0.5, Math.min(0.5, kz * 0.06)), 120, dt, 0.45); // the upper body lags the shove
    const rl = spring(v.roll, Math.max(-0.4, Math.min(0.4, -kx * 0.05)), 120, dt, 0.45);
    const sm = Math.min(0.35, Math.hypot(e.kvx, e.kvz) * 0.025); // smear: stretch along the shove
    R.body.rotation.x = lean + lp - f * 0.15;
    R.body.rotation.z = rl;
    R.body.scale.set(1 + hq * 0.12 + Math.min(0.2, Math.abs(kx) * 0.02), squash - hq * 0.18, 1 + hq * 0.12 + sm);
    let jx = 0, jz = 0;
    if (st.shock > 0) { jx = (Math.random() - 0.5) * 0.08; jz = (Math.random() - 0.5) * 0.08; }
    g.position.set(e.x + jx, y, e.z + jz);
    for (const m of R.mats) {
      m.emissive.copy(m.userData.e0);
      m.emissiveIntensity = m.userData.i0;
      if (f > 0) { m.emissive.lerp(WHITE, f); m.emissiveIntensity = Math.max(m.userData.i0, 1.4 * f); }
      else if (frozen) { m.emissive.lerp(ICE, 0.5); m.emissiveIntensity = Math.max(m.userData.i0, 0.6); }
      else if (st.burn > 0) { m.emissive.lerp(BURN, 0.35); m.emissiveIntensity = Math.max(m.userData.i0, 0.5 + Math.sin(t * 20) * 0.15); }
      else if (st.chill > 0) { m.emissive.lerp(ICE, 0.12 * st.chill); m.emissiveIntensity = Math.max(m.userData.i0, 0.4); }
    }
    v.frozenT = frozen ? (v.frozenT ?? 0) + dt : 0;
    v.ice.visible = frozen;
    if (frozen) { const g = ease(v.frozenT / 0.16), w = R.iceR * (0.6 + 0.4 * g); v.ice.scale.set(w, Math.max(0.01, R.height * 0.55 * g), w); v.ice.position.y = R.height * 0.55 * g * 0.82; }
    if (e.state !== 'spawn') statusFx(st, e.x, e.z, R.height, dt);
    // telegraphs
    const T = v.tele;
    T.group.visible = !frozen && e.state !== 'spawn';
    if (e.kind === 'thrall') {
      const on = e.state === 'windup' || e.state === 'strike';
      T.m.opacity = on ? (e.state === 'strike' ? 0.7 : 0.12 + 0.45 * w) : 0;
      T.group.position.set(e.x, 0.035, e.z);
      T.group.rotation.y = Math.atan2(e.aimX, e.aimZ);
    } else if (e.kind === 'bulwark') {
      const on = e.state === 'windup';
      T.group.position.set(e.slamX, 0.035, e.slamZ);
      T.parts.ring.scale.setScalar(A.radius);
      T.parts.fill.scale.setScalar(Math.max(0.01, A.radius * ease(w)));
      T.m.opacity = on ? 0.32 : 0; T.m2.opacity = on ? 0.95 : 0;
    } else {
      const on = e.state === 'charge';
      const p = s.player, L = Math.min(A.range, Math.hypot(p.x - e.x, p.z - e.z));
      T.group.position.set(e.x, 0.035, e.z);
      T.group.rotation.y = Math.atan2(e.aimX, e.aimZ);
      T.parts.line.scale.set(1 + w, 1, L);
      T.m.opacity = on ? 0.2 + 0.55 * w : 0;
    }
  }

  function syncShots(s, dt) {
    const seen = new Set();
    for (const b of s.shots) {
      seen.add(b.id);
      let v = shotViews.get(b.id);
      if (!v) {
        let obj; const parts = {};
        if (b.kind === 'boulder') {
          const m = b.els.includes('fire') ? ROCK_HOT : b.els.includes('arcane') ? ROCK_RUNE : b.els.includes('lightning') ? ROCK_ZAP : ROCK;
          obj = new THREE.Mesh(new THREE.DodecahedronGeometry(0.4, 0), m);
          obj.castShadow = true;
        } else if (b.kind === 'orb') {
          obj = new THREE.Mesh(SPHERE, glowMat(0x5cffb0, 2.2)); obj.scale.setScalar(0.28);
        } else {
          if (b.kind === 'spear') obj = new THREE.Object3D();
          else {
            obj = new THREE.Group(); obj.rotation.order = 'YXZ';
            parts.body = new THREE.Mesh(SPHERE, glowMat(b.color, 2.4));
            parts.core = new THREE.Mesh(SPHERE, glowMat(new THREE.Color(b.color).lerp(WHITE, 0.65), 3.4));
            parts.tail = new THREE.Mesh(TAIL, addMat(b.color, 1.8, 0.7));
            obj.add(parts.tail, parts.body, parts.core);
          }
        }
        scene.add(obj);
        v = { obj, age: 0, squash: 0, ...parts };
        shotViews.set(b.id, v);
      }
      const y = b.y ?? (b.kind === 'boulder' ? 0.95 : 1.15);
      v.age += dt;
      v.obj.position.set(b.x, y, b.z);
      if (v.body) { // spawns squashed wide, then stretches along its speed; the bright core leads, the tail tapers
        const hs = Math.hypot(b.vx, b.vz), spd = Math.hypot(hs, b.vy || 0), k = ease(v.age / 0.07), st = 1 + Math.min(2.2, spd * 0.05) * k, wide = 1 + 0.45 * (1 - k);
        v.obj.rotation.y = Math.atan2(b.vx, b.vz);
        v.obj.rotation.x = b.arc ? -Math.atan2(b.vy, hs) : 0;
        v.body.scale.set((b.r * 1.05 * wide) / Math.sqrt(st), (b.r * 1.05 * wide) / Math.sqrt(st), b.r * 1.1 * st);
        v.core.scale.setScalar(b.r * 0.62); v.core.position.z = b.r * 0.5 * st;
        v.tail.scale.set(b.r * 0.85, b.r * 0.85, Math.max(0.01, b.r * (2.5 + spd * 0.09) * k));
      }
      if (b.kind === 'boulder') {
        v.obj.rotation.x += dt * 9; v.obj.rotation.z += dt * 4;
        v.squash *= Math.exp(-9 * dt);
        v.obj.scale.set(1 + v.squash * 0.28, 1 - v.squash * 0.34, 1 + v.squash * 0.28);
      }
      const els = b.kind === 'orb' ? ['hex'] : b.els;
      for (const el of els) for (let i = rate(b.kind === 'boulder' ? 14 : 24, dt); i--;) {
        puff(el === 'hex' ? 'hex' : elStyle(el), b.x + (Math.random() - 0.5) * b.r, y + (Math.random() - 0.5) * b.r, b.z + (Math.random() - 0.5) * b.r,
          -b.vx * 0.05 + (Math.random() - 0.5), (Math.random() - 0.5), -b.vz * 0.05 + (Math.random() - 0.5), { size: 0.8, life: 0.3 });
      }
    }
    for (const [id, v] of shotViews) if (!seen.has(id)) { scene.remove(v.obj); shotViews.delete(id); }
  }

  function syncAreas(s, dt) {
    const seen = new Set();
    for (const a of s.areas) {
      if (a.spray) continue; // a jet is drawn by its cone effect, not as a field
      seen.add(a.id);
      const armed = !!a.mine && !a.mine.fired; // a mine shows only its small rune until it trips
      let v = areaViews.get(a.id);
      if (!v) {
        const fill = new THREE.Mesh(DISC, flatMat(new THREE.Color(a.color).multiplyScalar(0.55), 0.16)), edge = new THREE.Mesh(RING, flatMat(a.color, 0.8));
        fill.position.set(a.x, 0.03, a.z); edge.position.set(a.x, 0.04, a.z);
        fill.scale.setScalar(armed ? 0.9 : a.r); edge.scale.setScalar(armed ? 0.9 : a.r);
        scene.add(fill, edge);
        v = { objs: [fill, edge], fill, edge, zapT: 0 };
        if (a.delay > 0) { v.star = new THREE.Mesh(SPHERE, glowMat(a.color, 3)); v.star.scale.setScalar(0.45); scene.add(v.star); v.objs.push(v.star); }
        areaViews.set(a.id, v);
      }
      const fade = a.delay > 0 ? 1 : Math.min(1, a.life / 0.4);
      if (a.delay > 0) {
        if (!v.star) { v.star = new THREE.Mesh(SPHERE, glowMat(a.color, 3)); v.star.scale.setScalar(0.45); scene.add(v.star); v.objs.push(v.star); }
        if (a.mine) v.edge.scale.setScalar(a.r);
        const k = 1 - a.delay / a.delayMax;
        v.fill.scale.setScalar(Math.max(0.01, a.r * ease(k)));
        v.fill.material.opacity = 0.18 + 0.2 * k;
        v.edge.material.opacity = 0.5 + 0.5 * Math.abs(Math.sin(t * 14));
        v.star.position.set(a.x + (1 - k) * 4, 0.6 + (1 - k) * 12, a.z - (1 - k) * 2);
        for (let i = rate(60, dt); i--;) puff(elStyle(a.els[(Math.random() * a.els.length) | 0]), v.star.position.x, v.star.position.y, v.star.position.z, (Math.random() - 0.5), 1, (Math.random() - 0.5), { size: 1.4 });
      } else if (armed) {
        const pulse = 0.5 + 0.5 * Math.sin(t * 5), live = a.mine.arm > 0 ? 0.3 : 1;
        v.fill.material.opacity = (0.1 + 0.1 * pulse) * live;
        v.edge.material.opacity = (0.3 + 0.4 * pulse) * live;
      } else {
        v.fill.material.opacity = 0.16 * fade;
        v.edge.material.opacity = 0.8 * fade;
        for (const el of a.els) for (let i = rate(28 * a.r, dt); i--;) {
          const ang = Math.random() * 6.28, r = Math.sqrt(Math.random()) * a.r;
          const px = a.x + Math.sin(ang) * r, pz = a.z + Math.cos(ang) * r;
          if (a.pull) puff(elStyle(el), px, 0.25, pz, (a.x - px) * 1.5 + Math.cos(ang) * 2, 0.2, (a.z - pz) * 1.5 - Math.sin(ang) * 2, { grav: 0, life: 0.6 });
          else puff(elStyle(el), px, 0.1, pz, 0, el === 'water' ? 2.5 : 1.2, 0, { grav: el === 'water' ? 8 : STYLE[elStyle(el)].grav * 0.5 });
        }
        if (a.els.includes('lightning') && (v.zapT -= dt) <= 0) {
          v.zapT = 0.12;
          const p0 = Math.random() * 6.28, p1 = p0 + 1 + Math.random() * 2;
          lightning([[a.x + Math.sin(p0) * a.r * 0.8, a.z + Math.cos(p0) * a.r * 0.8], [a.x + Math.sin(p1) * a.r * 0.6, a.z + Math.cos(p1) * a.r * 0.6]], a.color, 0.2, 0.2);
        }
      }
    }
    for (const [id, v] of areaViews) if (!seen.has(id)) { disposeView(v); areaViews.delete(id); }
  }

  function syncWalls(s, dt) {
    const seen = new Set();
    for (const w of s.walls) {
      seen.add(w.id);
      let v = wallViews.get(w.id);
      if (!v) { v = { obj: buildWall(w.mat, w.id * 1.7), age: 0 }; v.obj.position.set(w.x, 0, w.z); scene.add(v.obj); wallViews.set(w.id, v); }
      v.age += dt;
      const rise = ease(v.age / 0.16), hp = Math.max(0, w.hp / w.maxHp);
      v.obj.scale.set(1, Math.max(0.05, rise * (0.75 + 0.25 * hp)), 1);
      v.obj.position.y = w.life < 0.6 ? -(0.6 - w.life) * 1.5 : 0;
      if (w.chill) for (let i = rate(3, dt); i--;) puff('ice', w.x + (Math.random() - 0.5) * 0.8, Math.random() * 1.5, w.z + (Math.random() - 0.5) * 0.8, 0, 0.3, 0);
    }
    for (const [id, v] of wallViews) if (!seen.has(id)) { scene.remove(v.obj); wallViews.delete(id); }
  }

  function syncProps(s, dt) {
    for (const pd of s.props.puddles) {
      const v = arena.puddles.get(pd.id);
      if (!v) continue;
      const m = v.mat;
      if (pd.state === 'frozen') { m.color.setHex(0xcdeeff); m.emissive.setHex(0x6fb8e8); m.emissiveIntensity = 0.2; m.roughness = 0.35; }
      else if (pd.state === 'charged') {
        m.color.setHex(0x3d7fbf); m.emissive.setHex(0xf4e15c); m.emissiveIntensity = 0.25 + Math.random() * 0.35; m.roughness = 0.1;
        for (let i = rate(50, dt); i--;) { const a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * pd.r; puff('lightning', pd.x + Math.sin(a) * r, 0.08, pd.z + Math.cos(a) * r, (Math.random() - 0.5) * 2, 2 + Math.random() * 3, (Math.random() - 0.5) * 2); }
      } else { m.color.setHex(theme === 'forest' ? 0x3d86a3 : 0x24527c); m.emissive.setHex(0x000000); m.emissiveIntensity = 0; m.roughness = 0.08; }
    }
    for (const br of s.props.brush) {
      const v = arena.brush.get(br.id), m = v.mat;
      if (br.state === 'burning') {
        m.color.setHex(0x4a2a12); m.emissive.setHex(0xff5a1a); m.emissiveIntensity = 0.8 + Math.sin(t * 18 + br.x) * 0.3;
        v.group.scale.y = Math.max(0.4, br.t / 5);
        for (let i = rate(70, dt); i--;) { const a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * br.r; puff('fire', br.x + Math.sin(a) * r, 0.2, br.z + Math.cos(a) * r, 0, 1, 0, { size: 1.3 }); }
        for (let i = rate(8, dt); i--;) puff('smoke', br.x + (Math.random() - 0.5) * br.r, 1.2, br.z + (Math.random() - 0.5) * br.r, 0, 1, 0);
        if (Math.random() < dt * 4) flash(br.x, br.z, 0xff7a2f, 18);
      } else if (br.state === 'ash') { m.color.setHex(0x2b2724); m.emissive.setHex(0x000000); m.emissiveIntensity = 0; v.group.scale.y = 0.3; }
      else { m.color.setHex(theme === 'forest' ? 0x8f8a4a : 0x9c8a4c); m.emissive.setHex(0x000000); m.emissiveIntensity = 0; v.group.scale.y = 1; }
    }
    for (const b of s.props.barrels) {
      const v = arena.barrels.get(b.id);
      v.group.visible = b.alive;
      v.rune.emissiveIntensity = b.fuse > 0 ? 6 : 1.4 + Math.sin(t * 3 + b.x) * 0.4;
      v.group.scale.setScalar(b.fuse > 0 ? 1.12 : 1);
    }
  }

  function updatePlayerViews(s, dt) {
    const me = s.player;
    if (me && (!pv || pv.w.id !== me.wizard)) setWizard(me.wizard);
    if (me) updatePlayerView(s, me, pv, dt);
    const seen = new Set();
    for (const p of s.players ?? []) {
      if (p === me) continue;
      seen.add(p.id);
      let v = others.get(p.id);
      if (!v || v.w.id !== p.wizard) { if (v) dropView(v); v = buildView(p.wizard); others.set(p.id, v); }
      updatePlayerView(s, p, v, dt);
    }
    for (const [id, v] of others) if (!seen.has(id)) { dropView(v); others.delete(id); }
  }

  function updatePlayerView(s, p, v, dt) {
    if (!v) return;
    v.group.position.set(p.x, 0, p.z);
    v.yaw = lerpAngle(v.yaw, s.mode === 'menu' ? 0 : Math.atan2(p.fx, p.fz), 1 - Math.exp(-18 * dt));
    v.group.rotation.y = v.yaw;
    const frozen = p.st.frozen > 0;
    v.ice.visible = frozen;
    v.ward.visible = p.st.ward > 0;
    v.ward.material.opacity = 0.1 + 0.08 * Math.sin(t * 6);
    v.stones.visible = p.st.stoneskin > 0;
    v.stones.rotation.y += dt * 3;
    if (!p.alive) {
      const k = ease(p.deadT / 0.7);
      v.rig.root.rotation.x = -1.45 * k;
      v.rig.root.position.y = 0.12 * k;
    } else {
      const k = Math.min(1, p.speed / TUNING.speed);
      const a = k < 0.5 ? GAIT.idle : GAIT.walk, b = k < 0.5 ? GAIT.walk : GAIT.run, u = k < 0.5 ? k * 2 : (k - 0.5) * 2;
      const G = {}; for (const key in a) G[key] = a[key] + (b[key] - a[key]) * u;
      if (!frozen) v.phase += dt * G.speed;
      v.group.updateMatrixWorld(true);
      animateRig(v.rig, v.phase, G, k < 0.1);
      castPose(p, v, dt);
      if (p.dodge > 0) {
        const d = 1 - p.dodge / TUNING.dodgeTime;
        v.rig.root.rotation.x += Math.sin(d * Math.PI) * 0.6;
        v.group.scale.set(1, 1 - Math.sin(d * Math.PI) * 0.22, 1);
      } else v.group.scale.set(1, 1, 1);
      if (p.hurtT > 0) v.rig.root.rotation.x -= p.hurtT * 0.6;
    }
    statusFx(p.st, p.x, p.z, 1.9, dt);
    v.motes.forEach((m, i) => {
      const el = p.queue[i];
      m.visible = !!el && p.alive;
      if (!el) return;
      m.material.color.setHex(ELEMENTS[el].color).multiplyScalar(2.4);
      const a = t * 3 + (i / 3) * Math.PI * 2;
      m.position.set(p.x + Math.sin(a) * 0.75, 1.15 + Math.sin(t * 4 + i) * 0.08, p.z + Math.cos(a) * 0.75);
      if (Math.random() < dt * 20) puff(elStyle(el), m.position.x, m.position.y, m.position.z, 0, 0.2, 0, { size: 0.6, life: 0.35 });
    });
  }

  // Anticipation → release → follow-through, layered on top of the gait.
  function castPose(p, v, dt) {
    let src = null, scale = 1, k = 160;
    if (p.dashT > 0) { src = DASH_POSE; k = 900; }
    else if (p.wind) { src = POSE[p.wind.style].A; scale = ease((p.wind.max - p.wind.t) / Math.max(0.01, p.wind.max - (p.wind.hold || 0))) * (0.75 + 0.45 * p.wind.weight); k = 260; }
    else if (p.castT > 0) {
      const r = 1 - p.castT / p.castMax;
      if (r < 0.28) { src = POSE[p.castStyle].R; scale = 0.75 + 0.45 * p.castW; k = 1100; } else k = 110;
    }
    const P = {};
    for (const c of CH) P[c] = spring(v.pose[c], (src?.[c] ?? 0) * scale, c === 'slide' ? k * 0.6 : k, dt);
    if (p.wind && p.wind.t <= (p.wind.hold || 0)) { P.tilt += Math.sin(t * 75) * 0.035; P.lean += Math.sin(t * 61) * 0.012; P.arm += Math.sin(t * 83) * 0.02; } // held tension trembles
    const R = v.rig, cr = Math.max(0, P.crouch);
    R.root.rotation.x += P.lean; R.root.rotation.y += P.twist; R.root.rotation.z += P.roll;
    R.hips.forEach((h) => { h.rotation.x -= cr * 0.95; });
    R.knees.forEach((n) => { n.rotation.x += cr * 1.9; });
    R.ankles.forEach((a) => { a.rotation.x -= cr * 0.95; });
    const sh = R.shoulders[v.side];
    if (sh) { sh.rotation.x -= P.arm; sh.rotation.z += P.twist * 0.15; }
    if (Math.abs(P.crouch) > 0.005 || Math.abs(P.lean) > 0.005) { // re-plant the soles after the squat
      R.root.position.y = 0;
      R.root.updateMatrixWorld(true);
      let low = Infinity;
      for (const so of R.soles) { so.getWorldPosition(_v); if (_v.y < low) low = _v.y; }
      if (low !== Infinity) R.root.position.y = -low + Math.max(0, -P.crouch) * 0.14;
    }
    R.root.position.z = P.lunge;
    R.root.updateMatrixWorld(true);
    if (v.hand) { v.pivot.position.copy(R.root.worldToLocal(v.hand.getWorldPosition(_v))); }
    const whip = spring(v.whip, v.pose.tilt.v * 0.02, 90, dt, 0.35); // the staff tip lags and wobbles
    v.pivot.rotation.x = P.tilt + whip;
    v.pivot.rotation.z = -P.roll * 0.5 - whip * 0.4;
    R.panels[0] && (R.panels[0].rotation.x += P.trail - P.flare);
    R.panels[1] && (R.panels[1].rotation.x += P.trail + P.flare);
    const hat = spring(v.hat, -P.lean * 0.9 - P.crouch * 0.25 + P.flare * 0.2, 60, dt, 0.32);
    if (R.head) R.head.rotation.x += hat * 0.35;
    if (v.hatCone) { v.hatCone.rotation.x = v.hatX + hat * 1.1; }
    v.group.position.set(p.x + Math.sin(v.yaw) * P.slide, 0, p.z + Math.cos(v.yaw) * P.slide);
  }

  function syncDecoys(s, dt) {
    const seen = new Set();
    for (const D of s.decoys) {
      seen.add(D.id);
      let G = decoyViews.get(D.id);
      if (!G) { G = ghost({ x: D.x, z: D.z, yaw: D.face, color: D.sp.color, persist: true, scale: D.pulse ? 1.22 : 1, view: others.get(D.pid) }); if (!G) continue; G.age = 0; decoyViews.set(D.id, G); }
      G.age += dt;
      G.g.position.set(D.x, 0.04 + Math.sin(t * 3 + D.id) * 0.04 + (D.pulse ? 0.15 : 0), D.z);
      if (D.vx || D.vz) G.g.rotation.y = lerpAngle(G.g.rotation.y, Math.atan2(D.vx, D.vz), 1 - Math.exp(-6 * dt));
      const fadeIn = ease(G.age / 0.18), out = Math.min(1, D.life / 0.5), low = D.hp / D.maxHp < 0.35 ? 0.6 + 0.4 * Math.sin(t * 40) : 1;
      G.mat.uniforms.uA.value = (0.75 + 0.2 * Math.sin(t * 5 + D.id)) * fadeIn * out * low + (D.flash > 0 ? 1.4 : 0);
      G.mat.uniforms.uT.value = t;
      if (Math.random() < dt * 14) puff(elStyle(D.sp.els[(Math.random() * D.sp.els.length) | 0]), D.x + (Math.random() - 0.5) * 0.6, 0.2 + Math.random() * 1.6, D.z + (Math.random() - 0.5) * 0.6, 0, 0.6, 0, { size: 0.7, life: 0.5 });
    }
    for (const [id, G] of decoyViews) if (!seen.has(id)) { dropGhost(G); decoyViews.delete(id); }
    for (let i = ghosts.length - 1; i >= 0; i--) {
      const G = ghosts[i];
      G.life -= dt;
      if (G.life <= 0) { dropGhost(G); ghosts.splice(i, 1); continue; }
      const q = G.life / G.max;
      G.mat.uniforms.uA.value = G.a * q * q;
      G.mat.uniforms.uT.value = t;
      G.g.position.y += G.rise * dt;
    }
  }

  function updateReticle(s) {
    const p = s.player;
    const playing = (s.mode === 'play' || s.mode === 'paused') && p.alive;
    reticle.visible = playing;
    conePrev.visible = wallPrev.visible = retArea.visible = beamPrev.visible = false;
    if (!playing) return;
    const queued = p.queue.length > 0;
    const sp = resolveSpell(queued ? p.queue : p.last, p.role);
    const col = sp ? sp.color : 0xffffff;
    retRing.material.color.setHex(col);
    const W = p.wind; // wind-up timing fills clockwise; it flickers white during the hold
    retWind.visible = !!W;
    if (W) {
      const k = Math.min(1, (W.max - W.t) / Math.max(0.01, W.max - (W.hold || 0))), held = k >= 1;
      retWind.geometry.setDrawRange(0, Math.ceil(ARC_N * k) * 6);
      retWind.material.color.setHex(held ? 0xffffff : W.sp.color);
      const pul = held ? 1 + 0.1 * Math.sin(t * 60) : 1;
      retWind.scale.set(-pul, 1, pul);
    }
    let cdf = 0;
    if (sp) {
      const sh = sp.def.shape;
      cdf = Math.max(p.cd.cast / (p.cdMax.cast || 1), (p.spellCd[sp.sid] || 0) / (p.spellMax[sp.sid] || 1), (p.shapeCd[sh] || 0) / (p.shapeMax[sh] || 1));
    }
    retCd.visible = cdf > 0.02 && !W;
    if (retCd.visible) { retCd.geometry.setDrawRange(0, Math.ceil(ARC_N * cdf) * 6); retCd.material.color.setHex(col); }
    const dx = aim.x - p.x, dz = aim.z - p.z, L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L;
    let rx = aim.x, rz = aim.z;
    const sh = sp?.def.shape, ring = sh === 'wall' && sp.def.ring;
    if (sh === 'area' || ring) {
      const self = sp.def.self || sp.def.around === 'self', Lc = Math.min(L, sp.def.range ?? TUNING.aimRange);
      rx = self ? p.x : p.x + ux * Lc; rz = self ? p.z : p.z + uz * Lc;
      retArea.visible = true;
      retArea.scale.setScalar(ring ? sp.def.ring : sp.def.radius ?? 3);
      retArea.material.color.setHex(col);
      retArea.material.opacity = queued ? 0.6 : 0.25;
    }
    if (sh === 'blink' || sh === 'dash' || sh === 'swap') {
      const Lm = sh === 'swap' ? Math.min(L, sp.def.range ?? 10) : Math.min(sp.def.dist ?? 6, sh === 'dash' ? 99 : Math.max(2, L));
      beamPrev.visible = true;
      beamPrev.position.set(p.x + ux * Lm / 2, 0.04, p.z + uz * Lm / 2);
      beamPrev.rotation.y = Math.atan2(ux, uz);
      beamPrev.scale.set(sh === 'dash' ? sp.def.width ?? 0.9 : 0.16, 1, Lm);
      beamPrev.material.color.setHex(col);
      beamPrev.material.opacity = queued ? 0.3 : 0.1;
      if (sh !== 'swap') { rx = p.x + ux * Lm; rz = p.z + uz * Lm; }
    }
    reticle.position.set(rx, 0, rz);
    retArea.position.set(0, 0.04, 0);
    const yaw = Math.atan2(ux, uz);
    if (sp?.def.shape === 'cone') {
      const key = sp.def.range + ':' + sp.def.arc;
      if (key !== conePrevKey) { conePrev.geometry.dispose(); conePrev.geometry = wedgeGeo(sp.def.range ?? 5, sp.def.arc ?? 50); conePrevKey = key; }
      conePrev.visible = true;
      conePrev.position.set(p.x, 0.035, p.z);
      conePrev.rotation.y = yaw;
      conePrev.material.color.setHex(col);
      conePrev.material.opacity = queued ? 0.16 : 0.06;
    }
    if (sp?.def.shape === 'beam') {
      const L = sp.def.range ?? 10, w = sp.def.count > 1 ? (sp.def.count - 1) * 0.6 + (sp.def.width ?? 0.6) : sp.def.width ?? 0.6;
      beamPrev.visible = true;
      beamPrev.position.set(p.x + ux * (0.5 + L / 2), 0.04, p.z + uz * (0.5 + L / 2));
      beamPrev.rotation.y = yaw;
      beamPrev.scale.set(w, 1, L);
      beamPrev.material.color.setHex(col);
      beamPrev.material.opacity = queued ? 0.22 : 0.08;
    }
    if (sp?.def.shape === 'wall' && !ring) {
      wallPrev.visible = true;
      wallPrev.position.set(p.x + ux * TUNING.wallDist, 0.04, p.z + uz * TUNING.wallDist);
      wallPrev.rotation.y = yaw;
      wallPrev.scale.set((sp.def.segments ?? 5) * 0.95, 1, 1);
      wallPrev.material.color.setHex(col);
      wallPrev.material.opacity = queued ? 0.3 : 0.12;
    }
  }

  // ---------------------------------------------------------------- frame
  function render(s, dt) {
    if (lost) return;
    t += dt;
    updatePlayerViews(s, dt);
    syncEnemies(s, dt);
    syncShots(s, dt);
    syncAreas(s, dt);
    syncWalls(s, dt);
    syncDecoys(s, dt);
    syncProps(s, dt);
    updateReticle(s);
    for (let i = transients.length - 1; i >= 0; i--) {
      const tr = transients[i];
      tr.t += dt;
      const k = Math.min(1, tr.t / tr.max);
      tr.update(k);
      if (k >= 1) { scene.remove(tr.obj); transients.splice(i, 1); }
    }
    for (let i = corpses.length - 1; i >= 0; i--) {
      const c = corpses[i], g = c.R.group;
      c.t += dt;
      c.R.body.rotation.x = -1.4 * ease(c.t / 0.4);
      if (c.t > 0.7) g.position.y -= dt * 1.2;
      if (c.t > 1.8) { disposeView(c.v); corpses.splice(i, 1); }
    }
    for (const b of arena.braziers) {
      const flick = 0.82 + Math.sin(t * 13 + b.local.x) * 0.08 + Math.random() * 0.12;
      b.light.intensity = (theme === 'forest' ? 9 : 16) * flick;
      if (Math.random() < dt * 24) {
        _v.copy(b.local); b.group.localToWorld(_v);
        puff('fire', _v.x + (Math.random() - 0.5) * 0.25, _v.y, _v.z + (Math.random() - 0.5) * 0.25, 0, 1.2, 0, { size: 1.1 });
      }
    }
    for (const l of flashes) l.intensity *= Math.exp(-14 * dt);
    safe.run('particles', () => { fx.glow.update(dt); fx.dust.update(dt); });

    const p = s.player;
    camMode = s.mode === 'menu' ? 'menu' : 'play';
    menuBlend += ((camMode === 'menu' ? 1 : 0) - menuBlend) * (1 - Math.exp(-3 * dt));
    // R-083: alone this is you leaned toward the aim; in a party, the middle of everyone, pulled back as it spreads
    const fr = frameParty(s.players, p, aim, 0.15 * (1 - menuBlend));
    const want = new THREE.Vector3(fr.x, 0, fr.z);
    camTarget.lerp(want, 1 - Math.exp(-6 * dt));
    camZoom += (fr.zoom - camZoom) * (1 - Math.exp(-2.5 * dt));
    const playOff = new THREE.Vector3(0, 13.5, 12.5).multiplyScalar(camZoom);
    const ang = t * 0.12 + 0.5, menuOff = new THREE.Vector3(Math.sin(ang) * 6.5, 3.2, Math.cos(ang) * 6.5);
    const off = playOff.lerp(menuOff, menuBlend);
    // in the menu, slide the framing so the wizard sits left of the panel
    const side = new THREE.Vector3(Math.cos(ang), 0, -Math.sin(ang)).multiplyScalar(2.3 * menuBlend);
    shake *= Math.exp(-9 * dt);
    { const kk = 170, c = 2 * Math.sqrt(kk) * 0.42; camK.v.addScaledVector(camK.p, -kk * dt).multiplyScalar(Math.max(0, 1 - c * dt)); camK.p.addScaledVector(camK.v, dt); }
    camera.position.copy(camTarget).add(off).add(side).add(new THREE.Vector3((Math.random() - 0.5) * shake * 0.5, (Math.random() - 0.5) * shake * 0.3, (Math.random() - 0.5) * shake * 0.5)).add(wow.kick).add(camK.p);
    camera.lookAt(camTarget.x + side.x, 0.8 + menuBlend * 0.4, camTarget.z + side.z);
    camera.fov = 40 + wow.fov;
    camera.updateProjectionMatrix();

    for (const pl of arena.pillars) {
      const dz = pl.p.z - p.z, dx = Math.abs(pl.p.x - p.x);
      const hide = (menuBlend < 0.5 && dz > 0 && dz < 4.2 && dx < pl.p.r + 0.9) || Math.hypot(pl.p.x - camera.position.x, pl.p.z - camera.position.z) < 3.6;
      const op = pl.mat.opacity + ((hide ? 0.28 : 1) - pl.mat.opacity) * Math.min(1, dt * 10);
      for (const mm of pl.mats ?? [pl.mat]) { mm.opacity = op; mm.depthWrite = op > 0.95; }
    }

    safe.run('wow', () => wow.update(dt, s, pv ? tipPos() : null));
    safe.run('afx', () => afx.update(s));
    safe.run('fx2', () => fx2.update(dt));
    composer.render();
    drawOverlay(s, dt);
  }

  const _p = new THREE.Vector3();
  function project(x, y, z) {
    _p.set(x, y, z).project(camera);
    return _p.z > 1 ? null : [((_p.x + 1) / 2) * overlay.width, ((1 - _p.y) / 2) * overlay.height];
  }

  function drawOverlay(s, dt) {
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    if (s.mode === 'menu') return;
    const d = dpr;
    for (const e of s.enemies) {
      if (e.state === 'spawn') continue;
      const v = enemyViews.get(e.id);
      if (!v) continue;
      const sc = project(e.x, v.R.height + 0.35 + (v.R.float ? 0.3 : 0), e.z);
      if (!sc) continue;
      const w = (e.kind === 'bulwark' ? 58 : 42) * d, h = 5 * d, x = sc[0] - w / 2, y = sc[1];
      const k = Math.max(0, e.hp / e.maxHp);
      ctx.fillStyle = 'rgba(22,18,37,.82)';
      ctx.fillRect(x - d, y - d, w + 2 * d, h + 2 * d);
      ctx.fillStyle = e.st.frozen > 0 ? '#a8ecff' : '#ef4444';
      ctx.fillRect(x, y, w * k, h);
      const pips = [];
      if (e.st.burn > 0) pips.push('#ff6a2b');
      if (e.st.wet > 0) pips.push('#3d9bff');
      for (let i = 0; i < Math.min(3, Math.floor(e.st.chill)); i++) pips.push('#a8ecff');
      if (e.st.frozen > 0) pips.push('#ffffff');
      if (e.st.shock > 0) pips.push('#f4e15c');
      if (e.st.slow > 0) pips.push('#b3793f');
      if (e.st.root > 0) pips.push('#5cc84a');
      if (e.st.blind > 0) pips.push('#fff1a8');
      if (e.st.curse > 0) pips.push('#a050e0');
      if (e.st.stun > 0 || e.st.silence > 0) pips.push(e.st.stun > 0 ? '#ffffff' : '#d04bff');
      if (e.st.confuse > 0) pips.push('#ff7ad0');
      pips.forEach((c, i) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x + 3 * d + i * 8 * d, y + h + 6 * d, 2.6 * d, 0, 7); ctx.fill(); });
    }
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    // co-op (R-082): every wizard's name, and how far a downed one's revive has got
    if (s.coop) for (const p of s.players) {
      const sc = project(p.x, p.alive ? 2.45 : 0.9, p.z);
      if (!sc) continue;
      const w = WIZARDS.find((x) => x.id === p.wizard) ?? WIZARDS[0], col = hexCss(w.glow);
      ctx.font = `700 ${12 * d}px 'Space Grotesk', sans-serif`;
      ctx.lineWidth = 4 * d;
      ctx.strokeStyle = 'rgba(14,10,24,.85)';
      const label = p === s.player ? 'You' : p.name ?? p.id;
      ctx.strokeText(label, sc[0], sc[1]);
      ctx.fillStyle = col;
      ctx.fillText(label, sc[0], sc[1]);
      if (p.down) {
        const k = Math.min(1, (p.reviveT ?? 0) / TUNING.reviveT), r = 16 * d, cy = sc[1] - 26 * d;
        ctx.lineWidth = 4 * d;
        ctx.strokeStyle = 'rgba(14,10,24,.7)';
        ctx.beginPath(); ctx.arc(sc[0], cy, r, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = '#7ee08a';
        ctx.beginPath(); ctx.arc(sc[0], cy, r, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#f4f1ff';
        ctx.font = `700 ${10 * d}px 'Space Grotesk', sans-serif`;
        ctx.fillText(k > 0 ? 'REVIVING' : 'DOWN', sc[0], cy + 4 * d);
      }
    }
    for (let i = texts.length - 1; i >= 0; i--) {
      const tx = texts[i];
      tx.t += dt;
      if (tx.t > tx.life) { texts.splice(i, 1); continue; }
      const k = tx.t / tx.life;
      const sc = project(tx.x, tx.y + k * 0.9, tx.z);
      if (!sc) continue;
      const size = tx.size * d * (k < 0.12 ? 1 + (0.12 - k) * 3 : 1);
      ctx.font = `700 ${size}px 'Space Grotesk', sans-serif`;
      ctx.globalAlpha = Math.min(1, (1 - k) * 2.5);
      ctx.lineWidth = 4 * d;
      ctx.strokeStyle = 'rgba(14,10,24,.85)';
      ctx.strokeText(tx.text, sc[0], sc[1]);
      ctx.fillStyle = tx.color;
      ctx.fillText(tx.text, sc[0], sc[1]);
    }
    for (let i = callouts.length - 1; i >= 0; i--) {
      const c = callouts[i], life = c.kicker ? 2.1 : 1.3;
      c.t += dt;
      if (c.t > life) { callouts.splice(i, 1); continue; }
      const sc = project(c.x, 3.1 + c.t * 0.3, c.z);
      if (!sc) continue;
      const pop = c.t < 0.14 ? 1.4 - (c.t / 0.14) * 0.4 : 1;
      ctx.globalAlpha = Math.max(0, Math.min(1, (life - c.t) / 0.35, c.t / 0.05));
      ctx.lineWidth = 6 * d;
      ctx.strokeStyle = 'rgba(14,10,24,.9)';
      if (c.kicker) {
        ctx.font = `700 ${13 * d}px 'Space Grotesk', sans-serif`;
        ctx.letterSpacing = `${3 * d}px`;
        ctx.strokeText(c.kicker, sc[0], sc[1] - 34 * d * pop);
        ctx.fillStyle = '#f0c84a';
        ctx.fillText(c.kicker, sc[0], sc[1] - 34 * d * pop);
      }
      ctx.font = `700 ${(c.kicker ? 36 : 27) * d * pop}px 'Space Grotesk', sans-serif`;
      ctx.letterSpacing = `${1.5 * d}px`;
      ctx.strokeText(c.name.toUpperCase(), sc[0], sc[1]);
      ctx.fillStyle = c.color;
      ctx.fillText(c.name.toUpperCase(), sc[0], sc[1]);
    }
    ctx.letterSpacing = '0px';
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- quality (R-110)
  // Point lights are what a lit pixel pays for, so a tier keeps only some of them lit. Lights are never toggled while
  // playing (a changed light count recompiles every lit material); only here, on a tier change or an arena rebuild.
  function applyLights() {
    const all = [];
    scene.traverse((o) => { if (o.isPointLight) all.push(o); });
    const first = new Set([flashes[0], ...(arena?.braziers ?? []).map((b) => b.light)]);
    all.sort((a, b) => (first.has(b) ? 1 : 0) - (first.has(a) ? 1 : 0));
    all.forEach((l, i) => { l.visible = i < prof.lights; });
  }

  function applyQuality(tier) {
    if (!PROFILES[tier]) return tierName;
    tierName = tier; prof = PROFILES[tier];
    resize();
    moon.castShadow = prof.shadow > 0;
    if (prof.shadow && moon.shadow.mapSize.x !== prof.shadow) {
      moon.shadow.mapSize.set(prof.shadow, prof.shadow);
      moon.shadow.map?.dispose();
      moon.shadow.map = null;
    }
    bloom.enabled = prof.bloom;
    for (const [P, n] of [[fx.glow, prof.glow], [fx.dust, prof.dust]]) { P.setLimit(n); P.density = prof.density; }
    fx2.S.density = prof.fx;
    fx2.budget(prof.sprites);
    applyLights();
    return tierName;
  }
  applyQuality(tierName);

  function dispose() {
    window.removeEventListener('resize', resize);
    window.removeEventListener('orientationchange', resize);
    window.visualViewport?.removeEventListener('resize', resize);
    canvas.removeEventListener('webglcontextlost', onLost, false);
    canvas.removeEventListener('webglcontextrestored', onRestored, false);
    try { composer.dispose?.(); renderer.dispose(); } catch { /* the page is going away */ }
  }

  return {
    reset, setWizard, screenToGround, consume, render, renderer, scene, caps, dispose,
    setAim(x, z) { aim.x = x; aim.z = z; },
    setQuality: applyQuality,
    get tier() { return tierName; },
    get lost() { return lost; },
    // a layer that was switched off after repeated errors comes back after a restart
    clearFaults() { safe.reset(); }
  };
}
