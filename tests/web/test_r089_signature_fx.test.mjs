import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createSignatureFx } from '../../src/game/signature-fx.js';
import { createArenaFx } from '../../src/game/arena-fx.js';
import { WIZARDS } from '../../src/wizard-rig.js';
import { WIZARD_ROLE, SIGNATURE } from '../../src/game/roles.js';
import { resolveSpell } from '../../src/game/spells.js';

// Stand-ins for the effects layer (fx2d needs a GPU): they record every call, and run timers when told to.
function rig() {
  const calls = [], timers = [];
  const log = (name) => (...args) => { calls.push({ name, args }); };
  const fx = {
    spawn: log('spawn'), decal: log('decal'), shake: log('shake'), kick: log('kick'), impact: log('impact'), chroma: log('chroma'),
    light: log('light'), heat: log('heat'), dome: log('dome'), kill: log('kill'),
    after: (t, fn) => timers.push({ t, fn }),
    during: (d, fn) => timers.push({ d, fn })
  };
  const R = new Proxy({}, { get: (_, k) => {
    if (k === 'dir') return () => [1, 0, 0];
    if (k === 'projectile') return (from, to, o) => { const m = { from, to, o, tick() {} }; calls.push({ name: 'projectile', args: [from, to, o], m }); return m; };
    return log(String(k));
  } });
  const run = (seconds, dt = 0.05) => {
    const fired = new Set();
    for (let t = 0; t <= seconds + 1e-9; t += dt) {
      timers.forEach((tm, i) => {
        if (tm.d === undefined) { if (!fired.has(i) && tm.t <= t) { fired.add(i); tm.fn(); } return; }
        if (t < tm.d + dt) tm.fn(dt, Math.min(1, t / tm.d));
      });
    }
  };
  const of = (name) => calls.filter((c) => c.name === name);
  return { fx, R, calls, run, of };
}

const tipAt = () => ({ x: 0, y: 1.6, z: 0 });
const foe = (x, z) => ({ id: x * 100 + z, x, z, hp: 50, state: 'chase' });
const wizardGroup = () => { const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial())); return g; };
const sigRig = (enemies = [], extra = {}) => {
  const r = rig(), scene = new THREE.Scene(), view = { group: wizardGroup() };
  const earth = { spire: (...a) => r.calls.push({ name: 'spire', args: a }) };
  const chains = { bind: (...a) => r.calls.push({ name: 'bind', args: a }), prison: (...a) => r.calls.push({ name: 'prison', args: a }) };
  const state = { player: { id: 'p1' }, enemies };
  const sig = createSignatureFx({ scene, fx: r.fx, R: r.R, earth, chains, tip: () => [0, 1.6, 0], getState: () => state, bodyOf: () => view, ...extra });
  return { ...r, sig, scene, view };
};

test('Flash Step leaves four afterimages along the path, and they fade away', () => {
  const t = sigRig();
  const before = t.scene.children.length;
  assert.equal(t.sig.afterimages({ pid: 'p1', x: 0, z: 0, dx: 0, dz: 1, dist: 6, color: 0xf4e15c }), 4);
  assert.equal(t.scene.children.length, before + 4);
  const zs = t.scene.children.map((c) => c.position.z).sort((a, b) => a - b);
  assert.ok(zs[3] - zs[0] > 3, 'spread along the dash');
  t.run(0.8);
  assert.equal(t.scene.children.length, before, 'all gone');
});

test('a blink leaves afterimages too, from where it started to where it ended', () => {
  const t = sigRig();
  t.sig.afterimages({ pid: 'p1', x0: -3, z0: 0, x1: 3, z1: 0, color: 0xf4e15c });
  const xs = t.scene.children.map((c) => c.position.x);
  assert.ok(Math.min(...xs) <= -3 + 1e-9 && Math.max(...xs) > 0);
});

