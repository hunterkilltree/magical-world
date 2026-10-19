import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { frameParty, partyRows, createPartyTally, scoreboard, FRAME } from '../../src/game/party.js';
import { createGame, createCoopGame, step, TUNING } from '../../src/game/sim.js';

const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} ~ ${b}`);
const at = (id, x, z, o = {}) => ({ id, x, z, hp: 100, maxHp: 100, energy: 50, maxEnergy: 100, down: false, reviveT: 0, ...o });

test('alone, the camera follows you leaned 15% toward the aim, exactly as before', () => {
  const me = at('player', 2, -3);
  const f = frameParty([me], me, { x: 12, z: 7 });
  near(f.x, 2 + 10 * 0.15); near(f.z, -3 + 10 * 0.15); assert.equal(f.zoom, 1);
  const still = frameParty([me], me, null);
  near(still.x, 2); near(still.z, -3);
  const menu = frameParty([me], me, { x: 12, z: 7 }, 0); // the menu blend turns the lean off
  near(menu.x, 2); near(menu.z, -3);
});

test('a party is framed around its middle, and the camera pulls back as it spreads', () => {
  const a = at('p1', -2, 0), b = at('p2', 2, 0);
  const close = frameParty([a, b], a, null);
  near(close.x, 0); near(close.z, 0);
  assert.equal(close.zoom, 1, 'a tight party needs no zoom');
  const c = at('p2', 8, 0);
  const wide = frameParty([a, c], a, null);
  near(wide.x, 3);
  assert.ok(wide.zoom > 1 && wide.zoom <= FRAME.maxZoom, `zoom ${wide.zoom}`);
  const wider = frameParty([a, at('p2', 10, 0)], a, null);
  assert.ok(wider.zoom > wide.zoom, 'more spread, more zoom');
  // downed wizards count: the party needs to see who to raise
  const down = frameParty([a, at('p2', 6, 0, { down: true, hp: 0 })], a, null);
  near(down.x, 2);
});

test('you never leave the frame: the target stays within 6 m of you and the zoom is capped', () => {
  const me = at('p1', -20, 0);
  const f = frameParty([me, at('p2', 20, 0), at('p3', 20, 4)], me, { x: 0, z: 0 });
  assert.ok(Math.hypot(f.x - me.x, f.z - me.z) <= FRAME.maxOff + 1e-9, 'within 6 m of you');
  assert.equal(f.zoom, FRAME.maxZoom);
  // the aim still leans the party frame, more gently than alone
  const a = at('p1', -2, 0), b = at('p2', 2, 0);
  const lean = frameParty([a, b], a, { x: -2, z: 10 });
  assert.ok(lean.z > 0 && lean.z < 10 * FRAME.lean, `lean ${lean.z}`);
});

test('party strip rows: name, health and energy, you marked, a downed wizard with revive progress', () => {
  const g = createCoopGame([{ wizard: 'ember_pyromancer', name: 'Ana' }, { wizard: 'stone_druid', name: 'Bo' }, { wizard: 'storm_conduit' }]);
  g.mode = 'play'; g.waveT = 1e9;
  const [p1, p2, p3] = g.players;
  p2.hp = 25; p2.energy = 80;
  p3.hp = 0; p3.alive = false; p3.down = true; p3.reviveT = TUNING.reviveT / 2;
  const rows = partyRows(g.players, 'p2');
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((r) => r.id), ['p1', 'p2', 'p3']);
  assert.equal(rows[1].me, true); assert.equal(rows[0].me, false);
  near(rows[1].hp, 0.25); near(rows[1].energy, 0.8);
  assert.equal(rows[0].hp, 1);
  assert.equal(rows[2].down, true); near(rows[2].revive, 0.5); assert.equal(rows[2].hp, 0);
  assert.equal(rows[0].revive, 0);
  assert.equal(rows[0].wizard, 'ember_pyromancer');
  assert.ok(rows.every((r) => typeof r.name === 'string' && r.name.length), 'every row has a name');
  p1.hp = 150; // over-heal never overflows the bar
  assert.equal(partyRows(g.players, 'p1')[0].hp, 1);
});

test('the scoreboard tallies each wizard\'s casts, downs and raises from a real co-op run', () => {
  const g = createCoopGame([{ wizard: 'ember_pyromancer' }, { wizard: 'stone_druid' }]);
  g.mode = 'play'; g.waveT = 1e9;
  const tally = createPartyTally();
  const idle = { move: { x: 0, z: 0 }, aim: { x: 0, z: -5 }, actions: [] };
  const frame = (p1, p2 = idle) => tally.add(step(g, { players: { p1, p2 } }, 1 / 60));
  frame({ ...idle, actions: ['el:fire', 'cast'] });
  for (let i = 0; i < 40; i++) frame(idle);
  frame({ ...idle, actions: ['el:water', 'cast'] });
  for (let i = 0; i < 40; i++) frame(idle);
  // p2 goes down next to p1, who raises them
  const [p1, p2] = g.players;
  p2.x = p1.x + 0.5; p2.z = p1.z; p2.hp = 0;
  for (let i = 0; i < Math.ceil(TUNING.reviveT * 60) + 30; i++) frame(idle);
  assert.equal(p2.alive, true, 'raised');
  const rows = scoreboard(g.players, tally, 'p1');
  assert.deepEqual(rows.map((r) => [r.id, r.casts, r.downs, r.raised]), [['p1', 2, 0, 0], ['p2', 0, 1, 1]]);
  assert.equal(rows[0].me, true);
  tally.reset();
  assert.deepEqual(scoreboard(g.players, tally, 'p1').map((r) => r.casts), [0, 0], 'a new run starts at zero');
});

test('single-player camera input is unchanged by the party framing', () => {
  const g = createGame('ember_pyromancer');
  assert.equal(g.players.length, 1);
  const f = frameParty(g.players, g.player, { x: g.player.x, z: g.player.z - 10 });
  assert.equal(f.zoom, 1);
  near(f.z, g.player.z - 1.5);
});

test('wiring: the view frames the party, the HUD draws the strip and the scoreboard', () => {
  const render = read('src/game/render.js'), hud = read('src/game/hud.js'), app = read('src/App.tsx'), css = read('src/styles.css'), main = read('src/game/main.js');
  assert.match(render, /frameParty\(/, 'render.js frames the party');
  assert.match(render, /camZoom/, 'the offset is scaled by a smoothed zoom');
  assert.match(hud, /partyRows\(/, 'hud.js builds the strip rows');
  assert.match(hud, /scoreboard\(/, 'hud.js fills the scoreboard');
  assert.match(app, /id="h-party"/); assert.match(app, /id="d-board"/);
  assert.match(css, /\.pstrip/); assert.match(css, /body\.touch \.pstrip/, 'the strip has a phone layout');
  assert.match(main, /hud\.update\(g, mine, dt, events\)/, 'online, the HUD tallies every wizard\'s events, not only yours');
});
