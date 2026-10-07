import * as THREE from 'three';

const stage = document.querySelector('three-d-stage');
await stage.ready;

const MAT = {
  blade: new THREE.MeshStandardMaterial({ name: 'pattern_steel', color: 0xc3cad3, roughness: 0.26, metalness: 0.4 }),
  iron: new THREE.MeshStandardMaterial({ name: 'dark_iron', color: 0x6b7078, roughness: 0.48, metalness: 0.35 }),
  brass: new THREE.MeshStandardMaterial({ name: 'old_brass', color: 0xd2a44b, roughness: 0.34, metalness: 0.38 }),
  leather: new THREE.MeshStandardMaterial({ name: 'oxblood_leather', color: 0x5c2a26, roughness: 0.92, metalness: 0.0 }),
  storm: new THREE.MeshStandardMaterial({
    name: 'storm_inlay', color: 0xf6e173, emissive: 0xd6a012, emissiveIntensity: 0.95, roughness: 0.2, metalness: 0.1
  })
};

const sword = new THREE.Group();
sword.name = 'thunderfang_greatsword';

const mesh = (geo, mat, name) => {
  const m = new THREE.Mesh(geo, mat);
  m.name = name;
  m.castShadow = true;
  m.receiveShadow = true;
  sword.add(m);
  return m;
};

// ---- blade ---------------------------------------------------------------
const BLADE_BASE = 0.55, BLADE_LEN = 1.02, W = 0.062;
const shape = new THREE.Shape();
shape.moveTo(-W, 0);
shape.lineTo(-W * 0.98, BLADE_LEN * 0.66);
shape.quadraticCurveTo(-W * 0.80, BLADE_LEN * 0.90, -0.012, BLADE_LEN * 0.985);
shape.lineTo(0, BLADE_LEN);
shape.lineTo(0.012, BLADE_LEN * 0.985);
shape.quadraticCurveTo(W * 0.80, BLADE_LEN * 0.90, W * 0.98, BLADE_LEN * 0.66);
shape.lineTo(W, 0);
shape.lineTo(-W, 0);

const blade = mesh(new THREE.ExtrudeGeometry(shape, {
  depth: 0.020, bevelEnabled: true, bevelThickness: 0.009, bevelSize: 0.011, bevelSegments: 3, curveSegments: 24
}), MAT.blade, 'blade');
blade.position.set(0, BLADE_BASE, -0.010);

// fuller + storm inlay, both faces
[-1, 1].forEach((side, i) => {
  const fuller = mesh(new THREE.BoxGeometry(0.030, BLADE_LEN * 0.70, 0.006), MAT.iron, `fuller_${i}`);
  fuller.position.set(0, BLADE_BASE + BLADE_LEN * 0.36, side * 0.0165);
  const inlay = mesh(new THREE.BoxGeometry(0.011, BLADE_LEN * 0.66, 0.005), MAT.storm, `storm_inlay_${i}`);
  inlay.position.set(0, BLADE_BASE + BLADE_LEN * 0.36, side * 0.0185);
  for (let k = 0; k < 4; k++) {
    const glyph = mesh(new THREE.BoxGeometry(0.030, 0.014, 0.004), MAT.storm, `blade_rune_${i}_${k}`);
    glyph.position.set(0, BLADE_BASE + 0.14 + k * 0.19, side * 0.0182);
    glyph.rotation.z = k % 2 ? 0.5 : -0.5;
  }
});

// ---- ricasso + crossguard ------------------------------------------------
mesh(new THREE.BoxGeometry(0.062, 0.075, 0.048), MAT.iron, 'ricasso')
  .position.set(0, BLADE_BASE - 0.02, 0);

const guard = mesh(new THREE.BoxGeometry(0.44, 0.046, 0.062), MAT.iron, 'crossguard');
guard.position.set(0, BLADE_BASE - 0.055, 0);
[-1, 1].forEach((side, i) => {
  const wing = mesh(new THREE.ConeGeometry(0.043, 0.10, 4), MAT.iron, `guard_wing_${i}`);
  wing.position.set(side * 0.245, BLADE_BASE - 0.055, 0);
  wing.rotation.z = side * Math.PI / 2;
  wing.rotation.y = Math.PI / 4;
  const stud = mesh(new THREE.SphereGeometry(0.022, 18, 14), MAT.brass, `guard_stud_${i}`);
  stud.position.set(side * 0.155, BLADE_BASE - 0.055, 0.032);
  const stud2 = mesh(new THREE.SphereGeometry(0.022, 18, 14), MAT.brass, `guard_stud_back_${i}`);
  stud2.position.set(side * 0.155, BLADE_BASE - 0.055, -0.032);
});
const guardGem = mesh(new THREE.OctahedronGeometry(0.036, 0), MAT.storm, 'guard_gem');
guardGem.position.set(0, BLADE_BASE - 0.055, 0.040);
guardGem.rotation.x = Math.PI / 2;
guardGem.scale.set(1, 0.6, 1);

// ---- grip ----------------------------------------------------------------
mesh(new THREE.CylinderGeometry(0.024, 0.026, 0.40, 22), MAT.leather, 'grip_core')
  .position.set(0, 0.30, 0);
for (let i = 0; i < 12; i++) {
  const ring = mesh(new THREE.TorusGeometry(0.027, 0.0055, 8, 24), MAT.leather, `grip_cord_${i}`);
  ring.position.set(0, 0.135 + i * 0.031, 0);
  ring.rotation.x = Math.PI / 2 + 0.12;
  ring.rotation.z = i * 0.4;
}
[0.115, 0.487].forEach((y, i) => {
  const band = mesh(new THREE.TorusGeometry(0.028, 0.008, 10, 26), MAT.brass, `grip_ferrule_${i}`);
  band.position.set(0, y, 0);
  band.rotation.x = Math.PI / 2;
});

// ---- pommel --------------------------------------------------------------
mesh(new THREE.SphereGeometry(0.055, 24, 18), MAT.iron, 'pommel')
  .position.set(0, 0.062, 0);
sword.getObjectByName('pommel').scale.set(1, 0.85, 1);
const pommelCap = mesh(new THREE.CylinderGeometry(0.030, 0.036, 0.026, 20), MAT.brass, 'pommel_cap');
pommelCap.position.set(0, 0.013, 0);
const pommelGem = mesh(new THREE.OctahedronGeometry(0.026, 0), MAT.storm, 'pommel_gem');
pommelGem.position.set(0, 0.062, 0.052);
pommelGem.rotation.x = Math.PI / 2;
pommelGem.scale.set(1, 0.55, 1);

stage.setObject(sword);
