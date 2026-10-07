import * as THREE from 'three';

// ---------------------------------------------------------------- helpers
const mats = {};
const mat = (name, o) => (mats[name] ||= new THREE.MeshStandardMaterial({ name, ...o }));
const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

const R = 0.5, SQ3 = Math.sqrt(3);
const hexPos = (q, r) => [R * 1.5 * q, R * SQ3 * (r + q / 2)];

// ---------------------------------------------------------------- regions
export const REGIONS = [
  { id: 'tundra', name: 'Hvítmark Tundra', biome: 'Frozen tundra', q: 1, r: -7, rings: 3,
    top: 0xdfe9f0, rock: 0x8fa3b3, base: 0.34, rough: 0.16, glow: 0x7dd3fc,
    blurb: 'Wind-scoured ice shelf. Two chokepoints, no cover — the opening gauntlet.' },
  { id: 'pine', name: 'Ashvold Pinewood', biome: 'Norse pine forest', q: -1, r: -2, rings: 3,
    top: 0x4e6b3c, rock: 0x6b5a44, base: 0.42, rough: 0.22, glow: 0x76c04a,
    blurb: 'Dense pine cover and a hidden cache. The safest route between north and keep.' },
  { id: 'keep', name: 'Grauhold Keep', biome: 'Ruined stone keep', q: 3, r: -1, rings: 3,
    top: 0x9a9187, rock: 0x6f6862, base: 0.62, rough: 0.10, glow: 0xc9a227,
    blurb: 'Campaign hub on a raised plateau. Broken curtain wall, boss court at the centre.' },
  { id: 'volcano', name: 'Eldrhólt Wastes', biome: 'Volcanic wasteland', q: 7, r: -2, rings: 3,
    top: 0x4a3a34, rock: 0x2f2622, base: 0.50, rough: 0.34, glow: 0xff7a2f,
    blurb: 'Cinder plain under an active cone. Lava channels rework the chokepoints each run.' },
  { id: 'bog', name: 'Mirefen Bog', biome: 'Swamp / bog', q: 0, r: 3, rings: 3,
    top: 0x50603a, rock: 0x3d4230, base: 0.20, rough: 0.12, glow: 0x8fbf4a,
    blurb: 'Half-drowned lowland. Slow water, dead stands, and the densest destructible cover.' },
  { id: 'cavern', name: 'Sunken Verrglass', biome: 'Crystal cavern', q: -4, r: 2, rings: 3,
    top: 0x3b3358, rock: 0x2a2440, base: -0.06, rough: 0.14, glow: 0xa855f7,
    blurb: 'Collapsed cave mouth below sea level. Crystal light, one way in, one boss out.' }
];

// nodes: gameplay markers laid over the terrain
const NODES = [
  ['spawn', 'tundra', 0, -2, 'Landing — party spawn'],
  ['choke', 'tundra', 1, 0, 'Ice bridge chokepoint'],
  ['hazard', 'tundra', -1, 1, 'Thin ice — breaks under weight'],
  ['loot', 'pine', -1, -1, 'Woodcutter cache'],
  ['cover', 'pine', 1, 0, 'Pine stand — heavy cover'],
  ['destruct', 'pine', 0, 1, 'Log pile — destructible'],
  ['spawn', 'pine', -2, 1, 'Forward respawn'],
  ['choke', 'keep', -2, 0, 'Gatehouse chokepoint'],
  ['boss', 'keep', 0, 0, 'Warden of the Keep'],
  ['loot', 'keep', 1, -1, 'Armoury vault'],
  ['destruct', 'keep', 1, 1, 'Curtain wall — breachable'],
  ['hazard', 'volcano', 0, 0, 'Lava channel'],
  ['hazard', 'volcano', 1, 1, 'Ash vent — periodic burst'],
  ['boss', 'volcano', 2, -1, 'Cinder Colossus'],
  ['choke', 'volcano', -2, 0, 'Basalt pass'],
  ['cover', 'volcano', 0, 2, 'Basalt spires'],
  ['hazard', 'bog', 0, 0, 'Sink pool — movement slow'],
  ['destruct', 'bog', -1, 1, 'Dead stand — burns'],
  ['loot', 'bog', 2, 0, 'Sunken barge'],
  ['spawn', 'bog', -2, -1, 'Ferry landing'],
  ['boss', 'cavern', 0, 1, 'Verrglass Hollow'],
  ['loot', 'cavern', -1, -1, 'Geode vault'],
  ['choke', 'cavern', 2, -1, 'Cave mouth'],
  ['cover', 'cavern', 0, -2, 'Crystal shelf']
];

