import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDeflateRaw, constants } from 'node:zlib';
import WebSocket from 'ws';
import { diff, patch } from '../../src/net/delta.js';
import { snapshotState, quantise } from '../../src/net/snapshot.js';
import { createSnapBuffer } from '../../src/net/interp.js';
import { createPredictor } from '../../src/net/predict.js';
import { createNetClient } from '../../src/net/client.js';
import { validateClientMessage } from '../../src/net/protocol.js';
import { Room } from '../../server/room.js';
import { createServer } from '../../server/index.js';
import { createCoopGame, step, seedRandom, unseedRandom } from '../../src/game/sim.js';
import { scriptedInput } from './support/scenario.mjs';

const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const wire = (o) => JSON.parse(JSON.stringify(o));
const until = async (cond, ms = 4000, what = 'condition') => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('timed out waiting for ' + what);
    await new Promise((r) => setTimeout(r, 10));
  }
};

// A busy four-wizard run: everyone walks and casts on a schedule (scenario.mjs), waves come.
function busyRun(seconds, each) {
  seedRandom(5);
  const g = createCoopGame([{ wizard: 'ember_pyromancer' }, { wizard: 'stone_druid' }, { wizard: 'storm_conduit' }, { wizard: 'rime_cryomancer' }]);
  g.mode = 'play';
  for (let i = 1; i <= seconds * 60; i++) {
    const players = {};
    g.players.forEach((p, k) => { players[p.id] = scriptedInput(i + k * 37); });
    const ev = step(g, { players }, 1 / 60);
    each?.(g, i, ev);
  }
  unseedRandom();
  return g;
}

// A room on a fake clock whose sends are recorded (or refused).
function fakeRoom(opts = {}) {
  const sent = [];
  let refuse = new Set();
  const room = new Room('ROOM', { ...opts, send: (conn, m) => { if (refuse.has(conn)) return false; sent.push({ conn, m: wire(m) }); return true; } });
  return { room, sent, refuse: (c, on = true) => { if (on) refuse.add(c); else refuse.delete(c); }, of: (c, t) => sent.filter((x) => x.conn === c && x.m.type === t).map((x) => x.m) };
}

// ---------------------------------------------------------------- deltas
test('a delta rebuilds the next snapshot exactly, without touching the one it patches', () => {
  let prev = null, checked = 0;
  busyRun(20, (g, i) => {
    if (i % 3) return;
    const st = wire(snapshotState(g));
    if (prev) {
      const frozen = JSON.stringify(prev);
      assert.deepEqual(patch(prev, diff(prev, st)), st, 'tick ' + i);
      assert.equal(JSON.stringify(prev), frozen, 'the base is not changed');
      checked++;
    }
    prev = st;
  });
  assert.ok(checked > 350);
});

test('delta shapes: unchanged parts are left out, id lists keep their order cheaply, arrays that grew send the tail', () => {
  const a = { n: 1, s: 'x', o: { k: 1 }, list: [{ id: 'a', x: 1 }, { id: 'b', x: 2 }], found: ['f1'], gone: 3 };
  const b = { n: 1, s: 'y', o: { k: 1 }, list: [{ id: 'a', x: 1 }, { id: 'b', x: 5 }], found: ['f1', 'f2'] };
  const d = diff(a, b);
  assert.deepEqual(d, { s: 'y', list: { $l: 1, $u: { b: { x: 5 } } }, found: { $a: ['f2'] }, $d: ['gone'] });
  assert.deepEqual(patch(a, d), b);
  assert.deepEqual(diff(b, b), {}, 'nothing changed, nothing sent');
  const c = { ...b, list: [{ id: 'c', x: 0 }, { id: 'a', x: 1 }] };
  assert.deepEqual(diff(b, c).list, { $l: ['c', 'a'], $n: [{ id: 'c', x: 0 }] }, 'new, gone and reordered entities');
  assert.deepEqual(patch(b, diff(b, c)), c);
  const tricky = { v: { $l: 1 } }; // a value that looks like a delta is wrapped
  assert.deepEqual(patch({ v: 0 }, diff({ v: 0 }, tricky)), tricky);
  assert.throws(() => patch({ list: [] }, { list: { $l: ['zz'] } }), /does not have/);
});

