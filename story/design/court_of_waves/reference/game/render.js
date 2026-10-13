// Rendering: reads sim state + events, never mutates gameplay.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildWizard, animateRig, GAIT, WIZARDS } from '../wizard-rig.js';
import { buildArena, buildEnemy, buildWall } from './models.js';
import { ELEMENTS, resolveSpell } from './spells.js';
import { ARENA_R, GATES, TUNING } from './sim.js';
import { ENEMY_TYPES } from './enemies.js';
import { createWow } from './wow.js';

const cols = (...h) => h.map((x) => new THREE.Color(x));
const STYLE = {
  fire:      { sys: 'glow', life: [0.35, 0.7], size: [0.42, 0.08], grav: -4, drag: 2.5, cols: cols(0xffd27a, 0xff7a2f, 0xff4a1a) },
  water:     { sys: 'glow', life: [0.4, 0.7], size: [0.16, 0.08], grav: 14, drag: 0.6, cols: cols(0x5cb8ff, 0x2f7fff, 0xbfe6ff) },
  ice:       { sys: 'glow', life: [0.5, 0.9], size: [0.17, 0.04], grav: 2, drag: 2, cols: cols(0xe8fbff, 0xa8ecff, 0x7dd3fc) },
  lightning: { sys: 'glow', life: [0.12, 0.3], size: [0.15, 0.02], grav: 0, drag: 4, cols: cols(0xffffff, 0xfff2a0, 0xf4e15c) },
  earth:     { sys: 'dust', life: [0.5, 0.9], size: [0.2, 0.12], grav: 16, drag: 0.4, cols: cols(0x7a5634, 0x9c7346, 0x5a4030) },
  arcane:    { sys: 'glow', life: [0.4, 0.8], size: [0.3, 0.04], grav: -1, drag: 3, cols: cols(0xf0a8ff, 0xd04bff, 0x9c4bff) },
  hex:       { sys: 'glow', life: [0.4, 0.8], size: [0.26, 0.04], grav: -1, drag: 3, cols: cols(0xb8ffe0, 0x5cffb0, 0x2fd59a) },
  steam:     { sys: 'dust', life: [0.8, 1.4], size: [0.4, 1.5], grav: -2.5, drag: 2, cols: cols(0xe8eef4, 0xcfd8e2), alpha: 0.35 },
  smoke:     { sys: 'dust', life: [0.8, 1.5], size: [0.4, 1.3], grav: -1.8, drag: 1.5, cols: cols(0x3a3440, 0x2a2630), alpha: 0.5 },
  spark:     { sys: 'glow', life: [0.15, 0.35], size: [0.12, 0.02], grav: 9, drag: 1, cols: cols(0xffffff, 0xffe2a0) },
  blood:     { sys: 'dust', life: [0.4, 0.7], size: [0.14, 0.08], grav: 14, drag: 0.5, cols: cols(0x4a1f1f, 0x2e1414) },
  rune:      { sys: 'glow', life: [0.5, 1.0], size: [0.22, 0.04], grav: -2, drag: 2, cols: cols(0xff5050, 0xff2a2a, 0xff8a6a) }
};
const TAGS = {
  steam: ['STEAM', '#e8eef4'], freeze: ['FROZEN', '#a8ecff'], shatter: ['SHATTER', '#ffffff'], conduct: ['CONDUCTED ×2', '#f4e15c'],
  thaw: ['THAW', '#ffb070'], blocked: ['BLOCKED', '#e0c060'], interrupt: ['INTERRUPTED', '#ffffff'], evade: ['EVADE', '#c4b5fd']
};
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

