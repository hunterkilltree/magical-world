# VFX & Juice Handoff → Godot 4.3+

This document describes the visual and audio "feel" layer of Court of Waves, so it can be rebuilt in Godot.
It covers what the player sees and hears when building a combo, releasing it, and landing it.

**Gameplay is unchanged except for one rule.** Combo casts now briefly freeze time ("hitstop"); see §1.
Everything else here is presentation. It must **only react to gameplay signals**; it must never change gameplay state.

## How to use this
1. Open `Court of Waves - playable.html` in Chrome and cast some combos. That file is the visual target.
   - Good ones to try: `1+4` Thunderflare, `1+4+6` Starfall, `2+3` Hoarfrost, `5+1` Molten Core, `2+4` Storm Pool.
2. Read the reference source:
   - `reference/game/vfx.js`: the realistic layers.
   - `reference/game/wow.js`: rune circles, callouts, screen effects, per-spell signatures.
   - `reference/game/audio.js`: synthesized sound.
3. Get the exact numbers from `data/vfx_presets.json` (sprite, spark and fireball colour presets).
4. Use the starter shaders in `godot/shaders/`. They are a starting point and **not tested in Godot**; tune them against the HTML.

## 0. Architecture in Godot
```
Sim (gameplay) ──signals──▶ VfxDirector (autoload) ──spawns──▶ one-shot effect scenes (self-free)
                                  │                              └─ GPUParticles3D / MeshInstance3D + ShaderMaterial
                                  ├──▶ ScreenFx (CanvasLayer, full-screen ColorRect shader)
                                  ├──▶ CameraRig (kick / shake / fov punch)
                                  └──▶ Sfx (AudioStreamPlayer3D pool)
```
**Signals**

These are emitted with a dictionary payload, the same fields as the JS `events[]`; see `sim.js` and grep `ev(s, '`.

| Signal | Key fields |
|---|---|
| `cast` | `mode, shape, key, els, color, x, z, dx, dz, fromQueue, isNew, distinct` |
| `explode` | `x, z, r, els, color, big, key` |
| `impact` | `x, z, els, color, kind, r, key, enemy` |
| `area` | `x, z, r, life, delay, key, els, color` |
| `wall` | `x, z, mat, key, dx, dz, n` |
| `chain` | `pts, key` |
| `cone` | `x, z, dx, dz, range, arc, els, key` |
| `nova` | `x, z, r, color, key` |
| `tag` | `tag`: `shatter`, `freeze`, `conduct`, `steam`, `interrupt`, `blocked`, `evade` |
| `queue` | `el` |

**One-shot effect scenes**

Make one scene per recipe. Each sets `one_shot = true` and calls `queue_free()` on a Timer when finished.

**Particle settings**
- Pool the particle nodes if profiling demands it.
- Particle materials use **Billboard = Particles**, **Proximity fade (soft particles)** on, unshaded, and **Vertex color as albedo**.

**Rendering setup**
- **Bloom is mandatory.** Turn on WorldEnvironment glow: intensity about 0.8, bloom about 0.1, HDR threshold about 1.0, blend mode **Additive**.
  - Emissive colours in the presets are HDR (values above 1). They must exceed 1 to bloom.
- Tonemap: **ACES**, exposure 1.1.

## 1. Timing: "anticipation → climax → follow-through"
Every combo release follows this beat sheet. Times are from the moment of cast.

| t (s) | Layer | Detail |
|---|---|---|
| 0.00 | Hitstop | `Engine.time_scale = 0.2` for **0.035 s** (normal combo) or **0.16 s** (first time this combo is ever cast). Shatter adds 0.08 s, big explosions 0.05 s. Use `Timer.new()` with `ignore_time_scale = true` to restore. |
| 0.00 | Converge streaks | 22 sparks spawned on a 1.2–1.8 m sphere around the staff tip, velocity pointing **inward** (×9), life 0.11 s. This reads as energy sucking in. |
| 0.00 | Muzzle flare | Star-shaped additive sprite at the tip (4-point star texture), size 1.1 + 0.55·tier m, 0.1–0.2 s, scale up then shrink. |
| 0.00 | Muzzle shell | Fresnel sphere at the tip, radius 0.5 + 0.35·tier, 0.22 s (`shockwave_dome.gdshader`, full sphere). |
| 0.00 | Directional sparks | 8 + 10·tier stretched sparks **per element**: cone ±0.22 rad for bolts, ±0.6 for cones, full circle for area/self. Speed 8–18 m/s. |
| 0.00 | Element puffs | 3 + 3·tier sprites per element at the tip (flame / arcane / spray / mist / plasma, by element). |
| 0.00 | Ground dome + dust ring | Combos only: a hemisphere dome at the feet (radius 1.6 + 0.4·tier, 0.35 s) and a ring of 8 + 4·tier dust (or mist, if ice) sprites blasting outward at 4 + tier m/s. |
| 0.00 | Rune circle | A rotating additive decal of the rune texture under the caster, radius 1.1 + 0.45·tier, 0.55 s. Plus a light column: an open cylinder with a vertical alpha gradient, height 4 + 2.2·tier. |
| 0.00 | Screen | Shockwave ripple centred on the caster (strength 0.18·tier), chromatic aberration pulse (+0.25·tier), FOV punch (−0.9·tier°), camera shake (+0.08·tier), screen tint flash in the spell colour (alpha 0.04·tier, capped at 0.18 overall). |
| 0.00 | Callout | The spell name in uppercase, floating above the caster, in the spell colour lightened 35%, with a dark outline. Shown 1.3 s; 2.1 s plus a gold "NEW SPELL" kicker the first time. |
| 0.00 | Camera kick | Push the camera **opposite the aim direction**: 0.12·tier m, decaying with `exp(-10·dt)`. |

