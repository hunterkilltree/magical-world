import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROFILE_VERSION, STORAGE_KEY, emptyProfile, loadProfile, saveProfile, recordRun, recordChapter, recordPages, bestOf, describeBest,
  browserStorage, createProfileStore
} from '../../src/game/profile.js';

// A tiny localStorage: a Map with the same three methods.
const memory = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, _m: m };
};
const throwing = () => ({ getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); }, removeItem() { throw new Error('denied'); } });
const backups = (st) => [...st._m.keys()].filter((k) => k.startsWith(STORAGE_KEY + '.backup'));

test('no save: a fresh profile, and nothing is written until something is saved', () => {
  const st = memory();
  const { profile, status } = loadProfile(st);
  assert.equal(status, 'new');
  assert.equal(profile.version, PROFILE_VERSION);
  assert.deepEqual(profile.unlocked, { elements: [], wizards: [] });
  assert.deepEqual(profile.pages, []);
  assert.deepEqual(profile.chapters, {});
  assert.deepEqual(profile.best, {});
  assert.equal(st._m.size, 0);
});

test('a profile round-trips as plain JSON with a version number', () => {
  const st = memory();
  const p = emptyProfile();
  recordRun(p, { wizard: 'ember_pyromancer', wave: 7, score: 1240 });
  recordChapter(p, { id: 'prologue', unlocks: { elements: ['fire', 'water', 'earth'], wizards: [] }, lessons: ['fire+water'], retries: 1, choices: { colossus: 'freed' } });
  recordPages(p, ['fire+water', 'earth+fire']);
  assert.equal(saveProfile(st, p), true);
  const raw = JSON.parse(st.getItem(STORAGE_KEY));
  assert.equal(raw.version, PROFILE_VERSION);
  const back = loadProfile(st);
  assert.equal(back.status, 'loaded');
  assert.deepEqual(back.profile, p);
});

test('best wave and best score are kept per wizard, and a worse run never lowers them', () => {
  const p = emptyProfile();
  assert.deepEqual(recordRun(p, { wizard: 'ember_pyromancer', wave: 5, score: 900 }), { wave: true, score: true });
  assert.deepEqual(recordRun(p, { wizard: 'ember_pyromancer', wave: 3, score: 1500 }), { wave: false, score: true }, 'a short run with a big score');
  assert.deepEqual(recordRun(p, { wizard: 'ember_pyromancer', wave: 8, score: 100 }), { wave: true, score: false });
  assert.deepEqual(recordRun(p, { wizard: 'ember_pyromancer', wave: 2, score: 50 }), { wave: false, score: false });
  assert.deepEqual(bestOf(p, 'ember_pyromancer'), { wave: 8, score: 1500 });
  recordRun(p, { wizard: 'rime_cryomancer', wave: 4, score: 300 });
  assert.deepEqual(bestOf(p, 'rime_cryomancer'), { wave: 4, score: 300 });
  assert.deepEqual(bestOf(p, 'stone_druid'), { wave: 0, score: 0 }, 'no run yet');
});

test('bad runs are ignored: unknown wizards, nonsense numbers', () => {
  const p = emptyProfile();
  recordRun(p, { wizard: 'merlin', wave: 5, score: 5 });
  recordRun(p, { wizard: 'ember_pyromancer', wave: NaN, score: -4 });
  recordRun(p, { wizard: 'ember_pyromancer', wave: 2.7, score: 99.6 });
  assert.deepEqual(p.best, { ember_pyromancer: { wave: 2, score: 99 } }, 'whole numbers');
});

