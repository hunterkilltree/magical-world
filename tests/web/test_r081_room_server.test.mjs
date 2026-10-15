import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { validateClientMessage, ROOM_CODE_RE, WIZARD_IDS, ROLE_IDS } from '../../src/net/protocol.js';
import { snapshotState, applySnapshot } from '../../src/net/snapshot.js';
import { Room } from '../../server/room.js';
import { createServer } from '../../server/index.js';
import { createCoopGame, createGame, step, seedRandom, unseedRandom } from '../../src/game/sim.js';
import { ENEMY_TYPES } from '../../src/game/enemies.js';

const ok = (m) => { const r = validateClientMessage(m); assert.equal(r.ok, true, JSON.stringify(r)); return r.msg; };
const bad = (m, code = 'bad_message') => { const r = validateClientMessage(m); assert.equal(r.ok, false); assert.equal(r.code, code); };

// ---------------------------------------------------------------- protocol
test('join: name and room code are cleaned up and checked', () => {
  assert.deepEqual(ok({ type: 'join', name: '  Brann\u0000 the Bold  ' }), { type: 'join', name: 'Brann the Bold' });
  assert.equal(ok({ type: 'join', name: 'x'.repeat(80) }).name.length, 16);
  assert.equal(ok({ type: 'join' }).name, 'Wizard');
  assert.equal(ok({ type: 'join', room: 'abcd' }).room, 'ABCD');
  assert.match('QWER', ROOM_CODE_RE);
  bad({ type: 'join', room: 'AB' });
  bad({ type: 'join', room: 'AB1D' });
  bad({ type: 'join', room: 12 });
});

test('pick only takes known wizards and roles', () => {
  assert.equal(WIZARD_IDS.length, 6);
  assert.equal(ROLE_IDS.length, 5);
  assert.deepEqual(ok({ type: 'pick', wizard: 'stone_druid', role: 'guardian' }), { type: 'pick', wizard: 'stone_druid', role: 'guardian' });
  assert.equal(ok({ type: 'pick', wizard: 'stone_druid' }).role, null);
  bad({ type: 'pick', wizard: 'evil_wizard' });
  bad({ type: 'pick', wizard: 'stone_druid', role: 'necromancer' });
});

test('input is clamped: unit movement, aim inside the court, a few known actions', () => {
  const m = ok({ type: 'input', seq: 7, move: { x: 5, z: -9 }, aim: { x: 1e9, z: -1e9 }, actions: ['el:fire', 'cast', 'pause', 'restart', 'el:plasma', 'recast', 7] });
  assert.equal(m.seq, 7);
  assert.ok(Math.abs(Math.hypot(m.move.x, m.move.z) - 1) < 1e-9, 'unit length');
  assert.ok(Math.hypot(m.aim.x, m.aim.z) <= 40 + 1e-6, 'aim stays near the court');
  assert.deepEqual(m.actions, ['el:fire', 'cast', 'recast'], 'pause, restart and made-up actions are dropped');
  assert.equal(ok({ type: 'input', seq: 1, move: { x: 0.3, z: 0.2 }, aim: { x: 1, z: 1 }, actions: [] }).move.x, 0.3);
  assert.equal(ok({ type: 'input', seq: 1, move: { x: 0, z: 0 }, aim: { x: 0, z: 0 }, actions: Array(100).fill('cast') }).actions.length, 12, 'at most 12 actions');
  bad({ type: 'input', seq: 1, move: { x: NaN, z: 0 }, aim: { x: 0, z: 0 }, actions: [] });
  bad({ type: 'input', seq: 'a', move: { x: 0, z: 0 }, aim: { x: 0, z: 0 }, actions: [] });
  bad({ type: 'input', seq: 1, move: 5, aim: { x: 0, z: 0 }, actions: [] });
});

test('unknown or malformed messages are refused', () => {
  bad(null);
  bad('hello');
  bad([]);
  bad({ type: 'format_disk' });
  bad({});
  assert.equal(ok({ type: 'ready', ready: true }).ready, true);
  bad({ type: 'ready', ready: 'yes' });
  ok({ type: 'start' });
  ok({ type: 'leave' });
  assert.equal(ok({ type: 'ping', t: 12 }).t, 12);
});

