# Element by element

Book principles per element, followed by how they apply to Court of Waves spells. Times in
seconds. Element names match `data/spells.json` (fire, water, ice, lightning, arcane, earth,
nature, wind, light, dark).

## Water: splashes

A splash is two events.

**Primary splash** (on impact): water thrown up and out around the object. Three shapes:
- **Bowl**: round objects (or spinning ones). A cup of water rising round the impact; may
  close over the top or flare outward. An irregular object fractures the bowl.
- **Sheet**: a flat face hitting the surface. A sheet clings to the object's edge and shoots
  up, concave or convex, thick or thin.
- **Spray**: jagged, very fast, or glancing hits. Mostly separate drops (a bullet = all spray).

**Sheet tearing:** as the sheet stretches, small holes appear at irregular (never evenly
spaced) points, grow, merge, and reduce it to strings and beads of droplets. Holes follow the
direction of the force; they never tear across it. This happens within about 1 s for a
medium splash, while the sheet is still rising, and continues until the last drop lands.
Early frames: explosive, directional. Later: rounder, droopier, gravity-led.

**Secondary splash** (after a beat): the cavity punched under the surface refills.
- **Jet**: a thin column shoots straight up from the impact point, twisting and throwing
  drops, then collapses and pushes rings outward. Even when there is almost no primary (a
  pebble, a raindrop), keep a beat (about 0.2-0.5 s) before the jet. This secondary is what
  separates great splashes from average ones.
- **Surge/geyser**: heavy, large objects. A thick mass bursts up at the impact point.
- **Boil**: when the air pocket was dragged deep, a convex dome rises, rolls over like a
  mushroom cloud, and spreads as rings; bubbles keep surfacing afterwards.
- A falling jet can trigger another, smaller secondary. One or two extra are plenty.

**Which dominates:** small fast dense object = tiny primary, strong jet. Big flat drop =
big primary and big secondary. Glancing skim = primary only. Buoyant object = primary only,
plus a little rebound ripple. Heavier/denser = deeper, bigger secondary.

**Ripples:** rings spreading from impacts and bursting bubbles; their bright line wobbles in
width as it travels; overlapping rings interfere. A pool also gets a slight level rise: water
displaced has to go somewhere, and waves bounce off walls.

Game use: water blasts (`crown`), water cones (spray + water sparks), puddles, steam combos.
Give impacts a primary burst plus a delayed, central upward jet, then a ring. Droplets should
fall and land, not fade mid-air.

## Water: waves and surfaces

- Wind pushes energy into water; waves are rolling "engines" carrying energy, not water,
  forward. Near shallows they rise, peak, and spill or plunge.
- Surfaces carry several overlapping wave systems at once (chop over swell). Vary size and
  timing; never a regular march.
- Displacement: anything entering water pushes an equal volume outward.

## Fire

- **Fire is a fluid.** It is glowing, burning particles carried on hot air rising through
  cooler air. Treat each burst of flame as a *bubble of hot air rising through water*: it
  mushrooms, rolls, curls, and gets pinched by the surrounding cool air.
- **Flag motion underneath:** flames wave like a flag from their source; tips tear off and
  vanish within ~0.1 s. Pieces may appear and disappear randomly; volume changes freely.
  Too-careful, predictable fire is the common failure.
- Flames wrap and hug the object they burn (cool air flattens them against it) while looking
  for an escape upward. Every lick and pop is hot gas trying to expand.
- Shapes: hooked tongues, opposed curling barbs, spirals tucking into rolling billows that
  rotate up and away from the centre.
- Clean fuels burn blue and smokeless; dirty fuels throw dark smoke and soot. Colour and
  smoke amount describe the fuel.
- **Embers:** most follow the main updraft in a strong collective sweep, but some shoot off
  sideways or spiral erratically like tiny rockets. Include a few rogues.
- Motion blur defines what we see as "fire shape": stretch sparks along velocity.

