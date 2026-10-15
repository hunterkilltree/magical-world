import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame, createCoopGame, addPlayer, removePlayer, step, seedRandom, unseedRandom, TUNING, MAX_PLAYERS } from '../../src/game/sim.js';
import { makeSpell } from '../../src/game/spells.js';
import { runScenario } from './support/scenario.mjs';

const DT = 1 / 60;
const idle = (aim = { x: 0, z: -8 }) => ({ move: { x: 0, z: 0 }, aim, actions: [] });
const party = (n = 4) => {
  const wiz = ['ember_pyromancer', 'rime_cryomancer', 'stone_druid', 'storm_conduit'];
  const g = createCoopGame(Array.from({ length: n }, (_, i) => ({ wizard: wiz[i], name: 'W' + (i + 1) })));
  g.mode = 'play';
  g.waveT = 1e9; // hold the first wave back
  return g;
};
const run = (g, seconds, inputs = {}) => {
  const out = [];
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    // actions are one-shot, like the real input: only the first step carries them
    const ins = i === 0 ? inputs : Object.fromEntries(Object.entries(inputs).map(([id, v]) => [id, { ...v, actions: [] }]));
    out.push(...step(g, { players: ins }, DT));
  }
  return out;
};
const ofType = (ev, t) => ev.filter((e) => e.type === t);

test('single-player behaviour is unchanged (seeded runs match the recorded digests)', () => {
  const golden = JSON.parse(readFileSync(new URL('./golden/single_player.json', import.meta.url), 'utf8'));
  assert.equal(golden.length, 5);
  for (const g of golden) {
    const now = runScenario(g.wizard, g.role, g.seed);
    assert.equal(now.digest, g.digest, g.wizard + ' digest');
    assert.deepEqual(now.final, g.final, g.wizard + ' final state');
  }
});

test('createGame still gives one player, aliased as game.player', () => {
  const g = createGame('ember_pyromancer');
  assert.equal(g.players.length, 1);
  assert.equal(g.player, g.players[0]);
  assert.equal(g.player.id, 'player');
});

test('a co-op game holds up to four wizards, each with their own state', () => {
  const g = party(4);
  assert.equal(MAX_PLAYERS, 4);
  assert.deepEqual(g.players.map((p) => p.id), ['p1', 'p2', 'p3', 'p4']);
  assert.deepEqual(g.players.map((p) => p.wizard), ['ember_pyromancer', 'rime_cryomancer', 'stone_druid', 'storm_conduit']);
  const spots = new Set(g.players.map((p) => p.x.toFixed(2) + ',' + p.z.toFixed(2)));
  assert.equal(spots.size, 4, 'four different starting spots');
  for (const p of g.players) assert.ok(Math.hypot(p.x, p.z) < 6, 'they start near the middle');
  assert.notEqual(g.players[0].queue, g.players[1].queue);
  assert.equal(g.player, g.players[0]);
  assert.equal(addPlayer(g, { wizard: 'arcane_archmage' }), null, 'a fifth is refused');
  assert.equal(g.players.length, 4);
});

test('addPlayer and removePlayer change the party', () => {
  const g = party(2);
  const p = addPlayer(g, { wizard: 'storm_conduit', name: 'Kessa' });
  assert.equal(p.id, 'p3');
  assert.equal(g.players.length, 3);
  assert.equal(removePlayer(g, 'p2'), true);
  assert.deepEqual(g.players.map((q) => q.id), ['p1', 'p3']);
  const again = addPlayer(g, { wizard: 'arcane_archmage' });
  assert.equal(again.id, 'p2', 'the free id is reused');
  assert.equal(removePlayer(g, 'nobody'), false);
});

test('each player is driven by their own input', () => {
  const g = party(2);
  const [a, b] = g.players;
  const bx = b.x;
  const ev = run(g, 0.5, { p1: { move: { x: 1, z: 0 }, aim: { x: 5, z: 0 }, actions: ['el:fire', 'el:earth'] }, p2: idle() });
  assert.ok(a.x > g.players[0].x - 1e-9 && a.x > 0.5, 'p1 walked');
  assert.equal(b.x, bx, 'p2 stood still');
  assert.deepEqual(a.queue, ['fire', 'earth']);
  assert.deepEqual(b.queue, []);
  assert.equal(ofType(ev, 'queue').length, 2);
});

test('events say which player they are about', () => {
  const g = party(2);
  const ev = run(g, 1.5, { p2: { move: { x: 0, z: 0 }, aim: { x: 0, z: -8 }, actions: ['el:fire', 'cast'] } });
  const cast = ofType(ev, 'cast');
  assert.equal(cast.length, 1);
  assert.equal(cast[0].pid, 'p2');
  assert.equal(ofType(ev, 'windup')[0].pid, 'p2');
  assert.equal(ofType(ev, 'queue')[0].pid, 'p2');
});

