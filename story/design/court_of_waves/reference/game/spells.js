// Data-driven spell book. The combat engine (sim.js) only knows SHAPES;
// everything a spell does is declared here. To add a spell, add a COMBOS entry.

export const ELEMENTS = {
  fire:      { key: '1', name: 'Fire',      color: 0xff6a2b, hit: { dmg: 6, burn: 3, burnDps: 5 }, self: { burn: 2, thaw: 1 } },
  water:     { key: '2', name: 'Water',     color: 0x3d9bff, hit: { dmg: 0, knock: 4, wet: 4 },    self: { cleanse: 1, wet: 5 } },
  ice:       { key: '3', name: 'Ice',       color: 0xa8ecff, hit: { dmg: 5, chill: 1 },             self: { cool: 1, chill: 1 } },
  lightning: { key: '4', name: 'Lightning', color: 0xf4e15c, hit: { dmg: 9, shock: 0.25 },         self: { haste: 3, zap: 6 } },
  earth:     { key: '5', name: 'Earth',     color: 0xb3793f, hit: { dmg: 12, knock: 3 },            self: { stoneskin: 4 } },
  arcane:    { key: '6', name: 'Arcane',    color: 0xd04bff, hit: { dmg: 11 },                      self: { ward: 25 } }
};
export const ORDER = ['fire', 'water', 'ice', 'lightning', 'earth', 'arcane'];
export const MAX_QUEUE = 3;
export const CANCELS = { fire: 'ice', ice: 'fire' };

// Engine primitives. cost multiplies (elements × 8); cd is the cast cooldown.
export const SHAPES = {
  cone:    { label: 'Spray',   cost: 1.0, cd: 0.45 },
  bolt:    { label: 'Bolt',    cost: 1.0, cd: 0.30 },
  chain:   { label: 'Chain',   cost: 1.2, cd: 0.50 },
  boulder: { label: 'Heavy',   cost: 1.4, cd: 0.85 },
  area:    { label: 'Area',    cost: 1.6, cd: 2.2 },
  wall:    { label: 'Barrier', cost: 1.5, cd: 3.0 }
};