const NODE_STYLE = {
  spawn:    { color: 0x4ade80, label: 'Spawn point' },
  cover:    { color: 0x94a3b8, label: 'Cover' },
  hazard:   { color: 0xff7a2f, label: 'Hazard zone' },
  choke:    { color: 0xf7e26b, label: 'Chokepoint' },
  loot:     { color: 0xc9a227, label: 'Loot cache' },
  boss:     { color: 0xef4444, label: 'Boss platform' },
  destruct: { color: 0xa855f7, label: 'Destructible' }
};
export const LEGEND = Object.entries(NODE_STYLE).map(([k, v]) => ({ id: k, ...v }));

const ROUTES = [['tundra', 'pine'], ['pine', 'keep'], ['keep', 'volcano'], ['pine', 'bog'], ['bog', 'cavern'], ['bog', 'keep']];

// ---------------------------------------------------------------- build
export function buildMap(opts = {}) {
  const g = new THREE.Group();
  g.name = 'overworld_campaign_map';
  const rand = rng(20260814);
  const cellTop = {};   // "q,r" -> world top y
  const marks = [];

  const add = (geo, m, name, pos, rot, scale) => {
    const o = new THREE.Mesh(geo, m);
    o.name = name;
    o.castShadow = true; o.receiveShadow = true;
    if (pos) o.position.set(...pos);
    if (rot) o.rotation.set(...rot);
    if (scale) o.scale.set(...scale);
    g.add(o);
    return o;
  };

  // --- sea plate ---------------------------------------------------------
  const sea = add(new THREE.CylinderGeometry(9.4, 9.0, 0.30, 72),
    mat('sea', { color: 0x1d3f5c, roughness: 0.35, metalness: 0.1 }), 'sea_plate', [2.0, -0.20, -0.6]);
  sea.receiveShadow = true;
  const rim = add(new THREE.TorusGeometry(9.4, 0.10, 12, 88),
    mat('sea_rim', { color: 0x14293c, roughness: 0.8 }), 'sea_rim', [2.0, -0.06, -0.6], [Math.PI / 2, 0, 0]);

  // --- region terrain ----------------------------------------------------
  REGIONS.forEach((reg) => {
    const cells = [];
    for (let dq = -reg.rings; dq <= reg.rings; dq++) {
      for (let dr = -reg.rings; dr <= reg.rings; dr++) {
        const ds = -dq - dr;
        if (Math.max(Math.abs(dq), Math.abs(dr), Math.abs(ds)) > reg.rings) continue;
        const edge = Math.max(Math.abs(dq), Math.abs(dr), Math.abs(ds));
        if (edge === reg.rings && rand() < 0.45) continue;   // ragged coastline
        cells.push([dq, dr, edge]);
      }
    }

    const topMat = mat(reg.id + '_ground', { color: reg.top, roughness: 0.95 });
    const rockMat = mat(reg.id + '_rock', { color: reg.rock, roughness: 0.92 });
    const glowMat = mat(reg.id + '_glow', { color: reg.glow, emissive: reg.glow, emissiveIntensity: 0.75, roughness: 0.3 });

    cells.forEach(([dq, dr, edge]) => {
      const q = reg.q + dq, r = reg.r + dr;
      const [x, z] = hexPos(q, r);
      const h = Math.max(0.10, reg.base + (rand() - 0.4) * reg.rough - edge * 0.045);
      const y = h / 2;
      const cell = add(new THREE.CylinderGeometry(R * 0.985, R * 0.985, h, 6), topMat,
        `${reg.id}_cell_${dq}_${dr}`, [x, y, z], [0, Math.PI / 6, 0]);
      add(new THREE.CylinderGeometry(R * 0.99, R * 0.94, 0.16, 6), rockMat,
        `${reg.id}_skirt_${dq}_${dr}`, [x, -0.001, z], [0, Math.PI / 6, 0]);
      cellTop[`${q},${r}`] = h;
      cell.userData.reg = reg.id;
    });

    // ---- biome dressing --------------------------------------------------
    const at = (dq, dr) => {
      const q = reg.q + dq, r = reg.r + dr;
      const [x, z] = hexPos(q, r);
      return { x, z, y: cellTop[`${q},${r}`] ?? null };
    };
    const scatter = (n, fn) => {
      let placed = 0, guard = 0;
      while (placed < n && guard++ < n * 20) {
        const dq = Math.round((rand() - 0.5) * reg.rings * 2);
        const dr = Math.round((rand() - 0.5) * reg.rings * 2);
        const p = at(dq, dr);
        if (p.y == null) continue;
        fn(p, placed);
        placed++;
      }
    };

    if (reg.id === 'pine') {
      scatter(26, (p, i) => {
        const s = 0.7 + rand() * 0.7;
        const jx = (rand() - 0.5) * 0.4, jz = (rand() - 0.5) * 0.4;
        add(new THREE.CylinderGeometry(0.026, 0.036, 0.20 * s, 8), mat('trunk', { color: 0x4a3423, roughness: 0.95 }),
          `pine_trunk_${i}`, [p.x + jx, p.y + 0.10 * s, p.z + jz]);
        for (let k = 0; k < 3; k++) {
          add(new THREE.ConeGeometry(0.20 * s * (1 - k * 0.22), 0.26 * s, 8), mat('pine_needle', { color: 0x2f5230, roughness: 0.95 }),
            `pine_${i}_${k}`, [p.x + jx, p.y + (0.22 + k * 0.15) * s, p.z + jz]);
        }
      });
    }

    if (reg.id === 'tundra') {
      scatter(16, (p, i) => {
        const s = 0.5 + rand() * 0.9;
        add(new THREE.ConeGeometry(0.10 * s, 0.46 * s, 5), mat('ice_spike', { color: 0xbfe4f5, roughness: 0.2, metalness: 0.05 }),
          `ice_spike_${i}`, [p.x + (rand() - 0.5) * 0.4, p.y + 0.23 * s, p.z + (rand() - 0.5) * 0.4],
          [(rand() - 0.5) * 0.3, rand() * 3, (rand() - 0.5) * 0.3]);
      });
      scatter(5, (p, i) => {
        add(new THREE.CylinderGeometry(0.34, 0.34, 0.03, 6), mat('thin_ice', { color: 0x9fd8ef, roughness: 0.12, metalness: 0.2 }),
          `thin_ice_${i}`, [p.x, p.y + 0.02, p.z], [0, Math.PI / 6, 0]);
      });
    }

    if (reg.id === 'volcano') {
      const c = at(2, -2);
      if (c.y != null) {
        add(new THREE.ConeGeometry(1.15, 1.30, 20), mat('volcano_cone', { color: 0x332823, roughness: 0.95 }),
          'volcano_cone', [c.x, c.y + 0.65, c.z]);
        add(new THREE.CylinderGeometry(0.28, 0.34, 0.10, 18), glowMat, 'crater', [c.x, c.y + 1.28, c.z]);
      }
      scatter(9, (p, i) => {
        add(new THREE.CylinderGeometry(0.30, 0.30, 0.035, 6), glowMat, `lava_pool_${i}`, [p.x, p.y + 0.022, p.z], [0, Math.PI / 6, 0]);
      });
      scatter(12, (p, i) => {
        const s = 0.5 + rand() * 0.8;
        add(new THREE.CylinderGeometry(0.07 * s, 0.10 * s, 0.42 * s, 6), mat('basalt', { color: 0x2b2422, roughness: 0.95 }),
          `basalt_${i}`, [p.x + (rand() - 0.5) * 0.4, p.y + 0.21 * s, p.z + (rand() - 0.5) * 0.4], [0, rand() * 3, (rand() - 0.5) * 0.2]);
      });
    }

    if (reg.id === 'keep') {
      const c = at(0, 0);
      // curtain wall ring with a breach
      for (let i = 0; i < 14; i++) {
        if (i === 5 || i === 6) continue;
        const a = (i / 14) * Math.PI * 2;
        const rr = 1.55;
        add(new THREE.BoxGeometry(0.62, 0.52 + (i % 3) * 0.10, 0.20), mat('keep_wall', { color: 0x8a8279, roughness: 0.94 }),
          `wall_${i}`, [c.x + Math.sin(a) * rr, c.y + 0.26, c.z + Math.cos(a) * rr], [0, -a, 0]);
      }
      [0, 3.5, 1.7, 5.2].forEach((a, i) => {
        add(new THREE.CylinderGeometry(0.22, 0.26, 0.85 + i * 0.12, 10), mat('keep_tower', { color: 0x948b81, roughness: 0.93 }),
          `tower_${i}`, [c.x + Math.sin(a) * 1.55, c.y + 0.42 + i * 0.06, c.z + Math.cos(a) * 1.55]);
        add(new THREE.ConeGeometry(0.28, 0.26, 10), mat('tower_cap', { color: 0x5e564e, roughness: 0.9 }),
          `tower_cap_${i}`, [c.x + Math.sin(a) * 1.55, c.y + 0.98 + i * 0.12, c.z + Math.cos(a) * 1.55]);
      });
      add(new THREE.CylinderGeometry(0.72, 0.78, 0.14, 24), mat('boss_court', { color: 0xb5aa9c, roughness: 0.9 }),
        'boss_court', [c.x, c.y + 0.07, c.z]);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        add(new THREE.CylinderGeometry(0.055, 0.065, 0.46 - (i % 2) * 0.18, 8), mat('court_pillar', { color: 0xa1978a, roughness: 0.92 }),
          `court_pillar_${i}`, [c.x + Math.sin(a) * 0.60, c.y + 0.30, c.z + Math.cos(a) * 0.60]);
      }
    }

    if (reg.id === 'bog') {
      scatter(10, (p, i) => {
        add(new THREE.CylinderGeometry(0.34, 0.34, 0.03, 6), mat('bog_water', { color: 0x2f4436, roughness: 0.25, metalness: 0.15 }),
          `bog_pool_${i}`, [p.x, p.y + 0.018, p.z], [0, Math.PI / 6, 0]);
      });
      scatter(16, (p, i) => {
        const s = 0.7 + rand() * 0.6;
        const jx = (rand() - 0.5) * 0.4, jz = (rand() - 0.5) * 0.4;
        add(new THREE.CylinderGeometry(0.022, 0.040, 0.52 * s, 6), mat('dead_wood', { color: 0x4a4436, roughness: 0.97 }),
          `dead_tree_${i}`, [p.x + jx, p.y + 0.26 * s, p.z + jz], [(rand() - 0.5) * 0.2, 0, (rand() - 0.5) * 0.2]);
        for (let k = 0; k < 2; k++) {
          add(new THREE.CylinderGeometry(0.012, 0.016, 0.22 * s, 5), mat('dead_wood', { color: 0x4a4436, roughness: 0.97 }),
            `branch_${i}_${k}`, [p.x + jx, p.y + (0.40 + k * 0.08) * s, p.z + jz], [0, k * 1.6, (k ? 1 : -1) * 0.9]);
        }
      });
      scatter(8, (p, i) => {
        add(new THREE.SphereGeometry(0.14 + rand() * 0.08, 10, 7), mat('bog_mound', { color: 0x46532f, roughness: 0.98 }),
          `mound_${i}`, [p.x + (rand() - 0.5) * 0.3, p.y + 0.04, p.z + (rand() - 0.5) * 0.3], null, [1, 0.55, 1]);
      });
    }

    if (reg.id === 'cavern') {
      scatter(22, (p, i) => {
        const s = 0.5 + rand() * 1.0;
        add(new THREE.OctahedronGeometry(0.11 * s, 0), glowMat, `crystal_${i}`,
          [p.x + (rand() - 0.5) * 0.4, p.y + 0.16 * s, p.z + (rand() - 0.5) * 0.4],
          [(rand() - 0.5) * 0.5, rand() * 3, (rand() - 0.5) * 0.5], [0.7, 2.0, 0.7]);
      });
      // cave mouth arch
      const c = at(1, 0);
      if (c.y != null) {
        [-1, 1].forEach((sd, i) => add(new THREE.CylinderGeometry(0.11, 0.15, 0.62, 8), mat('cave_rock', { color: 0x2e2842, roughness: 0.96 }),
          `arch_leg_${i}`, [c.x + sd * 0.42, c.y + 0.31, c.z]));
        add(new THREE.BoxGeometry(1.10, 0.16, 0.26), mat('cave_rock', { color: 0x2e2842, roughness: 0.96 }),
          'arch_lintel', [c.x, c.y + 0.68, c.z]);
      }
    }
  });

  // --- routes ------------------------------------------------------------
  const hub = {};
  REGIONS.forEach((reg) => {
    const [x, z] = hexPos(reg.q, reg.r);
    hub[reg.id] = new THREE.Vector3(x, (cellTop[`${reg.q},${reg.r}`] ?? 0.4) + 0.03, z);
  });
  ROUTES.forEach(([a, b], i) => {
    const p0 = hub[a], p1 = hub[b];
    const midx = (p0.x + p1.x) / 2 + (rand() - 0.5) * 0.9;
    const midz = (p0.z + p1.z) / 2 + (rand() - 0.5) * 0.9;
    const curve = new THREE.CatmullRomCurve3([
      p0.clone(),
      new THREE.Vector3(midx, Math.min(p0.y, p1.y) * 0.55 + 0.10, midz),
      p1.clone()
    ]);
    add(new THREE.TubeGeometry(curve, 44, 0.048, 8, false),
      mat('route', { color: 0xd8c9a8, roughness: 0.85 }), `route_${a}_${b}`);
    for (let k = 1; k < 6; k++) {
      const p = curve.getPointAt(k / 6);
      add(new THREE.SphereGeometry(0.055, 10, 8), mat('waypoint', { color: 0xb8a37a, roughness: 0.8 }),
        `waypoint_${i}_${k}`, [p.x, p.y + 0.02, p.z]);
    }
  });

  // --- gameplay nodes ----------------------------------------------------
  NODES.forEach(([type, regId, dq, dr, label], i) => {
    const reg = REGIONS.find((x) => x.id === regId);
    const q = reg.q + dq, r = reg.r + dr;
    const [x, z] = hexPos(q, r);
    const base = cellTop[`${q},${r}`] ?? reg.base;
    const st = NODE_STYLE[type];
    const pin = mat('pin_' + type, { color: st.color, emissive: st.color, emissiveIntensity: 0.55, roughness: 0.35 });
    const nm = `${type}_${regId}_${i}`;

    if (type === 'boss') {
      add(new THREE.CylinderGeometry(0.62, 0.68, 0.12, 24), mat('boss_pad', { color: 0x6b2020, roughness: 0.9 }), nm + '_pad', [x, base + 0.06, z]);
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + 0.4;
        add(new THREE.CylinderGeometry(0.05, 0.06, 0.44, 8), mat('boss_pillar', { color: 0x8a2b2b, roughness: 0.88 }),
          `${nm}_pillar_${k}`, [x + Math.sin(a) * 0.48, base + 0.34, z + Math.cos(a) * 0.48]);
      }
    } else if (type === 'choke') {
      [-1, 1].forEach((sd, k) => add(new THREE.CylinderGeometry(0.06, 0.08, 0.44, 8), mat('gate_post', { color: 0x6f6862, roughness: 0.92 }),
        `${nm}_post_${k}`, [x + sd * 0.30, base + 0.22, z]));
      add(new THREE.BoxGeometry(0.78, 0.09, 0.14), mat('gate_lintel', { color: 0x5e574f, roughness: 0.92 }), nm + '_lintel', [x, base + 0.48, z]);
    } else if (type === 'loot') {
      add(new THREE.BoxGeometry(0.30, 0.20, 0.22), mat('chest', { color: 0x6b4a28, roughness: 0.9 }), nm + '_chest', [x, base + 0.10, z], [0, 0.5, 0]);
      add(new THREE.CylinderGeometry(0.11, 0.11, 0.30, 12, 1, false, 0, Math.PI), mat('chest_lid', { color: 0x7d5730, roughness: 0.9 }),
        nm + '_lid', [x, base + 0.20, z], [0, 0, Math.PI / 2]);
      add(new THREE.BoxGeometry(0.32, 0.04, 0.04), mat('chest_band', { color: 0xc9a227, roughness: 0.4, metalness: 0.45 }), nm + '_band', [x, base + 0.13, z], [0, 0.5, 0]);
    } else if (type === 'destruct') {
      for (let k = 0; k < 3; k++) {
        add(new THREE.BoxGeometry(0.20, 0.16, 0.20), mat('rubble', { color: 0x7a7268, roughness: 0.95 }),
          `${nm}_block_${k}`, [x + (k - 1) * 0.17, base + 0.08 + (k === 1 ? 0.14 : 0), z + (k % 2) * 0.10], [0, k * 0.6, 0]);
      }
    } else if (type === 'cover') {
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2;
        add(new THREE.DodecahedronGeometry(0.13, 0), mat('boulder', { color: 0x7f7a72, roughness: 0.96 }),
          `${nm}_rock_${k}`, [x + Math.sin(a) * 0.24, base + 0.09, z + Math.cos(a) * 0.24], [k * 0.5, k, 0.3]);
      }
    } else if (type === 'hazard') {
      add(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 6), pin, nm + '_zone', [x, base + 0.03, z], [0, Math.PI / 6, 0]);
    } else if (type === 'spawn') {
      const ring = add(new THREE.TorusGeometry(0.30, 0.035, 10, 30), pin, nm + '_ring', [x, base + 0.05, z]);
      ring.rotation.x = Math.PI / 2;
      add(new THREE.ConeGeometry(0.10, 0.26, 10), pin, nm + '_arrow', [x, base + 0.20, z]);
    }

    // floating marker so every node reads from straight above
    const poleH = type === 'boss' ? 0.95 : 0.62;
    add(new THREE.CylinderGeometry(0.014, 0.014, poleH, 6), mat('pin_pole', { color: 0x3a3630, roughness: 0.9 }), nm + '_pole', [x, base + poleH / 2, z]);
    const flag = add(new THREE.OctahedronGeometry(0.10, 0), pin, nm + '_pin', [x, base + poleH + 0.09, z]);
    flag.scale.set(1, 1.3, 1);
    marks.push({ type, regId, label, x, z, y: base + poleH + 0.09 });
  });

  g.userData.marks = marks;
  g.userData.hubs = hub;
  return g;
}