test('numbers are quantised by kind, and spells keep their spec id from one snapshot to the next', () => {
  assert.equal(quantise(1.23456, 'x'), 1.23);
  assert.equal(quantise(3.14159, 'vx'), 3.1);
  assert.equal(quantise(0.4321, 'life'), 0.45);
  assert.equal(quantise(0.4321, 'cast', 'cd'), 0.45, 'cooldown bags are timers');
  assert.equal(quantise(57.6, 'energy'), 58);
  assert.equal(quantise(7, 'x'), 7);
  let ids = null, same = 0;
  busyRun(8, (g, i) => {
    if (i % 3) return;
    const st = wire(snapshotState(g));
    const now = new Map(st.specs.map((s) => [s.key + s.name, s.id]));
    if (ids) for (const [k, id] of now) if (ids.has(k)) { assert.ok(st.specs.some((s) => s.id === id)); same++; }
    for (const list of ['shots', 'areas', 'walls', 'decoys']) for (const e of st[list]) if (e.sp !== undefined) assert.ok(st.specs.some((s) => s.id === e.sp), 'refs name a spec id');
    ids = now;
  });
  assert.ok(same > 0);
});

test('a busy four-wizard run costs under 8 KB/s per client on the wire', async () => {
  const { room, sent } = fakeRoom();
  for (const c of ['c1', 'c2', 'c3', 'c4']) { room.join(c, { name: c }); room.setReady(c, true); }
  room.start('c1');
  seedRandom(5);
  const z = createDeflateRaw(); // what permessage-deflate does: one stream per connection, flushed per message
  let zb = 0;
  z.on('data', (b) => { zb += b.length; });
  const SECS = 40;
  let raw = 0, whole = 0, deltas = 0;
  for (let i = 1; i <= SECS * 60; i++) {
    for (const [k, c] of ['c1', 'c2', 'c3', 'c4'].entries()) {
      const inp = scriptedInput(i + k * 37);
      room.input(c, { seq: i, move: inp.move, aim: inp.aim, actions: inp.actions });
    }
    room.update(i * 1000 / 60);
    while (sent.length) {
      const { conn, m } = sent.shift();
      if (conn !== 'c2' || m.type !== 'snap') continue;
      const txt = JSON.stringify(m);
      raw += txt.length;
      if (m.delta) deltas++; else whole++;
      z.write(txt);
      await new Promise((r) => z.flush(constants.Z_SYNC_FLUSH, r));
    }
  }
  unseedRandom();
  assert.ok(room.game.enemies.length + room.game.kills > 5, 'there was a fight');
  assert.equal(whole, 1, 'one whole snapshot, then deltas');
  assert.ok(deltas > 700);
  const kbs = zb / SECS / 1024;
  console.log(`  wire: ${kbs.toFixed(1)} KB/s per client (raw JSON ${(raw / SECS / 1024).toFixed(1)} KB/s)`);
  assert.ok(kbs < 8, `${kbs.toFixed(1)} KB/s`);
});

