// Weapon and projectile models for the armory (R-112), built from primitives like the wizards are.
// A weapon's grip is at the origin and it points along +Y (blade, haft or barrel); the view turns it in the hand.
// A projectile flies along +Z. Templates are built once per weapon and cloned (geometry and materials are shared).
import * as THREE from 'three';
import { WEAPONS } from './weapons.js';

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.1, ...o });
const M = {
  steel: std(0xc9ced8, { roughness: 0.32, metalness: 0.75 }),
  iron: std(0x4a4e57, { roughness: 0.5, metalness: 0.6 }),
  wood: std(0x6b4a2b, { roughness: 0.85 }),
  leather: std(0x3b2618, { roughness: 0.9 }),
  gold: std(0xd9a441, { roughness: 0.35, metalness: 0.7 }),
  string: std(0xe8e0c8, { roughness: 1 }),
  stone: std(0x8a8478, { roughness: 1, flatShading: true })
};
const edges = new Map();
// A blade or head that carries an element: steel tinted toward it, glowing a little (kept low: bloom does the rest).
function edgeMat(W) {
  if (!W.els.length) return M.steel;
  if (!edges.has(W.id)) {
    const c = new THREE.Color(W.color);
    edges.set(W.id, std(new THREE.Color(0xc9ced8).lerp(c, 0.45), { roughness: 0.3, metalness: 0.55, emissive: c, emissiveIntensity: 0.55 }));
  }
  return edges.get(W.id);
}
const glows = new Map();
function glowMat(color, k = 1.8) {
  const key = color + ':' + k;
  if (!glows.has(key)) glows.set(key, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), toneMapped: false }));
  return glows.get(key);
}

