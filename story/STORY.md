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

### R-082 [done] The browser joins a room
Presentation. The menu has a "Play together" panel: a name, Create room, or a
room code and Join. In a room it lists the party (name, wizard, role, ready),
picking a wizard or role in the menu picks it for the room, Ready toggles, and
the host starts the run. `src/net/client.js` connects to `/ws` (Vite forwards it
to `npm run server`), sends input 30 times a second with a sequence number, and
hands snapshots to a buffer (`src/net/interp.js`) that shows the world about
100 ms behind the server: positions blend between the two snapshots around that
moment, and each snapshot's events play once, when the view reaches it. Every
wizard in the room is drawn (their own model, cast poses and effects) with a
name tag, and a downed wizard shows how far their revive has got. Personal
events of other wizards (their queue, fizzles, damage taken) do not toast or
chime for you. A dropped connection returns you to the menu.

### R-083 [planned] The party on screen
Presentation. The camera frames the party (it follows only you today), a party
strip with each wizard's health and energy, and a scoreboard on defeat.

### R-084 [planned] Netcode polish
Client prediction for the local wizard reconciled with `ack`, snapshot deltas
(under 8 KB/s per client), reconnecting with the same id for 30 s, a ping
display, per-player stats on the defeat screen.

## Campaign (R-090 to R-094)

The design is in `story/CAMPAIGN_PLAN.md` (premise, eight chapters, features, the rest of the requirements to come:
R-095 prologue and Hvítmark Tundra, then one chapter per requirement, the boss framework, Rune Mending, the Siege,
co-op campaign, music). **Decision: build it in the browser port (`src/`) first, with all campaign content as
engine-neutral JSON in `data/`** (`campaign.json`, `story/en.json`, `story/vi.json`, `campaign_enemies.json`), and port
it to Godot afterwards. The campaign is a second door beside Quick play (the current menu, everything unlocked), so
existing behaviour and the seeded digests do not change. New enemies, bosses, hazards and timers are our own tuning,
not playtested, and never touch `spells.json` or `enemies.json`. Web tests are
`tests/web/test_rNNN_<name>.test.mjs`.

### R-090 [done] Campaign data and chapter runner
Core. `data/campaign.json` lists the chapters in order; each has an id, a title, an arena theme, a number of waves,
its ground rules, an objective, its unlocks and its story keys. A small state machine in the sim runs one chapter:
briefing, waves, climax, reward, camp. A cleared wave is a checkpoint: in solo, dying restarts the wave and not the
chapter; in co-op a downed wizard is revived as today and the chapter fails only when everyone is down. Chapter
difficulty comes from the existing wave scaling (`waveRoster`, health and speed scale) and never from changing
`enemies.json`. A malformed campaign file is refused with a clear error. Quick play is untouched: a seeded run
matches its recorded digest.
Built in `src/game/campaign.js` (validation, `loadCampaign`, `CampaignError`), the rules in `sim.js`
(`createCampaignGame`, `createCampaignCoopGame`, `retryChapter`; actions `begin` and `continue`; events `chapterBegin`,
`climax`, `chapterClear`, `camp`, `chapterDone`, `retry`, `chapterFailed`) and the data in `data/campaign.json`, which for now
holds the prologue. In the browser, `?c=<chapter id>` plays a chapter; Enter leaves the camp.

### R-091 [done] Profile and save
Core. A profile keeps what the player has earned: unlocked elements and wizards, grimoire pages found, chapters
cleared and the choices made in them, and the best wave and score per wizard (IMPROVEMENT_PLAN item 7). It is stored in
`localStorage` (the Godot port will use `user://`) as plain JSON with a version number. A missing, corrupt or newer
save falls back to a fresh profile without losing the old one, and storage that throws (a private window) does not
break the game. The menu and the defeat screen show the best wave and score.
Built in `src/game/profile.js` (key `cow_profile`, version 1). A save the game cannot read, or that a newer
version wrote, is copied to a `cow_profile.backup` slot (up to six, never overwriting an older one) before anything new
is saved. Runs are recorded when a quick-play run ends or is given up, pages and cleared chapters when they happen.

### R-092 [done] Element and wizard unlocks
Core and presentation. In the campaign the elements open by chapter (fire, water and earth in the prologue; ice and
lightning; nature and wind; arcane; light; dark) and Thane Granitebrow, Ilsa Galesinger and the Hollow Warden open by
chapter too. A locked element is greyed in the HUD, pressing it is refused with a toast and does not enter the queue,
and no spell that needs it can be cast. Quick play has every element and wizard, as today.
Each chapter lists the elements it opens (`chapter.elements` is everything unlocked up to and including it, computed by
`loadCampaign`); `data/campaign.json` names the `circle` of wizards who start (without it, every wizard no chapter
unlocks), and `wizardsAvailable(campaign, profile.unlocked.wizards)` adds the ones cleared chapters have earned. The sim
refuses a locked element with a `locked` event before the cancel rule runs. The Hollow Warden, Thane and Ilsa are earned,
not given, so they stay locked in the campaign until the chapters that unlock them exist.

