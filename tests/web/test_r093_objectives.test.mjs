import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCampaign, CampaignError } from '../../src/game/campaign.js';
import { createGame, createCampaignGame, createCampaignCoopGame, step, newStatus, seedRandom } from '../../src/game/sim.js';
import { ENEMY_TYPES, PARTY_SCALE } from '../../src/game/enemies.js';

const DT = 1 / 60;
const chapter = (objective, o = {}) => loadCampaign({ version: 1, chapters: [{
  id: 'c', title: 'C', arena: 'court', waves: 2, waveStart: 1, rules: [], objective, unlocks: { elements: ['fire', 'water', 'ice', 'lightning', 'earth', 'arcane', 'nature', 'wind'], wizards: [] },
  lessons: [], story: { briefing: 'c.briefing', ending: 'c.ending' }, ...o
}] }).chapters[0];
const problems = (objective) => { try { chapter(objective); } catch (e) { assert.ok(e instanceof CampaignError); return e.problems.join('\n'); } assert.fail('expected a CampaignError'); };

const types = (ev, t) => ev.filter((e) => e.type === t);
const IDLE = { move: { x: 0, z: 0 }, aim: { x: 0, z: -8 }, actions: [] };
const run = (g, seconds, actions = [], aim = IDLE.aim) => {
  const out = [];
  for (let i = 0, n = Math.round(seconds / DT); i < n; i++) out.push(...step(g, { move: { x: 0, z: 0 }, aim, actions: i === 0 ? actions : [] }, DT));
  return out;
};
const started = (obj, o = {}) => { seedRandom(4); const g = createCampaignGame('ember_pyromancer', 'destroyer', chapter(obj, o)); g.mode = 'play'; run(g, 0.1, ['begin']); return g; };
const startedCoop = (obj, n = 2) => {
  seedRandom(4);
  const g = createCampaignCoopGame(['ember_pyromancer', 'rime_cryomancer', 'stone_druid', 'storm_conduit'].slice(0, n).map((w, i) => ({ wizard: w, name: 'P' + i })), chapter(obj));
  g.mode = 'play';
  step(g, { players: { p1: { actions: ['begin'] } } }, DT);
  return g;
};
const dummy = (g, x, z, kind = 'thrall', hp = 5000) => {
  const T = ENEMY_TYPES[kind];
  const e = { id: g.nid++, kind, T, x, z, vx: 0, vz: 0, kvx: 0, kvz: 0, r: T.r, mass: T.mass, hp, maxHp: hp, speed: T.speed, resist: T.resist, face: 0, st: newStatus(),
    state: 'chase', stateT: 0, atkCd: 0.2, flash: 0, dotAcc: 0, strafe: 1, aimX: 0, aimZ: 1, slamX: 0, slamZ: 0, hitDone: false };
  g.enemies.push(e);
  return e;
};
const cast = (g, els, aim) => run(g, 0.7, ['clear', ...els.map((e) => 'el:' + e), 'cast'], aim);

const HOLD = { type: 'hold', name: 'Bridge winch', hp: 240, x: 0, z: -7 };
const BURN = { type: 'burn', name: 'Log pile', x: 0, z: -5, r: 1.6, need: 4 };
const ESC = { type: 'escape', name: 'Dusk', seconds: 60, exit: { x: 0, z: 17, r: 2.5 } };

// ---- the data
test('objectives are validated and given their defaults', () => {
  const h = chapter({ type: 'hold' }).objective;
  assert.equal(h.type, 'hold');
  assert.ok(h.hp > 0 && Number.isFinite(h.x) && Number.isFinite(h.z) && h.healPct >= 0, 'a bare hold gets sensible defaults');
  assert.ok(chapter({ type: 'burn' }).objective.need > 0);
  assert.ok(chapter({ type: 'escape' }).objective.exit.r > 0);
  assert.deepEqual(chapter({ type: 'survive' }).objective, { type: 'survive' });
  assert.match(problems({ type: 'hold', hp: -5 }), /objective\.hp/);
  assert.match(problems({ type: 'hold', x: 99, z: 0 }), /objective\.x/);
  assert.match(problems({ type: 'hold', healPct: 3 }), /objective\.healPct/);
  assert.match(problems({ type: 'burn', need: 0 }), /objective\.need/);
  assert.match(problems({ type: 'burn', r: 'big' }), /objective\.r/);
  assert.match(problems({ type: 'escape', seconds: 0 }), /objective\.seconds/);
  assert.match(problems({ type: 'escape', exit: { x: 0 } }), /objective\.exit/);
  assert.match(problems({ type: 'escape', exit: { x: 40, z: 0, r: 2 } }), /objective\.exit/);
  assert.match(problems({ type: 'dance' }), /objective\.type/);
});

