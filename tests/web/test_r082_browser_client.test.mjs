import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { createServer } from '../../server/index.js';
import { createNetClient, forMe } from '../../src/net/client.js';
import { createSnapBuffer } from '../../src/net/interp.js';
import { createCoopGame, step } from '../../src/game/sim.js';
import { snapshotState } from '../../src/net/snapshot.js';

const until = async (cond, ms = 4000, what = 'condition') => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('timed out waiting for ' + what);
    await new Promise((r) => setTimeout(r, 10));
  }
};

// A client wired to record what it hears.
function mk(port) {
  const log = { welcome: null, lobby: null, snaps: [], errors: [], closed: false };
  const c = createNetClient({
    url: `ws://127.0.0.1:${port}/ws`, WebSocketImpl: WebSocket,
    onWelcome: (m) => { log.welcome = m; }, onLobby: (m) => { log.lobby = m; }, onSnap: (m) => log.snaps.push(m),
    onError: (m) => log.errors.push(m), onClose: () => { log.closed = true; }
  });
  return { c, log };
}

// ---------------------------------------------------------------- the client against the real server
test('two browsers make a room, pick, ready up and start; snapshots arrive', async (t) => {
  const srv = await createServer({ port: 0, tickMs: 4 });
  t.after(() => srv.close());
  const a = mk(srv.port), b = mk(srv.port);
  await a.c.connect();
  await b.c.connect();
  a.c.join(null, 'Ana');
  await until(() => a.log.welcome, 3000, 'welcome');
  assert.equal(a.c.me, 'p1');
  assert.equal(a.c.room, a.log.welcome.room);
  b.c.join(a.c.room.toLowerCase(), 'Bo');
  await until(() => b.log.welcome && a.log.lobby?.players.length === 2, 3000, 'second join');
  b.c.pick('storm_conduit', 'trickster');
  await until(() => a.log.lobby.players[1].wizard === 'storm_conduit', 3000, 'pick');
  assert.equal(a.log.lobby.players[1].role, 'trickster');
  a.c.ready(true); b.c.ready(true);
  await until(() => a.log.lobby.players.every((p) => p.ready), 3000, 'ready');
  assert.equal(a.c.isHost, true);
  assert.equal(b.c.isHost, false);
  a.c.start();
  await until(() => b.log.snaps.length > 3, 3000, 'snapshots');
  assert.equal(b.log.snaps[0].you, 'p2');
  assert.equal(b.log.snaps[0].state.players.length, 2);
  a.c.close(); b.c.close();
});

test('input is sent with a rising sequence number and reaches the sim', async (t) => {
  const srv = await createServer({ port: 0, tickMs: 4 });
  t.after(() => srv.close());
  const a = mk(srv.port);
  await a.c.connect();
  a.c.join(null, 'Solo');
  await until(() => a.log.welcome);
  a.c.ready(true);
  await until(() => a.log.lobby?.players[0].ready);
  a.c.start();
  await until(() => a.log.snaps.length > 0);
  const x0 = a.log.snaps[a.log.snaps.length - 1].state.players[0].x;
  for (let i = 0; i < 20; i++) {
    a.c.sendInput({ move: { x: 1, z: 0 }, aim: { x: 5, z: 0 }, actions: i === 0 ? ['el:fire', 'el:water'] : [] });
    await new Promise((r) => setTimeout(r, 15));
  }
  assert.equal(a.c.seq, 20);
  await until(() => a.log.snaps.at(-1).ack === 20, 3000, 'ack 20');
  const last = a.log.snaps.at(-1).state.players[0];
  assert.ok(last.x > x0 + 0.5, `moved: ${x0} -> ${last.x}`);
  assert.deepEqual(last.queue, ['fire', 'water']);
  a.c.close();
});

test('errors come back to the client, and a dropped server is noticed', async (t) => {
  const srv = await createServer({ port: 0, tickMs: 4 });
  const a = mk(srv.port);
  await a.c.connect();
  a.c.join('QQQQ', 'Lost');
  await until(() => a.log.errors.length);
  assert.equal(a.log.errors[0].code, 'no_room');
  assert.equal(a.c.connected, true);
  srv.close();
  await until(() => a.log.closed, 3000, 'close');
  assert.equal(a.c.connected, false);
  assert.doesNotThrow(() => a.c.sendInput({ move: { x: 0, z: 0 }, aim: { x: 0, z: 0 }, actions: [] }), 'sending on a closed socket is a no-op');
});

test('connecting to nowhere fails cleanly', async () => {
  const a = mk(1); // nothing listens on port 1
  await assert.rejects(a.c.connect(1500));
});

// ---------------------------------------------------------------- the snapshot buffer (no sockets)
function serverRun(seconds, setup) {
  const g = createCoopGame([{ wizard: 'ember_pyromancer' }, { wizard: 'stone_druid' }]);
  g.mode = 'play';
  g.waveT = 1e9;
  setup?.(g);
  const snaps = [];
  let evq = [];
  const n = Math.round(seconds * 60);
  for (let i = 1; i <= n; i++) {
    evq.push(...step(g, { players: { p1: { move: { x: 1, z: 0 }, aim: { x: 5, z: 0 }, actions: i === 10 ? ['el:fire', 'cast'] : [] }, p2: { move: { x: 0, z: 0 }, aim: { x: 0, z: -5 }, actions: [] } } }, 1 / 60));
    if (i % 3 === 0) { snaps.push(JSON.parse(JSON.stringify({ type: 'snap', tick: i, state: snapshotState(g), events: evq, ack: 0, you: 'p2' }))); evq = []; }
  }
  return { g, snaps };
}