### R-093 [done] Objectives: hold, burn, escape
Core. The sim gains objectives besides "survive"; the waves still come as usual, and the objective decides what clearing
the chapter means. Each shows on the HUD with its progress, and the court shows what it is about (the winch, the pile, the
exit ring). Structures and timers scale with the party size through the existing party factor: structure health by the enemy
count factor of `PARTY_SCALE`, the clock by half of it (our tuning, not playtested).
- **Hold.** A structure with health stands where the chapter says. It is a decoy that is not yours to hurt (your spells pass it
  by); every enemy goes for it, near or far, before it goes for you; a cleared wave mends it by `healPct`. When it falls the
  attempt ends like a wipe: solo, the wave comes again with the structure whole; co-op, the chapter is lost.
- **Burn.** A target in the environment that only fire destroys: fire, or a burning body standing in it, lights it; it burns for
  `need` seconds and is gone; water or ice put it out and the burn starts over. The chapter is cleared when the last wave is
  cleared and the target is gone, in either order. If the pile still stands after the last wave, the waves stop and the court waits.
- **Escape.** A clock starts with the chapter. When the last wave is cleared the exit opens, and the chapter is cleared when every
  living wizard has stood in its ring for a second. When the clock runs out the attempt ends like a wipe and the last wave is
  played again.

Parameters and their defaults are in `data/campaign.json` and are checked by `loadCampaign`. A chapter whose objective has no
rules yet (braziers, cross, circle) cannot start; those come with the chapters that use them. Co-op snapshots do not carry the
burn target yet (R-103).

### R-094 [done] Story cards, barks, English and Vietnamese
Presentation. Chapter briefing and ending cards, one-line barks in the quiet after a wave, and per-wizard lines come from one
strings table: `data/story/en.json` and `data/story/vi.json`, keyed by id (engine-neutral; read by `src/game/story.js`).
- **Cards.** A chapter's briefing card shows when it is entered and the chapter waits for "Begin"; its ending card shows at the
  camp, with "Continue". A card has a speaker (Elder Bram), a title and one to six short paragraphs. A chapter with no card
  does not wait. The prologue's two cards are written.
- **Barks.** After a cleared wave (not the last) the wizard says one line of their own, or Bram one of the court's. Every
  wizard has three; which one is chosen depends only on the wave and the chapter, so it is the same every time.
- **Languages.** Every key exists in both languages with the same kind of value; no card refers to a missing key; a missing
  translation falls back to English. The language follows the browser's first language, and EN / VI on the menu switches it
  and remembers the choice (`cow_lang`). Only the story strings change: the HUD, and the Vietnamese subtitles already on it, stay
  as they are.
- **Review.** The Vietnamese text is a draft: it is reviewed by a native speaker before release.

## Cracked Rune handoff in the browser (R-085 to R-087)

The browser port takes the Staff of the Cracked Rune handoff (reference JS in `src/game/`). Gameplay numbers in
the handoff are final; web tests are `tests/web/test_rNNN_<name>.test.mjs`.

### R-085 [done] Two arenas and an arena picker
Presentation. The court is a round arena of radius 24 with four gates on its rim. The menu has an Arena
picker (Court of Waves, Hollow Glade); the choice is kept in the URL as `?a=forest` and sets `game.theme`, which the
view reads to build the court or the glade (their own floor, props, light and water colours). The sim plays the same in
either arena.

### R-086 [done] Eight wizards on five roles
Presentation. The roster has eight wizards, each with a role: the original five plus Thane Granitebrow (earth,
destroyer), Ilsa Galesinger (wind, trickster) and The Hollow Warden (void, controller). Five roles own 45 pair
spells each (225); any wizard can cast any pair without breaking the sim.

### R-087 [done] Painterly effects layer
Presentation. Spell effects are drawn as layered 2D sprites (`fx2d.js` recipes, `arena-fx.js` per-event
casting language, `ice-spear.js`, `earth-fx.js`, `chain-fx.js`) on top of the older particles, whose density is
cut to leave room for them. Every element, alone or mixed, maps to palettes that exist; fire+lightning is plasma,
fire+earth magma, water+ice an ice field. Another wizard's casts in co-op use their own staff tip.

