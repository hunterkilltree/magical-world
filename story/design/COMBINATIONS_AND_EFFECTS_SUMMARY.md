# Elemental Magic Combinations & Visual Effect Display Matrix

This document provides a comprehensive technical and design summary of all **29 Elemental Spell Combinations** and their **Visual Effect Rendering Systems** implemented in the Spell Matrix and Weaving Arena.

---

## 1. Elemental Foundation

The system is built upon **9 Fundamental Elements**:
* 🔥 **Fire (Lửa)** - Radiant heat, explosion, burn DOT
* 💧 **Water (Nước)** - Fluid dynamics, knockback, wet status, healing
* 🌍 **Earth (Đất)** - Physical mass, barriers, terrain modification, defense
* 🌪️ **Wind (Gió)** - Vortex suction, displacement, air acceleration
* ⚡ **Lightning (Sét)** - Instant hitscan, chain conduction, paralysis
* 🌿 **Nature (Cây cỏ / Mộc)** - Botanical growth, roots, life energy, organic combustible fuel
* ❄️ **Ice (Băng)** - Solidification, cryo-shatter, immobilization
* ☀️ **Light (Quang)** - Piercing photon rays, cleansing, buffs, blinding
* 🌑 **Dark (Ám)** - Gravitational singularity, lifesteal, armor bypass, curse

---

## 2. Master Combination & Effect Matrix (29 Spells)

| # | Spell ID | Recipe | Category | Type | Damage | Radius | Dur / CD | Visual Effect & Rendering Display |
|---|---|---|---|---|---|---|---|---|
| **1** | **Supernova** | Fire + Fire | Fire | AOE | 850 | 180px | 10s / 8s | Multi-stage fiery explosion; `burning_land` persistent scorched earth; rock debris chunks; high-velocity amber sparks; Severe Burning DOT. |
| **2** | **Steam Bomb** | Fire + Water | Fire | AOE | 100 | 220px | 8s / 5s | Scalding brownish-amber steam cloud (`steam_cloud`) spanning 220px; 120 rising buoyant smoke puffs; 6 orbiting swirling gas wisps; continuous micro DoT ticks (3-8 dmg). |
| **3** | **Wildfire** | Fire + Nature | Fire | AOE | 560 | 200px | 8s / 7s | 7 clustered sub-zones (`wildfire_cluster`); custom vector cartoon grass tufts (`drawGrassTuftClump` with 3 blade tiers & lime spine highlights) that oscillate in wind and ignite into flickering fire tips; burning tick damage; drifting curved leaf particles. |
| **4** | **Magma Burst** | Fire + Earth | Fire | AOE | 620 | 140px | 7s / 6s | Molten magma pool; glowing lava shards; slow movement field reducing target velocity by 60%. |
| **5** | **Fire Tornado** | Fire + Wind | Fire | Vortex | 700 | 150px | 5s / 8s | Rotating vortex rings (`vortex_ring`) spiraling inwards; continuous suction physics dragging targets to center; high-speed flame embers. |
| **6** | **Plasma Spear** | Fire + Lightning | Fire | Beam | 920 | 40px | 1.5s / 6s | Ultra-high voltage piercing plasma ray; jagged procedural branching lightning bolts (`generateLightningPoints`); instant armor penetration. |
| **7** | **Hellfire** | Fire + Dark | Fire | Projectile | 880 | 90px | 4s / 7s | Black-purple necrotic fire projectile; bypassing 100% magic resistance; dark shadowy embers. |
| **8** | **Solar Flare** | Fire + Light | Fire | AOE | 500 | 220px | 4s / 9s | Intense blinding white-gold coronal flash; radial expanding shockwave ring; 3.5s Stun & Blind status rings. |
| **9** | **Thermal Shock** | Fire + Ice | Fire | AOE | 980 | 130px | 2s / 8s | Instant thermal freezing followed by violent shatter blast; contrasting ice-blue & fiery-orange particle explosions; shatter critical strike bonus. |
| **10** | **Tsunami** | Water + Water | Water | AOE | 480 | 240px | 3s / 7s | Expansive cyan surge wave; persistent `water_pool` ground zone; projectile deflection; massive physics knockback impulse. |
| **11** | **Whirlpool** | Water + Wind | Water | Vortex | 520 | 170px | 6s / 7s | Cyan/teal vortex rings; continuous centripetal pull dragging all enemies; Wet status infliction. |
| **12** | **Living Vines** | Water + Nature | Water | Summon | 380 | 130px | 5s / 6s | Thick emerald and aqua root bindings; target immobilization (Root) for 5s; floating leaf particles. |
| **13** | **Mud Prison** | Water + Earth | Water | AOE | 350 | 150px | 7s / 6s | Earthy mire eruption; brown sludge splash particles; severe 80% movement speed penalty. |
| **14** | **Thunder Pool** | Water + Lightning | Water | AOE | 750 | 180px | 5s / 6s | Persistent electrified `water_pool`; branching electric arcs conducting across water surface; Shocked status. |
| **15** | **Abyss Water** | Water + Dark | Water | Beam | 640 | 80px | 4s / 7s | Deep abyssal purple-black water torrent; mana draining effect; 40% enemy damage reduction debuff. |
| **16** | **Rainbow Mist** | Water + Light | Water | Buff | 0 | 160px | 8s / 10s | Iridescent pastel particle mist; healing aura restoring 120 HP/sec to the caster; cleanses negative debuffs. |
| **17** | **Glacier Prison** | Water + Ice | Water | AOE | 510 | 150px | 6s / 8s | Permafrost pillar; spinning crystal ice shards (`debris`); complete 6s Absolute Freeze encasement. |
| **18** | **Mountain Rise** | Earth + Water | Earth | Barrier | 300 | 120px | 8s / 6s | Sturdy stone bulwark; physical line-of-sight barrier absorbing enemy projectile collisions. |
| **19** | **Forest Fortress** | Earth + Nature | Earth | Barrier | 200 | 140px | 10s / 12s | Dense ancient timber barricade; +75% armor boost shield absorbing incoming player damage. |
| **20** | **Magnetic Field** | Earth + Lightning | Earth | Barrier | 410 | 170px | 6s / 8s | Pulsing golden-blue electromagnetic repulsion field; 100% projectile deflection capability. |
| **21** | **Graveyard** | Earth + Dark | Earth | Summon | 690 | 110px | 5s / 9s | Dark arcane subterranean graves dragging foes down; silence status disabling enemy spells. |
| **22** | **Crystal Garden** | Earth + Light | Earth | Buff | 350 | 130px | 7s / 9s | Prismatic crystal clusters; 50% damage reflection returning back to the attacker. |
| **23** | **Sandstorm** | Earth + Wind | Earth | AOE | 480 | 190px | 6s / 7s | Blinding golden desert gale; continuous particle abrasion; -60% enemy accuracy reduction. |
| **24** | **Divine Judgement** | Light + Light | Light/Dark | Beam | 1200 | 100px | 2s / 12s | Massive vertical Holy pillar smiting downward; intense white-gold flash; highest burst holy damage. |
| **25** | **Photon Railgun** | Light + Lightning | Light/Dark | Beam | 1100 | 35px | 0.8s / 8s | Zero-latency instant hitscan light beam; glowing laser trail; piercing all targets along ray vector. |
| **26** | **Black Hole** | Dark + Dark | Light/Dark | Vortex | 1400 | 200px | 6s / 15s | Cosmic singularity ground area (`black_hole`); gravitational vector physics dragging targets inward; absorbing all entities and projectiles; highest spell damage. |
| **27** | **Shadow Storm** | Dark + Wind | Light/Dark | AOE | 720 | 170px | 5s / 7s | Swirling dark tempest; confusion effect causing targets to attack adjacent entities. |
| **28** | **Death Forest** | Dark + Nature | Light/Dark | AOE | 650 | 180px | 8s / 9s | Necrotic woods; continuous soul drain restoring 30% of damage dealt back to the caster. |
| **29** | **World Tree** | Nature + Nature | Nature/Ice | Buff | 0 | 250px | 12s / 20s | Yggdrasil mythical sprout; full invulnerability aura; grants an additional revive charge. |

