// The browser side of co-op (R-082): one WebSocket to the room server. It only sends what the
// player does and hands back what the server says; snapshots go to a buffer (interp.js) and from
// there to the renderer. See story/COOP_PLAN.md.
//
// R-084: snapshots that carry a `delta` are patched onto the one before (onSnap always gets a whole
// `state`); the seat `token` from welcome lets `rejoin()` take the same wizard back after a drop; ping()
// measures the round trip (`rtt`, smoothed); `bytesIn` counts what arrived.
import { patch } from './delta.js';

// The default socket address: the page's own host at /ws (Vite forwards it to `npm run server` in dev).
export function defaultServerUrl(loc = globalThis.location) {
  const q = new URLSearchParams(loc?.search ?? '').get('server');
  if (q) return q;
  return `${loc?.protocol === 'https:' ? 'wss' : 'ws'}://${loc?.host ?? 'localhost:8787'}/ws`;
}

export function createNetClient({ url = defaultServerUrl(), WebSocketImpl = globalThis.WebSocket, onWelcome, onLobby, onSnap, onError, onClose, onPong } = {}) {
  let ws = null;
  let base = null; // {tick, state}: the last whole state, which the next delta patches
  const c = {
    me: null, room: null, lobby: null, seq: 0, connected: false, token: null, rtt: null, bytesIn: 0, resyncs: 0,
    get isHost() { return !!c.lobby?.players.find((p) => p.id === c.me)?.host; },

    // Resolves once the socket is open; rejects if it cannot connect within `timeoutMs`.
    connect(timeoutMs = 5000) {
      return new Promise((resolve, reject) => {
        let settled = false;
        const done = (fn, v) => { if (!settled) { settled = true; clearTimeout(timer); fn(v); } };
        const timer = setTimeout(() => { done(reject, new Error('could not reach the server')); try { ws?.close(); } catch {} }, timeoutMs);
        try { ws = new WebSocketImpl(url); } catch (e) { done(reject, e); return; }
        const sock = ws; // handlers of a socket we have moved on from (rejoin) do nothing
        ws.onopen = () => { if (sock === ws) { c.connected = true; done(resolve); } };
        ws.onerror = () => done(reject, new Error('could not reach the server'));
        ws.onclose = () => {
          if (sock !== ws) return;
          const was = c.connected;
          c.connected = false;
          done(reject, new Error('connection closed'));
          if (was) onClose?.();
        };
        ws.onmessage = (ev) => {
          if (sock !== ws) return; // a socket we have moved on from
          let m;
          const raw = typeof ev.data === 'string' ? ev.data : ev.data.toString();
          c.bytesIn += raw.length;
          try { m = JSON.parse(raw); } catch { return; }
          if (m.type === 'welcome') { c.me = m.you; c.room = m.room; c.token = m.token ?? null; base = null; onWelcome?.(m); }
          else if (m.type === 'lobby') { c.lobby = m; c.room = m.room; onLobby?.(m); }
          else if (m.type === 'snap') {
            if (m.delta) {
              if (!base || base.tick !== m.base) { c.resyncs++; c.send({ type: 'resync' }); return; } // missed one: ask for a whole one
              try { m.state = patch(base.state, m.delta); } catch { c.resyncs++; c.send({ type: 'resync' }); return; }
              delete m.delta;
            }
            base = { tick: m.tick, state: m.state };
            onSnap?.(m);
          }
          else if (m.type === 'error') onError?.(m);
          else if (m.type === 'pong') {
            const r = Date.now() - m.t;
            if (r >= 0 && r < 60000) c.rtt = c.rtt === null ? r : c.rtt + (r - c.rtt) * 0.3;
            onPong?.(m);
          }
        };
      });
    },

    send(m) { if (ws && c.connected && ws.readyState === 1) ws.send(JSON.stringify(m)); },
    join(room, name) { c.send(room ? { type: 'join', room: String(room).toUpperCase(), name } : { type: 'join', name }); },
    // Back to the same seat after a dropped socket: a new connection, then join with the token.
    async rejoin(name, timeoutMs = 3000) {
      if (!c.room || !c.token) throw new Error('no seat to return to');
      try { ws?.close(); } catch {}
      await c.connect(timeoutMs);
      c.send({ type: 'join', room: c.room, name, token: c.token });
    },
    pick(wizard, role) { c.send({ type: 'pick', wizard, role: role ?? null }); },
    ready(ready) { c.send({ type: 'ready', ready: !!ready }); },
    start() { c.send({ type: 'start' }); },
    leave() { c.send({ type: 'leave' }); c.me = null; c.room = null; c.lobby = null; c.token = null; },
    ping() { c.send({ type: 'ping', t: Date.now() }); },
    sendInput({ move, aim, actions }) {
      if (!c.connected) return;
      c.seq++;
      c.send({ type: 'input', seq: c.seq, move, aim, actions });
    },
    close() { c.connected = false; try { ws?.close(); } catch {} }
  };
  return c;
}

// Events that are about one wizard and only matter to that wizard's screen and ears (toasts, chimes,
// the red vignette). The renderer still gets every event; the HUD and audio get forMe(events, me).
const PERSONAL = new Set(['queue', 'queueFull', 'fizzle', 'noEnergy', 'cooldown', 'cancel', 'clear', 'heal']);

export function forMe(events, me) {
  return events.filter((e) => {
    if (e.type === 'hurt') return e.id === me;
    if (e.type === 'tag' && typeof e.id === 'string' && /^p\d$/.test(e.id)) return e.id === me;
    if (PERSONAL.has(e.type) && e.pid) return e.pid === me;
    return true;
  });
}
