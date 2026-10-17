// Five casting roles. The same element pair resolves to a different spell for each role, and each role
// casts with its own body mechanics (see STYLES): anticipation → release → follow-through.
// Pure data — no three.js, no DOM, no imports.

export const ROLES = {
  destroyer: { id: 'destroyer', name: 'Destroyer', vi: 'Hủy Diệt', color: 0xff6a2b, style: 'slam',
    spec: 'High damage, explosions and destruction', specVi: 'Sát thương lớn, cháy nổ, phá huỷ' },
  controller: { id: 'controller', name: 'Controller', vi: 'Khống Chế', color: 0x3d9bff, style: 'sweep',
    spec: 'Traps, slowing, immobilisation, battlefield control', specVi: 'Bẫy, làm chậm, trói buộc, kiểm soát chiến trường' },
  guardian: { id: 'guardian', name: 'Guardian', vi: 'Hộ Vệ', color: 0x5cc84a, style: 'plant',
    spec: 'Healing, shielding, cleansing, protection', specVi: 'Hồi máu, khiên chắn, thanh tẩy, bảo hộ' },
  trickster: { id: 'trickster', name: 'Trickster', vi: 'Lừa Bịp', color: 0xbfe8dc, style: 'flick',
    spec: 'Stealth, illusions, evasion, movement, deception', specVi: 'Ẩn thân, ảo ảnh, né tránh, di chuyển, đánh lừa' },
  arcanist: { id: 'arcanist', name: 'Arcanist', vi: 'Bí Thuật', color: 0xd04bff, style: 'thrust',
    spec: 'Spell amplification, mana, spatial distortion', specVi: 'Khuếch đại phép, thao túng mana, bẻ cong không gian' }
};
export const ROLE_ORDER = ['destroyer', 'controller', 'guardian', 'trickster', 'arcanist'];
// The pair each role shows off in the menu preview.
export const SIGNATURE = { destroyer: ['fire', 'earth'], controller: ['water', 'ice'], guardian: ['water', 'light'], trickster: ['wind', 'lightning'], arcanist: ['fire', 'lightning'] };

// How the body throws the spell. windup = anticipation seconds at weight 1; recoil = follow-through seconds.
export const STYLES = {
  flick:  { en: 'Flick', vi: 'Hất cổ tay', windup: 0.07, recoil: 0.26 },
  thrust: { en: 'Thrust', vi: 'Đâm thẳng', windup: 0.16, recoil: 0.36 },
  slam:   { en: 'Slam', vi: 'Nện đất', windup: 0.27, recoil: 0.5 },
  sweep:  { en: 'Sweep', vi: 'Quét ngang', windup: 0.18, recoil: 0.4 },
  plant:  { en: 'Plant', vi: 'Cắm trượng', windup: 0.21, recoil: 0.44 }
};
// How heavy a shape feels in the hands (scales windup, crouch depth, camera kick).
export const SHAPE_WEIGHT = { bolt: 0.35, chain: 0.4, cone: 0.5, beam: 0.7, boulder: 0.85, area: 0.9, wall: 1,
  guard: 0.55, blink: 0.25, dash: 0.3, decoy: 0.45, swap: 0.35 };

export const WIZARD_ROLE = { ember_pyromancer: 'destroyer', rime_cryomancer: 'controller', stone_druid: 'guardian',
  storm_conduit: 'trickster', arcane_archmage: 'arcanist', terra_geomancer: 'destroyer', zephyr_galesinger: 'trickster', void_necromancer: 'controller' };

// The roster's element order; pairs are listed i<j in this order.
const ORDER = ['fire', 'water', 'earth', 'wind', 'lightning', 'ice', 'light', 'dark', 'nature', 'arcane'];
export const PAIRS = [];
for (let i = 0; i < ORDER.length; i++) for (let j = i + 1; j < ORDER.length; j++) PAIRS.push([ORDER[i], ORDER[j]]);

