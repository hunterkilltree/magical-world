import * as THREE from 'three';

const mats = {};
const mat = (name, o) => (mats[name] ||= new THREE.MeshStandardMaterial({ name, ...o }));
const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

const W = 26, H = 18, T = 0.42;

// ---------------------------------------------------------------- layouts
// . floor   , rough/slow   # blocker   ~ hazard   ^ raised ledge
// o cover   D destructible G chokepoint gate
// S party entry   E enemy spawn   C loot   B boss pad   * shrine
const ZONES = [
  {
    id: 'tundra', name: 'Hvítmark Tundra', sub: 'Zone 1 · opening gauntlet',
    objective: 'Cross the shelf and hold the north bridge until the gate opens.',
    beats: ['Entry on the south shelf — no cover, wind pushes the party north.',
      'First gate: thin ice on both flanks forces a single file crossing.',
      'Mid shelf opens out — two raiding parties, boulders are the only cover.',
      'Second gate, then the cache before the north exit.'],
    ground: 0xdfe9f0, rough: 0xc4d6e2, rock: 0x8fa3b3, hazardColor: 0x9fd8ef, hazard: 'Thin ice — breaks under weight',
    dress: 'ice', glow: 0x7dd3fc,
    rows: [
      '          ##..##          ',
      '        ###....###        ',
      '       ##,,....,,##       ',
      '      ##,,..oo..,,##      ',
      '     ##,,...GG...,,##     ',
      '    ##~~~~..##..~~~~##    ',
      '   ##~~~~~..##..~~~~~##   ',
      '  ##,,..~~~.##.~~~..,,##  ',
      ' ##,,..oo.......oo..,,##  ',
      ' ##,....E.......E....,,## ',
      ' ##,,...............,,##  ',
      '  ##,,..~~~~~~~..,,##     ',
      '   ##,,.~~~~~~~.,,##      ',
      '    ##,,...GG...,,##      ',
      '     ##,,..CC..,,##       ',
      '      ##,,.....,,##       ',
      '       ###.SS.###         ',
      '         ######           '
    ]
  },
  {
    id: 'pine', name: 'Ashvold Pinewood', sub: 'Zone 2 · cover and ambush',
    objective: 'Reach the north-east cache without being flanked in the deep wood.',
    beats: ['Two entry lanes from the south clearing — pick a side, they diverge fast.',
      'Pine stands break line of sight; ambushers use the middle corridor.',
      'A single gate at the west lane is the only way back once you commit.',
      'Cache sits behind a log pile — burn it or go the long way.'],
    ground: 0x4e6b3c, rough: 0x6b6a3c, rock: 0x6b5a44, hazardColor: 0x3f5f45, hazard: 'Bramble — slows movement',
    dress: 'pine', glow: 0x76c04a,
    rows: [
      '   ####      ####    #### ',
      '  ##..##    ##..####..CC##',
      ' ##..oo##  ##..oo..##..,##',
      ' ##....####..,,..oo##..,##',
      '##..oo....,,....##..##..##',
      '##....GG..oo..,,..##....##',
      '##,,..##....E...........##',
      ' ##,..##..oo..##..oo..,,##',
      ' ##...####,,..##....##..##',
      '##..oo..##....E...##..oo##',
      '##....,,##..oo..##....,,##',
      '##,,....##....,,##..DD..##',
      ' ##..oo..GG....##..oo..## ',
      ' ##....##..,,..##....,,## ',
      '  ##,,..##..oo....##..##  ',
      '  ##..SS....,,..oo..,,##  ',
      '   ####..####....####     ',
      '      ####  ######        '
    ]
  },
  {
    id: 'keep', name: 'Grauhold Keep', sub: 'Zone 3 · campaign hub, boss court',
    objective: 'Breach the gatehouse, take the inner court, kill the Warden.',
    beats: ['Approach from the south road into the outer bailey.',
      'Gatehouse chokepoint — the only breach in the curtain wall.',
      'Inner keep is a ring of destructible wall sections around the court.',
      'Boss court at the centre; the north shrine platform is the reward.'],
    ground: 0x9a9187, rough: 0x8a8177, rock: 0x6f6862, hazardColor: 0x5c5a54, hazard: 'Collapsed floor',
    dress: 'ruin', glow: 0xc9a227,
    rows: [
      '     ##################   ',
      '    ##..............##    ',
      '   ##..^^^......^^^..##   ',
      '  ##..^^**^....^^..^^..## ',
      '  ##...^^^^....^^^^...##  ',
      ' ##..oo....CC....oo..##   ',
      ' ##......########......## ',
      ' ##..DD..##....##..DD..## ',
      '##......##..BB..##......##',
      '##..oo..##......##..oo..##',
      '##......##......##......##',
      ' ##..DD..##..GG##..DD..## ',
      ' ##......########......## ',
      ' ##..oo....E.E....oo..##  ',
      '  ##..............,,..##  ',
      '   ##..,,..GG..,,....##   ',
      '    ####....SS....####    ',
      '       ############       '
    ]
  },
  {
    id: 'volcano', name: 'Eldrhólt Wastes', sub: 'Zone 4 · lava islands',
    objective: 'Cross three cinder islands and break the Colossus on the north shelf.',
    beats: ['South cinder flat — safe staging, ash vents open under you.',
      'First lava channel: two narrow basalt crossings, both watched.',
      'Central island holds the cache and the widest fighting space.',
      'North shelf raises the Colossus above the lava — no retreat.'],
    ground: 0x4a3a34, rough: 0x5c4238, rock: 0x2f2622, hazardColor: 0xff7a2f, hazard: 'Lava channel',
    dress: 'basalt', glow: 0xff7a2f,
    rows: [
      '   ####~~~~~~~~####       ',
      '  ##,,..##~~~~##..BB##    ',
      ' ##..oo..##~~##..^^^^##   ',
      ' ##....,,.GG..,,....##    ',
      '##..DD..~~~~~~~~..oo##    ',
      '##....~~~~~~~~~~~~..##    ',
      ' ##..~~~~~..CC..~~~..##   ',
      ' ##,,..~~..oo..~~..,,##   ',
      '##..oo..~~....~~..oo..##  ',
      '##....E..~~~~~~..E....##  ',
      '##,,....~~~~~~~~....,,##  ',
      ' ##..oo..~~~~~~..oo..##   ',
      ' ##....,,..GG..,,....##   ',
      '  ##..DD..~~~~..oo..##    ',
      '  ##,,......,,......##    ',
      '   ##..oo..SS..,,..##     ',
      '    ####........####      ',
      '       ##########         '
    ]
  },
  {
    id: 'bog', name: 'Mirefen Bog', sub: 'Zone 5 · open water, no boss',
    objective: 'Follow the causeways to the sunken barge and get out before dark.',
    beats: ['Ferry landing in the south — everything beyond it is knee-deep.',
      'Mud causeways are the only fast ground; water halves movement.',
      'Two gates split the fen into three pockets, each with dead stands.',
      'Barge cache in the north-east; dead stands burn and open new lanes.'],
    ground: 0x50603a, rough: 0x5e5a34, rock: 0x3d4230, hazardColor: 0x2f4436, hazard: 'Sink pool — heavy slow',
    dress: 'bog', glow: 0x8fbf4a,
    rows: [
      '  ~~~~~~~~~~~~~~~~~~~~~~  ',
      ' ~~..oo~~~~,,..~~~~CC..~~ ',
      ' ~~....~~~,,....~~~....~~ ',
      '~~..DD..~~,,..oo~~..oo..~~',
      '~~....,,~~,,....~~....,,~~',
      '~~,,....~~~,,..~~~,,....~~',
      '~~..oo..GG..,,..GG..oo..~~',
      '~~....~~~~..E...~~~~....~~',
      '~~..DD~~~~,,....~~~~DD..~~',
      '~~....~~~,,..oo..~~~....~~',
      '~~,,..~~~,,....,,~~~..,,~~',
      '~~..oo..~~,,..~~~~..oo..~~',
      '~~......~~~..E..~~~.....~~',
      '~~..DD..~~~,,..~~~..oo..~~',
      ' ~~....,,..GG..,,....,,~~ ',
      ' ~~..oo....SS....,,..~~~~ ',
      '  ~~~~~~~~~~~~~~~~~~~~~~  ',
      '     ~~~~~~~~~~~~~~~~     '
    ]
  },
  {
    id: 'cavern', name: 'Sunken Verrglass', sub: 'Zone 6 · one way in',
    objective: 'Descend the crystal throat to the hollow. The way out is the way in.',
    beats: ['Cave mouth in the south — a single tile wide, easily held.',
      'Throat narrows past the gate; crystal shelves give the only cover.',
      'Void pools spread across the mid chamber, lit by the crystals.',
      'The hollow opens onto a raised crystal dais and the boss.'],
    ground: 0x3b3358, rough: 0x463b63, rock: 0x2a2440, hazardColor: 0x6b3fa8, hazard: 'Void pool',
    dress: 'crystal', glow: 0xa855f7,
    rows: [
      '        ##########        ',
      '      ##..,,..,,..##      ',
      '    ##..oo..BB..oo..##    ',
      '   ##..,,..^^^^..,,..##   ',
      '   ##..~~..^^^^..~~..##   ',
      '  ##..oo..,,..,,..oo..##  ',
      '  ##,,......E.......,,##  ',
      '   ##..oo..~~~~..oo..##   ',
      '    ##....~~~~~~....##    ',
      '     ##..oo..~~..oo##     ',
      '      ##,,......,,##      ',
      '       ##..GG..,,##       ',
      '       ##..,,..oo##       ',
      '      ##..oo..,,..##      ',
      '      ##..CC....DD##      ',
      '       ##..,,..,,##       ',
      '        ##..SS..##        ',
      '         ########         '
    ]
  }
];

