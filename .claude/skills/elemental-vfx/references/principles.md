# Core principles

Distilled from Joseph Gilland, *Elemental Magic, Vol. II* (2012). Paraphrased and adapted
for a real-time 3D arena game. Frame counts in the book are at 24 fps; here they are given
in seconds (1 frame = ~0.042 s).

## 1. Energy is the subject

- Matter at rest is still. A pool, a candle flame in still air, a pile of dust: nothing moves
  until a force arrives. The look of an effect = **the driving energy + the material's own
  behaviour**. The same rock into water gives a fluid splash; into thick porridge, a globby
  one with few drops breaking off. Change the material, keep the energy, and the shape
  changes.
- Method-act the element: "If I were this pool and a flat stone hit me at 45 degrees, what
  would I do?" Decide the force's origin, direction, strength, and what resists it.
- Wind is invisible. It is only shown through what it moves (smoke bending, dust lifting,
  water chopping, flames leaning). A wind effect with no carrier reads as nothing.

## 2. The explosion shape is universal

- Any rapid outward release of energy is an explosion: a raindrop on a puddle, a shattering
  cup, a match striking, a grape popping, a spell impact.
- In the first instant every material looks the same: straight, directional, fast streaks
  radiating from the source. The eye cannot see the material yet, only speed.
- As energy drains, the material "returns to its natural state": water rounds into drops and
  sheets and falls; smoke slows into billows riding air currents; dust drifts down; shards
  bounce and settle. The further from the source, the more natural the shape.
- Timing curve: an extremely fast expansion followed by an abrupt slow-down, then a long,
  gentle resolve. Real explosions grow smoothly over 3-30 frames (0.1-1.25 s); that looks
  flat when animated. Exaggerate: compress the burst, stretch the resolve.

## 3. Anticipation, punch, overlap

- **Anticipation:** before a big release, pull inward. In the book's explosion, frame 1
  expands slightly, frame 2 *shrinks* for one frame, then it bursts. For spells: energy
  gathering into the staff, a ring contracting, a squeeze of the core before the blast.
- **Punch frames:** after the burst, one inverted/negative frame and one high-contrast frame
  hit the eye with light. In a game, do this gently: a single low-alpha flash, a light
  pulse, a chromatic punch, or a camera kick. Never strobe.
- **Overlap:** while the first burst is decelerating, fire a second, smaller burst (cloned,
  offset in time and position). Overlapping action adds life cheaply. Layering a few copies
  of one good splash at staggered start times builds a huge one.
- **Stretch and squash:** fast particles stretch along velocity; impacts squash. Cartoony
  exaggeration is allowed and usually better.
- Extreme example: a single frame of raw blast, then straight into a slowly rolling
  mushroom cloud. Fewer burst frames, more resolve frames.

## 4. Chaos over repetition

- The brain loves repeating patterns and will put them into your effect unasked: even
  spacing, equal sizes, metronome timing. Nature never repeats exactly.
- Fix by "push and pull": take a regular design and nudge a few key points up/down,
  in/out, earlier/later. Regular structure underneath is fine; the surface must vary.
- Variation matters more up close. Far away, a field of similar waves is acceptable.
- Always keep "the ones that got away": a few pieces flying much further than the rest.
- Asymmetry follows the force: an angled impact throws more material to the far side; a
  spinning object breaks symmetry.

## 5. Simplify and imply

- Real water is mostly reflection and thousands of droplets; real fire is a tangle of
  overlapping shapes. Copying reality gets lost in detail and does not animate.
- Keep the essence: a strong silhouette, the directional design, and just enough small
  bits (tens, not thousands) to suggest the rest. The viewer's imagination fills it in.
- A two-tone design (thicker/foamier vs thin/spreading) reads clearly at speed.
- Effects may be stylised to match the game's art direction; keep the physics underneath
  so the style still moves naturally.

## 6. The wave underlies everything

- Flags, tails, hair, water, grass, fire and smoke all move by a wave travelling along them.
  Even shattering debris scatters in wave patterns.
- **Fire = a flapping flag with its volume set free.** Animate the flag motion smoothly (a
  six-frame flag cycle is enough), then let flames ride it, break off at the tips, and
  vanish within 2-3 frames (~0.1 s). Volume may change; the wave must not stutter.

## 7. Fluids wobble

- In motion, fluids constantly morph: a flying droplet squashes and stretches like jelly; a
  ripple's highlight thins and thickens as it travels. Keep volume roughly consistent, let
  shape fluctuate. Rigid, perfectly consistent fluid shapes look dead.
- Contrast: solid props, walls and shards must stay rigid and precise. Effects work is both
  extremes.
- Most fluid effects are animated "straight ahead" (each frame derived from the last), with
  key poses only where they touch characters or props. For code: simulate forward with
  per-particle randomness rather than keyframing every piece.

## 8. Fractal structure and familiar shapes

- Energy unfolds from its source along spiralling, branching geometry (shells, branches,
  leaves, coral, flowers). Splashes look like crystal flowers, vases, lotus cups; fire like
  hooked, interlocking tongues; smoke like rolling folded sheets.
- Find the source of energy and everything radiates from it. Trace those paths first,
  then hang the shapes on them.
- Borrowing a familiar silhouette (a flower, an urn, a claw) makes an effect feel designed
  and memorable, and helps tie effects to the game's visual language.

## 9. Scale is time

- The principles do not change with size; speed and detail do. Larger events move more
  slowly and hang in the air longer (huge surf splashes take seconds to peak). Small ones
  are quick and simple. Getting the timing wrong makes a big effect look tiny or vice versa.

## 10. Observe, then build

- Reference from life first (water in a sink, a candle, incense, dropping ice), then
  photos/video. Fast shutter shows frozen shapes; the eye actually sees motion blur,
  which is what gives fire its familiar look. In particles, that is velocity stretch.
- Do not trace reference; extract its essence (path, silhouette, timing).
