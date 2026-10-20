import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadCampaign, CampaignError, PHASES } from '../../src/game/campaign.js';
import { createGame, createCampaignGame, createCampaignCoopGame, retryChapter, step, seedRandom, unseedRandom } from '../../src/game/sim.js';
import { waveRoster } from '../../src/game/enemies.js';

const DT = 1 / 60;
const file = JSON.parse(readFileSync(new URL('../../data/campaign.json', import.meta.url), 'utf8'));

const chapter = (o = {}) => ({
  id: 'one', title: 'One', arena: 'court', waves: 2, waveStart: 1, rules: [], objective: { type: 'survive' },
  unlocks: { elements: ['fire'], wizards: [] }, lessons: ['fire+water'], story: { briefing: 'one.briefing', ending: 'one.ending' }, ...o
});
const fake = (...chapters) => loadCampaign({ version: 1, chapters: chapters.length ? chapters : [chapter(), chapter({ id: 'two', title: 'Two', waves: 3, waveStart: 3, unlocks: { elements: ['ice'], wizards: ['terra_geomancer'] } })] });
const problems = (data) => { try { loadCampaign(data); } catch (e) { assert.ok(e instanceof CampaignError, 'a CampaignError, not ' + e); return e.problems; } assert.fail('expected a CampaignError'); };

// ---- the data file
test('data/campaign.json loads: chapters in order, ids unique, every field valid', () => {
  const c = loadCampaign(file);
  assert.ok(c.chapters.length >= 1);
  assert.equal(c.chapters[0].id, 'prologue');
  assert.equal(new Set(c.chapters.map((x) => x.id)).size, c.chapters.length);
  for (const ch of c.chapters) assert.equal(c.byId[ch.id], ch);
});

test('a malformed campaign is refused with a clear message that names every problem', () => {
  assert.throws(() => loadCampaign(null), CampaignError);
  assert.throws(() => loadCampaign('chapters'), /campaign/);
  const bad = problems({ version: 2, chapters: [chapter({ waves: 0 }), chapter({ id: 'one', arena: 'moon' }), chapter({ id: 'three', objective: { type: 'dance' } })] });
  const text = bad.join('\n');
  assert.match(text, /version/);
  assert.match(text, /chapters\[0\]\.waves/);
  assert.match(text, /chapters\[1\]\.id.*duplicate/);
  assert.match(text, /chapters\[1\]\.arena/);
  assert.match(text, /chapters\[2\]\.objective\.type/);
  assert.ok(bad.length >= 5);
  try { loadCampaign({ version: 1, chapters: [chapter({ waves: 99 })] }); } catch (e) { assert.match(e.message, /campaign/); assert.match(e.message, /1 problem/); }
});

test('each field is checked on its own', () => {
  const one = (o) => problems({ version: 1, chapters: [chapter(o)] }).join('\n');
  assert.match(one({ id: 'Bad Id' }), /id/);
  assert.match(one({ title: '' }), /title/);
  assert.match(one({ waves: 1.5 }), /waves/);
  assert.match(one({ waveStart: 0 }), /waveStart/);
  assert.match(one({ rules: 'thin_ice' }), /rules/);
  assert.match(one({ unlocks: { elements: ['plasma'], wizards: [] } }), /unlocks\.elements/);
  assert.match(one({ unlocks: { elements: [], wizards: ['merlin'] } }), /unlocks\.wizards/);
  assert.match(one({ lessons: ['fire+moon'] }), /lessons/);
  assert.match(one({ story: { briefing: '' } }), /story/);
  assert.deepEqual(problems({ version: 1, chapters: [] }).length, 1, 'an empty campaign is refused');
});

// ---- the runner
function clearWaves(g, max = 120) {
  const events = [];
  for (let i = 0; i < Math.round(max / DT); i++) {
    for (const e of g.enemies) e.hp = 0;
    events.push(...step(g, { move: { x: 0, z: 0 }, aim: { x: 0, z: -8 }, actions: [] }, DT));
    if (g.campaign.phase === 'reward' || g.campaign.phase === 'camp') break;
  }
  return events;
}
const run = (g, seconds, actions = []) => {
  const out = [];
  for (let i = 0, n = Math.round(seconds / DT); i < n; i++) out.push(...step(g, { move: { x: 0, z: 0 }, aim: { x: 0, z: -8 }, actions: i === 0 ? actions : [] }, DT));
  return out;
};
const types = (ev, t) => ev.filter((e) => e.type === t);
const game = (c = fake().chapters[0], wiz = 'ember_pyromancer', role = 'destroyer') => { seedRandom(9); const g = createCampaignGame(wiz, role, c); g.mode = 'play'; return g; };

