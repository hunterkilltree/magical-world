// The client's snapshot buffer (R-082): shows the world a little behind the server (about 100 ms)
// so there are always two snapshots to blend between. Positions blend; everything else is the
// state of the latest snapshot the view has reached, and that snapshot's events play once, then.
//
// Time: each snapshot is stamped with the server tick (60 per second). The buffer learns the gap
// between the server's clock and this one from the earliest arrivals, so jitter never moves the
// view backwards.
import { applySnapshot } from './snapshot.js';

const TICK_MS = 1000 / 60;
const LISTS = ['players', 'enemies', 'shots', 'decoys'];

const lerp = (a, b, k) => a + (b - a) * k;
const lerpAngle = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

function index(state) {
  const m = new Map();
  for (const list of LISTS) for (const e of state[list]) m.set(list + ':' + e.id, e);
  return m;
}

export function createSnapBuffer({ delayMs = 100, keep = 40 } = {}) {
  const snaps = []; // {tick, time (server ms), state, events, idx}
  let offset = Infinity; // local ms - server ms, the smallest seen
  let applied = null; // the snapshot whose state the game holds
  let playedTick = -1; // events played up to this tick

  return {
    get size() { return snaps.length; },
    get delayMs() { return delayMs; },
    // The newest snapshot (R-084: the base the local wizard's prediction replays from): {tick, state, ack}.
    get latest() { const s = snaps[snaps.length - 1]; return s ? { tick: s.tick, state: s.state, ack: s.ack } : null; },
    reset() { snaps.length = 0; offset = Infinity; applied = null; playedTick = -1; },

    push(snap, nowMs) {
      const time = snap.tick * TICK_MS;
      offset = Math.min(offset, nowMs - time);
      if (snaps.length && snap.tick <= snaps[snaps.length - 1].tick) return; // stale or duplicate
      snaps.push({ tick: snap.tick, time, state: snap.state, events: snap.events ?? [], ack: snap.ack ?? 0, idx: null });
      while (snaps.length > keep) snaps.shift();
    },

    // Brings `game` to the view time for `nowMs`; returns the events to play this frame.
    advance(game, nowMs) {
      if (!snaps.length) return [];
      const rt = nowMs - offset - delayMs; // render time, in server ms
      let i = 0;
      while (i + 1 < snaps.length && snaps[i + 1].time <= rt) i++;
      const a = snaps[i], b = snaps[i + 1] ?? null;
      const out = [];
      for (const s of snaps) {
        if (s.time > rt) break;
        if (s.tick > playedTick) { out.push(...s.events); playedTick = s.tick; }
      }
      if (applied !== a) { applySnapshot(game, a.state); applied = a; }
      if (b && rt > a.time) {
        const k = Math.min(1, (rt - a.time) / (b.time - a.time));
        a.idx ??= index(a.state);
        b.idx ??= index(b.state);
        for (const list of LISTS) for (const e of game[list]) {
          const ea = a.idx.get(list + ':' + e.id), eb = b.idx.get(list + ':' + e.id);
          if (!ea || !eb) continue;
          e.x = lerp(ea.x, eb.x, k);
          e.z = lerp(ea.z, eb.z, k);
          if (ea.y !== undefined && eb.y !== undefined) e.y = lerp(ea.y, eb.y, k);
          if (ea.face !== undefined && eb.face !== undefined) e.face = lerpAngle(ea.face, eb.face, k);
          if (list === 'players') {
            const fx = lerp(ea.fx, eb.fx, k), fz = lerp(ea.fz, eb.fz, k), L = Math.hypot(fx, fz) || 1;
            e.fx = fx / L; e.fz = fz / L;
          }
        }
      } else if (applied === a && a.idx) {
        // held on the newest snapshot: put positions back where it says
        for (const list of LISTS) for (const e of game[list]) {
          const ea = a.idx.get(list + ':' + e.id);
          if (ea) { e.x = ea.x; e.z = ea.z; }
        }
      }
      while (snaps.length > 2 && snaps[1].time <= rt && snaps[0] !== a) snaps.shift(); // older than what we show
      return out;
    }
  };
}
