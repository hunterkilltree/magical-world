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
three of ten elements, cast, and the mix decides the spell's shape and effect.
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
(the harness ignores it). R-001 to R-036 belonged to the retired Grauhold Reach
campaign and were removed (see git history); do not reuse those IDs.

## The spell system

### R-037 [done] The spell book turns a queue into a spell
Core. `data/spells.json` loads as is. The queue holds three elements; a fourth
is refused, and queuing fire removes a queued ice (and the other way round;
light and dark cancel the same way, R-050) instead of adding. Resolve order: the
exact key with repeats (earth+earth is Stone Rampart), else three of a kind
powers up its double at x1.3 (fire, fire, fire is Supernova), else the distinct
elements' key with +30% power per repeat (fire, lightning, fire is a
Thunderflare at x1.3), else for three distinct elements with no
entry the highest-ranked pair (wall > area > boulder > chain > bolt > cone)
with the third element riding along at x1.15 ("Molten Core + Water"). Cost is
elements x 8 x the shape's cost; the spell's colour mixes its elements' colours.
Each element adds its hit to the payload (fire burn, water wet + knockback, ice
chill, lightning shock, earth heavy damage + knockback, arcane raw damage),
scaled by the combo's multiplier.

### R-038 [done] Elements react in one place
Core. Every hit goes through one function, in this order. Water puts out
burning (STEAM) and soaks. Fire on a wet target dries it (STEAM), on a frozen
one thaws it, otherwise burns for 3 s. Ice on a burning target puts it out, on
a wet one freezes it for 2.4 s, otherwise adds a chill stack (-16% speed each;
three stacks freeze for 1.8 s). Damage per element is scaled by the enemy's
`resist`; lightning on a wet target does double (CONDUCTED); earth on a frozen
target does x2.2 and breaks the freeze (SHATTER). Frozen or shocked enemies
lose their windup (INTERRUPTED).

### R-039 [done] The wizard moves, dodges and spends energy
Core. WASD moves at 5.4 m/s inside the walkable radius (14.1 m); the wizard
faces the cursor. Energy is 100 and regenerates 18/s; a spell costs its cost.
Casts share a cooldown of min(the shape's cooldown, 0.45 s); areas (2.2 s)
and walls (3 s) also recharge on their own timer. Holding the cast button
recasts the last spell once the queue is empty. Space dodges for 0.26 s at
13.5 m/s (cooldown 1 s): no direct hit lands during it, damage over time still
does. Health is 100; at 0 the run ends.

### R-040 [done] Six spell shapes
Core. A cone (Spray) hits everything in its arc at once, weaker at the edge; a
bolt flies, can come in a fan and pierce; a chain arcs instantly to the
nearest enemy ahead, then jumps on (x0.85 each jump); a boulder flies heavy,
splashes or explodes on impact (Molten Core leaves burning ground, Lodestone
discharges into three enemies); an area sits on the ground ticking (Undertow
pulls, Starfall lands a second later); a wall (Barrier) raises segments that
block enemies and their shots but not yours, and break when their health runs
out (fire melts an ice wall three times as fast).

### R-041 [done] Casting around you and on yourself
Core. Right click (or E) casts the queue around you for x1.3 energy (3 s
cooldown): areas centre on you, walls ring you, anything else blasts 3.4 m with
extra knockback. F casts on yourself for x0.5 energy (1.4 s cooldown): fire
thaws, water cleanses and soaks, ice cools and chills, lightning hastes and
zaps you, earth gives stoneskin (half damage), arcane a ward that soaks 25.

### R-042 [done] Careless casting hurts you
Core. Your own explosions catch you (x0.45 for explosive bolts, x0.3 for
splash), a point-blank explosive cast around you hits you for x0.25, Starfall
for x0.6 if you stand under it, freezing fields and storm pools hit you when you
stand in them, and casting lightning while wet does 7 damage and shocks you.
The HUD names the cause.

## Enemies and waves

### R-043 [done] Three enemies with readable attacks
Core. `data/enemies.json`. The Grave Thrall chases, winds up 0.5 s, lunges for
10 and recovers, and claws walls in its way. The Iron Bulwark is slow, its 65
degree front shield blocks bolts (boulders get through; it drops while frozen,
shocked or winding up), and it slams a 2.2 m disc for 22 that breaks walls. The
Hexcaller keeps 6.5 to 9.5 m away, strafes, charges 0.85 s and fires a slow orb
that can be dodged and is blocked by walls.

### R-044 [done] Endless waves
Core. Wave n brings 3 + 1.5n thralls, hexcallers from wave 2 and bulwarks from
wave 3 (the counts in `enemies.json`'s `waves_preview`), with health x(1 +
0.12(n-1)) and up to +25% speed. They rise for 0.9 s at the three gates
farthest from you. Clearing a wave heals 35%, refills energy, restores the
barrels and gives a 3.5 s break. Each kill scores the enemy's score x(1 +
0.25(wave-1)).

