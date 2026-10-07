import * as THREE from 'three';

const stage = document.querySelector('three-d-stage');
await stage.ready;

const MAT = {
  wood: new THREE.MeshStandardMaterial({ name: 'ash_wood', color: 0x8a6134, roughness: 0.92, metalness: 0.0 }),
  leather: new THREE.MeshStandardMaterial({ name: 'leather_wrap', color: 0x4a3122, roughness: 0.95, metalness: 0.0 }),
  iron: new THREE.MeshStandardMaterial({ name: 'dark_iron', color: 0x7e848d, roughness: 0.45, metalness: 0.35 }),
  brass: new THREE.MeshStandardMaterial({ name: 'old_brass', color: 0xd2a44b, roughness: 0.32, metalness: 0.38 }),
  crystal: new THREE.MeshStandardMaterial({
    name: 'arcane_crystal', color: 0x9c72ff, emissive: 0x6b34cc, emissiveIntensity: 0.85,
    roughness: 0.12, metalness: 0.1
  }),
  fire: new THREE.MeshStandardMaterial({ name: 'ember_fire', color: 0xff7a2f, emissive: 0xd23a08, emissiveIntensity: 0.9, roughness: 0.2, metalness: 0.05 }),
  frost: new THREE.MeshStandardMaterial({ name: 'frost_ice', color: 0xa9e4f5, emissive: 0x2f8fb5, emissiveIntensity: 0.55, roughness: 0.1, metalness: 0.05 }),
  storm: new THREE.MeshStandardMaterial({ name: 'storm_lightning', color: 0xf7e26b, emissive: 0xd9a516, emissiveIntensity: 0.8, roughness: 0.18, metalness: 0.1 }),
  stone: new THREE.MeshStandardMaterial({ name: 'earth_stone', color: 0x8b7a5f, roughness: 0.95, metalness: 0.0 }),
  life: new THREE.MeshStandardMaterial({ name: 'life_nature', color: 0x76c04a, emissive: 0x2f7a26, emissiveIntensity: 0.45, roughness: 0.4, metalness: 0.0 })
};

const staff = new THREE.Group();
staff.name = 'arcane_staff';

const mesh = (geo, mat, name) => {
  const m = new THREE.Mesh(geo, mat);
  m.name = name;
  m.castShadow = true;
  m.receiveShadow = true;
  staff.add(m);
  return m;
};

// ---- shaft (knotted ash) -------------------------------------------------
const SHAFT_BOTTOM = 0.14, SHAFT_TOP = 1.52;
const knot = (t, c, w, h) => h * Math.exp(-Math.pow((t - c) / w, 2));
const shaftRadius = (t) =>
  0.048 - 0.010 * t + knot(t, 0.18, 0.05, 0.013) + knot(t, 0.52, 0.045, 0.011) +
  knot(t, 0.78, 0.05, 0.012) + 0.0018 * Math.sin(t * 34);

const pts = [];
for (let i = 0; i <= 48; i++) {
  const t = i / 48;
  pts.push(new THREE.Vector2(shaftRadius(t), SHAFT_BOTTOM + t * (SHAFT_TOP - SHAFT_BOTTOM)));
}
mesh(new THREE.LatheGeometry(pts, 32), MAT.wood, 'shaft');

// ---- butt spike ----------------------------------------------------------
mesh(new THREE.ConeGeometry(0.062, 0.21, 24), MAT.iron, 'butt_spike')
  .position.set(0, 0.105, 0);
mesh(new THREE.CylinderGeometry(0.058, 0.062, 0.07, 24), MAT.iron, 'butt_ferrule')
  .position.set(0, 0.20, 0);
mesh(new THREE.TorusGeometry(0.059, 0.013, 12, 28), MAT.brass, 'ferrule_ring')
  .rotation.x = Math.PI / 2;
staff.getObjectByName('ferrule_ring').position.set(0, 0.245, 0);

// ---- leather grip wrap ---------------------------------------------------
const gripGroup = [];
for (let i = 0; i <= 16; i++) {
  const t = 0.42 + (i / 16) * 0.17;              // 0.42..0.59 of shaft length
  const y = SHAFT_BOTTOM + t * (SHAFT_TOP - SHAFT_BOTTOM);
  const ring = mesh(new THREE.TorusGeometry(shaftRadius(t) + 0.008, 0.014, 10, 28), MAT.leather, `grip_wrap_${i}`);
  ring.position.set(0, y, 0);
  ring.rotation.x = Math.PI / 2 + 0.11;
  ring.rotation.z = (i / 16) * 0.5;
  gripGroup.push(ring);
}
[0.40, 0.605].forEach((t, i) => {
  const y = SHAFT_BOTTOM + t * (SHAFT_TOP - SHAFT_BOTTOM);
  const band = mesh(new THREE.TorusGeometry(shaftRadius(t) + 0.009, 0.008, 10, 28), MAT.brass, `grip_band_${i}`);
  band.position.set(0, y, 0);
  band.rotation.x = Math.PI / 2;
});

