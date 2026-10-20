// Story strings (R-094): chapter cards, the lines wizards say in the quiet after a wave, and the language they come in.
// The text lives in data/story/en.json and vi.json (engine-neutral); this module only looks it up. A key missing in the
// chosen language falls back to English; a key missing everywhere is simply absent (null), never a crash.
export const LANGS = ['en', 'vi'];
export const LANG_KEY = 'cow_lang';

const isCard = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// The first language the browser prefers, if we have it.
export function detectLanguage(languages) {
  const first = Array.isArray(languages) ? String(languages[0] ?? '').toLowerCase().split('-')[0] : '';
  return LANGS.includes(first) ? first : 'en';
}

// A saved choice wins over the browser; a missing, odd or unreadable one is ignored.
export function chooseLanguage({ storage, languages } = {}) {
  let saved = null;
  try { saved = storage ? storage.getItem(LANG_KEY) : null; } catch (e) { saved = null; }
  return LANGS.includes(saved) ? saved : detectLanguage(languages);
}

export function saveLanguage(storage, lang) {
  if (!storage || !LANGS.includes(lang)) return false;
  try { storage.setItem(LANG_KEY, lang); return true; } catch (e) { return false; }
}

// tables: { en: {...}, vi: {...} }
export function createStory(tables, lang = 'en') {
  const story = {
    lang: LANGS.includes(lang) ? lang : 'en',
    setLang(l) { if (!LANGS.includes(l)) return false; story.lang = l; return true; },
    // The raw value in the chosen language, else English, else null.
    text(key) { return tables[story.lang]?.[key] ?? tables.en?.[key] ?? null; },
    has(key) { return story.text(key) !== null; },
    // A card for the UI: { speaker (a name or null), title (or null), paragraphs }.
    card(key) {
      const v = story.text(key);
      if (v === null) return null;
      if (!isCard(v)) return { speaker: null, title: null, paragraphs: Array.isArray(v) ? [...v] : [String(v)] };
      return { speaker: v.speaker ? story.text('speaker.' + v.speaker) ?? v.speaker : null, title: v.title ?? null, paragraphs: [...(v.text ?? [])] };
    },
    // One line for the quiet after a wave: the wizard's own lines and the court's, chosen by n so it is the same every time.
    // -> { speaker: a wizard id or 'bram', text }
    bark(wizard, n) {
      const own = story.text('bark.' + wizard), any = story.text('bark.any');
      const mine = Array.isArray(own) ? own : [], common = Array.isArray(any) ? any : [];
      const pool = [...mine.map((text) => ({ speaker: wizard, text })), ...common.map((text) => ({ speaker: 'bram', text }))];
      return pool.length ? pool[((n % pool.length) + pool.length) % pool.length] : null;
    }
  };
  return story;
}