function part(g, geo, mat, [x, y, z] = [0, 0, 0], [rx, ry, rz] = [0, 0, 0], scale) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  if (scale) m.scale.set(...scale);
  m.castShadow = true;
  g.add(m);
  return m;
}
const rod = (r, h, seg = 8) => new THREE.CylinderGeometry(r, r, h, seg);
// A half disc in the XY plane, bulging toward +X: axe heads and glaive blades.
const crescent = (r, t) => new THREE.CylinderGeometry(r, r, t, 24, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(-Math.PI / 2);
// A symmetric arc in the XY plane whose middle sits at the origin and whose ends reach down: bow limbs.
function limbs(R, tube, span) {
  const g = new THREE.TorusGeometry(R, tube, 6, 28, span);
  g.rotateZ(Math.PI / 2 - span / 2);
  g.translate(0, -R, 0);
  return g;
}
const bowString = (g, R, span) => {
  const half = R * Math.sin(span / 2), y = R * Math.cos(span / 2) - R;
  part(g, rod(0.006, half * 2, 4), M.string, [0, y, 0], [0, 0, Math.PI / 2]);
};

const BUILD = {
  sword(g, W) {
    part(g, rod(0.028, 0.22), M.leather, [0, 0.02, 0]);
    part(g, new THREE.SphereGeometry(0.04, 10, 8), M.gold, [0, -0.1, 0]);
    part(g, new THREE.BoxGeometry(0.26, 0.035, 0.05), M.gold, [0, 0.15, 0]);
    part(g, new THREE.BoxGeometry(0.06, 0.74, 0.016), edgeMat(W), [0, 0.54, 0]);
    part(g, new THREE.ConeGeometry(0.042, 0.12, 4), edgeMat(W), [0, 0.97, 0], [0, Math.PI / 4, 0], [1, 1, 0.3]);
    if (W.els.length) part(g, new THREE.BoxGeometry(0.012, 0.6, 0.02), glowMat(W.color), [0, 0.52, 0]);
  },
  dagger(g, W) {
    part(g, rod(0.024, 0.12), M.leather, [0, 0.0, 0]);
    part(g, new THREE.BoxGeometry(0.14, 0.03, 0.04), M.iron, [0, 0.08, 0]);
    part(g, new THREE.ConeGeometry(0.035, 0.34, 4), edgeMat(W), [0, 0.26, 0], [0, Math.PI / 4, 0], [1, 1, 0.3]);
    if (W.els.length) part(g, new THREE.ConeGeometry(0.012, 0.28, 4), glowMat(W.color), [0, 0.25, 0.006]);
  },
  axe(g, W) {
    part(g, rod(0.03, 1.0), M.wood, [0, 0.38, 0]);
    part(g, crescent(0.2, 0.03), edgeMat(W), [0.05, 0.78, 0]);
    part(g, new THREE.BoxGeometry(0.1, 0.12, 0.06), M.iron, [0.0, 0.78, 0]);
    part(g, new THREE.ConeGeometry(0.035, 0.12, 4), M.iron, [-0.1, 0.78, 0], [0, 0, Math.PI / 2]);
  },
  handaxe(g, W) {
    part(g, rod(0.022, 0.4), M.wood, [0, 0.12, 0]);
    part(g, crescent(0.1, 0.025), edgeMat(W), [0.03, 0.28, 0]);
  },
  hammer(g, W) {
    part(g, rod(0.03, 0.95), M.wood, [0, 0.36, 0]);
    part(g, new THREE.BoxGeometry(0.32, 0.17, 0.17), W.els.length ? edgeMat(W) : M.iron, [0, 0.82, 0]);
    part(g, new THREE.BoxGeometry(0.34, 0.04, 0.19), W.els.length ? glowMat(W.color, 1.4) : M.gold, [0, 0.82, 0]);
  },
  mace(g, W) {
    part(g, rod(0.028, 0.62), M.wood, [0, 0.2, 0]);
    part(g, new THREE.SphereGeometry(0.1, 12, 10), edgeMat(W), [0, 0.56, 0]);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      part(g, new THREE.BoxGeometry(0.03, 0.16, 0.08), M.gold, [Math.cos(a) * 0.1, 0.56, Math.sin(a) * 0.1], [0, -a, 0]);
    }
  },
  flail(g, W) {
    part(g, rod(0.028, 0.42), M.wood, [0, 0.1, 0]);
    for (let i = 0; i < 4; i++) part(g, new THREE.TorusGeometry(0.03, 0.008, 4, 10), M.iron, [0, 0.36 + i * 0.07, 0], [0, i % 2 ? Math.PI / 2 : 0, 0]);
    part(g, new THREE.SphereGeometry(0.1, 12, 10), M.iron, [0, 0.72, 0]);
    for (let i = 0; i < 8; i++) {
      const v = new THREE.Vector3().setFromSphericalCoords(1, Math.acos(1 - (2 * (i + 0.5)) / 8), i * 2.4);
      const s = part(g, new THREE.ConeGeometry(0.028, 0.09, 5), M.steel, [v.x * 0.11, 0.72 + v.y * 0.11, v.z * 0.11]);
      s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v);
    }
  },
  spear(g, W) {
    part(g, rod(0.022, 1.75), M.wood, [0, 0.3, 0]);
    part(g, new THREE.ConeGeometry(0.05, 0.26, 4), edgeMat(W), [0, 1.3, 0], [0, Math.PI / 4, 0], [1, 1, 0.35]);
    part(g, new THREE.CylinderGeometry(0.03, 0.025, 0.06, 8), M.iron, [0, 1.15, 0]);
  },
  trident(g, W) {
    part(g, rod(0.022, 1.75), M.wood, [0, 0.3, 0]);
    part(g, new THREE.BoxGeometry(0.24, 0.035, 0.035), edgeMat(W), [0, 1.17, 0]);
    for (const x of [-0.11, 0, 0.11]) part(g, new THREE.ConeGeometry(0.022, x ? 0.24 : 0.3, 5), edgeMat(W), [x, x ? 1.3 : 1.33, 0]);
    if (W.els.length) part(g, new THREE.SphereGeometry(0.035, 10, 8), glowMat(W.color), [0, 1.17, 0.02]);
  },
  glaive(g, W) {
    part(g, rod(0.022, 1.6), M.wood, [0, 0.25, 0]);
    part(g, crescent(0.17, 0.02), edgeMat(W), [0.02, 1.13, 0], [0, 0, 0], [1, 1.9, 1]);
    part(g, new THREE.CylinderGeometry(0.032, 0.026, 0.07, 8), M.gold, [0, 1.03, 0]);
  },
  scythe(g, W) {
    part(g, rod(0.022, 1.7), M.wood, [0, 0.28, 0]);
    part(g, new THREE.TorusGeometry(0.42, 0.03, 4, 24, Math.PI * 0.62), edgeMat(W), [-0.42, 1.12, 0], [0, 0, 0], [1, 0.62, 0.35]);
    part(g, new THREE.BoxGeometry(0.08, 0.06, 0.05), M.iron, [0, 1.12, 0]);
  },
  bow(g, W) {
    const R = 0.6, span = Math.PI * 0.62;
    part(g, limbs(R, 0.018, span), W.els.length ? edgeMat(W) : M.wood, [0, 0, 0]);
    bowString(g, R, span);
    part(g, rod(0.026, 0.12), M.leather, [0, 0, 0], [0, 0, Math.PI / 2]);
    if (W.els.length) part(g, new THREE.SphereGeometry(0.03, 8, 6), glowMat(W.color), [0, 0.02, 0.03]);
  },
  crossbow(g, W) {
    part(g, new THREE.BoxGeometry(0.06, 0.55, 0.07), M.wood, [0, 0.16, 0]);
    const R = 0.32, span = Math.PI * 0.7;
    const prod = new THREE.Group(); prod.position.y = 0.4; g.add(prod);
    part(prod, limbs(R, 0.016, span), M.iron);
    bowString(prod, R, span);
    part(g, rod(0.012, 0.32), W.els.length ? glowMat(W.color) : M.steel, [0, 0.36, 0.04]);
  },
  repeater(g, W) {
    BUILD.crossbow(g, W);
    part(g, new THREE.BoxGeometry(0.09, 0.22, 0.09), M.iron, [0, 0.26, 0.08]);
    part(g, new THREE.BoxGeometry(0.1, 0.03, 0.1), glowMat(W.color, 1.5), [0, 0.3, 0.08]);
  },
  pistol(g, W) {
    part(g, new THREE.BoxGeometry(0.05, 0.16, 0.04), M.wood, [0, -0.02, -0.03], [-0.5, 0, 0]);
    part(g, rod(0.022, 0.34, 10), M.iron, [0, 0.17, 0.0]);
    part(g, new THREE.BoxGeometry(0.02, 0.05, 0.04), M.gold, [0, 0.04, 0.02]);
  },
  blunderbuss(g, W) {
    part(g, new THREE.BoxGeometry(0.06, 0.3, 0.06), M.wood, [0, -0.04, -0.02], [-0.3, 0, 0]);
    part(g, new THREE.CylinderGeometry(0.06, 0.028, 0.52, 12, 1, true), M.gold, [0, 0.33, 0]);
    part(g, new THREE.TorusGeometry(0.06, 0.012, 6, 16), M.gold, [0, 0.59, 0], [Math.PI / 2, 0, 0]);
  },
  sling(g, W) {
    for (const x of [-0.05, 0.05]) part(g, rod(0.005, 0.44, 4), M.leather, [x * 0.5, -0.2, 0], [0, 0, x * 1.2]);
    part(g, new THREE.SphereGeometry(0.06, 8, 6), M.leather, [0, -0.43, 0], [0, 0, 0], [1, 0.6, 1]);
    part(g, new THREE.DodecahedronGeometry(0.045, 0), M.stone, [0, -0.4, 0]);
  }
};

