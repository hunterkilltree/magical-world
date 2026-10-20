// One co-op room (R-081): the lobby, the party, and the authoritative sim. No sockets here: the
// server hands in messages and a `send(conn, msg)` callback, and calls update(nowMs) on a timer,
// so the whole thing is testable with a fake clock. See story/COOP_PLAN.md.
//
// R-084: after the first snapshot each member gets only a delta from the one before (delta.js), unless
// they missed one (a skipped send or a `resync`), and a member whose socket drops is held for
// `reconnectMs`: their wizard stays in the run, standing still, until they come back with their token.
import { randomBytes } from 'node:crypto';
import { createCoopGame, addPlayer, removePlayer, step } from '../src/game/sim.js';
import { snapshotState } from '../src/net/snapshot.js';
import { diff } from '../src/net/delta.js';
import { WIZARD_IDS, MAX_PLAYERS } from '../src/net/protocol.js';
import { WIZARD_ROLE } from '../src/game/roles.js';

const STEP = 1 / 60;
const MAX_PENDING = 24; // one-shot actions waiting for the next tick, per player
const MAX_EVENTS = 300; // per snapshot

export class Room {
  // opts: send(conn, msg) · snapEvery (sim ticks per snapshot, 3 = 20 Hz) · staleMs (a held move expires
  // this long after the last input) · maxCatchUp (seconds of stall the sim will catch up on)
  // reconnectMs (how long a dropped member is held) · deltas (false sends every snapshot whole)
  constructor(code, { send, snapEvery = 3, staleMs = 500, maxCatchUp = 0.25, reconnectMs = 30000, deltas = true } = {}) {
    this.code = code;
    this.send = send ?? (() => {});
    this.reconnectMs = reconnectMs;
    this.deltas = deltas;
    this.away = new Map(); // token -> member whose socket dropped, with `awayAt`
    this.lastState = null; // the last snapshot sent, and its tick: the base of the next delta
    this.lastTick = -1;
    this.snapEvery = snapEvery;
    this.staleMs = staleMs;
    this.maxCatchUp = maxCatchUp;
    this.members = new Map(); // conn -> {conn, id, name, wizard, role, ready, host, input, pending}
    this.phase = 'lobby'; // 'lobby' | 'play'
    this.game = null;
    this.tickCount = 0;
    this.acc = 0;
    this.lastNow = null;
    this.evq = [];
    this.sinceSnap = 0;
  }

  get size() { return this.members.size + this.away.size; }
  get empty() { return this.members.size === 0 && this.away.size === 0; }

  _member(conn) { return this.members.get(conn); }
  _err(code, message) { return { ok: false, code, message }; }

  lobbyMsg() {
    return {
      type: 'lobby', room: this.code, phase: this.phase,
      players: [...this.members.values(), ...this.away.values()].sort((a, b) => a.id.localeCompare(b.id))
        .map((m) => ({ id: m.id, name: m.name, wizard: m.wizard, role: m.role ?? WIZARD_ROLE[m.wizard], ready: m.ready, host: m.host, away: !m.conn }))
    };
  }

  _broadcastLobby() {
    const msg = this.lobbyMsg();
    for (const m of this.members.values()) this.send(m.conn, msg);
  }

  join(conn, { name } = {}) {
    if (this.members.has(conn)) return this._err('already_joined', 'already in this room');
    if (this.size >= MAX_PLAYERS) return this._err('room_full', 'this room has four wizards already');
    const everyone = [...this.members.values(), ...this.away.values()];
    const used = new Set(everyone.map((m) => m.id));
    const id = [1, 2, 3, 4].map((n) => 'p' + n).find((x) => !used.has(x));
    const taken = new Set(everyone.map((m) => m.wizard));
    const wizard = WIZARD_IDS.find((w) => !taken.has(w)) ?? WIZARD_IDS[0];
    const m = { conn, id, name: name ?? 'Wizard', wizard, role: null, ready: false, host: this.members.size === 0,
      token: randomBytes(12).toString('hex'), baseTick: null,
      input: { move: { x: 0, z: 0 }, aim: { x: 0, z: -8 }, seq: 0, at: this.lastNow ?? 0 }, pending: [] };
    this.members.set(conn, m);
    if (this.game) addPlayer(this.game, { id, wizard, role: m.role ?? undefined, name: m.name }); // drop in mid-run
    this.send(conn, { type: 'welcome', you: id, room: this.code, host: m.host, token: m.token });
    this._broadcastLobby();
    return { ok: true, id };
  }

  leave(conn) {
    const m = this.members.get(conn);
    if (!m) return false;
    this.members.delete(conn);
    this._gone(m);
    return true;
  }

  _gone(m) {
    if (this.game) removePlayer(this.game, m.id);
    this._passHost(m);
    this._broadcastLobby();
  }

  _passHost(m) {
    if (!m.host || !this.members.size) return;
    m.host = false;
    [...this.members.values()][0].host = true; // the host passes to the next connected player
  }

  // The socket dropped without a `leave`: hold the wizard for `reconnectMs` (R-084).
  drop(conn) {
    const m = this.members.get(conn);
    if (!m) return false;
    this.members.delete(conn);
    m.conn = null;
    m.awayAt = this.lastNow ?? 0;
    m.pending = [];
    m.input = { ...m.input, move: { x: 0, z: 0 } };
    this.away.set(m.token, m);
    this._passHost(m);
    this._broadcastLobby();
    return true;
  }

