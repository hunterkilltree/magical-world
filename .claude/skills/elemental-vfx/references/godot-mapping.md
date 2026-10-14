# Mapping the principles onto this codebase

Check names against the code before relying on them; this file describes the VFX layer as of
the combinations-and-effects matrix work (R-055 to R-059).

## Where effects live

| Layer | File | Role |
|-------|------|------|
| Sim (gameplay, do not tune for looks) | `scripts/core/arena_sim.gd` | Emits events; owns `hitstop` (0.035 s combo cast, 0.16 s new combo, 0.05-0.08 s on some hits) |
| Director | `scripts/vfx/vfx_director.gd` | `on_event` -> recipes; `update(dt, sim, tip)` ticks everything |
| Particles | `scripts/vfx/vfx_particles.gd` | Two CPU pools drawn as MultiMesh: `sprite()` soft billboards, `spark()` velocity-stretched streaks |
| Presets | `data/vfx_presets.json` | `sprite_presets`, `spark_presets`, `fireball_ramps`, `element_fx` (element -> sprite/spark names) |
| Screen | `scripts/vfx/screen_fx.gd` | `wave` (shockwave distortion), `heat` (haze), `punch` (chromatic), `screen_flash` (capped by `FLASH_CAP` 0.18) |
| Lightning | `scripts/vfx/lightning_bolt.gd` | Fractal bolt ribbons |
| Matrix looks | `scripts/vfx/matrix_visuals.gd` | Per-area `def.visual` from `spells.json` |
| Textures | `scripts/vfx/vfx_textures.gd` | Painted rune/glow/beam/decal textures |
| View | `scripts/arena/arena_view.gd` | Camera, shake; VFX only reads the sim |

### Director recipes (event -> function)

- Cast at the staff: `release(e, tip, tier)` (tier >= 2 already has converging streaks =
  anticipation), `cast_fx(e)` (rune, light column, helix, callout, screen wave).
- Impact/area: `blast(e)` (dome shell, flare, fireball, radial sparks, dust ring, per element),
  `explode_fx(e)` (screen wave, punch, flash, ground glow, decals, debris `spray`).
- Projectile hit: `hit(e)`. Cone sprays: `cone(e)`. Area starts: `area_start(e)`.
  Walls: `wall_fx(e)`. Reactions (shatter, freeze, conduct, steam): `tag_vfx`, `reaction_fx`.
- Per-spell signature on top: `_sig(key, hook, e)` matched on `[combo key, hook]`, hooks
  `cast | explode | impact | area | beam | wall | chain | cone`. Add spell-specific flair here
  rather than branching inside the generic recipes.
- Primitives: `flare`, `light_flash`, `heat`, `fireball`, `shell` (expanding sphere/dome),
  `bolt`, `dust_ring`, `radial_sparks`, `crown` (water splash), `rune`, `column`,
  `ground_glow`, `decal`, `spray` (rigid debris with gravity 20, bounce 0.32), `spikes`,
  `helix`, `spiral`, `forks`, `ring_flash`, `punch(ab, fov_k, shake)`, `callout`.
- Animated one-offs go through `_add(node, life, tick, end)`; `tick(k, dt, el)` gets
  `k` = normalised age 0..1, `el` = elapsed seconds. Use `ease_out`/curves on `k` for timing.

## Knobs per principle

| Principle | Knob |
|-----------|------|
| Fast burst, sharp slow-down | High initial speed + high `drag` (sprite option or preset). Scale curves like `0.3 + 0.75 * ease_out(k * 2.6)` (see `fireball`) reach full size early then hold |
| Element takes over as energy fades | `buoy` (smoke/flame rise), spark `grav` (drops/debris fall), `heat` (fraction of life spent cooling `c0` -> `c1`), glow 1 -> alpha blend as it cools |
| Smoke vs steam vs dust | Smoke: long `life`, positive `buoy`, slow fade. Steam: short life, fast fade. Dust: low/zero `buoy`, settles. Tune in `sprite_presets` |
| Anticipation | Converging sparks with negative velocity toward the source (`release` tier >= 2 pattern: `spark(..., at + off, -off * 9, {"life": 0.11, "grav": 0.0})`), a shrinking `shell`/`rune` (`r0` > `r` reversed), or a short delay before the burst via `_add` |
| Punch | `flare` (0.08-0.16 s), `light_flash`, `punch(ab, fov_k, sh)`, `screen.wave`, at most a low-alpha `screen_flash`. Sim `hitstop` already freezes combos; do not add more hitstop from the view |
| Overlap | Second smaller `blast`-style burst or `radial_sparks` delayed via `_add(..., end)` or a timed tick; layer two `shell`s at different sizes/lives |
| Chaos | Always `randf_range` for speed, size (`k`), `life`; jitter angles (`i / n * TAU + randf() * 0.3`, see `dust_ring`); vary counts |
| Ones that got away | Spawn 1-3 extra sparks/debris at 1.5-2.5x the normal speed |
| Asymmetric impacts | Bias velocities with the event `dir` (`spray(..., {"dir": ...})`, cone `a0`) so more material goes downstream |
| Splash secondary | After the `crown` primary, a delayed (0.2-0.4 s) narrow upward column of water sparks/spray at the centre, then a `ring_flash`/ripple |
| Fire as fluid | Flame sprites: strong `buoy`, `drag`, size growth `s0 -> s1`, short life; hotsmoke outlives flame; `heat` haze lingers |
| Magic twinkle | Mixed lifetimes per particle (`life` option), spin (`_s_rs`), size pulse via preset `s0/s1`; keep counts low; additive glow modest |
| Smooth paths | Trails in `_update_trails`; never snap a trail's points; interpolate direction changes |
| Scale is time | Bigger `R` -> longer `life`, slower expansion; small hits short and snappy |
| Rigid vs fluid | `spray` debris keeps shape and bounces; sprites may morph and fade |

## Timing table (24 fps book frames -> seconds)

| Event | Frames | Seconds |
|-------|--------|---------|
| Anticipation squeeze | 1-2 | 0.04-0.08 |
| Burst (exaggerated) | 1-4 | 0.04-0.17 |
| Flame tip breaks off and vanishes | 2-3 | 0.08-0.13 |
| Flag/fire wave cycle | ~6 | ~0.25 |
| Gap before a splash jet | several | 0.2-0.5 |
| Splash sheet torn into droplets | ~24 | ~1.0 |
| Explosion full resolve | 80+ | 3+ |

## Budget and rendering limits

- Pools: `SMOKE_MAX` 1400, `SPARK_MAX` 1400 (ring buffers: the oldest are overwritten),
  `MAX_DEBRIS` 180, `MAX_DECALS` 16. A big combo should stay well under a third of a pool.
- Compatibility renderer: glow bleeds frame-wide and tonemap white is ignored. Colours in
  presets are HDR multipliers; keep emissive peaks short and modest so nothing clips.
- Headless test runs use a 64x64 viewport; do not assert pixel sizes.

## Verify

```bash
harness/run.sh shot play OUT.png
harness/run.sh shot matrix OUT.png
harness/run.sh shot live OUT.png
harness/run.sh all
```

Look at the frame after any visual change (Read the PNG). `live` runs the real loop for 5 s.
For timing feel, a still is not enough: step `main.tick(dt, input)` in a scratch script or play
the game; judge against the SKILL.md checklist.
