// A scripted single-player run, hashed. Recorded before the co-op refactor (R-080) so that
// single-player behaviour can be shown unchanged: same seed, same inputs, same digest.
import { createHash } from 'node:crypto';
import { createGame, step, seedRandom, unseedRandom } from '../../../src/game/sim.js';

const ELS = ['fire', 'water', 'ice', 'lightning', 'earth', 'arcane', 'nature', 'wind', 'light', 'dark'];
const r3 = (n) => Math.round(n * 1000) / 1000;

// Deterministic "player": walks a circle, queues two or three elements, casts at a sweeping aim,
// self-casts, novas and dodges on a fixed schedule. No random numbers of its own.
export function scriptedInput(i, nearby = null) {
  const a = i / 90;
  const move = { x: Math.cos(a), z: Math.sin(a * 0.7) };
  const aim = { x: Math.cos(a * 1.3) * 8, z: Math.sin(a * 1.3) * 8 };
  const actions = [];
  const c = i % 120;
  if (c === 0) actions.push('clear');
  if (c === 2) actions.push('el:' + ELS[Math.floor(i / 120) % 10]);
  if (c === 4) actions.push('el:' + ELS[(Math.floor(i / 120) * 3 + 1) % 10]);
  if (c === 6 && Math.floor(i / 120) % 3 === 0) actions.push('el:' + ELS[(Math.floor(i / 120) * 7 + 2) % 10]);
  if (c === 10) actions.push('cast');
  if (c > 10 && c < 40 && c % 10 === 0) actions.push('recast');
  if (c === 60) actions.push('nova');
  if (c === 80) actions.push('self');
  if (c === 100) actions.push('dodge');
  return { move, aim, actions, ...(nearby ? { nearby } : {}) };
}

export function runScenario(wizard, role, seed, steps = 2400) {
  seedRandom(seed);
  const g = createGame(wizard, role);
  g.mode = 'play';
  const h = createHash('sha1');
  const types = {};
  for (let i = 0; i < steps; i++) {
    const { move, aim, actions } = scriptedInput(i);
    const ev = step(g, { move, aim, actions }, 1 / 60);
    for (const e of ev) types[e.type] = (types[e.type] ?? 0) + 1;
    if (i % 30 === 0) {
      const p = g.player;
      h.update(JSON.stringify([i, r3(p.x), r3(p.z), r3(p.hp), r3(p.energy), p.alive, g.wave, g.kills, g.score, g.enemies.length,
        r3(g.enemies.reduce((a, e) => a + e.hp, 0)), g.shots.length, g.areas.length, g.walls.length, g.decoys.length, g.mode]));
    }
  }
  unseedRandom();
  const p = g.player;
  return {
    digest: h.digest('hex'),
    types,
    final: { wave: g.wave, kills: g.kills, score: g.score, mode: g.mode, hp: r3(p.hp), casts: g.stats.casts }
  };
}

export const SCENARIOS = [
  ['ember_pyromancer', 'destroyer', 11],
  ['rime_cryomancer', 'controller', 22],
  ['stone_druid', 'guardian', 33],
  ['storm_conduit', 'trickster', 44],
  ['arcane_archmage', 'arcanist', 55]
];
