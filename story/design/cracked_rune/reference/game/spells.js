// Data-driven spell book. Data lives in spells-data.js (mirror of the repo's data/spells.json).
// The combat engine (sim.js) only knows SHAPES; everything a spell does is declared in the data.
import DATA from './spells-data.js';
import { ROLE_BOOK } from './roles.js';

export const ELEMENTS = DATA.elements;
export const ORDER = Object.keys(ELEMENTS).sort((a, b) => (+ELEMENTS[a].key || 10) - (+ELEMENTS[b].key || 10));
export const MAX_QUEUE = DATA.max_queue;
export const CANCELS = DATA.cancels;
export const SHAPES = DATA.shapes;
// Role-only shapes (game/roles.js): self wards, blinks, dashes, doubles, position swaps.
Object.assign(SHAPES, {
  guard: { label: 'Ward', cost: 1.2, cd: 4 }, blink: { label: 'Blink', cost: 0.9, cd: 1.6 }, dash: { label: 'Dash', cost: 0.9, cd: 1.2 },
  decoy: { label: 'Double', cost: 1.2, cd: 3.5 }, swap: { label: 'Swap', cost: 1, cd: 2 }
});
export const COMBOS = DATA.combos;
// Combo keys that add a status to the hit payload (the rest are shape options).
const DEF_PAYLOAD = ['stun', 'silence', 'freeze', 'weaken', 'inaccurate', 'confuse', 'slowPct', 'trueDamage', 'burnMult', 'curse'];

const norm = (k) => k.split('+').sort().join('+');
const BOOK = {};
for (const [k, v] of Object.entries(COMBOS)) BOOK[norm(k)] = v;
export const GRIMOIRE = Object.entries(BOOK).map(([key, def]) => ({ key, sid: key, els: key.split('+'), ...def }));
const isPair = (k) => { const p = k.split('+'); return p.length === 2 && p[0] !== p[1]; };
// A role's book: its 45 pair spells replace the shared pairs; singles, doubles and triples stay shared.
export const SHARED = GRIMOIRE.filter((g) => !isPair(g.key));
export function grimoireFor(role) {
  const R = ROLE_BOOK[role];
  if (!R) return GRIMOIRE;
  return [...GRIMOIRE.filter((g) => !isPair(g.key)), ...Object.entries(R).map(([key, def]) => ({ key, els: key.split('+'), ...def }))];
}
const RANK = ['wall', 'area', 'boulder', 'chain', 'beam', 'bolt', 'cone', 'swap', 'dash', 'blink', 'decoy', 'guard'];
// Three distinct elements are a different tier from two: an unnamed triple rides its best pair at x1.5 (was x1.15).
export const TIER3_POWER = 1.5;

function mixColor(counts) {
  let r = 0, g = 0, b = 0, n = 0;
  for (const [el, c] of Object.entries(counts)) {
    const h = ELEMENTS[el].color;
    r += ((h >> 16) & 255) * c; g += ((h >> 8) & 255) * c; b += (h & 255) * c; n += c;
  }
  return (Math.round(r / n) << 16) | (Math.round(g / n) << 8) | Math.round(b / n);
}

export function makeSpell(els, def, power = 1, key = norm(els.join('+')), name = def.name) {
  const counts = {};
  for (const e of els) counts[e] = (counts[e] || 0) + 1;
  const m = (def.mult ?? 1) * power;
  const pl = { parts: {}, knock: def.knock ?? 0, els: Object.keys(counts) };
  for (const [el, n] of Object.entries(counts)) {
    const h = ELEMENTS[el].hit;
    if (h.dmg) pl.parts[el] = h.dmg * n * m;
    if (h.knock) pl.knock += h.knock * n;
    if (h.burn) { pl.burn = h.burn * (1 + 0.3 * (n - 1)); pl.burnDps = h.burnDps * n * power; }
    if (h.wet) pl.wet = h.wet;
    if (h.chill) pl.chill = h.chill * n;
    if (h.shock) pl.shock = h.shock;
    if (h.root) pl.root = h.root * n;
    if (h.gust) pl.gust = h.gust;
    if (h.blind) pl.blind = h.blind * n;
    if (h.curse) pl.curse = h.curse;
    if (h.drain) pl.drain = h.drain;
  }
  if (def.root) pl.root = Math.max(pl.root || 0, def.root);
  if (def.blind) pl.blind = Math.max(pl.blind || 0, def.blind);
  if (def.slow) pl.slow = def.slow;
  for (const k of DEF_PAYLOAD) if (def[k] !== undefined) pl[k] = def[k];
  const shape = SHAPES[def.shape] ?? SHAPES.bolt;
  const tier = Object.keys(counts).length;
  return { key, sid: def.sid ?? key, role: def.role, def, name, els: [...els].sort(), counts, power, payload: pl, tier,
    cost: Math.round(els.length * 8 * shape.cost), cd: def.cd ?? shape.cd, color: mixColor(counts) };
}

// Exact key (repeats count) → three of a kind powers its double ×1.3 → distinct key (+30% per repeat)
// → for three distinct elements with no entry, the highest-ranked pair with the third riding along ×TIER3_POWER.
// With a role, any two distinct elements resolve to that role's spell (a repeat adds +30%); named triples still win.
export function resolveSpell(queue, role) {
  if (!queue || !queue.length) return null;
  const els = [...queue].sort();
  const exact = els.join('+');
  const distinct = [...new Set(els)];
  const dkey = distinct.join('+');
  const R = distinct.length === 2 ? ROLE_BOOK[role]?.[dkey] : null;
  if (R && !(els.length === 3 && BOOK[exact])) return makeSpell(els, R, 1 + 0.3 * (els.length - 2), dkey);
  if (BOOK[exact]) return makeSpell(els, BOOK[exact], 1, exact);
  if (els.length === 3 && distinct.length === 1) {
    const dbl = distinct[0] + '+' + distinct[0];
    if (BOOK[dbl]) return makeSpell(els, BOOK[dbl], 1.3, dbl);
  }
  if (BOOK[dkey]) return makeSpell(els, BOOK[dkey], 1 + 0.3 * (els.length - distinct.length), dkey);
  let best = null;
  for (let i = 0; i < distinct.length; i++) for (let j = i + 1; j < distinct.length; j++) {
    const k = distinct[i] + '+' + distinct[j], d = ROLE_BOOK[role]?.[k] ?? BOOK[k];
    if (d && (!best || RANK.indexOf(d.shape) < RANK.indexOf(best.d.shape))) best = { k, d };
  }
  if (!best) return null;
  const rider = distinct.filter((e) => !best.k.split('+').includes(e)).map((e) => ELEMENTS[e].name);
  return makeSpell(els, best.d, TIER3_POWER, best.k, `${best.d.name} + ${rider.join(', ')}`);
}
