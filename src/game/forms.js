// Magicka-style spell forms (R-088): mines, storms, sprays and arcs. Named three-element mixes, shared by every
// wizard like the other named triples. The engine only knows the shapes (sim.js): a mine is an area that lies
// armed, a storm an area that repeats its strike, a spray a cone that keeps going, an arc a chain that forks.
// Not part of data/spells.json (the Godot game does not have these forms); numbers are our own tuning.
export const FORMS = {
  // Mines: cast at the aim point, they wait for an enemy to come near and go off after a short fuse.
  'arcane+earth+ice': { name: 'Frost Mine', form: 'mine', shape: 'area', mine: true, burst: true, radius: 2.8, trig: 1.9, arm: 0.7, fuse: 0.25, life: 25,
    mult: 1.5, freeze: 2, cd: 3, desc: 'A rune that lies in wait; what steps near freezes in its burst.' },
  'arcane+earth+lightning': { name: 'Thunder Mine', form: 'mine', shape: 'area', mine: true, burst: true, radius: 2.6, trig: 1.8, arm: 0.7, fuse: 0.25, life: 25,
    mult: 2.2, stun: 1, cd: 3, desc: 'A buried charge. The first enemy to come close is thrown and stunned.' },
  'arcane+dark+nature': { name: 'Blight Mine', form: 'mine', shape: 'area', mine: true, burst: true, radius: 3, trig: 2, arm: 0.8, fuse: 0.3, life: 25,
    mult: 1.3, curse: 4, weaken: 3, cd: 3, desc: 'A seed of rot. Its cloud curses and weakens whatever it catches.' },
  // Storms: a mark that keeps striking random points around it for a few seconds.
  'lightning+water+wind': { name: 'Thunderstorm', form: 'storm', storm: true, shape: 'area', burst: true, radius: 1.5, delay: 0.6, life: 0.01, repeat: 9,
    interval: 0.4, scatter: 4.5, mult: 1, cd: 5, desc: 'A cloud gathers over the mark and throws lightning for four seconds.' },
  'earth+ice+water': { name: 'Hailstorm', form: 'storm', storm: true, shape: 'area', burst: true, radius: 1.3, delay: 0.6, life: 0.01, repeat: 12,
    interval: 0.3, scatter: 4, mult: 0.7, cd: 5, desc: 'Stones of ice rattle down on the mark and chill what they hit.' },
  'earth+fire+wind': { name: 'Ash Storm', form: 'storm', storm: true, shape: 'area', burst: true, radius: 1.6, delay: 0.6, life: 0.01, repeat: 8,
    interval: 0.45, scatter: 4.2, mult: 0.9, cd: 5, desc: 'Burning cinders drift and fall over the mark.' },
  // Sprays: a jet that follows you and aim for a moment, hurting everything in its cone.
  'fire+fire+wind': { name: 'Flamethrower', form: 'spray', shape: 'cone', channel: 1.4, tick: 0.12, range: 6, arc: 36, mult: 0.32, cd: 2.5,
    desc: 'A long jet of fire that follows your aim.' },
  'ice+ice+wind': { name: 'Frost Breath', form: 'spray', shape: 'cone', channel: 1.4, tick: 0.12, range: 5.5, arc: 50, mult: 0.26, cd: 2.5,
    desc: 'A freezing gale that follows your aim and chills all it touches.' },
  'dark+nature+nature': { name: 'Venom Spray', form: 'spray', shape: 'cone', channel: 1.4, tick: 0.12, range: 5, arc: 44, mult: 0.22, curse: 3, cd: 2.5,
    desc: 'A choking spray that follows your aim and curses what breathes it.' },
  // Arcs: lightning that leaves as several bolts, each jumping on from its own target.
  'lightning+lightning+wind': { name: 'Forked Lightning', form: 'arc', shape: 'chain', forks: 3, jumps: 1, range: 9, mult: 1.1, cd: 1.2,
    desc: 'Three bolts at once, to the three nearest enemies in front of you.' },
  'lightning+lightning+water': { name: 'Conductive Net', form: 'arc', shape: 'chain', forks: 4, jumps: 1, range: 8, mult: 0.8, cd: 1.4,
    desc: 'Four soaking bolts that leave everything they touch wet and shocked.' },
  'arcane+lightning+lightning': { name: 'Arcane Web', form: 'arc', shape: 'chain', forks: 3, jumps: 2, range: 9, mult: 0.9, silence: 2, cd: 1.6,
    desc: 'Arcane lightning that forks and jumps twice, silencing what it strikes.' }
};