---

## 3. Visual Effect Rendering Pipeline (Canvas Engine)

The rendering pipeline in `src/components/WeavingArena.tsx` executes at 60 FPS across five layers:

### 1. Coordinate Transform & Screen Shake
* Dynamic screen shake vector `(shakeX, shakeY)` with decay factor (`intensity * 0.9`).
* Background grid with arcanum slate coloring (`#090d16`) and 35px grid lines.

### 2. Persistent Ground Areas (`groundAreasRef`)
* **`wildfire_cluster`**: 7 clustered circular grounds with radial gradients from lush green center (`#15803d55`) to burnt amber (`#b4530966`) and fiery edges (`#ea580c44`). Renders `drawGrassTuftClump` vector grass clumps featuring 3 depth tiers, tip highlights, wind sway, and dynamic fire ignition.
* **`steam_cloud`**: Radial brownish-amber gas cloud (`#9a341255` -> `#b4530944` -> `#78350f33`) with dashed boundary and 6 orbiting steam wisps dealing 3-8 micro DoT damage.
* **`black_hole`**: Violet singularity (`#1e1b4b88` with `#a855f7` border) applying gravitational pull:
  ```ts
  const pullAngle = Math.atan2(area.y - d.y, area.x - d.x);
  d.x += Math.cos(pullAngle) * 2.5;
  d.y += Math.sin(pullAngle) * 2.5;
  ```
* **`water_pool`** & **`burning_land`**: Specialized elemental surfaces with distinct opacity and border strokes.

### 3. Particle Simulation (`particlesRef`)
* **`shockwave`**: Expanding concentric rings with dynamic alpha decay.
* **`spark`**: High-velocity sparks with gravity drag and random velocity scaling.
* **`smoke`**: Expanding buoyant puffs with upward drift (`vy -= 0.8`).
* **`debris`**: Spinning polygonal rock and crystal shards with rotational velocity (`vRotation`).
* **`lightning`**: Multi-segment jagged lightning bolts created via midpoint displacement (`generateLightningPoints`).
* **`vortex_ring`**: Concentric rotating elliptical arcs creating inward suction spirals.
* **`leaf`**: Curved botanical blade silhouettes transitioning from lime green to burning orange and ember red.
* **`text`**: Drifting floating damage text with crit scaling (`💥 CRIT -850!`) and status indicators (`🔥 -18`).

### 4. Player & Entity Rendering
* **Wizard Avatar**: Aiming wand/staff rotated to mouse cursor angle, outer pulse aura (`#f59e0b22`), and glowing border.
* **Target Dummies**: Dynamic HP bars, white flash on hit (`hitFlashTimer = 12`), knockback velocity with arena boundary collision, and orbiting dashed status aura rings (cyan for Frozen, orange for Burning, yellow for Shocked).

### 5. Telemetry & DPS Metrics
* Rolling 3-second damage history window calculating instantaneous Damage Per Second (DPS), total accumulated damage, and active spell status badges.