class Particles {
  constructor(scene, max, additive) {
    this.max = max; this.next = 0;
    this.p = new Float32Array(max * 3); this.c = new Float32Array(max * 3); this.sz = new Float32Array(max); this.al = new Float32Array(max);
    this.v = new Float32Array(max * 3); this.life = new Float32Array(max); this.L = new Float32Array(max); this.g = new Float32Array(max);
    this.d = new Float32Array(max); this.s0 = new Float32Array(max); this.s1 = new Float32Array(max); this.a0 = new Float32Array(max);
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
  emit(x, y, z, vx, vy, vz, life, s0, s1, col, a0 = 1, g = 0, d = 0) {
    const i = this.next, j = i * 3;
    this.next = (i + 1) % this.max;
    this.p[j] = x; this.p[j + 1] = y; this.p[j + 2] = z;
    this.v[j] = vx; this.v[j + 1] = vy; this.v[j + 2] = vz;
    this.c[j] = col.r; this.c[j + 1] = col.g; this.c[j + 2] = col.b;
    this.life[i] = life; this.L[i] = life; this.s0[i] = s0; this.s1[i] = s1; this.a0[i] = a0; this.g[i] = g; this.d[i] = d;
    this.sz[i] = s0; this.al[i] = a0;
  }
  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      const l = (this.life[i] -= dt);
      if (l <= 0) { this.al[i] = 0; continue; }
      const j = i * 3, k = 1 - l / this.L[i], dr = Math.max(0, 1 - this.d[i] * dt);
      this.v[j] *= dr; this.v[j + 1] = this.v[j + 1] * dr - this.g[i] * dt; this.v[j + 2] *= dr;
      this.p[j] += this.v[j] * dt; this.p[j + 1] += this.v[j + 1] * dt; this.p[j + 2] += this.v[j + 2] * dt;
      if (this.p[j + 1] < 0.03) { this.p[j + 1] = 0.03; this.v[j + 1] *= -0.25; this.v[j] *= 0.7; this.v[j + 2] *= 0.7; }
      this.sz[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * k;
      this.al[i] = this.a0[i] * Math.min(1, (1 - k) * 2.2) * Math.min(1, k * 12 + 0.2);
    }
    this.aP.needsUpdate = this.aC.needsUpdate = this.aS.needsUpdate = this.aA.needsUpdate = true;
  }
}

const glowMat = (hex, k = 2, o = {}) => new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), toneMapped: false, ...o });
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

