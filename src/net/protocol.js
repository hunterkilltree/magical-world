// The co-op wire protocol (R-081): JSON messages over a WebSocket. Pure data and validation, no
// sockets, so the server, the browser client and the tests share it. See story/COOP_PLAN.md.
//
// client -> server: join {room?, name} · pick {wizard, role?} · ready {ready} · start · leave
//                   input {seq, move, aim, actions} · ping {t}
// server -> client: welcome {you, room} · lobby {room, phase, players} · snap {tick, state, events, ack, you}
//                   error {code, message} · pong {t}
import { ELEMENTS } from '../game/spells.js';
import { ROLES, WIZARD_ROLE } from '../game/roles.js';
import { ARENA_R } from '../game/sim.js';
import { isWeapon } from '../game/weapons.js';

export const MAX_PLAYERS = 4;
export const ROOM_CODE_RE = /^[A-Z]{4}$/;
export const ROOM_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O: they read as 1 and 0
export const WIZARD_IDS = Object.keys(WIZARD_ROLE);
export const ROLE_IDS = Object.keys(ROLES);
export const MAX_NAME = 16;
export const MAX_ACTIONS = 12; // per input message
export const AIM_LIMIT = ARENA_R + 25;

const ACTIONS = new Set(['clear', 'cast', 'recast', 'nova', 'self', 'dodge', 'attack', 'reattack', 'weapon:next', 'weapon:prev']); // not pause, restart or mute
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isVec = (v) => v && typeof v === 'object' && isNum(v.x) && isNum(v.z);
const fail = (code, message) => ({ ok: false, code, message });
const good = (msg) => ({ ok: true, msg });

export function cleanName(v) {
  const s = typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').replace(/\s+/g, ' ').trim() : '';
  return s.slice(0, MAX_NAME) || 'Wizard';
}

export function isAction(a) {
  return typeof a === 'string' && (ACTIONS.has(a) || (a.startsWith('el:') && Object.prototype.hasOwnProperty.call(ELEMENTS, a.slice(3)))
    || (a.startsWith('weapon:') && isWeapon(a.slice(7))));
}

// Checks one client message. {ok: true, msg} with a cleaned copy, or {ok: false, code, message}.
export function validateClientMessage(m) {
  if (!m || typeof m !== 'object' || Array.isArray(m) || typeof m.type !== 'string') return fail('bad_message', 'not a message');
  switch (m.type) {
    case 'join': {
      const out = { type: 'join', name: cleanName(m.name) };
      if (m.room !== undefined && m.room !== null) {
        const code = typeof m.room === 'string' ? m.room.toUpperCase() : '';
        if (!ROOM_CODE_RE.test(code)) return fail('bad_message', 'a room code is four letters');
        out.room = code;
      }
      return good(out);
    }
    case 'pick': {
      if (!WIZARD_IDS.includes(m.wizard)) return fail('bad_message', 'unknown wizard');
      if (m.role !== undefined && m.role !== null && !ROLE_IDS.includes(m.role)) return fail('bad_message', 'unknown role');
      return good({ type: 'pick', wizard: m.wizard, role: m.role ?? null });
    }
    case 'ready':
      return typeof m.ready === 'boolean' ? good({ type: 'ready', ready: m.ready }) : fail('bad_message', 'ready is true or false');
    case 'start':
    case 'leave':
      return good({ type: m.type });
    case 'ping':
      return good({ type: 'ping', t: isNum(m.t) ? m.t : 0 });
    case 'input': {
      if (!Number.isInteger(m.seq) || !isVec(m.move) || !isVec(m.aim) || !Array.isArray(m.actions)) return fail('bad_message', 'malformed input');
      let { x, z } = m.move;
      const L = Math.hypot(x, z);
      if (L > 1) { x /= L; z /= L; }
      let ax = m.aim.x, az = m.aim.z;
      const A = Math.hypot(ax, az);
      if (A > AIM_LIMIT) { ax *= AIM_LIMIT / A; az *= AIM_LIMIT / A; }
      const actions = m.actions.filter(isAction).slice(0, MAX_ACTIONS);
      return good({ type: 'input', seq: m.seq, move: { x, z }, aim: { x: ax, z: az }, actions });
    }
    default:
      return fail('bad_message', 'unknown message type');
  }
}