// Mechanics. Damage and statuses still come from the elements' hit payloads (spells.js), scaled by mult.
const ARCH = {
  // destroyer — heavy, explosive
  bomb:    { shape: 'bolt', speed: 16, explode: 2.8, radius: 0.32, mult: 1.9 },
  blast:   { shape: 'cone', range: 6.4, arc: 70, mult: 2.0, knock: 12 },
  lance:   { shape: 'beam', range: 15, width: 0.9, mult: 2.1, cd: 1.2 },
  quake:   { shape: 'area', radius: 3, delay: 0.38, life: 0.01, burst: true, mult: 2.4, cd: 1.6 },
  storm:   { shape: 'area', radius: 3.2, life: 4, tick: 0.35, pull: 6, mult: 0.5, cd: 2.2 },
  meteor:  { shape: 'area', radius: 3.8, delay: 0.75, life: 0.01, burst: true, mult: 2.9, cd: 2.4 },
  rain:    { shape: 'area', radius: 1.9, delay: 0.5, life: 0.01, burst: true, repeat: 4, interval: 0.22, scatter: 2.4, mult: 1.3, cd: 2.2 },
  barrage: { shape: 'bolt', count: 5, spread: 8, speed: 22, radius: 0.2, explode: 1.3, mult: 0.8 },
  hammer:  { shape: 'boulder', speed: 12, explode: 2.6, mult: 2.4, knock: 12 },
  spear:   { shape: 'bolt', speed: 26, pierce: 3, radius: 0.3, life: 1.1, mult: 2.0 },
  rush:    { shape: 'dash', dist: 6.5, width: 1.2, mult: 1.6, cd: 1.4 },
  implode: { shape: 'area', radius: 3.6, delay: 0.9, life: 0.01, burst: true, pull: 14, mult: 2.6, cd: 2.4 },
  // controller — zones, prisons, cages
  zone:    { shape: 'area', radius: 3.4, life: 6, tick: 0.5, slow: 1.2, slowPct: 0.55, mult: 0.22, cd: 2.4 },
  fog:     { shape: 'area', radius: 3.8, life: 6, tick: 0.5, blind: 1.2, slow: 1, slowPct: 0.4, mult: 0.15, cd: 2.6 },
  prison:  { shape: 'area', radius: 2.6, delay: 0.35, life: 0.01, burst: true, root: 3.5, slow: 3, slowPct: 0.6, mult: 0.9, cd: 2.2 },
  vortex:  { shape: 'area', radius: 3.2, life: 4, tick: 0.4, pull: 10, mult: 0.35, cd: 2.4 },
  cage:    { shape: 'wall', ring: 2.1, segments: 11, hp: 90, life: 6, mult: 0.6, cd: 3.2 },
  seal:    { shape: 'area', radius: 3, delay: 0.3, life: 0.01, burst: true, silence: 5, stun: 1.2, mult: 0.7, cd: 2.4 },
  chains:  { shape: 'chain', range: 9, jumps: 4, root: 2.5, mult: 0.8 },
  maze:    { shape: 'area', radius: 3.6, life: 5, tick: 0.5, confuse: 2.2, mult: 0.15, cd: 2.8 },
  mark:    { shape: 'area', radius: 3.4, life: 5, tick: 0.5, curse: 3, weaken: 2, mult: 0.2, cd: 2.4 },
  stasis:  { shape: 'area', radius: 3, delay: 0.3, life: 0.01, burst: true, freeze: 3, mult: 0.5, cd: 2.8 },
  thorns:  { shape: 'wall', segments: 6, hp: 90, life: 7, touch: true, mult: 0.5, cd: 3 },
  shove:   { shape: 'cone', range: 7, arc: 45, knock: 22, slow: 1.5, slowPct: 0.5, mult: 0.4 },
  purify:  { shape: 'area', radius: 3.4, life: 6, tick: 0.5, cleanse: true, slow: 1, slowPct: 0.45, mult: 0.2, cd: 2.6 },
  // guardian — wards, sanctuaries, walls
  mend:    { shape: 'area', self: true, radius: 3, life: 6, tick: 0.5, heal: 5, mult: 0.05, cd: 5 },
  spring:  { shape: 'area', self: true, radius: 3.2, life: 6, tick: 0.5, heal: 6, cleanse: true, mult: 0.05, cd: 5.5 },
  aegis:   { shape: 'guard', ward: 40, armor: 5, cd: 4.5 },
  spikes:  { shape: 'guard', ward: 30, reflect: 6, cd: 4.5 },
  dome:    { shape: 'wall', ring: 2.2, around: 'self', segments: 10, hp: 110, life: 7, cd: 6 },
  bulwark: { shape: 'wall', segments: 6, hp: 180, life: 9, cd: 3.6 },
  deflect: { shape: 'area', self: true, radius: 2.8, life: 5, tick: 0.5, deflectField: true, repel: 6, mult: 0.1, cd: 5 },
  shelter: { shape: 'guard', invuln: 1.4, regen: 4, near: 5, blind: 2.2, cd: 6 },
  rescue:  { shape: 'blink', dist: 6, ward: 20, cd: 2.4 },
  anchor:  { shape: 'guard', stoneskin: 6, cleanse: true, cd: 4.5 },
  cocoon:  { shape: 'guard', invuln: 2.2, heal: 20, rootSelf: true, cd: 8 },
  rebirth: { shape: 'guard', revive: true, heal: 25, cd: 12 },
  totem:   { shape: 'decoy', life: 8, hp: 140, pulse: 1, heal: 4, mult: 0.4, cd: 8 },
  // trickster — dashes, blinks, doubles
  dash:    { shape: 'dash', dist: 6, width: 0.9, mult: 0.9, cd: 1.2 },
  dashdecoy: { shape: 'dash', dist: 6, width: 0.9, mult: 0.7, decoy: { life: 3.5, hp: 50, burst: 2.2 }, cd: 2.4 },
  blink:   { shape: 'blink', dist: 7, burstTo: 1.8, mult: 0.9, cd: 1.6 },
  bomblink: { shape: 'blink', dist: 7, delayedFrom: 2.6, mult: 1.8, cd: 2.6 },
  decoy:   { shape: 'decoy', life: 5, hp: 60, burst: 2.4, hop: 3, mult: 1.2, cd: 3.2 },
  doubles: { shape: 'decoy', count: 3, life: 4, hp: 35, burst: 1.6, hop: 2.5, mult: 0.7, cd: 4 },
  swap:    { shape: 'swap', range: 10, mult: 1.0, cd: 2 },
  vanish:  { shape: 'guard', invuln: 1.0, haste: 3, near: 3.2, confuse: 2.5, cd: 4 },
  // arcanist — rays, wells, rifts, amplification
  ray:     { shape: 'beam', range: 16, width: 0.7, mult: 1.9, cd: 0.9 },
  prism:   { shape: 'beam', count: 3, spread: 14, range: 13, width: 0.45, mult: 1.1, cd: 1.2 },
  drain:   { shape: 'beam', range: 11, width: 1.0, mult: 1.0, energyDrain: 6, weaken: 3, cd: 1.2 },
  nullray: { shape: 'beam', range: 13, width: 0.8, mult: 1.4, silence: 4, cd: 1.4 },
  well:    { shape: 'area', radius: 3.4, life: 4.5, tick: 0.4, pull: 13, mult: 0.3, cd: 2.6 },
  rift:    { shape: 'area', radius: 2.4, delay: 0.5, life: 0.01, burst: true, repeat: 3, interval: 0.3, scatter: 1.8, mult: 1.3, cd: 2.4 },
  pinpoint: { shape: 'area', radius: 2.1, delay: 0.6, life: 0.01, burst: true, mult: 3.2, cd: 2 },
  nexus:   { shape: 'chain', range: 10, jumps: 6, mult: 1.0 },
  shards:  { shape: 'bolt', count: 6, spread: 6, speed: 26, pierce: 2, radius: 0.16, mult: 0.75 },
  gate:    { shape: 'blink', dist: 8, burstFrom: 2.2, mult: 0.6, cd: 1.8 },
  amplify: { shape: 'guard', amp: 6, energy: 30, cd: 7 },
  lattice: { shape: 'guard', ward: 45, amp: 4, cd: 6 },
  replenish: { shape: 'guard', heal: 15, energy: 40, regen: 4, cd: 6 },
  summon:  { shape: 'decoy', life: 7, hp: 90, pulse: 1, mult: 0.9, cd: 7 }
};

