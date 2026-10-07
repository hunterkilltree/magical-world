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
  `zone_grid` (tiles, gates, loot, terrain), `element_queue`/`spell_book`/`caster`, `health`, `enemy`, `boss` (data/bosses.json), `campaign` (route graph), `mover`, `zone_run`.
- `scripts/level.gd` draws a grid; `scripts/main.gd` wires zone 1 (tundra). Controls: arrows move, 1-9 queue an element, Space casts.
- Data patch: the design's `keep` court was sealed (the boss pad was unreachable). `data/zones.json` row 12,
  columns 11-12 were opened (`#` -> `.`) beside the court gate; `story/design/` still shows the original.
- Pine note: the north-east cache is reachable in 30 steps whether or not the log pile (`D`) is burned, so
  "burn it or go the long way" is not reflected in the grid; the pine gates are not needed for the objective.
