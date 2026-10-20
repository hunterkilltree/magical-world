// The party on screen (R-083): where the camera looks when several wizards share the court, the rows of the party
// strip, and the defeat scoreboard (R-084: from the server's per-player stats). Pure (no three, no DOM) so it is testable in node.
import { TUNING } from './sim.js';

export const FRAME = { lean: 0.15, partyLean: 0.08, maxOff: 6, pad: 2.5, view: 6.5, maxZoom: 1.8 };

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const frac = (a, b) => (b > 0 ? clamp(a / b, 0, 1) : 0);

// The camera's ground target and how far it pulls back (1 = the single-player distance).
// Alone: you, leaned 15% toward the aim, as before. In a party: the middle of everyone (downed too, they need
// raising), a lighter lean, never more than `maxOff` from you so you stay on screen, and a zoom that grows with
// the party's spread around that point.
export function frameParty(players, me, aim, lean = FRAME.lean) {
  const ax = aim ? aim.x - me.x : 0, az = aim ? aim.z - me.z : 0;
  if (!players || players.length <= 1) return { x: me.x + ax * lean, z: me.z + az * lean, zoom: 1 };
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of players) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
  const k = lean * (FRAME.partyLean / FRAME.lean);
  let x = (x0 + x1) / 2 + ax * k, z = (z0 + z1) / 2 + az * k;
  const dx = x - me.x, dz = z - me.z, d = Math.hypot(dx, dz);
  if (d > FRAME.maxOff) { x = me.x + (dx / d) * FRAME.maxOff; z = me.z + (dz / d) * FRAME.maxOff; }
  let spread = 0;
  for (const p of players) spread = Math.max(spread, Math.hypot(p.x - x, p.z - z));
  return { x, z, zoom: clamp((spread + FRAME.pad) / FRAME.view, 1, FRAME.maxZoom) };
}

// One row per wizard for the party strip, in party order. `away`: ids whose connection dropped (R-084).
export function partyRows(players, meId, away = new Set()) {
  return players.map((p) => ({
    id: p.id, name: p.name ?? p.id, wizard: p.wizard, role: p.role, me: p.id === meId, away: away.has(p.id),
    hp: frac(p.hp, p.maxHp), energy: frac(p.energy, p.maxEnergy),
    down: !!p.down, revive: p.down ? frac(p.reviveT, TUNING.reviveT) : 0
  }));
}

// The defeat screen's rows: every wizard of the party with their share of the run, as the server counted it
// (R-084: `p.stats`, kills going to the last wizard who hit), in party order.
export function scoreboard(players, meId) {
  return players.map((p) => ({ id: p.id, name: p.name ?? p.id, wizard: p.wizard, role: p.role, me: p.id === meId,
    kills: 0, dealt: 0, taken: 0, casts: 0, revives: 0, downs: 0, ...p.stats }));
}
