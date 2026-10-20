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
`spells.json` / `enemies.json` are final from playtesting, so do not retune them by feel. Requirements are `### R-NNN [status] Title`
entries (`planned` -> `active` -> `done`; retired ones are `superseded` and ignored by the harness). Open ideas and
known issues not yet turned into requirements are in `story/IMPROVEMENT_PLAN.md`.

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
  payloads, cost, colour; per-wizard books, below), `enemy_types` (data/enemies.json, `wave_roster(n, rng)`),
  `wizard_roster` (data/wizards.json: the six wizards' looks), `controls` (InputMap install, event -> sim action).
- Wizard spell books (R-067, R-068): single elements are shared, but every two/three-element mix makes the caster's own
  spell. `data/spells.json` is the court book; `data/schools.json` holds each wizard's school (name, motto, `signature`,
  `combos`): 350 spells, and each court combo is kept unchanged by exactly one wizard (the one with no entry for it).
  `SpellBook.book(id)` / `resolve(queue, id)` / `grimoire(id)`; `""` is the court book. School spells cast, recharge and
  are found under `mix@wizard` keys (so the director's `_sig` signatures, keyed by court mixes, skip them: they draw from
  shape, elements and `def.visual`). The sim casts from `player.book` (set from the wizard; `_on_pick` sets both); the
  test fixtures (`arena_fixture`, `main_fixture`) use the court book so the court's spells stay tested, and the R-049 bot
  plays Brann (who keeps Thunderflare). School numbers are held by `tests/support/spell_bench.gd` (five still, tough
  dummies): damage per energy = the court's rate for the shape x how hard the elements hit (`Bench.target`); walls hold
  the court's median health. After changing a school spell, `godot --headless --path . --script
  res://harness/calibrate_schools.gd` prints the `mult` it needs. A school field must not both burn and root.