// ---------------------------------------------------------------- a room (no sockets)
function mkRoom(opts = {}) {
  const sent = [];
  const room = new Room('ABCD', { send: (conn, msg) => sent.push({ conn, msg }), ...opts });
  const last = (conn, type) => [...sent].reverse().find((s) => s.conn === conn && s.msg.type === type)?.msg;
  const all = (conn, type) => sent.filter((s) => s.conn === conn && s.msg.type === type).map((s) => s.msg);
  return { room, sent, last, all };
}
const joinN = (room, n) => Array.from({ length: n }, (_, i) => room.join('c' + (i + 1), { name: 'W' + (i + 1) }));

test('a room takes up to four players and refuses a fifth', () => {
  const { room, last } = mkRoom();
  const r = joinN(room, 4);
  assert.deepEqual(r.map((x) => x.id), ['p1', 'p2', 'p3', 'p4']);
  assert.equal(r.every((x) => x.ok), true);
  const fifth = room.join('c5', { name: 'Late' });
  assert.equal(fifth.ok, false);
  assert.equal(fifth.code, 'room_full');
  assert.equal(room.size, 4);
  const lobby = last('c1', 'lobby');
  assert.equal(lobby.players.length, 4);
  assert.equal(lobby.players[0].host, true);
  assert.equal(lobby.players.filter((p) => p.host).length, 1);
  assert.equal(new Set(lobby.players.map((p) => p.wizard)).size, 4, 'each starts on a different wizard');
  assert.equal(last('c3', 'welcome').you, 'p3');
});

test('the same connection cannot join twice', () => {
  const { room } = mkRoom();
  room.join('c1', { name: 'A' });
  assert.equal(room.join('c1', { name: 'A' }).code, 'already_joined');
});

test('wizard and role are picked in the lobby; ready and start belong to the host', () => {
  const { room, last } = mkRoom();
  joinN(room, 2);
  assert.equal(room.pick('c2', { wizard: 'storm_conduit', role: 'guardian' }).ok, true);
  const p2 = last('c1', 'lobby').players[1];
  assert.equal(p2.wizard, 'storm_conduit');
  assert.equal(p2.role, 'guardian');
  assert.equal(room.start('c2').code, 'not_host');
  assert.equal(room.start('c1').code, 'not_ready', 'nobody is ready');
  room.setReady('c1', true);
  assert.equal(room.start('c1').code, 'not_ready', 'p2 is not ready');
  room.setReady('c2', true);
  assert.equal(room.start('c1').ok, true);
  assert.equal(room.phase, 'play');
  assert.equal(room.pick('c2', { wizard: 'stone_druid' }).code, 'in_game');
});

test('starting builds a co-op sim with everyone in it', () => {
  const { room } = mkRoom();
  joinN(room, 4);
  ['c1', 'c2', 'c3', 'c4'].forEach((c) => room.setReady(c, true));
  room.pick('c3', { wizard: 'rime_cryomancer', role: 'trickster' });
  room.setReady('c3', true);
  room.start('c1');
  const g = room.game;
  assert.equal(g.coop, true);
  assert.equal(g.mode, 'play');
  assert.equal(g.players.length, 4);
  assert.equal(g.players[2].wizard, 'rime_cryomancer');
  assert.equal(g.players[2].role, 'trickster');
  assert.equal(g.players[2].name, 'W3');
});

test('the room steps the sim at 60 Hz and sends snapshots at 20 Hz', () => {
  const { room, all } = mkRoom();
  joinN(room, 2);
  room.setReady('c1', true); room.setReady('c2', true); room.start('c1');
  room.update(0);
  for (let t = 100; t <= 1000; t += 100) room.update(t); // the server calls it every few ms; 100 ms steps are plenty
  assert.ok(Math.abs(room.tickCount - 60) <= 1, 'ticks: ' + room.tickCount);
  const snaps = all('c1', 'snap');
  assert.ok(snaps.length >= 19 && snaps.length <= 21, 'snapshots: ' + snaps.length);
  assert.equal(snaps[0].state.players.length, 2);
  assert.ok(snaps[snaps.length - 1].tick > snaps[0].tick);
  room.update(1000 + 5000); // a long stall is capped, not caught up in one go
  assert.ok(room.tickCount < 60 + 30, 'capped catch-up: ' + room.tickCount);
});

