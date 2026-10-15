# Handoff: Staff of the Cracked Rune → Godot 4

This handoff carries the changes made on top of **Court of Waves** (`godot_handoff_court_of_waves/`). Those changes are the five casting roles, the 225 role spells and the game-feel pass. The base systems are unchanged and stay documented in that folder's README and VFX_HANDOFF: queue, element reactions, enemies, waves and arena.

## What changed
1. **Five casting roles.** Destroyer, Controller, Guardian, Trickster and Arcanist. Any two distinct elements resolve to the caster role's own spell. That gives 45 pairs × 5 roles = **225 spells**, with ids like `FIRE_WATER_DESTROYER`. Singles, doubles and named triples are still shared.
2. **Ten elements.** The original six (fire, water, ice, lightning, earth, arcane), plus nature, wind, light and dark. Keys 1–9 and 0.
3. **New shapes:**
   - `beam`
   - `guard` (self ward)
   - `blink`
   - `dash`
   - `decoy` (doubles and totems)
   - `swap`
4. **Casting body mechanics.** Each role has a signature move: slam, sweep, plant, flick or thrust. Every cast runs windup → hold → release → recoil. The windup length scales with the spell's weight.
5. **Impact frames.** Two frames play on the biggest hits: the first is inverted and the second is hard black-and-white. They are limited to one burst every 0.4 s.
6. **Projectiles:**
   - They squash on launch, stretch with speed and have tapered tails.
   - Heavy shots (bombs, boulders) fly a ballistic arc and bounce.
7. **Particles:**
   - Density is 60%, and each particle is about 20–25% larger.
   - Big smoke puffs break into two curling children instead of fading out.
8. **Hit reactions.** Enemies get a squash and wobble, the upper body lags the shove on springs, and the body smears along the knockback.
9. **Menu preview.** The selected wizard loops their role's signature spell.
10. **HUD:**
    - Wind-up ring at the cursor
    - Cooldown arc
    - Cooldown numbers on the element tiles
    - Spell list grouped by role, with element icons

## Files
| Path | Use in Godot |
|---|---|
| `data/roles.json` | Roles, styles, shape weights, wizard → role, 60 archetypes and all 225 spells. Load it directly. |
| `data/spells.json` | Base elements (10), shapes (incl. the role shapes) and shared combos. It **replaces** the Court of Waves version. |
| `data/spells_225.csv` | The same 225 spells flattened for spreadsheets and balancing. Godot can import it as a translation/CSV resource. |
| `data/feel_presets.json` | All game-feel numbers: impact frames, particle breakup, squash/stretch, arcs, hit springs, cast timing per style. |
| `godot/role_book.gd` | Autoload `RoleBook`. `resolve(queue, role)`, `role_pair()`, `make_spell()`, `cast_timing()`, `release_hitstop()`. It replaces `spell_book.gd`. |
| `godot/impact_frames.gd` + `godot/shaders/impact_frame.gdshader` | Full-screen impact-frame overlay with rate limiting. |
| `godot/projectile_view.gd` | Projectile squash/stretch/tail visuals, plus the static `arc_step()` for the ballistic flight. |
| `reference/` | Readable JS source (design reference, not code to ship). `arena.html` runs it over HTTP. |

From the Court of Waves handoff, the following still apply: `vfx_presets.json`, `fireball`/`energy_strip`/`shockwave_dome`/`screen_fx` shaders, `lightning_bolt.gd`.

## Spell data model
Each entry in `roles.json → spells` has these fields:

```json
{ "id": "FIRE_EARTH_DESTROYER", "role": "destroyer", "pair": ["fire","earth"], "key": "earth+fire",
  "name": "Magma Crush", "desc": "Molten ground smash", "arch": "quake",
  "shape": "area", "radius": 3, "delay": 0.38, "life": 0.01, "burst": true, "mult": 2.4, "cd": 1.6 }
```
- Archetype fields are already merged into each spell. `archetypes` is kept as well, for balancing all spells of one mechanic at once.
- **Damage and statuses** come from `elements[el].hit` × `mult`. Spell-level status fields (`root`, `slow`, `stun`, `silence`, `freeze`, `weaken`, `confuse`, `curse`, `blind`…) are added to the payload.
- **Cooldown** = `cd` ?? `shapes[shape].cd`. **Cost** = element count × 8 × `shapes[shape].cost`.

**Resolve order:**
1. Named triple
2. Three of a kind (its double ×1.3)
3. Role pair (+30% per repeat)
4. Shared distinct key
5. Best-ranked pair + rider ×1.5

**Opposites:** they don't cancel when the role knows that pair.

## New shapes → Godot
| Shape | Behaviour (see `CAST` in `reference/game/sim.js`) | Godot |
|---|---|---|
| `beam` | Instant line `range` × `width`, `count`/`spread` for prisms. Stops at walls and pillars. | `RayCast3D` / `PhysicsShapeQueryParameters3D` box |
| `guard` | Self statuses: `ward`, `armor`, `reflect`, `invuln`, `heal`, `regen`, `amp`, `energy`, `stoneskin`, `cleanse`, `revive`. `near` hits enemies within that radius. | Status component on the player |
| `blink` | Teleport `dist` toward aim (clamped to the arena). Optional `burstFrom`/`burstTo`/`delayedFrom` explosions and `ward`. 0.3 s invuln. | Set `global_position` after a shape cast |
| `dash` | Move `dist` over a short time, hitting everything within `width`. Optional `decoy` left behind. | Tween velocity on the `CharacterBody3D` |
| `decoy` | Spawns `count` doubles with `hp`/`life`. Enemies target them. `burst` on death, `pulse` heal/damage, `hop` moves the caster back. | Decoy scene in the `targets` group |
| `swap` | Swap positions with the nearest enemy to the aim within `range`, then stun it for 0.9 s. | Two position swaps + status |

## Casting flow (keep this order)
1. **cast**
   - `timing = RoleBook.cast_timing(spell, role, mode)`
   - Plant the feet and start the windup (`timing.windup`).
   - Emit `windup`, which drives the gather VFX, the rune circle and the cursor wind-up ring.
2. **hold** (`timing.hold`). A pin-point flare at the staff tip. Particles orbit tight.
3. **release**
   - Re-read the aim and fire the shape.
   - Apply `release_hitstop()`.
   - Play the style's release FX (`feel_presets.casting.styles`), the camera kick and the air push.
   - Call `ImpactFrames.trigger()` if slam weight ≥ 0.85, or if this is the first cast of a combo.
4. **recoil** (`timing.recoil`). This is follow-through only. The player can move, but the arms and staff are still settling.

## Fidelity
- **Gameplay numbers:** final for this pass. Balance per role in `spells_225.csv` and copy the changes back into `roles.json`.
- **Visuals:** match timing, shape language and contrast. The meshes don't need to match.
- **Not yet watched live:** the menu preview, impact frames, particle breakup, squash/stretch, arcs and hit reactions were built but not playtested on screen. Tune them in Godot.

## Not included
- Per-spell sound. The prototype's audio is still the synthesized per-event set (`reference/game/audio.js`).
- Final art: models, textures and icons.
