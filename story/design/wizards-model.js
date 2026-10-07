import * as THREE from 'three';

const mats = {};
const mat = (name, o) => (mats[name] ||= new THREE.MeshStandardMaterial({ name, ...o }));

const skin = () => mat('skin', { color: 0xe0b48c, roughness: 0.85 });
const iron = () => mat('iron', { color: 0x6b7078, roughness: 0.5, metalness: 0.35 });
const brass = () => mat('brass', { color: 0xc79a45, roughness: 0.36, metalness: 0.38 });
const wood = () => mat('wood', { color: 0x7a5a34, roughness: 0.92 });
const boot = () => mat('boot_leather', { color: 0x3b2c22, roughness: 0.9 });
const bone = () => mat('bone', { color: 0xded3bb, roughness: 0.85 });

const HIP = 0.74, THIGH = 0.34, SHIN = 0.32;

function buildWizard(s) {
  const g = new THREE.Group();
  g.name = s.id;
  const root = new THREE.Group();
  root.name = 'root';
  g.add(root);

  const rig = { hips: [], knees: [], ankles: [], shoulders: [], panels: [], soles: [], root, head: null };

  const add = (parent, geo, m, name, pos, rot, scale) => {
    const o = new THREE.Mesh(geo, m);
    o.name = name;
    o.castShadow = true; o.receiveShadow = true;
    if (pos) o.position.set(...pos);
    if (rot) o.rotation.set(...rot);
    if (scale) o.scale.set(...scale);
    parent.add(o);
    return o;
  };

  const robeMat = mat(s.id + '_robe', { color: s.robe, roughness: 0.93 });
  const trimMat = mat(s.id + '_trim', { color: s.trim, roughness: 0.55, metalness: 0.2 });
  const legMat = mat(s.id + '_legwrap', { color: s.legs, roughness: 0.94 });
  const glowMat = mat(s.id + '_glow', { color: s.glow, emissive: s.glow, emissiveIntensity: 0.9, roughness: 0.2, metalness: 0.05 });
  const hairMat = mat(s.id + '_hair', { color: s.hair, roughness: 0.95 });

  // ---- legs (rigged) ----------------------------------------------------
  [-1, 1].forEach((sd, i) => {
    const hip = new THREE.Group();
    hip.name = `hip_${i}`;
    hip.position.set(sd * 0.115, HIP, 0);
    root.add(hip);

    add(hip, new THREE.SphereGeometry(0.098, 18, 14), legMat, `hip_joint_${i}`, [0, 0, 0], null, [1, 0.9, 1]);
    add(hip, new THREE.CapsuleGeometry(0.082, THIGH - 0.10, 8, 18), legMat, `thigh_${i}`, [0, -THIGH / 2, 0]);

    const knee = new THREE.Group();
    knee.name = `knee_${i}`;
    knee.position.set(0, -THIGH, 0);
    hip.add(knee);
    add(knee, new THREE.SphereGeometry(0.073, 16, 12), legMat, `knee_joint_${i}`);
    add(knee, new THREE.CapsuleGeometry(0.066, SHIN - 0.10, 8, 18), legMat, `shin_${i}`, [0, -SHIN / 2, 0]);

    const wrap = add(knee, new THREE.TorusGeometry(0.072, 0.016, 8, 22), trimMat, `shin_wrap_${i}`, [0, -SHIN * 0.45, 0]);
    wrap.rotation.x = Math.PI / 2;
    wrap.rotation.z = 0.2;

    const ankle = new THREE.Group();
    ankle.name = `ankle_${i}`;
    ankle.position.set(0, -SHIN, 0);
    knee.add(ankle);
    add(ankle, new THREE.CylinderGeometry(0.072, 0.062, 0.10, 14), boot(), `boot_cuff_${i}`, [0, 0.015, 0]);
    const f = add(ankle, new THREE.BoxGeometry(0.108, 0.072, 0.235), boot(), `foot_${i}`, [0, -0.038, 0.052]);
    f.geometry.translate(0, 0, 0);
    add(ankle, new THREE.SphereGeometry(0.054, 14, 10), boot(), `toe_${i}`, [0, -0.040, 0.158], null, [1, 0.72, 1.25]);
    rig.soles.push(add(ankle, new THREE.BoxGeometry(0.112, 0.022, 0.238), mat('sole', { color: 0x241a14, roughness: 0.98 }), `sole_${i}`, [0, -0.072, 0.052]));

    rig.hips.push(hip); rig.knees.push(knee); rig.ankles.push(ankle);
  });

  // ---- coat (hem at the hip so the legs read) ---------------------------
  const flare = s.flare ?? 1;
  const prof = [
    [0.04, 0.640], [0.335 * flare, 0.650], [0.348 * flare, 0.700], [0.315, 0.840],
    [0.272, 1.000], [0.238, 1.060], [0.250, 1.170], [0.175, 1.270], [0.105, 1.300]
  ].map(([r, y]) => new THREE.Vector2(r, y));
  add(root, new THREE.LatheGeometry(prof, 40), robeMat, 'coat');

  const hem = add(root, new THREE.TorusGeometry(0.343 * flare, 0.024, 12, 44), trimMat, 'coat_hem', [0, 0.672, 0]);
  hem.rotation.x = Math.PI / 2;

  // hanging front / back panels — side slits let the stride show
  [[0, 'front'], [Math.PI, 'back']].forEach(([rotY, tag], k) => {
    const panel = new THREE.Group();
    panel.name = `panel_${tag}`;
    panel.position.set(0, 0.70, 0);
    panel.rotation.y = rotY;
    root.add(panel);
    const len = s.tattered ? 0.60 : 0.48;
    const p = add(panel, new THREE.CylinderGeometry(0.335 * flare, 0.375 * flare, len, 24, 1, true, -0.82, 1.64),
      robeMat, `skirt_${tag}`, [0, -len / 2, 0]);
    p.material.side = THREE.DoubleSide;
    const edge = add(panel, new THREE.TorusGeometry(0.372 * flare, 0.018, 8, 26, 1.64), trimMat, `skirt_edge_${tag}`, [0, -len, 0]);
    edge.rotation.set(Math.PI / 2, 0, -0.82 + Math.PI / 2);
    if (s.tattered) {
      for (let i = 0; i < 5; i++) {
        const a = -0.72 + (i / 4) * 1.44;
        add(panel, new THREE.ConeGeometry(0.048, 0.20, 5), robeMat, `tatter_${tag}_${i}`,
          [Math.sin(a) * 0.365 * flare, -len - 0.06, Math.cos(a) * 0.365 * flare], [Math.PI, a, 0]);
      }
    }
    rig.panels.push(panel);
  });

  add(root, new THREE.BoxGeometry(0.072, 0.62, 0.02), trimMat, 'placket', [0, 0.98, 0.288], [0.10, 0, 0]);

  // ---- belt -------------------------------------------------------------
  const belt = add(root, new THREE.TorusGeometry(0.285, 0.036, 12, 40), trimMat, 'belt', [0, 0.86, 0]);
  belt.rotation.x = Math.PI / 2;
  add(root, new THREE.BoxGeometry(0.115, 0.09, 0.045), brass(), 'buckle', [0, 0.86, 0.29]);
  if (s.pouch) add(root, new THREE.SphereGeometry(0.075, 16, 12), boot(), 'pouch', [0.215, 0.795, 0.20], null, [1, 0.9, 0.7]);

  // ---- shoulders --------------------------------------------------------
  if (s.pads === 'stone') {
    [-1, 1].forEach((sd, i) => add(root, new THREE.DodecahedronGeometry(0.135, 0), trimMat, `pad_${i}`,
      [sd * 0.215, 1.19, 0], [0.3 * i, 0.6 * i, 0.2]));
  } else if (s.pads === 'plate') {
    [-1, 1].forEach((sd, i) => add(root, new THREE.SphereGeometry(0.135, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      trimMat, `pad_${i}`, [sd * 0.205, 1.17, 0], [0, 0, sd * 0.35]));
  } else if (s.pads === 'mantle') {
    const m = add(root, new THREE.SphereGeometry(0.31, 26, 16, 0, Math.PI * 2, 0, Math.PI / 2.1), trimMat, 'mantle', [0, 1.10, 0]);
    m.scale.set(1, 0.72, 1);
  }

  // ---- arms (rigged at the shoulder) ------------------------------------
  const holds = (sd) => s.prop && s.prop !== 'orb' && ((s.propSide ?? 'right') === (sd < 0 ? 'left' : 'right'));
  [-1, 1].forEach((sd, i) => {
    const raised = s.raise === (sd < 0 ? 'left' : 'right');
    const sh = new THREE.Group();
    sh.name = `shoulder_${i}`;
    sh.position.set(sd * 0.19, 1.17, 0);
    root.add(sh);
    sh.userData.locked = raised || holds(sd);

    const P = (x, y, z) => new THREE.Vector3(sd * x - sd * 0.19, y - 1.17, z);
    const curve = new THREE.CatmullRomCurve3(raised
      ? [P(0.19, 1.17, 0), P(0.34, 1.20, 0.06), P(0.40, 1.36, 0.14), P(0.34, 1.52, 0.18)]
      : [P(0.19, 1.17, 0), P(0.30, 1.03, 0.04), P(0.33, 0.88, 0.12), P(0.30, 0.80, 0.20)]);
    add(sh, new THREE.TubeGeometry(curve, 30, 0.072, 14, false), robeMat, `sleeve_${i}`);

    const cuff = add(sh, new THREE.TorusGeometry(0.076, 0.018, 10, 24), trimMat, `cuff_${i}`);
    cuff.position.copy(curve.getPointAt(0.86));
    cuff.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), curve.getTangentAt(0.86));
    const hand = add(sh, new THREE.SphereGeometry(0.055, 16, 12), skin(), `hand_${i}`);
    hand.position.copy(curve.getPointAt(1));
    if (raised) s._raisedHand = hand.getWorldPosition(new THREE.Vector3()).add(sh.position.clone().multiplyScalar(0));
    if (raised) s._raisedLocal = { x: sh.position.x + hand.position.x, y: sh.position.y + hand.position.y, z: hand.position.z };

    rig.shoulders.push(sh);
  });

  // ---- head -------------------------------------------------------------
  const headG = new THREE.Group();
  headG.name = 'head_pivot';
  headG.position.set(0, 1.30, 0);
  root.add(headG);
  rig.head = headG;
  const HY = 0.12;

  add(headG, new THREE.CylinderGeometry(0.075, 0.09, 0.09, 16), skin(), 'neck', [0, 0.01, 0]);
  const head = add(headG, new THREE.SphereGeometry(0.155, 26, 20), skin(), 'head', [0, HY, 0]);
  head.scale.set(1, 1.06, 0.98);
  add(headG, new THREE.ConeGeometry(0.033, 0.09, 12), skin(), 'nose', [0, HY - 0.02, 0.15], [Math.PI / 2, 0, 0]);

  if (s.face === 'void') {
    const v = add(headG, new THREE.SphereGeometry(0.15, 22, 16), mat('void', { color: 0x0b0714, roughness: 1 }), 'void_face', [0, HY, 0.03]);
    v.scale.set(0.95, 1, 0.9);
  }
  [-1, 1].forEach((sd, i) => add(headG, new THREE.SphereGeometry(0.021, 12, 10),
    s.face === 'void' ? glowMat : mat('eye', { color: 0x241c18, roughness: 0.4 }), `eye_${i}`, [sd * 0.058, HY + 0.03, 0.138]));

  if (s.beard) {
    const len = s.beard;
    const bp = [[0.005, 0], [0.10, 0.05], [0.135, 0.16], [0.15, 0.30], [0.14, 0.44], [0.10, 0.54], [0.03, 0.60]]
      .map(([r, y]) => new THREE.Vector2(r, HY - 0.03 - (0.60 - y) * len));
    const b = add(headG, new THREE.LatheGeometry(bp, 28), hairMat, 'beard', [0, 0, 0.035]);
    b.scale.set(1, 1, 0.72);
    add(headG, new THREE.BoxGeometry(0.11, 0.035, 0.03), hairMat, 'moustache', [0, HY + 0.005, 0.145]);
  }
  if (s.brows) [-1, 1].forEach((sd, i) => add(headG, new THREE.BoxGeometry(0.058, 0.022, 0.024), hairMat,
    `brow_${i}`, [sd * 0.062, HY + 0.068, 0.132], [0, 0, sd * 0.22]));
  if (s.wildHair) {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      add(headG, new THREE.ConeGeometry(0.032, 0.24, 6), hairMat, `hair_${i}`,
        [Math.sin(a) * 0.11, HY + 0.12, Math.cos(a) * 0.11], [Math.cos(a) * 0.7, 0, -Math.sin(a) * 0.7]);
    }
  }

  const hat = s.hat;
  if (hat === 'point' || hat === 'tall' || hat === 'brim') {
    const h = hat === 'tall' ? 0.78 : hat === 'brim' ? 0.34 : 0.56;
    const br = hat === 'brim' ? 0.42 : hat === 'tall' ? 0.24 : 0.30;
    const rim = add(headG, new THREE.TorusGeometry(br, 0.035, 12, 40), robeMat, 'hat_brim', [0, HY + 0.11, 0]);
    rim.rotation.x = Math.PI / 2; rim.scale.set(1, 1, 0.55);
    add(headG, new THREE.CircleGeometry(br, 40), robeMat, 'brim_fill', [0, HY + 0.10, 0], [-Math.PI / 2, 0, 0]);
    add(headG, new THREE.ConeGeometry(br * 0.75, h, 26), robeMat, 'hat_cone',
      [0, HY + 0.12 + h / 2, 0], [s.hatTilt ?? -0.12, 0, s.hatLean ?? 0.10]);
    const band = add(headG, new THREE.TorusGeometry(br * 0.70, 0.028, 10, 34), trimMat, 'hat_band', [0, HY + 0.17, 0]);
    band.rotation.x = Math.PI / 2;
    const tip = add(headG, new THREE.SphereGeometry(0.045, 16, 12), glowMat, 'hat_tip',
      [Math.sin(s.hatLean ?? 0.10) * -h * 0.9, HY + 0.12 + h * 0.98, Math.sin(s.hatTilt ?? -0.12) * h * 0.9]);
    tip.scale.set(1, 1.2, 1);
  } else if (hat === 'hood' || hat === 'deephood') {
    const deep = hat === 'deephood';
    const hood = add(headG, new THREE.SphereGeometry(deep ? 0.225 : 0.205, 28, 20, 0, Math.PI * 2, 0, Math.PI * 0.62),
      robeMat, 'hood', [0, HY + 0.05, deep ? -0.03 : -0.02], [deep ? 0.30 : 0.22, 0, 0]);
    hood.scale.set(1, 1.25, 1.12);
    add(headG, new THREE.TorusGeometry(deep ? 0.185 : 0.17, 0.03, 12, 34), trimMat, 'hood_ring', [0, HY + 0.02, 0.045], [1.30, 0, 0]);
    const cowl = add(headG, new THREE.SphereGeometry(0.24, 26, 16, 0, Math.PI * 2, Math.PI * 0.42, Math.PI * 0.30), robeMat, 'cowl', [0, HY - 0.10, -0.02]);
    cowl.scale.set(1.25, 1.1, 1.15);
  } else if (hat === 'crown') {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      add(headG, new THREE.ConeGeometry(0.035, 0.20 + (i % 2) * 0.10, 5), glowMat, `spike_${i}`,
        [Math.sin(a) * 0.135, HY + 0.19, Math.cos(a) * 0.135], [Math.cos(a) * 0.28, 0, -Math.sin(a) * 0.28]);
    }
    const cr = add(headG, new THREE.TorusGeometry(0.145, 0.028, 10, 30), trimMat, 'crown_band', [0, HY + 0.10, 0]);
    cr.rotation.x = Math.PI / 2;
  } else if (hat === 'cap') {
    const c = add(headG, new THREE.SphereGeometry(0.17, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), robeMat, 'cap', [0, HY + 0.06, 0]);
    c.scale.set(1, 0.8, 1);
    const cb = add(headG, new THREE.TorusGeometry(0.168, 0.03, 10, 30), trimMat, 'cap_band', [0, HY + 0.06, 0]);
    cb.rotation.x = Math.PI / 2;
  }

  // ---- held prop --------------------------------------------------------
  const px = (s.propSide === 'left' ? -0.40 : 0.40);
  if (s.prop === 'staff' || s.prop === 'crystal' || s.prop === 'skull' || s.prop === 'rod') {
    const top = s.propHeight ?? 1.95;
    add(root, new THREE.CylinderGeometry(0.028, 0.033, top, 16), wood(), 'staff', [px, top / 2, 0.16], [0, 0, s.propLean ?? 0.05]);
    const hx = px + Math.sin(-(s.propLean ?? 0.05)) * top;
    if (s.prop === 'staff') {
      const ring = add(root, new THREE.TorusGeometry(0.10, 0.022, 12, 30), iron(), 'staff_ring', [hx, top - 0.02, 0.16]);
      ring.rotation.y = Math.PI / 2;
      add(root, new THREE.OctahedronGeometry(0.072, 0), glowMat, 'staff_gem', [hx, top - 0.02, 0.16], null, [1, 1.4, 1]);
    } else if (s.prop === 'crystal') {
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        add(root, new THREE.OctahedronGeometry(0.055, 0), glowMat, `shard_${i}`,
          [hx + Math.sin(a) * 0.06, top + 0.02 + (i % 2) * 0.05, 0.16 + Math.cos(a) * 0.06], [0.3, a, 0.2], [0.8, 1.9, 0.8]);
      }
      add(root, new THREE.ConeGeometry(0.07, 0.14, 14), iron(), 'crystal_socket', [hx, top - 0.07, 0.16]);
    } else if (s.prop === 'skull') {
      const sk = add(root, new THREE.SphereGeometry(0.10, 20, 16), bone(), 'skull', [hx, top + 0.03, 0.16]);
      sk.scale.set(0.95, 1, 1.05);
      add(root, new THREE.BoxGeometry(0.13, 0.055, 0.07), bone(), 'jaw', [hx, top - 0.05, 0.19]);
      [-1, 1].forEach((sd, i) => add(root, new THREE.SphereGeometry(0.028, 12, 10), glowMat, `skull_eye_${i}`, [hx + sd * 0.04, top + 0.05, 0.245]));
      [-1, 1].forEach((sd, i) => add(root, new THREE.ConeGeometry(0.032, 0.22, 6), bone(), `horn_${i}`, [hx + sd * 0.085, top + 0.11, 0.14], [0, 0, sd * -0.7]));
    } else {
      add(root, new THREE.CylinderGeometry(0.012, 0.012, 0.42, 10), iron(), 'rod_tip', [hx, top + 0.20, 0.16]);
      for (let i = 0; i < 3; i++) {
        add(root, new THREE.TorusGeometry(0.055 + i * 0.02, 0.012, 8, 24), glowMat, `coil_${i}`, [hx, top - 0.02 + i * 0.09, 0.16], [Math.PI / 2, 0, 0]);
      }
    }
  }
  if (s.prop === 'orb' && s._raisedLocal) {
    const p = s._raisedLocal;
    add(root, new THREE.IcosahedronGeometry(0.11, 1), glowMat, 'orb', [p.x, p.y + 0.16, p.z]);
    for (let i = 0; i < 3; i++) {
      add(root, new THREE.TorusGeometry(0.16 + i * 0.03, 0.008, 8, 34), brass(), `orb_ring_${i}`, [p.x, p.y + 0.16, p.z], [1.2 + i * 0.5, i * 0.8, 0.3]);
    }
  }
  if (s.prop === 'club') {
    const cx = 0.40;
    add(root, new THREE.CylinderGeometry(0.045, 0.055, 0.75, 14), wood(), 'club_haft', [cx, 0.72, 0.18], [0, 0, 0.22]);
    const hd = add(root, new THREE.DodecahedronGeometry(0.15, 0), trimMat, 'club_head', [cx + 0.17, 1.12, 0.18]);
    hd.rotation.set(0.4, 0.6, 0.2);
    add(root, new THREE.OctahedronGeometry(0.045, 0), glowMat, 'club_rune', [cx + 0.17, 1.12, 0.31]);
  }

  if (s.motes) {
    for (let i = 0; i < s.motes; i++) {
      const a = (i / s.motes) * Math.PI * 2 + 0.4;
      const r = 0.36 + (i % 3) * 0.10;
      add(root, new THREE.OctahedronGeometry(0.026 + (i % 2) * 0.012, 0), glowMat, `mote_${i}`,
        [Math.sin(a) * r, 0.85 + (i % 4) * 0.26, Math.cos(a) * r], [a, a * 0.7, 0.3]);
    }
  }

  return { group: g, rig };
}

