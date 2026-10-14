# Magical World

Godot 4 project (GDScript). Main scene: `scenes/main.tscn`.

## Verification harness

Run after every change; do not claim work is done without it passing.

```bash
harness/run.sh check          # parse every .gd under res://
harness/run.sh boot           # boot headlessly, fail on SCRIPT ERROR / Parse Error
harness/run.sh test [filter]  # run tests/test_*.gd
harness/run.sh all            # all of the above
```

Needs Godot 4.x on PATH (`godot4` / `godot`) or `GODOT=/path/to/godot`.

## Writing tests

Add `tests/test_<thing>.gd`:

```gdscript
extends "res://harness/test_case.gd"

func test_something() -> void:
	assert_eq(2 * 2, 4)
```

Extend by path, not `class_name` (class cache is not built in headless runs).
Each `test_*` method gets a fresh instance; `before_each()` runs first and
`after_test()` last (free any nodes you create); `tree` is the running SceneTree.

## Conventions

- Keep all work inside `res://`; scripts in `scripts/`, scenes in `scenes/`.
- Prefer editing `.tscn` by hand only for small changes; verify with `boot`.

## Story-driven workflow

The game is Court of Waves (3D, Magicka-style elemental arena: endless waves in a round court). Most important: its
core mechanic is combining elements to create spells (see "Core pillar" in `story/STORY.md`). It follows `story/STORY.md`;
the design reference is the playable prototype handed off in `story/design/court_of_waves/` (play
`Court of Waves - playable.html`; rules in `reference/game/sim.js`). Game data is `data/*.json`; the gameplay numbers in
`spells.json` / `enemies.json` are final from playtesting, so do not retune them by feel. Older mockups in `story/design/`
(zones, overworld, weapons) belong to the retired Grauhold Reach campaign. Requirements are `### R-NNN [status] Title`
entries (`planned` -> `active` -> `done`; retired ones are `superseded` and ignored by the harness).

1. Pick the next `planned` requirement (lowest ID) and set it to `active`.
2. Write `tests/story/test_rNNN_<name>.gd` first; it should fail.
3. Implement until `harness/run.sh all` passes, then set the requirement to `done`.
4. When a requirement is added or changed, its test is added or updated in the same change.

`harness/run.sh reqs` fails if an `active`/`done` requirement has no test.
`harness/run.sh story` regenerates `story/progress.md` (never edit it by hand).
A Stop hook (`.claude/settings.json`) runs `harness/run.sh all` and blocks
finishing while it fails; it is skipped if Godot is not installed.

## Git

Every session uses its own meaningful branch name describing the work
(e.g. `feature/story-requirements-harness`, `fix/player-diagonal-speed`), never
a random or auto-generated name.

## Code layout

- `scripts/core/`: pure game logic (RefCounted, no scene tree) so it is testable headlessly:
  `arena_sim` (the whole fight, a line-for-line port of the prototype's sim.js: `step(input, dt)` at a fixed 60 Hz returns
  events; positions are `Vector2(x, z)` on the ground; facing angle `face` points along `(sin, cos)`; every element reaction
  is in `_apply_payload`, keep it that way), `spell_book` (data/spells.json: queue of 3, fire/ice cancel, resolve order,
  payloads, cost, colour), `enemy_types` (data/enemies.json, `wave_roster(n, rng)`), `wizard_roster` (data/wizards.json:
  the six wizards' looks; cosmetic only), `controls` (InputMap install, event -> sim action).
- Ten elements (R-050 to R-054): the handoff's six plus nature/wind/light/dark from the original Grauhold Reach list
  (keys 7, 8, 9, 0). The handoff's own spell numbers are untouched; the new elements, combos (74 in all; every pair and
  double has one) and enemy resists for them are our own tuning, not playtested. Combo keys that add status to a
  payload are listed in `SpellBook.DEF_PAYLOAD`; area extras (`heal`, `swallow`, `repeat`/`interval`/`scatter`,
  `leaves`), wall extras (`regen`, `reflect`) and the `beam` shape live in `arena_sim.gd`. Adding a spell is one
  `combos` entry in `data/spells.json`; `test_r050` fails if a legal pair or double has none.
