// Procedural three.js models for the arena, enemies and props. No game logic.
import * as THREE from 'three';

const cache = {};
export const mat = (name, o) => (cache[name] ||= new THREE.MeshStandardMaterial({ name, ...o }));
const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

function put(parent, geo, m, pos, rot, scale, shadow = true) {
  const o = new THREE.Mesh(geo, m);
  o.castShadow = shadow; o.receiveShadow = true;
  if (pos) o.position.set(...pos);
  if (rot) o.rotation.set(...rot);
  if (scale) o.scale.set(...scale);
  parent.add(o);
  return o;
}

function floorTexture(radius) {
  const S = 1024, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d'), rand = rng(7), cx = S / 2, px = S / (radius * 2);
  g.fillStyle = '#3f3a4b'; g.fillRect(0, 0, S, S);
  for (let r0 = 0.9; r0 < radius; r0 += 1.25) {
    const r1 = r0 + 1.25, n = Math.max(6, Math.round((2 * Math.PI * (r0 + 0.6)) / 1.5)), off = rand() * 6;
    for (let i = 0; i < n; i++) {
      const a0 = off + (i / n) * Math.PI * 2, a1 = off + ((i + 1) / n) * Math.PI * 2;
      g.fillStyle = `hsl(${250 + rand() * 18}, ${7 + rand() * 6}%, ${27 + rand() * 9}%)`;
      g.beginPath(); g.arc(cx, cx, r1 * px, a0, a1); g.arc(cx, cx, r0 * px, a1, a0, true); g.closePath(); g.fill();
      g.strokeStyle = '#25212e'; g.lineWidth = 3; g.stroke();
    }
  }
  g.fillStyle = '#332e3d'; g.beginPath(); g.arc(cx, cx, 0.9 * px, 0, 7); g.fill();
  g.strokeStyle = 'rgba(201,162,39,.6)'; g.lineWidth = 4;
  [4.55, 5.15].forEach((r) => { g.beginPath(); g.arc(cx, cx, r * px, 0, 7); g.stroke(); });
  g.lineWidth = 3;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * 4.55 * px, cx + Math.sin(a) * 4.55 * px);
    g.lineTo(cx + Math.cos(a + 0.08) * 5.15 * px, cx + Math.sin(a + 0.08) * 5.15 * px);
    g.stroke();
  }
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(${rand() < 0.5 ? '18,14,26' : '130,120,140'},${rand() * 0.08})`;
    g.fillRect(rand() * S, rand() * S, 2 + rand() * 3, 2 + rand() * 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function buildArena(R, props, gates) {
  const g = new THREE.Group();
  const rand = rng(31);
  put(g, new THREE.CircleGeometry(R + 1.2, 96), new THREE.MeshStandardMaterial({ map: floorTexture(R + 1.2), roughness: 0.9, metalness: 0.02 }),
    [0, 0, 0], [-Math.PI / 2, 0, 0], null, false);
  put(g, new THREE.CylinderGeometry(R + 1.2, R + 1.8, 1, 64, 1, true), mat('court_rim', { color: 0x231e2c, roughness: 1 }), [0, -0.5, 0], null, null, false);
  put(g, new THREE.CircleGeometry(90, 48), mat('outer_ground', { color: 0x1b1824, roughness: 1 }), [0, -0.6, 0], [-Math.PI / 2, 0, 0], null, false);

  const stone = mat('wall_stone', { color: 0x5d566a, roughness: 0.95, flatShading: true });
  const stoneDark = mat('wall_stone_dark', { color: 0x463f52, roughness: 0.95, flatShading: true });
  const iron = mat('gate_iron', { color: 0x3b3640, roughness: 0.55, metalness: 0.5 });
  const brass = mat('arena_brass', { color: 0xc9a227, roughness: 0.4, metalness: 0.45 });
  const coal = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff8a3a).multiplyScalar(2.2), toneMapped: false });

  const N = 40, rr = R + 0.85;
  for (let i = 0; i < N; i++) {
    const a = ((i + 0.5) / N) * Math.PI * 2;
    if (gates.some((gt) => Math.abs(Math.atan2(Math.sin(a - gt.a), Math.cos(a - gt.a))) < 0.15)) continue;
    const w = (2 * Math.PI * rr) / N + 0.05, h = 2.1 + rand() * 0.7;
    put(g, new THREE.BoxGeometry(w, h, 1.3), i % 3 ? stone : stoneDark, [Math.sin(a) * rr, h / 2, -Math.cos(a) * rr], [0, -a, 0]);
    if (i % 2 === 0) put(g, new THREE.BoxGeometry(w * 0.45, 0.45, 1.3), stone, [Math.sin(a) * rr, h + 0.22, -Math.cos(a) * rr], [0, -a, 0]);
  }

  const braziers = [];
  for (const gt of gates) {
    const G = new THREE.Group();
    G.position.set(Math.sin(gt.a) * rr, 0, -Math.cos(gt.a) * rr);
    G.rotation.y = -gt.a;
    g.add(G);
    [-1, 1].forEach((sd) => {
      put(G, new THREE.BoxGeometry(1.0, 3.6, 1.6), stoneDark, [sd * 2.75, 1.8, 0]);
      put(G, new THREE.BoxGeometry(1.2, 0.3, 1.8), stone, [sd * 2.75, 3.75, 0]);
      put(G, new THREE.CylinderGeometry(0.06, 0.09, 1.1, 8), iron, [sd * 2.75, 0.55, 1.2]);
      put(G, new THREE.CylinderGeometry(0.32, 0.18, 0.28, 12), iron, [sd * 2.75, 1.2, 1.2]);
      put(G, new THREE.SphereGeometry(0.2, 10, 8), coal, [sd * 2.75, 1.32, 1.2], null, null, false);
      const light = new THREE.PointLight(0xff8a3a, 16, 11, 2);
      light.position.set(sd * 2.75, 1.9, 1.35);
      G.add(light);
      braziers.push({ light, local: new THREE.Vector3(sd * 2.75, 1.45, 1.2), group: G });
    });
    put(G, new THREE.BoxGeometry(6.6, 0.7, 1.6), stone, [0, 3.95, 0]);
    for (let k = -4; k <= 4; k++) put(G, new THREE.BoxGeometry(0.08, 1.2, 0.08), iron, [k * 0.5, 3.0, -0.3]);
    put(G, new THREE.BoxGeometry(4.6, 0.1, 0.1), iron, [0, 2.45, -0.3]);
    put(G, new THREE.RingGeometry(1.1, 1.22, 40), new THREE.MeshBasicMaterial({ color: 0x8a2b2b, transparent: true, opacity: 0.6, depthWrite: false }),
      [0, 0.015, rr - 13.2], [-Math.PI / 2, 0, 0], null, false);
  }

  const pine = mat('pine_dark', { color: 0x1c2a27, roughness: 1, flatShading: true });
  for (let i = 0; i < 54; i++) {
    const a = rand() * Math.PI * 2, r = R + 4 + rand() * 16, s = 1.3 + rand() * 1.8;
    const x = Math.sin(a) * r, z = -Math.cos(a) * r;
    put(g, new THREE.ConeGeometry(0.9 * s, 2.6 * s, 7), pine, [x, 1.0 * s, z]);
    put(g, new THREE.ConeGeometry(0.65 * s, 2.0 * s, 7), pine, [x, 2.2 * s, z]);
  }
  const tower = mat('keep_tower', { color: 0x3a3446, roughness: 0.95, flatShading: true });
  [[-7, -22, 1.8, 10], [8, -23, 1.5, 8], [-17, -12, 1.3, 7]].forEach(([x, z, r, h]) => {
    put(g, new THREE.CylinderGeometry(r, r * 1.08, h, 10), tower, [x, h / 2, z]);
    put(g, new THREE.ConeGeometry(r * 1.3, r * 1.8, 10), stoneDark, [x, h + r * 0.9, z]);
  });

  const pillars = [];
  const rune = mat('pillar_rune', { color: 0x6d28ff, emissive: 0x7c3aff, emissiveIntensity: 1.6, roughness: 0.4 });
  for (const p of props.pillars) {
    const h = 3.2 + rand() * 0.8;
    const m = new THREE.MeshStandardMaterial({ color: 0x6c6578, roughness: 0.9, flatShading: true, transparent: true });
    const G = new THREE.Group();
    g.add(G);
    put(G, new THREE.CylinderGeometry(p.r + 0.15, p.r + 0.25, 0.4, 10), stoneDark, [p.x, 0.2, p.z]);
    put(G, new THREE.CylinderGeometry(p.r * 0.85, p.r, h, 10), m, [p.x, h / 2, p.z]);
    put(G, new THREE.CylinderGeometry(p.r + 0.04, p.r + 0.04, 0.12, 10), rune, [p.x, 1.3, p.z]);
    put(G, new THREE.BoxGeometry(p.r * 2.3, 0.35, p.r * 2.3), m, [p.x, h + 0.17, p.z], [0, rand(), 0]);
    pillars.push({ p, mat: m, h });
  }

  const puddles = new Map();
  for (const p of props.puddles) {
    const m = new THREE.MeshStandardMaterial({ color: 0x24527c, roughness: 0.08, metalness: 0.4, transparent: true, opacity: 0.9 });
    const o = put(g, new THREE.CircleGeometry(p.r, 36), m, [p.x, 0.025, p.z], [-Math.PI / 2, 0, rand() * 3], [1.06, 0.94, 1], false);
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 + rand();
      put(g, new THREE.DodecahedronGeometry(0.09 + rand() * 0.08, 0), stoneDark, [p.x + Math.sin(a) * p.r * 1.03, 0.05, p.z + Math.cos(a) * p.r * 0.96]);
    }
    puddles.set(p.id, { mesh: o, mat: m });
  }

  const brush = new Map();
  for (const b of props.brush) {
    const m = new THREE.MeshStandardMaterial({ color: 0x9c8a4c, roughness: 0.95, flatShading: true });
    const G = new THREE.Group();
    G.position.set(b.x, 0, b.z);
    g.add(G);
    for (let k = 0; k < 24; k++) {
      const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * b.r * 0.85, h = 0.35 + rand() * 0.45;
      put(G, new THREE.ConeGeometry(0.08 + rand() * 0.06, h, 4), m, [Math.sin(a) * r, h / 2, Math.cos(a) * r], [(rand() - 0.5) * 0.4, rand() * 3, (rand() - 0.5) * 0.4]);
    }
    brush.set(b.id, { group: G, mat: m });
  }

  const barrels = new Map();
  const wood = mat('barrel_wood', { color: 0x6e4526, roughness: 0.85 });
  const lid = mat('barrel_lid', { color: 0x4f321c, roughness: 0.9 });
  for (const b of props.barrels) {
    const G = new THREE.Group();
    G.position.set(b.x, 0, b.z);
    g.add(G);
    put(G, new THREE.CylinderGeometry(0.38, 0.34, 0.9, 14), wood, [0, 0.45, 0]);
    [0.18, 0.72].forEach((y) => put(G, new THREE.TorusGeometry(0.378, 0.03, 6, 20), brass, [0, y, 0], [Math.PI / 2, 0, 0]));
    const runeM = new THREE.MeshStandardMaterial({ color: 0xff5a2a, emissive: 0xff4a1a, emissiveIntensity: 1.6 });
    put(G, new THREE.BoxGeometry(0.16, 0.26, 0.04), runeM, [0, 0.46, 0.37]);
    put(G, new THREE.CylinderGeometry(0.33, 0.33, 0.04, 14), lid, [0, 0.91, 0]);
    barrels.set(b.id, { group: G, rune: runeM });
  }

  return { group: g, braziers, pillars, puddles, brush, barrels };
}

export function buildEnemy(kind) {
  const group = new THREE.Group(), body = new THREE.Group();
  group.add(body);
  const mats = [];
  const M = (o) => {
    const m = new THREE.MeshStandardMaterial(o);
    m.userData.e0 = m.emissive.clone();
    m.userData.i0 = m.emissiveIntensity;
    mats.push(m);
    return m;
  };
  const R = { group, body, mats, legs: [], arms: [], kind };

  if (kind === 'thrall') {
    const skin = M({ color: 0x7d8a63, roughness: 0.85 }), rag = M({ color: 0x3e302b, roughness: 0.95, side: THREE.DoubleSide });
    const bone = M({ color: 0xd8ccb0, roughness: 0.8 }), eye = M({ color: 0xff3b2f, emissive: 0xff2a1a, emissiveIntensity: 2.4 });
    [-1, 1].forEach((sd) => {
      const hip = new THREE.Group();
      hip.position.set(sd * 0.14, 0.46, 0);
      body.add(hip);
      put(hip, new THREE.CapsuleGeometry(0.075, 0.3, 4, 8), skin, [0, -0.22, 0]);
      put(hip, new THREE.BoxGeometry(0.13, 0.06, 0.22), skin, [0, -0.44, 0.05]);
      R.legs.push(hip);
    });
    const torso = new THREE.Group();
    torso.position.set(0, 0.5, 0);
    body.add(torso);
    R.torso = torso;
    put(torso, new THREE.CapsuleGeometry(0.22, 0.26, 6, 12), skin, [0, 0.26, 0.06], [0.65, 0, 0], [1.1, 1, 0.9]);
    put(torso, new THREE.ConeGeometry(0.3, 0.34, 8, 1, true), rag, [0, -0.02, 0], [Math.PI, 0, 0]);
    for (let k = 0; k < 3; k++) put(torso, new THREE.ConeGeometry(0.045, 0.2, 5), bone, [0, 0.52 - k * 0.12, -0.1 - k * 0.05], [-0.9, 0, 0]);
    const head = new THREE.Group();
    head.position.set(0, 0.52, 0.3);
    torso.add(head);
    put(head, new THREE.SphereGeometry(0.17, 14, 12), skin, [0, 0, 0], null, [1, 0.9, 1.1]);
    put(head, new THREE.BoxGeometry(0.2, 0.07, 0.14), bone, [0, -0.1, 0.08]);
    [-1, 1].forEach((sd) => {
      put(head, new THREE.SphereGeometry(0.036, 8, 6), eye, [sd * 0.07, 0.03, 0.15]);
      put(head, new THREE.ConeGeometry(0.04, 0.26, 6), bone, [sd * 0.12, 0.15, -0.04], [-0.6, 0, sd * -0.5]);
    });
    [-1, 1].forEach((sd) => {
      const sh = new THREE.Group();
      sh.position.set(sd * 0.27, 0.36, 0.14);
      torso.add(sh);
      put(sh, new THREE.CapsuleGeometry(0.055, 0.42, 4, 8), skin, [0, -0.26, 0.08], [0.3, 0, 0]);
      for (let c = -1; c <= 1; c++) put(sh, new THREE.ConeGeometry(0.02, 0.13, 4), bone, [c * 0.035, -0.53, 0.18], [Math.PI * 0.85, 0, 0]);
      R.arms.push(sh);
    });
    R.height = 1.35; R.iceR = 0.62;
  } else if (kind === 'bulwark') {
    const ironM = M({ color: 0x6e5c4e, roughness: 0.5, metalness: 0.55 }), dark = M({ color: 0x3a3330, roughness: 0.6, metalness: 0.5 });
    const cloth = M({ color: 0x6b2020, roughness: 0.95 }), brassM = M({ color: 0xc9a227, roughness: 0.4, metalness: 0.5 });
    const slit = M({ color: 0xff8a2a, emissive: 0xff7a1a, emissiveIntensity: 2.6 }), woodM = M({ color: 0x5a3c22, roughness: 0.9 });
    [-1, 1].forEach((sd) => {
      const hip = new THREE.Group();
      hip.position.set(sd * 0.22, 0.8, 0);
      body.add(hip);
      put(hip, new THREE.CylinderGeometry(0.13, 0.15, 0.72, 10), dark, [0, -0.38, 0]);
      put(hip, new THREE.BoxGeometry(0.26, 0.14, 0.38), ironM, [0, -0.76, 0.06]);
      R.legs.push(hip);
    });
    const torso = new THREE.Group();
    torso.position.set(0, 0.8, 0);
    body.add(torso);
    R.torso = torso;
    put(torso, new THREE.CylinderGeometry(0.46, 0.38, 0.88, 14), ironM, [0, 0.48, 0]);
    put(torso, new THREE.BoxGeometry(0.66, 0.5, 0.1), ironM, [0, 0.58, 0.39]);
    put(torso, new THREE.BoxGeometry(0.42, 0.7, 0.04), cloth, [0.12, 0.02, 0.41]);
    put(torso, new THREE.TorusGeometry(0.4, 0.04, 8, 24), brassM, [0, 0.1, 0], [Math.PI / 2, 0, 0]);
    [-1, 1].forEach((sd) => put(torso, new THREE.SphereGeometry(0.26, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), ironM, [sd * 0.5, 0.88, 0], [0, 0, sd * 0.4]));
    put(torso, new THREE.CylinderGeometry(0.22, 0.24, 0.38, 12), dark, [0, 1.12, 0.02]);
    put(torso, new THREE.BoxGeometry(0.06, 0.14, 0.42), brassM, [0, 1.36, 0]);
    put(torso, new THREE.BoxGeometry(0.28, 0.045, 0.03), slit, [0, 1.14, 0.24]);
    const shield = new THREE.Group();
    shield.position.set(-0.34, 0.5, 0.56);
    shield.rotation.y = 0.12;
    torso.add(shield);
    put(shield, new THREE.BoxGeometry(0.92, 1.3, 0.1), dark);
    [[0, 0.66, 0.96, 0.07], [0, -0.66, 0.96, 0.07]].forEach(([x, y, w, h]) => put(shield, new THREE.BoxGeometry(w, h, 0.13), brassM, [x, y, 0]));
    [-0.47, 0.47].forEach((x) => put(shield, new THREE.BoxGeometry(0.07, 1.36, 0.13), brassM, [x, 0, 0]));
    put(shield, new THREE.SphereGeometry(0.12, 12, 8), brassM, [0, 0.12, 0.06]);
    put(shield, new THREE.BoxGeometry(0.07, 0.5, 0.02), slit, [0, -0.3, 0.06]);
    R.shield = shield;
    const arm = new THREE.Group();
    arm.position.set(0.55, 0.82, 0.05);
    torso.add(arm);
    put(arm, new THREE.CylinderGeometry(0.1, 0.09, 0.55, 10), ironM, [0, -0.26, 0]);
    put(arm, new THREE.CylinderGeometry(0.045, 0.05, 0.95, 8), woodM, [0, -0.85, 0]);
    put(arm, new THREE.BoxGeometry(0.36, 0.28, 0.28), dark, [0, -1.32, 0]);
    put(arm, new THREE.BoxGeometry(0.38, 0.06, 0.3), brassM, [0, -1.2, 0]);
    R.arms.push(arm);
    R.height = 2.3; R.iceR = 1.0;
  } else {
    const robe = M({ color: 0x1f3d3b, roughness: 0.9, side: THREE.DoubleSide }), inner = M({ color: 0x050909, roughness: 1 });
    const glow = M({ color: 0x5cffb0, emissive: 0x3dffa0, emissiveIntensity: 2.4 }), trim = M({ color: 0x8a7a4a, roughness: 0.5, metalness: 0.4 });
    put(body, new THREE.ConeGeometry(0.46, 1.5, 14, 1, true), robe, [0, 0.95, 0]);
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      put(body, new THREE.ConeGeometry(0.07, 0.3, 4), robe, [Math.sin(a) * 0.42, 0.12, Math.cos(a) * 0.42], [Math.PI, 0, 0]);
    }
    put(body, new THREE.SphereGeometry(0.27, 14, 10), robe, [0, 1.55, 0], null, [1.15, 0.7, 1]);
    put(body, new THREE.TorusGeometry(0.2, 0.03, 8, 22), trim, [0, 1.62, 0.02], [Math.PI / 2, 0, 0]);
    put(body, new THREE.SphereGeometry(0.25, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.65), robe, [0, 1.8, -0.03], [0.28, 0, 0], [1, 1.2, 1.1]);
    put(body, new THREE.SphereGeometry(0.17, 12, 10), inner, [0, 1.75, 0.08]);
    [-1, 1].forEach((sd) => put(body, new THREE.SphereGeometry(0.03, 8, 6), glow, [sd * 0.06, 1.77, 0.23]));
    [-1, 1].forEach((sd) => {
      const h = new THREE.Group();
      h.position.set(sd * 0.44, 1.22, 0.26);
      body.add(h);
      put(h, new THREE.SphereGeometry(0.07, 10, 8), glow, null, null, null, false);
      R.arms.push(h);
    });
    R.orb = put(body, new THREE.IcosahedronGeometry(0.12, 1), glow, [0, 1.25, 0.52], null, null, false);
    R.sigil = put(body, new THREE.TorusGeometry(0.62, 0.02, 6, 44), glow, [0, -0.15, 0], [Math.PI / 2, 0, 0], null, false);
    R.height = 2.35; R.iceR = 0.85; R.float = true;
  }
  return R;
}

export function buildWall(kind, seed) {
  const g = new THREE.Group();
  if (kind === 'wood') {
    const bark = mat('wall_bark', { color: 0x5a3a22, roughness: 0.95, flatShading: true }), leaf = mat('wall_leaf', { color: 0x3f8a3a, roughness: 0.9, flatShading: true });
    put(g, new THREE.CylinderGeometry(0.22, 0.3, 1.9, 7), bark, [0, 0.95, 0], [0.04, seed, 0.05]);
    put(g, new THREE.CylinderGeometry(0.16, 0.22, 1.5, 6), bark, [0.28, 0.75, 0.1], [-0.06, seed * 2, -0.08]);
    put(g, new THREE.CylinderGeometry(0.05, 0.12, 0.9, 5), bark, [-0.18, 0.15, 0.2], [1.1, seed, 0.3]);
    put(g, new THREE.IcosahedronGeometry(0.36, 0), leaf, [0.05, 1.95, 0.05], [seed, 0, 0], [1.1, 0.7, 1.1]);
    put(g, new THREE.IcosahedronGeometry(0.24, 0), leaf, [0.32, 1.55, 0.1], [0, seed, 0], [1, 0.75, 1]);
    return g;
  }
  if (kind === 'crystal') {
    const cr = mat('wall_crystal', { color: 0xf4eaff, emissive: 0xc890ff, emissiveIntensity: 0.9, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.82, flatShading: true });
    put(g, new THREE.OctahedronGeometry(0.42, 0), cr, [0, 0.95, 0], [0.1, seed, 0.15], [0.6, 2.1, 0.6]);
    put(g, new THREE.OctahedronGeometry(0.26, 0), cr, [0.3, 0.55, 0.1], [0.4, seed * 2, -0.3], [0.6, 1.8, 0.6]);
    put(g, new THREE.OctahedronGeometry(0.2, 0), cr, [-0.28, 0.4, -0.12], [-0.3, seed * 3, 0.4], [0.6, 1.6, 0.6]);
    return g;
  }
  if (kind === 'ice') {
    const m = mat('wall_ice', { color: 0xbfefff, emissive: 0x3aa0ff, emissiveIntensity: 0.4, roughness: 0.12, metalness: 0.05, transparent: true, opacity: 0.85, flatShading: true });
    put(g, new THREE.IcosahedronGeometry(0.55, 0), m, [0, 0.78, 0], [0.2, seed, 0.1], [0.85, 1.6, 0.7]);
    put(g, new THREE.IcosahedronGeometry(0.28, 0), m, [0.3, 0.3, 0.15], [0.5, seed * 2, 0.3], [0.7, 1.3, 0.7]);
  } else {
    const m = mat('wall_rock', { color: 0x7a6e62, roughness: 0.95, flatShading: true });
    put(g, new THREE.DodecahedronGeometry(0.55, 0), m, [0, 0.72, 0], [0.3, seed, 0.2], [0.95, 1.45, 0.8]);
    put(g, new THREE.DodecahedronGeometry(0.25, 0), m, [-0.28, 0.2, 0.2], [seed, 0.4, 0]);
  }
  return g;
}
