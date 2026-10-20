// The armory (R-112): weapons every wizard can carry beside their spells. Pure data and helpers, no three.js, no DOM.
// A weapon is a second attack that costs no energy and runs on its own cooldown (Q, or the Weapon button on a phone).
// Its hit is a payload like a spell's, so an element on the blade meets bodies the usual way (applyPayload in sim.js):
// a wet foe takes double from a lightning edge, three ice hits freeze, a blunt head shatters the frozen.
// The numbers are our own tuning, not playtested; spells and enemies are untouched.
import { ELEMENTS, makeSpell } from './spells.js';

const STEEL = 0xc9ced8;

// melee: range (m), arc (degrees), anim slash | chop | stab | thrust | spin
// ranged: speed (m/s), count, spread (degrees between shots), pierce, life (s), r (m), lob, anim bow | gun | throw
// dmg: steel damage per hit; els + edmg: the element on the weapon and its own damage; fx scales the element's statuses
// plant: how fast you can move while winding up (1 = free); blunt: shatters frozen foes (x2.2, like earth)
export const WEAPONS = {
  // ---- steel
  sword:          { name: 'Arming Sword', family: 'blade', kind: 'melee', anim: 'slash', model: 'sword', dmg: 9, cd: 0.42, windup: 0.08, range: 2.0, arc: 110, knock: 2,
    desc: 'A quick, even cut in front of you.' },
  greataxe:       { name: 'Greataxe', family: 'axe', kind: 'melee', anim: 'chop', model: 'axe', dmg: 21, cd: 0.95, windup: 0.22, range: 2.3, arc: 80, knock: 5, plant: 0.5, size: 1.25,
    desc: 'A slow overhead chop that knocks foes back.' },
  warhammer:      { name: 'Warhammer', family: 'blunt', kind: 'melee', anim: 'chop', model: 'hammer', dmg: 18, cd: 0.9, windup: 0.2, range: 2.0, arc: 70, knock: 7, blunt: true, plant: 0.5,
    desc: 'Crushes armour; shatters anything frozen.' },
  daggers:        { name: 'Twin Daggers', family: 'blade', kind: 'melee', anim: 'stab', model: 'dagger', size: 1.4, dmg: 5, cd: 0.2, windup: 0.04, range: 1.5, arc: 70, knock: 0.5,
    desc: 'Fast stabs at arm’s length.' },
  spear:          { name: 'Spear', family: 'polearm', kind: 'melee', anim: 'thrust', model: 'spear', dmg: 12, cd: 0.55, windup: 0.1, range: 3.0, arc: 26, knock: 3,
    desc: 'A long, narrow thrust that keeps foes at bay.' },
  scythe:         { name: 'War Scythe', family: 'polearm', kind: 'melee', anim: 'slash', model: 'scythe', dmg: 11, cd: 0.75, windup: 0.16, range: 2.6, arc: 200, knock: 2,
    desc: 'A wide reaping sweep that hits everything around the front.' },
  flail:          { name: 'Morning Star', family: 'blunt', kind: 'melee', anim: 'spin', model: 'flail', dmg: 13, cd: 0.8, windup: 0.12, range: 2.2, arc: 360, knock: 4, blunt: true,
    desc: 'Whirled all the way round you.' },
  crossbow:       { name: 'Crossbow', family: 'bow', kind: 'ranged', anim: 'gun', model: 'crossbow', shot: 'bolt', dmg: 17, cd: 0.85, windup: 0.06, speed: 30, life: 0.9, r: 0.14, pierce: 1, knock: 2,
    desc: 'A heavy bolt that passes through the first foe.' },
  longbow:        { name: 'Longbow', family: 'bow', kind: 'ranged', anim: 'bow', model: 'bow', shot: 'arrow', dmg: 11, cd: 0.5, windup: 0.12, speed: 26, life: 1.0, r: 0.14, knock: 1,
    desc: 'Steady arrows at range.' },
  pistol:         { name: 'Flintlock', family: 'firearm', kind: 'ranged', anim: 'gun', model: 'pistol', size: 1.5, shot: 'ball', dmg: 15, cd: 0.75, windup: 0.05, speed: 38, life: 0.6, r: 0.12, knock: 3,
    desc: 'One loud, fast ball.' },
  blunderbuss:    { name: 'Blunderbuss', family: 'firearm', kind: 'ranged', anim: 'gun', model: 'blunderbuss', size: 1.25, shot: 'pellet', dmg: 4, count: 7, spread: 7, cd: 1.15, windup: 0.08, speed: 30, life: 0.28, r: 0.1, knock: 1.5,
    desc: 'A cone of shot. Brutal up close, useless far off.' },
  throwing_axes:  { name: 'Throwing Axes', family: 'thrown', kind: 'ranged', anim: 'throw', model: 'handaxe', size: 1.4, shot: 'handaxe', dmg: 11, cd: 0.6, windup: 0.1, speed: 17, life: 0.9, r: 0.22, knock: 2,
    desc: 'Spinning axes, thrown overarm.' },
  sling:          { name: 'Sling', family: 'thrown', kind: 'ranged', anim: 'throw', model: 'sling', size: 1.4, shot: 'stone', dmg: 9, cd: 0.55, windup: 0.12, speed: 16, life: 1.4, r: 0.16, lob: true, blunt: true, knock: 3,
    desc: 'A lobbed stone that drops on its mark.' },
  // ---- elemental
  flame_sword:    { name: 'Emberbrand', family: 'blade', kind: 'melee', anim: 'slash', model: 'sword', els: ['fire'], dmg: 7, edmg: 5, cd: 0.45, windup: 0.08, range: 2.0, arc: 110, knock: 2,
    desc: 'A burning blade: every cut sets foes alight.' },
  frost_axe:      { name: 'Rimecleaver', family: 'axe', kind: 'melee', anim: 'chop', model: 'axe', els: ['ice'], dmg: 15, edmg: 5, cd: 0.9, windup: 0.2, range: 2.3, arc: 80, knock: 4, plant: 0.55, size: 1.2,
    desc: 'Each chop chills; three freeze.' },
  thunder_maul:   { name: 'Thundermaul', family: 'blunt', kind: 'melee', anim: 'chop', model: 'hammer', els: ['lightning'], dmg: 12, edmg: 9, cd: 0.95, windup: 0.2, range: 2.0, arc: 70, knock: 6, blunt: true, plant: 0.5, size: 1.15,
    desc: 'Shocks what it hits. Double damage to the wet.' },
  tide_trident:   { name: 'Tidecaller', family: 'polearm', kind: 'melee', anim: 'thrust', model: 'trident', els: ['water'], dmg: 10, cd: 0.6, windup: 0.1, range: 3.0, arc: 30, knock: 2,
    desc: 'Soaks and shoves: set foes up for lightning and ice.' },
  venom_daggers:  { name: 'Thornfang Daggers', family: 'blade', kind: 'melee', anim: 'stab', model: 'dagger', size: 1.4, els: ['nature'], dmg: 4, edmg: 2, fx: 0.5, cd: 0.22, windup: 0.04, range: 1.5, arc: 70, knock: 0.5,
    desc: 'Thorned blades that root foes for a moment.' },
  gale_glaive:    { name: 'Galeglaive', family: 'polearm', kind: 'melee', anim: 'slash', model: 'glaive', els: ['wind'], dmg: 9, edmg: 3, cd: 0.7, windup: 0.12, range: 2.6, arc: 180, knock: 1,
    desc: 'A sweeping gust: throws foes back and fans their fires.' },
  sun_mace:       { name: 'Sunsteel Mace', family: 'blunt', kind: 'melee', anim: 'chop', model: 'mace', els: ['light'], dmg: 13, edmg: 6, cd: 0.75, windup: 0.14, range: 1.9, arc: 80, knock: 4, blunt: true,
    desc: 'Blinds with every blow and burns away curses.' },
  soul_scythe:    { name: 'Soulreaver', family: 'polearm', kind: 'melee', anim: 'slash', model: 'scythe', els: ['dark'], dmg: 9, edmg: 6, cd: 0.8, windup: 0.16, range: 2.6, arc: 200, knock: 2,
    desc: 'Curses what it reaps and drinks a little of its life.' },
  arcane_repeater:{ name: 'Runic Repeater', family: 'bow', kind: 'ranged', anim: 'gun', model: 'repeater', shot: 'rune', els: ['arcane'], dmg: 4, edmg: 3, cd: 0.24, windup: 0.03, speed: 28, life: 0.8, r: 0.16, knock: 0.5,
    desc: 'A hail of small arcane bolts.' },
  storm_bow:      { name: 'Stormstring', family: 'bow', kind: 'ranged', anim: 'bow', model: 'bow', shot: 'arrow', els: ['lightning'], dmg: 8, edmg: 7, cd: 0.6, windup: 0.12, speed: 30, life: 1.0, r: 0.15, pierce: 1, knock: 1,
    desc: 'Charged arrows that pass through one foe.' },
  quake_hammer:   { name: 'Earthsplitter', family: 'blunt', kind: 'melee', anim: 'chop', model: 'hammer', els: ['earth'], dmg: 14, edmg: 10, cd: 1.1, windup: 0.24, range: 2.2, arc: 90, knock: 4, blunt: true, plant: 0.45, size: 1.35,
    desc: 'The heaviest blow in the armory. Shatters the frozen.' }
};

