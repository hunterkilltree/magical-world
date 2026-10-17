import test from 'node:test';
import assert from 'node:assert/strict';
import { WIZARDS } from '../../src/wizard-rig.js';
import { ROLES, ROLE_ORDER, WIZARD_ROLE, PAIRS, ROLE_BOOK, rolePair } from '../../src/game/roles.js';
import { createGame, step, seedRandom, unseedRandom } from '../../src/game/sim.js';

const ELS = ['fire', 'water', 'ice', 'lightning', 'earth', 'arcane', 'nature', 'wind', 'light', 'dark'];

test('eight wizards, each with a role and the new earth, wind and void casters among them', () => {
  assert.equal(WIZARDS.length, 8);
  for (const id of ['terra_geomancer', 'zephyr_galesinger', 'void_necromancer']) assert.ok(WIZARDS.some((w) => w.id === id), id);
  for (const w of WIZARDS) {
    assert.ok(ROLES[WIZARD_ROLE[w.id]], `${w.id} has a known role`);
    assert.ok(w.name && w.role, `${w.id} has a name and a title`);
  }
  assert.equal(new Set(WIZARDS.map((w) => w.id)).size, 8, 'ids are unique');
});

test('five roles own 45 pairs each: 225 spells', () => {
  assert.equal(ROLE_ORDER.length, 5);
  assert.equal(PAIRS.length, 45);
  for (const role of ROLE_ORDER) {
    assert.equal(Object.keys(ROLE_BOOK[role]).length, 45, role);
    for (const [a, b] of PAIRS) assert.ok(rolePair(role, a, b), `${role} ${a}+${b}`);
  }
});

test("the earth caster is a destroyer, and Tectonic Rupture is in the destroyer book", () => {
  assert.equal(WIZARD_ROLE.terra_geomancer, "destroyer");
  assert.equal(rolePair("destroyer", "fire", "earth").name, "Magma Crush");
  assert.ok(Object.values(ROLE_BOOK.destroyer).some((sp) => sp.name === "Tectonic Rupture"));
});

test('every wizard can cast every pair of elements without the sim breaking', () => {
  for (const w of WIZARDS) {
    seedRandom(5);
    const g = createGame(w.id, WIZARD_ROLE[w.id]); g.mode = 'play';
    for (const [a, b] of PAIRS) {
      step(g, { move: { x: 0, z: 0 }, aim: { x: 6, z: 4 }, actions: ['clear', 'el:' + a, 'el:' + b, 'cast'] }, 1 / 60);
      for (let i = 0; i < 40; i++) step(g, { move: { x: 0, z: 0 }, aim: { x: 6, z: 4 }, actions: [] }, 1 / 60);
      g.player.energy = 100; g.player.hp = 100;
    }
    unseedRandom();
    assert.ok(Number.isFinite(g.player.x) && Number.isFinite(g.player.z), w.id);
  }
});
