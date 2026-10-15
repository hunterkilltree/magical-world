// Casting physics, after Gilland's Elemental Magic: anticipation pulls energy in, the release is a burst with a
// pressure wave (air push, dust kick, camera kick), then the element takes over the ground it lands on.
// Also the visuals for role mechanics: blinks, dashes, doubles, wards, swaps.
// Render-only — reads events and state, never writes gameplay.
import * as THREE from 'three';
import { ELEMENTS } from './spells.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const rateN = (r, dt) => { const n = r * dt; return Math.floor(n) + (Math.random() < n % 1 ? 1 : 0); };
const col = (el) => ELEMENTS[el]?.color ?? 0xffffff;
const SMOKE_OF = { fire: 'flame', water: 'spray', ice: 'frostfog', lightning: 'plasma', earth: 'dust', arcane: 'arcane',
  nature: 'pollen', wind: 'mist', light: 'holy', dark: 'voidglow' };

export function createCastFx({ vfx, glow, flash, ringFx, body, api }) {
  const timers = [];
  let gather = null;
  const _c = new THREE.Color();
  const every = (dur, fn) => timers.push({ dur, el: 0, fn });
  const after = (d, fn) => timers.push({ dur: d, el: 0, fn: (k) => { if (k >= 1) fn(); } });
  const gl = (x, y, z, vx, vy, vz, life, s0, s1, hex, k = 1.5, d = 0) => { _c.setHex(hex).multiplyScalar(k); glow.emit(x, y, z, vx, vy, vz, life, s0, s1, _c, 1, 0, d); };
  const K = (n, x, y, z, vx, vy, vz, o) => vfx.sparkAt(n, x, y, z, vx, vy, vz, o);
  const S = (n, x, y, z, vx, vy, vz, o) => vfx.smokeAt(n, x, y, z, vx, vy, vz, o);
  const pick = (els) => els[(Math.random() * els.length) | 0];

  // The element takes over the ground the spell hits.
  function ground(els, x, z, R, k = 1) {
    for (const el of new Set(els)) switch (el) {
      case 'fire':
        api.decal('scorch', x, z, R * 0.8, 6, true); vfx.radialSparks('fire', x, 0.2, z, Math.round(18 * k), 3, 9, 0.9);
        for (let i = 0; i < 8; i++) { const a = rnd(0, 6.28); S('flame', x + Math.sin(a) * R * 0.4, 0.2, z + Math.cos(a) * R * 0.4, Math.sin(a) * 2, rnd(1.5, 3), Math.cos(a) * 2, { k: 0.7 }); }
        break;
      case 'water':
        for (let i = 0; i < Math.round(22 * k); i++) { const a = (i / 22) * 6.28, sp = rnd(2.5, 5); K('water', x + Math.sin(a) * R * 0.4, 0.15, z + Math.cos(a) * R * 0.4, Math.sin(a) * sp, rnd(5, 9), Math.cos(a) * sp); }
        for (let i = 0; i < 8; i++) S('spray', x + rnd(-R, R) * 0.5, 0.3, z + rnd(-R, R) * 0.5, rnd(-1.5, 1.5), rnd(2, 4), rnd(-1.5, 1.5), { k: 0.9 });
        break;
      case 'ice': api.spikes(x, z, R * 0.75, Math.max(4, Math.round(8 * k)), 1.1, { ring: true, h: 0.75 }); api.decal('frost', x, z, R, 5); break;
      case 'earth': api.decal('crack', x, z, R, 6); api.spray('rock', x, 0.2, z, Math.max(3, Math.round(8 * k)), 4.5); break;
      case 'lightning': api.forks(x, z, R * 1.3, 0xf4e15c, Math.round(4 * k) + 1); flash(x, z, 0xf4e15c, 30); break;
      case 'arcane': api.rune(x, z, 0xd04bff, R * 1.1, 0.7, { spin: 5, r0: R * 0.3 }); api.spray('arcane', x, 0.4, z, Math.max(2, Math.round(5 * k)), 4); break;
      case 'nature':
        vfx.radialSparks('nature', x, 0.2, z, Math.round(22 * k), 2, 6, 0.9); api.groundGlow(x, z, 0x5cc84a, R, 0.6, 1.4);
        for (let i = 0; i < 10; i++) S('pollen', x + rnd(-R, R) * 0.5, 0.2, z + rnd(-R, R) * 0.5, rnd(-1, 1), rnd(1, 2.5), rnd(-1, 1), { k: 1 });
        break;
      case 'wind':
        vfx.dustRing(x, z, R * 1.0, 28, 12);
        api.groundGlow(x, z, 0xeaf6ff, R * 1.2, 0.5, 1.2);
        for (let i = 0; i < 32; i++) {
          const a = (i / 32) * 6.28;
          K('wind', x, 0.4, z, Math.sin(a) * (10 + 6 * k), 0.3, Math.cos(a) * (10 + 6 * k));
        }
        for (let i = 0; i < 14; i++) {
          const a = Math.random() * 6.28, sp = 5 + Math.random() * 8;
          puff('smoke', x, 0.6, z, Math.sin(a) * sp, 0.4 + Math.random() * 0.8, Math.cos(a) * sp, { size: 1.2, life: 0.45, c0: [0.9, 0.95, 1.0], c1: [0.8, 0.88, 0.95] });
        }
        break;
      case 'light': api.beam(x, z, 0xfff1a8, R * 0.25, 6, 0.4, { k: 1.8 }); vfx.radialSparks('light', x, 0.3, z, Math.round(20 * k), 4, 11, 0.7); break;
      case 'dark':
        for (let i = 0; i < 14; i++) { const a = rnd(0, 6.28); S('void', x, 0.3, z, Math.sin(a) * R * 2.2, rnd(0, 0.8), Math.cos(a) * R * 2.2, { k: 0.6 }); }
        vfx.radialSparks('dark', x, 0.3, z, Math.round(14 * k), 2, 6, 0.6);
        break;
    }
  }

  // ---------------------------------------------------------------- anticipation
  function onWindup(e) {
    const w = e.weight, x = e.x, z = e.z;
    gather = { els: e.els, w, style: e.style };
    if (e.mode === 'self') return;
    api.rune(x, z, e.color, 0.8, e.t + 0.18, { r0: 2.2 + w * 1.2, spin: -7, a: 0.85 }); // the circle draws in
    if (e.style === 'slam') { // rising onto the toes kicks loose grit
      for (let i = 0; i < 10; i++) { const a = rnd(0, 6.28); S('dust', x + Math.sin(a) * 0.5, 0.1, z + Math.cos(a) * 0.5, Math.sin(a) * 0.6, rnd(0.6, 1.4), Math.cos(a) * 0.6, { k: 0.6 }); }
      api.groundGlow(x, z, e.color, 1.4, e.t + 0.1, 0.9);
    } else if (e.style === 'plant') api.groundGlow(x, z, e.color, 2.2, e.t + 0.15, 1.2);
    else if (e.style === 'sweep') { // the coil: energy winds around the waist against the coming sweep
      const a0 = Math.atan2(e.dx, e.dz);
      every(e.t, (k) => { for (let i = 0; i < 2; i++) { const a = a0 + 1.6 - k * 4 + i * Math.PI;
        gl(x + Math.sin(a) * 1.0, 1.0, z + Math.cos(a) * 1.0, -Math.cos(a) * 2, 0.3, Math.sin(a) * 2, 0.3, 0.2, 0.03, col(pick(e.els)), 1.5, 1); } });
    } else if (e.style === 'thrust') { // drawing back: energy streams past the body into the staff
      for (let i = 0; i < 16; i++) { const a = Math.atan2(e.dx, e.dz) + rnd(-0.6, 0.6), r = rnd(1.6, 2.4);
        gl(x + Math.sin(a) * r, rnd(0.9, 1.6), z + Math.cos(a) * r, -Math.sin(a) * r * 4, 0, -Math.cos(a) * r * 4, 0.24, 0.05, 0.18, col(pick(e.els)), 1.6); }
    }
  }

  // ---------------------------------------------------------------- release
  function onCast(e, tip) {
    gather = null;
    if (e.mode === 'self') return;
    const w = e.weight ?? 0.5, x = e.x, z = e.z, dx = e.dx, dz = e.dz, px = -dz, pz = dx;
    const tx = tip ? tip.x : x + dx * 0.6, ty = tip ? tip.y : 1.6, tz = tip ? tip.z : z + dz * 0.6;
    // the pressure wave: shoves the existing smoke and sparks outward and shows as a ring of displaced air
    body.airPush(tx, ty, tz, 2.6 + 2 * w, 5 + 9 * w);
    for (let i = 0; i < 18; i++) { const a = (i / 18) * 6.28; K('wind', tx, ty, tz, Math.sin(a) * (7 + 6 * w), rnd(-0.5, 0.5), Math.cos(a) * (7 + 6 * w)); }
    // the planted foot kicks dust back
    if (e.style !== 'flick') for (let i = 0; i < 6 + 8 * w; i++)
      S('dust', x - dx * 0.2 + px * rnd(-0.25, 0.25), 0.08, z - dz * 0.2 + pz * rnd(-0.25, 0.25), -dx * rnd(1.5, 3.5) + rnd(-0.5, 0.5), rnd(0.2, 0.9), -dz * rnd(1.5, 3.5) + rnd(-0.5, 0.5), { k: 0.45 + 0.3 * w });
    switch (e.style) {
      case 'slam': {
        const gx = x + dx * 1.1, gz = z + dz * 1.1, R = 1.2 + 0.9 * w;
        body.kickCam(0, -0.5 * w - 0.15, 0);
        api.decal('crack', gx, gz, R * 1.2, 7);
        vfx.dustRing(gx, gz, R, 20, 5 + 5 * w);
        vfx.shell(gx, 0, gz, R * 1.3, e.color, 0.3, true, 1.3);
        api.wave(gx, 0.3, gz, 0.4 + 0.35 * w); api.punch(0.3 * w, -1.2 * w, 0.25 + 0.2 * w);
        ground(e.els, gx, gz, R, 0.7 + 0.5 * w);
        body.airPush(gx, 0.3, gz, 3.5 + 2 * w, 8 + 8 * w);
        break;
      }
      case 'thrust': {
        body.kickCam(-dx * 0.3 * w, 0.06, -dz * 0.3 * w);
        vfx.flare(tx, ty, tz, e.color, 1.4 + 1.2 * w, 0.14);
        for (let i = 0; i < 30; i++) { // a cone of displaced air rolls off the tip along the aim
          const a = (i / 30) * 6.28, r = Math.cos(a), u = Math.sin(a), sp = 4 + 4 * w, f = 6 + 6 * w;
          gl(tx, ty, tz, px * r * sp + dx * f, u * sp, pz * r * sp + dz * f, 0.22, 0.18, 0.02, col(e.els[i % e.els.length]), 1.6, 3);
        }
        api.wave(tx, ty, tz, 0.25 + 0.3 * w); api.punch(0.15 + 0.2 * w, -0.6 * w, 0.06 + 0.1 * w);
        break;
      }
      case 'flick': {
        body.kickCam(dx * 0.06, 0.02, dz * 0.06);
        const a0 = Math.atan2(dx, dz);
        for (let i = 0; i < 16; i++) { const q = i / 15, a = a0 + (q - 0.5) * 1.6;
          gl(tx + Math.sin(a) * 0.4, ty - 0.2 + q * 0.4, tz + Math.cos(a) * 0.4, Math.sin(a) * 6, rnd(-0.5, 1), Math.cos(a) * 6, 0.18, 0.14, 0.02, col(e.els[i % e.els.length]), 1.6, 4); }
        vfx.flare(tx, ty, tz, e.color, 1.1, 0.1);
        break;
      }
      case 'sweep': {
        body.kickCam(px * 0.22 * w, 0, pz * 0.22 * w);
        const a0 = Math.atan2(dx, dz);
        every(0.16, (k) => { for (let j = 0; j < 4; j++) { // a crescent of the element follows the staff around
          const a = a0 - 1.3 + k * 2.6 + rnd(-0.05, 0.05), r = rnd(1.1, 1.6), qx = x + Math.sin(a) * r, qz = z + Math.cos(a) * r;
          gl(qx, rnd(0.7, 1.3), qz, Math.cos(a) * 5 + Math.sin(a) * 2, rnd(-0.2, 0.6), -Math.sin(a) * 5 + Math.cos(a) * 2, 0.45, 0.24, 0.03, col(pick(e.els)), 1.6, 2);
          if (j === 0) S('dust', qx, 0.08, qz, Math.sin(a) * 2, 0.3, Math.cos(a) * 2, { k: 0.5 });
        } });
        api.wave(x, 1, z, 0.35 * w); api.punch(0.12 + 0.15 * w, -0.4 * w, 0.08 * w);
        break;
      }
      case 'plant': {
        body.kickCam(0, -0.28 * w, 0);
        const gx = x + dx * 0.45 + px * 0.4, gz = z + dz * 0.45 + pz * 0.4; // where the staff meets the floor
        api.rune(x, z, e.color, 2.2 + w, 0.9, { r0: 0.4, spin: 3, a: 0.9 });
        api.beam(gx, gz, e.color, 0.28, 4 + 2 * w, 0.45, { k: 1.8 });
        api.groundGlow(x, z, e.color, 2.6, 0.7, 1.4);
        api.decal('crack', gx, gz, 0.9 + 0.4 * w, 5);
        ground(e.els, gx, gz, 0.9, 0.5);
        vfx.dustRing(gx, gz, 0.6, 14, 4);
        api.punch(0.15 + 0.15 * w, -0.5 * w, 0.12 + 0.12 * w);
        break;
      }
    }
    if (e.amped) { api.rune(x, z, 0xd04bff, 1.4, 0.5, { y: 1.2, spin: 9, a: 0.8 }); vfx.flare(tx, ty, tz, 0xf0a8ff, 2.2, 0.16); }
  }

  // ---------------------------------------------------------------- role mechanics
  function onBlink(e) {
    const cs = e.els.map(col), hop = !!e.hop;
    body.ghost({ x: e.x0, z: e.z0, color: e.color, life: hop ? 0.9 : 0.55, a: 1.1 }); // the afterimage you leave behind
    for (let i = 0; i < 26; i++) { const a = rnd(0, 6.28), r = rnd(0.8, 1.4), y = rnd(0.2, 1.8);
      gl(e.x0 + Math.sin(a) * r, y, e.z0 + Math.cos(a) * r, -Math.sin(a) * r * 6, (1 - y) * 2, -Math.cos(a) * r * 6, 0.16, 0.18, 0.02, cs[i % cs.length]); }
    const L = Math.hypot(e.x1 - e.x0, e.z1 - e.z0), n = Math.round(10 + L * 7);
    for (let i = 0; i < n; i++) { const q = i / Math.max(1, n - 1);
      gl(e.x0 + (e.x1 - e.x0) * q + rnd(-0.15, 0.15), 1.0 + Math.sin(q * Math.PI) * (hop ? 1.2 : 0.3) + rnd(-0.2, 0.2), e.z0 + (e.z1 - e.z0) * q + rnd(-0.15, 0.15),
        rnd(-0.4, 0.4), rnd(0, 0.6), rnd(-0.4, 0.4), 0.35 + q * 0.25, 0.2, 0.02, cs[i % cs.length], 1.5, 2); }
    vfx.flare(e.x1, 1.1, e.z1, e.color, hop ? 1.2 : 2.0, 0.14);
    vfx.dustRing(e.x1, e.z1, 0.8, 14, hop ? 3 : 5);
    if (hop) return;
    api.wave(e.x1, 1, e.z1, 0.3);
    api.rune(e.x0, e.z0, e.color, 1.3, 0.5, { spin: 6, a: 0.8 });
    api.rune(e.x1, e.z1, e.color, 1.5, 0.6, { spin: -6, r0: 2.4, a: 0.9 });
    ground(e.els, e.x1, e.z1, 0.8, 0.35);
    body.kickCam(0, 0.12, 0);
  }

  function onDash(e, s) {
    for (let i = 0; i < 4; i++) after(0.02 + i * 0.045, () => body.ghost({ color: e.color, life: 0.32, a: 0.95 }));
    every(e.t + 0.02, () => {
      const p = s.player;
      for (let j = 0; j < 3; j++) gl(p.x + rnd(-0.3, 0.3), rnd(0.3, 1.7), p.z + rnd(-0.3, 0.3), -e.dx * rnd(2, 5), rnd(-0.2, 0.4), -e.dz * rnd(2, 5), 0.32, 0.14, 0.02, col(pick(e.els)), 1.6, 1);
      if (Math.random() < 0.6) S('dust', p.x, 0.08, p.z, -e.dx * 2, 0.4, -e.dz * 2, { k: 0.5 });
    });
    body.kickCam(e.dx * 0.18, 0, e.dz * 0.18);
    api.punch(0.12, 1.2, 0);
  }

  function onDashEnd(e) {
    vfx.dustRing(e.x, e.z, 0.7, 12, 4);
    for (let i = 0; i < 8; i++) S('dust', e.x + rnd(-0.2, 0.2), 0.08, e.z + rnd(-0.2, 0.2), e.dx * rnd(1, 3) + rnd(-1, 1), rnd(0.2, 0.8), e.dz * rnd(1, 3) + rnd(-1, 1), { k: 0.5 });
    vfx.radialSparks(SMOKE_OF[e.els[0]] ? e.els[0] : 'wind', e.x, 0.4, e.z, 10, 2, 6, 0.5);
  }

  function onGuard(e) {
    const x = e.x, z = e.z, c = e.color;
    api.rune(x, z, c, 1.8, 0.9, { spin: 4, r0: 0.6, a: 0.9 });
    if (e.ward || e.reflect) {
      vfx.shell(x, 1, z, 1.15, c, 0.55, false, 2.2);
      for (let i = 0; i < 36; i++) { const a = rnd(0, 6.28), b = rnd(-1.2, 1.2); gl(x + Math.cos(b) * Math.sin(a) * 1.1, 1 + Math.sin(b) * 1.1, z + Math.cos(b) * Math.cos(a) * 1.1, 0, 0, 0, 0.5, 0.1, 0.02, c); }
    }
    if (e.invuln) vfx.shell(x, 1, z, 1.35, 0xf0e070, 0.45, false, 1.8);
    if (e.heal) {
      api.beam(x, z, 0x9ef0a0, 0.7, 6, 0.7, { k: 1.6 });
      for (let i = 0; i < 24; i++) gl(x + rnd(-0.7, 0.7), rnd(0.1, 0.6), z + rnd(-0.7, 0.7), 0, rnd(1.5, 3), 0, 0.9, 0.14, 0.02, 0x9ef0a0, 1.4, 0.5);
    }
    if (e.amp) for (let i = 0; i < 3; i++) api.rune(x, z, c, 1.0 + i * 0.3, 0.9, { y: 0.6 + i * 0.6, spin: (i % 2 ? -1 : 1) * 6, a: 0.7 });
    if (e.stone) api.spray('rock', x, 0.3, z, 10, 3, { up: 1.4 });
    if (e.near) {
      const kind = SMOKE_OF[e.els.find((el) => SMOKE_OF[el] && el !== 'lightning') ?? 'wind'];
      for (let i = 0; i < 28; i++) { const a = (i / 28) * 6.28; S(kind, x + Math.sin(a) * 0.6, rnd(0.3, 1.4), z + Math.cos(a) * 0.6, Math.sin(a) * e.near * 1.6, rnd(0, 0.8), Math.cos(a) * e.near * 1.6, { k: 0.9 }); }
      api.wave(x, 1, z, 0.4);
    }
    body.kickCam(0, -0.12, 0);
  }

  function onSwap(e) {
    body.ghost({ x: e.x0, z: e.z0, color: e.color, life: 0.5, a: 1 });
    vfx.flare(e.x0, 1.1, e.z0, e.color, 1.8, 0.14); vfx.flare(e.x1, 1.1, e.z1, e.color, 1.8, 0.14);
    vfx.bolt([new THREE.Vector3(e.x0, 1.1, e.z0), new THREE.Vector3(e.x1, 1.1, e.z1)], e.color, { life: 0.22, w: 0.14 });
    ringFx(e.x0, e.z0, 1.3, e.color, 0.4); ringFx(e.x1, e.z1, 1.3, e.color, 0.4);
    api.wave((e.x0 + e.x1) / 2, 1, (e.z0 + e.z1) / 2, 0.35);
  }

  function shatter(e, n) {
    for (const el of new Set(e.els)) {
      if (SMOKE_OF[el]) vfx.radialSparks(el, e.x, 1.0, e.z, n, 2, 7, 0.8);
      for (let i = 0; i < 6; i++) S(SMOKE_OF[el] ?? 'mist', e.x + rnd(-0.3, 0.3), rnd(0.4, 1.6), e.z + rnd(-0.3, 0.3), rnd(-1.5, 1.5), rnd(0.2, 1.2), rnd(-1.5, 1.5), { k: 0.7 });
    }
    vfx.flare(e.x, 1.1, e.z, e.color, 1.6, 0.12);
  }

  return {
    onEvent(e, s, tip) {
      switch (e.type) {
        case 'windup': onWindup(e); break;
        case 'cast': onCast(e, tip); break;
        case 'blink': onBlink(e); break;
        case 'dash': onDash(e, s); break;
        case 'dashEnd': onDashEnd(e); break;
        case 'guard': onGuard(e); break;
        case 'swap': onSwap(e); break;
        case 'decoy': shatter(e, 10); ringFx(e.x, e.z, 1.2, e.color, 0.4); break;
        case 'decoyEnd': shatter(e, e.broken ? 26 : 16); break;
        case 'decoyPulse':
          ringFx(e.x, e.z, e.r, e.color, 0.45); api.groundGlow(e.x, e.z, e.color, e.r, 0.4, 1.2);
          if (e.heal) for (let i = 0; i < 10; i++) gl(e.x + rnd(-1, 1), 0.3, e.z + rnd(-1, 1), 0, rnd(1.5, 2.5), 0, 0.7, 0.12, 0.02, 0x9ef0a0, 1.4, 0.4);
          break;
      }
    },
    update(dt, s, tip) {
      for (let i = timers.length - 1; i >= 0; i--) {
        const T = timers[i];
        T.el += dt;
        const k = Math.min(1, T.el / T.dur);
        T.fn(k, dt);
        if (k >= 1) timers.splice(i, 1);
      }
      const p = s.player;
      if (!p.wind || !tip || !gather) return;
      // anticipation: energy streams into the staff tip, faster and tighter as the release nears
      const W = p.wind, k = Math.min(1, (W.max - W.t) / Math.max(0.01, W.max - (W.hold || 0))), held = k >= 1, n = rateN((60 + 160 * gather.w) * (held ? 1.6 : 1), dt);
      for (let i = 0; i < n; i++) {
        const a = rnd(0, 6.28), b = rnd(-1.2, 1.2), R = (held ? 0.35 : 1.7 - k) * rnd(0.7, 1.1);
        const ox = Math.cos(b) * Math.sin(a) * R, oy = Math.sin(b) * R, oz = Math.cos(b) * Math.cos(a) * R;
        gl(tip.x + ox, tip.y + oy, tip.z + oz, -ox * (held ? 3 : 5.5), -oy * (held ? 3 : 5.5), -oz * (held ? 3 : 5.5), held ? 0.1 : 0.18, 0.05, 0.16, col(pick(gather.els)), held ? 2.2 : 1.7);
      }
      if (held && !gather.held) { gather.held = true; vfx.flare(tip.x, tip.y, tip.z, 0xffffff, 0.9 + gather.w, 0.12); } // the held breath: a pin-point of light
      if (gather.els.includes('lightning') && Math.random() < dt * 22) {
        const a = rnd(0, 6.28), r = rnd(0.3, 0.6);
        vfx.bolt([tip.clone(), new THREE.Vector3(tip.x + Math.sin(a) * r, tip.y + rnd(-0.3, 0.3), tip.z + Math.cos(a) * r)], 0xf4e15c, { life: 0.08, w: 0.05, quiet: true });
      }
    },
    reset() { timers.length = 0; gather = null; }
  };
}
