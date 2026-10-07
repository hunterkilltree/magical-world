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

The game is Grauhold Reach (2D top-down). It follows `story/STORY.md`; design mockups are in
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
- `scripts/main.gd` is a thin view: menu -> overworld -> zone -> result -> ... -> ending. Controls: arrows move,
  Q W E R T / A S D F (or 1-9) queue an element, Space casts, Esc leaves a zone, Enter continues after a result. `scripts/level.gd` draws a grid.
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
