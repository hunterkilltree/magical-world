# Magical World

Court of Waves: a 3D elemental arena game in the style of Magicka. Queue up to three of ten
elements, cast, and the mix decides the spell; survive endless waves of thralls, bulwarks and
hexcallers. Story and requirements: `story/STORY.md`. Game data: `data/`. Design reference (the
playable prototype and its source): `story/design/court_of_waves/`.

A Godot 4 project (GDScript) with a headless dev harness for verifying changes
without opening the editor.

## Requirements

- Godot 4.3 or newer, on PATH as `godot4`, `godot` or `godot-headless`
  (or set `GODOT=/path/to/godot`).
- bash (Linux/macOS, or Git Bash/WSL on Windows).

## Playing

Open the project in Godot and run it (F5). Pick one of the six wizards and enter the court.

| Input | Action |
|-------|--------|
| W A S D | Move |
| Mouse | Aim |
| 1 - 0 | Queue fire, water, ice, lightning, earth, arcane, nature, wind, light, dark (up to three; fire and ice, light and dark cancel) |
| Left click | Cast at the cursor (hold to recast the last spell) |
| Right click / E | Cast as an area around you |
| F | Cast on yourself |
| Space | Dodge roll (no direct hits land; burning still does) |
| X | Clear the queue |
| Esc | Pause (shows the grimoire of spells you have found) |
| R | Restart when paused or fallen |

74 spells: every pair and double of the ten elements has one (Supernova, Tsunami, Black Hole,
World Tree, Photon Railgun, Wildfire, Fire Tornado...), plus ten three-element spells (Meteor
Shower, Absolute Zero, Heaven's Lance, Maelstrom...). Three of a kind powers up the double.
Elements react: soak enemies, then hit them with lightning for double damage; freeze them and
shatter them with earth; root wet enemies with nature and burn them hotter; fan flames with wind;
curse with dark and purge with light; light the dry brush; blow up the rune barrels. Careless
casting hurts you.

## Harness

All commands run from anywhere; the script switches to the project root.

```bash
harness/run.sh check           # parse every .gd file under res://
harness/run.sh boot            # boot the project headlessly, fail on engine errors
harness/run.sh test            # run all tests in tests/
harness/run.sh test player     # run only test files whose name contains "player"
harness/run.sh reqs            # every active/done requirement in story/STORY.md has a test
harness/run.sh story           # run tests, regenerate story/progress.md
harness/run.sh shot demo shot.png   # render a real frame (desktop or xvfb-run); also menu, play, pause, dead, live
harness/run.sh all             # check, boot, reqs, story (default)
```

`all` stops at the first failing step. Exit code is non-zero on any failure,
so it works in CI and git hooks.

| Command | What it catches |
|---------|-----------------|
| `check` | Syntax errors, scripts that fail to load |
| `boot`  | Runtime errors during startup (`SCRIPT ERROR`, `Parse Error`, `ERROR:`) |
| `test`  | Behaviour regressions in your own tests |

On a fresh checkout the first run does a one-time `--import` to build `.godot/`.

### Example output

```
check_all: 58 scripts, 0 failed
boot: ok
reqs: 30 requirements, 0 missing tests
PASS  story/test_r037_spell_book.gd::test_...
...
tests: 180 passed, 0 failed
```

## Story and requirements

The game is built from `story/STORY.md`: a premise plus requirements written as
`### R-NNN [planned|active|done] Title`. To build one: set it `active`, add
`tests/story/test_rNNN_<name>.gd` (test first), implement, run
`harness/run.sh all`, then set it `done`. `story/progress.md` is generated from
the test results; don't edit it.

A Claude Code Stop hook (`.claude/settings.json`) runs `harness/run.sh all` and
refuses to let an agent finish while it fails (skipped if Godot isn't installed).

## Writing tests

Create `tests/story/test_rNNN_<name>.gd` for a requirement (or `tests/test_<name>.gd`). Every method
starting with `test_` is run.

```gdscript
extends "res://harness/test_case.gd"

const M := preload("res://tests/support/main_fixture.gd")

var main

func before_each() -> void:
	main = M.make(tree) # the real main scene, in play mode

func after_test() -> void:
	main.free()

func test_the_wizard_starts_at_full_health() -> void:
	assert_eq(main.sim.player.hp, main.sim.player.max_hp, "initial health")
```

Available assertions: `assert_true(cond, msg)`, `assert_eq(actual, expected, msg)`,
`assert_not_null(value, msg)`.

Notes:
- Extend the base by path, not `class_name`; the class cache isn't built in headless runs.
- Each test method gets a fresh instance, and `before_each()` runs first.
- `tree` is the running `SceneTree`, useful for adding nodes. Free anything you instantiate.
- Test files live anywhere under `tests/` (searched recursively) and are named `test_*.gd`.
- Helpers: `tests/support/arena_fixture.gd` (a quiet sim), `main_fixture.gd` (the real main scene), `arena_bot.gd`.

## Troubleshooting

- **"Godot not found"**: install Godot 4.x or export `GODOT=/path/to/godot`.
- **`check` fails on a script that looks fine**: it may depend on an autoload or
  `class_name` that isn't imported yet. Delete `.godot/` and re-run to rebuild it.
- **`boot` reports errors but the game runs in the editor**: the harness treats any
  `ERROR:` line as a failure; read the printed output above the `FAILED` line.

## Layout

```
harness/              run.sh (entry point), check_all.gd, run_tests.gd, test_case.gd, screenshot.gd, reqs.sh
scenes/main.tscn      the game
scripts/core/         pure game logic (the sim, spell book, enemy types, controls)
scripts/arena/        the 3D view, models and HUD
scripts/vfx/          the VFX director, particle pools, wave, lightning, screen effects
scripts/audio/        sound effects
shaders/  data/  audio/sfx/
tests/story/          one test file per requirement; tests/support/ fixtures and the bot
story/                STORY.md (requirements), IMPROVEMENT_PLAN.md (open issues), design/ (the handoff)
```

See `CLAUDE.md` for the rules agents follow when working here.