for (const [id, w] of Object.entries(WEAPONS)) {
  w.id = id;
  w.els = w.els ?? [];
  w.color = w.els.length ? ELEMENTS[w.els[0]].color : STEEL;
}

export const WEAPON_ORDER = Object.keys(WEAPONS);
export const FAMILIES = { blade: 'Blades', axe: 'Axes', blunt: 'Hammers & maces', polearm: 'Polearms', bow: 'Bows', firearm: 'Firearms', thrown: 'Thrown' };
export const isWeapon = (id) => typeof id === 'string' && Object.prototype.hasOwnProperty.call(WEAPONS, id);

// What each wizard picks up first; the menu or ?k= changes it, and C switches in a fight.
export const WIZARD_WEAPON = {
  arcane_archmage: 'arcane_repeater', ember_pyromancer: 'flame_sword', rime_cryomancer: 'frost_axe', stone_druid: 'venom_daggers',
  terra_geomancer: 'quake_hammer', zephyr_galesinger: 'gale_glaive', storm_conduit: 'storm_bow', void_necromancer: 'soul_scythe'
};
export const weaponFor = (wizard) => WIZARD_WEAPON[wizard] ?? 'sword';

export function nextWeapon(id, dir = 1) {
  const i = WEAPON_ORDER.indexOf(id), n = WEAPON_ORDER.length;
  return WEAPON_ORDER[(((i < 0 ? 0 : i + dir) % n) + n) % n];
}

