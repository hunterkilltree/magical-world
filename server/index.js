// The co-op server (R-081): rooms of up to four wizards, each running the shared sim at 60 Hz.
// `npm run server` (PORT, default 8787). Clients connect to ws://host:PORT/ws; if a Vite build exists
// in dist/ it is served too, so one process is the whole game. See story/COOP_PLAN.md.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';
import { Room } from './room.js';
import { validateClientMessage, ROOM_LETTERS } from '../src/net/protocol.js';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ico': 'image/x-icon', '.map': 'application/json' };
const DIST = join(fileURLToPath(new URL('..', import.meta.url)), 'dist');

const RATE = { capacity: 240, perSecond: 120 }; // messages per connection: a burst, then a steady rate
const MAX_STRIKES = 20; // malformed messages before a connection is dropped
const MAX_BUFFERED = 262144; // a client this far behind gets no more snapshots until it catches up

export async function createServer({ port = 8787, host = '127.0.0.1', tickMs = 8, emptyRoomMs = 30000 } = {}) {
  const rooms = new Map(); // code -> Room
  const timers = new Map(); // code -> empty-room timer
  const sockets = new Map(); // conn id -> ws
  let nextConn = 1;

  const http_ = http.createServer(async (req, res) => {
    const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
    if (path === '/health') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('ok'); return; }
    try {
      let file = normalize(join(DIST, path === '/' ? 'index.html' : path));
      if (file !== DIST && !file.startsWith(DIST + sep)) { res.writeHead(403); res.end(); return; }
      if (!(await stat(file).catch(() => null))?.isFile()) file = join(DIST, 'index.html');
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found (run `npm run build` to serve the game from here)');
    }
  });
  const wss = new WebSocketServer({ server: http_, path: '/ws', maxPayload: 4096 });

  const sendTo = (conn, msg) => {
    const ws = sockets.get(conn);
    if (!ws || ws.readyState !== 1) return;
    if (msg.type === 'snap' && ws.bufferedAmount > MAX_BUFFERED) return; // slow client: skip this one
    ws.send(JSON.stringify(msg));
  };
  const err = (conn, code, message) => sendTo(conn, { type: 'error', code, message });

  const newCode = () => {
    for (let i = 0; i < 200; i++) {
      const c = Array.from({ length: 4 }, () => ROOM_LETTERS[(Math.random() * ROOM_LETTERS.length) | 0]).join('');
      if (!rooms.has(c)) return c;
    }
    return null;
  };
  const dropIfEmpty = (room) => {
    if (!room.empty || timers.has(room.code)) return;
    timers.set(room.code, setTimeout(() => { timers.delete(room.code); if (room.empty) rooms.delete(room.code); }, emptyRoomMs));
  };

  wss.on('connection', (ws) => {
    const conn = 'c' + nextConn++;
    sockets.set(conn, ws);
    let room = null;
    let strikes = 0;
    let tokens = RATE.capacity;
    let refilled = Date.now();

    ws.on('message', (data, isBinary) => {
      const now = Date.now();
      tokens = Math.min(RATE.capacity, tokens + ((now - refilled) / 1000) * RATE.perSecond);
      refilled = now;
      if (--tokens < 0) { ws.close(1008, 'rate limit'); return; }
      let raw;
      try { raw = isBinary ? null : JSON.parse(data.toString()); } catch { raw = null; }
      const v = validateClientMessage(raw);
      if (!v.ok) { err(conn, v.code, v.message); if (++strikes >= MAX_STRIKES) ws.close(1008, 'too many bad messages'); return; }
      const m = v.msg;
      if (m.type === 'ping') { sendTo(conn, { type: 'pong', t: m.t }); return; }
      if (m.type === 'join') {
        if (room) { err(conn, 'already_joined', 'already in a room'); return; }
        let r;
        if (m.room) {
          r = rooms.get(m.room);
          if (!r) { err(conn, 'no_room', 'no room with that code'); return; }
        } else {
          const code = newCode();
          if (!code) { err(conn, 'busy', 'the server is full'); return; }
          r = new Room(code, { send: sendTo });
          rooms.set(code, r);
        }
        const j = r.join(conn, { name: m.name });
        if (!j.ok) { err(conn, j.code, j.message); dropIfEmpty(r); return; }
        room = r;
        clearTimeout(timers.get(r.code));
        timers.delete(r.code);
        return;
      }
      if (!room) { err(conn, 'not_in_room', 'join a room first'); return; }
      let out = { ok: true };
      if (m.type === 'pick') out = room.pick(conn, m);
      else if (m.type === 'ready') out = room.setReady(conn, m.ready);
      else if (m.type === 'start') out = room.start(conn);
      else if (m.type === 'input') room.input(conn, m);
      else if (m.type === 'leave') { room.leave(conn); dropIfEmpty(room); room = null; }
      if (!out.ok) err(conn, out.code, out.message);
    });

    ws.on('close', () => {
      sockets.delete(conn);
      if (room) { room.leave(conn); dropIfEmpty(room); room = null; }
    });
    ws.on('error', () => ws.terminate());
  });

  const ticker = setInterval(() => {
    const now = performance.now();
    for (const r of rooms.values()) {
      try { r.update(now); } catch (e) { // one broken room must not take the server down
        console.error(`room ${r.code} failed and was closed:`, e);
        for (const conn of r.members.keys()) { err(conn, 'room_failed', 'the room hit an error and was closed'); sockets.get(conn)?.close(1011, 'room failed'); }
        rooms.delete(r.code);
      }
    }
  }, tickMs);

  await new Promise((resolve, reject) => { http_.once('error', reject); http_.listen(port, host, resolve); });
  const bound = http_.address().port;
  return {
    port: bound, rooms, wss,
    close() {
      clearInterval(ticker);
      for (const t of timers.values()) clearTimeout(t);
      for (const ws of sockets.values()) ws.terminate();
      wss.close();
      http_.close();
    }
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = +(process.env.PORT ?? 8787);
  const srv = await createServer({ port, host: process.env.HOST ?? '0.0.0.0' });
  console.log(`Court of Waves co-op server on :${srv.port} (ws path /ws)`);
}
