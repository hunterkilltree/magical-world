// The campaign's data layer (R-090): validates data/campaign.json and turns it into the chapter objects the sim runs.
// Pure: no sim, no scene. The design is story/CAMPAIGN_PLAN.md; the rules that run a chapter live in sim.js.
import { ELEMENTS } from './spells.js';
import { WIZARD_ROLE } from './roles.js';

export const PHASES = ['briefing', 'waves', 'climax', 'reward', 'camp', 'done', 'failed'];
// The arenas the plan names (court and forest exist; the rest arrive with their chapters) and the objectives it
// names (survive exists; the others arrive with R-093 and the chapters that use them).
export const ARENA_THEMES = ['court', 'forest', 'tundra', 'cinder', 'bog', 'verrglass'];
export const OBJECTIVES = ['survive', 'hold', 'burn', 'escape', 'braziers', 'cross', 'circle'];
export const MAX_WAVES = 20;
export const VERSION = 1;

export class CampaignError extends Error {
  constructor(problems) {
    super(`campaign: ${problems.length} problem${problems.length === 1 ? '' : 's'}: ${problems.join('; ')}`);
    this.name = 'CampaignError';
    this.problems = problems;
  }
}

const ID = /^[a-z][a-z0-9_]*$/;
const KEY = /^[a-z0-9_.]+$/;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v) => typeof v === 'string' && v.trim() !== '';

// A mix the player can queue: two or three known elements, written in sorted order ("fire+water").
function lessonProblem(k) {
  if (typeof k !== 'string') return 'is not a string';
  const parts = k.split('+');
  if (parts.length < 2 || parts.length > 3) return 'must be two or three elements joined by "+"';
  const bad = parts.find((p) => !ELEMENTS[p]);
  if (bad) return `has an unknown element "${bad}"`;
  if (parts.join('+') !== [...parts].sort().join('+')) return `must be written in sorted order ("${[...parts].sort().join('+')}")`;
  return null;
}

// Validates a parsed campaign file and returns { version, chapters, byId }. Throws a CampaignError naming every problem.
export function loadCampaign(data) {
  const problems = [];
  if (!isObj(data)) throw new CampaignError(['the file must be an object with a version and a list of chapters']);
  if (data.version !== VERSION) problems.push(`version must be ${VERSION} (got ${JSON.stringify(data.version)})`);
  if (!Array.isArray(data.chapters) || data.chapters.length === 0) problems.push('chapters must be a non-empty list');
  const chapters = [], seen = new Set();
  (Array.isArray(data.chapters) ? data.chapters : []).forEach((c, i) => {
    const at = `chapters[${i}]`, bad = (what, why) => problems.push(`${at}.${what} ${why}`);
    if (!isObj(c)) { problems.push(`${at} must be an object`); return; }
    if (!(typeof c.id === 'string' && ID.test(c.id))) bad('id', `must be lower-case letters, digits and "_" starting with a letter (got ${JSON.stringify(c.id)})`);
    else if (seen.has(c.id)) bad('id', `"${c.id}" is a duplicate`);
    else seen.add(c.id);
    if (!str(c.title)) bad('title', 'must be a non-empty string');
    if (!ARENA_THEMES.includes(c.arena)) bad('arena', `${JSON.stringify(c.arena)} is not one of ${ARENA_THEMES.join(', ')}`);
    if (!(Number.isInteger(c.waves) && c.waves >= 1 && c.waves <= MAX_WAVES)) bad('waves', `must be a whole number from 1 to ${MAX_WAVES} (got ${JSON.stringify(c.waves)})`);
    const waveStart = c.waveStart ?? 1;
    if (!(Number.isInteger(waveStart) && waveStart >= 1)) bad('waveStart', `must be a whole number of 1 or more (got ${JSON.stringify(c.waveStart)})`);
    const rules = c.rules ?? [];
    if (!Array.isArray(rules) || rules.some((r) => !(typeof r === 'string' && ID.test(r)))) bad('rules', 'must be a list of rule ids');
    if (!isObj(c.objective) || !OBJECTIVES.includes(c.objective.type)) bad('objective.type', `${JSON.stringify(c.objective?.type)} is not one of ${OBJECTIVES.join(', ')}`);
    const unlocks = c.unlocks ?? {}, elements = unlocks.elements ?? [], wizards = unlocks.wizards ?? [];
    if (!Array.isArray(elements) || elements.some((e) => !ELEMENTS[e])) bad('unlocks.elements', 'must be a list of known elements');
    if (!Array.isArray(wizards) || wizards.some((w) => !WIZARD_ROLE[w])) bad('unlocks.wizards', 'must be a list of known wizard ids');
    const lessons = c.lessons ?? [];
    if (!Array.isArray(lessons)) bad('lessons', 'must be a list of mixes');
    else lessons.forEach((k, j) => { const why = lessonProblem(k); if (why) bad(`lessons[${j}]`, `${JSON.stringify(k)} ${why}`); });
    const story = isObj(c.story) ? c.story : {};
    for (const k of ['briefing', 'ending']) if (!(typeof story[k] === 'string' && KEY.test(story[k]))) bad(`story.${k}`, 'must be a story key (lower-case letters, digits, "_" and ".")');
    chapters.push({ id: c.id, title: c.title, arena: c.arena, waves: c.waves, waveStart, rules: [...rules], objective: { ...c.objective },
      unlocks: { elements: [...elements], wizards: [...wizards] }, lessons: [...(Array.isArray(lessons) ? lessons : [])], story: { briefing: story.briefing, ending: story.ending } });
  });
  if (problems.length) throw new CampaignError(problems);
  chapters.forEach((c, i) => { c.index = i; c.next = chapters[i + 1]?.id ?? null; Object.freeze(c); });
  return Object.freeze({ version: VERSION, chapters: Object.freeze(chapters), byId: Object.freeze(Object.fromEntries(chapters.map((c) => [c.id, c]))) });
}