test('the room sends each member a delta only when they hold its base: a skipped send or a resync gets a whole one', () => {
  const { room, of, refuse } = fakeRoom();
  room.join('c1', {}); room.join('c2', {});
  room.setReady('c1', true); room.setReady('c2', true); room.start('c1');
  room.game.waveT = 1e9;
  const run = (ms) => { for (let t = 0; t < ms; t += 1000 / 60) room.update((room.lastNow ?? 0) + 1000 / 60); };
  room.update(0);
  run(200);
  const s1 = of('c1', 'snap');
  assert.ok(s1[0].state && !s1[0].delta, 'the first is whole');
  assert.ok(s1.slice(1).every((m) => m.delta && !m.state && typeof m.base === 'number'), 'then deltas');
  s1.slice(1).forEach((m, i) => assert.equal(m.base, s1[i].tick, 'each patches the one before'));
  refuse('c2'); run(60); refuse('c2', false);
  const before = of('c2', 'snap').length;
  run(60);
  const after = of('c2', 'snap').slice(before);
  assert.ok(after[0].state, 'after a skipped send: whole');
  assert.ok(after.slice(1).every((m) => m.delta));
  room.resync('c1');
  const n1 = of('c1', 'snap').length;
  run(60);
  assert.ok(of('c1', 'snap')[n1].state, 'after resync: whole');
  // the client asks for that itself when a delta does not fit what it holds
  assert.equal(validateClientMessage({ type: 'resync' }).ok, true);
});

// ---------------------------------------------------------------- reconnecting
test('a dropped member keeps their seat for 30 s: away in the lobby, the wizard stands still, the token brings them back', () => {
  const { room, of } = fakeRoom({ reconnectMs: 30000 });
  room.update(0);
  room.join('c1', { name: 'Ana' }); room.join('c2', { name: 'Bo' });
  room.setReady('c1', true); room.setReady('c2', true); room.start('c1');
  room.game.waveT = 1e9;
  const token = of('c1', 'welcome')[0].token;
  assert.match(token, /^[0-9a-f]{24}$/);
  let t = 0;
  const run = (ms) => { for (const end = t + ms; t < end;) room.update(t += 1000 / 60); };
  room.input('c1', { seq: 1, move: { x: 1, z: 0 }, aim: { x: 0, z: -8 }, actions: [] });
  run(100);
  room.drop('c1');
  const lobby = of('c2', 'lobby').at(-1);
  assert.deepEqual(lobby.players.map((p) => [p.id, !!p.away, p.host]), [['p1', true, false], ['p2', false, true]], 'away, and the host passed on');
  const x0 = room.game.players[0].x;
  run(10000);
  assert.equal(room.game.players.length, 2, 'still in the run');
  assert.ok(Math.abs(room.game.players[0].x - x0) < 0.3, 'standing still');
  assert.equal(room.resume('c9', 'f'.repeat(24)).code, 'no_seat');
  const back = room.resume('c3', token, 'Ana');
  assert.deepEqual(back, { ok: true, id: 'p1' });
  const w = of('c3', 'welcome')[0];
  assert.equal(w.you, 'p1'); assert.equal(w.resumed, true); assert.equal(w.token, token);
  run(100);
  assert.ok(of('c3', 'snap')[0].state, 'the first snapshot back is whole');
  assert.equal(of('c3', 'snap')[0].you, 'p1');
  // gone for good after the hold
  room.drop('c3');
  run(29000);
  assert.equal(room.game.players.length, 2);
  run(1500);
  assert.equal(room.game.players.length, 1, 'removed after 30 s');
  assert.equal(of('c2', 'lobby').at(-1).players.length, 1);
  assert.equal(room.resume('c4', token).ok, false);
});

test('a join with a seat token is validated: hex, and only with its room code', () => {
  assert.equal(validateClientMessage({ type: 'join', room: 'ABCD', token: 'a'.repeat(24) }).msg.token, 'a'.repeat(24));
  assert.equal(validateClientMessage({ type: 'join', room: 'ABCD', token: 'nope' }).ok, false);
  assert.equal(validateClientMessage({ type: 'join', token: 'a'.repeat(24) }).ok, false);
});