`tier` = 1 (one element), 1.3 (repeated single element), 2 (two distinct elements), 3 (three distinct elements).
Recasting by holding the button uses tier 0.8, with no anticipation, callout or ground dome.

## 2. Charge-up (while elements are queued, before casting)
- **Rune circle at the feet.** Rotating additive decal, scale 0.95 / 1.35 / 1.8 for 1 / 2 / 3 queued elements; spin speed 0.5 + 0.7·n rad/s.
  - Its colour is the mixed spell colour, brightness ×(1.5 + 0.9 if a combo) with a sin(7t) pulse.
- **Element nodes.** Six small glowing dots on the circle's inner ring, one per element in the order Fire, Water, Ice, Lightning, Earth, Arcane. A dot is lit when its element is queued.
- **Fusion orb at the staff tip.** Radius 0.07 + 0.035·n. Particles spawn 0.45–0.7 m around it and fly **inward**, 20·n per second, coloured by the queued elements.
- **OmniLight3D at the feet.** Spell colour, energy 4 + 4n.
- **On each queue press:** a ground ring pulse plus a burst of 12 sparks at the tip. Completing a 2-element combo also gives a quick rune flash and a small aberration pulse.

## 3. Impact recipes

### 3.1 Explosion (`explode`)
Used by Thunderflare, Hexfire Comet, Runestone, Starfall, rune barrels and boulder splash. Layer the following.

1. **Fireball:** `fireball.gdshader` on a high-subdivision sphere.
   - Radius R·0.55 (R·0.72 if `big`); life 0.6 s (0.85 s if big).
   - Scale 0.3 → 1.05 over the first ~40% of life, then hold. Rises R·0.5 over its life.
   - Ramp by elements (`fireball_ramps`): fire+arcane → `hexfire`; fire+earth → `earth`; otherwise the first of fire, arcane, lightning, earth, ice, water present.
   - It cools (the `age` uniform) and **dissolves via noise discard**, never via alpha fade.
   - Skip the fireball for pure ice/water/earth blasts.
2. **Ground dome:** a hemisphere with the fresnel rim shader, radius R·1.25, 0.28 s (0.38 s big). Flattened ×0.55 in Y.
3. **Flare:** star sprite, size R·1.6 (R·2.4 big), 0.1–0.16 s.
4. **Sparks:** 32 (60 big) stretched sparks shared between the elements, speed 8–16 (24 big) m/s, mostly upward hemisphere. They **bounce** off the ground (restitution 0.35).
5. **Dust ring:** 14 (26 big) dust sprites, radially at R·3 m/s. Use mist instead if it's ice without fire.
6. **If fire:** 9 (16) `flame` sprites, plus 7 (14) `hotsmoke` sprites that start orange-hot and cool to dark grey. Add heat haze at radius R·1.5 for 1.3 s.
7. **If arcane (without fire):** 18 `arcane` sprites radially, plus 6 grey smoke.
8. **If lightning:** a **sky bolt** from (x±2, 16, z−2…5) to the ground point, life 0.3 s, width 0.32; plus a blue-white fresnel shell and 8 `plasma` sprites.
9. **If ice:** 24 ice shard sparks and 12 mist sprites.
10. **If water:** a crown splash (§3.4).
11. **If earth:** 6–10 dust sprites rising slowly.
12. **Physical debris:** 8–22 mesh chunks with gravity 20, bounce 0.32, lifetime 1.3–2.1 s, shrinking out over the last 0.4 s.
    - Types: rock, glowing lava (it emits flame puffs while airborne), ice shards, arcane crystals.