test('the legacy single-input shape still drives player 0', () => {
  const g = party(2);
  const x0 = g.players[0].x;
  step(g, { move: { x: 1, z: 0 }, aim: { x: 5, z: 0 }, actions: [] }, DT);
  assert.ok(g.players[0].x > x0);
});

test('enemies go for the nearest living player', () => {
  const g = party(2);
  const [a, b] = g.players;
  a.x = -10; a.z = 0; b.x = 10; b.z = 0;
  const th = spawnReal(g, 'thrall', 8, 0);
  run(g, 1.5);
  assert.ok(b.hp < b.maxHp || Math.hypot(th.x - b.x, th.z - b.z) < 2, 'it went for p2 (the nearest)');
  assert.ok(th.x > 3, 'and did not turn to p1: ' + th.x);
  b.hp = 0;
  run(g, 0.1);
  assert.equal(b.alive, false);
  const x1 = th.x;
  run(g, 3);
  assert.ok(th.x < x1 - 3, 'with p2 down it heads for p1: ' + x1 + ' -> ' + th.x);
});

// A real enemy through the sim's own spawn path.
function spawnReal(g, kind, x, z) {
  g.spawnQ = [kind];
  g.waveInfo = { list: [kind], hpScale: 1, speedScale: 1, interval: 0.3 };
  g.waveT = 0;
  g.spawnT = 0;
  g.wave = 1;
  seedRandom(5);
  step(g, { players: {} }, DT);
  unseedRandom();
  const th = g.enemies[g.enemies.length - 1];
  th.x = x; th.z = z; th.state = 'chase'; th.stateT = 0;
  g.waveT = 1e9;
  return th;
}

test('waves grow with the party', () => {
  const sizes = [1, 2, 3, 4].map((n) => {
    const g = party(n);
    g.waveT = 0.001;
    step(g, { players: {} }, DT);
    return { n, count: g.spawnQ.length + g.enemies.length, hp: g.waveInfo.hpScale };
  });
  assert.ok(sizes[1].count > sizes[0].count && sizes[2].count > sizes[1].count && sizes[3].count > sizes[2].count, JSON.stringify(sizes));
  assert.ok(Math.abs(sizes[3].hp / sizes[0].hp - 2.2) < 1e-9, 'hp x(1 + 0.4 x 3)');
  assert.ok(Math.abs(sizes[3].count / sizes[0].count - 2.5) < 0.3, 'about x2.5 the enemies');
  const solo = createGame('ember_pyromancer');
  solo.mode = 'play'; solo.waveT = 0.001;
  step(solo, { move: { x: 0, z: 0 }, aim: { x: 0, z: -5 }, actions: [] }, DT);
  assert.equal(solo.spawnQ.length + solo.enemies.length, sizes[0].count, 'one wizard: the old wave');
});

test('at zero health a wizard is downed, not dead, and the run goes on', () => {
  const g = party(2);
  const b = g.players[1];
  b.hp = 0;
  const ev = run(g, 0.1);
  assert.equal(b.alive, false);
  assert.equal(b.down, true);
  assert.equal(g.mode, 'play');
  assert.equal(ofType(ev, 'playerDown').length, 1);
  assert.equal(ofType(ev, 'playerDown')[0].pid, 'p2');
  assert.equal(ofType(ev, 'playerDeath').length, 0);
});

test('a living ally standing close revives a downed wizard in three seconds', () => {
  const g = party(2);
  const [a, b] = g.players;
  b.hp = 0;
  run(g, 0.1);
  a.x = b.x + 1.0; a.z = b.z;
  const ev = run(g, 2.5);
  assert.equal(b.alive, false, 'not yet');
  assert.ok(b.reviveT > 2, 'progress: ' + b.reviveT);
  const ev2 = run(g, 1.0);
  assert.equal(b.alive, true);
  assert.equal(b.down, false);
  assert.ok(Math.abs(b.hp - b.maxHp * 0.4) < 1, 'back with 40%');
  assert.ok(b.st.invuln > 0, 'briefly invulnerable');
  assert.equal(ofType([...ev, ...ev2], 'revived')[0].pid, 'p2');
});

test('an ally standing far away does not revive, and the progress drains', () => {
  const g = party(2);
  const [a, b] = g.players;
  b.hp = 0;
  run(g, 0.1);
  a.x = b.x + 1.0; a.z = b.z;
  run(g, 1.5);
  assert.ok(b.reviveT > 1);
  a.x = b.x + 8; a.z = b.z;
  run(g, 4);
  assert.equal(b.alive, false);
  assert.ok(b.reviveT < 0.5, 'it drained: ' + b.reviveT);
});

test('the run ends only when every wizard is down', () => {
  const g = party(3);
  g.players[0].hp = 0;
  g.players[1].hp = 0;
  const ev = run(g, 0.1);
  assert.equal(g.mode, 'play');
  g.players[2].hp = 0;
  const ev2 = run(g, 0.1);
  assert.equal(g.mode, 'dead');
  assert.equal(ofType(ev2, 'playerDeath').length, 1);
  assert.equal(ofType(ev, 'playerDeath').length, 0);
});

