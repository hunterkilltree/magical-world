import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadCampaign, CampaignError, wizardsAvailable } from '../../src/game/campaign.js';
import { createGame, createCampaignGame, createCampaignCoopGame, step, seedRandom } from '../../src/game/sim.js';
import { emptyProfile, recordChapter } from '../../src/game/profile.js';
import { ORDER } from '../../src/game/spells.js';
import { WIZARD_ROLE } from '../../src/game/roles.js';

const DT = 1 / 60;
const file = JSON.parse(readFileSync(new URL('../../data/campaign.json', import.meta.url), 'utf8'));
const CIRCLE = ['ember_pyromancer', 'rime_cryomancer', 'stone_druid', 'storm_conduit', 'arcane_archmage'];

const chapter = (id, o = {}) => ({
  id, title: id, arena: 'court', waves: 2, waveStart: 1, rules: [], objective: { type: 'survive' }, unlocks: { elements: [], wizards: [] }, lessons: [],
  story: { briefing: id + '.briefing', ending: id + '.ending' }, ...o
});
const three = (extra = {}) => loadCampaign({ version: 1, ...extra, chapters: [
  chapter('one', { unlocks: { elements: ['fire', 'water', 'earth'], wizards: [] } }),
  chapter('two', { unlocks: { elements: ['ice', 'lightning'], wizards: ['zephyr_galesinger'] } }),
  chapter('three', { unlocks: { elements: ['nature'], wizards: ['terra_geomancer'] } })
] });
const problems = (data) => { try { loadCampaign(data); } catch (e) { assert.ok(e instanceof CampaignError); return e.problems.join('\n'); } assert.fail('expected a CampaignError'); };

test('each chapter knows the elements open in it: everything unlocked so far, this chapter included', () => {
  const c = three();
  assert.deepEqual(c.chapters[0].elements, ['fire', 'water', 'earth']);
  assert.deepEqual(c.chapters[1].elements, ['fire', 'water', 'earth', 'ice', 'lightning']);
  assert.deepEqual(c.chapters[2].elements, ['fire', 'water', 'earth', 'ice', 'lightning', 'nature']);
  const dup = loadCampaign({ version: 1, chapters: [chapter('a', { unlocks: { elements: ['fire'], wizards: [] } }), chapter('b', { unlocks: { elements: ['fire', 'ice'], wizards: [] } })] });
  assert.deepEqual(dup.chapters[1].elements, ['fire', 'ice'], 'no duplicates');
});

test('the circle is the wizards who start; the rest are earned by clearing the chapter that unlocks them', () => {
  const c = three({ circle: CIRCLE });
  assert.deepEqual([...c.circle], CIRCLE);
  assert.deepEqual(wizardsAvailable(c, []).sort(), [...CIRCLE].sort());
  assert.deepEqual(wizardsAvailable(c, ['zephyr_galesinger']).sort(), [...CIRCLE, 'zephyr_galesinger'].sort());
  assert.deepEqual(wizardsAvailable(c, ['merlin']).sort(), [...CIRCLE].sort(), 'unknown ids are ignored');
  assert.ok(!wizardsAvailable(c, []).includes('void_necromancer'));
});

test('without an explicit circle it is every wizard no chapter unlocks', () => {
  const c = three();
  assert.deepEqual([...c.circle].sort(), Object.keys(WIZARD_ROLE).filter((w) => !['zephyr_galesinger', 'terra_geomancer'].includes(w)).sort());
});

test('the circle is checked', () => {
  assert.match(problems({ version: 1, circle: [], chapters: [chapter('a')] }), /circle/);
  assert.match(problems({ version: 1, circle: ['merlin'], chapters: [chapter('a')] }), /circle\[0\]/);
  assert.match(problems({ version: 1, circle: 'ember_pyromancer', chapters: [chapter('a')] }), /circle/);
  assert.match(problems({ version: 1, circle: CIRCLE, chapters: [chapter('a', { unlocks: { elements: [], wizards: ['ember_pyromancer'] } })] }), /circle\[0\].*unlock/, 'a wizard cannot both start and be earned');
});

test('a profile that has cleared a chapter has its wizards', () => {
  const c = three({ circle: CIRCLE });
  const p = emptyProfile();
  recordChapter(p, { id: 'two', unlocks: c.byId.two.unlocks, retries: 0 });
  assert.ok(wizardsAvailable(c, p.unlocked.wizards).includes('zephyr_galesinger'));
  assert.ok(!wizardsAvailable(c, p.unlocked.wizards).includes('terra_geomancer'));
});