const templates = new Map();
export function buildWeaponModel(id) {
  const W = WEAPONS[id] ?? WEAPONS.sword;
  if (!templates.has(W.id)) {
    const g = new THREE.Group();
    g.name = 'weapon_' + W.id;
    (BUILD[W.model] ?? BUILD.sword)(g, W);
    g.scale.setScalar(W.size ?? 1);
    templates.set(W.id, g);
  }
  return templates.get(W.id).clone();
}

// ---------------------------------------------------------------- projectiles (fly along +Z)
const SHOT = {
  arrow(g, W) {
    part(g, rod(0.01, 0.62, 5), M.wood, [0, 0, 0], [Math.PI / 2, 0, 0]);
    part(g, new THREE.ConeGeometry(0.028, 0.1, 4), W.els.length ? glowMat(W.color) : M.steel, [0, 0, 0.35], [Math.PI / 2, 0, 0]);
    for (const r of [0, Math.PI / 2]) part(g, new THREE.BoxGeometry(0.07, 0.003, 0.1), M.string, [0, 0, -0.27], [0, 0, r]);
  },
  bolt(g, W) {
    part(g, rod(0.014, 0.38, 5), M.wood, [0, 0, 0], [Math.PI / 2, 0, 0]);
    part(g, new THREE.ConeGeometry(0.032, 0.09, 4), W.els.length ? glowMat(W.color) : M.iron, [0, 0, 0.22], [Math.PI / 2, 0, 0]);
  },
  ball(g, W) { part(g, new THREE.SphereGeometry(0.05, 8, 6), glowMat(0xffd9a0, 1.6)); part(g, new THREE.ConeGeometry(0.035, 0.3, 6), glowMat(0xffb060, 0.9), [0, 0, -0.17], [-Math.PI / 2, 0, 0]); },
  pellet(g, W) { part(g, new THREE.SphereGeometry(0.035, 6, 4), glowMat(0xffd9a0, 1.6)); },
  handaxe(g, W) { const a = new THREE.Group(); BUILD.handaxe(a, W); a.position.y = -0.15; g.add(a); g.userData.spin = 18; },
  stone(g, W) { part(g, new THREE.DodecahedronGeometry(0.1, 0), M.stone); g.userData.spin = 8; },
  rune(g, W) { part(g, new THREE.OctahedronGeometry(0.09, 0), glowMat(W.color, 2.2)); part(g, new THREE.ConeGeometry(0.05, 0.4, 6), glowMat(W.color, 1.2), [0, 0, -0.22], [-Math.PI / 2, 0, 0]); g.userData.spin = 10; }
};
const shotTemplates = new Map();
export function buildShotModel(id) {
  const W = WEAPONS[id];
  if (!W || W.kind !== 'ranged') return null;
  if (!shotTemplates.has(id)) {
    const g = new THREE.Group();
    g.rotation.order = 'YXZ';
    (SHOT[W.shot] ?? SHOT.arrow)(g, W);
    shotTemplates.set(id, g);
  }
  const c = shotTemplates.get(id).clone();
  c.userData = { ...shotTemplates.get(id).userData };
  return c;
}