test('a chapter starts in its briefing and nothing happens until it begins', () => {
  const g = game();
  assert.equal(g.campaign.phase, 'briefing');
  assert.equal(g.theme, 'court');
  run(g, 30);
  assert.equal(g.wave, 0);
  assert.equal(g.enemies.length, 0);
  const ev = run(g, 0.1, ['begin']);
  assert.equal(g.campaign.phase, 'waves');
  assert.equal(types(ev, 'chapterBegin').length, 1);
  run(g, 4);
  assert.equal(g.wave, 1, 'the first wave rises on the usual timer');
});

test('a chapter runs briefing, waves, climax, reward, camp, done', () => {
  const g = game();
  const seen = [g.campaign.phase];
  const all = [];
  const note = () => { if (seen[seen.length - 1] !== g.campaign.phase) seen.push(g.campaign.phase); };
  all.push(...run(g, 0.1, ['begin'])); note();
  for (let i = 0; i < 60 * 120 && !['reward', 'camp'].includes(g.campaign.phase); i++) {
    for (const e of g.enemies) e.hp = 0;
    all.push(...step(g, { move: { x: 0, z: 0 }, aim: { x: 0, z: -8 }, actions: [] }, DT)); note();
  }
  all.push(...run(g, 6)); note();
  assert.deepEqual(seen, ['briefing', 'waves', 'climax', 'reward', 'camp']);
  assert.deepEqual(types(all, 'climax').map((e) => e.n), [2], 'the climax is the last wave');
  const clear = types(all, 'chapterClear')[0];
  assert.equal(clear.id, 'one');
  assert.deepEqual(clear.unlocks, { elements: ['fire'], wizards: [] });
  assert.deepEqual(clear.lessons, ['fire+water']);
  assert.equal(g.wave, 2, 'no third wave starts');
  assert.equal(types(all, 'camp').length, 1);
  const ev = run(g, 0.1, ['continue']);
  assert.equal(g.campaign.phase, 'done');
  assert.deepEqual(types(ev, 'chapterDone').map((e) => [e.id, e.next]), [['one', 'two']]);
  run(g, 20);
  assert.equal(g.wave, 2);
  assert.equal(g.enemies.length, 0);
});

test('the last chapter has no next one; continue only works at the camp', () => {
  const c = fake();
  const g = game(c.chapters[1]);
  run(g, 0.1, ['continue']);
  assert.equal(g.campaign.phase, 'briefing', 'continue means nothing yet');
  run(g, 0.1, ['begin']);
  clearWaves(g);
  run(g, 6);
  assert.equal(g.campaign.phase, 'camp');
  const ev = run(g, 0.1, ['continue']);
  assert.deepEqual(types(ev, 'chapterDone').map((e) => e.next), [null]);
});

test('chapter difficulty comes from the existing wave scaling, not new numbers', () => {
  const c = fake();
  const early = game(c.chapters[0]), late = game(c.chapters[1]);
  run(early, 4, ['begin']); run(late, 4, ['begin']);
  assert.equal(early.wave, 1); assert.equal(late.wave, 1);
  seedRandom(1); const a = waveRoster(1, 1); const b = waveRoster(3, 1); unseedRandom();
  assert.equal(early.waveInfo.hpScale, a.hpScale);
  assert.equal(late.waveInfo.hpScale, b.hpScale, 'a chapter that starts at wave 3 plays wave 3 scaling');
  assert.ok(late.waveInfo.hpScale > early.waveInfo.hpScale);
  assert.equal(late.waveInfo.speedScale, b.speedScale);
  assert.equal(late.spawnQ.length + late.enemies.length, b.list.length);
});

