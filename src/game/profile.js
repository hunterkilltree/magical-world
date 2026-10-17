// The player's profile (R-091): what they have earned across runs, kept in localStorage as plain, versioned JSON.
// Pure apart from the storage object you hand in (anything with getItem / setItem). Storage can be missing, full or
// forbidden (a private window): nothing here throws, the game just does not remember. An unreadable save is never
// thrown away: it is copied to a backup slot before anything new is saved over it.
import { ELEMENTS } from './spells.js';
import { WIZARD_ROLE } from './roles.js';

export const PROFILE_VERSION = 1;
export const STORAGE_KEY = 'cow_profile';
const BACKUP_SLOTS = 6;
const ID = /^[a-z][a-z0-9_]*$/;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const count = (n) => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);
const uniq = (list) => [...new Set(list)];

export function emptyProfile() {
  return { version: PROFILE_VERSION, unlocked: { elements: [], wizards: [] }, pages: [], chapters: {}, best: {} };
}

const strings = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x !== '') : []);
const choices = (v) => (isObj(v) ? Object.fromEntries(Object.entries(v).filter(([k, x]) => typeof x === 'string' && ID.test(k))) : {});

// A parsed save that has a good version: every field is repaired to a safe value, unknown ids are dropped.
function sanitize(raw) {
  const p = emptyProfile();
  const u = isObj(raw.unlocked) ? raw.unlocked : {};
  p.unlocked.elements = uniq(strings(u.elements).filter((e) => ELEMENTS[e]));
  p.unlocked.wizards = uniq(strings(u.wizards).filter((w) => WIZARD_ROLE[w]));
  p.pages = uniq(strings(raw.pages));
  if (isObj(raw.chapters)) {
    for (const [id, c] of Object.entries(raw.chapters)) {
      if (!ID.test(id) || !isObj(c)) continue;
      p.chapters[id] = { cleared: c.cleared === true, retries: count(c.retries), choices: choices(c.choices) };
    }
  }
  if (isObj(raw.best)) {
    for (const [w, b] of Object.entries(raw.best)) if (WIZARD_ROLE[w] && isObj(b)) p.best[w] = { wave: count(b.wave), score: count(b.score) };
  }
  return p;
}

// Finds a backup slot for an unreadable save, never overwriting an older one (the last slot is reused when all are full).
function backUp(storage, key, raw) {
  const slot = (i) => key + '.backup' + (i ? '.' + i : '');
  let free = BACKUP_SLOTS - 1;
  for (let i = 0; i < BACKUP_SLOTS; i++) {
    const have = storage.getItem(slot(i));
    if (have === raw) return slot(i); // already kept
    if (have === null) { free = i; break; }
  }
  storage.setItem(slot(free), raw);
  return slot(free);
}

// -> { profile, status }: 'new' (nothing saved), 'loaded', 'recovered' (unreadable, a fresh profile; the old text is kept in
// a backup), 'newer' (saved by a later version of the game; same treatment) or 'unavailable' (no usable storage).
export function loadProfile(storage, key = STORAGE_KEY) {
  if (!storage) return { profile: emptyProfile(), status: 'unavailable' };
  let raw;
  try { raw = storage.getItem(key); } catch (e) { return { profile: emptyProfile(), status: 'unavailable' }; }
  if (raw === null || raw === undefined) return { profile: emptyProfile(), status: 'new' };
  let parsed;
  try { parsed = JSON.parse(raw); } catch (e) { parsed = undefined; }
  const keep = (status) => { let backup; try { backup = backUp(storage, key, raw); } catch (e) { /* nowhere to keep it: still start fresh */ } return { profile: emptyProfile(), status, backup }; };
  if (!isObj(parsed) || !Number.isInteger(parsed.version) || parsed.version < 1) return keep('recovered');
  if (parsed.version > PROFILE_VERSION) return keep('newer');
  return { profile: sanitize(parsed), status: 'loaded' };
}

export function saveProfile(storage, profile, key = STORAGE_KEY) {
  if (!storage) return false;
  try { storage.setItem(key, JSON.stringify(profile)); return true; } catch (e) { return false; }
}

// A run (quick play): best wave and best score are kept separately for each wizard. -> which of them improved.
export function recordRun(profile, { wizard, wave, score }) {
  const w = count(wave), s = count(score);
  if (!WIZARD_ROLE[wizard] || (w === 0 && s === 0)) return { wave: false, score: false };
  const b = (profile.best[wizard] ??= { wave: 0, score: 0 });
  const improved = { wave: w > b.wave, score: s > b.score };
  if (improved.wave) b.wave = w;
  if (improved.score) b.score = s;
  return improved;
}

export function bestOf(profile, wizard) {
  const b = profile.best[wizard];
  return b ? { wave: b.wave, score: b.score } : { wave: 0, score: 0 };
}

// A cleared chapter: its elements and wizards open for good, the fewest retries and the latest choices are kept.
export function recordChapter(profile, { id, unlocks = {}, retries = 0, choices: made = {} }) {
  if (!ID.test(id ?? '')) return;
  profile.unlocked.elements = uniq([...profile.unlocked.elements, ...strings(unlocks.elements).filter((e) => ELEMENTS[e])]);
  profile.unlocked.wizards = uniq([...profile.unlocked.wizards, ...strings(unlocks.wizards).filter((w) => WIZARD_ROLE[w])]);
  const c = profile.chapters[id];
  profile.chapters[id] = { cleared: true, retries: c?.cleared ? Math.min(c.retries, count(retries)) : count(retries), choices: { ...(c?.choices ?? {}), ...choices(made) } };
}

export function recordPages(profile, keys) {
  profile.pages = uniq([...profile.pages, ...strings(keys)]);
}

export function describeBest(best, name) {
  if (!best || (best.wave === 0 && best.score === 0)) return `No run with ${name} yet.`;
  return `Best with ${name}: wave ${best.wave} · score ${best.score.toLocaleString('en-US')}`;
}

// localStorage, or null when the browser forbids it (reaching it can throw).
export function browserStorage() {
  try { return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null; } catch (e) { return null; }
}

// The profile with its storage: every record is saved at once; without storage it still remembers for the session.
export function createProfileStore(storage = browserStorage(), key = STORAGE_KEY) {
  const { profile, status } = loadProfile(storage, key);
  const store = {
    profile, status, saved: false, lastRun: null,
    save() { store.saved = saveProfile(storage, profile, key); return store.saved; },
    bestOf: (wizard) => bestOf(profile, wizard),
    recordRun(run) {
      const improved = recordRun(profile, run);
      store.lastRun = { wizard: run.wizard, wave: count(run.wave), score: count(run.score), improved };
      store.save();
      return improved;
    },
    recordChapter(c) { recordChapter(profile, c); store.save(); },
    recordPages(keys) { recordPages(profile, keys); store.save(); }
  };
  return store;
}