// ---- rune bands along the shaft -----------------------------------------
[0.30, 0.86].forEach((t, i) => {
  const y = SHAFT_BOTTOM + t * (SHAFT_TOP - SHAFT_BOTTOM);
  const r = shaftRadius(t);
  const band = mesh(new THREE.CylinderGeometry(r + 0.009, r + 0.009, 0.055, 28, 1, true), MAT.iron, `rune_band_${i}`);
  band.position.set(0, y, 0);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    const rune = mesh(new THREE.BoxGeometry(0.014, 0.03, 0.006), MAT.brass, `rune_${i}_${k}`);
    rune.position.set(Math.sin(a) * (r + 0.012), y, Math.cos(a) * (r + 0.012));
    rune.rotation.y = a;
    rune.rotation.z = (k % 2 ? 0.5 : -0.4);
  }
});

// ---- head collar ---------------------------------------------------------
mesh(new THREE.CylinderGeometry(0.066, 0.052, 0.12, 28), MAT.iron, 'head_collar')
  .position.set(0, SHAFT_TOP + 0.04, 0);
mesh(new THREE.TorusGeometry(0.068, 0.016, 12, 30), MAT.brass, 'collar_ring')
  .position.set(0, SHAFT_TOP + 0.10, 0);
staff.getObjectByName('collar_ring').rotation.x = Math.PI / 2;

// ---- cradle horns --------------------------------------------------------
const CORE_Y = 1.86;
const horn = (angle, len, name) => {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, SHAFT_TOP + 0.08, 0),
    new THREE.Vector3(0.14, SHAFT_TOP + 0.20, 0),
    new THREE.Vector3(0.245, CORE_Y + 0.03, 0),
    new THREE.Vector3(0.165, CORE_Y + 0.20 * len, 0),
    new THREE.Vector3(0.050, CORE_Y + 0.27 * len, 0)
  ]);
  const h = mesh(new THREE.TubeGeometry(curve, 44, 0.034, 16, false), MAT.iron, name);
  h.rotation.y = angle;
  const tip = mesh(new THREE.SphereGeometry(0.031, 16, 12), MAT.brass, name + '_tip');
  const p = curve.getPoint(1);
  tip.position.set(Math.sin(angle) * p.x, p.y, Math.cos(angle) * p.x);
  return h;
};
horn(Math.PI / 2, 1.0, 'horn_front');
horn(-Math.PI / 2, 1.0, 'horn_back');
horn(Math.PI, 0.72, 'horn_left');
horn(0, 0.72, 'horn_right');

// ---- floating arcane core -----------------------------------------------
const core = mesh(new THREE.OctahedronGeometry(0.115, 0), MAT.crystal, 'arcane_core');
core.position.set(0, CORE_Y, 0);
core.scale.set(1, 1.45, 1);
core.rotation.y = Math.PI / 6;

// six elemental stones set into the brass halo
const ELEMENTS = [
  ['fire', MAT.fire], ['frost', MAT.frost], ['storm', MAT.storm],
  ['stone', MAT.stone], ['life', MAT.life], ['arcane', MAT.crystal]
];
const HALO_R = 0.135;
const CROWN_Y = SHAFT_TOP + 0.02;
ELEMENTS.forEach(([name, mat], i) => {
  const a = (i / ELEMENTS.length) * Math.PI * 2;
  const x = Math.sin(a) * HALO_R, z = Math.cos(a) * HALO_R;
  const setting = mesh(new THREE.CylinderGeometry(0.036, 0.044, 0.034, 20), MAT.brass, `setting_${name}`);
  setting.position.set(x, CROWN_Y, z);
  const gem = mesh(new THREE.OctahedronGeometry(0.040, 0), mat, `gem_${name}`);
  gem.position.set(x, CROWN_Y + 0.048, z);
  gem.scale.set(1, 1.5, 1);
  gem.rotation.y = a;
});

const halo = mesh(new THREE.TorusGeometry(HALO_R, 0.015, 12, 48), MAT.brass, 'element_crown');
halo.position.set(0, CROWN_Y - 0.006, 0);
halo.rotation.x = Math.PI / 2;

// ---- hanging charm -------------------------------------------------------
const loop = mesh(new THREE.TorusGeometry(0.030, 0.007, 10, 24), MAT.brass, 'charm_loop');
loop.position.set(0.062, SHAFT_TOP - 0.13, 0);
loop.rotation.y = Math.PI / 2;
const bead = mesh(new THREE.SphereGeometry(0.026, 18, 14), MAT.crystal, 'charm_bead');
bead.position.set(0.062, SHAFT_TOP - 0.19, 0);
bead.scale.set(1, 1.25, 1);

stage.setObject(staff);