test('input drives that player; the snapshot acks the last input applied', () => {
  const { room, all } = mkRoom();
  joinN(room, 2);
  room.setReady('c1', true); room.setReady('c2', true); room.start('c1');
  const x0 = room.game.players[1].x;
  room.input('c2', { type: 'input', seq: 5, move: { x: 1, z: 0 }, aim: { x: 5, z: 0 }, actions: ['el:fire', 'el:water'] });
  room.update(0);
  for (let t = 100; t <= 500; t += 100) room.update(t);
  assert.ok(room.game.players[1].x > x0 + 1, 'p2 walked');
  assert.deepEqual(room.game.players[1].queue, ['fire', 'water'], 'one-shot actions were applied once');
  const snaps = all('c2', 'snap');
  assert.equal(snaps[snaps.length - 1].ack, 5);
  assert.equal(snaps[snaps.length - 1].you, 'p2');
  const p1snaps = all('c1', 'snap');
  assert.equal(p1snaps[p1snaps.length - 1].ack, 0, 'p1 has sent nothing');
  assert.ok(room.game.players[0].x === room.game.players[0].x);
  const ev = snaps.flatMap((s) => s.events).filter((e) => e.type === 'queue');
  assert.equal(ev.length, 2, 'the events arrive once each: ' + ev.length);
  assert.equal(ev[0].pid, 'p2');
});

test('a player who stops sending input keeps walking only for a moment', () => {
  const { room } = mkRoom();
  joinN(room, 1);
  room.setReady('c1', true); room.start('c1');
  room.input('c1', { type: 'input', seq: 1, move: { x: 1, z: 0 }, aim: { x: 5, z: 0 }, actions: [] });
  room.update(0);
  for (let t = 100; t <= 300; t += 100) room.update(t);
  const x1 = room.game.players[0].x;
  for (let t = 400; t <= 2300; t += 100) room.update(t); // no input for 2 s: the stale move is dropped
  const x2 = room.game.players[0].x;
  assert.ok(x2 - x1 < 3, `it stopped (walked ${x2 - x1} m in 2 s)`);
});

test('leaving removes the wizard and passes the host on; an empty room reports it', () => {
  const { room, last } = mkRoom();
  joinN(room, 3);
  room.setReady('c1', true); room.setReady('c2', true); room.setReady('c3', true); room.start('c1');
  room.leave('c1');
  assert.equal(room.size, 2);
  assert.equal(room.game.players.length, 2);
  assert.ok(!room.game.players.some((p) => p.id === 'p1'));
  const lobby = last('c2', 'lobby');
  assert.equal(lobby.players.find((p) => p.id === 'p2').host, true, 'host passed to the next player');
  room.leave('c2'); room.leave('c3');
  assert.equal(room.empty, true);
  assert.equal(room.leave('nobody'), false);
});

test('a wizard can drop in while the run is going; the freed slot is reused', () => {
  const { room } = mkRoom();
  joinN(room, 2);
  room.setReady('c1', true); room.setReady('c2', true); room.start('c1');
  const late = room.join('c3', { name: 'Late' });
  assert.equal(late.ok, true);
  assert.equal(room.game.players.length, 3);
  room.leave('c2');
  const again = room.join('c4', { name: 'Again' });
  assert.equal(again.id, 'p2');
  assert.equal(room.game.players.length, 3);
});

