import * as THREE from 'three';

const stage = document.querySelector('three-d-stage');
await stage.ready;

const MAT = {
  granite: new THREE.MeshStandardMaterial({ name: 'mossy_granite', color: 0x8d8b83, roughness: 0.97, metalness: 0.0 }),
  oak: new THREE.MeshStandardMaterial({ name: 'dark_oak', color: 0x5b4128, roughness: 0.93, metalness: 0.0 }),
  iron: new THREE.MeshStandardMaterial({ name: 'forged_iron', color: 0x5f646b, roughness: 0.5, metalness: 0.35 }),
  brass: new THREE.MeshStandardMaterial({ name: 'old_brass', color: 0xc79a45, roughness: 0.36, metalness: 0.38 }),
  moss: new THREE.MeshStandardMaterial({
    name: 'living_moss', color: 0x5f9c3c, emissive: 0x2c6b22, emissiveIntensity: 0.45, roughness: 0.85, metalness: 0.0
  })
};

const maul = new THREE.Group();
maul.name = 'grovewarden_maul';

const mesh = (geo, mat, name) => {
  const m = new THREE.Mesh(geo, mat);
  m.name = name;
  m.castShadow = true;
  m.receiveShadow = true;
  maul.add(m);
  return m;
};

// ---- haft ----------------------------------------------------------------
const HEAD_Y = 1.30;
const haftCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 0.06, 0),
  new THREE.Vector3(0.02, 0.45, 0.015),
  new THREE.Vector3(-0.015, 0.90, -0.01),
  new THREE.Vector3(0, HEAD_Y + 0.14, 0)
]);
mesh(new THREE.TubeGeometry(haftCurve, 70, 0.038, 18, false), MAT.oak, 'haft');

// root knuckles
[0.22, 0.47, 0.70].forEach((t, i) => {
  const p = haftCurve.getPointAt(t);
  const k = mesh(new THREE.SphereGeometry(0.049, 16, 12), MAT.oak, `haft_knuckle_${i}`);
  k.position.copy(p);
  k.scale.set(1, 0.55, 0.95);
  k.rotation.y = i * 0.9;
});

// grip binding
for (let i = 0; i < 14; i++) {
  const t = 0.06 + i * 0.0165;
  const p = haftCurve.getPointAt(t);
  const tan = haftCurve.getTangentAt(t);
  const ring = mesh(new THREE.TorusGeometry(0.044, 0.0095, 10, 24), MAT.iron, `grip_binding_${i}`);
  ring.position.copy(p);
  ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan);
}

// butt cap
mesh(new THREE.CylinderGeometry(0.048, 0.052, 0.10, 22), MAT.iron, 'butt_cap')
  .position.set(0, 0.05, 0);
const buttRing = mesh(new THREE.TorusGeometry(0.050, 0.010, 10, 26), MAT.brass, 'butt_ring');
buttRing.position.set(0, 0.10, 0);
buttRing.rotation.x = Math.PI / 2;

// ---- stone head ----------------------------------------------------------
const head = mesh(new THREE.BoxGeometry(0.42, 0.26, 0.25), MAT.granite, 'stone_head');
head.position.set(0, HEAD_Y, 0);

// chipped corner chunks
[[0.19, 0.10, 0.10], [-0.20, -0.09, -0.09], [0.18, -0.10, -0.10]].forEach(([x, y, z], i) => {
  const chip = mesh(new THREE.DodecahedronGeometry(0.055, 0), MAT.granite, `stone_chip_${i}`);
  chip.position.set(x, HEAD_Y + y, z);
  chip.rotation.set(i * 0.7, i * 1.1, i * 0.4);
});

// striking faces + brass cores
[-1, 1].forEach((side, i) => {
  const face = mesh(new THREE.BoxGeometry(0.035, 0.26, 0.25), MAT.iron, `strike_face_${i}`);
  face.position.set(side * 0.218, HEAD_Y, 0);
  const boss = mesh(new THREE.CylinderGeometry(0.058, 0.062, 0.028, 24), MAT.brass, `face_boss_${i}`);
  boss.position.set(side * 0.242, HEAD_Y, 0);
  boss.rotation.z = Math.PI / 2;
  const runeStone = mesh(new THREE.OctahedronGeometry(0.036, 0), MAT.moss, `face_rune_${i}`);
  runeStone.position.set(side * 0.262, HEAD_Y, 0);
  runeStone.scale.set(0.7, 1, 1);
  runeStone.rotation.z = Math.PI / 2;
});

// iron straps over the stone
[-0.118, 0.118].forEach((x, i) => {
  const parts = [
    [0.048, 0.020, 0.262, x, 0.141, 0],
    [0.048, 0.020, 0.262, x, -0.141, 0],
    [0.048, 0.262, 0.020, x, 0, 0.136],
    [0.048, 0.262, 0.020, x, 0, -0.136]
  ];
  parts.forEach(([w, h, d, px, py, pz], k) => {
    const strap = mesh(new THREE.BoxGeometry(w, h, d), MAT.iron, `head_strap_${i}_${k}`);
    strap.position.set(px, HEAD_Y + py, pz);
  });
  [[0.132, 0.128], [0.132, -0.128], [-0.132, 0.128], [-0.132, -0.128]].forEach(([py, pz], k) => {
    const rivet = mesh(new THREE.SphereGeometry(0.017, 14, 10), MAT.brass, `strap_rivet_${i}_${k}`);
    rivet.position.set(x, HEAD_Y + py, pz);
  });
});

// wedge collar where haft meets stone
mesh(new THREE.CylinderGeometry(0.062, 0.075, 0.09, 20), MAT.iron, 'head_collar')
  .position.set(0, HEAD_Y - 0.165, 0);
mesh(new THREE.ConeGeometry(0.052, 0.10, 20), MAT.iron, 'head_finial')
  .position.set(0, HEAD_Y + 0.20, 0);

// ---- creeping moss -------------------------------------------------------
[[0.10, 0.11, 0.13, 1.25], [-0.13, -0.08, 0.13, 0.95], [0.02, 0.14, -0.13, 1.10], [-0.06, 0.02, 0.135, 0.8], [0.16, 0.13, 0.02, 0.9]]
  .forEach(([x, y, z, s], i) => {
    const patch = mesh(new THREE.IcosahedronGeometry(0.052, 0), MAT.moss, `moss_patch_${i}`);
    patch.position.set(x, HEAD_Y + y, z);
    patch.scale.set(s, s * 0.42, s);
    patch.rotation.set(i * 0.6, i, 0.3);
  });

const vine = mesh(new THREE.TorusGeometry(0.07, 0.010, 8, 22, Math.PI * 1.4), MAT.moss, 'haft_vine');
vine.position.set(0, HEAD_Y - 0.30, 0);
vine.rotation.set(1.2, 0.4, 0);

stage.setObject(maul);