13. **Ground decal:** `Decal` node, scorch (fire / arcane / lightning) or frost. Fades in over 0.15 s and lingers 7–9 s. Keep at most 16 at a time.
    - Fire also adds an orange-glow decal for 1.8 s.
14. **Screen:** shockwave ripple (strength 0.85 big, 0.4 otherwise), aberration (+0.7 / +0.25), FOV punch (−2.2° / −0.6°), shake, camera kick upward (+0.35 / +0.15).

### 3.2 Projectile hit (`impact`)
- Flare 1.0 m for 0.08 s, plus 10 radial sparks per element.
- 3–4 element sprites (flame, arcane, spray or mist).
- Boulders add a dust ring (14 sprites), a ground dome (1.8 m), a crack decal and a small camera kick.

### 3.3 Lightning (chains and every bolt)
`lightning_bolt.gd` builds a camera-facing ribbon mesh every **0.07 s** (it "re-strikes").
- **Shape:** recursive midpoint displacement. Depth 3–5 by length; offset = (random −0.5…0.5) × segment length × 0.32, on a random axis perpendicular to the segment.
- **Branches:** 28% chance at each interior vertex. A branch heads 0.75·forward + 0.7·random, length 12–30% of the segment, depth 3, and thins and fades along its length.
- **Two passes:** an outer glow (spell colour ×1.7, width 0.2, falloff `pow(1-|2u-1|, 2.2)`) and an inner core (`#fff8e8` ×3.2, width 0.045). Additive.
- **Flicker:** each frame, 78% full brightness, 22% at 25%. Overall fade `1 - k²`.
- **Endpoint:** 8 sparks, a flare and an OmniLight flash (energy about 30, decays with `exp(-14·dt)`).
- **Quiet variant** (puddle zaps, ground forks): 2 sparks, no flare or light. Use it for frequent bolts, or the lighting budget explodes.

### 3.4 Water crown splash
26 droplet sparks thrown up (6–10 m/s upward, 3–6 m/s outward, gravity 16), plus 13 `spray` sprites and 10 low `mist` sprites.

### 3.5 Cone sprays (`cone`)
- **Fire:** 40 `flame` sprites fanned across the arc at range × 2.2–3.1 m/s with drag 2.6, plus 6 hotsmoke, 26 fire sparks and heat haze halfway along the cone.
- **Fire + Water (Scalding Steam):** 34 large `steam` sprites instead.
- **Earth + Water (Mudslide):** 24 `mud` sprites. They have negative buoyancy, so they fall, plus a few mud mesh chunks.
- **Water:** 30 `spray` sprites and 30 droplet sparks.

### 3.6 Areas (`area`)
- **Hoarfrost (ice + water):**
  - 22 ice spikes erupt (staggered over 0.14 s, grow over 0.12 s), live for the field's duration, then shatter.
  - 30 mist sprites, 34 ice sparks, a frost decal, and a dome.
  - While active: low drifting mist.
- **Storm Pool (lightning + water):** crown splash, two sky bolts, and a dome. While active: crackling sparks and plasma puffs, plus a quiet bolt every 0.12 s.
- **Undertow (arcane + water):** arcane sprites spawned on the rim with tangential + inward velocity (a spiral), and a spinning rune decal held for the full life.
- **Starfall (arcane + fire + lightning):**
  - For the 1 s delay: a light column grows from thin to wide, a glowing star sprite falls from (x+4, 12.6, z−2) to the ground, and the ground disc fills in.
  - On landing: the full §3.1 explosion with the hexfire ramp. Add a large rune decal (R·1.6), 10 ground lightning forks, 22 lava + 14 rock debris, and a scorch decal. The screen tint flash is capped at 0.03 here so the screen never whites out.
- **Burning ground (left by Molten Core):** constant flame sprites, occasional hotsmoke and heat haze.

### 3.7 Walls, slams, reactions
- **Wall raise:** per segment, 4 dust (or mist) sprites and 4 rock (or ice) sparks, plus debris, a camera kick and a crack or frost decal.
- **Bulwark slam:** dust ring (24 sprites at 7 m/s), ground dome (2.6 m, tan colour), 20 earth sparks, a crack decal (2.4 m) and strong shake.
- **`shatter`:** 34 ice sparks, 16 ice shard meshes, 8 mist sprites, a shell, a flare, a ripple and 0.08 s of hitstop.
- **`freeze`:** a ring of 6 ice spikes (tilted outward, 1.1 s) plus a frost decal.
- **`conduct`:** 3 short quiet bolts plus 14 lightning sparks.