test('the buffer shows the world about 100 ms behind, blending positions between snapshots', () => {
  const { snaps } = serverRun(1.0);
  const buf = createSnapBuffer({ delayMs: 100 });
  const game = createCoopGame([]);
  game.meId = 'p2';
  // snapshots arrive every 50 ms of local time, in step with the server
  snaps.forEach((s, i) => buf.push(s, 1000 + (s.tick / 60) * 1000));
  const at = 1000 + 0.6 * 1000 + 100 + 25; // render time = server 0.6 s + 1/2 snapshot
  buf.advance(game, at);
  assert.equal(game.player.id, 'p2', 'game.player is the local wizard');
  const p1 = game.players[0];
  const s36 = snaps.find((s) => s.tick === 36).state.players[0].x, s39 = snaps.find((s) => s.tick === 39).state.players[0].x;
  assert.ok(p1.x > s36 && p1.x < s39, `between ticks 36 and 39: ${s36} < ${p1.x} < ${s39}`);
  assert.ok(Math.abs(p1.x - (s36 + (s39 - s36) * 0.5)) < 0.02, 'about half way');
});

test('each snapshot\'s events play exactly once, when the view reaches them', () => {
  const { snaps } = serverRun(1.0);
  const buf = createSnapBuffer({ delayMs: 100 });
  const game = createCoopGame([]);
  game.meId = 'p1';
  const total = snaps.reduce((a, s) => a + s.events.length, 0);
  assert.ok(total > 0);
  let got = [];
  snaps.forEach((s) => buf.push(s, 1000 + (s.tick / 60) * 1000));
  for (let now = 1000; now < 3000; now += 16) got.push(...buf.advance(game, now));
  assert.equal(got.length, total, 'all events, once');
  const firstCast = got.find((e) => e.type === 'windup' || e.type === 'cast');
  assert.ok(firstCast, 'the cast arrived');
  // nothing plays before the view has reached its snapshot
  const buf2 = createSnapBuffer({ delayMs: 100 });
  const g2 = createCoopGame([]);
  g2.meId = 'p1';
  snaps.forEach((s) => buf2.push(s, 1000 + (s.tick / 60) * 1000));
  const early = buf2.advance(g2, 1000 + 50);
  const earlyCount = early.length;
  assert.ok(earlyCount < total, 'not everything at once');
});

test('jitter in arrival times does not make the view jump back', () => {
  const { snaps } = serverRun(1.5);
  const buf = createSnapBuffer({ delayMs: 100 });
  const game = createCoopGame([]);
  game.meId = 'p2';
  // arrivals wobble by up to 30 ms
  snaps.forEach((s, i) => buf.push(s, 1000 + (s.tick / 60) * 1000 + ((i * 37) % 31)));
  let last = -Infinity, back = 0;
  for (let now = 1150; now < 2400; now += 16) {
    buf.advance(game, now);
    const x = game.players[0].x;
    if (x < last - 1e-6) back++;
    last = x;
  }
  assert.equal(back, 0, 'p1 walks right without ever stepping back');
});

test('a late snapshot holds the last state instead of guessing ahead', () => {
  const { snaps } = serverRun(0.5);
  const buf = createSnapBuffer({ delayMs: 100 });
  const game = createCoopGame([]);
  game.meId = 'p1';
  snaps.forEach((s) => buf.push(s, 1000 + (s.tick / 60) * 1000));
  buf.advance(game, 1000 + 5000); // far past the newest
  const lastX = snaps.at(-1).state.players[0].x;
  assert.ok(Math.abs(game.players[0].x - lastX) < 1e-6);
  assert.equal(buf.size <= 40, true, 'old snapshots are dropped');
});

// ---------------------------------------------------------------- only your own personal events
test('forMe keeps world events and your own, and drops other wizards\' personal ones', () => {
  const ev = [
    { type: 'queue', pid: 'p1', el: 'fire' }, { type: 'queue', pid: 'p2', el: 'ice' },
    { type: 'fizzle', pid: 'p2' }, { type: 'noEnergy', pid: 'p2', cost: 9 }, { type: 'cooldown', pid: 'p2', shape: 'area', t: 1 },
    { type: 'hurt', id: 'p2', dmg: 5 }, { type: 'hurt', id: 'p1', dmg: 5 },
    { type: 'heal', pid: 'p2', amt: 3 }, { type: 'tag', tag: 'interrupt', id: 'p2' },
    { type: 'wave', n: 2 }, { type: 'explode', x: 0, z: 0 }, { type: 'cast', pid: 'p2', els: ['fire'] }
  ];
  const kept = forMe(ev, 'p1').map((e) => e.type + ':' + (e.pid ?? e.id ?? ''));
  assert.deepEqual(kept, ['queue:p1', 'hurt:p1', 'wave:', 'explode:', 'cast:p2']);
});