test('a cleared chapter unlocks its elements and wizards and is remembered, with the fewest retries and the choices made', () => {
  const p = emptyProfile();
  recordChapter(p, { id: 'prologue', unlocks: { elements: ['fire', 'water'], wizards: [] }, lessons: [], retries: 3, choices: {} });
  recordChapter(p, { id: 'ch1', unlocks: { elements: ['ice', 'fire'], wizards: ['terra_geomancer'] }, lessons: [], retries: 0, choices: { bridge: 'held' } });
  assert.deepEqual(p.unlocked.elements, ['fire', 'water', 'ice']);
  assert.deepEqual(p.unlocked.wizards, ['terra_geomancer']);
  assert.equal(p.chapters.prologue.cleared, true);
  recordChapter(p, { id: 'prologue', unlocks: { elements: ['fire'], wizards: [] }, lessons: [], retries: 1, choices: { oath: 'sworn' } });
  assert.equal(p.chapters.prologue.retries, 1, 'the best attempt');
  assert.deepEqual(p.chapters.prologue.choices, { oath: 'sworn' });
  assert.deepEqual(p.unlocked.elements, ['fire', 'water', 'ice'], 'no duplicates');
  assert.deepEqual(p.chapters.ch1.choices, { bridge: 'held' });
});

test('grimoire pages are collected without duplicates', () => {
  const p = emptyProfile();
  recordPages(p, ['fire+water', 'earth+fire']);
  recordPages(p, ['fire+water', 'ice+water', 7, '']);
  assert.deepEqual(p.pages, ['fire+water', 'earth+fire', 'ice+water']);
});

test('a corrupt save falls back to a fresh profile and the old text is kept', () => {
  for (const bad of ['{nope', '[]', '7', 'null', '"x"', JSON.stringify({ chapters: {} }), JSON.stringify({ version: 'one' }), JSON.stringify({ version: 0 })]) {
    const st = memory({ [STORAGE_KEY]: bad });
    const { profile, status } = loadProfile(st);
    assert.equal(status, 'recovered', bad);
    assert.deepEqual(profile, emptyProfile());
    assert.equal(st.getItem(STORAGE_KEY), bad, 'the unreadable save is left alone until something new is saved');
    assert.deepEqual(backups(st).map((k) => st.getItem(k)), [bad], 'and a copy is kept: ' + bad);
  }
});

test('a save from a newer version is not read, not lost, and not overwritten', () => {
  const future = JSON.stringify({ version: PROFILE_VERSION + 4, powers: ['everything'] });
  const st = memory({ [STORAGE_KEY]: future });
  const { profile, status } = loadProfile(st);
  assert.equal(status, 'newer');
  assert.deepEqual(profile, emptyProfile());
  recordRun(profile, { wizard: 'ember_pyromancer', wave: 2, score: 10 });
  saveProfile(st, profile);
  assert.equal(JSON.parse(st.getItem(STORAGE_KEY)).version, PROFILE_VERSION, 'the new profile now lives in the main slot');
  assert.ok(backups(st).some((k) => st.getItem(k) === future), 'the newer save survives in a backup');
});

test('several unreadable saves keep separate backups', () => {
  const st = memory({ [STORAGE_KEY]: '{one' });
  loadProfile(st);
  st.setItem(STORAGE_KEY, '{two');
  loadProfile(st);
  st.setItem(STORAGE_KEY, '{three');
  loadProfile(st);
  assert.deepEqual(backups(st).map((k) => st.getItem(k)).sort(), ['{one', '{three', '{two']);
  loadProfile(st);
  loadProfile(st);
  assert.equal(backups(st).length, 3, 'reading the same unreadable text again does not pile up copies');
});

test('odd fields inside a good save are repaired, not fatal; unknown ids are dropped', () => {
  const st = memory({ [STORAGE_KEY]: JSON.stringify({
    version: 1,
    unlocked: { elements: ['fire', 'plasma', 'fire', 5], wizards: ['terra_geomancer', 'merlin'] },
    pages: ['fire+water', 3, null, 'fire+water'],
    chapters: { prologue: { cleared: 'yes', retries: -2, choices: { a: 'b', c: 4 } }, 'Bad Id': { cleared: true }, ch1: 'x' },
    best: { ember_pyromancer: { wave: 'ten', score: 120.4 }, merlin: { wave: 9, score: 9 } }
  }) });
  const { profile, status } = loadProfile(st);
  assert.equal(status, 'loaded');
  assert.deepEqual(profile.unlocked, { elements: ['fire'], wizards: ['terra_geomancer'] });
  assert.deepEqual(profile.pages, ['fire+water']);
  assert.deepEqual(Object.keys(profile.chapters), ['prologue']);
  assert.deepEqual(profile.chapters.prologue, { cleared: false, retries: 0, choices: { a: 'b' } });
  assert.deepEqual(profile.best, { ember_pyromancer: { wave: 0, score: 120 } });
});