export const WIZARDS = [
  { id: 'arcane_archmage', name: 'Aldric the Unwritten', role: 'Arcane Archmage',
    blurb: 'Robe of deep violet, an orbiting focus he never actually touches. Reads three spells ahead of you.',
    robe: 0x4a2f8f, trim: 0xc9a227, glow: 0x9c72ff, hair: 0xe6e2da, legs: 0x2f1f5c,
    hat: 'point', beard: 1.0, brows: true, pads: 'mantle', pouch: true, raise: 'right', prop: 'orb', motes: 8, flare: 1.02 },
  { id: 'ember_pyromancer', name: 'Brann Cinderhand', role: 'Ember Pyromancer',
    blurb: "Wide-brim traveller's hat, scorched hem, a staff that has been on fire more than once.",
    robe: 0x8c2f1b, trim: 0xd98324, glow: 0xff7a2f, hair: 0x3a2118, legs: 0x4a2318,
    hat: 'brim', beard: 0.55, brows: true, pads: 'plate', pouch: true, prop: 'staff', propSide: 'right', propHeight: 1.86, motes: 6 },
  { id: 'rime_cryomancer', name: 'Sister Vela', role: 'Rime Cryomancer',
    blurb: 'Hooded, ring-collared, carrying a socket of live rime shards. Speaks only when the room is quiet.',
    robe: 0x1f4e6b, trim: 0xa9e4f5, glow: 0x7dd3fc, hair: 0xdce9f2, legs: 0x14344a,
    hat: 'hood', beard: 0, brows: false, pads: 'mantle', prop: 'crystal', propSide: 'left', propHeight: 1.78, motes: 7, flare: 0.98 },
  { id: 'stone_druid', name: 'Old Morrow', role: 'Stone Druid',
    blurb: 'Granite pauldrons, moss-green wool, a rune-stone club. Argues with rocks and usually wins.',
    robe: 0x3f5e2e, trim: 0x8b7a5f, glow: 0x76c04a, hair: 0xb9b3a4, legs: 0x2c3f22,
    hat: 'cap', beard: 1.25, brows: true, pads: 'stone', pouch: true, prop: 'club', propSide: 'right', flare: 1.08 },
  { id: 'storm_conduit', name: 'Kessa Voltmark', role: 'Storm Conduit',
    blurb: 'Tall narrow hat, hair that has not lain flat in years, a copper-coiled conducting rod.',
    robe: 0x2b3a5c, trim: 0xd9b84a, glow: 0xf7e26b, hair: 0xe8d9a0, legs: 0x1d2740,
    hat: 'tall', beard: 0, brows: true, wildHair: true, pads: 'plate', prop: 'rod', propSide: 'right', propHeight: 1.62, motes: 9, hatLean: 0.16 },
  { id: 'void_necromancer', name: 'The Hollow Warden', role: 'Void Necromancer',
    blurb: 'Deep hood with nothing under it but two lights. Tattered hem, horned skull standard.',
    robe: 0x2a1b3d, trim: 0x6b21a8, glow: 0xa855f7, hair: 0x1a1526, legs: 0x1b1128,
    hat: 'deephood', face: 'void', beard: 0, pads: 'mantle', tattered: true, prop: 'skull', propSide: 'left', propHeight: 1.88, motes: 10, flare: 1.05 }
];

