// Spell FX showcase: each role's wizard casts their signature spell or their projectile on a small stage,
// through windup → hold → release → recoil, with the painterly fx2d layer.
import * as THREE from 'three';
import { buildWizard, animateRig, GAIT, WIZARDS } from '../wizard-rig.js';
import { buildEnemy } from './models.js';
import { ROLES } from './roles.js';
import { createFx2d, recipes, PAL, K, M } from './fx2d.js';
import { conjureSpear } from './ice-spear.js';
import { createEarth } from './earth-fx.js';
import { createChains } from './chain-fx.js';

const $ = (id) => document.getElementById(id);
const rnd = (a, b) => a + Math.random() * (b - a);
const canvas = $('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
const PR = Math.min(devicePixelRatio, 1.75);
renderer.setPixelRatio(PR);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0c0a14);
scene.fog = new THREE.Fog(0x0c0a14, 13, 30);
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 80);
scene.add(new THREE.HemisphereLight(0x8b84c4, 0x1b1522, 0.9));
const moon = new THREE.DirectionalLight(0xa8b6ff, 1.3); moon.position.set(-6, 9, -4); scene.add(moon);
const rim = new THREE.DirectionalLight(0xff9a6a, 0.5); rim.position.set(6, 3, 10); scene.add(rim);

