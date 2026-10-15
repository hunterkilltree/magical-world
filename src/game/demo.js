// Menu preview: the wizard on the title screen casts their role's signature spell on a loop, through the same
// windup → hold → release events the arena uses, so the pose and effects match the game. Render-only.
import { resolveSpell } from './spells.js';
import { ROLES, STYLES, SHAPE_WEIGHT, SIGNATURE } from './roles.js';

export function createDemo() {
  let wait = 1.2;
  const pending = [];

  function release(g, w, out) {
    const p = g.player, sp = w.sp, d = sp.def, x = p.x, z = p.z, base = { els: sp.els, color: sp.color, key: sp.key, tier: sp.tier };
    p.castT = p.castMax = STYLES[w.style].recoil * (0.7 + 0.5 * w.weight); p.castStyle = w.style; p.castW = w.weight;
    out.push({ type: 'cast', mode: 'aim', shape: d.shape, name: sp.name, sid: sp.sid, role: d.role, arch: d.arch, style: w.style, weight: w.weight,
      x, z, dx: 0, dz: 1, fromQueue: true, isNew: false, distinct: 2, visual: d.visual, ...base });
    const at = (t, e) => pending.push({ t, e });
    if (d.shape === 'beam') out.push({ type: 'beam', x, z: z + 0.5, dx: 0, dz: 1, len: 8, w: d.width ?? 0.7, hits: [], stop: null, visual: d.visual, arch: d.arch, ...base });
    else if (d.shape === 'dash') out.push({ type: 'blink', x0: x - 3, z0: z + 1.5, x1: x, z1: z, arch: d.arch, ...base });
    else if (d.shape === 'guard' || d.self) {
      out.push({ type: 'guard', x, z, arch: d.arch, ward: !!d.ward || !!d.cleanse, heal: !!(d.heal || d.regen), invuln: !!d.invuln, amp: !!d.amp, near: 0, ...base });
      out.push({ type: 'nova', x, z, r: d.radius ?? 2.4, shape: 'area', ...base });
    } else if (d.shape === 'area' && d.burst) at(d.delay ?? 0.2, { type: 'explode', x, z: z + 2.8, r: Math.min(2.6, d.radius ?? 2.6), big: true, ...base });
    else if (d.shape === 'area') out.push({ type: 'nova', x, z: z + 2.8, r: Math.min(2.8, d.radius ?? 2.8), shape: 'area', ...base });
    else at(0.2, { type: 'explode', x, z: z + 2.5, r: 2, big: false, ...base });
  }

  return {
    poke() { wait = Math.min(wait, 0.35); },
    update(g, dt) {
      const out = [], p = g.player;
      if (g.mode !== 'menu') {
        if (p.wind?.demo) { p.wind = null; p.castT = 0; }
        wait = 1.2; pending.length = 0;
        return out;
      }
      p.castT = Math.max(0, p.castT - dt);
      for (let i = pending.length - 1; i >= 0; i--) if ((pending[i].t -= dt) <= 0) { out.push(pending[i].e); pending.splice(i, 1); }
      if (p.wind) {
        if ((p.wind.t -= dt) <= 0) { const w = p.wind; p.wind = null; release(g, w, out); }
        return out;
      }
      if ((wait -= dt) > 0) return out;
      wait = 2.8;
      const sp = resolveSpell(SIGNATURE[p.role], p.role);
      if (!sp) return out;
      const style = ROLES[p.role].style, S = STYLES[style], d = sp.def;
      const weight = Math.min(1.3, (SHAPE_WEIGHT[d.shape] ?? 0.5) * (0.75 + 0.25 * sp.tier));
      const hold = 0.03 + 0.07 * Math.min(1, weight), t = Math.min(0.34, S.windup * (0.55 + 0.6 * weight)) * 1.6 + hold; // a touch slower so it reads
      p.wind = { t, max: t, hold, sp, mode: 'aim', style, weight, demo: true };
      out.push({ type: 'windup', style, weight, t, hold, mode: 'aim', shape: d.shape, x: p.x, z: p.z, dx: 0, dz: 1, els: sp.els, color: sp.color,
        key: sp.key, role: p.role, tier: sp.tier, name: sp.name });
      return out;
    }
  };
}