// ---------------------------------------------------------------- mount
const stage = document.querySelector('three-d-stage');
await stage.ready;

const params = new URLSearchParams(location.search);
let current = Math.max(0, WIZARDS.findIndex((w) => w.id === params.get('w')));
let mode = params.get('m') || 'walk';
let active = null;
let phase = 0;

const nameEl = document.getElementById('w-name');
const roleEl = document.getElementById('w-role');
const blurbEl = document.getElementById('w-blurb');

const GAIT = {
  idle: { speed: 1.5, amp: 0.06, lean: 0.0, bob: 0.006, arm: 0.5 },
  walk: { speed: 4.6, amp: 0.52, lean: 0.05, bob: 0.032, arm: 0.75 },
  run:  { speed: 8.6, amp: 0.98, lean: 0.20, bob: 0.062, arm: 1.05 }
};

function show(i) {
  current = i;
  const w = WIZARDS[i];
  const built = buildWizard({ ...w });
  active = built.rig;
  phase = 0;
  stage.setObject(built.group);
  stage.setAttribute('name', w.id.replace(/_/g, '-'));
  nameEl.textContent = w.name;
  roleEl.textContent = w.role;
  blurbEl.textContent = w.blurb;
  document.querySelectorAll('[data-w]').forEach((b) => b.classList.toggle('is-on', b.dataset.w === w.id));
  sync();
}