test('no body to clone, no afterimages (nothing breaks)', () => {
  const r = rig(), scene = new THREE.Scene();
  const sig = createSignatureFx({ scene, fx: r.fx, R: r.R, tip: tipAt, getState: () => ({ enemies: [] }), bodyOf: () => null });
  assert.equal(sig.afterimages({ pid: 'p9', x: 0, z: 0, dx: 0, dz: 1, dist: 4 }), 0);
  assert.equal(scene.children.length, 0);
});

test('Tectonic Rupture ends in one great spire under the enemy ahead, else seven metres out', () => {
  const t = sigRig([foe(0, 6), foe(9, 0)]);
  assert.equal(t.sig.spire({ x: 0, z: 0, dx: 0, dz: 1 }), true);
  assert.equal(t.of('spire').length, 0, 'not at once: after the spires have marched out');
  t.run(0.5);
  const [p, o] = t.of('spire')[0].args;
  assert.deepEqual(p, [0, 0, 6]);
  assert.ok(o.h > 2, 'a tall one');
  assert.ok(t.of('debris').length >= 1 && t.of('shake').length >= 1);
  const empty = sigRig([]);
  empty.sig.spire({ x: 0, z: 0, dx: 1, dz: 0 });
  empty.run(0.5);
  assert.deepEqual(empty.of('spire')[0].args[0], [7, 0, 0]);
});

test('Arcane Missiles: three missiles bow out and curve in on the enemy ahead', () => {
  const t = sigRig([foe(0, 8)]);
  assert.equal(t.sig.missiles({ x: 0, z: 0, dx: 0, dz: 1 }), 3);
  t.run(0.4);
  const ms = t.of('projectile');
  assert.equal(ms.length, 3);
  for (const m of ms) { assert.equal(m.args[2].pal, 'arcane'); assert.deepEqual(m.args[1], [0, 1.15, 8]); }
  const q = { p: [0, 1.2, 1] };
  const before = q.p[0];
  ms[0].m.tick(q, 0.016, 0.5, null);
  assert.notEqual(q.p[0], before, 'the missile bows sideways mid-flight');
  const q2 = { p: [0, 1.2, 1] };
  ms[2].m.tick(q2, 0.016, 0, null);
  assert.equal(q2.p[0], 0, 'and starts straight');
});

test('Chain Hook: a chain flies to the target and its latch drags streaks toward the staff', () => {
  const t = sigRig();
  assert.equal(t.sig.yank({ x: 5, z: 2 }), true);
  const [from, getTo, o] = t.of('bind')[0].args;
  assert.ok(Math.abs(from[1] - 0.6) < 1e-9 && from[0] === 0 && from[2] === 0, 'from just below the staff tip');
  assert.deepEqual(getTo(), [5, 1, 2]);
  assert.equal(o.pal, 'dark');
  o.onLatch();
  t.run(0.6);
  assert.ok(t.of('spawn').filter((c) => c.args[0].pal === 'dark').length >= 10, 'ten pulling streaks');
  assert.ok(t.of('shake').length >= 1);
});

test('Grave Chains: a prison of chains round every enemy struck, the first one bigger', () => {
  const t = sigRig();
  assert.equal(t.sig.prison({ pts: [[0, 0], [4, 3], [6, 5], [2, 6]] }), true);
  const ps = t.of('prison');
  assert.equal(ps.length, 3);
  assert.deepEqual(ps.map((p) => p.args[1].n), [5, 3, 3]);
  assert.ok(ps[0].args[1].r > ps[1].args[1].r);
  assert.deepEqual(ps[1].args[0](), [6, 1, 5]);
  assert.equal(t.sig.prison({ pts: [[0, 0]] }), false, 'nothing struck, no prison');
});

