# Court of Waves

An elemental arena game in the style of Magicka, set in the Court of Grauhold Reach.
The design reference is the playable prototype handed off in
`story/design/court_of_waves/` (`Court of Waves - playable.html`, its `README.md`,
and the readable source in `reference/`, mainly `reference/game/sim.js`). Its
tuning tables are `data/spells.json` and `data/enemies.json`; the six wizards
are `data/wizards.json`. **The gameplay numbers are final (from playtesting):
use the data files, do not retune by feel.** Visuals are placeholders built from
basic shapes; match readability (a colour per element, telegraph shapes,
silhouettes), not the meshes.

## Core pillar (most important)

**The defining mechanic is combining elements to create spells.** Queue up to
three of six elements, cast, and the mix decides the spell's shape and effect.
Elements react with each other, with enemies and with the arena (puddles, dry
brush, rune barrels), and careless casting hurts the caster. When a design or
implementation choice competes with this, the element-combining spell system
wins.

## Premise

The Hollow Warden's thralls rise from the court's four gates in endless waves.
You are one of six wizards (Aldric, Brann, Vela, Morrow, Kessa or the Hollow
Warden's own shade), carrying the Staff of the Cracked Rune. There is no
winning, only how long you last: the wave you reach, your kills and your score.

Tone: grim but wry. Spell chaos is part of the fun; combos can and will
backfire on the caster.

## Requirements

Format (parsed by `harness/run.sh reqs`):

    ### R-NNN [status] Title

Status is `planned` (no test needed yet), `active` (being built; must have a
test) or `done` (must have a passing test). Each active/done requirement needs
`tests/story/test_rNNN_<name>.gd`. To start work on a requirement, change it
to `active` and write its test first. A retired requirement is `superseded`
(the harness ignores it).

## The spell system

### R-035 [done] The spell book turns a queue into a spell
Core. `data/spells.json` loads as is. The queue holds three elements; a fourth
is refused, and queuing fire removes a queued ice (and the other way round)
instead of adding. Resolve order: the exact key with repeats (earth+earth is
Stone Rampart), else the distinct elements' key with +30% power per repeat
(fire, fire is a Flame Gout at x1.3), else for three distinct elements with no
entry the highest-ranked pair (wall > area > boulder > chain > bolt > cone)
with the third element riding along at x1.15 ("Molten Core + Water"). Cost is
elements x 8 x the shape's cost; the spell's colour mixes its elements' colours.
Each element adds its hit to the payload (fire burn, water wet + knockback, ice
chill, lightning shock, earth heavy damage + knockback, arcane raw damage),
scaled by the combo's multiplier.

### R-036 [done] Elements react in one place
Core. Every hit goes through one function, in this order. Water puts out
burning (STEAM) and soaks. Fire on a wet target dries it (STEAM), on a frozen
one thaws it, otherwise burns for 3 s. Ice on a burning target puts it out, on
a wet one freezes it for 2.4 s, otherwise adds a chill stack (-16% speed each;
three stacks freeze for 1.8 s). Damage per element is scaled by the enemy's
`resist`; lightning on a wet target does double (CONDUCTED); earth on a frozen
target does x2.2 and breaks the freeze (SHATTER). Frozen or shocked enemies
lose their windup (INTERRUPTED).

### R-037 [done] The wizard moves, dodges and spends energy
Core. WASD moves at 5.4 m/s inside the walkable radius (14.1 m); the wizard
faces the cursor. Energy is 100 and regenerates 18/s; a spell costs its cost.
Casts share a cooldown of min(the shape's cooldown, 0.45 s); areas (2.2 s)
and walls (3 s) also recharge on their own timer. Holding the cast button
recasts the last spell once the queue is empty. Space dodges for 0.26 s at
13.5 m/s (cooldown 1 s): no direct hit lands during it, damage over time still
does. Health is 100; at 0 the run ends.

### R-038 [done] Six spell shapes
Core. A cone (Spray) hits everything in its arc at once, weaker at the edge; a
bolt flies, can come in a fan and pierce; a chain arcs instantly to the
nearest enemy ahead, then jumps on (x0.85 each jump); a boulder flies heavy,
splashes or explodes on impact (Molten Core leaves burning ground, Lodestone
discharges into three enemies); an area sits on the ground ticking (Undertow
pulls, Starfall lands a second later); a wall (Barrier) raises segments that
block enemies and their shots but not yours, and break when their health runs
out (fire melts an ice wall three times as fast).

### R-039 [done] Casting around you and on yourself
Core. Right click (or E) casts the queue around you for x1.3 energy (3 s
cooldown): areas centre on you, walls ring you, anything else blasts 3.4 m with
extra knockback. F casts on yourself for x0.5 energy (1.4 s cooldown): fire
thaws, water cleanses and soaks, ice cools and chills, lightning hastes and
zaps you, earth gives stoneskin (half damage), arcane a ward that soaks 25.

### R-040 [done] Careless casting hurts you
Core. Your own explosions catch you (x0.45 for explosive bolts, x0.3 for
splash), a point-blank explosive cast around you hits you for x0.25, Starfall
for x0.6 if you stand under it, freezing fields and storm pools hit you when you
stand in them, and casting lightning while wet does 7 damage and shocks you.
The HUD names the cause.

## Enemies and waves

### R-041 [done] Three enemies with readable attacks
Core. `data/enemies.json`. The Grave Thrall chases, winds up 0.5 s, lunges for
10 and recovers, and claws walls in its way. The Iron Bulwark is slow, its 65
degree front shield blocks bolts (boulders get through; it drops while frozen,
shocked or winding up), and it slams a 2.2 m disc for 22 that breaks walls. The
Hexcaller keeps 6.5 to 9.5 m away, strafes, charges 0.85 s and fires a slow orb
that can be dodged and is blocked by walls.

### R-042 [done] Endless waves
Core. Wave n brings 3 + 1.5n thralls, hexcallers from wave 2 and bulwarks from
wave 3 (the counts in `enemies.json`'s `waves_preview`), with health x(1 +
0.12(n-1)) and up to +25% speed. They rise for 0.9 s at the three gates
farthest from you. Clearing a wave heals 35%, refills energy, restores the
barrels and gives a 3.5 s break. Each kill scores the enemy's score x(1 +
0.25(wave-1)).

### R-043 [done] The arena reacts
Core. Puddles wet anyone standing in them; lightning charges a puddle for 2.6 s
(5 damage every 0.45 s), ice freezes it for 10 s (chilling anyone on it), fire
thaws it. Dry brush catches from fire or burning bodies, burns 5 s, spreads to
nearby brush after 1.2 s and stays ash for 25 s; water or ice puts it out. Rune
barrels detonate from fire, lightning, arcane or a blast (2.8 m, x0.7 to you).

## Presentation

### R-044 [done] The arena is a 3D scene
Core. The main scene is 3D: the round court with its pillars, puddles, brush,
barrels and gates; the chosen wizard built from `data/wizards.json` and walking
with the roster's gait; the three enemy silhouettes; bolts, boulders, orbs,
areas and walls. A perspective camera (FOV 40) sits at (0, 13.5, 12.5) from the
player, follows them and leans 15% toward the cursor; the mouse aims by a ray
onto the ground. Pillars between the camera and the player fade.

### R-045 [done] HUD, menu, pause and death screens
Core. The menu picks one of the six wizards and starts. The HUD shows health
and energy, the three queue slots, the spell the queue will cast (shape, name
in its colour, cost), the element keys 1 to 6, cooldown tiles (cast, area,
self, dodge), your statuses, and wave / left / kills / score; toasts explain
refusals (queue full, cancel, no energy, recharging, self-inflicted). Esc
pauses and shows the grimoire (spells found so far); the death screen shows the
wave reached, kills, score, damage dealt, self-inflicted damage and spells
found. R restarts when paused or fallen.

### R-046 [done] Game feel
Core. Every enemy attack has a red ground telegraph (thrall wedge, bulwark
disc, hexcaller aim line). Hits flash enemies for 0.14 s; damage numbers are
coloured by element (orange for self-damage); big explosions slow time to x0.2
for 50 ms and shake the screen; status pips sit under enemy health bars; aim
previews show the cone wedge, area ring and wall strip in the queued spell's
colour.

### R-047 [done] A bot clears the first waves
Core. `tests/support/arena_bot.gd` plays through ArenaSim with the real rules
(kiting, mixing elements, dodging telegraphs) and clears wave 3, so the game
stays playable as the code changes.

## Retired: the Grauhold Reach campaign

The six-zone grid campaign was replaced by Court of Waves. Its requirements are
kept here for history; their code and tests were removed.

- R-001 [superseded] The wizard moves in any direction
- R-002 [superseded] Zone data is valid
- R-003 [superseded] Spell data is valid
- R-004 [superseded] A zone grid becomes a playable level
- R-005 [superseded] Elements queue and combine into spells
- R-006 [superseded] Spells deal damage with cooldowns
- R-007 [superseded] The wizard has health and can fall
- R-008 [superseded] Enemies spawn at E tiles and chase
- R-009 [superseded] Terrain hazards act on whoever stands in them
- R-010 [superseded] Chokepoint gates open on objective
- R-011 [superseded] Destructible tiles break
- R-012 [superseded] Loot caches grant a rune fragment or item
- R-013 [superseded] Zone 1 can be completed end to end
- R-014 [superseded] Zones 2 to 6 can be completed
- R-015 [superseded] Bosses fight in phases and end their zone
- R-016 [superseded] The campaign follows the route graph
- R-017 [superseded] Progress saves and loads
- R-018 [superseded] Six wizards with different affinities
- R-019 [superseded] Ending
- R-020 [superseded] Non-area spell types
- R-021 [superseded] A game session ties campaign, save and zones together
- R-022 [superseded] A zone plays out end to end
- R-023 [superseded] The main scene is a playable menu, overworld, zone and ending
- R-024 [superseded] Gates open when the thralls are cleared
- R-025 [superseded] Casting gives visible feedback
- R-026 [superseded] The whole game is beatable
- R-027 [superseded] An element bar and letter keys
- R-028 [superseded] Floating damage numbers
- R-029 [superseded] Beams look like beams
- R-030 [superseded] Raised walls and lived-in tiles
- R-031 [superseded] A bottom-centre element queue bar
- R-032 [superseded] Up to five elements combine into one spell
- R-033 [superseded] Click to move, aim with the mouse
- R-034 [superseded] Characters are drawn in depth order
