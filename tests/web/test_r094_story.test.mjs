import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LANGS, createStory, detectLanguage, chooseLanguage, saveLanguage, LANG_KEY } from '../../src/game/story.js';
import { loadCampaign } from '../../src/game/campaign.js';
import { WIZARD_ROLE } from '../../src/game/roles.js';

const read = (p) => JSON.parse(readFileSync(new URL('../../data/' + p, import.meta.url), 'utf8'));
const en = read('story/en.json'), vi = read('story/vi.json');
const campaign = loadCampaign(read('campaign.json'));
const keys = (t) => Object.keys(t).filter((k) => !k.startsWith('_'));
const shape = (v) => (typeof v === 'string' ? 'string' : Array.isArray(v) ? 'list' : 'card');
const memory = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); } }; };

test('English and Vietnamese carry exactly the same keys, with the same kind of value', () => {
  assert.deepEqual(LANGS, ['en', 'vi']);
  assert.deepEqual(keys(vi).sort(), keys(en).sort());
  for (const k of keys(en)) {
    assert.match(k, /^[a-z0-9_.]+$/, k);
    assert.equal(shape(vi[k]), shape(en[k]), `${k}: same shape in both languages`);
  }
});

test('every key the campaign points at exists in both languages, as a proper card', () => {
  for (const ch of campaign.chapters) {
    for (const k of [ch.story.briefing, ch.story.ending]) {
      for (const [lang, t] of [['en', en], ['vi', vi]]) {
        const c = t[k];
        assert.ok(c && typeof c === 'object' && !Array.isArray(c), `${lang}:${k} is a card`);
        assert.ok(typeof c.title === 'string' && c.title.trim(), `${lang}:${k} has a title`);
        assert.ok(Array.isArray(c.text) && c.text.length >= 1 && c.text.length <= 6, `${lang}:${k} has one to six paragraphs`);
        for (const p of c.text) assert.ok(typeof p === 'string' && p.trim() && p.length <= 400, `${lang}:${k} paragraphs are short`);
        assert.ok(c.speaker && typeof t['speaker.' + c.speaker] === 'string', `${lang}:${k} speaker is named`);
      }
    }
    for (const t of [en, vi]) assert.equal(typeof t[ch.id + '.title'], 'string', ch.id + ' has a title');
  }
});

test('every wizard has lines of their own, and the court has some too, in both languages', () => {
  for (const t of [en, vi]) {
    for (const w of Object.keys(WIZARD_ROLE)) {
      const lines = t['bark.' + w];
      assert.ok(Array.isArray(lines) && lines.length >= 3, `bark.${w} has three lines or more`);
      for (const l of lines) assert.ok(typeof l === 'string' && l.trim() && l.length <= 160, `bark.${w}: one short line`);
    }
    assert.ok(Array.isArray(t['bark.any']) && t['bark.any'].length >= 3);
    assert.equal(typeof t['speaker.bram'], 'string');
  }
});

test('Vietnamese is written, not copied from English', () => {
  const same = [];
  const walk = (a, b, k) => {
    if (typeof a === 'string') { if (a === b && a.length > 20) same.push(k); }
    else if (Array.isArray(a)) a.forEach((x, i) => walk(x, b[i], k + '[' + i + ']'));
    else for (const f of Object.keys(a)) walk(a[f], b[f], k + '.' + f);
  };
  for (const k of keys(en)) walk(en[k], vi[k], k);
  assert.deepEqual(same, []);
  assert.match(vi['prologue.briefing'].title, /[À-ỹ]/, 'it has Vietnamese letters');
});

test('a missing translation falls back to English; a key nobody has is just missing', () => {
  const s = createStory({ en: { a: 'English a', b: { title: 'T', text: ['x'] } }, vi: { a: 'Tiếng Việt a' } }, 'vi');
  assert.equal(s.text('a'), 'Tiếng Việt a');
  assert.deepEqual(s.card('b'), { speaker: null, title: 'T', paragraphs: ['x'] }, 'b is only in English');
  assert.equal(s.has('b'), true);
  assert.equal(s.has('nope'), false);
  assert.equal(s.text('nope'), null);
  assert.equal(s.card('nope'), null);
  s.setLang('en');
  assert.equal(s.text('a'), 'English a');
  assert.equal(s.setLang('fr'), false, 'an unknown language is refused');
  assert.equal(s.lang, 'en');
});