// ---- stage: a ring of worn flagstones
function floorTex() {
  const S = 1024, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'); g.fillStyle = '#17131d'; g.fillRect(0, 0, S, S);
  const C = S / 2;
  for (let ring = 0; ring < 9; ring++) {
    const r0 = ring * 56 + 18, r1 = r0 + 54, n = 6 + ring * 6;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2 + ring * 0.3, a1 = a0 + (Math.PI * 2) / n - 0.012 * (9 - ring) / 3;
      const v = 38 + Math.random() * 16;
      g.fillStyle = `rgb(${v + 4},${v},${v + 8})`;
      g.beginPath(); g.arc(C, C, r1 - 3, a0, a1); g.arc(C, C, r0 + 3, a1, a0, true); g.closePath(); g.fill();
    }
  }
  for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.18})`; g.fillRect(Math.random() * S, Math.random() * S, 2 + Math.random() * 6, 2 + Math.random() * 6); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
const floor = new THREE.Mesh(new THREE.CircleGeometry(10.5, 96), new THREE.MeshStandardMaterial({ map: floorTex(), roughness: 0.92, metalness: 0 }));
floor.rotation.x = -Math.PI / 2; floor.position.z = 3; scene.add(floor);
const outer = new THREE.Mesh(new THREE.CircleGeometry(40, 32), new THREE.MeshStandardMaterial({ color: 0x0f0c15, roughness: 1 }));
outer.rotation.x = -Math.PI / 2; outer.position.y = -0.01; scene.add(outer);
const stoneM = new THREE.MeshStandardMaterial({ color: 0x3a3442, roughness: 0.9, flatShading: true });
[[-6, 11], [5.5, 12], [9, 5], [-9, 4], [-3, 13.5], [8.5, 9.5]].forEach(([x, z], i) => {
  const h = 1.4 + (i % 3) * 1.1, p = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.62, h, 7), stoneM);
  p.position.set(x, h / 2, z); p.rotation.y = i; scene.add(p);
});

// ---- cast
const CAST = [
  { id: 'destroyer', wiz: 'ember_pyromancer', style: 'slam', tip: ['staff_gem', 0],
    sig: { name: 'Magma Crush', els: 'Fire + Earth', pal: 'magma' }, proj: { name: 'Fireball', els: 'Fire', pal: 'fire' } },
  { id: 'controller', wiz: 'rime_cryomancer', style: 'sweep', tip: ['crystal_socket', 0.12],
    sig: { name: 'Frozen Domain · Ice Spear', els: 'Water + Ice', pal: 'water' }, proj: { name: 'Ice Lance', els: 'Ice', pal: 'ice' } },
  { id: 'guardian', wiz: 'stone_druid', style: 'plant', tip: ['club_rune', 0],
    sig: { name: 'Sacred Spring', els: 'Water + Light', pal: 'light' }, proj: { name: 'Sun Mote', els: 'Light', pal: 'light' } },
  { id: 'geomancer', role: 'destroyer', label: 'Geomancer', color: '#d9902f', wiz: 'terra_geomancer', style: 'slam', tip: ['geo_core', 0],
    sig: { name: 'Tectonic Rupture', els: 'Earth', pal: 'earth' }, proj: { name: 'Boulder Toss', els: 'Earth', pal: 'earth' } },
  { id: 'zephyr', role: 'trickster', label: 'Zephyromancer', color: '#9fd3f0', wiz: 'zephyr_galesinger', style: 'sweep', tip: ['wind_eye', 0],
    sig: { name: 'Hurricane Eye', els: 'Wind', pal: 'gale' }, proj: { name: 'Gale Crescent', els: 'Wind', pal: 'gale' } },
  { id: 'trickster', wiz: 'storm_conduit', style: 'flick', tip: ['rod_tip', 0.2],
    sig: { name: 'Flash Step', els: 'Wind + Lightning', pal: 'lightning' }, proj: { name: 'Chain Lightning', els: 'Lightning', pal: 'lightning' } },
  { id: 'warden', role: 'controller', label: 'Void Warden', color: '#a855f7', wiz: 'void_necromancer', style: 'plant', tip: ['skull', 0.05],
    sig: { name: 'Xiềng Xích Trói Buộc', els: 'Binding Chains · Dark + Earth', pal: 'dark' }, proj: { name: 'Chain Hook', els: 'Dark', pal: 'dark' } },
  { id: 'arcanist', wiz: 'arcane_archmage', style: 'thrust', tip: ['orb', 0],
    sig: { name: 'Arc Plasma', els: 'Fire + Lightning', pal: 'plasma' }, proj: { name: 'Arcane Missiles', els: 'Arcane', pal: 'arcane' } }
];
const POSE = {
  slam:   { wind: { lean: -0.3, twist: 0.12, sq: 0.07 }, rel: { lean: 0.4, twist: -0.05, sq: -0.17 } },
  sweep:  { wind: { lean: -0.06, twist: 0.8, sq: -0.05 }, rel: { lean: 0.1, twist: -0.85, sq: -0.08 } },
  plant:  { wind: { lean: -0.12, twist: 0, sq: 0.08 }, rel: { lean: 0.12, twist: 0, sq: -0.13 } },
  flick:  { wind: { lean: -0.06, twist: 0.3, sq: 0.02 }, rel: { lean: 0.14, twist: -0.35, sq: -0.04 } },
  thrust: { wind: { lean: -0.22, twist: 0.38, sq: 0.04 }, rel: { lean: 0.3, twist: -0.16, sq: -0.09 } }
};
const REST = { lean: 0, twist: 0, sq: 0 };

const fx = createFx2d({ scene, camera, renderer });
const R = recipes(fx);
const EARTH = createEarth(fx, R, scene);
const CHAINS = createChains(fx, R, scene);
fx.S.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

let W = null;   // current wizard view
const pose = { x: { ...REST }, v: { lean: 0, twist: 0, sq: 0 }, tgt: { ...REST }, k: 60, c: 9 };
const setPose = (tgt, k, c) => Object.assign(pose, { tgt, k, c });
function loadWizard(role) {
  if (W) scene.remove(W.group);
  const spec = WIZARDS.find((w) => w.id === role.wiz);
  const { group, rig } = buildWizard({ ...spec });
  const pivot = new THREE.Group(); pivot.add(group); scene.add(pivot);
  const tipObj = group.getObjectByName(role.tip[0]);
  W = { group: pivot, inner: group, rig, tipObj, tipUp: role.tip[1], phase: 0, base: new THREE.Vector3() };
}
const _t = new THREE.Vector3();
const tip = () => { W.tipObj.getWorldPosition(_t); return [_t.x, _t.y + W.tipUp, _t.z]; };

// Targets
const targets = [[0, 4.6], [-1.7, 5.7], [1.8, 5.4]].map(([x, z]) => {
  const e = buildEnemy('thrall'); e.group.position.set(x, 0, z); e.group.rotation.y = Math.PI + Math.atan2(x, z) * 0.6;
  scene.add(e.group); return { ...e, x, z, lean: 0, lv: 0, sq: 0, side: 0, sv: 0 };
});
function hit(tg, power = 1, dx = 0, dz = 1) {
  tg.lv += 7 * power; tg.sq = Math.min(1, tg.sq + 0.8 * power); tg.sv += dx * 5 * power;
}
const near = (p, r) => targets.filter((t) => Math.hypot(t.x - p[0], t.z - p[2]) < r);

// ---- timeline helpers
const phaseEl = $('phase');
function phase(name) { [...phaseEl.children].forEach((c) => c.classList.toggle('on', c.dataset.p === name)); }
let busy = false;
function sequence(role, { windup, hold, pal, gatherR, onRelease, recoil = 0.5, orb = 0.5 }) {
  busy = true; phase('windup');
  const P = POSE[role.style];
  setPose(P.wind, 70, 10);
  R.gather(tip, pal, windup + hold, { r: gatherR ?? 1.3, orb, rate: 80, tag: 'gather' });
  // Feet plant: a little dust kicked back as the weight shifts.
  for (let i = 0; i < 6; i++) fx.spawn({ kind: K.smoke, pal: 'dust', p: [rnd(-0.4, 0.4), 0.15, rnd(-0.5, -0.1)], v: [rnd(-0.6, 0.6), 0.4, rnd(-1.2, -0.4)], s0: 0.2, s1: 0.6, life: 0.7, drag: 3, delay: rnd(0, windup * 0.6) });
  fx.after(windup, () => {
    phase('hold');
    R.flash(tip(), pal, 0.7, 3);   // pin-point flare: the held breath
  });
  fx.after(windup + hold, () => {
    phase('release');
    fx.kill('gather');
    setPose(P.rel, 1100, 24);
    onRelease();
    fx.after(0.1, () => { phase('recoil'); setPose(REST, 45, 5.5); });
    fx.after(recoil, () => { phase(''); busy = false; });
  });
}
const ink = (pal) => PAL[pal][1];

// ---- signatures
const SIG = {
  // Destroyer — the slam. A fissure runs out from the staff, then the ground erupts: flash, magma tongues, rock, smoke.
  destroyer(role) {
    const P = [0, 0, 4.4];
    sequence(role, { windup: 0.44, hold: 0.09, pal: 'magma', orb: 0.6, recoil: 2.6, onRelease() {
      const s = tip(); fx.kick(0, -0.22, 0); fx.shake(0.25);
      R.flash([s[0], 0.2, s[2] + 0.4], 'magma', 1.2, 4);
      R.debris([s[0], 0, s[2] + 0.3], 'earth', 5, 3.5, 0.14);
      for (let i = 1; i <= 5; i++) {
        const k = i / 5, at = [s[0] * (1 - k) + P[0] * k, 0.03, (s[2] + 0.4) * (1 - k) + P[2] * k];
        fx.after(k * 0.16, () => { fx.decal({ kind: K.crack, pal: 'magma', p: at, s: 1.2 + k * 0.6, life: 2.6, rot: Math.random() * 6 }); R.lick([at[0], 0.2, at[2]], 'magma', 0.5, { life: 0.35 }); });
      }
      fx.after(0.18, () => {
        fx.impact([1, 0.55, 0.2]);
        fx.kick(0, -0.35, 0);
        R.explosion([P[0], 0, P[2]], { r: 1.6, pal: 'fire', crackPal: 'magma', scorch: 4.5 });
        R.rockfire(P, { r: 1.1, life: 3, rocks: 11, h: 1.2 });
        [[-1.7, 1.2], [1.8, 1.0]].forEach(([dx, dz], i) => fx.after(0.12 + i * 0.08, () => R.rockfire([P[0] + dx, 0, P[2] + dz], { r: 0.7, life: 2.6, rocks: 8 })));
        R.debris(P, 'earth', 16, 8, 0.28);
        // Lava drops: heavy, arcing, they splat and cool on landing.
        for (let i = 0; i < 18; i++) { const v = R.dir(rnd(5, 9), 0.85);
          fx.spawn({ kind: K.spark, mode: M.vel, pal: 'magma', p: [P[0], 0.4, P[2]], v, s: rnd(0.14, 0.24), aspect: 0.55, life: rnd(0.9, 1.4), grav: -15, drag: 0.4, stretch: 0.05, bounce: 0, floor: 0.05,
            onBounce: (q) => { q.life = q.age + 0.01; fx.decal({ kind: K.crack, pal: 'magma', p: [q.p[0], 0.03, q.p[2]], s: 0.45, life: 1.6 }); } }); }
        // Geysers along the fissure keep licking up for a beat after the blast.
        fx.during(0.7, (dt, k) => { if (Math.random() < dt * 40 * (1 - k)) { const a = Math.random() * 6.28, r = Math.random() * 2;
          R.lick([P[0] + Math.cos(a) * r, 0.25, P[2] + Math.sin(a) * r], 'magma', rnd(0.4, 0.8), { v: [0, rnd(3, 5.5), 0], life: rnd(0.35, 0.6), aspect: 1.6 }); } });
        // Low dust wave rolling out along the floor.
        for (let i = 0; i < 10; i++) { const a = (i / 10) * 6.28;
          fx.spawn({ kind: K.smoke, pal: 'dust', p: [P[0] + Math.cos(a) * 0.8, 0.3, P[2] + Math.sin(a) * 0.8], v: [Math.cos(a) * 7, 0.4, Math.sin(a) * 7], s0: 0.35, s1: 0.9, life: 0.9, drag: 3.6, curl: 1, alpha: 0.6, delay: 0.1 }); }
        for (const t of near(P, 3.4)) hit(t, 1.3, (t.x - P[0]) * 0.4);
      });
    } });
  },
  // Controller — Frozen Domain. An ice spear freezes into being over the shoulder, is hurled, and where it lands the ground freezes.
  controller(role) {
    const P = [0, 0, 4.9], tForm = 0.62, hold = 0.14;
    const hand = () => { const t = tip(); return [t[0], Math.min(t[1], 1.9), t[2] + 0.2]; };
    conjureSpear(fx, R, scene, { getHand: hand, to: P, tForm, hold, flight: 0.3, onImpact() {
      R.sheet([0, 0, 1.8], [0, 0, 1], 4.2, 3.2, 3.4);
      R.crystals(P, 1.5, 13, { life: 2.8, h: 1.1, delay: 0.04 });
      R.crystals(P, 0.7, 6, { life: 2.6, h: 0.8, delay: 0.08 });
      fx.decal({ kind: K.icefield, pal: 'icefield', p: [P[0], 0.03, P[2]], s: 5.5, life: 3.6 });
      fx.light([P[0], 1.4, P[2]], [0.5, 0.85, 1.4], 6, 9, 3);
      for (let i = 0; i < 10; i++) { const a = Math.random() * 6.28, r = Math.random() * 2;
        fx.spawn({ kind: K.smoke, pal: 'frost', p: [P[0] + Math.cos(a) * r, 0.25, P[2] + Math.sin(a) * r], v: [Math.cos(a) * 0.8, -0.05, Math.sin(a) * 0.8], s0: 0.6, s1: 1.4, life: rnd(1.8, 2.6), drag: 1.2, delay: rnd(0.1, 0.5), curl: 0.6, split: 0.6, alpha: 0.7 }); }
      fx.during(2.6, (dt) => { if (Math.random() < dt * 9) { const a = Math.random() * 6.28, r = Math.random() * 2;
        fx.spawn({ kind: K.star, pal: 'crystal', p: [P[0] + Math.cos(a) * r, rnd(0.2, 1.2), P[2] + Math.sin(a) * r], s0: 0.3, s1: 0, life: 0.3, add: 0.6 }); } });
      for (const t of near(P, 3.5)) hit(t, 0.8);
    } });
    sequence(role, { windup: tForm, hold, pal: 'water', orb: 0.3, recoil: 3, onRelease() { fx.kick(0.12, 0, 0); } });
  },
  // Geomancer — the slam. Stones lift and circle him on the wind-up; the staff hits the floor and a wall of spires
  // marches out to the enemies, the orbiting stones are flung after it, and a last great spire launches the centre target.
  geomancer(role) {
    const C = () => [W.group.position.x, 0, W.group.position.z];
    const orb = EARTH.orbit(C, 7, { r: 0.85, y: 1.25, dur: 0.8 });
    for (let i = 0; i < 5; i++) fx.after(i * 0.1, () => fx.shake(0.04));
    sequence(role, { windup: 0.52, hold: 0.12, pal: 'earth', orb: 0.35, recoil: 2.4, onRelease() {
      fx.kick(0, -0.3, 0); fx.shake(0.35); fx.chroma(0.4);
      const s = tip(); R.flash([s[0], 0.3, s[2] + 0.3], [[2.6, 1.6, 0.5], [1.4, 0.7, 0.2], [0.4, 0.2, 0.08]], 1.2, 5);
      R.ring([s[0], 0, s[2] + 0.3], 'dust', 2.6, 0.35);
      for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.28;
        fx.spawn({ kind: K.smoke, pal: 'dust', p: [Math.cos(a) * 0.5, 0.2, Math.sin(a) * 0.5], v: [Math.cos(a) * 3.5, 0.2, Math.sin(a) * 3.5], s0: 0.25, s1: 0.6, life: 0.7, drag: 4, alpha: 0.6 }); }
      EARTH.rupture([0, 0, 0], [0, 0, 1], { n: 7, step: 0.6, h0: 0.7, h1: 1.5 });
      [[-0.35, 1], [0.38, 1]].forEach(([dx]) => EARTH.rupture([0, 0, 0], [dx, 0, 1].map((v, i, a) => v / Math.hypot(a[0], a[2])), { n: 5, step: 0.75, h0: 0.5, h1: 1.1, every: 0.055 }));
      orb.hurl([0, 0, 5], { speed: 20, spread: 1.6 });
      fx.after(0.34, () => {
        const T = targets[0], p = [T.x, 0, T.z];
        fx.impact([1, 0.75, 0.4]); fx.shake(0.4);
        EARTH.spire(p, { h: 2.6, r: 0.55, life: 1.8, tilt: 0.05 });
        R.debris([p[0], 0.2, p[2]], 'rock', 14, 7, 0.22); R.ring(p, 'dust', 3.4, 0.4);
        for (let i = 0; i < 6; i++) fx.spawn({ kind: K.smoke, pal: 'dust', p: [p[0], 0.3, p[2]], v: R.dir(2.2, 0.5), s0: 0.35, s1: 1, life: 1.2, drag: 2.8, split: 0.5, alpha: 0.65 });
        for (const t of targets) hit(t, t === T ? 1.4 : 0.8);
      });
    } });
  },
  // Zephyromancer — the sweep. Air is drawn spiralling into the staff, then a tornado is spun off it and walked through
  // the enemy line, tossing them; it bursts outward into gust crescents and the leftover air curls away.
  zephyr(role) {
    const C = [0, 0, 1.4], path = [[0, 1.4], [-1.3, 4.6], [0.2, 5.3], [1.8, 4.8]], D = 2.2;
    let tt = 0; const at = () => { const k = Math.min(1, tt / D) * (path.length - 1), i = Math.min(path.length - 2, Math.floor(k)), f = k - i;
      return [path[i][0] + (path[i + 1][0] - path[i][0]) * f, 0, path[i][1] + (path[i + 1][1] - path[i][1]) * f]; };
    fx.during(0.6, (dt) => { if (Math.random() < dt * 40) { const s = tip(), a = Math.random() * 6.28, r = rnd(0.9, 1.4);
      fx.spawn({ kind: K.arc, pal: 'gale', p: [s[0] + Math.cos(a) * r, s[1] + rnd(-0.5, 0.4), s[2] + Math.sin(a) * r], v: [-Math.cos(a) * 3, 0, -Math.sin(a) * 3], s0: 0.5, s1: 0.2, life: 0.3, spin: 9, add: 0.35 }); } });
    sequence(role, { windup: 0.5, hold: 0.1, pal: 'gale', orb: 0.3, recoil: 3.2, onRelease() {
      fx.kick(0.1, 0, 0); fx.shake(0.15);
      R.flash(tip(), 'gale', 1, 0);
      for (let i = 0; i < 5; i++) { const a = -0.7 + i * 0.35; R.gust([0.2, 1.1, 0.5], [Math.sin(a) * 8, 0, Math.cos(a) * 8], { s: 0.9, life: 0.3 }); }
      fx.decal({ kind: K.ring, pal: 'gale', p: [C[0], 0.04, C[2]], s0: 0.5, s1: 4, life: 0.4 });
      R.tornado(() => at(), D + 0.3, { h: 3.6, r0: 0.28, r1: 1.35, rate: 110 });
      fx.during(D, (dt) => { tt += dt; const p = at(); for (const t of targets) if (Math.hypot(t.x - p[0], t.z - p[2]) < 1.1 && Math.random() < dt * 10) hit(t, 0.35, (t.x - p[0]) * 2); });
      fx.light([0, 2, 3.5], [0.9, 1.1, 1.3], 3, 9, D);
      fx.after(D, () => { const p = at();
        fx.impact([0.75, 0.9, 1]); fx.shake(0.25); R.flash([p[0], 1.2, p[2]], 'gale', 1.4, 0); R.ring(p, 'gale', 4, 0.4);
        for (let i = 0; i < 10; i++) { const a = (i / 10) * 6.28; R.gust([p[0], 1.2, p[2]], [Math.cos(a) * 9, rnd(-0.5, 1.5), Math.sin(a) * 9], { s: 0.8, life: 0.35 }); }
        R.curls([p[0], 1.6, p[2]], 12, { s: 0.45, sp: 2.4 });
        for (const t of targets) hit(t, 0.6, t.x - p[0]);
      });
    } });
  },
  // Guardian — the plant. Staff meets floor: rune circle, a pillar of light, a fountain that rains back down.
  guardian(role) {
    sequence(role, { windup: 0.32, hold: 0.09, pal: 'light', recoil: 3, onRelease() {
      const s = tip(); fx.kick(0, -0.18, 0); fx.shake(0.15);
      fx.decal({ kind: K.rune, pal: 'light', p: [0, 0.03, 0.2], s: 4.6, life: 4, rot: 0, alpha: 0.7, tick: (q, dt) => { q.rot += dt * 0.25; } });
      fx.decal({ kind: K.crack, pal: 'light', p: [s[0], 0.03, s[2]], s: 1.6, life: 2.5 });
      R.flash([s[0], 0.4, s[2]], 'light', 1.5, 4);
      fx.light([0, 2.4, 0.4], [1.6, 1.25, 0.6], 3.5, 7, 2.6);
      fx.dome([0, 0, 0.2], 2.2, [0.85, 0.65, 0.16], 3.2);
      fx.spawn({ kind: K.beam, mode: M.axis, pal: 'light', p: [0, 5, 0.2], axis: [0, 1, 0], len: 10, s: 0.9, life: 1.0, add: 0.3, alpha: 0.45 });
      for (let i = 0; i < 12; i++) { const a = (i / 12) * 6.28; fx.decal({ kind: K.star, pal: 'light', p: [Math.cos(a) * 1.9, 0.04, 0.2 + Math.sin(a) * 1.9], s: 0.42, life: 3, delay: i * 0.02, rot: 0, add: 0.5 }); }
      fx.chroma(0.4);
      // Fountain: droplets spray up in a crown and fall back with little splashes.
      fx.during(1.3, (dt, k) => { const n = Math.round(dt * 90 * (1 - k * 0.7));
        for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, sp = rnd(1.5, 3);
          fx.spawn({ kind: K.spark, mode: M.vel, pal: 'water', p: [Math.cos(a) * 0.5, 0.3, 0.2 + Math.sin(a) * 0.5], v: [Math.cos(a) * sp, rnd(6, 9), Math.sin(a) * sp], s: 0.16, aspect: 0.45, life: 1.4, grav: -14, drag: 0.2, stretch: 0.05, bounce: 0, floor: 0.04,
            onBounce: (q) => { q.life = q.age + 0.01; fx.spawn({ kind: K.ring, pal: 'water', mode: M.ground, p: [q.p[0], 0.04, q.p[2]], s0: 0.1, s1: 0.6, life: 0.3, rot: 0 }); } }); } });
      for (let i = 0; i < 4; i++) fx.after(i * 0.45, () => R.ring([0, 0, 0.2], 'light', 6.2, 0.6));
      // Healing motes rise and spiral.
      fx.during(2.6, (dt) => { if (Math.random() < dt * 22) { const a = Math.random() * 6.28, r = rnd(0.5, 2.8);
        fx.spawn({ kind: K.star, pal: 'light', p: [Math.cos(a) * r, 0.2, 0.2 + Math.sin(a) * r], v: [0, rnd(1, 2), 0], s0: 0.22, s1: 0.05, life: rnd(1, 1.6), curl: 2, add: 0.5, spin: 2 }); } });
    } });
  },
  // Trickster — the flick. Gone in a frame: afterimages, a lightning stroke along the path, a crack at the far end.
  trickster(role) {
    sequence(role, { windup: 0.13, hold: 0.04, pal: 'lightning', gatherR: 0.8, orb: 0.35, recoil: 2.2, onRelease() {
      dash([0, 0, 0], [0.35, 0, 6.4], true);
      fx.after(1.25, () => { setPose(POSE.flick.wind, 300, 14); fx.after(0.08, () => { setPose(REST, 45, 5.5); dash([0.35, 0, 6.4], [0, 0, 0], false); }); });
    } });
  },
  // Void Warden — Xiềng Xích Trói Buộc. The standard strikes the floor; rune portals open round every enemy and iron
  // chains burst out, whip over, coil round them and cinch tight. They hold, struggling, then the chains shatter.
  warden(role) {
    sequence(role, { windup: 0.42, hold: 0.12, pal: 'dark', orb: 0.45, recoil: 2.6, onRelease() {
      const s = tip(); fx.kick(0, -0.2, 0); fx.shake(0.2); fx.chroma(0.5);
      fx.decal({ kind: K.rune, pal: 'dark', p: [s[0], 0.03, s[2]], s: 2.4, life: 2.4, rot: 0, tick: (q, dt) => { q.rot += dt; } });
      R.flash([s[0], 0.3, s[2]], 'dark', 1.2, 4);
      targets.forEach((tg, i) => {
        const T = () => [tg.x, 1.0, tg.z];
        CHAINS.prison(T, { n: i === 0 ? 5 : 3, r: i === 0 ? 1.9 : 1.5, delay: 0.08 + i * 0.07, hold: 1.7, pal: 'dark', onLatch: () => { hit(tg, 0.7); tg.bound = 1.7; } });
      });
      fx.after(0.4, () => { fx.impact([0.75, 0.4, 1]); fx.shake(0.25); });
    } });
  },
  // Arcanist — the thrust. A plasma stream with a white core and live arcs crawling along it; breaks up into licks.
  arcanist(role) {
    sequence(role, { windup: 0.36, hold: 0.11, pal: 'plasma', orb: 0.7, recoil: 2.2, onRelease() {
      fx.impact([1, 0.7, 0.4]); fx.kick(0, 0, -0.28); fx.shake(0.3); fx.chroma(1);
      const D = 0.9, end = () => [targets[0].x, 1.15, targets[0].z - 0.2];
      R.flash(tip(), 'plasma', 2, 10);
      R.strands(tip, end, 'plasma', D, { n: 5, amp: 0.3, w: 0.11, sag: 0.4, splash: 'fire', orbs: true });
      fx.light([0, 1.2, 2.5], [2.2, 1.4, 0.6], 8, 10, D + 0.2);
      fx.heat([targets[0].x, 1.2, targets[0].z], 1.2, 0.8, D + 0.3);
      fx.during(D, (dt) => { if (Math.random() < dt * 12) hit(targets[0], 0.18); });
      fx.after(D * 0.4, () => R.bolt(tip(), end(), 'lightning', { seg: 10, w: 0.07, life: 0.08, jit: 0.4, fork: 0.25 }));
      // Dissipation: the strands snap and the last energy pops off the end as a small burst.
      fx.after(D, () => { const E = end(); R.flash(E, 'plasma', 1.3, 6); R.sparks(E, 'plasma', 14, 6, { up: 0.6 });
        for (let i = 0; i < 4; i++) fx.spawn({ kind: K.smoke, pal: 'smoke', p: E, v: R.dir(1, 0.8), s0: 0.3, s1: 0.8, life: 1, curl: 1.3, drag: 2, alpha: 0.6, delay: 0.1 }); });
    } });
  }
};

// Flash Step's dash: afterimages + bolt + speed lines. `big` adds the far-end strike.
const ghostMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.85, 0.75, 0.22), transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending });
function dash(a, b, big) {
  const ghosts = [];
  for (let i = 0; i < 4; i++) {
    const k = i / 4, gh = W.inner.clone(true);
    gh.traverse((o) => { if (o.isMesh) o.material = ghostMat.clone(); });
    gh.position.set(a[0] + (b[0] - a[0]) * k, 0, a[2] + (b[2] - a[2]) * k);
    gh.quaternion.copy(W.group.quaternion); gh.scale.copy(W.group.scale);
    scene.add(gh); ghosts.push({ gh, life: 0.28 + i * 0.07 });
  }
  let age = 0;
  fx.during(0.6, (dt) => { age += dt; for (const g of ghosts) { const k = Math.max(0, 1 - age / g.life); g.gh.traverse((o) => { if (o.isMesh) o.material.opacity = 0.45 * k; }); if (!k) scene.remove(g.gh); } });
  W.base.set(...b);
  R.flash([a[0], 1, a[2]], 'lightning', 1.2, 6);
  for (let i = 0; i < 10; i++) { const ang = (i / 10) * 6.28;
    fx.spawn({ kind: K.smoke, pal: 'wind', p: [a[0], 0.3, a[2]], v: [Math.cos(ang) * 4, 0.5, Math.sin(ang) * 4], s0: 0.3, s1: 0.9, life: 0.6, drag: 4, curl: 2, alpha: 0.8 }); }
  for (let s = 0; s < 3; s++) fx.after(s * 0.05, () => R.bolt([a[0], 1.1, a[2]], [b[0], 1.1, b[2]], 'lightning', { seg: 12, w: 0.16 - s * 0.03, life: 0.16, jit: 0.6, fork: 0.3 }));
  for (let i = 0; i < 24; i++) { const k = Math.random(), y = rnd(0.3, 1.9), off = rnd(-0.7, 0.7);
    fx.spawn({ kind: K.spark, mode: M.vel, pal: 'wind', p: [a[0] + (b[0] - a[0]) * k + off, y, a[2] + (b[2] - a[2]) * k], v: [(b[0] - a[0]) * 3, 0, (b[2] - a[2]) * 3], s: 0.12, aspect: 0.12, life: 0.3, stretch: 0.1, drag: 6, alpha: 0.9 }); }
  fx.after(0.03, () => {
    R.flash([b[0], 1, b[2]], 'lightning', 1.6, 8); R.sparks([b[0], 1, b[2]], 'lightning', 22, 9, { up: 0.5, grav: -6 }); R.ring(b, 'wind', 3, 0.35);
    fx.decal({ kind: K.crack, pal: 'lightning', p: [b[0], 0.03, b[2]], s: 1.6, life: 1.6 });
    if (big) {
      fx.impact([1, 0.95, 0.5]); fx.shake(0.28); fx.chroma(0.9);
      for (const t of targets) if (Math.abs(t.x - (a[0] + b[0]) / 2) < 1) { hit(t, 1, 0); R.bolt([t.x, 4.5, t.z], [t.x, 1.2, t.z], 'lightning', { seg: 7, w: 0.14, life: 0.2, fork: 0.4 }); R.sparks([t.x, 1.2, t.z], 'lightning', 10, 6); }
    }
  });
}

// ---- projectiles
const FROM = () => { const s = tip(); return [s[0], s[1] - 0.1, s[2] + 0.3]; };
const AIM = [0, 1.15, 4.4];
const PROJ = {
  destroyer: (role) => sequence(role, { windup: 0.3, hold: 0.06, pal: 'fire', orb: 0.45, recoil: 1.6, onRelease() {
    fx.kick(0, 0, -0.12);
    R.projectile(FROM(), AIM, { pal: 'fire', speed: 15, r: 0.36, trail: 70,
      onTrail: (q) => { fx.spawn({ kind: K.billow, pal: Math.random() < 0.3 ? 'blast' : 'fire', p: [...q.p], v: [q.v[0] * 0.08 + rnd(-0.4, 0.4), rnd(0.6, 1.4), q.v[2] * 0.08], s0: rnd(0.45, 0.6), s1: 0.25, life: rnd(0.25, 0.4), drag: 2, add: 0.45 });
        if (Math.random() < 0.18) fx.spawn({ kind: K.smoke, pal: 'smoke', p: [...q.p], v: [0, 0.8, 0], s0: 0.25, s1: 0.8, life: 1, drag: 2, curl: 1.4, alpha: 0.7 }); },
      onHit: (p) => { fx.impact([1, 0.6, 0.3]); R.explosion([p[0], 0, p[2]], { r: 1.05 }); for (const t of near(p, 2)) hit(t, 1); } });
  } }),
  controller: (role) => sequence(role, { windup: 0.24, hold: 0.05, pal: 'ice', orb: 0.35, recoil: 1.4, onRelease() {
    R.projectile(FROM(), AIM, { pal: 'ice', kind: K.shard, speed: 22, r: 0.3, trail: 50, core: false,
      onTrail: (q) => { fx.spawn({ kind: K.smoke, pal: 'frost', p: [...q.p], v: [rnd(-0.3, 0.3), -0.1, rnd(-0.3, 0.3)], s0: 0.22, s1: 0.5, life: 0.7, drag: 2, alpha: 0.75 });
        if (Math.random() < 0.3) fx.spawn({ kind: K.star, pal: 'ice', p: [q.p[0] + rnd(-0.2, 0.2), q.p[1] + rnd(-0.2, 0.2), q.p[2]], s0: 0.22, s1: 0, life: 0.25, add: 0.6 }); },
      onHit: (p) => { R.flash(p, 'ice', 1.2, 6); R.debris(p, 'ice', 12, 6, 0.18); R.ring([p[0], 0, p[2]], 'ice', 2.4, 0.3);
        fx.decal({ kind: K.icefield, pal: 'icefield', p: [p[0], 0.03, p[2]], s: 2.4, life: 2.4 }); fx.shake(0.18);
        for (let i = 0; i < 6; i++) fx.spawn({ kind: K.smoke, pal: 'frost', p: [...p], v: R.dir(1.5, 0.3), s0: 0.4, s1: 1.1, life: 1.2, drag: 2.5, split: 0.5 });
        for (const t of near(p, 1.6)) hit(t, 0.8); } });
  } }),
  guardian: (role) => sequence(role, { windup: 0.26, hold: 0.07, pal: 'light', orb: 0.4, recoil: 1.8, onRelease() {
    R.projectile(FROM(), AIM, { pal: 'light', kind: K.star, speed: 10, r: 0.42, trail: 40, core: false,
      onTrail: (q) => { fx.spawn({ kind: K.star, pal: 'light', p: [q.p[0] + rnd(-0.15, 0.15), q.p[1] + rnd(-0.15, 0.15), q.p[2]], v: [0, rnd(0.2, 0.8), 0], s0: 0.24, s1: 0, life: 0.5, curl: 2, add: 0.5 });
        R.lick([...q.p], 'light', 0.35, { life: 0.25 }); },
      onHit: (p) => { R.flash(p, 'light', 1.8, 9); fx.decal({ kind: K.rune, pal: 'light', p: [p[0], 0.03, p[2]], s: 2.8, life: 1.6 });
        fx.spawn({ kind: K.beam, mode: M.axis, pal: 'light', p: [p[0], 2.5, p[2]], axis: [0, 1, 0], len: 5, s: 0.9, life: 0.45, add: 0.4 });
        R.sparks(p, 'light', 14, 5, { grav: 2 }); R.ring([p[0], 0, p[2]], 'light', 2.6, 0.35); for (const t of near(p, 1.6)) hit(t, 0.6); } });
  } }),
  trickster: (role) => sequence(role, { windup: 0.1, hold: 0.03, pal: 'lightning', gatherR: 0.7, orb: 0.3, recoil: 1.4, onRelease() {
    const pts = [targets[0], targets[2], targets[1]].map((t) => [t.x, 1.2, t.z]);
    fx.impact([0.8, 0.6, 1]); fx.shake(0.22); fx.chroma(0.8);
    R.chain(tip, pts, 0.45);
    fx.light([0, 1.5, 3], [1.4, 1.0, 2.6], 7, 10, 0.5);
    targets.forEach((t, i) => fx.after(i * 0.04, () => hit(t, 0.6)));
  } }),
  geomancer: (role) => {
    const at = [0.25, 0, 1.1];
    EARTH.boulder(at, [AIM[0], 0.3, AIM[2]], { r: 0.5, rise: 0.36, hold: 0.14, onHit: (p) => {
      fx.impact([1, 0.75, 0.4]); fx.shake(0.4);
      R.debris(p, 'rock', 16, 7, 0.2); R.ring([p[0], 0, p[2]], 'dust', 3, 0.35);
      fx.decal({ kind: K.crack, pal: 'earth', p: [p[0], 0.03, p[2]], s: 2.6, life: 3 });
      fx.decal({ kind: K.scorch, pal: 'char', p: [p[0], 0.025, p[2]], s: 2.4, life: 3 });
      for (let i = 0; i < 10; i++) fx.spawn({ kind: K.smoke, pal: 'dust', p: [p[0], 0.3, p[2]], v: R.dir(3, 0.4), s0: 0.4, s1: 1.2, life: 1.2, drag: 2.8, split: 0.5, alpha: 0.75 });
      EARTH.ring([p[0], 0, p[2]], 1.2, 7, { h: 0.8, life: 1.4 });
      for (const t of near(p, 2.2)) hit(t, 1.1);
    } });
    sequence(role, { windup: 0.36, hold: 0.14, pal: 'earth', orb: 0.3, recoil: 1.8, onRelease() { fx.kick(0, 0, -0.1); } });
  },
  zephyr: (role) => sequence(role, { windup: 0.26, hold: 0.06, pal: 'gale', orb: 0.3, recoil: 1.6, onRelease() {
    fx.kick(0.08, 0, 0); R.curls(tip(), 5, { s: 0.3 });
    [-0.28, 0, 0.28].forEach((a, i) => fx.after(i * 0.04, () => {
      const s = tip(), d = [AIM[0] - s[0], 0, AIM[2] - s[2]], L = Math.hypot(d[0], d[2]), sp = 15, ca = Math.cos(a), sa = Math.sin(a);
      const v = [(d[0] * ca + d[2] * sa) / L * sp, 0, (-d[0] * sa + d[2] * ca) / L * sp];
      R.gust([s[0], 1.15, s[2] + 0.3], v, { s: 1.15, life: (L / sp) * 1.05, drag: 0, onDie: (q) => {
        R.curls(q.p, 6, { s: 0.4, sp: 2 }); R.flash(q.p, 'gale', 0.8, 0);
        fx.spawn({ kind: K.arc, mode: M.ground, pal: 'gale', p: [q.p[0], 0.05, q.p[2]], s0: 0.6, s1: 2.2, life: 0.4, spin: -8, add: 0.3 });
        for (let k = 0; k < 4; k++) fx.spawn({ kind: K.smoke, pal: 'dust', p: [q.p[0], 0.3, q.p[2]], v: R.dir(2.5, 0.3), s0: 0.25, s1: 0.7, life: 0.6, drag: 3, alpha: 0.55 });
        for (const t of near(q.p, 1.4)) hit(t, 0.6, v[0] * 0.1); } });
    }));
  } }),
  warden: (role) => sequence(role, { windup: 0.26, hold: 0.08, pal: 'dark', orb: 0.35, recoil: 1.8, onRelease() {
    const tg = targets[0], s = FROM();
    CHAINS.bind([s[0], s[1] - 1.0, s[2]], () => [tg.x, 1.0, tg.z], { shoot: 0.18, hold: 0.7, coil: 1.6, coilR: 0.38, pal: 'dark', onLatch: () => {
      hit(tg, 0.6); fx.after(0.3, () => { tg.yank = 0.35; fx.shake(0.15); }); } });
  } }),
  arcanist: (role) => sequence(role, { windup: 0.28, hold: 0.08, pal: 'arcane', orb: 0.5, recoil: 1.8, onRelease() {
    targets.forEach((t, i) => fx.after(i * 0.08, () => {
      const f = FROM(), to = [t.x, 1.15, t.z], side = (i - 1) * 2.2;
      const m = R.projectile(f, to, { pal: 'arcane', speed: 12, r: 0.24, trail: 45,
        onTrail: (q) => { R.lick([...q.p], 'arcane', rnd(0.3, 0.45), { v: [rnd(-0.3, 0.3), rnd(0.2, 0.8), 0], life: 0.3 }); },
        onHit: (p) => { R.flash(p, 'arcane', 1.2, 5); R.ring(p, 'arcane', 1.6, 0.25, false); R.sparks(p, 'arcane', 10, 5, { grav: 0 }); hit(t, 0.6);
          for (let k = 0; k < 4; k++) R.lick(p, 'arcane', 0.6, { v: R.dir(2.5, 0.5), life: 0.4 }); } });
      // Homing curve: sideways bow that straightens out on approach.
      const base = m.tick; let prev = 0;
      m.tick = (q, dt, k, F) => { const off = side * 0.45 * Math.sin(Math.PI * k), oy = 0.5 * Math.sin(Math.PI * k); q.p[0] += off - prev; q.p[1] += (oy - (q.oy || 0)); q.oy = oy; prev = off; base(q, dt, k, F); };
    }));
  } })
};

// ---- UI
let role = CAST[0], mode = 'sig', slow = false, auto = true, autoT = 1.0;
const roster = $('roster');
CAST.forEach((c) => {
  const R0 = ROLES[c.role ?? c.id], wz = WIZARDS.find((w) => w.id === c.wiz);
  const b = document.createElement('button');
  b.className = 'pick'; b.dataset.id = c.id; b.style.setProperty('--c', c.color ?? '#' + R0.color.toString(16).padStart(6, '0'));
  b.innerHTML = `<i></i><span><b>${c.label ?? R0.name}</b><small>${wz.name} · ${c.style}</small></span>`;
  b.onclick = () => selectRole(c); roster.appendChild(b);
});
function syncUI() {
  [...roster.children].forEach((b) => b.classList.toggle('is-on', b.dataset.id === role.id));
  const s = role[mode];
  $('m-sig').innerHTML = `<b>${role.sig.name}</b><small>${role.sig.els}</small>`;
  $('m-proj').innerHTML = `<b>${role.proj.name}</b><small>${role.proj.els}</small>`;
  $('m-sig').classList.toggle('is-on', mode === 'sig'); $('m-proj').classList.toggle('is-on', mode === 'proj');
  $('now').textContent = s.name; $('now-els').textContent = `${role.label ?? ROLES[role.role ?? role.id].name} · ${s.els}`;
  $('slow').classList.toggle('is-on', slow); $('auto').classList.toggle('is-on', auto);
  $('slow').querySelector('b').textContent = slow ? 'Slow-mo on' : 'Slow-mo off';
  $('auto').querySelector('b').textContent = auto ? 'Loop on' : 'Loop off';
}
function selectRole(c) { role = c; resetStage(); syncUI(); autoT = 0.5; }
function resetStage() { fx.clear(); scene.children.filter((o) => /^(geo_spire|geo_rock|ice_spear|fx_funnel)$/.test(o.name)).forEach((o) => scene.remove(o)); loadWizard(role); busy = false; phase(''); setPose(REST, 45, 5.5); }
function cast() { if (busy) return; (mode === 'sig' ? SIG : PROJ)[role.id](role); }
$('m-sig').onclick = () => { mode = 'sig'; syncUI(); autoT = 0.3; };
$('m-proj').onclick = () => { mode = 'proj'; syncUI(); autoT = 0.3; };
$('cast').onclick = cast;
$('slow').onclick = () => { slow = !slow; syncUI(); };
$('auto').onclick = () => { auto = !auto; syncUI(); };
addEventListener('keydown', (e) => {
  if (e.code === 'Space') { e.preventDefault(); cast(); }
  else if (e.key === 's' || e.key === 'S') { slow = !slow; syncUI(); }
  else if (e.key === 'Tab') { e.preventDefault(); mode = mode === 'sig' ? 'proj' : 'sig'; syncUI(); }
  else if (e.key >= '1' && e.key <= String(CAST.length)) selectRole(CAST[+e.key - 1]);
});
const saved = JSON.parse(localStorage.getItem('fx_showcase') || '{}');
if (saved.role) role = CAST.find((c) => c.id === saved.role) || role;
if (saved.mode) mode = saved.mode;
if (saved.slow) slow = true;
const save = () => localStorage.setItem('fx_showcase', JSON.stringify({ role: role.id, mode, slow }));
addEventListener('beforeunload', save); setInterval(save, 2000);
loadWizard(role); syncUI();

// ---- loop
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  fx.resize(Math.round(w * PR), Math.round(h * PR));
}
addEventListener('resize', resize); resize();
const camBase = new THREE.Vector3(-4.6, 3.1, -5.2), look = new THREE.Vector3(0.6, 1.1, 3.8);
const clock = new THREE.Timer ? null : null; let last = performance.now();
const clockDelta = () => { const n = performance.now(), d = (n - last) / 1000; last = n; return d; };
let fpsAcc = 0, fpsN = 0;
function frame() { tick(Math.min(0.05, clockDelta())); draw(); requestAnimationFrame(frame); }
function tick(raw) {
  const dt = raw * (slow ? 0.25 : 1);
  fpsAcc += raw; fpsN++;
  if (fpsAcc > 0.5) { $('stats').textContent = `${Math.round(fpsN / fpsAcc)} fps · ${fx.count()} sprites`; fpsAcc = 0; fpsN = 0; }
  if (auto && !busy && (autoT -= dt) <= 0) { cast(); autoT = 1.1; }
  fx.update(dt);
  // Pose spring (stiff snap on release, soft overshoot on recoil).
  for (const k of ['lean', 'twist', 'sq']) { const a = pose.k * (pose.tgt[k] - pose.x[k]) - pose.c * pose.v[k]; pose.v[k] += a * dt; pose.x[k] += pose.v[k] * dt; }
  const g = W.group;
  g.position.lerp(W.base, 1 - Math.exp(-dt * 60));
  g.rotation.set(pose.x.lean, pose.x.twist, 0);
  const sy = 1 + pose.x.sq, sxz = 1 / Math.sqrt(Math.max(0.5, sy)); g.scale.set(sxz, sy, sxz);
  W.phase += dt * GAIT.idle.speed; W.inner.updateMatrixWorld(true); animateRig(W.rig, W.phase, GAIT.idle, true);
  for (const t of targets) {
    t.lv += (-90 * t.lean - 9 * t.lv) * dt; t.lean += t.lv * dt;
    t.sv += (-90 * t.side - 9 * t.sv) * dt; t.side += t.sv * dt;
    t.sq *= Math.exp(-8 * dt);
    t.group.rotation.x = -Math.min(0.6, t.lean * 0.12); t.group.rotation.z = t.side * 0.1;
    if (t.bound > 0) { t.bound -= dt; t.side += Math.sin(fx.time * 38) * 0.02; }
    if (t.yank > 0) { t.yank -= dt; t.lv -= 30 * dt; }
    t.group.position.z = t.z + Math.max(0, t.lean) * 0.05;
    t.group.scale.set(1 + t.sq * 0.18, 1 - t.sq * 0.22, 1 + t.sq * 0.18);
  }
  const drift = fx.time * 0.12;
  camera.position.copy(camBase).add(new THREE.Vector3(Math.sin(drift) * 0.5, Math.sin(drift * 0.7) * 0.15, 0)).add(fx.cameraOffset());
  camera.lookAt(look);
}
function draw() { fx.render(); }
// Deterministic stepping for capture tools: advance n seconds at 60 Hz, then draw one frame.
window.__fxStep = (sec, keepImpact) => { for (let i = 0; i < Math.round(sec * 60); i++) tick(1 / 60); if (!keepImpact) fx.S.impactF = 0; draw(); return fx.count(); };
window.__fxCast = (id, m = 'sig') => { selectRole(CAST.find((c) => c.id === id)); mode = m; slow = false; auto = false; syncUI(); cast(); };
requestAnimationFrame(frame);