### 3.8 Projectiles in flight
- **Ribbon trail:** the last 14 positions, width tapering to 0, glow + core passes. When the projectile dies, the trail collapses over 0.18 s.
  - In Godot, either use GPUParticles3D trails (`trail_enabled`, a ribbon draw pass) or build an ImmediateMesh.
- **OmniLight3D:** follows each projectile, spell colour, energy 7. Cap at 4 such lights.
- **Fire projectiles:** trail flame sprites (26/s; 40/s for boulders); molten boulders also trail hotsmoke.
- **Arcane projectiles:** arcane sprites (18/s).
- **Prism Lances:** rainbow sparkles (cycle the hue).

## 4. Particle presets (`data/vfx_presets.json`)
**`sprite_presets`** are soft billboards, all using one 2×2 cloud atlas (`textures/cloud_atlas` — generate a noise cloud atlas or use any smoke flipbook).
- **Colour:** lerps c0 → c1 over `heat × life`, so fire is white-yellow-hot and cools to soot.
- **Glow vs alpha:** `glow` blends from additive (1) to alpha (0) over the same time. That is what makes flame turn into smoke.
  - In Godot: use two emitters (an additive flame and an alpha smoke spawned with a delay), or a custom particle shader using premultiplied alpha: `ALBEDO = col * a; ALPHA = a * (1 - glow)` with `blend_premul_alpha`.
- **Size:** grows s0 → s1 with ease-out.
- **Rotation:** random, with spin −1.6…1.6 rad/s slowing over life.
- **Alpha:** fades in over the first 6% of life, holds, then fades out quadratically over the second half.

**`spark_presets`** are velocity-stretched quads.
- **Stretch:** the streak length is `velocity × st` seconds.
- In Godot: `ParticleProcessMaterial` with gravity, damping = drag, collision mode Rigid and bounce about 0.35, drawn with a quad and **Transform align = Z-billboard, Y to velocity**, scaled by speed.

## 5. Screen effects (`godot/shaders/screen_fx.gdshader`)
One full-screen `ColorRect` on a CanvasLayer, reading `hint_screen_texture`.

| Uniform | Purpose | Decay |
|---|---|---|
| `waves[6]` vec4 | Shockwave rings: (uv.x, uv.y, age 0..1, strength). Radius grows to 0.16 + 0.42·strength (uv). The band refracts outward and gives a slight brighten. | Duration 0.45 + 0.3·strength s |
| `heat[8]` vec4 | Heat haze: (uv.x, uv.y, radius, strength). A sine-wobble UV offset of 0.0032 × falloff. | Per source |
| `aberration` | RGB split, growing toward the screen edges | `exp(-5·dt)` |
| `flash` vec4 | Additive tint in the spell colour, alpha capped at 0.18 | `exp(-9·dt)` |

Project world points to UV with `camera.unproject_position(world) / viewport_size`, then flip Y if needed.

**Camera rig:**
- Base offset (0, 13.5, 12.5), FOV 40.
- Leans 15% toward the cursor.
- Shake: random offsets scaled by `shake`, which decays with `exp(-9·dt)`.
- FOV punch decays with `exp(-6·dt)`. Kick decays with `exp(-10·dt)`.

## 6. Audio (`reference/game/audio.js`)
Everything is synthesized. To use Godot assets instead, follow this map.
- **Element notes** (used for queue pings and combo chords): Earth C4, Fire G4, Arcane C5, Water D5, Ice E5, Lightning A5. A bell timbre: a sine plus a quieter partial at 2.01×, plus a short 3× click.
- **Combo release:** a chord of the elements an octave down, played 35 ms apart, plus a sub thump.
  - First time a combo is cast: an arpeggio C5–E5–G5–C6 plus a shimmer.
- **Explosions:** a sine drop 120 → 32 Hz plus low-passed noise, 0.9 s (big); 170 Hz and 0.45 s for small ones.
- **Shatter:** high-passed noise plus 3 glassy sine pings.
- **Lightning:** four 35 ms high-passed noise cracks plus a low square buzz.
- Throttle each sound type (25–200 ms), so swarms don't stack. Run everything into a compressor bus.

## 7. Files added for this pass
- `VFX_HANDOFF.md`: this document.
- `data/vfx_presets.json`: sprite, spark and fireball presets.
- `godot/shaders/fireball.gdshader`: noise-displaced, cooling, dissolving fireball.
- `godot/shaders/shockwave_dome.gdshader`: fresnel rim dome or shell.
- `godot/shaders/screen_fx.gdshader`: shockwaves, heat haze, aberration, flash.
- `godot/shaders/energy_strip.gdshader`: lightning and trail ribbon material.
- `godot/lightning_bolt.gd`: fractal bolt mesh generator.
- `reference/game/vfx.js`, `wow.js`, `audio.js`: the JS source of truth.
