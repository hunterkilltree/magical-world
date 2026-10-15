// Turning the sim's state into a JSON-safe snapshot (server) and a snapshot back into a game the
// renderer understands (client). R-081, see story/COOP_PLAN.md.
//
// What is left out, because the client already has it: enemy stat tables (looked up by kind), the
// court's pillars, spell definitions (sent as a key and rebuilt; only spells that are not in the
// books, like burning ground, carry their def), and every status field that is zero.
import { makeSpell, lookupDef } from '../game/spells.js';
import { ENEMY_TYPES } from '../game/enemies.js';
import { newStatus } from '../game/sim.js';

const r3 = (n) => (Number.isInteger(n) ? n : Math.round(n * 1000) / 1000);

// Deep copy to plain JSON values: numbers rounded to 3 places, Sets as arrays, a few keys dropped.
function plain(v, skip) {
  if (typeof v === 'number') return r3(v);
  if (v === null || typeof v !== 'object') return v;
  if (v instanceof Set) return [...v].map((x) => plain(x));
  if (Array.isArray(v)) return v.map((x) => plain(x));
  const out = {};
  for (const k of Object.keys(v)) {
    if (skip?.has(k) || v[k] === undefined || typeof v[k] === 'function') continue;
    out[k] = plain(v[k]);
  }
  return out;
}

const compactStatus = (st) => {
  const out = {};
  for (const k of Object.keys(st)) if (k !== 'slowPct' && st[k]) out[k] = typeof st[k] === 'number' ? r3(st[k]) : st[k];
  if (st.slow > 0) out.slowPct = r3(st.slowPct); // 0.4 unless a spell slowed by more
  return out;
};

const SKIP = new Set(['T', 'src', 'sp', 'dashSp', 'wind', 'st', 'who', 'touch']);

export function snapshotState(g) {
  const specs = [];
  const index = new Map();
  const specOf = (sp) => {
    if (!sp) return undefined;
    if (index.has(sp)) return index.get(sp);
    const spec = { key: sp.key, name: sp.name, els: sp.els, power: r3(sp.power) };
    if (sp.role) spec.role = sp.role;
    if (sp.amped) spec.amped = true;
    if (lookupDef(sp.key, sp.role) !== sp.def) spec.def = plain(sp.def); // dynamic spells (burning ground, reflected hex...)
    specs.push(spec);
    index.set(sp, specs.length - 1);
    return specs.length - 1;
  };
  const ent = (o, extra = {}) => ({ ...plain(o, SKIP), st: o.st ? compactStatus(o.st) : undefined, ...(o.sp ? { sp: specOf(o.sp) } : {}), ...extra });
  return {
    mode: g.mode, t: r3(g.t), wave: g.wave, kills: g.kills, score: g.score, waveT: r3(g.waveT), nid: g.nid, remaining: g.remaining,
    coop: g.coop, friendly: g.friendly, hitstop: r3(g.hitstop), spawnLeft: g.spawnQ.length,
    waveInfo: g.waveInfo ? { hpScale: r3(g.waveInfo.hpScale), speedScale: r3(g.waveInfo.speedScale), interval: r3(g.waveInfo.interval) } : null,
    players: g.players.map((p) => ({
      ...plain(p, SKIP), st: compactStatus(p.st),
      wind: p.wind ? { ...plain(p.wind, new Set(['sp'])), sp: specOf(p.wind.sp) } : null,
      dashSp: p.dashSp ? specOf(p.dashSp) : null
    })),
    enemies: g.enemies.map((e) => ent(e)),
    shots: g.shots.map((b) => ent(b, b.src ? { src: b.src.id } : {})),
    areas: g.areas.map((a) => ent(a)),
    walls: g.walls.map((w) => ent(w, w.touch ? { touch: specOf(w.touch) } : {})),
    decoys: g.decoys.map((d) => ent(d)),
    props: { puddles: plain(g.props.puddles), brush: plain(g.props.brush), barrels: plain(g.props.barrels) },
    stats: { ...plain(g.stats, new Set(['found'])), found: [...g.stats.found] },
    specs
  };
}

const rebuild = (spec) => {
  const def = spec.def ?? lookupDef(spec.key, spec.role);
  if (!def) return null;
  const sp = makeSpell(spec.els, def, spec.power, spec.key, spec.name);
  if (spec.amped) sp.amped = true;
  return sp;
};

const withStatus = (o) => ({ ...o, st: { ...newStatus(), ...(o.st ?? {}) } });

// Applies a snapshot to a client's local game (made with createCoopGame([])). `g.meId` names the local wizard;
// `g.player` follows it. Wizards keep their object identity (views hold on to them); everything else is rebuilt.
export function applySnapshot(g, snap) {
  const s = snap;
  const specs = s.specs.map(rebuild);
  const sp = (i) => (i === undefined || i === null ? undefined : specs[i] ?? undefined);
  Object.assign(g, { mode: s.mode, t: s.t, wave: s.wave, kills: s.kills, score: s.score, waveT: s.waveT, nid: s.nid, remaining: s.remaining,
    coop: s.coop, friendly: s.friendly, hitstop: s.hitstop, waveInfo: s.waveInfo });
  g.spawnQ = new Array(s.spawnLeft).fill('?');
  const keep = [];
  for (const sn of s.players) {
    let p = g.players.find((q) => q.id === sn.id);
    if (!p) p = { isPlayer: true };
    Object.assign(p, withStatus(sn), { wind: sn.wind ? { ...sn.wind, sp: sp(sn.wind.sp) } : null, dashSp: sn.dashSp != null ? sp(sn.dashSp) : null, isPlayer: true });
    keep.push(p);
  }
  g.players = keep;
  g.player = g.players.find((q) => q.id === g.meId) ?? g.players[0] ?? null;
  g.enemies = s.enemies.map((e) => ({ ...withStatus(e), T: ENEMY_TYPES[e.kind] }));
  const byId = new Map(g.enemies.map((e) => [e.id, e]));
  g.shots = s.shots.map((b) => ({ ...b, sp: sp(b.sp), src: b.src !== undefined ? byId.get(b.src) ?? null : undefined }));
  g.areas = s.areas.map((a) => ({ ...a, sp: sp(a.sp) }));
  g.walls = s.walls.map((w) => ({ ...w, sp: sp(w.sp), touch: w.touch !== undefined ? sp(w.touch) : null }));
  g.decoys = s.decoys.map((d) => withStatus({ ...d, sp: sp(d.sp) }));
  g.props.puddles = s.props.puddles;
  g.props.brush = s.props.brush;
  g.props.barrels = s.props.barrels;
  g.stats = { ...s.stats, found: new Set(s.stats.found) };
}