// [name, effect, mechanic] in PAIRS order.
const RAW = {
  destroyer: [
    ['Steam Detonation', 'Explosive steam damage', 'bomb'], ['Magma Crush', 'Molten ground smash', 'quake'],
    ['Inferno Cyclone', 'Spinning fire tornado', 'storm'], ['Plasma Lance', 'Piercing plasma blast', 'lance'],
    ['Thermal Rupture', 'Violent temperature shock', 'bomb'], ['Solar Annihilation', 'Radiant explosion', 'meteor'],
    ['Hellfire Burst', 'Dark flame explosion', 'bomb'], ['Wildfire Cataclysm', 'Spreading firestorm', 'storm'],
    ['Mana Supernova', 'Massive magical detonation', 'implode'], ['Tidal Crusher', 'High-pressure mud impact', 'quake'],
    ['Maelstrom Breaker', 'Crushing water vortex', 'storm'], ['Thunder Surge', 'Electrified tidal blast', 'blast'],
    ['Glacial Shatter', 'Exploding ice field', 'quake'], ['Radiant Deluge', 'Holy water bombardment', 'rain'],
    ['Abyssal Flood', 'Dark draining wave', 'blast'], ['Leviathan Bloom', 'Giant water-plant strike', 'quake'],
    ['Dimensional Tsunami', 'Magical wave distortion', 'blast'], ['Sandstorm Ruin', 'Abrasive sand blast', 'blast'],
    ['Tectonic Rupture', 'Electrified ground eruption', 'quake'], ['Glacier Hammer', 'Heavy frozen-earth strike', 'hammer'],
    ['Crystal Judgment', 'Exploding radiant crystals', 'barrage'], ['Gravequake', 'Dark ground eruption', 'quake'],
    ['Worldroot Slam', 'Giant root impact', 'quake'], ['Gravity Collapse', 'Crushing gravity field', 'implode'],
    ['Thunderclap Dash', 'High-speed impact', 'rush'], ['Absolute Blizzard', 'Freezing storm explosion', 'storm'],
    ["Heaven's Spear", 'Piercing light beam', 'lance'], ['Phantom Reaper', 'Invisible cutting gust', 'blast'],
    ['Thorn Hurricane', 'Spinning thorn barrage', 'storm'], ['Rift Breaker', 'Spatial shockwave', 'blast'],
    ['Stormglass Barrage', 'Electrified ice bombardment', 'barrage'], ['Divine Smite', 'Concentrated energy strike', 'meteor'],
    ['Nightfall Bolt', 'Dark lightning burst', 'bomb'], ['Thunderroot Explosion', 'Electrified root eruption', 'quake'],
    ['Phase Annihilator', 'Reality-piercing blast', 'lance'], ['Aurora Spear', 'Radiant ice projectile', 'spear'],
    ['Soulbreaker Frost', 'Freezing curse explosion', 'bomb'], ['Frostfang Bloom', 'Explosive frozen thorns', 'quake'],
    ['Absolute Zero', 'Extreme magical freeze', 'meteor'], ['Eclipse Nova', 'Burst of opposing energies', 'implode'],
    ['Worldtree Cataclysm', 'Giant radiant root strike', 'quake'], ['Celestial Rupture', 'Explosive dimensional beam', 'lance'],
    ['Venom Apocalypse', 'Poisonous growth explosion', 'bomb'], ['Void Implosion', 'Collapsing void blast', 'implode'],
    ['Genesis Devourer', 'Giant magical plant attack', 'quake']
  ],
  controller: [
    ['Scalding Fog', 'Obscures vision and slows', 'fog'], ['Lava Prison', 'Molten containment zone', 'prison'],
    ['Flame Vortex', 'Pulls enemies into a fire whirl', 'vortex'], ['Plasma Cage', 'Traps enemies in energy walls', 'cage'],
    ['Thermal Lock', 'Alternating heat and freezing', 'stasis'], ['Blinding Halo', 'Flash zone that disorients', 'fog'],
    ['Cinder Bind', 'Dark flames restrain targets', 'prison'], ['Burning Briars', 'Creates burning thorn barriers', 'thorns'],
    ['Mana Seal', 'Suppresses spellcasting', 'seal'], ['Mud Prison', 'Traps feet in dense mud', 'prison'],
    ['Cyclone Current', 'Pushes targets along a path', 'shove'], ['Electric Cage', 'Electrified water containment', 'cage'],
    ['Frozen Domain', 'Slows enemies in an ice field', 'zone'], ['Purification Circle', 'Removes harmful effects in an area', 'purify'],
    ['Black Tide', 'Weakens targets in a dark pool', 'mark'], ['Entangling Marsh', 'Roots enemies in wet ground', 'zone'],
    ['Mirror Labyrinth', 'Creates confusing reflections', 'maze'], ['Sand Coffin', 'Buries and restrains a target', 'prison'],
    ['Faultline Cage', 'Creates a charged ground barrier', 'cage'], ['Permafrost Lock', 'Freezes targets inside stone', 'stasis'],
    ['Crystal Sanctuary', 'Creates a protective enclosure', 'cage'], ['Grave Chains', 'Dark chains emerge from the ground', 'chains'],
    ['Thorn Fortress', 'Builds walls of roots and thorns', 'thorns'], ['Gravity Well', 'Pulls enemies toward a center', 'vortex'],
    ['Static Field', 'Slows movement with electrical interference', 'zone'], ['Whiteout', 'Reduces visibility and movement', 'fog'],
    ['Prism Maze', 'Creates misleading beams of light', 'maze'], ['Phantom Veil', 'Conceals an area in dark wind', 'fog'],
    ['Pollen Cyclone', 'Disorients enemies in a swirling cloud', 'maze'], ['Spatial Snare', 'Restricts movement through distorted space', 'zone'],
    ['Stormglass Prison', 'Encases enemies in charged ice', 'stasis'], ['Judgment Field', 'Marks enemies for follow-up attacks', 'mark'],
    ['Nightbolt Seal', 'Interrupts enemy magic', 'seal'], ['Overgrowth Surge', 'Electrified vines immobilize targets', 'chains'],
    ['Phase Lock', 'Temporarily disrupts teleportation', 'seal'], ['Aurora Barrier', 'Slows attackers crossing a shield', 'thorns'],
    ['Soul Frost', 'Weakens and slows enemy actions', 'mark'], ['Frostbloom Garden', 'Creates freezing flower traps', 'prison'],
    ['Stasis Field', 'Temporarily suspends movement', 'stasis'], ['Eclipse Prison', 'Restricts movement in a twilight zone', 'cage'],
    ['Worldtree Bind', 'Radiant roots hold enemies', 'chains'], ['Celestial Seal', 'Blocks an area with a magical barrier', 'seal'],
    ['Venom Garden', 'Conceals poisonous traps', 'mark'], ['Void Rift', 'Creates a dangerous spatial hazard', 'vortex'],
    ['Primal Labyrinth', 'Creates a maze of magical vegetation', 'maze']
  ],
  guardian: [
    ['Warm Mist', 'Restores health gradually', 'mend'], ['Molten Bastion', 'Creates a heat-resistant shield', 'aegis'],
    ['Ember Ward', 'Deflects incoming projectiles', 'deflect'], ['Charged Aegis', 'Damages attackers who strike the shield', 'spikes'],
    ['Thermal Balance', 'Protects allies from temperature effects', 'anchor'], ['Phoenix Renewal', 'Revives or restores a fallen ally', 'rebirth'],
    ['Ashen Refuge', 'Conceals and shields nearby allies', 'shelter'], ['Hearthgrove', 'Creates a healing grove', 'mend'],
    ['Mana Barrier', 'Absorbs magical damage', 'aegis'], ['Earthen Sanctuary', 'Creates a sturdy defensive shelter', 'dome'],
    ['Healing Current', 'Restores allies along a moving path', 'mend'], ['Conductive Shield', 'Protects allies and shocks attackers', 'spikes'],
    ['Glacial Aegis', 'Creates a reinforced ice barrier', 'bulwark'], ['Sacred Spring', 'Heals and cleanses allies', 'spring'],
    ['Umbral Veil', 'Reduces damage and hides allies', 'shelter'], ['Life Bloom', 'Restores health over time', 'mend'],
    ['Mirror Ward', 'Reflects or absorbs incoming spells', 'spikes'], ['Dustguard', 'Creates a moving defensive barrier', 'bulwark'],
    ['Living Bastion', 'Reinforces a wall with charged energy', 'bulwark'], ['Permafrost Shelter', 'Creates a durable protective dome', 'dome'],
    ['Crystal Sanctuary', 'Protects allies inside a radiant crystal dome', 'dome'], ["Gravekeeper's Ward", 'Reduces damage from incoming attacks', 'aegis'],
    ['Verdant Fortress', 'Creates a regenerative root barrier', 'dome'], ['Gravity Anchor', 'Prevents allies from being displaced', 'anchor'],
    ['Flashguard', 'Rapidly moves an ally out of danger', 'rescue'], ['Snowveil', 'Reduces incoming projectile accuracy', 'deflect'],
    ['Radiant Wings', 'Grants temporary flight or gliding', 'rescue'], ['Phantom Shelter', 'Conceals protected allies', 'shelter'],
    ['Sylvan Refuge', 'Creates a sheltered healing zone', 'spring'], ['Rift Rescue', 'Teleports an ally a short distance', 'rescue'],
    ['Stormglass Shield', 'Creates a shield that punishes attackers', 'spikes'], ['Divine Aegis', 'Absorbs damage and cleanses a debuff', 'aegis'],
    ['Nightguard', 'Protects an ally from magical targeting', 'shelter'], ['Living Circuit', 'Shares protective energy between allies', 'aegis'],
    ['Phase Shield', 'Briefly phases an ally through attacks', 'shelter'], ['Aurora Shield', 'Protects and gradually restores allies', 'aegis'],
    ['Stillnight Ward', 'Reduces damage from enemy magic', 'anchor'], ['Frostbloom Remedy', 'Heals and reduces incoming damage', 'mend'],
    ['Stasis Cocoon', 'Places an ally in temporary protective stasis', 'cocoon'], ['Twilight Ward', 'Absorbs incoming damage', 'aegis'],
    ['Worldtree Blessing', 'Heals and strengthens the whole team', 'spring'], ['Celestial Refuge', 'Creates a safe magical zone', 'deflect'],
    ['Nightroot Shelter', 'Conceals and gradually heals allies', 'shelter'], ['Voidguard', 'Absorbs and redirects a portion of magic', 'spikes'],
    ['Primal Guardian', 'Summons a protective plant guardian', 'totem']
  ],
  trickster: [
    ['Mirage Vapor', 'Creates deceptive silhouettes', 'doubles'], ['Magma Burrow', 'Travels underground through a magical tunnel', 'blink'],
    ['Ember Dash', 'Dashes while leaving a fiery decoy', 'dashdecoy'], ['Spark Swap', 'Exchanges position with a marked target', 'swap'],
    ['Shatterstep', 'Leaves an ice decoy that bursts when struck', 'decoy'], ['Flash Mirage', 'Creates a blinding illusion', 'decoy'],
    ['Smoke Doppelganger', 'Creates a shadowy duplicate', 'decoy'], ['Wildform', 'Disguises the caster with shifting natural features', 'vanish'],
    ['Blink Bomb', 'Teleports away and leaves a delayed blast', 'bomblink'], ['Mudslide Escape', 'Slides quickly across the ground', 'dash'],
    ['Mist Glide', 'Moves rapidly through mist', 'dash'], ['Flash Current', 'Surges between nearby wet surfaces', 'blink'],
    ['Mirror Skater', 'Glides over ice and creates reflections', 'dashdecoy'], ['Prism Double', 'Creates a bright decoy', 'decoy'],
    ['Drownstep', 'Vanishes into a dark pool and emerges elsewhere', 'blink'], ['Frogstep', 'Performs agile, springing leaps', 'blink'],
    ['Mirror Gate', 'Creates a short-lived reflective portal', 'blink'], ['Dust Phantom', 'Disappears in a cloud of dust', 'vanish'],
    ['Burrow Flash', 'Dives into the ground and reappears', 'blink'], ['Crystal Slide', 'Slides rapidly along a crystalline path', 'dash'],
    ['Prism Decoy', 'Creates a refracting crystal double', 'decoy'], ['Grave Slip', 'Moves through shadows cast by terrain', 'blink'],
    ['Rootrunner', 'Travels quickly along connected roots', 'dash'], ['Foldstep', 'Short-range spatial teleportation', 'blink'],
    ['Flash Step', 'Lightning-fast dash', 'dash'], ['Snow Phantom', 'Leaves a false trail in drifting snow', 'decoy'],
    ['Afterimage', 'Creates several moving light duplicates', 'doubles'], ['Phantom Gale', 'Moves invisibly through a dark gust', 'vanish'],
    ['Leafstorm Vanish', 'Escapes in a swirl of leaves', 'vanish'], ['Rift Dash', 'Teleports through a short spatial rift', 'dash'],
    ['Shiverblink', 'Blinks away and leaves a freezing decoy', 'decoy'], ['Flash Clone', 'Creates a fast-moving radiant double', 'decoy'],
    ['Nightbolt Shift', 'Teleports between shadows', 'blink'], ['Vine Vault', 'Slingshots between plants or roots', 'blink'],
    ['Phase Shift', 'Briefly phases through obstacles', 'dash'], ['Aurora Mirage', 'Creates colorful visual illusions', 'doubles'],
    ['Frozen Double', 'Creates a decoy that freezes its attacker', 'decoy'], ['Frostleaf Drift', 'Moves silently over frozen terrain', 'dash'],
    ['Stasis Skip', 'Briefly suspends and skips through space', 'blink'], ['Twilight Swap', 'Exchanges positions with a marked target', 'swap'],
    ['Wildlight Dance', 'Rapid evasive movement with decoys', 'dashdecoy'], ['Celestial Blink', 'Teleports along a radiant path', 'blink'],
    ['Venom Shade', 'Creates a poisonous decoy', 'decoy'], ['Voidstep', 'Moves through a temporary void', 'blink'],
    ['Fey Passage', 'Opens a path through enchanted vegetation', 'dash']
  ],
  arcanist: [
    ['Mana Supernova', 'Concentrated magical blast', 'implode'], ['Volcanic Singularity', 'A miniature gravity well surrounded by magma', 'well'],
    ['Aether Inferno', 'Sustained magical fire vortex', 'well'], ['Arc Plasma', 'Highly concentrated energy beam', 'ray'],
    ['Entropy Shift', 'Rapidly changes the thermal state of a target', 'ray'], ['Stellar Convergence', 'Focuses radiant energy into one point', 'pinpoint'],
    ['Netherflame', 'Burns magical energy as well as physical targets', 'drain'], ['Primal Combustion', 'Converts nearby plant energy into a blast', 'rift'],
    ['Spell Singularity', 'Compresses and releases stored spell energy', 'implode'], ['Density Shift', 'Changes the density of a target or area', 'stasis'],
    ['Dimensional Tide', 'Sends a wave through distorted space', 'blast'], ['Storm Nexus', 'Links targets through magical conductivity', 'nexus'],
    ['Temporal Freeze', 'Slows the movement of objects in an area', 'stasis'], ['Astral Spring', 'Restores health and magical energy', 'replenish'],
    ['Abyssal Drain', 'Drains mana from targets', 'drain'], ['Genesis Current', 'Accelerates magical growth and regeneration', 'replenish'],
    ['Mirror Gate', 'Opens a reflective dimensional portal', 'gate'], ['Spatial Sandstorm', 'Distorts distance within a moving field', 'maze'],
    ['Gravity Collapse', 'Pulls targets together before a strike', 'implode'], ['Crystalline Stasis', 'Locks objects in magical crystal', 'stasis'],
    ['Astral Prism', 'Splits energy into multiple beams', 'prism'], ['Nether Anchor', 'Pins a target to a shadowed location', 'prison'],
    ['Worldroot Network', 'Connects locations through magical roots', 'gate'], ['Gravity Well', 'Creates a controllable gravitational field', 'well'],
    ['Phase Acceleration', 'Accelerates movement beyond normal limits', 'amplify'], ['Entropy Storm', 'Rapidly alters the temperature of an area', 'rift'],
    ['Photonic Ray', 'Fires concentrated light energy', 'ray'], ['Dimensional Veil', 'Hides targets from magical detection', 'vanish'],
    ['Aether Pollen', 'Spreads magical effects through the air', 'shards'], ['Rift Dash', 'Creates a short-range spatial passage', 'gate'],
    ['Quantum Shards', 'Unstable crystalline energy projectiles', 'shards'], ['Celestial Judgment', 'Calls down a focused magical strike', 'pinpoint'],
    ['Null Bolt', 'Disrupts magic and suppresses enchantments', 'nullray'], ['Arcane Overgrowth', 'Infuses plants with sustained magical power', 'rift'],
    ['Phase Shock', 'Disrupts space and interrupts casting', 'nullray'], ['Aurora Matrix', 'Creates a protective magical lattice', 'lattice'],
    ['Soul Frost', 'Weakens the connection between target and magic', 'drain'], ['Eternal Bloom', 'Preserves and regenerates living things', 'replenish'],
    ['Stasis Field', 'Suspends movement inside a magical zone', 'stasis'], ['Eventide Rift', 'Opens a spatial anomaly', 'rift'],
    ['Worldtree Ascension', "Amplifies the team's natural and magical power", 'amplify'], ['Celestial Gate', 'Creates a radiant dimensional portal', 'gate'],
    ['Umbral Genesis', 'Creates a living shadow creature', 'summon'], ['Void Rift', 'Opens a dangerous tear in space', 'rift'],
    ['Primal Genesis', 'Summons a powerful magical plant guardian', 'summon']
  ]
};

const norm = (a, b) => [a, b].sort().join('+');
// ROLE_BOOK[role][pairKey] → combo def. Spell id like FIRE_WATER_DESTROYER.
export const ROLE_BOOK = {};
for (const [role, list] of Object.entries(RAW)) {
  const book = (ROLE_BOOK[role] = {});
  list.forEach(([name, desc, arch], i) => {
    const [a, b] = PAIRS[i], A = ARCH[arch];
    const def = { ...A, name, desc, arch, role, sid: `${a}_${b}_${role}`.toUpperCase() };
    if (A.decoy) def.decoy = { ...A.decoy };
    if (arch === 'spear' && (a === 'ice' || b === 'ice')) def.spear = true;
    book[norm(a, b)] = def;
  });
}
export const rolePair = (role, a, b) => ROLE_BOOK[role]?.[norm(a, b)] ?? null;
