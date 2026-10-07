# Magical World

Grauhold Reach: a 2D top-down spellcasting action game (element combos, six zones,
three bosses). Story and requirements: `story/STORY.md`. Game data: `data/`.
Design mockups: `story/design/`.

A Godot 4 project (GDScript) with a headless dev harness for verifying changes
without opening the editor.

## Requirements

- Godot 4.3 or newer, on PATH as `godot4`, `godot` or `godot-headless`
  (or set `GODOT=/path/to/godot`).
- bash (Linux/macOS, or Git Bash/WSL on Windows).

## Playing

Open the project in Godot and run it (F5). Menu -> New Game / Continue -> overworld with the six zones.
Arrows move, **1-9** queue an element (order of `data/spells.json`: fire, water, earth, nature, lightning,
ice, wind, light, dark), **Space** casts the queued pair, **Esc** leaves a zone, **Enter** continues after a
result. Stepping on a gold tile opens a cache. Completing a zone autosaves. Collect three rune fragments
(pine cache, the Warden of the Keep, the Cinder Colossus) and the Hollow Warden can finally be hurt.

## Harness

All commands run from anywhere; the script switches to the project root.

```bash
harness/run.sh check           # parse every .gd file under res://
harness/run.sh boot            # boot the project headlessly, fail on engine errors
harness/run.sh test            # run all tests in tests/
harness/run.sh test player     # run only test files whose name contains "player"
harness/run.sh reqs            # every active/done requirement in story/STORY.md has a test
harness/run.sh story           # run tests, regenerate story/progress.md
harness/run.sh shot menu /tmp/a.png   # render a real frame (needs xvfb-run); also overworld, zone:<id>
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
check_all: 3 scripts, 0 failed
Magical World booted
boot: ok
PASS  test_example.gd::test_main_scene_loads
PASS  test_example.gd::test_arithmetic_sanity
tests: 2 passed, 0 failed
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

Create `tests/test_<name>.gd`. Every method starting with `test_` is run.

```gdscript
extends "res://harness/test_case.gd"

var player

func before_each() -> void:
	player = load("res://scenes/player.tscn").instantiate()

func test_starts_with_full_health() -> void:
	assert_eq(player.health, 100, "initial health")
```

Available assertions: `assert_true(cond, msg)`, `assert_eq(actual, expected, msg)`,
`assert_not_null(value, msg)`.

Notes:
- Extend the base by path, not `class_name`; the class cache isn't built in headless runs.
- Each test method gets a fresh instance, and `before_each()` runs first.
- `tree` is the running `SceneTree`, useful for adding nodes. Free anything you instantiate.
- Test files must live directly in `tests/` and be named `test_*.gd`.

## Troubleshooting

- **"Godot not found"**: install Godot 4.x or export `GODOT=/path/to/godot`.
- **`check` fails on a script that looks fine**: it may depend on an autoload or
  `class_name` that isn't imported yet. Delete `.godot/` and re-run to rebuild it.
- **`boot` reports errors but the game runs in the editor**: the harness treats any
  `ERROR:` line as a failure; read the printed output above the `FAILED` line.

## Layout

```
harness/run.sh        entry point
harness/check_all.gd  parse-all-scripts check
harness/run_tests.gd  test runner
harness/test_case.gd  base class for tests
scenes/  scripts/  tests/
```

See `CLAUDE.md` for the rules agents follow when working here.