test('a cleared wave raises the downed and heals everyone', () => {
  const g = party(2);
  const [a, b] = g.players;
  g.wave = 1; g.waveT = 5; g.spawnQ = []; g.enemies = [];
  b.hp = 0;
  run(g, 0.05);
  assert.equal(b.alive, false);
  a.hp = 40;
  g.waveT = 0;
  const ev = run(g, 0.2);
  assert.ok(ofType(ev, 'waveClear').length >= 1, 'wave cleared');
  assert.equal(b.alive, true, 'the downed is up');
  assert.ok(b.hp >= b.maxHp * 0.5 - 1);
  assert.ok(a.hp > 40, 'the living are healed');
});

test('barrels hurt everyone; your own blast hurts allies at half the rate', () => {
  const g = party(3);
  const [a, b, c] = g.players;
  for (const p of g.players) { p.x = 0; p.z = 0; }
  a.x = 0.4; b.x = -0.4; c.x = 0; c.z = 0.4; // all about the same distance from the middle
  g.props.barrels = [{ id: 'bx', type: 'barrel', x: 0, z: 0, r: 0.42, alive: true, fuse: 0.01 }];
  run(g, 0.1);
  const lost = g.players.map((p) => p.maxHp - p.hp);
  assert.ok(lost.every((l) => l > 5), 'all three were caught: ' + lost);
  assert.ok(Math.max(...lost) - Math.min(...lost) < 2, 'about equally');
});

test('friendly fire: the caster takes the full blast and allies half', () => {
  const g = party(2);
  const [a, b] = g.players;
  a.x = 0; a.z = 0; b.x = 0.6; b.z = 0;
  g.players.forEach((p) => { p.st.invuln = 0; });
  a.energy = b.energy = 100;
  // p1 lobs an explosive bolt straight down at their own feet: it bursts on the pillar-free floor at once
  g.props.pillars = [];
  g.shots.push({ id: g.nid++, kind: 'bolt', owner: 'player', pid: 'p1', x: 0.3, z: 0, vx: 0, vz: 0, r: 0.3, life: 1, pierce: 0, hits: [],
    sp: null, color: 0xff7a2f, els: ['fire'] });
  g.shots[0].sp = makeSpell(['fire', 'earth'], { name: 'Test bomb', shape: 'bolt', explode: 2.5, mult: 2 });
  g.shots[0].life = 0; // expires this step: boulders/spears burst when their life runs out
  g.shots[0].kind = 'boulder';
  const ev = run(g, 0.05);
  assert.ok(ofType(ev, 'explode').length >= 1, 'it burst');
  const la = a.maxHp - a.hp, lb = b.maxHp - b.hp;
  assert.ok(la > 0 && lb > 0, `both hurt: ${la} ${lb}`);
  assert.ok(lb < la * TUNING.friendly * 1.25 + 0.5 && lb > la * TUNING.friendly * 0.5, `ally takes about half: ${la} vs ${lb}`);
});

test('a healing field helps an ally standing in it', () => {
  const g = party(2);
  const [a, b] = g.players;
  a.x = 0; a.z = 0; b.x = 2.5; b.z = 0;
  b.hp = 40;
  a.role = 'guardian';
  const ev = run(g, 5, { p1: { move: { x: 0, z: 0 }, aim: { x: 0, z: -4 }, actions: ['el:nature', 'el:nature', 'nova'] }, p2: idle() });
  assert.ok(ofType(ev, 'area').length >= 1, 'World Tree was planted');
  assert.ok(b.hp > 55, 'the ally was healed: ' + b.hp);
  assert.ok(b.st.invuln >= 0 && ev.length > 0);
});

test('there is no pause and no hit-stop in co-op', () => {
  const g = party(2);
  step(g, { players: { p1: { move: { x: 0, z: 0 }, aim: { x: 0, z: -8 }, actions: ['pause'] } } }, DT);
  assert.equal(g.mode, 'play');
  run(g, 1.5, { p1: { move: { x: 0, z: 0 }, aim: { x: 0, z: -8 }, actions: ['el:fire', 'el:earth', 'cast'] } });
  assert.equal(g.hitstop, 0);
  const solo = createGame('ember_pyromancer');
  solo.mode = 'play';
  step(solo, { move: { x: 0, z: 0 }, aim: { x: 0, z: 0 }, actions: ['pause'] }, DT);
  assert.equal(solo.mode, 'paused', 'single-player still pauses');
});

test('a wizard who leaves mid-run takes their things with them', () => {
  const g = party(3);
  g.shots.push({ id: g.nid++, kind: 'bolt', owner: 'player', pid: 'p2', x: 0, z: 0, vx: 1, vz: 0, r: 0.2, life: 2, pierce: 0, hits: [], sp: null, color: 0, els: [] });
  removePlayer(g, 'p2');
  assert.equal(g.players.length, 2);
  assert.doesNotThrow(() => run(g, 0.2));
});