test('after a defeat the host can start a new run with the same party', () => {
  const { room } = mkRoom();
  joinN(room, 2);
  room.setReady('c1', true); room.setReady('c2', true); room.start('c1');
  room.game.players.forEach((p) => { p.hp = 0; });
  room.update(0);
  room.update(100); room.update(200);
  assert.equal(room.game.mode, 'dead');
  assert.equal(room.start('c2').code, 'not_host');
  assert.equal(room.start('c1').ok, true);
  assert.equal(room.game.mode, 'play');
  assert.equal(room.game.wave, 0);
  assert.equal(room.game.players.length, 2);
  assert.ok(room.game.players.every((p) => p.alive && p.hp === p.maxHp));
});

test('a busy snapshot stays a sensible size', () => {
  const { room, all } = mkRoom();
  joinN(room, 4);
  ['c1', 'c2', 'c3', 'c4'].forEach((c) => room.setReady(c, true));
  room.start('c1');
  room.game.wave = 6; room.game.waveT = 0.001;
  const inputs = (i) => ({ type: 'input', seq: i, move: { x: Math.cos(i / 10), z: Math.sin(i / 10) }, aim: { x: 4, z: -4 }, actions: i % 20 === 0 ? ['el:fire', 'el:earth', 'cast'] : [] });
  room.update(0);
  for (let t = 1; t <= 30; t++) {
    for (const c of ['c1', 'c2', 'c3', 'c4']) room.input(c, inputs(t));
    for (let k = 1; k <= 5; k++) room.update((t - 1) * 500 + k * 100);
  }
  const snaps = all('c1', 'snap');
  const sizes = snaps.map((s) => JSON.stringify(s).length).sort((a, b) => a - b);
  const p95 = sizes[Math.floor(sizes.length * 0.95)];
  console.log(`  snapshot size: median ${sizes[sizes.length >> 1]} B, p95 ${p95} B, max ${sizes[sizes.length - 1]} B, ${room.game.enemies.length} enemies`);
  assert.ok(p95 < 40000, 'p95 under 40 KB: ' + p95);
});

// ---------------------------------------------------------------- the snapshot codec
test('a snapshot survives JSON and rebuilds the world on a client', () => {
  seedRandom(3);
  const g = createCoopGame([{ wizard: 'ember_pyromancer' }, { wizard: 'stone_druid' }, { wizard: 'storm_conduit', role: 'trickster' }]);
  g.mode = 'play'; g.wave = 5; g.waveT = 0.001;
  const acts = [['el:fire', 'el:earth', 'cast'], ['el:nature', 'el:nature', 'nova'], ['el:wind', 'el:lightning', 'cast']];
  for (let i = 0; i < 420; i++) {
    const players = {};
    g.players.forEach((p, k) => { players[p.id] = { move: { x: Math.cos(i / 40 + k), z: Math.sin(i / 40) }, aim: { x: 3 * k - 3, z: -5 }, actions: i % 90 === 1 ? acts[k] : [] }; });
    step(g, { players }, 1 / 60);
  }
  unseedRandom();
  assert.ok(g.enemies.length > 0 && (g.shots.length + g.areas.length + g.walls.length + g.decoys.length) > 0, 'something is going on');
  const wire = JSON.parse(JSON.stringify(snapshotState(g)));
  const client = createCoopGame([]);
  client.meId = 'p2';
  applySnapshot(client, wire);
  assert.equal(client.player.id, 'p2', 'game.player is the local wizard');
  assert.equal(client.mode, g.mode);
  assert.equal(client.wave, g.wave);
  assert.equal(client.kills, g.kills);
  assert.equal(client.players.length, 3);
  assert.equal(client.enemies.length, g.enemies.length);
  for (const [a, b] of g.enemies.map((e, i) => [e, client.enemies[i]])) {
    assert.equal(b.id, a.id);
    assert.equal(b.kind, a.kind);
    assert.ok(Math.abs(b.x - a.x) < 0.01 && Math.abs(b.z - a.z) < 0.01 && Math.abs(b.hp - a.hp) < 0.01);
    assert.equal(b.T, ENEMY_TYPES[a.kind], 'enemy stats are looked up, not sent');
    assert.equal(b.st.burn > 0, a.st.burn > 0);
    assert.equal(typeof b.st.frozen, 'number', 'status keeps every field');
  }
  g.players.forEach((a, i) => {
    const b = client.players[i];
    assert.equal(b.id, a.id); assert.equal(b.wizard, a.wizard); assert.equal(b.role, a.role); assert.equal(b.alive, a.alive);
    assert.ok(Math.abs(b.hp - a.hp) < 0.01 && Math.abs(b.x - a.x) < 0.01);
    assert.deepEqual(b.queue, a.queue);
    assert.equal(b.isPlayer, true);
  });
  for (const list of ['shots', 'areas', 'walls', 'decoys']) {
    assert.equal(client[list].length, g[list].length, list);
    g[list].forEach((a, i) => {
      const b = client[list][i];
      assert.equal(b.id, a.id);
      if (a.sp) {
        assert.ok(b.sp, list + ' has a spell');
        assert.equal(b.sp.key, a.sp.key);
        assert.equal(b.sp.name, a.sp.name);
        assert.equal(b.sp.def.shape, a.sp.def.shape);
        assert.deepEqual(b.sp.els, a.sp.els);
        assert.ok(Math.abs(b.sp.color - a.sp.color) < 1);
      }
    });
  }
  assert.equal(client.props.puddles.length, g.props.puddles.length);
  assert.deepEqual(client.props.brush.map((b) => b.state), g.props.brush.map((b) => b.state));
  assert.deepEqual(client.props.barrels.map((b) => b.alive), g.props.barrels.map((b) => b.alive));
  assert.equal(client.props.pillars.length, g.props.pillars.length, 'the court furniture is local');
  assert.equal(client.stats.found.size, g.stats.found.size);
});

