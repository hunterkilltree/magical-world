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
Each `test_*` method gets a fresh instance; `before_each()` runs first; `tree`
is the running SceneTree.

## Conventions

- Keep all work inside `res://`; scripts in `scripts/`, scenes in `scenes/`.
- Prefer editing `.tscn` by hand only for small changes; verify with `boot`.

## Story-driven workflow

The game follows `story/STORY.md`. Requirements are `### R-NNN [status] Title`
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