test('storage that throws (a private window) does not break anything', () => {
  const { profile, status } = loadProfile(throwing());
  assert.equal(status, 'unavailable');
  assert.deepEqual(profile, emptyProfile());
  assert.equal(saveProfile(throwing(), profile), false);
  assert.equal(saveProfile(null, profile), false);
  assert.equal(loadProfile(null).status, 'unavailable');
  assert.equal(loadProfile(undefined).status, 'unavailable');
  const store = createProfileStore(throwing());
  assert.deepEqual(store.recordRun({ wizard: 'ember_pyromancer', wave: 4, score: 80 }), { wave: true, score: true });
  assert.deepEqual(store.bestOf('ember_pyromancer'), { wave: 4, score: 80 }, 'it still remembers for this session');
  assert.equal(store.saved, false);
});

test('reaching localStorage can itself throw; that is handled', () => {
  const had = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { get localStorage() { throw new Error('SecurityError'); } } });
  try {
    assert.equal(browserStorage(), null);
    assert.equal(createProfileStore().status, 'unavailable');
  } finally {
    if (had) Object.defineProperty(globalThis, 'window', had); else delete globalThis.window;
  }
});

test('the store saves after each record, and remembers the last run for the defeat screen', () => {
  const st = memory();
  const store = createProfileStore(st);
  assert.equal(store.status, 'new');
  const r = store.recordRun({ wizard: 'rime_cryomancer', wave: 6, score: 777 });
  assert.deepEqual(r, { wave: true, score: true });
  assert.deepEqual(store.lastRun, { wizard: 'rime_cryomancer', wave: 6, score: 777, improved: { wave: true, score: true } });
  assert.equal(JSON.parse(st.getItem(STORAGE_KEY)).best.rime_cryomancer.wave, 6, 'already on disk');
  store.recordRun({ wizard: 'rime_cryomancer', wave: 2, score: 10 });
  assert.deepEqual(store.lastRun.improved, { wave: false, score: false });
  store.recordPages(['fire+water']);
  store.recordChapter({ id: 'prologue', unlocks: { elements: ['fire'], wizards: [] }, lessons: [], retries: 0, choices: {} });
  const again = createProfileStore(st);
  assert.equal(again.status, 'loaded');
  assert.deepEqual(again.profile.pages, ['fire+water']);
  assert.equal(again.profile.chapters.prologue.cleared, true);
  assert.deepEqual(again.bestOf('rime_cryomancer'), { wave: 6, score: 777 });
});

test('the menu and the defeat screen say what the best is', () => {
  assert.equal(describeBest({ wave: 0, score: 0 }, 'Brann Cinderhand'), 'No run with Brann Cinderhand yet.');
  assert.equal(describeBest({ wave: 7, score: 1240 }, 'Brann Cinderhand'), 'Best with Brann Cinderhand: wave 7 · score 1,240');
  assert.equal(describeBest({ wave: 12, score: 1234567 }, 'Vela'), 'Best with Vela: wave 12 · score 1,234,567');
});

test('when every backup slot is taken, the oldest copies stay and the last slot is reused', () => {
  const st = memory();
  for (let i = 1; i <= 8; i++) { st.setItem(STORAGE_KEY, '{bad' + i); loadProfile(st); }
  const kept = backups(st).map((k) => st.getItem(k)).sort();
  assert.equal(kept.length, 6);
  for (const first of ['{bad1', '{bad2', '{bad3', '{bad4', '{bad5']) assert.ok(kept.includes(first), first + ' is still there');
  assert.ok(kept.includes('{bad8'), 'the newest replaced the last slot');
});
