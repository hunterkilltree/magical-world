import * as THREE from 'three';

const stage = document.querySelector('three-d-stage');
await stage.ready;

const MAT = {
  driftwood: new THREE.MeshStandardMaterial({ name: 'driftwood', color: 0x6d5b47, roughness: 0.95, metalness: 0.0 }),
  twine: new THREE.MeshStandardMaterial({ name: 'twine', color: 0xb09767, roughness: 1.0, metalness: 0.0 }),
  iron: new THREE.MeshStandardMaterial({ name: 'black_iron', color: 0x5f646b, roughness: 0.5, metalness: 0.35 }),
  brass: new THREE.MeshStandardMaterial({ name: 'tarnished_brass', color: 0xbf8f3e, roughness: 0.4, metalness: 0.38 }),
  ember: new THREE.MeshStandardMaterial({
    name: 'ember_core', color: 0xff8a34, emissive: 0xe03d05, emissiveIntensity: 1.0, roughness: 0.25, metalness: 0.05
  }),
  cinder: new THREE.MeshStandardMaterial({ name: 'cinder', color: 0x33261f, roughness: 0.9, metalness: 0.05 })
};

const staff = new THREE.Group();
staff.name = 'ember_lantern_staff';

const mesh = (geo, mat, name) => {
  const m = new THREE.Mesh(geo, mat);
  m.name = name;
  m.castShadow = true;
  m.receiveShadow = true;
  staff.add(m);
  return m;
};

// ---- crooked shaft -------------------------------------------------------
const shaftCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0.00, 0.10, 0.00),
  new THREE.Vector3(0.045, 0.50, -0.03),
  new THREE.Vector3(-0.03, 0.95, 0.035),
  new THREE.Vector3(0.05, 1.36, -0.01),
  new THREE.Vector3(0.00, 1.64, 0.00)
]);
mesh(new THREE.TubeGeometry(shaftCurve, 90, 0.044, 20, false), MAT.driftwood, 'shaft');

// gnarls
[0.14, 0.33, 0.62, 0.78].forEach((t, i) => {
  const p = shaftCurve.getPointAt(t);
  const g = mesh(new THREE.SphereGeometry(0.058, 18, 14), MAT.driftwood, `gnarl_${i}`);
  g.position.copy(p);
  g.scale.set(1, 0.62, 0.92);
  g.rotation.set(0.3 * i, 0.7 * i, 0.2 * i);
});

// broken twig stubs
[[0.55, 0.9], [0.71, 3.6], [0.86, 2.1]].forEach(([t, a], i) => {
  const p = shaftCurve.getPointAt(t);
  const twig = mesh(new THREE.ConeGeometry(0.017, 0.14, 10), MAT.driftwood, `twig_${i}`);
  twig.position.set(p.x + Math.sin(a) * 0.06, p.y + 0.035, p.z + Math.cos(a) * 0.06);
  twig.rotation.set(Math.PI / 2 - 0.7, 0, -a);
  twig.rotation.z = -a;
  twig.rotateX(1.1);
});

// ---- twine bindings ------------------------------------------------------
[[0.24, 5], [0.45, 7], [0.93, 5]].forEach(([t, count], b) => {
  for (let i = 0; i < count; i++) {
    const tt = t + i * 0.012;
    const p = shaftCurve.getPointAt(Math.min(tt, 0.995));
    const tan = shaftCurve.getTangentAt(Math.min(tt, 0.995));
    const ring = mesh(new THREE.TorusGeometry(0.050, 0.0095, 10, 26), MAT.twine, `binding_${b}_${i}`);
    ring.position.copy(p);
    ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan);
  }
});

// ---- iron shoe -----------------------------------------------------------
mesh(new THREE.CylinderGeometry(0.050, 0.038, 0.16, 22), MAT.iron, 'iron_shoe')
  .position.set(0, 0.08, 0);
