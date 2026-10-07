# Grauhold Reach

Design reference lives in `story/design/` (Three.js mockups: zone maps, overworld,
wizards, weapons). Game data extracted from it lives in `data/`
(`zones.json`, `overworld.json`, `spells.json`). 2D top-down view; the zone grids
are tile maps (26 x 18).

## Premise

Grauhold Reach is a single landmass of six linked zones. Its keep fell to the
**Hollow Warden**, a void necromancer who drew the crystal light out of the
Sunken Verrglass and poured the dark into the land. Everything beyond the
Hvítmark shore now answers to him: raiders on the ice, ambushers in the pines,
a bound Colossus in the cinder wastes.

You are a wizard carrying the **Staff of the Cracked Rune**. Its rune split the
night the Reach fell, and it can only mend by casting: two elements woven
together, in the right order. Each zone's boss is a crack in the Warden's hold.
Break all three and you can go down to the Verrglass and end him.

Tone: grim but wry, Norse-flavoured. Spell chaos is part of the fun; combos
can and will backfire on the caster.

## Chapters (one per zone)

| # | Zone | Objective | Boss |
|---|------|-----------|------|
| 1 | Hvítmark Tundra | Cross the shelf, hold the north bridge until the gate opens. | none |
| 2 | Ashvold Pinewood | Reach the north-east cache without being flanked. | none |
| 3 | Grauhold Keep | Breach the gatehouse, take the inner court, kill the Warden. | Warden of the Keep |
| 4 | Eldrhólt Wastes | Cross three cinder islands, break the Colossus. | Cinder Colossus |
| 5 | Mirefen Bog | Follow the causeways to the sunken barge, get out before dark. | none |
| 6 | Sunken Verrglass | Descend the crystal throat to the hollow. The way out is the way in. | Verrglass Hollow (the Hollow Warden) |

Campaign routes (`data/overworld.json`): tundra-pine, pine-keep, keep-volcano,
pine-bog, bog-keep, bog-cavern. The cavern is reached only through the bog.

Story beats:

1. **Landing.** The party lands on the south shelf. Thralls hold the ice bridge.
   Lesson: fire and ice trade blows; thin ice breaks under weight.
2. **The pines.** A woodcutter's cache holds the first rune fragment. Burning the
   log pile opens the short way, and announces you to the wood.
3. **The keep falls back.** The Warden of the Keep, the Hollow Warden's captain,
   dies in the boss court and drops the second fragment. The hub is yours.
4. **The cinder wastes.** A bound fire spirit guards the third fragment. The
   Colossus is not evil, only chained; breaking it frees the lava channels.
5. **The bog.** Slow ground, dead stands, a sunken barge carrying the Warden's
   supply of void-glass. Take it, and the way to the cavern opens.
6. **The Verrglass.** The Hollow Warden waits on the crystal dais. The Cracked
   Rune, mended with all three fragments, is the only thing that hurts him.

## Requirements

Format (parsed by `harness/run.sh reqs`):

    ### R-NNN [status] Title

Status is `planned` (no test needed yet), `active` (being built; must have a
test) or `done` (must have a passing test). Each active/done requirement needs
`tests/story/test_rNNN_<name>.gd`. To start work on a requirement, change it
to `active` and write its test first. `active` also marks a requirement whose
test exists but has not yet been confirmed passing in real Godot.

### R-001 [done] The wizard moves in any direction
Chapter 1. Movement input produces a velocity of exactly 200 px/s in that
direction; diagonals are not faster; no input means no movement.

### R-002 [done] Zone data is valid
Data. `data/zones.json` holds the six zones in order (tundra, pine, keep,
volcano, bog, cavern), each a 26 x 18 grid of known tile characters with an
entry and an enemy spawn; boss pads exist only in keep, volcano and cavern.

### R-003 [done] Spell data is valid
Data. `data/spells.json` has unique spell ids, ordered recipes unique across
spells, every recipe element in the nine-element list, and every spell type in
{aoe, beam, projectile, vortex, barrier, summon, buff}.

### R-004 [done] A zone grid becomes a playable level
Chapter 1. Loading a zone gives a grid with collision (blocker, void and cover
tiles are never walkable; the wizard cannot walk into them), places the party
at the entry tiles, and exposes enemy spawns, loot, gates and boss pads on
their tiles.

### R-005 [done] Elements queue and combine into spells
Chapter 1. The wizard queues up to two elements; order matters. Casting a full
queue resolves the recipe in `spells.json` (e.g. fire + ice = Thermal Shock)
and clears the queue. An unknown pair falls back to a plain bolt of the first
element.