const STATUS_KEYS = ['burn', 'burnDps', 'wet', 'chill', 'shock', 'root', 'gust', 'blind', 'curse', 'drain'];
const SCALED = ['burn', 'wet', 'chill', 'shock', 'root', 'blind', 'curse'];
const cache = new Map();

// A weapon's hit, shaped like a spell so shots, snapshots and applyPayload take it as they are. Steel damage is
// the `steel` part (no enemy resists it); an element adds its own part and its statuses.
export function weaponSpell(id) {
  if (!isWeapon(id)) return null;
  if (cache.has(id)) return cache.get(id);
  const W = WEAPONS[id];
  const pl = { parts: { steel: W.dmg }, knock: W.knock ?? 0, els: W.els.length ? [...W.els] : ['steel'] };
  if (W.els.length) {
    const base = makeSpell(W.els, { shape: 'bolt', mult: 1 }).payload, k = W.fx ?? 1;
    for (const key of STATUS_KEYS) if (base[key] !== undefined) pl[key] = SCALED.includes(key) ? base[key] * k : base[key];
    pl.knock += base.knock;
    if (W.edmg) for (const el of W.els) pl.parts[el] = W.edmg / W.els.length;
  }
  if (W.blunt) pl.blunt = true;
  const sp = { key: 'weapon:' + id, sid: 'weapon:' + id, name: W.name, els: pl.els, counts: {}, power: 1, payload: pl, tier: 1,
    cost: 0, cd: W.cd, color: W.color, def: { shape: 'weapon', weapon: id }, weapon: id };
  cache.set(id, sp);
  return sp;
}