- Effects matrix (R-055 to R-059): `story/design/COMBINATIONS_AND_EFFECTS_SUMMARY.md` mapped onto our spells
  (50 px = 1 m, seconds as given, cooldown x0.3 as the spell's own recharge via `ArenaSim.recharge_key`). Handoff pairs
  keep their spells; displaced matrix spells live on doubled three-element keys. New statuses in `ArenaSim.Status`
  (stun, silence, weaken, inaccurate, confuse, slow_pct; player armor, reflect, invuln) and `Body.revives`; enemy hits go
  through `_enemy_hits` (confusion, weaken, miss, reflect). Looks per area are `def.visual` in `spells.json`, drawn by
  `scripts/vfx/matrix_visuals.gd`. `harness/run.sh shot matrix OUT` shows them.
- `scripts/vfx/` (VFX handoff): `vfx_director` (port of vfx.js +
  wow.js), `vfx_particles` (MultiMesh smoke/spark pools), `lightning_bolt`, `screen_fx`, `vfx_textures` (painted in
  SubViewports; build gradients before painting, or they draw white). Combo casts freeze time briefly (sim `hitstop`). Use the `elemental-vfx` skill (`.claude/skills/elemental-vfx/`) when making or
  reviewing effects.
  Every particle look is the director's (R-060): `ArenaView.consume` only adds text, corpses, shake, rings and
  geometry, never one-shot bursts. Timing helpers: `_after(delay, fn)` (overlap, delayed secondaries),
  `stragglers`, `jet` (splash secondary), `magic_motes` / `_mote_opts` (per-element drift); `shell(..., squeeze)` anticipates.
  R-065: wind is never drawn bare, only by what it carries (`wind_carry`: dust in one curl); `hit_resolve` gives each
  element its after-burst on projectile hits; a combo's second element bursts a beat after the first (blast, cone).
  `particles.trace = []` logs every spawn for tests.
- `scripts/audio/sfx.gd` (R-061): recorded clips for sim events, keyed in `data/sfx.json` (takes, dB, pitch range,
  throttle, SFX/UI bus, positional, `len`/`offset` for long loops); `ROUTED` lists the event types with a sound and the
  manifest's `silent` the rest (`test_r061` fails on a new event type that is in neither). Queue pings and combo chords
  pitch one bell clip to the element's note (`NOTE`). Clips are Kenney CC0 in `audio/sfx/` (`audio/CREDITS.md`); after
  adding clips run `godot --headless --path . --import` and commit their `.import` files. Volume and mute live in
  `user://settings.cfg`. `sfx.trace = []` logs plays for tests.
- `scripts/arena/`: the 3D view, which only reads the sim. `arena_view` (court, props, entity sync, telegraphs, particles,
  lightning, Label3D damage numbers, camera FOV 40 at (0, 13.5, 12.5) leaning 15% to the cursor, pillar fade, mouse ray to
  y = 0), `wizard_model` (port of wizard-rig.js: rigged legs, gait blend, `animate` plants the soles on y = 0),
  `enemy_model` (thrall/bulwark/hexcaller silhouettes, walls, hit/freeze/burn tint), `hud` (CanvasLayer: bars, queue
  slots, spell preview, cooldown tiles, statuses, toasts, enemy health bars + pips, menu/pause grimoire/death screens;
  R-062: one `Theme` on `root` dresses every panel/button/bar/slider, so don't add stylebox overrides except for
  element-coloured pieces (queue orbs use `theme_type_variation = "Orb"`); bars drain through a ghost (`_drain`),
  cooldowns are `RadialTile`s, animation is stepped in `update(dt)` rather than Tweens so `tick()` drives it;
  R-063: enemy bars drain through `enemy_ghost`),
  `mesh_kit` (primitives that follow three.js conventions: torus in XY, circle facing +Z, XYZ Euler order).
- Indicators (R-063): telegraphs have a faint outline (`m2`, pulses in the last 0.2 s, `tele_d["pulse"]`) and a fill
  (`m`, `parts["fill"]`) that grows over the windup; `ArenaView.text(..., key)` stacks numbers for the same target
  within 0.25 s; director callouts step older ones up; `ArenaView.ret_dim` dims the reticle when the queued spell
  can't be cast (energy or `ArenaSim.recharge_key` timer).
- Atmosphere (R-064): procedural night sky (`env.sky`), brazier lights driven by `FastNoiseLite` (no per-frame
  `randf()` flicker), `ArenaView._ambient_life` (brazier embers, dust motes, puddle ripple rings; keep it under a
  tenth of the particle pools), gate `banners` (`shaders/banner.gdshader`: a wave travels down, pinned at the top)
  and a faint turning `floor_rune` (keep it faint so it never reads as a spell ring).
- `scripts/main.gd` is the thin shell: `_unhandled_input` -> action queue, `_physics_process` steps the sim, `_process`
  renders; `tick(dt, input)` does one frame without the engine loop (tests, screenshots). Menu -> play -> dead -> R.
  Controls: WASD move, mouse aims, 1-6 queue, LMB cast (hold = recast), RMB/E around you, F self, Space dodge, X clear,
  Esc pause, R restart, M mute (volume slider on the pause screen).
- `harness/run.sh shot WHAT OUT [WIZARD]` renders a real frame (WHAT = menu | play | demo | pause | dead | live; uses
  xvfb-run when present, else the desktop). Look at it after visual changes. `live` runs the real engine loop for 5 s.
  `run.sh test` fails on any `SCRIPT ERROR` in the output (runtime errors inside tests only log).
- Rendering is Compatibility: glow bleeds over the whole frame and tonemap white is ignored, so keep lights and
  emission low enough that nothing clips. Headless runs have a 64x64 viewport, so never assume window-size pixels in tests.
- Nodes added to the root during a `--script` run get `_ready` late; scenes under test expose `start()` instead.
- Avoid lambdas that capture an object which owns the signal's emitter (reference cycle -> leak warnings at exit).
- `tests/support/arena_fixture.gd` (quiet sim, ticking helpers), `main_fixture.gd` (the real main scene in play mode),
  `arena_bot.gd` + `test_r049_bot_clears_waves.gd`: a bot (kite, Torrent then Arc, Thunderflare at range, dodge
  telegraphs, avoid puddles when it would cast lightning) clears wave 3 in about 53 s of game time with no self-damage
  (seed 11). Re-run it after any rules change. Not playtested by a human.
- `run_tests.gd` waits one frame before running, so the root is live (nodes added to it get `_ready`, Tweens step).
- `hvitmark_tundra/` is a separate Godot project (its own `project.godot`, harness, tests): the Hvitmark Tundra prototype, built in
  milestones. Run its checks with `hvitmark_tundra/harness/run.sh all`. The main harness's `check_all.gd` skips nested projects
  (any folder containing a `project.godot`). It is deliberately independent of the Court of Waves code (different spell model).