test('over real sockets: the browser client patches deltas, measures its ping, and rejoins its seat after a drop', async (t) => {
  const srv = await createServer({ port: 0, tickMs: 4 });
  t.after(() => srv.close());
  const log = { snaps: [], welcomes: [] };
  const c = createNetClient({ url: `ws://127.0.0.1:${srv.port}/ws`, WebSocketImpl: WebSocket,
    onWelcome: (m) => log.welcomes.push(m), onSnap: (m) => log.snaps.push(m), onLobby: () => {} });
  await c.connect();
  c.join(null, 'Ana');
  await until(() => c.me && c.lobby);
  c.ready(true);
  await until(() => c.lobby.players[0].ready);
  c.start();
  await until(() => log.snaps.length > 10, 4000, 'snapshots');
  assert.ok(log.snaps.every((m) => m.state && m.state.players.length === 1 && !m.delta), 'onSnap always gets a whole state');
  assert.equal(c.resyncs, 0);
  c.ping();
  await until(() => c.rtt !== null, 3000, 'pong');
  assert.ok(c.rtt >= 0 && c.rtt < 1000);
  // the server side of the socket dies
  const room = [...srv.rooms.values()][0];
  for (const ws of srv.wss.clients) ws.terminate();
  await until(() => !c.connected, 3000, 'noticed the drop');
  await until(() => room.away.size === 1, 3000, 'seat held');
  await c.rejoin('Ana');
  await until(() => log.welcomes.length === 2, 3000, 'welcome back');
  assert.equal(log.welcomes[1].resumed, true);
  assert.equal(c.me, 'p1');
  const n = log.snaps.length;
  await until(() => log.snaps.length > n + 5, 3000, 'snapshots again');
  assert.equal(c.resyncs, 0, 'the first snapshot back is whole, so nothing needed asking for');
  c.close();
});

// ---------------------------------------------------------------- prediction
// The server and one client on a fake clock with 60 ms each way: input and snapshots arrive late.
function laggedRun(frames, moveAt) {
  const LAT = 60, toClient = [], toServer = [];
  let now = 0;
  const room = new Room('LAGS', { send: (conn, m) => { toClient.push({ at: now + LAT, m: wire(m) }); return true; } });
  room.join('c1', {}); room.setReady('c1', true); room.start('c1');
  room.game.waveT = 1e9;
  const buf = createSnapBuffer({ delayMs: 100 }), pr = createPredictor();
  const g = createCoopGame([]); g.meId = 'p1';
  let base = null, seq = 0;
  const out = [];
  for (let f = 0; f < frames; f++) {
    now = f * 1000 / 60;
    while (toServer.length && toServer[0].at <= now) room.input('c1', toServer.shift().m);
    room.update(now);
    while (toClient.length && toClient[0].at <= now) {
      const m = toClient.shift().m;
      if (m.type !== 'snap') continue;
      if (m.delta) m.state = patch(base, m.delta);
      base = m.state;
      buf.push(m, now);
    }
    const move = moveAt(f);
    if (f % 2 === 0) { seq++; toServer.push({ at: now + LAT, m: { seq, move, aim: { x: 0, z: -8 }, actions: [] } }); }
    buf.advance(g, now);
    if (!g.player) continue;
    const behind = g.player.x;
    const r = pr.frame(g, g.player, buf.latest, seq, move, 1 / 60);
    out.push({ f, behind, x: r.x, z: r.z, predicted: r.predicted, server: room.game.players[0].x, pending: pr.pending });
  }
  return out;
}

test('your wizard moves the moment you press, not a round trip later, and settles where the server has it', () => {
  const run = laggedRun(240, (f) => (f >= 60 && f < 120 ? { x: 1, z: 0 } : { x: 0, z: 0 }));
  const at = (f) => run.find((r) => r.f === f);
  const x0 = at(59).x;
  assert.ok(at(66).x > x0 + 0.25, `after 100 ms you have moved: ${at(66).x}`);
  assert.ok(Math.abs(at(66).behind - x0) < 1e-6, 'the delayed world has not seen it yet');
  assert.ok(at(66).predicted);
  for (let i = 1; i < run.length; i++) assert.ok(Math.abs(run[i].x - run[i - 1].x) < 0.2, `no jumps at frame ${run[i].f}`);
  const end = run.at(-1);
  assert.ok(Math.abs(end.x - end.server) < 0.02, `settled on the server's spot: ${end.x} vs ${end.server}`);
  assert.ok(end.pending < 6, 'acknowledged inputs are dropped');
});