### R-088 [done] Magicka-style spell forms: mines, storms, sprays, arcs
Core and presentation, browser port only (the Godot game has no such forms; `src/game/forms.js` is not in
`data/spells.json`). Twelve named three-element mixes, shared by every wizard like the other named triples; the
numbers are our own tuning. A **mine** (area + `mine`) lies armed at the aim point, ignores an empty court,
trips when an enemy comes within its trigger radius, goes off after a short fuse, and fizzles after 25 s; it never
hurts its owner. A **storm** (area + `repeat`) marks the ground and strikes random points around it for several
seconds, with a cloud and rain (and a sky bolt for lightning). A **spray** (cone + `channel`) follows the caster
and their aim for 1.4 s, hurting what stands in its cone. An **arc** (chain + `forks`) leaves as several bolts, each
jumping on from its own first target, and with no target still flashes one bolt along the aim. All of them ride the
usual rules (energy, recharge, snapshots in co-op). Frost, Thunder and Blight Mine; Thunderstorm, Hailstorm and Ash
Storm; Flamethrower, Frost Breath and Venom Spray; Forked Lightning, Conductive Net and Arcane Web.

### R-089 [done] Every showcase signature in the arena
Presentation, browser port. The effects the fx-showcase marks "not yet in the arena" are wired in
(`src/game/signature-fx.js`, driven by sim events from `arena-fx.js`): Flash Step's afterimages (every dash and blink
leaves four fading ghosts of the caster), Tectonic Rupture's great final spire (any earth slam, under the enemy ahead),
Arcane Missiles (an arcane bolt sends three missiles bowing in on the target), Chain Hook's yank (a landed dark bolt
casts a chain that drags streaks back to the staff), Grave Chains' prison (portals and chains round every enemy
struck), plus Magma Crush's lava drops, geysers and dust wave, Hurricane Eye walking its tornado through the enemy
line (Cyclone), and Arc Plasma's burst at the end of the beam. Render-only; gameplay is unchanged.

### R-110 [done] Quality tiers and crash guards
Browser port only (the Godot game is unchanged). Four graphics tiers (`minimal`, `low`, `medium`, `high`) in
`src/game/quality.js`, a pure module: each tier sets a render-resolution cap and pixel budget, shadow size, bloom,
how many point lights stay lit, particle caps and density, and a frame-rate cap. `high` is the old look. The starting tier
is a guess from the device (`?q=` and the menu's saved choice win; software renderers start at `minimal`, phones and
weak CPUs/GPUs start lower). A frame-time governor drops a tier when the average stays under about 40 fps (at once under
25 fps) and never returns to a tier that was too slow; it climbs one tier after 20 s of steady 57 fps, up to the device's
ceiling. Nothing may blank the page: the WebGL context is made with fallbacks and, when no WebGL exists, a plain
message replaces the game; a lost context pauses the run and resumes on restore; storage that throws (private mode)
is ignored; an effect layer that throws three frames in a row is switched off, and a frame that keeps throwing lowers
the tier and finally stops with a Reload card. The menu and pause screens have a Graphics row (Auto, Low, Medium, High).

### R-111 [done] Play on a phone
Browser port only. On a touch screen (`?touch=1` forces it) the page fills the visible screen (`dvh`, safe-area
insets, no page scroll, no pinch or double-tap zoom on the arena, no long-press menu). The left half is a floating move stick; the Cast pad at the bottom
right casts when touched, keeps recasting while held and aims where it is dragged (untouched, it aims at the nearest
enemy, else along the facing); Area, Self and Dodge are buttons next to it; the ten element keys are a 5 x 2 grid; a
tap on the right half of the arena aims and casts there. The sim is unchanged (a touch stick feeds the same `move`
and aim the keyboard and mouse do). A portrait phone is asked to turn sideways. Phones start at `low` or `medium`,
render at no more than 60 fps, and add a web manifest so the game can be installed full screen.

### R-112 [done] The armory: weapons beside spells
Core and presentation, browser port only (the Godot game is unchanged). Twenty-four weapons in seven families
(blades, axes, hammers and maces, polearms, bows, firearms, thrown) live in `src/game/weapons.js`; thirteen are plain
steel and eleven carry an element, so all ten elements have a weapon. A weapon is a second attack: Q (or the middle
mouse button, or the Weapon button on a phone) strikes, holding it strikes again when the cooldown is up, and it costs
no energy. Melee weapons hit every foe inside their reach and arc after a short wind-up (a bulwark's shield turns half
of a frontal blow); ranged weapons loose bolts, arrows, balls, pellets, axes, stones or runes that fly like spell bolts
(pierce, spread, lob). A hit is a payload like a spell's: steel damage plus the element's damage and statuses, so the
element rules hold (a wet foe takes double lightning, three ice chops freeze, fire burns, light blinds, dark curses);
blunt weapons shatter frozen foes like earth. No attack while frozen, stunned or winding up a spell, and no spell while
swinging. C (and Shift+C) cycles the armory in a fight; the menu's Armory row picks the weapon to start with (each
wizard has their own by default, `?k=` in the URL). The weapon is held in the free hand and swung, thrust, whirled,
drawn or fired with its own trail and shots. Co-op rooms accept the new actions and snapshots carry weapons and their
shots. Single-player runs that never attack are unchanged (the seeded digests still match). The numbers are our own
tuning, not playtested.