const KEY = [
  { color: 0x4ade80, label: 'Party entry' },
  { color: 0xef4444, label: 'Enemy spawn' },
  { color: 0xf7e26b, label: 'Chokepoint gate' },
  { color: 0xc9a227, label: 'Loot cache' },
  { color: 0x94a3b8, label: 'Cover' },
  { color: 0xa855f7, label: 'Destructible' },
  { color: 0xff7a2f, label: 'Hazard' },
  { color: 0xffffff, label: 'Raised ledge' }
];

// ---------------------------------------------------------------- build
function buildZone(z) {
  const g = new THREE.Group();
  g.name = z.id + '_zone';
  const rand = rng(z.id.length * 7919 + 13);

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

  const M = {
    floor: mat(z.id + '_floor', { color: z.ground, roughness: 0.95 }),
    rough: mat(z.id + '_rough', { color: z.rough, roughness: 0.98 }),
    rock: mat(z.id + '_rock', { color: z.rock, roughness: 0.93 }),
    ledge: mat(z.id + '_ledge', { color: z.ground, roughness: 0.85 }),
    hazard: mat(z.id + '_hazard', { color: z.hazardColor, emissive: z.dress === 'basalt' ? z.hazardColor : 0x000000, emissiveIntensity: z.dress === 'basalt' ? 0.8 : 0, roughness: 0.3, metalness: 0.15 }),
    glow: mat(z.id + '_glow', { color: z.glow, emissive: z.glow, emissiveIntensity: 0.75, roughness: 0.3 }),
    cover: mat(z.id + '_cover', { color: 0x7f7a72, roughness: 0.96 }),
    wood: mat('crate', { color: 0x6b4a28, roughness: 0.92 }),
    metal: mat('gate_metal', { color: 0x6f6862, roughness: 0.5, metalness: 0.35 }),
    brass: mat('brass_trim', { color: 0xc9a227, roughness: 0.36, metalness: 0.4 }),
    friendly: mat('entry_marker', { color: 0x4ade80, emissive: 0x22c55e, emissiveIntensity: 0.6, roughness: 0.35 }),
    hostile: mat('enemy_marker', { color: 0xef4444, emissive: 0xdc2626, emissiveIntensity: 0.6, roughness: 0.35 }),
    gate: mat('gate_marker', { color: 0xf7e26b, emissive: 0xeab308, emissiveIntensity: 0.55, roughness: 0.35 }),
    destruct: mat('destruct_marker', { color: 0xa855f7, emissive: 0x9333ea, emissiveIntensity: 0.55, roughness: 0.35 })
  };

  const pos = (col, row) => [(col - (W - 1) / 2) * T, 0, (row - (H - 1) / 2) * T];
  const grid = z.rows.map((r) => r.padEnd(W, ' ').slice(0, W));
  const heightOf = { '.': 0.16, ',': 0.13, '#': 0.78, '~': 0.05, '^': 0.44 };
  const cellH = {};

  grid.forEach((line, row) => {
    for (let col = 0; col < W; col++) {
      const ch = line[col];
      if (ch === ' ') continue;
      const [x, , zz] = pos(col, row);
      const base = ch === '#' ? '#' : ch === '~' ? '~' : ch === '^' ? '^' : ch === ',' ? ',' : '.';
      const h = heightOf[base];
      cellH[`${col},${row}`] = h;
      const m = base === '#' ? M.rock : base === '~' ? M.hazard : base === ',' ? M.rough : base === '^' ? M.ledge : M.floor;
      add(new THREE.BoxGeometry(T * 0.985, h, T * 0.985), m, `${z.id}_tile_${col}_${row}`, [x, h / 2, zz]);
      if (base === '#') {
        add(new THREE.BoxGeometry(T * 0.99, 0.06, T * 0.99), M.floor, `${z.id}_cap_${col}_${row}`, [x, h + 0.03, zz]);
      }
      if (base === '^') {
        add(new THREE.BoxGeometry(T * 0.99, 0.05, T * 0.99), M.brass, `${z.id}_ledge_edge_${col}_${row}`, [x, h + 0.025, zz]);
      }
    }
  });

  const top = (col, row) => cellH[`${col},${row}`] ?? 0.16;

  // ---- markers & props --------------------------------------------------
  const seen = {};
  grid.forEach((line, row) => {
    for (let col = 0; col < W; col++) {
      const ch = line[col];
      const [x, , zz] = pos(col, row);
      const y = top(col, row);
      const nm = `${z.id}_${ch}_${col}_${row}`;

      if (ch === 'o') {
        for (let k = 0; k < 3; k++) {
          add(new THREE.DodecahedronGeometry(0.085 + rand() * 0.04, 0), M.cover, nm + '_rock' + k,
            [x + (rand() - 0.5) * 0.22, y + 0.07, zz + (rand() - 0.5) * 0.22], [rand() * 3, rand() * 3, rand() * 0.6]);
        }
      }
      if (ch === 'D') {
        add(new THREE.BoxGeometry(0.26, 0.24, 0.26), M.wood, nm + '_crate', [x, y + 0.12, zz], [0, rand() * 0.8, 0]);
        add(new THREE.BoxGeometry(0.28, 0.03, 0.28), M.destruct, nm + '_band', [x, y + 0.245, zz], [0, rand() * 0.8, 0]);
      }
      if (ch === 'G' && line[col - 1] !== 'G') {
        [-1, 1].forEach((sd, k) => add(new THREE.CylinderGeometry(0.05, 0.065, 0.62, 8), M.metal, `${nm}_post${k}`, [x + sd * 0.30, y + 0.31, zz]));
        add(new THREE.BoxGeometry(0.86, 0.09, 0.14), M.gate, nm + '_lintel', [x + 0.21, y + 0.66, zz]);
      }
      if (ch === 'S' && !seen.S) {
        seen.S = true;
        const ring = add(new THREE.TorusGeometry(0.30, 0.035, 10, 30), M.friendly, nm + '_ring', [x + 0.21, y + 0.05, zz]);
        ring.rotation.x = Math.PI / 2;
        add(new THREE.ConeGeometry(0.10, 0.30, 10), M.friendly, nm + '_arrow', [x + 0.21, y + 0.24, zz]);
      }
      if (ch === 'E') {
        add(new THREE.OctahedronGeometry(0.10, 0), M.hostile, nm + '_pin', [x, y + 0.34, zz], null, [1, 1.4, 1]);
        add(new THREE.CylinderGeometry(0.012, 0.012, 0.30, 6), M.metal, nm + '_pole', [x, y + 0.15, zz]);
      }
      if (ch === 'C' && line[col - 1] !== 'C') {
        add(new THREE.BoxGeometry(0.30, 0.20, 0.24), M.wood, nm + '_chest', [x + 0.21, y + 0.10, zz], [0, 0.4, 0]);
        add(new THREE.CylinderGeometry(0.12, 0.12, 0.30, 12, 1, false, 0, Math.PI), M.wood, nm + '_lid', [x + 0.21, y + 0.20, zz], [0, 0, Math.PI / 2]);
        add(new THREE.BoxGeometry(0.32, 0.04, 0.04), M.brass, nm + '_band', [x + 0.21, y + 0.13, zz], [0, 0.4, 0]);
      }
      if (ch === 'B' && !seen.B) {
        seen.B = true;
        add(new THREE.CylinderGeometry(0.52, 0.58, 0.10, 24), mat('boss_pad', { color: 0x6b2020, roughness: 0.9 }), nm + '_pad', [x + 0.21, y + 0.05, zz]);
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI * 2 + 0.4;
          add(new THREE.CylinderGeometry(0.045, 0.055, 0.50, 8), mat('boss_pillar', { color: 0x8a2b2b, roughness: 0.88 }),
            `${nm}_pillar${k}`, [x + 0.21 + Math.sin(a) * 0.44, y + 0.30, zz + Math.cos(a) * 0.44]);
        }
      }
      if (ch === '*' && !seen['*']) {
        seen['*'] = true;
        add(new THREE.CylinderGeometry(0.24, 0.30, 0.14, 16), M.brass, nm + '_shrine_base', [x + 0.21, y + 0.07, zz]);
        add(new THREE.OctahedronGeometry(0.14, 0), M.glow, nm + '_shrine_gem', [x + 0.21, y + 0.34, zz], null, [1, 1.5, 1]);
      }
    }
  });

  // ---- biome dressing on rough tiles ------------------------------------
  const roughCells = [];
  grid.forEach((line, row) => {
    for (let col = 0; col < W; col++) if (line[col] === ',') roughCells.push([col, row]);
  });
  const pickCells = (n) => {
    const out = [];
    for (let i = 0; i < n && roughCells.length; i++) out.push(roughCells[(rand() * roughCells.length) | 0]);
    return out;
  };

  pickCells(z.dress === 'pine' ? 30 : 22).forEach(([col, row], i) => {
    const [x, , zz] = pos(col, row);
    const y = top(col, row);
    const jx = (rand() - 0.5) * 0.22, jz = (rand() - 0.5) * 0.22;
    const s = 0.6 + rand() * 0.7;

    if (z.dress === 'pine') {
      add(new THREE.CylinderGeometry(0.022, 0.030, 0.18 * s, 8), mat('trunk', { color: 0x4a3423, roughness: 0.95 }), `pine_trunk_${i}`, [x + jx, y + 0.09 * s, zz + jz]);
      for (let k = 0; k < 3; k++) {
        add(new THREE.ConeGeometry(0.17 * s * (1 - k * 0.22), 0.24 * s, 8), mat('pine_needle', { color: 0x2f5230, roughness: 0.95 }),
          `pine_${i}_${k}`, [x + jx, y + (0.20 + k * 0.14) * s, zz + jz]);
      }
    } else if (z.dress === 'ice') {
      add(new THREE.ConeGeometry(0.075 * s, 0.40 * s, 5), mat('ice_spike', { color: 0xbfe4f5, roughness: 0.2 }), `ice_spike_${i}`,
        [x + jx, y + 0.20 * s, zz + jz], [(rand() - 0.5) * 0.3, rand() * 3, (rand() - 0.5) * 0.3]);
    } else if (z.dress === 'basalt') {
      add(new THREE.CylinderGeometry(0.055 * s, 0.08 * s, 0.36 * s, 6), mat('basalt', { color: 0x2b2422, roughness: 0.95 }), `basalt_${i}`,
        [x + jx, y + 0.18 * s, zz + jz], [0, rand() * 3, (rand() - 0.5) * 0.2]);
    } else if (z.dress === 'bog') {
      add(new THREE.CylinderGeometry(0.020, 0.034, 0.46 * s, 6), mat('dead_wood', { color: 0x4a4436, roughness: 0.97 }), `dead_tree_${i}`,
        [x + jx, y + 0.23 * s, zz + jz], [(rand() - 0.5) * 0.2, 0, (rand() - 0.5) * 0.2]);
      add(new THREE.CylinderGeometry(0.011, 0.014, 0.20 * s, 5), mat('dead_wood', { color: 0x4a4436, roughness: 0.97 }), `branch_${i}`,
        [x + jx, y + 0.36 * s, zz + jz], [0, rand() * 3, 0.9]);
    } else if (z.dress === 'crystal') {
      add(new THREE.OctahedronGeometry(0.085 * s, 0), M.glow, `crystal_${i}`,
        [x + jx, y + 0.14 * s, zz + jz], [(rand() - 0.5) * 0.5, rand() * 3, (rand() - 0.5) * 0.5], [0.7, 1.9, 0.7]);
    } else {
      add(new THREE.CylinderGeometry(0.05, 0.065, 0.34 * s, 8), mat('broken_pillar', { color: 0x8a8279, roughness: 0.94 }), `pillar_${i}`,
        [x + jx, y + 0.17 * s, zz + jz], [(rand() - 0.5) * 0.25, rand() * 3, (rand() - 0.5) * 0.25]);
    }
  });

  return g;
}