mesh(new THREE.SphereGeometry(0.038, 20, 14), MAT.iron, 'shoe_toe')
  .position.set(0, 0.040, 0);
const shoeRing = mesh(new THREE.TorusGeometry(0.051, 0.010, 10, 26), MAT.brass, 'shoe_ring');
shoeRing.position.set(0, 0.155, 0);
shoeRing.rotation.x = Math.PI / 2;

// ---- lantern cage --------------------------------------------------------
const CAGE_BOTTOM = 1.62, CAGE_TOP = 2.04, CAGE_R = 0.145;
const base = mesh(new THREE.CylinderGeometry(0.075, 0.055, 0.10, 24), MAT.iron, 'cage_base');
base.position.set(0, CAGE_BOTTOM + 0.03, 0);
[[CAGE_BOTTOM + 0.075, 0.108], [CAGE_TOP - 0.055, 0.098]].forEach(([y, r], i) => {
  const ring = mesh(new THREE.TorusGeometry(r, 0.013, 12, 34), MAT.brass, `cage_ring_${i}`);
  ring.position.set(0, y, 0);
  ring.rotation.x = Math.PI / 2;
});

for (let i = 0; i < 5; i++) {
  const a = (i / 5) * Math.PI * 2;
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.055, CAGE_BOTTOM + 0.06, 0),
    new THREE.Vector3(CAGE_R, CAGE_BOTTOM + 0.17, 0),
    new THREE.Vector3(CAGE_R * 0.92, CAGE_TOP - 0.14, 0),
    new THREE.Vector3(0.055, CAGE_TOP - 0.03, 0)
  ]);
  const bar = mesh(new THREE.TubeGeometry(curve, 30, 0.014, 10, false), MAT.iron, `cage_bar_${i}`);
  bar.rotation.y = a;
}

const cap = mesh(new THREE.ConeGeometry(0.072, 0.10, 24), MAT.iron, 'cage_cap');
cap.position.set(0, CAGE_TOP + 0.02, 0);
const finial = mesh(new THREE.SphereGeometry(0.030, 18, 14), MAT.brass, 'cage_finial');
finial.position.set(0, CAGE_TOP + 0.095, 0);

// ---- caged ember ---------------------------------------------------------
const orb = mesh(new THREE.IcosahedronGeometry(0.092, 1), MAT.ember, 'ember_orb');
orb.position.set(0, (CAGE_BOTTOM + CAGE_TOP) / 2 - 0.01, 0);

const cradleBase = mesh(new THREE.CylinderGeometry(0.052, 0.038, 0.05, 20), MAT.cinder, 'ash_bed');
cradleBase.position.set(0, CAGE_BOTTOM + 0.11, 0);

[[0.55, 0.11, 0.9], [2.4, -0.09, 0.7], [4.5, 0.02, 0.8]].forEach(([a, dy, s], i) => {
  const cinder = mesh(new THREE.TetrahedronGeometry(0.028, 0), MAT.cinder, `cinder_${i}`);
  cinder.position.set(Math.sin(a) * 0.10, (CAGE_BOTTOM + CAGE_TOP) / 2 + dy, Math.cos(a) * 0.10);
  cinder.scale.setScalar(s);
  cinder.rotation.set(a, a * 0.7, 0.4);
});

// ---- hanging rune tag ----------------------------------------------------
const hook = mesh(new THREE.TorusGeometry(0.026, 0.006, 10, 24, Math.PI * 1.5), MAT.brass, 'tag_hook');
hook.position.set(0.075, CAGE_BOTTOM - 0.02, 0);
hook.rotation.y = Math.PI / 2;
const tag = mesh(new THREE.BoxGeometry(0.052, 0.075, 0.010), MAT.brass, 'rune_tag');
tag.position.set(0.082, CAGE_BOTTOM - 0.10, 0);
tag.rotation.set(0.12, 0.35, 0.16);

stage.setObject(staff);