### R-045 [done] The arena reacts
Core. Puddles wet anyone standing in them; lightning charges a puddle for 2.6 s
(5 damage every 0.45 s), ice freezes it for 10 s (chilling anyone on it), fire
thaws it. Dry brush catches from fire or burning bodies, burns 5 s, spreads to
nearby brush after 1.2 s and stays ash for 25 s; water or ice puts it out. Rune
barrels detonate from fire, lightning, arcane or a blast (2.8 m, x0.7 to you).

## Presentation

### R-046 [done] The arena is a 3D scene
Core. The main scene is 3D: the round court with its pillars, puddles, brush,
barrels and gates; the chosen wizard built from `data/wizards.json` and walking
with the roster's gait; the three enemy silhouettes; bolts, boulders, orbs,
areas and walls. A perspective camera (FOV 40) sits at (0, 13.5, 12.5) from the
player, follows them and leans 15% toward the cursor; the mouse aims by a ray
onto the ground. Pillars between the camera and the player fade.

### R-047 [done] HUD, menu, pause and death screens
Core. The menu picks one of the six wizards and starts from a button in the
middle of the screen. The HUD shows health
and energy, the three queue slots, the spell the queue will cast (shape, name
in its colour, cost), the element keys 1 to 6, cooldown tiles (cast, area,
self, dodge), your statuses, and wave / left / kills / score; toasts explain
refusals (queue full, cancel, no energy, recharging, self-inflicted). Esc
pauses and shows the grimoire (spells found so far); the death screen shows the
wave reached, kills, score, damage dealt, self-inflicted damage and spells
found. R restarts when paused or fallen.

### R-048 [done] Game feel
Core. Every enemy attack has a red ground telegraph (thrall wedge, bulwark
disc, hexcaller aim line). Hits flash enemies for 0.14 s; damage numbers are
coloured by element (orange for self-damage); big explosions slow time to x0.2
for 50 ms and shake the screen; status pips sit under enemy health bars; aim
previews show the cone wedge, area ring and wall strip in the queued spell's
colour.

### R-049 [done] A bot clears the first waves
Core. `tests/support/arena_bot.gd` plays through ArenaSim with the real rules
(kiting, mixing elements, dodging telegraphs) and clears wave 3, so the game
stays playable as the code changes.

## Your original elements

The handoff's six elements are joined by the four from the original Grauhold
Reach spell list (nature, wind, light, dark), and the original recipes come
back by name. Numbers for the handoff's own spells are unchanged.

### R-050 [done] Ten elements and a combo for every mix
Core. Nature (7), wind (8), light (9) and dark (0) join fire, water, ice,
lightning, earth and arcane. Light and dark cancel like fire and ice. Every
legal pair and every double has its own spell (Supernova, Tsunami, Glacier
Prison, Thunderstorm, World Tree, Cyclone, Divine Judgement, Black Hole,
Arcane Barrage, Wildfire, Fire Tornado, Solar Flare, Hellfire, Living Vines,
Whirlpool, Rainbow Mist, Photon Railgun, Sandstorm, Crystal Garden, Graveyard,
...), and ten named three-element spells (Firestorm, Meteor Shower, Absolute
Zero, Heaven's Lance, Maelstrom, World Bloom, Ancient Grove, Necropolis,
Inferno Gale, Night Tempest): 74 in all. Nature roots, wind shoves, light
blinds (blinded enemies cannot start an attack), dark curses (+25% damage
taken) and drains life back to you.

### R-051 [done] The new elements react
Core. In the same one function: nature on a wet target roots it for at least
2 s (ENTANGLED); fire on a rooted target burns 50% hotter (KINDLED); wind on a
burning enemy spreads the fire to dry enemies within 2.5 m (FANNED), and on a
wet one adds a chill stack (WINDCHILL); light on a cursed target lifts the curse
and hits x1.5 (PURGED); some spells freeze outright (Glacier Prison, Absolute
Zero); Hellfire ignores resistances. Thralls take x1.3 light and x0.7 dark,
bulwarks x0.4 wind and x1.2 nature, hexcallers x1.5 light and x0.5 dark. Wind
spreads burning brush 4 m further; nature regrows ash.