test('an objective that is not built yet cannot start', () => {
  for (const type of ['braziers', 'cross', 'circle']) {
    assert.throws(() => createCampaignGame('ember_pyromancer', 'destroyer', chapter({ type })), new RegExp(type + '.*not built'));
  }
});

// ---- hold
test('hold: a structure with health stands where the chapter says, scaled by the party', () => {
  const g = started(HOLD);
  const o = g.campaign.obj;
  assert.equal(o.type, 'hold');
  const D = g.decoys.find((d) => d.id === o.id);
  assert.ok(D && D.objective, 'the structure is on the field');
  assert.deepEqual([D.x, D.z], [0, -7]);
  assert.equal(D.hp, 240);
  const big = startedCoop(HOLD, 4);
  const D4 = big.decoys.find((d) => d.id === big.campaign.obj.id);
  assert.equal(D4.hp, Math.round(240 * (1 + PARTY_SCALE.count * 3)), 'more wizards, more enemies, a sturdier structure');
  assert.ok(startedCoop(HOLD, 2).decoys[0].hp > 240);
});

test('hold: enemies attack the structure before they attack you', () => {
  const g = started(HOLD);
  g.waveT = 1e9;
  g.player.x = 0; g.player.z = 3.5;
  const foe = dummy(g, 1, -4);
  const D = g.decoys.find((d) => d.objective);
  const hp0 = g.player.hp;
  run(g, 4);
  assert.ok(D.hp < 240, 'the structure is hit');
  assert.equal(g.player.hp, hp0, 'and the wizard is left alone');
  assert.ok(Math.hypot(foe.x - D.x, foe.z - D.z) < 2.5, 'the enemy went to it, not to the wizard');
});

test('hold: even an enemy far from both goes straight for the structure, not the wizard', () => {
  const g = started(HOLD);
  g.waveT = 1e9;
  g.player.x = -14; g.player.z = 14;
  const D = g.decoys.find((d) => d.objective);
  const foe = dummy(g, 14, 14);
  const toD = [D.x - foe.x, D.z - foe.z], L = Math.hypot(...toD);
  assert.ok(L > 11 && Math.hypot(foe.x - g.player.x, foe.z - g.player.z) > 11, 'beyond the usual reach of a double');
  run(g, 1.5);
  const moved = [foe.x - 14, foe.z - 14], M = Math.hypot(...moved);
  assert.ok(M > 2, 'it set off');
  assert.ok((moved[0] * toD[0] + moved[1] * toD[1]) / (M * L) > 0.95, 'towards the structure (the wizard is the other way)');
});

test('hold: your own spells do not hurt it', () => {
  const g = started(HOLD);
  g.waveT = 1e9;
  g.player.x = 0; g.player.z = -3;
  const D = g.decoys.find((d) => d.objective);
  cast(g, ['fire', 'fire'], { x: 0, z: -7 });
  cast(g, ['earth'], { x: 0, z: -7 });
  assert.equal(D.hp, 240);
});

test('hold: a cleared wave mends the structure a little', () => {
  const g = started(HOLD);
  g.waveT = 0.1;
  run(g, 3);
  const D = g.decoys.find((d) => d.objective);
  D.hp = 100;
  let ev = [];
  for (let i = 0; i < 60 * 30 && !types(ev, 'waveClear').length; i++) { for (const e of g.enemies) e.hp = 0; ev = run(g, 0.05); }
  assert.equal(types(ev, 'waveClear').length, 1);
  assert.equal(D.hp, 100 + 240 * 0.25, 'a quarter of its health');
  assert.equal(g.campaign.obj.hp, D.hp);
});

test('hold: at 0 health the wave comes again, the structure is whole and the chapter is kept', () => {
  const g = started(HOLD);
  g.waveT = 0.1;
  run(g, 3);
  assert.equal(g.wave, 1);
  const D = g.decoys.find((d) => d.objective);
  D.hp = 0;
  const ev = run(g, 0.3);
  assert.equal(types(ev, 'objectiveFail').length, 1);
  assert.equal(types(ev, 'objectiveFail')[0].kind, 'hold');
  assert.equal(types(ev, 'retry').length, 1, 'solo: the wave restarts');
  assert.equal(g.mode, 'play');
  assert.equal(g.campaign.retries, 1);
  assert.equal(g.wave, 0, 'back before the first wave');
  const again = g.decoys.find((d) => d.objective);
  assert.ok(again && again !== D && again.hp === 240, 'a whole structure again');
  assert.equal(g.decoys.filter((d) => d.objective).length, 1, 'and only one');
  assert.equal(g.campaign.obj.id, again.id);
});