test('Magma Crush throws lava drops, flank rockfire, geysers and a dust wave once the ground breaks', () => {
  const t = sigRig();
  t.sig.magma({ x: 1, z: 4, delay: 0.2 });
  t.run(0.1);
  assert.equal(t.of('spawn').length, 0, 'not before the blast');
  t.run(1.4);
  assert.equal(t.of('rockfire').length, 2);
  const lava = t.of('spawn').filter((c) => c.args[0].pal === 'magma');
  assert.equal(lava.length, 18);
  lava[0].args[0].onBounce({ p: [1, 0, 4], age: 0, life: 1 });
  assert.ok(t.of('decal').length >= 1, 'a drop leaves a crack where it lands');
  assert.ok(t.of('lick').length >= 3, 'geysers lick up along the fissure');
  assert.equal(t.of('spawn').filter((c) => c.args[0].pal === 'dust').length, 10, 'a ring of dust');
});

test('Hurricane Eye walks the tornado from the mark through the enemies near it', () => {
  const t = sigRig([foe(2, 0), foe(30, 30)]);
  assert.equal(t.sig.eye({ x: 0, z: 0, r: 3, life: 3 }), 2, 'a path of the mark and the one enemy close by');
  const [getC, dur, o] = t.of('tornado')[0].args;
  assert.ok(dur > 2 && o.h > 3);
  assert.deepEqual(getC(), [0, 0, 0]);
  t.run(1.1);
  const mid = getC();
  assert.ok(mid[0] > 0.5 && mid[0] < 2.1, 'on its way to the enemy');
  t.run(2.8);
  assert.ok(t.of('curls').length >= 1 && t.of('gust').length === 10, 'it bursts into gusts at the end of its walk');
});

test('Arc Plasma ends in a burst at the far end of the beam', () => {
  const t = sigRig();
  t.sig.plasmaEnd({ x: 0, z: 0, dx: 0, dz: 1, len: 8 });
  assert.equal(t.of('light').length, 1);
  t.run(0.6);
  const flash = t.of('flash').find((c) => c.args[1] === 'plasma');
  assert.deepEqual(flash.args[0], [0, 1.15, 8]);
  assert.equal(t.of('sparks').length, 1);
});

// ---- wired into the arena: events in, recipes out
function arena(enemies = []) {
  const r = rig(), scene = new THREE.Scene(), view = { group: wizardGroup() };
  const state = { player: { id: 'p1', x: 0, z: 0 }, enemies, shots: [] };
  const afx = createArenaFx({ fx: r.fx, R: r.R, tipPos: () => new THREE.Vector3(0, 1.6, 0), scene, bodyOf: () => view });
  return { ...r, afx, scene, state };
}
const cast = (o) => ({ type: 'cast', pid: 'p1', mode: 'cast', x: 0, z: 0, dx: 0, dz: 1, weight: 0.5, els: ['fire'], ...o });

test('in the arena: an arcane bolt sends missiles, a fire bolt does not', () => {
  const a = arena([foe(0, 8)]);
  a.afx.onEvent(cast({ shape: 'bolt', style: 'thrust', els: ['arcane'] }), a.state);
  a.run(0.5);
  assert.equal(a.of('projectile').length, 3);
  const b = arena([foe(0, 8)]);
  b.afx.onEvent(cast({ shape: 'bolt', style: 'thrust', els: ['fire'] }), b.state);
  b.run(0.5);
  assert.equal(b.of('projectile').length, 0);
});

test('in the arena: an earth slam ends in the great spire, a fire and earth slam does not', () => {
  const a = arena([foe(0, 5)]);
  a.afx.onEvent(cast({ shape: 'area', style: 'slam', els: ['earth'] }), a.state);
  a.run(0.6);
  assert.ok(a.of('debris').some((c) => c.args[1] === 'rock' && c.args[2] === 14), 'the spire throws rock');
  const b = arena([foe(0, 5)]);
  b.afx.onEvent(cast({ shape: 'area', style: 'slam', els: ['fire', 'earth'] }), b.state);
  b.run(0.6);
  assert.ok(!b.of('debris').some((c) => c.args[1] === 'rock' && c.args[2] === 14));
});

