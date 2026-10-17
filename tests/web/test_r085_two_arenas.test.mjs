import test from 'node:test';
import assert from 'node:assert/strict';

// models.js paints floor textures on 2D canvases; a no-op canvas is enough to build the scene graphs.
const noop = new Proxy(function () {}, { get: (t, k) => (k === 'canvas' ? stub : k === 'width' || k === 'height' ? 256 : noop), apply: () => noop, set: () => true });
const stub = { width: 256, height: 256, getContext: () => noop, style: {} };
globalThis.document = { createElement: () => stub };

const { buildArena } = await import('../../src/game/models.js');
const { ARENA_R, GATES, createGame, step, seedRandom, unseedRandom } = await import('../../src/game/sim.js');

test('the court is a round arena of radius 24 with four gates on its rim', () => {
  assert.equal(ARENA_R, 24);
  assert.equal(GATES.length, 4);
  for (const g of GATES) assert.ok(Math.abs(Math.hypot(g.x, g.z) - (ARENA_R - 1.8)) < 1e-9);
});

test('both arenas build: the Court of Waves and the Hollow Glade', () => {
  const game = createGame('ember_pyromancer', 'destroyer');
  const court = buildArena(ARENA_R, game.props, GATES, 'court');
  const glade = buildArena(ARENA_R, game.props, GATES, 'forest');
  for (const a of [court, glade]) assert.ok(a.group && a.group.children.length > 5, 'a scene group with parts');
  assert.notEqual(court.group.children.length, glade.group.children.length, 'the glade is its own scene, not a recolour');
});

test('the sim plays the same in either arena', () => {
  seedRandom(3);
  const a = createGame('rime_cryomancer', 'controller'); a.theme = 'court'; a.mode = 'play';
  unseedRandom(); seedRandom(3);
  const b = createGame('rime_cryomancer', 'controller'); b.theme = 'forest'; b.mode = 'play';
  for (let i = 0; i < 600; i++) {
    step(a, { move: { x: 0, z: 0 }, aim: { x: 5, z: 5 }, actions: [] }, 1 / 60);
    step(b, { move: { x: 0, z: 0 }, aim: { x: 5, z: 5 }, actions: [] }, 1 / 60);
  }
  unseedRandom();
  assert.equal(a.wave, b.wave);
  assert.equal(a.enemies.length, b.enemies.length);
  assert.equal(b.theme, 'forest');
});