test('hold: it must still stand when the last wave is cleared', () => {
  const g = started(HOLD);
  const ev = [];
  for (let i = 0; i < 60 * 90 && !['reward', 'camp'].includes(g.campaign.phase); i++) {
    for (const e of g.enemies) e.hp = 0;
    ev.push(...run(g, 0.05));
  }
  assert.ok(['reward', 'camp'].includes(g.campaign.phase));
  assert.equal(types(ev, 'chapterClear').length, 1);
  assert.equal(g.wave, 2);
});

test('hold, co-op: the structure falling ends the chapter attempt', () => {
  const g = startedCoop(HOLD, 2);
  g.waveT = 0.1;
  for (let i = 0; i < 30; i++) step(g, { players: {} }, DT);
  g.decoys.find((d) => d.objective).hp = 0;
  const ev = []; for (let i = 0; i < 20; i++) ev.push(...step(g, { players: {} }, DT));
  assert.equal(types(ev, 'objectiveFail').length, 1);
  assert.equal(g.campaign.phase, 'failed');
  assert.equal(g.mode, 'dead');
});

// ---- burn
test('burn: the target ignores everything but fire', () => {
  for (const el of ['water', 'ice', 'lightning', 'earth', 'arcane', 'nature', 'wind']) {
    const g = started(BURN);
    g.waveT = 1e9;
    g.player.x = 0; g.player.z = -1;
    const T = g.props.targets[0];
    assert.equal(T.state, 'whole');
    cast(g, [el], { x: 0, z: -5 });
    cast(g, [el, el], { x: 0, z: -5 });
    assert.equal(T.state, 'whole', el + ' does nothing to it');
  }
});

test('burn: fire lights it, it burns for the time it needs, and then it is gone', () => {
  const g = started(BURN);
  g.waveT = 1e9;
  g.player.x = 0; g.player.z = -1;
  const T = g.props.targets[0];
  const o = g.campaign.obj;
  assert.deepEqual([T.x, T.z, T.r], [0, -5, 1.6]);
  const ev = cast(g, ['fire'], { x: 0, z: -5 });
  assert.equal(T.state, 'burning');
  assert.ok(types(ev, 'ignite').length >= 1);
  run(g, 2);
  assert.equal(T.state, 'burning');
  assert.ok(o.progress > 1 && o.progress < 4, 'progress shows on the objective');
  const done = run(g, 3);
  assert.equal(T.state, 'ash');
  assert.equal(o.done, true);
  assert.equal(types(done, 'objectiveDone').filter((e) => e.kind === 'burn').length, 1);
});

test('burn: water puts a burning target out and the burn starts over', () => {
  const g = started(BURN);
  g.waveT = 1e9;
  g.player.x = 0; g.player.z = -1;
  const T = g.props.targets[0];
  cast(g, ['fire'], { x: 0, z: -5 });
  run(g, 2);
  assert.equal(T.state, 'burning');
  g.player.energy = 100;
  cast(g, ['water'], { x: 0, z: -5 });
  assert.equal(T.state, 'whole');
  assert.equal(g.campaign.obj.progress, 0);
  g.player.energy = 100;
  cast(g, ['fire'], { x: 0, z: -5 });
  run(g, 5);
  assert.equal(T.state, 'ash');
});

test('burn: a burning enemy standing in it lights it too', () => {
  const g = started(BURN);
  g.waveT = 1e9;
  const foe = dummy(g, 0, -5);
  foe.st.burn = 3; foe.st.burnDps = 1;
  run(g, 0.3);
  assert.equal(g.props.targets[0].state, 'burning');
});

test('burn: the chapter waits for the fire after the last wave, and ends when it is done', () => {
  const g = started(BURN);
  for (let i = 0; i < 60 * 90 && g.wave < 2; i++) { for (const e of g.enemies) e.hp = 0; run(g, 0.05); }
  for (let i = 0; i < 60 * 30; i++) { for (const e of g.enemies) e.hp = 0; run(g, 0.05); if (g.campaign.holding) break; }
  assert.equal(g.campaign.holding, true, 'all the waves are cleared but the pile still stands');
  assert.equal(g.campaign.phase !== 'reward', true);
  const quiet = run(g, 6);
  assert.equal(g.wave, 2, 'no further waves');
  assert.equal(types(quiet, 'waveClear').length, 0, 'the last wave is not cleared again and again');
  assert.equal(types(quiet, 'objectiveWait').length, 0);
  assert.equal(g.campaign.prevCheckpoint.wave, 1, 'the checkpoint before the last wave is kept');
  g.player.x = 0; g.player.z = -1;
  g.player.energy = 100;
  cast(g, ['fire'], { x: 0, z: -5 });
  const ev = run(g, 6);
  assert.equal(types(ev, 'chapterClear').length, 1);
});

