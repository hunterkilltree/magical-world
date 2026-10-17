import test from 'node:test';
import assert from 'node:assert/strict';
import { PAL, K, M, recipes, createFx2d } from '../../src/game/fx2d.js';
import { palOf, createArenaFx } from '../../src/game/arena-fx.js';
import { buildIceSpear, conjureSpear } from '../../src/game/ice-spear.js';
import { createEarth } from '../../src/game/earth-fx.js';
import { createChains } from '../../src/game/chain-fx.js';

const ELS = ['fire', 'water', 'ice', 'lightning', 'earth', 'arcane', 'nature', 'wind', 'light', 'dark'];

test('the painterly layer exposes its parts', () => {
  for (const f of [recipes, createFx2d, createArenaFx, conjureSpear, createEarth, createChains, buildIceSpear]) assert.equal(typeof f, 'function');
  assert.ok(K && M && Object.keys(PAL).length > 20, 'kinds, modes and a palette table');
});

test('every element, alone or mixed, is drawn in palettes that exist', () => {
  const mixes = [...ELS.map((e) => [e]), ['fire', 'lightning'], ['fire', 'earth'], ['ice', 'water']];
  for (const els of mixes) {
    const p = palOf(els);
    for (const k of ['fire', 'smoke', 'crack']) assert.ok(PAL[p[k]], `${els.join('+')}: ${k} -> ${p[k]}`);
  }
});

test('the signature mixes keep their look: plasma, magma, ice fields', () => {
  assert.equal(palOf(['fire', 'lightning']).fire, 'plasma');
  assert.equal(palOf(['fire', 'earth']).fire, 'magma');
  assert.equal(palOf(['ice', 'water']).crack, 'icefield');
});

test('every palette is three colour stops of three channels', () => {
  for (const [name, stops] of Object.entries(PAL)) {
    assert.ok(Array.isArray(stops) && stops.length >= 3, name);
    for (const c of stops) assert.ok(c.length === 3 && c.every(Number.isFinite), name);
  }
});
