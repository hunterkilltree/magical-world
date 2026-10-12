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

The game is Grauhold Reach (2D top-down). Most important: it is a top-down ARPG whose core mechanic is combining
elements to create spells (see "Core pillar" in `story/STORY.md`). It follows `story/STORY.md`; design mockups are in
`story/design/` (reference only), game data in `data/*.json` (extracted from them). Requirements are `### R-NNN [status] Title`
entries (`planned` -> `active` -> `done`).

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

- `scripts/core/`: pure game logic (RefCounted/Node2D, no scene tree needed) so it is testable headlessly:
  `zone_grid` (tiles, gates, loot, terrain), `element_queue`/`spell_book`/`caster` (all seven spell types; see its header), `health`, `enemy`, `boss` (data/bosses.json; the final boss needs the three rune fragments to be damageable and triggers the ending), `campaign` (route graph), `save_game` (JSON save: completed zones, looted caches, inventory), `mover`, `zone_run`, `zone_play` (one zone in play: wizard, thralls, boss, objective, spells, gates, cast effects), `wizard_roster` (data/wizards.json), `controls` (key bindings), `draw_util` (shadows, health bars), `health` (shield/regen/invulnerability), `game_session` (campaign + save + zone entry).
- `scripts/main.gd` is a thin view: menu -> overworld -> zone -> result -> ... -> ending. Controls: arrows or left-click move,
  the wizard faces the mouse, Q W E R T / A S D F (or 1-9) queue up to five elements, Space or right-click casts, Esc leaves a zone, Enter continues after a result. `scripts/level.gd` draws a grid.
  Save file: `user://savegame.json` (autosaved when a zone completes).
- `harness/run.sh shot WHAT OUT` renders a real frame under Xvfb (WHAT = menu | overworld | zone:<id>); look at it
  after UI changes. `run.sh test` fails on any `SCRIPT ERROR` in the output (runtime errors inside tests only log).
- Nodes added to the root during a `--script` run get `_ready` late; scenes under test expose `start()` instead.
- Avoid lambdas that capture an object which owns the signal's emitter (reference cycle -> leak warnings at exit).
- Data patch: the design's `keep` court was sealed (the boss pad was unreachable). `data/zones.json` row 12,
  columns 11-12 were opened (`#` -> `.`) beside the court gate; `story/design/` still shows the original.
- Pine note: the north-east cache is reachable in 30 steps whether or not the log pile (`D`) is burned, so
  "burn it or go the long way" is not reflected in the grid; the pine gates are not needed for the objective.
- `tests/support/bot.gd` + `test_r026_whole_game.gd`: a bot (playing Brann) beats all six zones and the ending
  through GameSession/ZonePlay, kiting bosses and using shield/regen/invulnerability spells. It keeps the game
  provably beatable (about 10 s keep, 20 s volcano, 40 s final boss at last run). Balance knobs: boss health and
  damage in `data/bosses.json` (6000 / 10000 / 18000 hp), the 0.8 s global cooldown in `caster.gd`. Without the
  global cooldown the bot burst 4000 damage in a second. Boss tests use the boss's own max health, so retuning
  needs no test edits; re-run the bot test to check the game is still beatable. Not playtested by a human.
- Presentation (Magicka-inspired, R-027 to R-030): `scripts/hud.gd` (element bar, queue slots, spell preview), `effects_view.gd`
  (circles, beams, floating numbers), `level.gd` (raised walls, tile variation). The logic they show (popups, effects,
  `queue_preview`, `cooldown_left`) lives in ZonePlay/Caster and is unit-tested; check the look with `run.sh shot ... demo`.
- Element queue bar (R-031): `ui/element_queue.tscn` + `ui/element_queue.gd` (CanvasLayer > UIBottomCenter > BackgroundFrame >
  SlotContainer > Slot1..5 > ElementIcon). `add_element("Fire")`, `clear_queue()`, `sync_queue([...])`; main mirrors the game's
  five-element queue into it. Textures are generated placeholders: `python3 tools/make_ui_placeholders.py`
  (replace the PNGs in `ui/` with real art; keep the paths). The window is 832x700: the 576 px map is pinned to the top and the
  bottom strip is the spell UI, so nothing covers the spawn tiles.
- Element combining (R-032): `ElementQueue.spell_for(elements)` is the one place a queue becomes a spell: the first two
  elements pick the recipe (exact order, else reversed, else a bolt of the first); elements 3-5 are infusions (+25% damage
  and +0.5 s cooldown each, +15% radius when the element is in the recipe). It returns a copy; cooldowns key on the base id.
  The bot only casts pairs, so infusions are extra power for a human player on top of the proven-beatable baseline.
- Mouse (R-033): `ZonePlay.move_to(point)` / `aim_at(point)`; `main.handle_zone_mouse(event, point)` routes clicks (main maps
  the cursor to a logic point with `ZoneView.screen_to_logic`). Movement stays grid-based (`Mover`), not CharacterBody2D.
- 3D view (R-034 to R-036), `scripts/view3d/`: logic stays 2D in pixels; `zone_view.gd` draws it. `mesh_kit.gd` has the
  three.js primitives (same parameters, so the design's builders port line for line) and a `Batch` that merges parts into
  one mesh per material. `zone_model.gd` ports `zone-model.js`, `wizard_model.gd` ports `wizards-model.js` (rig + gait;
  looks in `data/wizard_models.json`), `wizard_showcase.gd` is the overworld pedestal. 1 tile = 0.42 world units.
  The 2D wizard/thrall/boss nodes still live in main's hidden `_world` (ZonePlay needs them); `level.gd` is no longer
  shown. Rendering is Compatibility: glow bleeds over the whole frame there and tonemap white is ignored, so lights are
  kept low enough that snow and lava do not clip. Headless runs have a 64x64 viewport: use `ZoneView.map_rect()`,
  not pixel constants. Check the look on Windows with
  `"$GODOT" --path . --script res://harness/screenshot.gd -- zone:<id> out.png [wizard_id] [demo|cast]`.
- `run_tests.gd` waits one frame before running, so the root is live (nodes added to it get `_ready`, Tweens step).
- `hvitmark_tundra/` is a separate Godot project (its own `project.godot`, harness, tests): the Hvitmark Tundra prototype, built in
  milestones. Run its checks with `hvitmark_tundra/harness/run.sh all`. The main harness's `check_all.gd` skips nested projects
  (any folder containing a `project.godot`). It is deliberately independent of the Grauhold Reach code (different spell model).