Game use: fireball blasts (fireball shader + flame + hotsmoke + heat haze), fire cones,
burning ground. Flame sprites need buoyancy and drag so they rise and slow; hot smoke should
outlast flame and keep rising; heat haze should linger after the flash.

## Smoke, steam, dust (they start alike, end differently)

All three can look identical at birth. Their resolve tells them apart:
- **Smoke**: carried by heated air, keeps rising unless wind pushes it; billows and folds
  over itself as cooler air tries to flatten it; dissipates slowest of all (it lingers).
- **Steam**: also rises on heat but is absorbed by the air quickly; it simply vanishes.
  Short life, quick fade, little darkening.
- **Dust**: kicked up by impact, wind, or blasts; heavier, drifts and settles back to the
  ground before long (negative or low buoyancy, gentle gravity).
- Thin linear smoke (incense) unfolds in a sinuous ribbon; rolling layers can curl into
  intricate balls.

Game use: steam (fire+water) should flash up and disappear; earth/blast dust should drift
outward and sink; smoke after fire should rise and linger longest.

## Explosions

Recipe (exaggerated, which works better than literal):
1. Optional build-up (charging energy, crackle) to anticipate.
2. A one-frame inward squeeze, then a very fast outward burst (straight radial streaks).
3. A punch of light (brief flash, light pulse, camera kick, short hitstop already in sim).
4. Sharp deceleration; the cloud keeps expanding slowly and fades over a long tail (the
   book's sample runs 80+ frames, ~3.3 s, with only a few burst frames).
5. Debris and sparks reach apex then fall, fading; some bounce, roll, settle. A few fly far.
6. Smoke turns from directional blast shapes to billowing, mushrooming, rising.
7. Overlap: a smaller secondary blast while the first decelerates.

Game use: `blast`, `explode_fx`, big three-element signatures in `_sig`. The burst should be
the shortest phase; the linger (scorch decal, smoke, glow) the longest.

## Magic (pixie dust, sparkle, arcane, light, dark)

- **Per-particle personality:** some sparkles grow from a dot, swell, and shrink; some spin
  while pulsing; some twinkle at random; many wink in and out of existence. That mixed,
  shimmering chaos is what makes classic hand-drawn magic feel alive.
- **Lifespans vary per particle**, not one range for all. Spawn and remove with intent.
- **Sparse beats dense.** Far fewer particles often look far better; over-dense dust is the
  most common mistake.
- **Path is sacred:** the trail must flow smoothly through turns and perspective; one bump
  kills the magic.
- **Physics can change mid-flight to suit the moment:** classic dust drips down in falling
  curtains; on a sharp turn it can spray outward like a water-ski wake, billow like smoke,
  or float upward like bubbles, then return to dripping. Invent a physics for each magic
  type and keep it consistent within that type.

Game use: arcane, light, dark, nature motes, runes, the cast "callout" moment. Give each
magic element its own physics: e.g. arcane drifting and orbiting, light rising and twinkling,
dark sinking and swallowing, nature floating like spores/leaves.

## Ice, earth, crystals (solid matter in an explosion)

- Burst like everything else, then behave as rigid solids: shards keep their shape (unlike
  fluids), tumble with spin, bounce with energy loss, settle. Ice shatter = explosion of
  brittle pieces with the occasional far-flung straggler, plus cold mist that sinks.
- Growth (ice spikes, walls) can anticipate: small delay, fast ease-out pop, a slight
  overshoot reads as force.

## Lightning

- Pure, near-instant energy: one or two frames of strike, branching (fractal) paths, a light
  punch, then a short afterglow and sparks. Branches radiate from the strike point, as all
  energy does from its source. Keep it brief; its resolve is the scorch and sparks.

## Combos

- Show the shared force once (one burst, one direction), with each element revealing its own
  behaviour as the energy fades: e.g. fire+water bursts outward together, then splits into
  fast-vanishing steam rising and droplets falling.
- Overlap the elements in time instead of firing everything on the same frame.
- Interactions are where the most spectacular effects are (lava into the sea: splash, hiss,
  steam clouds, swirling currents). Let one element visibly affect the other.