### R-052 [done] New spell shapes and effects
Core. A beam is an instant line that hits everything within its width and is
stopped by a pillar. Healing areas heal you while you stand in them (World
Tree, Rainbow Mist, Sunbloom, World Bloom). Black Hole and Maelstrom swallow
enemy shots. Meteor Shower drops four blasts around the mark; Supernova leaves
a sea of fire. Wooden walls grow back; crystal walls throw hexcaller orbs back
at the enemies as your own shot.

### R-053 [done] New self-casts
Core. On yourself: nature regenerates 4 health a second for 4 s, wind hastes
you and shoves enemies within 2.6 m away, light heals 15, and dark costs 10
health for 50 energy (a dark pact).

### R-054 [done] The HUD and view show the new elements
Core. The element row has ten keys (1 to 0), each in its element's colour; the
grimoire lists all 74 spells; Rooted and Regen show as statuses; rooted, blinded
and cursed show as pips under enemy health bars; beams draw as a bright ray,
heals as green numbers, and wood and crystal walls have their own look.

## The effects matrix

`story/design/COMBINATIONS_AND_EFFECTS_SUMMARY.md` lists 29 spells with their
effects and looks. Its numbers are on another scale (damage in the hundreds,
radii in pixels), so they are fitted to ours: 50 px = 1 m, durations in seconds
as given, and its cooldowns x0.3 as the spell's own recharge. Damage keeps our
balance, nudged by the file's ranking. Where a matrix recipe lands on a pair
that holds a handoff spell (fire+water, fire+earth, fire+lightning,
water+lightning, water+ice, earth+lightning, water+earth), the handoff spell
stays and the matrix spell moves to a doubled three-element recipe. Each
spell the matrix touched carries its row number as `matrix` in `spells.json`.

### R-055 [done] Every matrix spell has a recipe and the matrix's sizes
Core. All 28 queueable rows resolve to their spell: Steam Bomb (fire, water,
water), Magma Burst (earth, earth, fire), Plasma Spear (fire, lightning,
lightning), Mud Prison (earth, water, water), Mountain Rise (earth, earth,
water) and Magnetic Field (earth, earth, lightning) join the 74. Radius,
duration and cooldown follow the matrix (Black Hole 4 m for 6 s, World Tree
5 m for 12 s, ...), and a matrix spell recharges on its own timer instead of
locking its whole shape.

### R-056 [done] Control effects
Core. Solar Flare stuns and blinds for 3.5 s; Graveyard silences (no
attacks) for 5 s; Abyss Water weakens (-40% damage) for 4 s and drains energy
back to you; Sandstorm makes enemies miss 60% of their attacks; Shadow Storm
confuses (enemies attack the nearest other enemy); Living Vines root for 5 s
and Glacier Prison freezes for 6 s; Mudslide and Mud Prison slow by 80% and
Magma Burst by 60% (other slows stay at 40%).

### R-057 [done] Protective effects
Core. Forest Fortress gives +75% armour for 10 s; Crystal Garden reflects
half the damage you take back at the attacker for 7 s; under the World Tree
you are invulnerable, and casting it grants one revive (back at half health);
Rainbow Mist cleanses burning, chill, slow and stuns while you stand in it;
Death Forest gives back 30% of the damage it deals as health.

### R-058 [done] Battlefield effects
Core. Supernova blasts twice, then leaves 10 s of burning land, and burns
twice as hot; Tsunami washes enemy shots away and leaves a water pool;
Magnetic Field destroys enemy shots and pushes enemies out; Mountain Rise is
a seven-segment stone wall. Thermal Shock (matrix row 9) cannot be queued
because fire and ice cancel, so it is a reaction: fire hitting a frozen enemy
does x1.8 and shows as a critical hit (it still thaws, as in R-038).

### R-059 [done] The matrix's looks
Core. Wildfire spreads seven green-to-amber sub-zones of grass clumps whose
tips catch fire, with drifting leaves; Steam Bomb is a brownish-amber cloud
with a dashed edge and six orbiting wisps; Black Hole is a violet singularity
with a glowing rim and tilted rings; Fire Tornado, Whirlpool and Shadow Storm
spin rings that spiral inward; the water pool, burning land, magma, mud,
magnetic field and the World Tree have their own ground looks; Glacier
Prison raises a permafrost pillar; Divine Judgement drops holy pillars along
its line, Photon Railgun leaves a glowing trail and Plasma Spear branches.
Enemies wear dashed status rings (cyan frozen, orange burning, yellow
shocked, green rooted, ...), and critical hits show as "CRIT -N!".

## Polish

Feel, look and sound, all in the view layer: no gameplay number or sim timing
changes. Effects follow the `elemental-vfx` skill (energy first, an explosion
shape that resolves into the element, no repetition, imply rather than
simulate).