### R-006 [done] Spells deal damage with cooldowns
Chapter 1. An aoe spell damages every enemy within its radius once per cast;
a spell cannot be recast until its cooldown has elapsed.

### R-007 [done] The wizard has health and can fall
Chapter 1. Health starts at 100, never goes below 0, and a `died` signal fires
exactly once at 0.

### R-008 [done] Enemies spawn at E tiles and chase
Chapter 1. Each enemy spawn tile spawns a thrall that moves toward the nearest
living wizard within sight range and damages it on contact with a cooldown.

### R-009 [done] Terrain hazards act on whoever stands in them
Chapter 1-5. `~` tiles apply the zone's hazard: thin ice breaks under weight,
lava and void pools damage over time, bramble and mire slow movement. `,` rough
tiles slow movement by a fixed factor.

### R-010 [done] Chokepoint gates open on objective
Chapter 1. `G` tiles block passage until the zone's gate condition is met
(zone 1: hold the north bridge for a set time); then they open permanently.

### R-011 [done] Destructible tiles break
Chapter 2. A `D` tile takes damage and is removed when destroyed; fire damage
destroys log piles and dead stands outright and opens their lane.

### R-012 [done] Loot caches grant a rune fragment or item
Chapter 2. A `C` tile can be opened once; it adds its item to the party's
inventory and is marked looted for the rest of the run.

### R-013 [done] Zone 1 can be completed end to end
Chapter 1. A scripted run from entry, through both gates and the cache, to the
north exit marks Hvítmark Tundra complete.

### R-014 [done] Zones 2 to 6 can be completed
Chapters 2-6. Each zone has a scripted run test to its exit or boss, built one
zone at a time in chapter order, in `tests/story/test_r014_zone_runs.gd`:
pine (loot the north-east cache), keep (reach the court, kill the Warden),
volcano (cross the lava, break the Colossus), bog (loot the barge, return to the
landing before dark), cavern (reach the boss dais; the Hollow Warden itself is
R-019). The keep grid was patched (see `data/zones.json`, row 12, columns 11-12)
because the court was sealed in the original design.

### R-015 [done] Bosses fight in phases and end their zone
Chapters 3, 4, 6. A `B` pad spawns the zone's boss with health and at least two
phases; defeating it completes the zone and drops its rune fragment (keep and
volcano drop fragments 2 and 3; the final boss in the cavern drops none).
Boss data lives in `data/bosses.json`.

### R-016 [done] The campaign follows the route graph
Overworld. Completing a zone unlocks its connected zones per
`data/overworld.json`; the cavern stays locked until the bog is complete.

### R-017 [done] Progress saves and loads
Overworld. Completed zones, looted caches and rune fragments survive a quit
and reload.

### R-018 [planned] Six wizards with different affinities
Selection. Each of the six wizards (Aldric, Brann, Vela, Morrow, Kessa, the
Hollow Warden's shade, unlocked later) boosts damage of its own element.

### R-019 [done] Ending
Chapter 6. The three rune fragments come from the pine cache (1), the Warden of
the Keep (2) and the Cinder Colossus (3). Defeating the Hollow Warden (the
cavern boss, `final` in `data/bosses.json`) while holding all three mends the
Cracked Rune (`cracked_rune_mended` joins the inventory) and plays the ending;
without all three he cannot be damaged.

### R-020 [planned] Non-area spell types
Chapters 1-6. Beam, projectile, vortex, barrier, summon and buff spells each
behave per their `type` in `data/spells.json` (R-006 covers aoe only).

## Playable flow

Wiring the finished systems into the running game. The logic lives in
`scripts/core/` (testable headlessly); `scripts/main.gd` is a thin view.

### R-021 [done] A game session ties campaign, save and zones together
Flow. A new game starts at Hvítmark Tundra with nothing. Only unlocked zones can
be entered. Completing a zone autosaves; continuing restores completed zones,
looted caches and the inventory, and a looted cache stays looted when the zone
is re-entered. Finishing the game is remembered (the mended rune is saved).

### R-022 [done] A zone plays out end to end
Flow. Entering a zone puts the wizard on the entry, thralls on the enemy spawns
and the boss on its pad. Each tick runs movement, terrain, gates, enemies, the
boss, the dark timer and the objective. Stepping on a cache opens it. Spells
cast from the element queue hit enemies and the boss, and fire spells burn
destructible tiles in their radius. A zone ends complete, dead or failed.

### R-023 [done] The main scene is a playable menu, overworld, zone and ending
Flow. Menu (New Game, Continue), an overworld listing the six zones with their
locked, open and complete state, the zone view with a HUD, a result banner
after each zone, and an ending screen after the Hollow Warden falls.

