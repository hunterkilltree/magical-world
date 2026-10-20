// Client prediction of the local wizard (R-084). The rest of the world is drawn ~100 ms behind the server
// (interp.js); your own wizard is drawn where it is going to be: the server's newest position for you,
// with every input it has not acknowledged yet walked again on top (the sim's own `predictWalk`, so the
// speed, slows and collisions match). When a new snapshot arrives the prediction is rebuilt from it, and
// any jump between the old guess and the new one is eased out over a few frames instead of snapping.
// While you are not walking (dodging, dashing, stunned, rooted, down) the server's word is drawn as is.
import { predictWalk } from '../game/sim.js';

const STEP = 1 / 60;
const BODY = ['x', 'z', 'vx', 'vz', 'kvx', 'kvz'];

export const PREDICT = { ease: 12, snapDist: 3, maxPending: 90 };

export function createPredictor() {
  let pending = []; // inputs the server has not acknowledged: {seq, move, dur (seconds held)}
  let pred = null; // the predicted wizard (a copy of the server's, walked on)
  let baseTick = -1;
  let shown = null; // {x, z} drawn last frame
  const err = { x: 0, z: 0 };

  const walkFor = (world, p, move, dur) => {
    for (let t = dur; t > 1e-6; t -= STEP) if (!predictWalk(world, p, move, Math.min(STEP, t))) return false;
    return true;
  };

  return {
    get pending() { return pending.length; },
    get error() { return Math.hypot(err.x, err.z); },
    reset() { pending = []; pred = null; baseTick = -1; shown = null; err.x = err.z = 0; },

    // One frame. `world`: the client game (walls, pillars, barrels to bump into); `me`: the local wizard as the
    // buffer left it (written to); `latest`: the newest snapshot {tick, state, ack}; `seq`/`move`: the last input
    // sent and the stick it carried. Returns where the wizard is drawn.
    frame(world, me, latest, seq, move, dt) {
      const last = pending[pending.length - 1];
      if (seq > 0 && last?.seq === seq) last.dur += dt;
      else if (seq > 0) pending.push({ seq, move: { x: move.x, z: move.z }, dur: dt });
      if (pending.length > PREDICT.maxPending) pending.shift();

      const srv = latest?.state.players.find((q) => q.id === me.id);
      let target;
      if (!srv) { pred = null; target = { x: me.x, z: me.z }; }
      else {
        // walk the old guess on by this frame, then (on a new snapshot) rebuild it and keep the jump as error
        let carried = null;
        if (pred && walkFor(world, pred, pending[pending.length - 1]?.move ?? { x: 0, z: 0 }, dt)) carried = { x: pred.x, z: pred.z };
        if (latest.tick !== baseTick || !carried) {
          baseTick = latest.tick;
          pending = pending.filter((i) => i.seq > latest.ack);
          const p = { ...srv, st: { ...(me.st ?? {}), ...(srv.st ?? {}) } };
          let ok = true;
          for (const i of pending) if (!(ok = walkFor(world, p, i.move, i.dur))) break;
          pred = ok ? p : null;
          if (pred && carried) { err.x += carried.x - pred.x; err.z += carried.z - pred.z; }
        }
        target = pred ? { x: pred.x, z: pred.z } : { x: me.x, z: me.z };
      }
      // switching between prediction and the server's word (or a big correction): ease, or snap if it is far
      if (shown && !pred !== !shown.pred) { err.x = shown.x - target.x; err.z = shown.z - target.z; }
      if (Math.hypot(err.x, err.z) > PREDICT.snapDist) err.x = err.z = 0;
      const k = Math.exp(-PREDICT.ease * dt);
      err.x *= k; err.z *= k;
      const x = target.x + err.x, z = target.z + err.z;
      if (pred) for (const key of BODY.slice(2)) me[key] = pred[key];
      me.x = x; me.z = z;
      if (pred) me.speed = Math.hypot(pred.vx, pred.vz);
      shown = { x, z, pred: !!pred };
      return { x, z, predicted: !!pred };
    }
  };
}