### R-060 [done] Spell effects read as energy moving through elements
Core. Every effect is drawn once, by the VFX director (no second layer of
generic particle bursts). Impacts burst fast and settle slowly: a blast
squeezes for a frame before it bursts, big blasts overlap a smaller second
burst, and a few stragglers fly further than the rest. Water splashes throw
a delayed jet up from the centre; fire throws rogue embers; steam vanishes
quickly, smoke outlives flame, dust settles. Light motes rise and dark ones
sink. A big combo stays within a third of the particle pools.

### R-061 [done] Sound effects from recorded assets
Core. Sim events play recorded CC0 sounds through a manifest (several takes
per sound, pitch jitter, per-sound throttling, an SFX bus with a compressor
and a UI bus); M mutes and the pause screen sets the volume. Missing files
play nothing and raise no error.

### R-062 [done] A themed HUD and screens
Core. One shared theme across the HUD, menu, pause and death screens; health
and energy bars drain through a trailing ghost bar; queue slots are element
orbs that pop in and glow with the combo's colour; cooldowns sweep radially;
the wave banner and toasts animate. Everything R-047 and R-054 show stays.

### R-063 [done] Clear in-world indicators
Core. Enemy telegraphs fill over their wind-up and pulse just before they
strike; enemy health bars drain through a ghost bar; damage numbers pop,
arc and stack instead of overlapping, and so do spell-name callouts; the
reticle dims when the queued spell cannot be cast (energy or recharge).

### R-064 [done] A living arena
Core. Moonlit key light, a night sky and light fog; braziers flicker
smoothly but irregularly and shed embers; dust drifts over the court; gate
banners ripple; puddles shimmer with spreading rings; a faint rune turns at
the heart of the court. Ambient particles stay within a tenth of the pools.

### R-065 [done] Every element moves by its own nature
Core. A second elemental-vfx pass, so each element looks like itself wherever
it appears, not only in blasts. Shadow sinks everywhere it is drawn. Wind is
invisible: it shows only through the dust it carries, swept in a curl. A
projectile hit is a small explosion that resolves per element: fire leaves a
rising wisp of smoke, ice throws a few rigid shards and cold mist that sinks,
earth dust settles, magic motes follow their element. Fire meeting water
splits into steam rising and droplets falling. In a combo the second element
bursts a beat after the first instead of on the same frame. Cast helices
have no exact spacing. Glacier Prison raises its permafrost pillar.

### R-066 [done] Water rolls in as a breaking wave
Core. Tsunami and Torrent draw a real wave in the cartoon style of the water
reference: a deep blue body shading to a lighter, streaked face and a white
foam lip that curls over. It draws back for a beat, rushes out fast and
slows, rises and curls, then the lip plunges: splashes burst up unevenly
along the arc, a jet rises a beat later, and foam spreads and settles into
the pool. Droplets peel off the lip while it rides in. The crest is uneven
and breaks unevenly. Torrent's wave is lower, faster and barely curls. A
Tsunami stays within a third of the particle pools.

## Each wizard's own spells

Every wizard learned the combos their own way. The ten single-element spells
are the same for everyone, but a mix of two or three elements makes that
wizard's own spell: the same queue cast by Aldric and by Brann gives two
different spells. The court book (`data/spells.json`) is not lost: each of its
70 combos is kept, unchanged, by exactly one wizard, the one whose school it
fits; the other five cast their own version (`data/schools.json`, 350 spells).
The school spells are our own tuning, not playtested, but not tuned by feel
either: on the spell bench (`tests/support/spell_bench.gd`, five tough dummies)
each one deals the damage per energy the court's spells of its shape deal for
elements that hit as hard as its own (so water and wind hit softer than fire
and lightning, as in the court book), and each school wall holds as much as the
court's median wall. `harness/calibrate_schools.gd` prints the `mult` a changed
school spell needs.

### R-067 [done] Each wizard casts their own combos
Core. Six schools (Aldric's Unwritten Canon, Brann's Cinderhand's Way, Vela's
Quiet Rime, Old Morrow's Lore, Kessa's Voltmark Method, the Hollow Warden's
Hollow Rite), each with a version of all 70 two- and three-element mixes:
single elements are shared; every court combo is kept by exactly one wizard;
one mix makes six different spells (names unique across all 420, at least three
shapes per mix). The resolve rules (three of a kind powers up the double,
repeats add 30%, a third element rides the best pair, fire/ice and light/dark
cancel) work the same in every book. A school spell casts, recharges and is
found under its own key (`mix@wizard`). School spells use only mechanics the
court's spells already have, never the protective ones (invulnerable, revive,
armour, reflecting the caster); water+water deals no damage, so its versions
push, pull or soak; no school field both burns and roots (kindling would
compound every tick). Each damaging school spell lands within 25% of its bench
target and its `mult` stays between 0.1 and 4.5; each school wall within 20%
of the court's median wall health. Every school spell casts aimed and as a
nova, and draws through the real view without an error.

