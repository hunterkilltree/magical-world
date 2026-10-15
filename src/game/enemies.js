// Enemy stats and wave composition. AI behaviour lives in sim.js, keyed by these ids.
// Resistances for the four new elements follow STORY.md R-051.
export const ENEMY_TYPES = {
  thrall: {
    name: 'Grave Thrall', hp: 34, speed: 3.6, r: 0.4, mass: 1, turn: 9, score: 10,
    resist: { fire: 1.4, light: 1.3, dark: 0.7 },
    atk: { range: 1.5, windup: 0.5, dur: 0.2, recover: 0.75, dmg: 10, lunge: 7 }
  },
  bulwark: {
    name: 'Iron Bulwark', hp: 150, speed: 1.8, r: 0.62, mass: 4, turn: 2.2, score: 40, shield: 65,
    resist: { earth: 0.5, lightning: 1.5, arcane: 0.8, wind: 0.4, nature: 1.2 },
    atk: { range: 2.3, windup: 0.95, recover: 1.1, dmg: 22, radius: 2.2, reach: 1.1, knock: 9 }
  },
  hexcaller: {
    name: 'Hexcaller', hp: 46, speed: 2.7, r: 0.42, mass: 0.8, turn: 6, score: 25, keep: [6.5, 9.5],
    resist: { arcane: 0.4, earth: 1.3, light: 1.5, dark: 0.5 },
    atk: { range: 11, windup: 0.85, recover: 0.5, dmg: 12, speed: 8.5, cd: [2.4, 3.4] }
  }
};

// How a wave grows with the party (co-op, R-080): more enemies and tougher ones per extra wizard.
export const PARTY_SCALE = { count: 0.5, hp: 0.4 };

// `party` is the number of wizards; `rng` is the sim's random number source.
export function waveRoster(n, party = 1, rng = Math.random) {
  const list = [];
  const more = 1 + PARTY_SCALE.count * (party - 1);
  const add = (k, c) => { for (let i = 0; i < Math.round(c * more); i++) list.push(k); };
  add('thrall', 3 + Math.floor(n * 1.5));
  if (n >= 2) add('hexcaller', 1 + Math.floor((n - 2) * 0.7));
  if (n >= 3) add('bulwark', 1 + Math.floor((n - 3) * 0.5));
  for (let i = list.length - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0;
    [list[i], list[j]] = [list[j], list[i]];
  }
  return {
    list,
    hpScale: (1 + 0.12 * (n - 1)) * (1 + PARTY_SCALE.hp * (party - 1)),
    speedScale: 1 + Math.min(0.25, 0.03 * (n - 1)),
    interval: Math.max(0.28, 0.75 - n * 0.05)
  };
}
