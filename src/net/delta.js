// Snapshot deltas (R-084): the server sends a whole snapshot once, then only what changed since the one
// before (WebSocket delivery is ordered and reliable, so the client always holds that one). Pure JSON in,
// JSON out; no sockets.
//
// A delta mirrors the state's shape:
//   object  -> {key: delta-or-value, ...} plus `$d: [keys removed]`
//   list of entities with ids (players, enemies, shots...) -> {$l: [ids in order], $u: {id: delta}, $n: [new entities]}
//                                                              ($l is left out when the ids and their order are unchanged)
//   a plain array that only grew at the end -> {$a: [the new items]}
//   anything else that changed (numbers, strings, plain arrays) -> the new value
// A key whose value did not change is left out; an object with nothing changed is left out of its parent.

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isIdList = (v) => Array.isArray(v) && v.length > 0 && v.every((e) => isObj(e) && (typeof e.id === 'string' || typeof e.id === 'number'));
const NONE = Symbol('none');

function same(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === b.length && a.every((x, i) => same(x, b[i]));
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && same(a[k], b[k]));
}

// Returns the delta from `a` to `b`, or NONE when they are the same.
function d(a, b) {
  if (same(a, b)) return NONE;
  if (isObj(a) && isObj(b) && !a.$l && !b.$l) {
    const out = {};
    let any = false;
    for (const k of Object.keys(b)) {
      const v = Object.prototype.hasOwnProperty.call(a, k) ? d(a[k], b[k]) : wrap(b[k]);
      if (v !== NONE) { out[k] = v; any = true; }
    }
    const gone = Object.keys(a).filter((k) => !Object.prototype.hasOwnProperty.call(b, k));
    if (gone.length) { out.$d = gone; any = true; }
    return any ? out : NONE;
  }
  const listy = (v) => isIdList(v) || (Array.isArray(v) && v.length === 0);
  if (listy(a) && listy(b)) { // both empty was caught by same()
    const old = new Map(a.map((e) => [e.id, e]));
    const ids = b.map((e) => e.id);
    const out = ids.length === a.length && ids.every((id, i) => a[i].id === id) ? { $l: 1 } : { $l: ids };
    const u = {}, n = [];
    for (const e of b) {
      if (!old.has(e.id)) { n.push(e); continue; }
      const v = d(old.get(e.id), e);
      if (v !== NONE) u[e.id] = v;
    }
    if (Object.keys(u).length) out.$u = u;
    if (n.length) out.$n = n;
    return out;
  }
  if (Array.isArray(a) && Array.isArray(b) && b.length > a.length && a.every((x, i) => same(x, b[i]))) return { $a: b.slice(a.length) };
  return wrap(b);
}

// A plain object value that happens to look like a delta must not be read as one.
const wrap = (v) => (isObj(v) && (v.$l || v.$d || v.$v || v.$a) ? { $v: v } : v);

export function diff(a, b) {
  const v = d(a, b);
  return v === NONE ? {} : v;
}

// Applies a delta to `a`, returning a new state. `a` is not changed; parts the delta does not touch are shared.
export function patch(a, delta) {
  if (!isObj(delta)) return delta;
  if (delta.$v !== undefined) return delta.$v;
  if (delta.$a) return [...(Array.isArray(a) ? a : []), ...delta.$a];
  if (delta.$l) {
    const base = Array.isArray(a) ? a : [];
    const old = new Map(base.map((e) => [e.id, e]));
    const fresh = new Map((delta.$n ?? []).map((e) => [e.id, e]));
    return (delta.$l === 1 ? base.map((e) => e.id) : delta.$l).map((id) => {
      if (fresh.has(id)) return fresh.get(id);
      const prev = old.get(id);
      if (prev === undefined) throw new Error('delta names an entity the base does not have: ' + id);
      return delta.$u && Object.prototype.hasOwnProperty.call(delta.$u, id) ? patch(prev, delta.$u[id]) : prev;
    });
  }
  const out = isObj(a) ? { ...a } : {};
  for (const k of Object.keys(delta)) {
    if (k === '$d') continue;
    out[k] = patch(out[k], delta[k]);
  }
  for (const k of delta.$d ?? []) delete out[k];
  return out;
}