### R-068 [done] The HUD shows the wizard's own book
Core. The menu card names the chosen wizard's school; the spell preview, the
cast and the pause grimoire use that wizard's book, with their own spells and
the court spells they keep, and "spells found" counts against it.

## The look of each school

The elemental-magic tradition (after Scott Cunningham's *Earth Power* and
*Earth, Air, Fire & Water*: the four elements and spirit, their quarters and
colours, and natural magic worked with stones, candles, ice, wind, written signs
and knotted cords) gives each wizard's combos a look of their own, so the same
mix cast by two wizards no longer looks the same. Single elements stay shared.

### R-070 [done] Each school's spells look like that school
Core. Each school has a look in `data/schools.json` (a circle, a motif and a
tint, its wizard's glow): Aldric draws a five-pointed star for the five
elements with three small runes circling it and leaves glyphs; Brann lights a
ring of candle flames that gutter into smoke and leaves embers; Vela grows a
six-fold frost crystal with a mirror glint and leaves frost; Morrow raises a
ring of standing stones on a sand circle and leaves grit; Kessa spins a wind
whorl that throws small forks and leaves sparks; the Hollow Warden draws a
knotted cord that tightens inward and leaves sinking wisps. A combo's colour
leans 35% toward its caster's glow (court spells they keep too); single
elements keep the shared rune and colour. The motif rides the projectile and
marks where the spell lands. Every combo, from any book, lights its elements'
quarters of the circle: earth and nature in the north (up the screen), air
(wind, lightning) in the east, fire and light in the south, water and ice in
the west, arcane and dark at the heart. A school combo stays within a third of
the particle pools.

## Co-op (web port)

Plan and tech choices: `story/COOP_PLAN.md`. Co-op lives in the browser port (`src/`);
the Godot project is unchanged. Up to four wizards fight the same waves; an
authoritative Node server runs `src/game/sim.js` and clients send input and render
snapshots. Web tests are `tests/web/test_rNNN_<name>.test.mjs` (`harness/run.sh web`).

### R-080 [done] The sim runs one to four wizards
Core. `createCoopGame` makes a game with up to four players (ids `p1` to `p4`,
each with their own wizard, role, queue, energy and cooldowns); `addPlayer` and
`removePlayer` change the party; `step(game, {players: {id: input}}, dt)` drives
them all, and the old single-input shape still drives player 0. Enemies go for
the nearest living player; spawn gates are chosen far from the party; a wave has
x(1 + 0.4(N-1)) health and x(1 + 0.5(N-1)) enemies. At 0 health a player is
downed (not dead): a living ally within 1.8 m revives them in 3 s at 40% health,
and a cleared wave raises everyone; the run ends only when every player is down.
Your own explosions hurt allies at half the rate they hurt you; fields that hit
everyone and barrels hit all. Fields that heal or ward help anyone standing in
them. There is no pause and no hit-stop in co-op. Single-player behaviour is
unchanged (a seeded run matches its recorded digest).

### R-081 [done] A room server for up to four players
Core. `server/` runs a Node WebSocket server. A player joins a room by its
four-letter code (no code makes a new room); a fifth is refused (`room_full`).
Players pick a wizard and role, ready up, and the host starts. The server steps
each room's sim at 60 Hz from the latest input of each player and sends
snapshots (20 Hz) with every event since the last one. It validates every
message (shape, size, element/wizard/role whitelists) and clamps input; a player
who leaves is removed (the host passes to the next player); an empty room is
destroyed. Protocol in `src/net/protocol.js`.

### R-082 [planned] The browser joins a room
Presentation. Lobby screen (room code, names, wizard and role, ready); client
networking that sends input and applies snapshots to a local game the renderer
understands, with entity interpolation about 100 ms behind.

### R-083 [planned] Four wizards on screen
Presentation. One wizard rig per player with a name tag, the camera frames the
party, a party strip with each wizard's health and energy, revive rings and a
scoreboard on defeat.

### R-084 [planned] Netcode polish
Client prediction for the local wizard reconciled with `ack`, snapshot deltas
(under 8 KB/s per client), reconnecting with the same id for 30 s, a ping
display, per-player stats on the defeat screen.