test('in the arena: dashes and blinks leave afterimages of the caster', () => {
  const a = arena();
  a.afx.onEvent({ type: 'dash', pid: 'p1', x: 0, z: 0, dx: 0, dz: 1, dist: 5, t: 0.2, els: ['lightning', 'wind'], color: 0xf4e15c, key: 'lightning+wind' }, a.state);
  assert.equal(a.scene.children.length, 4);
  a.run(0.8);
  assert.equal(a.scene.children.length, 0);
  a.afx.onEvent({ type: 'blink', pid: 'p1', x0: 0, z0: 0, x1: 4, z1: 0, els: ['arcane'], color: 0xd04bff, key: 'arcane+x' }, a.state);
  assert.equal(a.scene.children.length, 4);
});

test('in the arena: Cyclone walks a tornado, Magma Crush throws lava, Arc Plasma bursts, Grave Chains cage', () => {
  const a = arena([foe(2, 0)]);
  a.afx.onEvent({ type: 'area', id: 1, x: 0, z: 0, r: 3, life: 3, delay: 0, key: 'wind+wind', name: 'Cyclone', els: ['wind'], color: 0xaaddff }, a.state);
  assert.equal(a.of('tornado').length, 1, 'one walking tornado, not a second standing one');
  const m = arena();
  m.afx.onEvent({ type: 'area', id: 2, x: 0, z: 4, r: 3, life: 0.01, delay: 0.3, key: 'earth+fire', name: 'Magma Crush', els: ['earth', 'fire'], color: 0xff7a2f }, m.state);
  m.run(2);
  assert.equal(m.of('spawn').filter((c) => c.args[0].pal === 'magma').length >= 18, true);
  const p = arena();
  p.afx.onEvent({ type: 'beam', x: 0, z: 0, dx: 0, dz: 1, len: 8, w: 0.7, key: 'fire+lightning', els: ['fire', 'lightning'], color: 0xff9a3a }, p.state);
  p.run(0.6);
  assert.ok(p.of('flash').some((c) => c.args[1] === 'plasma'));
  const g = arena();
  g.afx.onEvent({ type: 'chain', pid: 'p1', pts: [[0, 0], [3, 3], [5, 4]], els: ['dark', 'earth'], color: 0x7a3aff, key: 'dark+earth' }, g.state);
  assert.ok(g.calls.length > 0);
});

test('in the arena: a dark bolt that lands drags a chain; a fire bolt does not', () => {
  const a = arena();
  a.afx.onEvent({ type: 'impact', x: 5, z: 2, els: ['dark'], kind: 'bolt', color: 0x7a3aff }, a.state);
  a.run(0.2);
  const dark = a.calls.length;
  const b = arena();
  b.afx.onEvent({ type: 'impact', x: 5, z: 2, els: ['fire'], kind: 'bolt', color: 0xff7a2f }, b.state);
  b.run(0.2);
  assert.ok(dark > b.calls.length, 'the chain adds effects on top of the hit');
});

test('every wizard has a signature spell whose looks the arena knows', () => {
  const named = new Set(['earth+fire', 'ice+water', 'light+water', 'lightning+wind', 'fire+lightning', 'dark+earth', 'wind+wind']);
  for (const w of WIZARDS) {
    const role = WIZARD_ROLE[w.id], sp = resolveSpell(SIGNATURE[role], role);
    assert.ok(sp && sp.name, `${w.id} (${role}) has a role signature`);
    assert.ok(named.has(sp.key), `${sp.name} (${sp.key}) is one of the showcase signatures`);
  }
  assert.equal(resolveSpell(['dark', 'earth'], 'controller').name, 'Grave Chains');
  assert.equal(resolveSpell(['wind', 'wind'], 'trickster').name, 'Cyclone');
});