// Keys are element names joined by '+', any order. An exact key (e.g. earth+earth)
// beats the distinct-element key (earth). Repeats of one element amplify a spell.
export const COMBOS = {
  fire:      { name: 'Flame Gout', shape: 'cone', range: 4.6, arc: 55, mult: 1.5, desc: 'Short gout of flame. Sets targets burning.' },
  water:     { name: 'Torrent', shape: 'cone', range: 5.6, arc: 40, mult: 1, knock: 10, desc: 'Pressure jet — shoves enemies back and soaks them.' },
  ice:       { name: 'Ice Shards', shape: 'bolt', count: 3, spread: 9, speed: 22, mult: 0.9, radius: 0.18, desc: 'Three fast shards. Three chill stacks freeze.' },
  lightning: { name: 'Arc', shape: 'chain', range: 7.5, jumps: 2, mult: 1.1, desc: 'Instant arc, jumps to two more. Double on wet targets.' },
  earth:     { name: 'Hurled Stone', shape: 'boulder', speed: 11, mult: 2.0, splash: 1.3, knock: 8, desc: 'Heavy rock. Shatters frozen enemies for double.' },
  arcane:    { name: 'Arcane Bolt', shape: 'bolt', speed: 26, mult: 1.4, pierce: 1, radius: 0.22, desc: 'Fast bolt of raw energy that pierces one target.' },
  'earth+earth': { name: 'Stone Rampart', shape: 'wall', segments: 5, hp: 140, life: 10, mat: 'stone', desc: 'Stone wall. Blocks enemies and their shots; yours pass.' },

  'fire+lightning':  { name: 'Thunderflare', shape: 'bolt', speed: 18, mult: 1.3, explode: 2.6, radius: 0.3, desc: 'Explosive bolt. Do not fire it point-blank.' },
  'ice+water':       { name: 'Hoarfrost Field', shape: 'area', radius: 3, life: 3, tick: 0.5, mult: 0.5, hitsAll: true, desc: 'Freezes everything inside it — you included.' },
  'earth+fire':      { name: 'Molten Core', shape: 'boulder', speed: 10, mult: 1.7, splash: 1.8, leaves: { radius: 1.8, life: 3.5, tick: 0.5, mult: 0.25 }, desc: 'Molten boulder that leaves burning ground.' },
  'lightning+water': { name: 'Storm Pool', shape: 'area', radius: 2.8, life: 3.5, tick: 0.45, mult: 0.6, hitsAll: true, desc: 'Electrified pool. Shocks anyone standing in it.' },
  'earth+ice':       { name: 'Rime Bulwark', shape: 'wall', segments: 6, hp: 80, life: 9, mat: 'ice', touchChill: true, desc: 'Ice wall that chills attackers. Fire melts it.' },
  'arcane+fire':     { name: 'Hexfire Comet', shape: 'bolt', speed: 16, mult: 1.2, explode: 2.3, radius: 0.3, desc: 'Arcane fireball with a wide magical blast.' },
  'arcane+earth':    { name: 'Runestone', shape: 'boulder', speed: 10, mult: 1.6, explode: 2.6, desc: 'Rune-charged boulder that detonates on impact.' },
  'arcane+ice':      { name: 'Prism Lances', shape: 'bolt', count: 5, spread: 7, speed: 24, mult: 0.75, pierce: 2, radius: 0.16, desc: 'Five piercing lances in a fan.' },
  'arcane+lightning':{ name: 'Ley Arc', shape: 'chain', range: 9, jumps: 5, mult: 1.0, desc: 'Long chain that jumps through five enemies.' },
  'arcane+water':    { name: 'Undertow', shape: 'area', radius: 3.4, life: 2.6, tick: 0.4, mult: 0.25, pull: 7, desc: 'Vortex that drags enemies to its centre.' },
  'fire+water':      { name: 'Scalding Steam', shape: 'cone', range: 5, arc: 60, mult: 1.6, knock: 4, desc: 'Steam cone — heavy damage, no burn.' },
  'earth+water':     { name: 'Mudslide', shape: 'cone', range: 5.2, arc: 50, mult: 0.8, knock: 14, slow: 2.5, desc: 'Mud wave — huge knockback, mires enemies.' },
  'earth+lightning': { name: 'Lodestone', shape: 'boulder', speed: 11, mult: 1.6, splash: 1.4, chainOnImpact: 3, desc: 'Boulder that discharges into three nearby enemies.' },
  'ice+lightning':   { name: 'Rime Arc', shape: 'chain', range: 8, jumps: 3, mult: 0.9, desc: 'Chain that chills every target it jumps through.' },
  'arcane+fire+lightning': { name: 'Starfall', shape: 'area', radius: 3.2, delay: 1.0, life: 0.01, mult: 2.4, burst: true, hitsAll: true, desc: 'Marks the ground; a star lands a second later.' }
};

const norm = (k) => k.split('+').sort().join('+');
const BOOK = {};
for (const [k, v] of Object.entries(COMBOS)) BOOK[norm(k)] = v;
export const GRIMOIRE = Object.entries(BOOK).map(([key, def]) => ({ key, els: key.split('+'), ...def }));
// Fallback for undefined triples: the strongest defined pair carries the third element as a rider.
const RANK = ['wall', 'area', 'boulder', 'chain', 'bolt', 'cone'];

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
  }
  if (def.slow) pl.slow = def.slow;
  const shape = SHAPES[def.shape] ?? SHAPES.bolt;
  return { key, def, name, els: [...els].sort(), counts, power, payload: pl,
    cost: Math.round(els.length * 8 * shape.cost), cd: def.cd ?? shape.cd, color: mixColor(counts) };
}

export function resolveSpell(queue) {
  if (!queue || !queue.length) return null;
  const els = [...queue].sort();
  const exact = els.join('+');
  const distinct = [...new Set(els)];
  const dkey = distinct.join('+');
  if (BOOK[exact]) return makeSpell(els, BOOK[exact], 1, exact);
  if (BOOK[dkey]) return makeSpell(els, BOOK[dkey], 1 + 0.3 * (els.length - distinct.length), dkey);
  let best = null;
  for (let i = 0; i < distinct.length; i++) for (let j = i + 1; j < distinct.length; j++) {
    const k = distinct[i] + '+' + distinct[j], d = BOOK[k];
    if (d && (!best || RANK.indexOf(d.shape) < RANK.indexOf(best.d.shape))) best = { k, d };
  }
  if (!best) return null;
  const rider = distinct.filter((e) => !best.k.split('+').includes(e)).map((e) => ELEMENTS[e].name);
  return makeSpell(els, best.d, 1.15, best.k, `${best.d.name} + ${rider.join(', ')}`);
}