test('burn: burnt early, the chapter ends with the last wave', () => {
  const g = started(BURN);
  g.waveT = 1e9;
  g.player.x = 0; g.player.z = -1;
  cast(g, ['fire'], { x: 0, z: -5 });
  run(g, 5);
  assert.equal(g.campaign.obj.done, true);
  g.waveT = 0.1;
  const ev = [];
  for (let i = 0; i < 60 * 90 && !['reward', 'camp'].includes(g.campaign.phase); i++) { for (const e of g.enemies) e.hp = 0; ev.push(...run(g, 0.05)); }
  assert.equal(types(ev, 'chapterClear').length, 1);
  assert.equal(g.wave, 2);
});

// ---- escape
test('escape: the timer runs through the waves, scaled by the party, and not in the briefing', () => {
  seedRandom(4);
  const g = createCampaignGame('ember_pyromancer', 'destroyer', chapter(ESC));
  g.mode = 'play';
  run(g, 10);
  assert.equal(g.campaign.obj.t, undefined, 'nothing until the chapter begins');
  run(g, 0.1, ['begin']);
  assert.equal(g.campaign.obj.max, 60);
  assert.ok(g.campaign.obj.t <= 60 && g.campaign.obj.t > 59.8, 'the clock starts with the chapter');
  run(g, 5);
  assert.ok(g.campaign.obj.t < 55 && g.campaign.obj.t > 54.5);
  const one = startedCoop(ESC, 1), four = startedCoop(ESC, 4);
  assert.equal(one.campaign.obj.max, 60 * (1 + (PARTY_SCALE.count / 2) * 0));
  assert.equal(four.campaign.obj.max, 60 * (1 + (PARTY_SCALE.count / 2) * 3));
  assert.ok(four.campaign.obj.max < 60 * (1 + PARTY_SCALE.count * 3), 'gentler than the enemy count factor');
});

test('escape: when the dusk falls the attempt ends like a wipe, and starts again with the clock reset', () => {
  const g = started(ESC);
  g.campaign.obj.t = 0.2;
  const ev = run(g, 0.5);
  assert.equal(types(ev, 'objectiveFail').filter((e) => e.why === 'timeout').length, 1);
  assert.equal(types(ev, 'retry').length, 1);
  assert.equal(g.mode, 'play');
  assert.ok(g.campaign.obj.t > 59 && g.campaign.obj.t <= 60, 'the clock starts again');
  assert.equal(g.campaign.obj.open, false);
});

test('escape: the exit opens when the waves are done; every living wizard must stand in it', () => {
  const g = started(ESC);
  for (let i = 0; i < 60 * 90 && !g.campaign.obj.open; i++) { for (const e of g.enemies) e.hp = 0; run(g, 0.05); }
  assert.equal(g.campaign.obj.open, true);
  assert.equal(g.campaign.holding, true);
  assert.notEqual(g.campaign.phase, 'reward');
  assert.equal(g.wave, 2);
  run(g, 3);
  assert.notEqual(g.campaign.phase, 'reward', 'standing far from the exit is not leaving');
  g.player.x = 0; g.player.z = 17;
  const ev = run(g, 2);
  assert.equal(types(ev, 'chapterClear').length, 1, 'inside the ring for a moment, and out');
});

test('escape, co-op: one wizard outside keeps the exit shut; a downed wizard does not', () => {
  const g = startedCoop(ESC, 2);
  g.waveT = 1e9;
  g.campaign.obj.open = true; g.campaign.holding = true; g.wave = 2;
  const [a, b] = g.players;
  a.x = 0; a.z = 17; b.x = 0; b.z = 0;
  for (let i = 0; i < 180; i++) step(g, { players: {} }, DT);
  assert.notEqual(g.campaign.phase, 'reward');
  b.alive = false; b.down = true; b.hp = 0;
  const ev = []; for (let i = 0; i < 180; i++) ev.push(...step(g, { players: {} }, DT));
  assert.equal(types(ev, 'chapterClear').length, 1);
});

test('quick play has no objective', () => {
  seedRandom(4);
  const g = createGame('ember_pyromancer', 'destroyer');
  assert.equal(g.campaign ?? null, null);
  assert.equal(g.props.targets, undefined);
  assert.equal(g.decoys.length, 0);
});