test('a snapshot applies on top of an older one: gone entities go, new ones come', () => {
  const g = createCoopGame([{ wizard: 'ember_pyromancer' }]);
  g.mode = 'play'; g.waveT = 0.001;
  const client = createCoopGame([]);
  client.meId = 'p1';
  for (let i = 0; i < 400; i++) step(g, { players: { p1: { move: { x: 0, z: 0 }, aim: { x: 0, z: -5 }, actions: [] } } }, 1 / 60);
  applySnapshot(client, JSON.parse(JSON.stringify(snapshotState(g))));
  const n = client.enemies.length;
  assert.ok(n > 0);
  g.enemies = g.enemies.slice(1);
  applySnapshot(client, JSON.parse(JSON.stringify(snapshotState(g))));
  assert.equal(client.enemies.length, n - 1);
});

// ---------------------------------------------------------------- real sockets
function connect(port) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const inbox = [];
  const waiters = [];
  ws.on('message', (d) => {
    const m = JSON.parse(d.toString());
    inbox.push(m);
    for (const w of [...waiters]) if (w.pred(m)) { waiters.splice(waiters.indexOf(w), 1); w.res(m); }
  });
  const wait = (pred, ms = 3000) => {
    const hit = inbox.find(pred);
    if (hit) return Promise.resolve(hit);
    return new Promise((res, rej) => {
      const w = { pred, res };
      waiters.push(w);
      setTimeout(() => { if (waiters.includes(w)) { waiters.splice(waiters.indexOf(w), 1); rej(new Error('timeout waiting for a message; got: ' + inbox.map((m) => m.type).join(','))); } }, ms);
    });
  };
  const open = new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
  return { ws, inbox, wait, open, send: (m) => ws.send(JSON.stringify(m)), type: (t) => wait((m) => m.type === t) };
}

