# Co-op plan: up to four wizards in one court (web port)

Target: the browser port (`src/`, Vite + three.js). The Godot project is not touched.
Goal: one to four players fight the same waves together over the internet, each with
their own wizard, role and spell queue.

## 1. Architecture: an authoritative server running the shared sim

`src/game/sim.js` is already pure (no three.js, no DOM) and steps at a fixed 60 Hz, so the
same module runs in Node. That decides the design:

```
 browser A ─┐  input (move, aim, actions)            ┌─ snapshot @20 Hz + events ─▶ browser A
 browser B ─┼──────── WebSocket ───────▶  Node room ─┼─ snapshot @20 Hz + events ─▶ browser B
 browser C ─┤                           (sim.js @60Hz)└─ ...
 browser D ─┘
```

- **Server-authoritative.** A Node process (`server/`) owns every room's `game` and calls
  `step(game, {players: {id: input}}, 1/60)`. Clients never run gameplay; they send input
  and render what the server says. No host migration, no desync, no cheating by editing
  the page, and a player's tab can sleep without freezing the others.
- **Why not peer-to-peer / lockstep.** The sim uses `Math.random` and floating point in
  many places (AI, spawns, scatter) and carries a lot of state; lockstep would need a
  deterministic, fixed-point rewrite. WebRTC also needs signalling and TURN anyway.
  A relay that *is* the host is the smallest thing that works.
- **Transport.** `ws` (WebSocket) with JSON messages. Binary/delta encoding comes later
  (R-084) once the message shapes settle. TCP head-of-line blocking is acceptable for a PvE
  game at 20 Hz snapshots; unreliable WebRTC DataChannels are a possible later upgrade.
- **Rooms.** A 4-letter code; 1 to 4 players; the first to join is the host (starts the
  game, can kick). Late joiners may drop in between waves.

### Protocol (JSON, `src/net/protocol.js`)

| dir | message | payload |
|-----|---------|---------|
| C→S | `join` | `{room?: "ABCD", name}` (no room: create one) |
| C→S | `pick` | `{wizard, role}` while in the lobby or between waves |
| C→S | `ready` | `{ready: bool}` |
| C→S | `start` | host only, once everyone is ready |
| C→S | `input` | `{seq, move:{x,z}, aim:{x,z}, actions:[...]}` at ~30-60 Hz |
| C→S | `leave` | |
| S→C | `welcome` | `{you: "p2", room, players:[...]}` |
| S→C | `lobby` | `{players:[{id,name,wizard,role,ready,host}], phase}` |
| S→C | `snap` | `{tick, t, state, events, ack}` every 3 ticks (20 Hz) |
| S→C | `error` | `{code, message}` (`room_full`, `no_room`, `bad_message`...) |

`state` is the sim's JSON-safe state (`snapshotState`); `events` are every sim event since
the last snapshot, so the existing renderer, HUD and audio (which all consume events)
work on the client unchanged. `ack` is the last input `seq` the server applied (used by
client prediction later).

## 2. Sim changes (R-080)

The sim assumed one `s.player` in ~100 places. It becomes `s.players` (1 to 4):

- Every per-player routine takes the player (`cast(s, p, ...)`, `heal(s, p, ...)`,
  `updatePlayer(s, p, ...)`); events carry the player's `id` instead of the literal
  `'player'`. A "current caster" (`s.who`) covers helpers called from shots, areas and
  decoys (drain heal, friendly fire).
- `step(s, inp, dt)`: `inp.players = {id: {move, aim, actions}}`. The legacy
  `{move, aim, actions}` shape still drives player 0, and `createGame` keeps `s.player`
  as an alias, so single-player (and the current renderer) is unchanged. A golden
  digest test pins single-player behaviour.
- **Enemies** target the nearest living player (doubles still draw the eye first).
  Spawn gates are chosen far from the party. Waves scale with party size:
  HP x(1 + 0.4(N-1)), enemy count x(1 + 0.5(N-1)).
- **Downed, not dead.** At 0 HP a player is downed; a living ally standing within 1.8 m
  revives them in 3 s (40% HP, 1.5 s invulnerable). The wave clear also gets everyone up.
  The run ends (`mode: 'dead'`) only when all players are down.
- **Friendly fire.** Hazards that say "you too" (`hitsAll`, barrels) hit everyone;
  your own explosions hurt you at the old rate and allies at half (`TUNING.friendly`).
  Healing fields and wards work for anyone standing in them.
- **No co-op pause, no hit-stop.** One player's combo must not freeze the others' world.
- Seedable RNG (`seedRandom`) so tests and replays are reproducible.

## 3. Server (R-081, `server/`)

- `server/room.js`: pure room logic (lobby, ready, pick, host, join/leave mid-game, input
  buffering, tick loop, snapshot cadence). No sockets, so it is unit-testable with a fake
  clock.
- `server/index.js`: `ws` server; `npm run server`. Per-connection rate limiting and
  message validation (size, shape, element/wizard/role whitelist); input is clamped
  (`|move| <= 1`, aim within the court, at most N actions per message) because the server
  trusts nothing from the page.
- A room ticks only while it has players, and is destroyed 30 s after the last leaves.
- Dev: Vite proxies `/ws` to the server; prod: one process serves `dist/` and the socket.

## 4. Client (R-082, R-083)

- `src/net/client.js`: connect, join/lobby, send inputs, receive snapshots. Applies a
  snapshot to a local `game` object the renderer already understands, with `game.player`
  = the local player.
- Entity interpolation: render the world ~100 ms behind the latest snapshot, lerping
  positions of enemies, shots and remote wizards between the two surrounding snapshots.
- Lobby screen (room code, names, wizard/role pick, ready), then the existing HUD plus a
  party strip (HP/energy of each wizard), revive progress rings, a scoreboard on defeat.
- `render.js` gets one wizard rig per player (today a single `pv`), plus name tags in
  the player's colour; the camera frames the party (centroid, zoom with spread).

## 5. Polish (R-084)

Client-side prediction for the local wizard's movement (reconcile with `ack`), snapshot
deltas and quantised numbers (target < 8 KB/s per client), reconnect with the same id for
30 s, ping display, server-side per-player stats (damage, revives) for the end screen,
`wss://` deployment notes.

## 6. Risks

- **Snapshot size.** 4 players, ~40 enemies, shots and areas as JSON at 20 Hz is roughly
  15-30 KB per snapshot; fine on broadband, wasteful on mobile. Deltas in R-084.
- **Renderer assumes one player** (`pv`, camera, HUD). R-083 is the biggest client task.
- **Balance.** Party scaling numbers are a first guess; tune after playing.
- **Spell effects that target "you"** (self-damage rules) were designed for one wizard;
  co-op treats allies as bystanders unless a rule above says otherwise.

## 7. Order of work

1. R-080 sim for N players, with the single-player digest unchanged. (first)
2. R-081 room logic + `ws` server + protocol validation, tested with real sockets.
3. R-082 client networking and lobby.
4. R-083 multi-wizard rendering, party HUD, camera.
5. R-084 prediction, deltas, reconnect.