  // A dropped member comes back on a new socket with their token: same id, same wizard, mid-run.
  resume(conn, token, name) {
    const m = this.away.get(token);
    if (!m) return this._err('no_seat', 'that seat is gone (more than 30 s away?)');
    this.away.delete(token);
    m.conn = conn;
    m.baseTick = null; // the first snapshot back is whole
    if (name) m.name = name;
    if (!this.members.size) m.host = true;
    this.members.set(conn, m);
    if (this.game && !this.game.players.some((q) => q.id === m.id)) addPlayer(this.game, { id: m.id, wizard: m.wizard, role: m.role ?? undefined, name: m.name }); // a run started while they were away
    this.send(conn, { type: 'welcome', you: m.id, room: this.code, host: m.host, token: m.token, resumed: true });
    this._broadcastLobby();
    return { ok: true, id: m.id };
  }

  // The client lost track of the snapshots: the next one it gets is whole.
  resync(conn) {
    const m = this._member(conn);
    if (m) m.baseTick = null;
  }

  pick(conn, { wizard, role = null }) {
    const m = this._member(conn);
    if (!m) return this._err('not_in_room', 'join a room first');
    if (this.phase !== 'lobby' && this.game?.mode !== 'dead') return this._err('in_game', 'wizards are picked in the lobby');
    m.wizard = wizard;
    m.role = role;
    m.ready = false;
    this._broadcastLobby();
    return { ok: true };
  }

  setReady(conn, ready) {
    const m = this._member(conn);
    if (!m) return this._err('not_in_room', 'join a room first');
    m.ready = !!ready;
    this._broadcastLobby();
    return { ok: true };
  }

  start(conn) {
    const m = this._member(conn);
    if (!m) return this._err('not_in_room', 'join a room first');
    if (!m.host) return this._err('not_host', 'only the host starts the run');
    const ended = this.phase === 'play' && this.game?.mode === 'dead';
    if (this.phase === 'play' && !ended) return this._err('already_started', 'the run is already going');
    if (!ended && ![...this.members.values()].every((x) => x.ready)) return this._err('not_ready', 'everyone must be ready');
    this.game = createCoopGame([...this.members.values()].map((x) => ({ id: x.id, wizard: x.wizard, role: x.role ?? undefined, name: x.name })));
    this.game.mode = 'play';
    this.phase = 'play';
    this.evq = [];
    this.sinceSnap = 0;
    this.acc = 0;
    this.lastState = null;
    for (const x of this.members.values()) { x.pending = []; x.baseTick = null; }
    this._broadcastLobby();
    return { ok: true };
  }

  input(conn, msg) {
    const m = this._member(conn);
    if (!m || this.phase !== 'play') return;
    m.input = { move: msg.move, aim: msg.aim, seq: msg.seq, at: this.lastNow ?? 0 };
    for (const a of msg.actions) if (m.pending.length < MAX_PENDING) m.pending.push(a);
  }

  // Advances the room to `nowMs` (any clock, in milliseconds): fixed 60 Hz sim steps, a snapshot every few.
  update(nowMs) {
    if (this.lastNow === null) { this.lastNow = nowMs; return; }
    const dt = Math.min(this.maxCatchUp, Math.max(0, (nowMs - this.lastNow) / 1000));
    this.lastNow = nowMs;
    for (const [token, m] of this.away) if (nowMs - m.awayAt > this.reconnectMs) { this.away.delete(token); this._gone(m); }
    if (!this.game || this.phase !== 'play' || !this.members.size) return; // a room with nobody connected does not run
    this.acc += dt;
    while (this.acc >= STEP - 1e-9) { this.acc -= STEP; this._tick(); }
  }

  _tick() {
    const players = {};
    for (const m of [...this.members.values(), ...this.away.values()]) {
      const stale = !m.conn || this.lastNow - m.input.at > this.staleMs;
      players[m.id] = { move: stale ? { x: 0, z: 0 } : m.input.move, aim: m.input.aim, actions: m.pending.splice(0) };
    }
    const ev = step(this.game, { players }, STEP);
    for (const e of ev) if (this.evq.length < MAX_EVENTS) this.evq.push(e);
    this.tickCount++;
    if (++this.sinceSnap >= this.snapEvery) { this.sinceSnap = 0; this._snapshot(); }
  }

  _snapshot() {
    const state = JSON.parse(JSON.stringify(snapshotState(this.game))); // exactly what the wire carries, so deltas match
    const events = this.evq;
    this.evq = [];
    const tick = this.tickCount, base = this.lastTick;
    const delta = this.deltas && this.lastState ? diff(this.lastState, state) : null;
    for (const m of this.members.values()) {
      const msg = delta && m.baseTick === base ? { type: 'snap', tick, base, delta, events, ack: m.input.seq, you: m.id }
        : { type: 'snap', tick, state, events, ack: m.input.seq, you: m.id };
      m.baseTick = this.send(m.conn, msg) === false ? null : tick; // a skipped send breaks the chain
    }
    this.lastState = state;
    this.lastTick = tick;
  }
}