// ---------------------------------------------------------------- mount
const stage = document.querySelector('three-d-stage');
await stage.ready;

const map = buildMap();
stage.setObject(map);

const cam = stage._camera, ctr = stage._controls;
const VIEWS = {
  iso:  new THREE.Vector3(1, 0.92, 1),
  top:  new THREE.Vector3(0.001, 1, 0.14),
  low:  new THREE.Vector3(1, 0.34, 1.35)
};
// Bounds currently being framed — the camera distance is derived from these,
// never hardcoded, so every view keeps the subject inside the viewport.
let framed = new THREE.Sphere();
new THREE.Box3().setFromObject(map).getBoundingSphere(framed);

function regionSphere(id) {
  const box = new THREE.Box3();
  map.traverse((o) => { if (o.isMesh && o.name.startsWith(id + '_')) box.expandByObject(o); });
  const s = new THREE.Sphere();
  return box.isEmpty() ? null : box.getBoundingSphere(s);
}

function setView(key, sphere) {
  if (sphere) framed = sphere;
  const t = framed.center.clone();
  let dist = (framed.radius / Math.tan((cam.fov * Math.PI) / 360)) * 0.98;
  if (cam.aspect < 1) dist /= cam.aspect;
  cam.position.copy(t).add(VIEWS[key].clone().normalize().multiplyScalar(dist));
  cam.near = Math.max(dist / 100, 0.01);
  cam.far = dist * 100;
  cam.updateProjectionMatrix();
  ctr.target.copy(t);
  ctr.autoRotate = false;
  ctr.update();
  document.querySelectorAll('[data-v]').forEach((b) => b.classList.toggle('is-on', b.dataset.v === key));
}