test('a card is normalised: its speaker is named, a plain string is one paragraph', () => {
  const s = createStory({ en: { 'speaker.bram': 'Elder Bram', c: { speaker: 'bram', title: 'T', text: ['one', 'two'] }, plain: 'Just this.' } }, 'en');
  assert.deepEqual(s.card('c'), { speaker: 'Elder Bram', title: 'T', paragraphs: ['one', 'two'] });
  assert.deepEqual(s.card('plain'), { speaker: null, title: null, paragraphs: ['Just this.'] });
  const real = createStory({ en, vi }, 'vi');
  assert.equal(real.card('prologue.briefing').speaker, vi['speaker.bram']);
  real.setLang('en');
  assert.equal(real.card('prologue.briefing').title, en['prologue.briefing'].title);
});

test('barks: one line, chosen the same way every time, from the wizard and from the court', () => {
  const s = createStory({ en, vi }, 'en');
  const w = 'rime_cryomancer';
  const a = s.bark(w, 5), b = s.bark(w, 5);
  assert.deepEqual(a, b, 'the same wave gives the same line');
  const seen = new Set(), speakers = new Set();
  for (let n = 0; n < en['bark.' + w].length + en['bark.any'].length; n++) { const r = s.bark(w, n); seen.add(r.text); speakers.add(r.speaker); }
  assert.equal(seen.size, en['bark.' + w].length + en['bark.any'].length, 'every line comes round');
  assert.deepEqual([...speakers].sort(), ['bram', w].sort(), 'the wizard speaks their own, Bram the rest');
  assert.deepEqual(s.bark('merlin', 0).speaker, 'bram', 'a wizard with no lines of their own: Bram');
  s.setLang('vi');
  assert.ok(vi['bark.' + w].includes(s.bark(w, 0).text) || vi['bark.any'].includes(s.bark(w, 0).text));
});

test('the language follows the browser, and the player can choose', () => {
  assert.equal(detectLanguage(['vi-VN', 'en']), 'vi');
  assert.equal(detectLanguage(['vi']), 'vi');
  assert.equal(detectLanguage(['en-US', 'vi']), 'en', 'the first language the browser prefers');
  assert.equal(detectLanguage(['fr-FR']), 'en');
  assert.equal(detectLanguage([]), 'en');
  assert.equal(detectLanguage(undefined), 'en');
  assert.equal(chooseLanguage({ storage: memory({ [LANG_KEY]: 'en' }), languages: ['vi-VN'] }), 'en', 'a saved choice wins');
  assert.equal(chooseLanguage({ storage: memory({ [LANG_KEY]: 'klingon' }), languages: ['vi-VN'] }), 'vi', 'a bad saved choice is ignored');
  assert.equal(chooseLanguage({ storage: null, languages: ['vi'] }), 'vi');
  const st = memory();
  assert.equal(saveLanguage(st, 'vi'), true);
  assert.equal(chooseLanguage({ storage: st, languages: ['en'] }), 'vi');
  assert.equal(saveLanguage(st, 'xx'), false);
  const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); } };
  assert.equal(chooseLanguage({ storage: throwing, languages: ['vi'] }), 'vi');
  assert.equal(saveLanguage(throwing, 'en'), false);
  assert.equal(saveLanguage(null, 'en'), false);
});

test('story text is not hidden in the code: the HUD roles keep their Vietnamese subtitles', async () => {
  const { ROLES } = await import('../../src/game/roles.js');
  for (const r of Object.values(ROLES)) assert.ok(r.vi && r.specVi, r.name + ' still has its Vietnamese subtitle');
});
