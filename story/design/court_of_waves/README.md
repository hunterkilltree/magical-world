# Handoff: Court of Waves (elemental arena) → Godot 4

## Overview
This is a playable prototype of an elemental arena combat game in the style of Magicka. The player queues up to 3 of 6 elements and casts. The mix of elements decides the spell's shape and effect. Enemies arrive in waves of three types. Elements react with each other, with enemies and with the arena (puddles, brush, barrels). Careless casting can hurt the player.

## About these files
- **`Court of Waves - playable.html`** is the prototype itself, packed into one file that works offline. Open it in Chrome or Edge and play it first. It is the reference for game feel.
- **`reference/`** holds the readable JavaScript source. It is a **design reference, not code to ship**. Recreate the behaviour in Godot using Godot's own patterns.
- **`data/`** holds `spells.json` and `enemies.json`, the exact tuning tables. They can be loaded directly in Godot.
- **`godot/spell_book.gd`** is a working GDScript port of the spell resolver. It can be used as an autoload.

## Fidelity
- **Gameplay numbers:** these are final and come from playtesting. Use the values in `data/`.
- **Visuals:** these are placeholders made from basic shapes. Match the readability (colours per element, telegraph shapes, silhouettes), not the meshes.

## Architecture → Godot mapping
| Prototype (JS) | Godot 4 |
|---|---|
| `sim.js` `step()` at a fixed 60 Hz | `_physics_process(delta)` (Physics FPS = 60) |
| `player` object | `CharacterBody3D` + `player.gd` |
| `enemies[]` + `AI[kind]` state machines | `CharacterBody3D` scenes per type, using a `match state:` FSM |
| `shots[]` (bolt, boulder, orb) | `Area3D` projectile scene; damage on `body_entered` |
| `areas[]` (fields, pools, Starfall) | `Area3D` with a cylinder shape and a tick `Timer` |
| `walls[]` | `StaticBody3D` segments with HP and lifetime |
| `cone` / `chain` / `nova` casts | Instant queries: `PhysicsShapeQueryParameters3D` or distance + angle checks over the `enemies` group |
| `applyPayload()` | One `apply_payload(target, payload, ctx)` function in a `Combat` autoload. **Keep all element reactions in this one function.** |
| `events[]` → `render.js` | Godot signals (`hit`, `cast`, `explode`, `death`…) → VFX and audio listeners |
| `hud.js` | `CanvasLayer` + `Control` nodes |
| `input.js` | Input Map actions (below) |
| `STYLE` particle presets | `GPUParticles3D` with one `ParticleProcessMaterial` per element |
| Enemy HP bars and damage numbers | `Label3D` / `Sprite3D` with billboard mode |

Keep gameplay rules separate from visuals, as the prototype does. Gameplay code emits signals, and VFX nodes react to them.

## Input Map
`move_*` = WASD · `aim` = mouse ray onto a ground plane at y=0 · `el_fire`…`el_arcane` = keys 1–6 · `cast` = left mouse button (holding it recasts the last spell) · `cast_area` = right mouse button or E · `cast_self` = F · `dodge` = Space · `clear` = X · `pause` = Esc · `restart` = R.

## Spell system (data-driven)
- **Queue:** max 3 elements. Fire and ice cancel each other when queued.
- **Resolve order:**
  1. An exact key with repeats (`earth+earth`).
  2. The key of the distinct elements (`fire+lightning`). Each repeat adds 30% power.
  3. For three-element mixes with no entry: the highest-ranked pair (wall > area > boulder > chain > bolt > cone), with the third element as a "rider" at ×1.15 power.
- **Cost** = elements × 8 × shape cost. Energy max 100, regen 18/s.
- **Cooldowns:**
  - Shared cast cooldown = min(shape cd, 0.45 s).
  - Shapes with cd > 0.45 s (area 2.2 s, wall 3.0 s) also get their own timer.
  - Area-around-you cast (right mouse / E): 3 s. Self-cast: 1.4 s.
- **Payload:** each element adds to the hit payload (`elements.*.hit`), scaled by the combo's `mult`. Fire → burn damage over time. Water → wet + knockback. Ice → chill stack. Lightning → shock (interrupts). Earth → heavy damage + knockback. Arcane → raw damage.
- **Adding a spell:** add one entry to `combos` in `spells.json`. A new shape needs one cast function.

## Element reactions (all in `apply_payload`, in this order)
1. **Water:** puts out burning (STEAM); makes the target wet.
2. **Fire:**
   - On a wet target: dries it (STEAM).
   - On a frozen target: thaws it.
   - Otherwise: burn (3 s, 5 dps per fire element).