let view = 'iso';
document.querySelectorAll('[data-v]').forEach((b) => {
  b.addEventListener('click', () => { view = b.dataset.v; setView(view); });
});

const nameEl = document.getElementById('r-name');
const biomeEl = document.getElementById('r-biome');
const blurbEl = document.getElementById('r-blurb');

const list = document.getElementById('regions');
REGIONS.forEach((reg) => {
  const b = document.createElement('button');
  b.className = 'chip';
  b.dataset.r = reg.id;
  b.innerHTML = `<span class="swatch" style="background:#${reg.glow.toString(16).padStart(6, '0')}"></span>${reg.name}`;
  b.addEventListener('click', () => {
    setView(view, regionSphere(reg.id) || undefined);
    nameEl.textContent = reg.name;
    biomeEl.textContent = reg.biome;
    blurbEl.textContent = reg.blurb;
    document.querySelectorAll('[data-r]').forEach((x) => x.classList.toggle('is-on', x.dataset.r === reg.id));
  });
  list.appendChild(b);
});

const legendEl = document.getElementById('legend');
LEGEND.forEach((l) => {
  const row = document.createElement('div');
  row.className = 'legend-row';
  row.innerHTML = `<span class="swatch" style="background:#${l.color.toString(16).padStart(6, '0')}"></span>${l.label}`;
  legendEl.appendChild(row);
});

document.getElementById('r-whole').addEventListener('click', () => {
  const whole = new THREE.Sphere();
  new THREE.Box3().setFromObject(map).getBoundingSphere(whole);
  setView(view, whole);
  nameEl.textContent = 'Grauhold Reach';
  biomeEl.textContent = 'Full campaign region · 6 zones · 24 nodes';
  blurbEl.textContent = 'Six linked zones on a single landmass, joined by six overland routes. The keep plateau is the campaign hub; the cavern sits below sea level and is reached only through the bog.';
  document.querySelectorAll('[data-r]').forEach((x) => x.classList.remove('is-on'));
});

setView('iso');