test('solo: dying restarts the wave, not the chapter', () => {
  const g = game(fake().chapters[1]);
  run(g, 0.1, ['begin']);
  // clear wave 1 and wave 2 (checkpoints), die in wave 3
  while (g.wave < 3) { for (const e of g.enemies) e.hp = 0; run(g, 0.1); }
  const kills = g.kills, score = g.score;
  assert.equal(g.campaign.phase, 'climax', 'wave 3 of 3 is the climax');
  assert.equal(g.campaign.checkpoint.wave, 2);
  for (let i = 0; i < 200 && g.enemies.length < 2; i++) run(g, 0.1);
  g.kills += 7; g.score += 999; // what was earned in the failed attempt
  g.player.hp = 0;
  const ev = run(g, 0.2);
  assert.equal(g.mode, 'play', 'the run does not end');
  assert.equal(types(ev, 'retry').length, 1);
  assert.equal(types(ev, 'playerDeath').length, 0);
  assert.equal(g.campaign.retries, 1);
  assert.equal(g.wave, 2, 'back at the last cleared wave');
  assert.equal(g.campaign.phase, 'waves');
  assert.equal(g.kills, kills);
  assert.equal(g.score, score);
  assert.equal(g.enemies.length, 0);
  assert.equal(g.player.hp, g.player.maxHp);
  assert.equal(g.player.energy, g.player.maxEnergy);
  assert.ok(g.player.alive && !g.player.down);
  run(g, 5);
  assert.equal(g.wave, 3, 'wave 3 comes again');
  assert.equal(g.campaign.phase, 'climax');
});

test('solo: dying in the first wave restarts the first wave', () => {
  const g = game();
  run(g, 0.1, ['begin']);
  run(g, 4);
  assert.equal(g.wave, 1);
  g.player.hp = 0;
  const ev = run(g, 0.2);
  assert.equal(types(ev, 'retry')[0].wave, 1);
  assert.equal(g.wave, 0);
  assert.equal(g.mode, 'play');
  run(g, 4);
  assert.equal(g.wave, 1);
});

test('co-op: the chapter fails only when everyone is down, and can be retried from the checkpoint', () => {
  seedRandom(5);
  const g = createCampaignCoopGame([{ wizard: 'ember_pyromancer', name: 'A' }, { wizard: 'rime_cryomancer', name: 'B' }], fake().chapters[1]);
  g.mode = 'play';
  const coop = (n) => { const out = []; for (let i = 0; i < Math.round(n / DT); i++) out.push(...step(g, { players: {} }, DT)); return out; };
  const clear = () => { for (const e of g.enemies) e.hp = 0; coop(0.1); };
  const begin = step(g, { players: { p1: { move: { x: 0, z: 0 }, aim: { x: 0, z: -8 }, actions: ['begin'] } } }, DT);
  assert.equal(g.campaign.phase, 'waves');
  assert.equal(types(begin, 'chapterBegin').length, 1);
  while (g.wave < 2) clear();
  clear();
  assert.equal(g.campaign.checkpoint.wave, 1);
  g.players[0].hp = 0;
  const one = coop(0.2);
  assert.equal(g.mode, 'play', 'one wizard down, the other fights on');
  assert.equal(types(one, 'chapterFailed').length, 0);
  g.players[1].hp = 0;
  const wipe = coop(0.2);
  assert.equal(g.mode, 'dead');
  assert.equal(g.campaign.phase, 'failed');
  assert.equal(types(wipe, 'chapterFailed').length, 1);
  assert.equal(types(wipe, 'retry').length, 0, 'co-op waits for the party to choose');
  const ev = retryChapter(g);
  assert.equal(g.mode, 'play');
  assert.equal(g.campaign.phase, 'waves');
  assert.equal(g.wave, 1);
  assert.ok(g.players.every((p) => p.alive && p.hp === p.maxHp));
  assert.equal(types(ev, 'retry').length, 1);
  assert.equal(g.campaign.retries, 1);
});

test('quick play is untouched: no campaign state, a wipe still ends the run, scaling is the plain wave number', () => {
  seedRandom(9);
  const g = createGame('ember_pyromancer', 'destroyer');
  g.mode = 'play';
  assert.equal(g.campaign ?? null, null);
  run(g, 4);
  assert.equal(g.wave, 1);
  g.player.hp = 0;
  const ev = run(g, 0.2);
  assert.equal(g.mode, 'dead');
  assert.equal(types(ev, 'playerDeath').length, 1);
  assert.equal(types(ev, 'retry').length, 0);
  seedRandom(1); const a = waveRoster(1, 1); unseedRandom();
  assert.equal(g.waveInfo.hpScale, a.hpScale);
  assert.deepEqual(PHASES, ['briefing', 'waves', 'climax', 'reward', 'camp', 'done', 'failed']);
});