export function createView(canvas, overlay) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1530);
  scene.fog = new THREE.Fog(0x1a1530, 30, 64);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 160);
  scene.add(new THREE.HemisphereLight(0xa49ce0, 0x2b2230, 1.35));
  const moon = new THREE.DirectionalLight(0xccd2ff, 2.2);
  moon.position.set(-9, 22, 8);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  Object.assign(moon.shadow.camera, { left: -19, right: 19, top: 19, bottom: -19, near: 1, far: 60 });
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

  let arena = null, pv = null, shake = 0, t = 0, camMode = 'menu', menuBlend = 1;
  const camTarget = new THREE.Vector3(0, 0, 3.5);
  const enemyViews = new Map(), shotViews = new Map(), areaViews = new Map(), wallViews = new Map();
  const corpses = [], transients = [], texts = [];
  const aim = { x: 0, z: -1 };
  const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hitV = new THREE.Vector3();
  const _v = new THREE.Vector3();
  const callouts = [];
  const callout = (x, z, name, color, kicker) => { callouts.push({ x, z, name, color, kicker, t: 0 }); if (callouts.length > 3) callouts.shift(); };
  const wow = createWow({ scene, camera, composer, glow: fx.glow, puff: (...a) => puff(...a), burst: (...a) => burst(...a),
    lightning: (...a) => lightning(...a), ringFx: (...a) => ringFx(...a), flash, callout, shake: (k) => { shake = Math.min(1.4, shake + k); } });

  // reticle + previews
  const reticle = new THREE.Group();
  const retRing = new THREE.Mesh(RING, flatMat(0xffffff, 0.85)); retRing.scale.setScalar(0.34); retRing.position.y = 0.04;
  const retArea = new THREE.Mesh(RING, flatMat(0xffffff, 0.5)); retArea.position.y = 0.04;
  reticle.add(retRing, retArea);
  scene.add(reticle);
  const conePrev = new THREE.Mesh(wedgeGeo(5, 50), flatMat(0xffffff, 0.08)); conePrev.position.y = 0.035; scene.add(conePrev);
  let conePrevKey = '';
  const wallPrev = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.5).rotateX(-Math.PI / 2), flatMat(0xffffff, 0.18)); wallPrev.position.y = 0.04; scene.add(wallPrev);

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    dpr = renderer.getPixelRatio();
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const s = (h * dpr) / (2 * Math.tan((camera.fov * Math.PI) / 360));
    fx.glow.mat.uniforms.uScale.value = s;
    fx.dust.mat.uniforms.uScale.value = s;
    overlay.width = w * dpr; overlay.height = h * dpr;
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------------------------------------------------------------- particles
  function puff(style, x, y, z, vx, vy, vz, o = {}) {
    const S = STYLE[style] || STYLE.arcane;
    const col = S.cols[(Math.random() * S.cols.length) | 0];
    const life = o.life ?? S.life[0] + Math.random() * (S.life[1] - S.life[0]);
    const k = o.size ?? 1;
    fx[S.sys].emit(x, y, z, vx, vy, vz, life, S.size[0] * k, S.size[1] * k, col, S.alpha ?? 1, o.grav ?? S.grav, o.drag ?? S.drag);
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
    const w = WIZARDS.find((x) => x.id === id) || WIZARDS[0];
    const built = buildWizard({ ...w });
    const group = built.group;
    scene.add(group);
    let tip = null;
    for (const n of ['staff_gem', 'shard_0', 'skull', 'rod_tip', 'orb', 'club_rune', 'hat_tip']) { tip = group.getObjectByName(n); if (tip) break; }
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
    const motes = [0, 1, 2].map(() => { const m = new THREE.Mesh(SPHERE, glowMat(0xffffff)); m.scale.setScalar(0.09); scene.add(m); return m; });
    pv = { group, rig: built.rig, tip, ice, ward, stones, motes, phase: 0, yaw: Math.PI, w };
  }

  function clearViews() {
    for (const m of [enemyViews, shotViews, areaViews, wallViews]) {
      for (const v of m.values()) disposeView(v);
      m.clear();
    }
    for (const c of corpses.splice(0)) disposeView(c.v);
    for (const tr of transients.splice(0)) scene.remove(tr.obj);
    texts.length = 0;
  }
  function disposeView(v) { for (const o of v.objs || [v.obj]) if (o) scene.remove(o); }

  function reset(game) {
    if (!arena) { arena = buildArena(ARENA_R, game.props, GATES); scene.add(arena.group); }
    clearViews();
    if (!pv || pv.w.id !== game.player.wizard) setWizard(game.player.wizard);
    camTarget.set(game.player.x, 0, game.player.z);
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
  function tipPos() {
    if (pv?.tip) return pv.tip.getWorldPosition(_v).clone();
    return pv ? pv.group.position.clone().add(new THREE.Vector3(0, 1.6, 0)) : new THREE.Vector3();
  }

  function consume(events, game) {
    for (const e of events) {
      wow.onEvent(e, game);
      switch (e.type) {
        case 'cast': {
          const tp = tipPos();
          for (const el of e.els) burst(elStyle(el), tp.x, tp.y, tp.z, 10, 2.2);
          flash(tp.x, tp.z, e.color, 14);
          break;
        }
        case 'cone': {
          const half = (e.arc * Math.PI) / 360, base = Math.atan2(e.dx, e.dz), steam = e.els.includes('fire') && e.els.includes('water');
          const styles = steam ? ['steam', 'steam', 'fire'] : e.els.map(elStyle);
          for (const st of styles) for (let i = 0; i < 14; i++) {
            const a = base + (Math.random() * 2 - 1) * half, sp = e.range * (2.4 + Math.random() * 1.6);
            puff(st, e.x + Math.sin(a) * 0.6, 1.0 + Math.random() * 0.3, e.z + Math.cos(a) * 0.6, Math.sin(a) * sp, (Math.random() - 0.3) * 1.5, Math.cos(a) * sp,
              { life: (e.range / sp) * (1.0 + Math.random() * 0.5), drag: 0.6, grav: st === 'water' ? 3 : STYLE[st].grav * 0.3, size: st === 'steam' ? 0.9 : 1.3 });
          }
          break;
        }
        case 'chain': lightning(e.pts, e.color); flash(e.pts[e.pts.length - 1][0], e.pts[e.pts.length - 1][1], 0xf4e15c, 30); break;
        case 'explode': {
          const m = addMat(e.color, 1.2, 0.55), m2 = flatMat(e.color, 0.8);
          const sph = new THREE.Mesh(SPHERE, m), ring = new THREE.Mesh(RING, m2);
          sph.position.set(e.x, 0.7, e.z); ring.position.set(e.x, 0.06, e.z);
          const g = new THREE.Group(); g.add(ring);
          transient(g, 0.5, (k) => { sph.scale.setScalar(e.r * (0.25 + 0.6 * ease(k * 1.6))); m.opacity = 0.55 * (1 - k) ** 3; ring.scale.setScalar(e.r * (0.3 + 0.9 * ease(k))); m2.opacity = 0.8 * (1 - k); });
          for (const el of e.els) burst(elStyle(el), e.x, 0.8, e.z, 12, e.r * 4.5, { up: 0.8, size: 1.2 });
          
          flash(e.x, e.z, e.color, e.big ? 60 : 35);
          shake = Math.min(1.2, shake + (e.big ? 0.55 : 0.28));
          break;
        }
        case 'impact':
          if (e.enemy) { burst('hex', e.x, 1.1, e.z, 14, 3); break; }
          for (const el of e.els) burst(elStyle(el), e.x, 1.0, e.z, 6, 3.2);
          if (e.kind === 'boulder') { burst('earth', e.x, 0.6, e.z, 16, 4); shake = Math.min(1, shake + 0.12); }
          flash(e.x, e.z, e.color, 18);
          break;
        case 'hit':
          addText(e.x, 1.9, e.z, Math.max(1, Math.round(e.dmg)), elCss(e.el), e.dot ? 14 : e.dmg > 25 ? 26 : 20, e.dot ? 0.7 : 0.9);
          if (!e.dot) burst('spark', e.x, 1.0, e.z, 5, 3);
          break;
        case 'hurt':
          addText(e.x, 2.3, e.z, '-' + Math.max(1, Math.round(e.dmg)), e.self ? '#ffad5c' : '#ff5a5a', e.dot ? 15 : 22);
          if (!e.dot) { shake = Math.min(1, shake + 0.2); burst('blood', e.x, 1.1, e.z, 8, 3); }
          break;
        case 'tag': {
          const T = TAGS[e.tag];
          if (T) addText(e.x, 2.7, e.z, T[0], T[1], 14, 1.0);
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
        case 'claw': burst('spark', e.x, 1.1, e.z, 10, 4); burst('blood', e.x, 1.1, e.z, 6, 3); break;
        case 'dodge': burst('smoke', e.x, 0.2, e.z, 10, 2); for (let i = 0; i < 12; i++) puff('arcane', e.x, 0.6 + Math.random(), e.z, -e.dx * 4, 0.5, -e.dz * 4); break;
        case 'selfcast': {
          ringFx(e.x, e.z, 1.4, e.color, 0.5);
          for (const el of e.els) for (let i = 0; i < 24; i++) { const a = Math.random() * 6.28; puff(elStyle(el), e.x + Math.sin(a) * 0.7, 0.2, e.z + Math.cos(a) * 0.7, 0, 2 + Math.random() * 2, 0, { grav: -1 }); }
          break;
        }
        case 'nova': {
          ringFx(e.x, e.z, e.r, e.color, 0.45);
          for (const el of e.els) for (let i = 0; i < 48; i++) { const a = Math.random() * 6.28, sp = e.r * (2.6 + Math.random()); puff(elStyle(el), e.x, 0.6, e.z, Math.sin(a) * sp, 0.6, Math.cos(a) * sp, { life: e.r / sp, drag: 0.4, grav: 0, size: 1.3 }); }
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
    R.body.rotation.x = lean - f * 0.3;
    R.body.scale.set(1 + f * 0.08, squash - f * 0.06, 1 + f * 0.08);
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
    v.ice.visible = frozen;
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
        let obj;
        if (b.kind === 'boulder') {
          const m = b.els.includes('fire') ? ROCK_HOT : b.els.includes('arcane') ? ROCK_RUNE : b.els.includes('lightning') ? ROCK_ZAP : ROCK;
          obj = new THREE.Mesh(new THREE.DodecahedronGeometry(0.4, 0), m);
          obj.castShadow = true;
        } else if (b.kind === 'orb') {
          obj = new THREE.Mesh(SPHERE, glowMat(0x5cffb0, 2.2)); obj.scale.setScalar(0.28);
        } else {
          obj = new THREE.Mesh(SPHERE, glowMat(b.color, 2.4)); obj.scale.setScalar(b.r * 1.1);
        }
        scene.add(obj);
        v = { obj };
        shotViews.set(b.id, v);
      }
      const y = b.kind === 'boulder' ? 0.95 : 1.15;
      v.obj.position.set(b.x, y, b.z);
      if (b.kind === 'boulder') { v.obj.rotation.x += dt * 9; v.obj.rotation.z += dt * 4; }
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
      seen.add(a.id);
      let v = areaViews.get(a.id);
      if (!v) {
        const fill = new THREE.Mesh(DISC, flatMat(new THREE.Color(a.color).multiplyScalar(0.55), 0.16)), edge = new THREE.Mesh(RING, flatMat(a.color, 0.8));
        fill.position.set(a.x, 0.03, a.z); edge.position.set(a.x, 0.04, a.z);
        fill.scale.setScalar(a.r); edge.scale.setScalar(a.r);
        scene.add(fill, edge);
        v = { objs: [fill, edge], fill, edge, zapT: 0 };
        if (a.delay > 0) { v.star = new THREE.Mesh(SPHERE, glowMat(a.color, 3)); v.star.scale.setScalar(0.45); scene.add(v.star); v.objs.push(v.star); }
        areaViews.set(a.id, v);
      }
      const fade = a.delay > 0 ? 1 : Math.min(1, a.life / 0.4);
      if (a.delay > 0) {
        const k = 1 - a.delay / a.delayMax;
        v.fill.scale.setScalar(Math.max(0.01, a.r * ease(k)));
        v.fill.material.opacity = 0.18 + 0.2 * k;
        v.edge.material.opacity = 0.5 + 0.5 * Math.abs(Math.sin(t * 14));
        v.star.position.set(a.x + (1 - k) * 4, 0.6 + (1 - k) * 12, a.z - (1 - k) * 2);
        for (let i = rate(60, dt); i--;) puff(elStyle(a.els[(Math.random() * a.els.length) | 0]), v.star.position.x, v.star.position.y, v.star.position.z, (Math.random() - 0.5), 1, (Math.random() - 0.5), { size: 1.4 });
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
      const v = arena.puddles.get(pd.id), m = v.mat;
      if (pd.state === 'frozen') { m.color.setHex(0xcdeeff); m.emissive.setHex(0x6fb8e8); m.emissiveIntensity = 0.2; m.roughness = 0.35; }
      else if (pd.state === 'charged') {
        m.color.setHex(0x3d7fbf); m.emissive.setHex(0xf4e15c); m.emissiveIntensity = 0.25 + Math.random() * 0.35; m.roughness = 0.1;
        for (let i = rate(50, dt); i--;) { const a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * pd.r; puff('lightning', pd.x + Math.sin(a) * r, 0.08, pd.z + Math.cos(a) * r, (Math.random() - 0.5) * 2, 2 + Math.random() * 3, (Math.random() - 0.5) * 2); }
      } else { m.color.setHex(0x24527c); m.emissive.setHex(0x000000); m.emissiveIntensity = 0; m.roughness = 0.08; }
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
      else { m.color.setHex(0x9c8a4c); m.emissive.setHex(0x000000); m.emissiveIntensity = 0; v.group.scale.y = 1; }
    }
    for (const b of s.props.barrels) {
      const v = arena.barrels.get(b.id);
      v.group.visible = b.alive;
      v.rune.emissiveIntensity = b.fuse > 0 ? 6 : 1.4 + Math.sin(t * 3 + b.x) * 0.4;
      v.group.scale.setScalar(b.fuse > 0 ? 1.12 : 1);
    }
  }

  function updatePlayerView(s, dt) {
    const p = s.player, v = pv;
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
      const c = p.castT / 0.3;
      v.rig.root.rotation.x += Math.sin(c * Math.PI) * 0.22;
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

  function updateReticle(s) {
    const p = s.player;
    const playing = (s.mode === 'play' || s.mode === 'paused') && p.alive;
    reticle.visible = playing;
    conePrev.visible = wallPrev.visible = retArea.visible = false;
    if (!playing) return;
    const queued = p.queue.length > 0;
    const sp = resolveSpell(queued ? p.queue : p.last);
    const col = sp ? sp.color : 0xffffff;
    retRing.material.color.setHex(col);
    const dx = aim.x - p.x, dz = aim.z - p.z, L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L;
    let rx = aim.x, rz = aim.z;
    if (sp?.def.shape === 'area') {
      const Lc = Math.min(L, sp.def.range ?? TUNING.aimRange);
      rx = p.x + ux * Lc; rz = p.z + uz * Lc;
      retArea.visible = true;
      retArea.scale.setScalar(sp.def.radius ?? 3);
      retArea.material.color.setHex(col);
      retArea.material.opacity = queued ? 0.6 : 0.25;
      retArea.position.set(rx - reticle.position.x, 0.04, rz - reticle.position.z);
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
    if (sp?.def.shape === 'wall') {
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
    t += dt;
    updatePlayerView(s, dt);
    syncEnemies(s, dt);
    syncShots(s, dt);
    syncAreas(s, dt);
    syncWalls(s, dt);
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
      b.light.intensity = 16 * flick;
      if (Math.random() < dt * 24) {
        _v.copy(b.local); b.group.localToWorld(_v);
        puff('fire', _v.x + (Math.random() - 0.5) * 0.25, _v.y, _v.z + (Math.random() - 0.5) * 0.25, 0, 1.2, 0, { size: 1.1 });
      }
    }
    for (const l of flashes) l.intensity *= Math.exp(-14 * dt);
    fx.glow.update(dt);
    fx.dust.update(dt);

    const p = s.player;
    camMode = s.mode === 'menu' ? 'menu' : 'play';
    menuBlend += ((camMode === 'menu' ? 1 : 0) - menuBlend) * (1 - Math.exp(-3 * dt));
    const want = new THREE.Vector3(p.x + (aim.x - p.x) * 0.15 * (1 - menuBlend), 0, p.z + (aim.z - p.z) * 0.15 * (1 - menuBlend));
    camTarget.lerp(want, 1 - Math.exp(-6 * dt));
    const playOff = new THREE.Vector3(0, 13.5, 12.5);
    const ang = t * 0.12 + 0.5, menuOff = new THREE.Vector3(Math.sin(ang) * 6.5, 3.2, Math.cos(ang) * 6.5);
    const off = playOff.lerp(menuOff, menuBlend);
    // in the menu, slide the framing so the wizard sits left of the panel
    const side = new THREE.Vector3(Math.cos(ang), 0, -Math.sin(ang)).multiplyScalar(2.3 * menuBlend);
    shake *= Math.exp(-9 * dt);
    camera.position.copy(camTarget).add(off).add(side).add(new THREE.Vector3((Math.random() - 0.5) * shake * 0.5, (Math.random() - 0.5) * shake * 0.3, (Math.random() - 0.5) * shake * 0.5)).add(wow.kick);
    camera.lookAt(camTarget.x + side.x, 0.8 + menuBlend * 0.4, camTarget.z + side.z);
    camera.fov = 40 + wow.fov;
    camera.updateProjectionMatrix();

    for (const pl of arena.pillars) {
      const dz = pl.p.z - p.z, dx = Math.abs(pl.p.x - p.x);
      const hide = menuBlend < 0.5 && dz > 0 && dz < 4.2 && dx < pl.p.r + 0.9;
      pl.mat.opacity += ((hide ? 0.28 : 1) - pl.mat.opacity) * Math.min(1, dt * 10);
      pl.mat.depthWrite = pl.mat.opacity > 0.95;
    }

    wow.update(dt, s, pv ? tipPos() : null);
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
      pips.forEach((c, i) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x + 3 * d + i * 8 * d, y + h + 6 * d, 2.6 * d, 0, 7); ctx.fill(); });
    }
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
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

  return { reset, setWizard, screenToGround, consume, render, renderer };
}
