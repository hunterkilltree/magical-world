import * as THREE from 'three';

const stage = document.querySelector('three-d-stage');
await stage.ready;

const MAT = {
  birch: new THREE.MeshStandardMaterial({ name: 'pale_birch', color: 0xd9d0be, roughness: 0.88, metalness: 0.0 }),
  wrap: new THREE.MeshStandardMaterial({ name: 'blue_wrap', color: 0x36485e, roughness: 0.9, metalness: 0.0 }),
  steel: new THREE.MeshStandardMaterial({ name: 'cold_steel', color: 0xa9b3bd, roughness: 0.34, metalness: 0.4 }),
  rime: new THREE.MeshStandardMaterial({
    name: 'rime_glass', color: 0xa8e6f7, emissive: 0x2b8fb8, emissiveIntensity: 0.6, roughness: 0.1, metalness: 0.08
  }),
  deepice: new THREE.MeshStandardMaterial({
    name: 'deep_ice', color: 0x4f9fd4, emissive: 0x1a5f96, emissiveIntensity: 0.7, roughness: 0.15, metalness: 0.05
  })
};

const staff = new THREE.Group();
staff.name = 'rimeglass_scepter';

const mesh = (geo, mat, name) => {
  const m = new THREE.Mesh(geo, mat);
  m.name = name;
  m.castShadow = true;
  m.receiveShadow = true;
  staff.add(m);
  return m;
};

// ---- straight birch haft -------------------------------------------------
const HAFT_BOTTOM = 0.16, HAFT_TOP = 1.34;
const pts = [];
for (let i = 0; i <= 32; i++) {
  const t = i / 32;
  const r = 0.040 - 0.007 * t + 0.0012 * Math.sin(t * 26);
  pts.push(new THREE.Vector2(r, HAFT_BOTTOM + t * (HAFT_TOP - HAFT_BOTTOM)));
}
mesh(new THREE.LatheGeometry(pts, 32), MAT.birch, 'haft');

// facet flats — thin steel splints running the haft
for (let i = 0; i < 3; i++) {
  const a = (i / 3) * Math.PI * 2 + 0.4;
  const splint = mesh(new THREE.BoxGeometry(0.014, 0.62, 0.006), MAT.steel, `splint_${i}`);
  splint.position.set(Math.sin(a) * 0.040, HAFT_BOTTOM + 0.72, Math.cos(a) * 0.040);
  splint.rotation.y = a;
}

// ---- butt spike ----------------------------------------------------------
mesh(new THREE.ConeGeometry(0.046, 0.20, 22), MAT.steel, 'butt_spike')
  .position.set(0, 0.10, 0);
const buttRing = mesh(new THREE.TorusGeometry(0.046, 0.011, 10, 26), MAT.steel, 'butt_ring');
buttRing.position.set(0, 0.195, 0);
buttRing.rotation.x = Math.PI / 2;
const buttGem = mesh(new THREE.OctahedronGeometry(0.030, 0), MAT.deepice, 'butt_gem');
buttGem.position.set(0, 0.245, 0);
buttGem.scale.set(1, 1.3, 1);

// ---- grip wrap -----------------------------------------------------------
for (let i = 0; i <= 18; i++) {
  const y = 0.44 + i * 0.0175;
  const ring = mesh(new THREE.TorusGeometry(0.044, 0.0105, 10, 26), MAT.wrap, `grip_wrap_${i}`);
  ring.position.set(0, y, 0);
  ring.rotation.x = Math.PI / 2 + 0.1;
  ring.rotation.z = i * 0.42;
}
[0.425, 0.79].forEach((y, i) => {
  const band = mesh(new THREE.TorusGeometry(0.045, 0.009, 10, 26), MAT.steel, `grip_band_${i}`);
  band.position.set(0, y, 0);
  band.rotation.x = Math.PI / 2;
});

// ---- head mount ----------------------------------------------------------
mesh(new THREE.CylinderGeometry(0.058, 0.036, 0.13, 26), MAT.steel, 'head_socket')
  .position.set(0, HAFT_TOP + 0.045, 0);
const collar = mesh(new THREE.TorusGeometry(0.060, 0.014, 12, 30), MAT.steel, 'socket_collar');
collar.position.set(0, HAFT_TOP + 0.10, 0);
collar.rotation.x = Math.PI / 2;

// ---- frozen core ---------------------------------------------------------
const CORE_Y = HAFT_TOP + 0.24;
const core = mesh(new THREE.IcosahedronGeometry(0.098, 0), MAT.deepice, 'frozen_core');
core.position.set(0, CORE_Y, 0);
core.scale.set(1, 1.12, 1);

// ---- rime shard crown ----------------------------------------------------
const spike = mesh(new THREE.OctahedronGeometry(0.062, 0), MAT.rime, 'main_shard');
spike.position.set(0, CORE_Y + 0.30, 0);
spike.scale.set(0.8, 4.4, 0.8);

for (let i = 0; i < 6; i++) {
  const a = (i / 6) * Math.PI * 2 + 0.25;
  const long = i % 2 === 0;
  const shard = mesh(new THREE.OctahedronGeometry(0.048, 0), MAT.rime, `shard_${i}`);
  const lean = long ? 0.30 : 0.44;
  shard.position.set(Math.sin(a) * (long ? 0.10 : 0.13), CORE_Y + (long ? 0.20 : 0.11), Math.cos(a) * (long ? 0.10 : 0.13));
  shard.scale.set(0.62, long ? 3.4 : 2.1, 0.62);
  shard.rotation.set(Math.cos(a) * lean, a, -Math.sin(a) * lean);
}

// downward icicles under the core
for (let i = 0; i < 4; i++) {
  const a = (i / 4) * Math.PI * 2 + 0.8;
  const ice = mesh(new THREE.ConeGeometry(0.020, 0.14 + (i % 2) * 0.07, 10), MAT.rime, `icicle_${i}`);
  ice.position.set(Math.sin(a) * 0.072, CORE_Y - 0.13 - (i % 2) * 0.035, Math.cos(a) * 0.072);
  ice.rotation.set(Math.PI + Math.cos(a) * 0.16, 0, -Math.sin(a) * 0.16);
}

stage.setObject(staff);