test('over real WebSockets: four wizards join, a fifth is refused, the host starts, snapshots flow', async (t) => {
  const srv = await createServer({ port: 0, tickMs: 4 });
  t.after(() => srv.close());
  const cs = [];
  for (let i = 0; i < 4; i++) { const c = connect(srv.port); await c.open; cs.push(c); }
  cs[0].send({ type: 'join', name: 'Host' });
  const w0 = await cs[0].type('welcome');
  assert.match(w0.room, ROOM_CODE_RE);
  assert.equal(w0.you, 'p1');
  for (let i = 1; i < 4; i++) { cs[i].send({ type: 'join', room: w0.room, name: 'W' + (i + 1) }); assert.equal((await cs[i].type('welcome')).you, 'p' + (i + 1)); }
  const extra = connect(srv.port); await extra.open;
  extra.send({ type: 'join', room: w0.room, name: 'Late' });
  assert.equal((await extra.type('error')).code, 'room_full');
  const ghost = connect(srv.port); await ghost.open;
  ghost.send({ type: 'join', room: 'ZZZZ', name: 'Lost' });
  assert.equal((await ghost.type('error')).code, 'no_room');
  cs[0].send({ type: 'start' });
  assert.equal((await cs[0].type('error')).code, 'not_ready');
  cs.forEach((c) => c.send({ type: 'ready', ready: true }));
  await cs[3].wait((m) => m.type === 'lobby' && m.players.every((p) => p.ready));
  cs[0].send({ type: 'start' });
  const snap = await cs[2].wait((m) => m.type === 'snap' && m.state.mode === 'play');
  assert.equal(snap.you, 'p3');
  assert.equal(snap.state.players.length, 4);
  cs[1].send({ type: 'input', seq: 1, move: { x: 1, z: 0 }, aim: { x: 5, z: 0 }, actions: ['el:fire'] });
  const moved = await cs[0].wait((m) => m.type === 'snap' && m.state.players[1].queue.length === 1 && m.state.players[1].x > 3.6);
  assert.equal(moved.state.players[1].queue[0], 'fire');
  [extra, ghost, ...cs].forEach((c) => c.ws.close());
});

test('over real WebSockets: junk is refused and a flood is cut off', async (t) => {
  const srv = await createServer({ port: 0, tickMs: 4 });
  t.after(() => srv.close());
  const c = connect(srv.port); await c.open;
  c.ws.send('not json at all');
  assert.equal((await c.type('error')).code, 'bad_message');
  c.send({ type: 'input', seq: 1, move: { x: 0, z: 0 }, aim: { x: 0, z: 0 }, actions: [] });
  assert.equal((await c.wait((m) => m.type === 'error' && m.code === 'not_in_room')).code, 'not_in_room');
  c.ws.send('x'.repeat(100000));
  await new Promise((res) => c.ws.on('close', res));
  const d = connect(srv.port); await d.open;
  d.send({ type: 'join', name: 'Flood' });
  await d.type('welcome');
  for (let i = 0; i < 2000; i++) d.send({ type: 'ping', t: i });
  const closed = await new Promise((res) => { d.ws.on('close', () => res(true)); setTimeout(() => res(false), 2000); });
  assert.equal(closed, true, 'the flooding client is disconnected');
});

test('over real WebSockets: a dropped connection frees the slot and an empty room goes away', async (t) => {
  const srv = await createServer({ port: 0, tickMs: 4, emptyRoomMs: 50 });
  t.after(() => srv.close());
  const a = connect(srv.port); await a.open;
  a.send({ type: 'join', name: 'A' });
  const wa = await a.type('welcome');
  const b = connect(srv.port); await b.open;
  b.send({ type: 'join', room: wa.room, name: 'B' });
  await b.type('welcome');
  a.ws.close();
  const lobby = await b.wait((m) => m.type === 'lobby' && m.players.length === 1);
  assert.equal(lobby.players[0].host, true, 'B is host now');
  assert.equal(srv.rooms.size, 1);
  b.ws.close();
  for (let i = 0; i < 40 && srv.rooms.size; i++) await new Promise((r) => setTimeout(r, 25));
  assert.equal(srv.rooms.size, 0, 'the empty room was destroyed');
});

test('over real WebSockets: ping gets a pong', async (t) => {
  const srv = await createServer({ port: 0, tickMs: 4 });
  t.after(() => srv.close());
  const c = connect(srv.port); await c.open;
  c.send({ type: 'ping', t: 42 });
  assert.equal((await c.type('pong')).t, 42);
  c.ws.close();
});

test('single-player sim is untouched by any of this', () => {
  const g = createGame('ember_pyromancer');
  assert.equal(g.coop, false);
});