test('the real campaign: the circle of five, and fire, water and earth in the prologue', () => {
  const c = loadCampaign(file);
  assert.deepEqual([...c.circle].sort(), [...CIRCLE].sort());
  assert.deepEqual(c.chapters[0].elements, ['fire', 'water', 'earth']);
  for (const w of ['terra_geomancer', 'zephyr_galesinger', 'void_necromancer']) assert.ok(!c.circle.includes(w), w + ' is earned, not given');
});

// ---- the sim
const begun = (ch, wiz = 'ember_pyromancer', role = 'destroyer') => {
  seedRandom(3);
  const g = createCampaignGame(wiz, role, ch);
  g.mode = 'play';
  step(g, { move: { x: 0, z: 0 }, aim: { x: 0, z: -8 }, actions: ['begin'] }, DT);
  return g;
};
const press = (g, ...els) => {
  const out = [];
  for (const el of els) out.push(...step(g, { move: { x: 0, z: 0 }, aim: { x: 0, z: -8 }, actions: ['el:' + el] }, DT));
  return out;
};
const types = (ev, t) => ev.filter((e) => e.type === t);

test('a locked element is refused with an event and never enters the queue', () => {
  const g = begun(three().chapters[0]);
  const locked = ORDER.filter((e) => !['fire', 'water', 'earth'].includes(e));
  assert.equal(locked.length, 7);
  for (const el of locked) {
    const ev = press(g, el);
    assert.deepEqual(types(ev, 'locked').map((e) => [e.pid, e.el]), [['player', el]], el);
    assert.deepEqual(g.player.queue, [], el + ' is not in the queue');
  }
  const ok = press(g, 'fire', 'earth');
  assert.equal(types(ok, 'locked').length, 0);
  assert.deepEqual(g.player.queue, ['fire', 'earth']);
});

test('a locked element does not cancel an opposite that is queued', () => {
  const g = begun(three().chapters[0]);
  press(g, 'fire');
  const ev = press(g, 'ice'); // ice would cancel fire if it were open
  assert.deepEqual(g.player.queue, ['fire'], 'fire stays');
  assert.equal(types(ev, 'cancel').length, 0);
  assert.equal(types(ev, 'locked').length, 1);
});

test('no spell that needs a locked element can be cast', () => {
  const g = begun(three().chapters[0]);
  press(g, 'lightning', 'ice', 'nature');
  assert.deepEqual(g.player.queue, []);
  const ev = step(g, { move: { x: 0, z: 0 }, aim: { x: 0, z: -8 }, actions: ['cast'] }, DT);
  assert.equal(types(ev, 'cast').length, 0, 'an empty queue casts nothing');
  assert.equal(g.player.wind, null);
  // what is cast only ever contains open elements
  press(g, 'fire', 'water', 'earth');
  const all = [];
  for (let i = 0; i < 90; i++) all.push(...step(g, { move: { x: 0, z: 0 }, aim: { x: 0, z: -8 }, actions: i === 0 ? ['cast'] : [] }, DT));
  const casts = types(all, 'cast');
  assert.ok(casts.length >= 1);
  for (const c of casts) assert.ok(c.els.every((e) => ['fire', 'water', 'earth'].includes(e)));
});

test('a later chapter opens the elements it unlocks', () => {
  const g = begun(three().chapters[1]);
  const ev = press(g, 'ice', 'lightning');
  assert.equal(types(ev, 'locked').length, 0);
  assert.deepEqual(g.player.queue, ['ice', 'lightning']);
  const ev2 = press(g, 'nature');
  assert.equal(types(ev2, 'locked').length, 1, 'nature waits for chapter three');
});

test('co-op: every player is held to the same elements', () => {
  seedRandom(3);
  const g = createCampaignCoopGame([{ wizard: 'ember_pyromancer', name: 'A' }, { wizard: 'rime_cryomancer', name: 'B' }], three().chapters[0]);
  g.mode = 'play';
  const ev = step(g, { players: { p1: { actions: ['begin', 'el:wind'] }, p2: { actions: ['el:dark', 'el:water'] } } }, DT);
  assert.deepEqual(types(ev, 'locked').map((e) => [e.pid, e.el]), [['p1', 'wind'], ['p2', 'dark']]);
  assert.deepEqual(g.players[0].queue, []);
  assert.deepEqual(g.players[1].queue, ['water']);
});

test('quick play has every element, as ever', () => {
  seedRandom(3);
  const g = createGame('ember_pyromancer', 'destroyer');
  g.mode = 'play';
  const ev = press(g, 'lightning', 'nature', 'dark');
  assert.equal(types(ev, 'locked').length, 0);
  assert.deepEqual(g.player.queue, ['lightning', 'nature', 'dark']);
  assert.equal(g.campaign ?? null, null);
});