// ---------------------------------------------------------------- mount
const stage = document.querySelector('three-d-stage');
await stage.ready;
const cam = stage._camera, ctr = stage._controls;

const VIEWS = {
  top: new THREE.Vector3(0.001, 1, 0.16),
  iso: new THREE.Vector3(1, 0.95, 1),
  low: new THREE.Vector3(0.9, 0.36, 1.3)
};
let view = 'iso';
let framed = new THREE.Sphere();

function setView(key) {
  view = key;
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

const els = {
  name: document.getElementById('z-name'),
  sub: document.getElementById('z-sub'),
  obj: document.getElementById('z-objective'),
  beats: document.getElementById('z-beats'),
  hazard: document.getElementById('z-hazard')
};

const params = new URLSearchParams(location.search);
let current = Math.max(0, ZONES.findIndex((z) => z.id === params.get('z')));

function show(i) {
  current = i;
  const z = ZONES[i];
  const obj = buildZone(z);
  stage.setObject(obj);
  stage.setAttribute('name', z.id + '-zone');
  new THREE.Box3().setFromObject(obj).getBoundingSphere(framed);
  setView(view);
  els.name.textContent = z.name;
  els.sub.textContent = z.sub;
  els.obj.textContent = z.objective;
  els.hazard.textContent = z.hazard;
  els.beats.innerHTML = '';
  z.beats.forEach((b, k) => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="n">${k + 1}</span>${b}`;
    els.beats.appendChild(li);
  });
  document.querySelectorAll('[data-z]').forEach((b) => b.classList.toggle('is-on', b.dataset.z === z.id));
  history.replaceState(null, '', '?z=' + z.id);
}

const list = document.getElementById('zones');
ZONES.forEach((z, i) => {
  const b = document.createElement('button');
  b.className = 'chip';
  b.dataset.z = z.id;
  b.innerHTML = `<span class="swatch" style="background:#${z.glow.toString(16).padStart(6, '0')}"></span>${z.name}`;
  b.addEventListener('click', () => show(i));
  list.appendChild(b);
});

document.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.v)));

const legend = document.getElementById('legend');
KEY.forEach((k) => {
  const row = document.createElement('div');
  row.className = 'legend-row';
  row.innerHTML = `<span class="swatch" style="background:#${k.color.toString(16).padStart(6, '0')}"></span>${k.label}`;
  legend.appendChild(row);
});

show(current);
