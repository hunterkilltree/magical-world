# Improvement plan

An audit of `master` at `2b5e391` (after PRs #12 to #15). It uses the project skills in
`.claude/skills/`:
- **code-reviewer** for the findings;
- **the-fool** for a pre-mortem ("it's six months from now and the game failed; why?");
- **test-master** for the test gaps;
- **game-developer** for performance and architecture;
- **debugging-wizard** for how to work through each item.

How to use it: work top to bottom. Each item becomes a `planned` requirement in `story/STORY.md`, then gets a
failing test, then a fix, with one PR per item, following the story workflow in `CLAUDE.md`.

## Where the project stands

- **Working:**
  - The whole arena game: 10 elements and 80 combos.
  - Enemies, waves, reactions, the 3D view, the HUD and menus.
  - The effects matrix.
- **Tests:** 127 tests across 23 story requirement files. The full suite runs in about 4 s.
- **Not done:**
  - The VFX handoff's sound.
  - Its own requirements and tests.
  - Any human playtest.
  - CI.
  - Builds you can hand to someone.

## Priority 0: fix before anything else

### 1. Defensive spells can be kept up forever (critical, design bug)
- **What's wrong:** the effects matrix scaled cooldowns ×0.3 but kept the long durations.

  | Spell | Lasts | Recharge | Energy | Result |
  |---|---|---|---|---|
  | World Tree | 12 s | 6 s | 26 | Permanent invulnerability. The revive charge refreshes every cast, so effectively infinite revives. |
  | Forest Fortress | 10 s armour | 3.6 s | | 100% uptime |
  | Crystal Garden | 7 s reflect | 2.7 s | | 100% uptime |

  With 18 energy/s regen, the energy cost is no limit.
- **Why it matters:** once found, it's the only strategy worth using, and every other spell becomes pointless. (Pre-mortem: "players found the World Tree loop on day one.")
- **Do:**
  - Make each protective effect's recharge longer than its duration. For example, World Tree lasts 6 s with a 15 s recharge, and its revive is granted at most once per wave.
  - Add a test rule: for every spell with `invulnerable`, `armor`, `reflectPlayer` or `revive`, `cd > duration`.

### 2. Make verification actually run
- **What's wrong:**
  - Godot isn't on PATH, so the Stop hook skips itself silently ("Godot not found").
  - There's no CI, and every PR so far merged with no checks.
- **Do:**
  - Add Godot to PATH, or set `GODOT` in the user environment.
  - Add `.github/workflows/harness.yml`: download Godot 4.x headless on Linux and run `harness/run.sh all` on every PR.
  - Make branch protection on `master` require it.

### 3. Finish the VFX handoff
- **What's wrong:**
  - It's merged as a WIP commit. The combo time-freeze (hitstop) is a **gameplay rule** with no requirement and no test.
  - `vfx_director`, `vfx_particles`, `screen_fx` and `lightning_bolt` have no direct tests.
  - The sound isn't done.
- **Do:**
  - Add requirements for the hitstop rule (0.035 s per combo, 0.16 s for a first-ever combo, 0.08 s for shatter), the charge-up circle, release effects, impact recipes, screen effects and the camera kick.
  - Port `audio.js` (synthesized sound, M to mute, per-event throttling).
  - Write the tests first.

### 4. A human playtest
- **What's wrong:** the game has never been played by a person. Balance claims rest on a bot that uses 5 of the 80 spells, on one seed.
- **Do:** play 3 runs per wizard and write down:
  - what was confusing;
  - which spells felt useless or too strong;
  - where frames dropped;
  - what killed you.

  Each finding becomes a requirement.

## Priority 1: game design and balance

### 5. Measure every spell, not just the bot's five (test-master, the-fool)
- Add `tests/support/spell_bench.gd`: cast each of the 80 combos at a fixed group of enemies and record damage per energy, damage per second of recharge, crowd control applied, and self-damage.
- Add a test that flags outliers, e.g. more than 3× the median damage per energy, or no measurable effect at all.
- That table is the balancing tool from then on. Retune by data, never by feel. The handoff's 22 spells stay untouched.

### 6. Stronger regression bots
- **What's wrong:** one bot on one seed (11), clearing wave 3, using only handoff spells.
- **Do:**
  - Run it over 10 seeds and require a median of wave 5 or more.
  - Add a second bot that uses the new elements: root+burn, curse+purge, and Black Hole followed by an area spell.
  - Add a "degenerate strategy" test that loops a single spell and must die by wave 4. This catches item 1 kinds of bugs automatically.

### 7. A reason to keep playing
- **What's wrong:** endless waves with no memory between runs.
- **Do:**
  - Save the best wave and score per wizard to `user://`.
  - Show them on the menu and the death screen.
  - Optional later: unlock the four new elements by reaching wave N, so new players learn 6 elements before 10.

### 8. Teach 10 elements and 80 combos
- **What's wrong:** discoverability. Nothing tells a player that Water then Lightning conducts, or that Fire+Fire+Fire exists.
- **Do:**
  - A short tutorial wave.
  - A grimoire with search and a filter by element.
  - Show the combo the queue would make on hover over an element key.
  - A "NEW SPELL" log in the pause screen.

## Priority 2: code health (code-reviewer)

### 9. Split the three largest files
| File | Lines | Hotspot |
|---|---|---|
| `scripts/core/arena_sim.gd` | 1866 | `_apply_payload` (136 lines), `_update_areas` (74) |
| `scripts/vfx/vfx_director.gd` | 1339 | `_sig` (101), `on_event` (90), `_update_trails` (79) |
| `scripts/arena/arena_view.gd` | 1126 | `_ambient` (123), `consume` (109), `_update_enemy_view` (97) |

Suggested split, with no behaviour change and the tests staying green:
- `arena_sim` keeps the tick loop and owns:
  - `reactions.gd`: the "one place" rule becomes one module, not one function.
  - `enemy_ai.gd`: a state machine per enemy type (game-developer pattern).
  - `statuses.gd`
  - `areas.gd`
- `vfx_director` keeps the event routing and owns:
  - `vfx_recipes.gd`
  - `spell_signatures.gd`: the `_sig` table moved into data where possible.
- `arena_view` drops its old CPUParticles effect layer. It overlaps the new director (see item 11).

### 10. Typed events instead of loose dictionaries
- **What's wrong:** events and payloads are `Dictionary` objects with string keys. A typo, e.g. `"deflectField"` vs `"deflect"`, silently does nothing.
- **Do:**
  - Add an `events.gd` with constants for each event type and its fields.
  - In debug builds, assert that every emitted event has its required fields.
  - Add a data-validation test for `spells.json` and `enemies.json`: known shapes, known keys only, valid elements, numbers in range.

### 11. One effects system, not two
- `arena_view` still has its first-generation particles (the `STYLE` table and CPUParticles3D bursts) next to the VFX director.
- After item 3, remove the old layer, so one place owns each effect.

### 12. Repository hygiene
- Add `.gitattributes` with `* text=auto eol=lf` for `.gd`, `.json`, `.md` and `.gdshader`. Every commit currently warns "LF will be replaced by CRLF".
- Decide on `hvitmark_tundra/` (an independent prototype): keep it with its own CI job, or move it out.
- Mark the retired Grauhold Reach mockups in `story/design/` as historical, e.g. by moving them under `story/design/legacy/`.

## Priority 3: performance (game-developer)

### 13. Measure frame time, then optimise
- **Likely hot spots** (unmeasured; profile first):
  - The CPU particle pools loop over up to 2 × 1400 particles in GDScript every frame.
  - Trail and lightning ribbons are rebuilt with `SurfaceTool` every frame and every 0.07 s.
  - Each damage number is a new `Label3D`.
  - Most effects create a new material: runes, decals, glows.
  - Each transient effect holds a lambda.
- **Do:**
  - Add `harness/bench.gd`: wave 10 (about 28 enemies) plus a combo every 0.5 s for 30 s, reporting average and 99th-percentile frame time.
  - Target: 16.6 ms or less on the dev machine and 33 ms on a low-end laptop.
- **Then:**
  - Pool labels and materials.
  - Move particles to GPUParticles3D, or batch buffer writes.
  - Rebuild ribbons only when they change.
- Profile again after each change, one change at a time (debugging-wizard).

### 14. Renderer decision
- The VFX handoff says bloom is mandatory, with HDR emissive values above 1.
- The project runs the Compatibility renderer, where glow bleeds across the whole frame.
- **Do:** compare screenshots under Forward+ and Compatibility, then pick one deliberately and record why in `CLAUDE.md`.

## Priority 4: player comfort and shipping

### 15. Accessibility and settings
- A settings screen: master volume, effects volume, screen shake, flash intensity and chromatic aberration.
  - Flashes and colour splitting are a photosensitivity risk.
- Element keys show colour plus name today. Add a distinct icon per element for colour-blind players.
- Key rebinding: the bindings are already data in `controls.gd`.

### 16. Builds people can play
- Add `export_presets.cfg` (Windows and Web).
- Add version numbering and a short changelog.
- A CI job that produces the builds as artifacts.
- README: a "download and play" section.

## Suggested order and size

| # | Item | Size |
|---|---|---|
| 1 | Fix defensive-spell uptime | S |
| 2 | Godot on PATH, CI, branch protection | S |
| 3 | Finish VFX (requirements, tests, audio) | L |
| 4 | Human playtest | S (time) |
| 5, 6 | Spell bench and stronger bots | M |
| 12 | `.gitattributes` and repository hygiene | S |
| 9, 10, 11 | Refactor, typed events, one effects system | L |
| 13, 14 | Benchmark, optimise, renderer decision | M |
| 7, 8 | Persistence, onboarding | M |
| 15, 16 | Settings, accessibility, builds | M |

S = under a day, M = a few days, L = a week or more.

## How to work each item (debugging-wizard, test-master)
1. **Reproduce:** write the failing test, or the benchmark or playtest note, that shows the problem.
2. **Isolate:** make one change at a time; never mix a refactor with a behaviour change in one PR.
3. **Fix:** until `harness/run.sh all` is green, and check the look with `harness/run.sh shot ...`.
4. **Prevent:** keep the test. Update `STORY.md` and `CLAUDE.md` in the same PR.