function sync() {
  document.querySelectorAll('[data-m]').forEach((b) => b.classList.toggle('is-on', b.dataset.m === mode));
  history.replaceState(null, '', `?w=${WIZARDS[current].id}&m=${mode}`);
}

const _v = new THREE.Vector3();
let last = performance.now();
function tick(now) {
  requestAnimationFrame(tick);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!active) return;
  const G = GAIT[mode] || GAIT.walk;
  phase += dt * G.speed;

  active.hips.forEach((hip, i) => {
    const p = phase + (i ? Math.PI : 0);
    const swing = Math.sin(p);
    hip.rotation.x = swing * G.amp - G.lean * 0.5;
    const bend = Math.max(0, Math.sin(p - 0.7));
    active.knees[i].rotation.x = -bend * G.amp * 1.55 - (mode === 'idle' ? 0.04 : 0.10);
    active.ankles[i].rotation.x = -swing * G.amp * 0.30 + bend * 0.18;
  });

  active.shoulders.forEach((sh, i) => {
    if (sh.userData.locked) { sh.rotation.x = Math.sin(phase * 0.5) * 0.02; return; }
    sh.rotation.x = -Math.sin(phase + (i ? Math.PI : 0)) * G.amp * G.arm;
    sh.rotation.z = Math.sin(phase * 2) * 0.02;
  });

  active.panels.forEach((p, i) => {
    p.rotation.x = -Math.sin(phase * 2) * G.amp * 0.10 - G.lean * 0.4 * (i ? -1 : 1);
  });

  active.root.rotation.x = G.lean;
  active.root.rotation.z = Math.sin(phase) * G.amp * 0.035;
  active.root.rotation.y = Math.sin(phase) * G.amp * 0.06;
  if (active.head) {
    active.head.rotation.x = -G.lean * 0.8 + Math.sin(phase * 2) * 0.015;
    active.head.rotation.y = -Math.sin(phase) * G.amp * 0.05;
  }

  // Plant the stance foot: hip/knee rotation shortens the leg's vertical
  // reach, so sink the root until the lowest sole sits back on the ground.
  active.root.position.y = 0;
  active.root.updateMatrixWorld(true);
  let lowest = Infinity;
  for (const sole of active.soles) {
    sole.getWorldPosition(_v);
    if (_v.y < lowest) lowest = _v.y;
  }
  if (lowest !== Infinity) {
    active.root.position.y = -lowest + Math.abs(Math.sin(phase)) * G.bob * 0.35;
  }
}
requestAnimationFrame(tick);

const rail = document.getElementById('roster');
WIZARDS.forEach((w, i) => {
  const b = document.createElement('button');
  b.className = 'chip';
  b.dataset.w = w.id;
  b.innerHTML = `<span class="swatch" style="background:#${w.glow.toString(16).padStart(6, '0')}"></span>${w.name}`;
  b.addEventListener('click', () => show(i));
  rail.appendChild(b);
});

document.querySelectorAll('[data-m]').forEach((b) => {
  b.addEventListener('click', () => { mode = b.dataset.m; sync(); });
});

show(current);