3. **Ice:**
   - On a burning target: puts out the fire.
   - On a wet target: freezes for 2.4 s.
   - Otherwise: +1 chill per ice element. Each chill stack is −16% move speed. 3 stacks = frozen for 1.8 s.
4. **Damage, per element** × the enemy's `resist` value:
   - Lightning on a wet target: ×2 (CONDUCTED).
   - Earth on a frozen target: ×2.2, and the freeze breaks (SHATTER).
5. **Frozen or shocked enemies:** their windup is cancelled (INTERRUPTED).

**Environment**
- **Puddles:** wet anything standing in them. Lightning charges a puddle for 2.6 s (5 damage every 0.45 s). Ice freezes it for 10 s (chills anyone standing on it). Fire turns frozen puddles back to water.
- **Dry brush:** fire or burning bodies ignite it. It burns for 5 s, spreads to nearby brush after 1.2 s, then stays as ash for 25 s. Water or ice puts it out.
- **Rune barrels:** fire, lightning, arcane or a blast detonates them. 2.8 m blast, also damages the player at ×0.7. They respawn between waves.

**Self-damage**
- Your own explosions hit you: ×0.45 (bolts), ×0.3 (splash).
- Point-blank area cast with an explosive spell: ×0.25.
- Starfall: ×0.6 if you stand under it.
- Freezing fields and electrified pools hit you if you stand in them.
- Casting lightning while wet: 7 damage + shock.

**Dodge:** 0.26 s, speed 13.5, cooldown 1 s. Invulnerable to direct hits while dodging; damage over time still applies.

## Enemies (`data/enemies.json`)
- **Grave Thrall:** fast melee.
  - Chase → windup 0.5 s (red 90° wedge on the ground fills in) → lunge 0.2 s → recover 0.75 s.
  - Attacks walls in its way.
- **Iron Bulwark:** slow and heavy.
  - Its 65° frontal shield blocks bolts (boulders get through). The shield drops while it is frozen, shocked or winding up.
  - Slam: windup 0.95 s, red disc fills in, 2.2 m radius, 22 damage, breaks walls.
- **Hexcaller:** ranged.
  - Keeps 6.5–9.5 m away and strafes.
  - Charges for 0.85 s with an aim line shown, then fires a slow orb (speed 8.5). The orb can be dodged and is blocked by walls.
- **Waves:**
  - Count: thralls = 3 + 1.5n. Hexcallers from wave 2. Bulwarks from wave 3.
  - Scaling: HP ×(1 + 0.12(n−1)); speed up to +25%.
  - Enemies spawn at the 3 gates farthest from the player, with a 0.9 s rise from the ground.
  - Clearing a wave heals 35% and refills energy, followed by a 3.5 s break.

## Player tuning
HP 100 · speed 5.4 · radius 0.42 · arena radius 15 (walkable radius 14.1) · aim range for area spells 10 · walls placed 2.4 m in front of the player.

## Game feel (to keep)
- Hit flash 0.14 s on enemies, with a small squash.
- Brief slow-motion on big explosions (time at ×0.2 for 50 ms).
- Screen shake proportional to the hit.
- Every attack has a readable telegraph on the ground.
- Damage numbers are coloured by element (orange for self-damage).
- Status pips under enemy HP bars.
- Aim previews: a cone wedge, an area ring and a wall strip in the colour of the queued spell.
- Camera: perspective, FOV 40, offset (0, 13.5, 12.5). Follows the player, leaning 15% toward the cursor.
- Pillars between the camera and the player fade out.

## Element colours
| Element | Hex |
|---|---|
| Fire | #ff6a2b |
| Water | #3d9bff |
| Ice | #a8ecff |
| Lightning | #f4e15c |
| Earth | #b3793f |
| Arcane | #d04bff |
| Hexcaller | #5cffb0 |
| Telegraphs | #ff3b3b |

## Files
- `Court of Waves - playable.html`: the playable prototype.
- `data/spells.json`: elements, shapes and combos.
- `data/enemies.json`: enemy types and a preview of waves 1–10.
- `godot/spell_book.gd`: GDScript spell resolver (queue, cancel, resolve, payload).
- `reference/game/sim.js`: all gameplay rules (the main file to read).
- `reference/game/render.js`, `models.js`: visuals (VFX reference only).
- `reference/game/hud.js`, `input.js`, `main.js`: UI, input and the game loop.
- `reference/wizard-rig.js`: the six wizard designs and the walk-cycle rig.