test('while the server says you are not walking (a dodge), its word is drawn; corrections ease in', () => {
  const g = createCoopGame([{ wizard: 'ember_pyromancer' }]);
  g.meId = 'p1';
  const me = g.players[0];
  const pr = createPredictor();
  const state = (o) => ({ tick: o.tick, ack: 0, state: { players: [{ ...wire({ ...me, st: {} }), ...o.p }] } });
  let r = pr.frame(g, me, state({ tick: 3, p: { x: 0, z: 0 } }), 1, { x: 1, z: 0 }, 1 / 60);
  assert.equal(r.predicted, true);
  me.x = 2; // the buffer moved the wizard; the server says it is mid-dodge
  r = pr.frame(g, me, state({ tick: 6, p: { x: 2, z: 0, dodge: 0.2 } }), 1, { x: 1, z: 0 }, 1 / 60);
  assert.equal(r.predicted, false);
  assert.ok(r.x < 2, 'eased from where it was drawn, not snapped');
  for (let i = 0; i < 60; i++) { me.x = 2; r = pr.frame(g, me, state({ tick: 6, p: { x: 2, z: 0, dodge: 0.2 } }), 1, { x: 1, z: 0 }, 1 / 60); } // the buffer puts it back each frame
  assert.ok(Math.abs(r.x - 2) < 0.01, 'and arrives');
});

// ---------------------------------------------------------------- per-player stats
test('the sim counts each wizard\'s share: kills to the last hitter, damage, casts', () => {
  seedRandom(7);
  const g = createCoopGame([{ wizard: 'ember_pyromancer' }, { wizard: 'stone_druid' }]);
  g.mode = 'play'; g.waveT = 0.5;
  const [p1, p2] = g.players;
  for (let i = 0; i < 60 * 40 && g.kills < 3; i++) {
    const e = g.enemies.slice().sort((a, b) => Math.hypot(a.x - p1.x, a.z - p1.z) - Math.hypot(b.x - p1.x, b.z - p1.z))[0];
    const aim = e ? { x: e.x, z: e.z } : { x: 0, z: -8 };
    p1.hp = p1.maxHp; p2.hp = p2.maxHp; // keep both standing; this is about counting
    step(g, { players: { p1: { move: { x: 0, z: 0 }, aim, actions: i % 30 === 0 ? ['el:fire', 'el:fire', 'cast'] : [] }, p2: { move: { x: 0, z: 0 }, aim: { x: 0, z: 8 }, actions: [] } } }, 1 / 60);
  }
  unseedRandom();
  assert.ok(g.kills >= 3, 'kills: ' + g.kills);
  assert.equal(p1.stats.kills, g.kills, 'every kill went to the wizard who hit');
  assert.equal(p2.stats.kills, 0);
  assert.ok(p1.stats.dealt > 0 && p2.stats.dealt === 0);
  assert.ok(Math.abs(p1.stats.dealt - g.stats.dealt) < 1e-6, 'burns count for the wizard who lit them');
  assert.equal(p1.stats.casts, g.stats.casts);
  const snap = wire(snapshotState(g));
  assert.equal(snap.players[0].stats.kills, g.kills, 'the stats travel in the snapshot');
});

// ---------------------------------------------------------------- wiring
test('wiring: the page predicts, pings and reconnects; the server deflates; the HUD shows the ping and who is away', () => {
  const main = read('src/game/main.js'), hud = read('src/game/hud.js'), app = read('src/App.tsx'), server = read('server/index.js');
  assert.match(main, /createPredictor\(\)/);
  assert.match(main, /predictor\.frame\(/);
  assert.match(main, /client\.ping\(\)/);
  assert.match(main, /rejoin\(/);
  assert.match(server, /perMessageDeflate/);
  assert.match(server, /room\.drop\(conn\)/, 'a closed socket holds the seat');
  assert.match(hud, /setPing\(/);
  assert.match(hud, /reconnecting/i);
  assert.match(app, /id="h-ping"/);
});