- School looks (R-070, after Cunningham's elemental magic): each school's `look` in `schools.json` (`sigil`, `motif`,
  `tint` = the wizard's glow). `scripts/vfx/school_looks.gd` holds the recipes the director calls: the school's circle
  in place of the court rune for every multi-element cast (and on the queue, new-spell, area and nova stamps), the
  motif on the staff, along shots, beams and cones and where spells land, and `quarters` (every combo, any book: earth
  and nature north, air east, fire and light south, water and ice west, arcane and dark at the heart). Circles are
  painted in `vfx_textures.sigil(kind)`. `SpellBook` leans every combo in a wizard's book 35% toward the tint; single
  elements and the court book (`""`, so the old VFX tests) are unchanged. Motes carry `o.tag` (`school:<motif>`,
  `quarter:<el>`) for tests; `director.last_sigil` names the last circle. `harness/run.sh shot schools OUT` (SHOT_MIX,
  SHOT_FRAMES) renders one mix cast by all six wizards side by side.
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
  R-066: Tsunami / Torrent draw a curling wave sheet (`scripts/vfx/wave_sheet.gd` + `shaders/wave_sheet.gdshader`,
  cartoon water: deep blue, streaked face, foam lip), driven by `ArenaView`'s director `wave()`; the pool spreads in after.
  `harness/run.sh shot wave OUT` (SHOT_FRAMES env picks the moment) shows it.
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
  Controls: WASD move, mouse aims, 1-9 and 0 queue, LMB cast (hold = recast), RMB/E around you, F self, Space dodge, X clear,
  Esc pause, R restart, M mute (volume slider on the pause screen).
- `harness/run.sh shot WHAT OUT [WIZARD]` renders a real frame (WHAT = menu | play | demo | pause | dead | live; uses
  xvfb-run when present, else the desktop). Look at it after visual changes. `live` runs the real engine loop for 5 s.
  `run.sh test` fails on any `SCRIPT ERROR` in the output (runtime errors inside tests only log).
- Rendering is Compatibility: glow bleeds over the whole frame and tonemap white is ignored, so keep lights and
  emission low enough that nothing clips. Headless runs have a 64x64 viewport, so never assume window-size pixels in tests.
- Nodes added to the root during a `--script` run get `_ready` late; scenes under test expose `start()` instead.
- Avoid lambdas that capture an object which owns the signal's emitter (reference cycle -> leak warnings at exit).
- `tests/support/arena_fixture.gd` (quiet sim on the court book, ticking helpers), `main_fixture.gd` (the real main scene
  in play mode, court book until a wizard is picked), `spell_bench.gd` (damage per energy on still dummies),
  `arena_bot.gd` + `test_r049_bot_clears_waves.gd`: a bot (kite, Torrent then Arc, Thunderflare at range, dodge
  telegraphs, avoid puddles when it would cast lightning) clears wave 3 in about 53 s of game time with no self-damage
  (seed 11). Re-run it after any rules change. Not playtested by a human.
- `run_tests.gd` waits one frame before running, so the root is live (nodes added to it get `_ready`, Tweens step).

## Web port co-op (R-080 to R-084)

The browser port (`src/`, Vite + three.js) has online co-op for up to four wizards; plan in `story/COOP_PLAN.md`.
- `src/game/sim.js` runs 1-4 players (`createCoopGame`, `addPlayer`, `removePlayer`, `step(game, {players: {id: input}}, dt)`);
  `game.player` is the local wizard. Single-player is pinned by `tests/web/golden/` (seeded digests): re-record only on purpose
  (`node tests/web/support/record_golden.mjs`).
- `server/` is the authoritative room server (`npm run server`, port 8787, path `/ws`; it also serves `dist/`).
  `src/net/`: `protocol.js` (validation), `snapshot.js` (state <-> JSON), `client.js` (browser socket, `forMe`), `interp.js`
  (snapshot buffer, ~100 ms behind). Dev: `npm run server` + `npm run dev` (Vite forwards `/ws`).
- Web tests: `tests/web/*.test.mjs` (node:test), `harness/run.sh web`; `reqs`/`story` count them. `npm` fails inside Git Bash
  on this machine: run npm from PowerShell.
- Spell forms (R-088): `src/game/forms.js` holds twelve named three-element mixes (mines, storms, sprays, arcs) merged into `COMBOS` in `spells.js`; the sim knows them as options on existing shapes (area+`mine`, area+`repeat`, cone+`channel`, chain+`forks`). Not in `data/spells.json`.
- Campaign (R-090+, plan in `story/CAMPAIGN_PLAN.md`): content is engine-neutral JSON in `data/campaign.json`, validated by `src/game/campaign.js` (`loadCampaign` throws a `CampaignError` naming every problem). `createCampaignGame` runs a chapter in the sim (`game.campaign`: phase, checkpoint, retries); quick play has no `campaign` and is unchanged. Chapter difficulty is the existing wave scaling from `waveStart`; never edit `enemies.json` for it. Play a chapter with `?c=prologue`.
- Profile (R-091): `src/game/profile.js` keeps the player's earnings (unlocked elements and wizards, grimoire pages, cleared chapters, best wave and score per wizard) in `localStorage` key `cow_profile` as versioned JSON. Nothing in it throws; an unreadable or newer save is backed up to `cow_profile.backup*` before a fresh profile is saved. `createProfileStore()` saves on every record; main.js records at the end of a run, on abandon, on `pagehide` and on `chapterClear`.
- Unlocks (R-092): `chapter.elements` (computed in `loadCampaign`) is what a chapter may queue; `queueEl` refuses the rest with a `locked` event and cancels nothing. `circle` in `data/campaign.json` is who starts; `wizardsAvailable()` adds profile unlocks. Quick play has no `campaign`, so everything is open.
- Objectives (R-093): `chapter.objective` is `survive`, `hold` (a decoy with `objective: true`; `targetOf` sends every enemy to it), `burn` (an env prop in `props.targets`, lit only by fire) or `escape` (a clock and an exit ring). `setupObjective` builds them at `begin` and on every rewind; `updateObjective` runs each step; `objectiveFail` is a wipe (`wipeOut`). While `campaign.holding` the waves are done and only the objective is left. Defaults and validation live in `normalizeObjective` (campaign.js); braziers, cross and circle throw in `createCampaignGame` until built.
- Story (R-094): text lives in `data/story/en.json` and `vi.json` (a string, a list of lines, or a card `{speaker, title, text[]}`), looked up by `src/game/story.js` (`createStory`: fallback to English; `bark(wizard, n)` is deterministic). Cards are keyed `<chapter id>.briefing` / `.ending`, titles `<id>.title`, lines `bark.<wizard id>` and `bark.any`. `hud.js` shows the card (`showStory`) and the bark; a campaign chapter waits for its briefing card. Add every key to both files; the Vietnamese is a draft for native review.

- Showcase signatures (R-089): `src/game/signature-fx.js` ports the rest of the fx-showcase (afterimages, great spire, missiles, chain yank, prison, Magma Crush lava, Hurricane Eye, Arc Plasma burst); `arena-fx.js` calls it from sim events. Tests stub the effects layer (`tests/web/test_r089_signature_fx.test.mjs`).

## Web port quality and phones (R-110, R-111)

Browser port only; the Godot game is untouched.
- `src/game/quality.js` is pure (no three, no DOM) and holds everything testable: `PROFILES` (`minimal` < `low` < `medium` < `high`;
  `high` is the old look), `pickTier` (the first guess from `?q=`, the saved menu choice, memory, cores, the GPU name, phone), `pixelRatioFor`,
  `createGovernor` (drops a tier under ~40 fps and never returns to a tier that was too slow; climbs after 20 s of steady 57 fps, up to the
  device ceiling), `createFaultGuard` (frame throws: retry, lower the tier, stop), `createSafeRunner` (an optional layer that throws three times
  is switched off), `safeGet`/`safeSet` (storage never throws). Numbers in `PROFILES` are our tuning, not measured on real weak hardware.
- `render.js` applies a tier in `applyQuality`: render ratio and pixel budget (`resize`), shadow map size, bloom, how many point lights stay lit
  (`applyLights`: about 17 exist, and each lit pixel pays for them; lights are only toggled on a tier change or an arena rebuild, never
  while playing, because a changed count recompiles every lit material), particle caps/density (`Particles.setLimit`) and `fx2.budget`.
  `antialias` is off on purpose: the scene goes through the composer's targets, so MSAA on the canvas smooths nothing. A lost WebGL context pauses the run.
  New optional effect code should be called through `safe.run(name, fn)` in `render.js`.
- `main.js` owns the loop: `try`/`catch` per frame, the governor, a frame cap (30 fps on `minimal`, 60 on a phone), the Graphics row
  (`hud.js`, saved as `cow_quality`). `fatal.js` draws the "cannot run" card. `?q=minimal|low|medium|high` forces a tier and turns the governor off.
- Phones: `touch.js` (pure maths + `createTouchControls`) feeds the same `move`/aim the keyboard does; `input.js` ignores touch pointers for
  the mouse aim. `?touch=1` / `?touch=0` forces touch mode; the HUD layout is the `body.touch` block at the end of `styles.css`.
  `window.__arena.quality` and `.view` (with `.scene`, `.setQuality`) are the test hooks. Touch cannot be simulated with mouse clicks:
  dispatch `PointerEvent`s with `pointerType: 'touch'`.

## Web port weapons (R-112)

- `src/game/weapons.js` (pure): `WEAPONS` (24: 13 steel, 11 with an element, seven `FAMILIES`), `WIZARD_WEAPON` (each wizard's own),
  `nextWeapon`, `weaponSpell(id)` (a cached spell-shaped hit: `parts.steel` + the element's part and statuses, `blunt`). The numbers are our
  own tuning, not playtested; never retune `spells.json`/`enemies.json` for weapons.
- Sim: `player.weapon`, `wcd`/`wcdMax` (cooldown), `swing` (wind-up, like `wind` for spells), `swingT`/`swingMax` (follow-through, for the
  view). Actions `attack`, `reattack` (held), `weapon:next|prev|<id>`. `attack` -> `swing` event -> `blow` (melee: arc test like `CAST.cone`,
  bulwark shields halve a frontal blow; ranged: `kind: 'bolt'` shots with `weapon: id`, which end in `weaponImpact`, never `impact`).
  Spells and weapons exclude each other while winding up. `applyPayload` treats a `steel` part on a frozen target with `pl.blunt` like earth
  (shatter). Runs that never attack are unchanged (golden digests).
- View: `weapon-models.js` (primitives; grip at the origin, pointing +Y; projectiles fly +Z; templates cloned), `render.js` `weaponPose`
  (free hand, from the sim's swing state so co-op matches), `weaponTrail`, weapon shots in `syncShots`. `vfx.js`/`arena-fx.js` skip weapon
  shots' spell trails. Keys Q / middle click, C / Z; phone: the Weapon tile by the Cast pad and the ⇄ chip; menu Armory row, `?k=`.
  Co-op: `protocol.js` accepts the actions, `snapshot.js` rebuilds `weapon:` keys from the armory.
