---
name: elemental-vfx
description: "Use when creating, changing, or reviewing spell and element visual effects in Court of Waves: casts, projectiles, blasts, splashes, fire, smoke, steam, dust, ice, lightning, magic sparkle, impacts, explosions, trails. Applies classical effects-animation principles (from Joseph Gilland's Elemental Magic, Vol. II) to this project's Godot VFX code in scripts/vfx/ and data/vfx_presets.json. Trigger keywords: VFX, spell effect, particles, explosion, splash, fire, smoke, magic, pixie dust, sparkle, impact, juice, animation feel."
metadata:
  source: "Joseph Gilland, Elemental Magic, Volume II: The Technique of Special Effects Animation (Focal Press, 2012). Principles paraphrased; no text reproduced."
  domain: game-vfx
  scope: implementation, review
  related-skills: game-developer
---

# Elemental VFX

Make every spell effect read as *energy moving through an element*, not as shapes being
moved. This skill turns the book's hand-drawn effects principles into rules for this project's
real-time VFX layer.

## The five laws (read these every time)

1. **Animate the energy, not the thing.** Before touching a particle, name the force: what hit
   what, from which direction, how hard, and what pushes back (gravity, cool air, surface
   tension, drag). Every particle velocity, tear, and curl must follow that force's path.
2. **Every effect is an explosion first.** The first ~0.05-0.1 s of any impact (splash, shatter,
   fireball, spark burst) looks the same for every element: raw, straight, outward, directional.
   Only as the energy dies does the element's own nature show (water gets round and droopy,
   smoke billows, dust falls, ice shards tumble). Fast out, then a sharp slow-down.
3. **Kill repetition.** Even spacing, equal sizes, equal lifetimes and symmetrical rings read as
   fake instantly. Vary size, timing, spacing, angle, and lifespan; put a few "ones that got
   away" far beyond the main mass. Closer to camera = more variation needed.
4. **Imply, don't simulate.** A splash has thousands of droplets; two dozen well-placed ones tell
   the story. Prefer fewer, better-shaped particles with a strong silhouette over dense mush.
   Over-dense magic is the most common mistake.
5. **Fluids wobble; the path must not.** Individual flames, droplets, and sparkles may change
   shape and volume wildly from frame to frame, appear and vanish. The *underlying motion*
   (the wave, the trajectory, the trail's path) must stay smooth. Never put a kink in a path.

## Workflow

1. **Identify the event** and its phase timeline: anticipation -> burst -> element takes over
   -> secondary event -> resolve/linger. Load `references/elements.md` for the element(s).
2. **Find the code.** Load `references/godot-mapping.md`: which recipe in
   `scripts/vfx/vfx_director.gd` handles it (`release`, `blast`, `hit`, `cone`, `area_start`,
   `explode_fx`, `reaction_fx`, `_sig` per-spell signatures) and which knobs implement each
   principle (presets in `data/vfx_presets.json`, `sprite()`/`spark()` options).
3. **Rough first, refine second.** Get the timing and directional flow right with a few
   particles, then add detail. Same as the book's "scribble, then pull clean shapes out".
4. **Layer combos.** Combo spells (two or three elements) should show each element's own
   behaviour riding on one shared energy path, plus overlap: a secondary pop while the first
   is slowing (see `references/principles.md`, overlap).
5. **Verify visually.** Run `harness/run.sh shot play OUT` / `shot matrix OUT` / `shot live OUT`
   and look at the frame, then `harness/run.sh all`. Judge with the checklist below.

## Constraints

### MUST DO
- Keep VFX in the view layer: read sim events, never change `arena_sim.gd` timing or
  `data/spells.json` / `data/enemies.json` numbers to make an effect look better.
- Keep emission and additive glow low (Compatibility renderer: glow bleeds over the frame,
  white clips). Use `screen_flash` sparingly; it is capped by `ScreenFx.FLASH_CAP`.
- Scale = time: bigger effects move slower and hang longer; small ones are snappy.
- Randomise per particle (size, life, speed, spin) with ranges, not single values.
- Respect pool limits (`SMOKE_MAX`, `SPARK_MAX`, `MAX_DEBRIS`); economise particle counts.

### MUST NOT DO
- Linear, evenly-paced growth for any burst (it looks lifeless).
- Perfectly regular rings/spirals with no jitter, or identical twin effects for both halves
  of a combo.
- Tears, holes, or sparks flying against the direction of the force that made them.
- Full-screen white/negative flashes longer than one frame or at high alpha
  (photosensitivity); a game shows the effect hundreds of times.
- Effects that ignore the ground: water and dust must land, smoke must rise, embers drift.

## Review checklist

- [ ] Force named; every particle direction follows it (asymmetric for angled impacts)
- [ ] Burst phase is fast and generic; element character appears as it slows
- [ ] Anticipation present for big/charged casts (gather in, or a 1-frame squeeze)
- [ ] Secondary event exists where physics says so (jet after splash, smoke after fire,
      debris settling after blast, bubbles/sparkles lingering)
- [ ] No visible repetition in spacing, size, timing; a few stragglers
- [ ] Density is economical; silhouette reads at gameplay camera distance
- [ ] Trails and paths curve smoothly; no direction pops
- [ ] Resolve is slower than the burst; nothing just switches off
- [ ] Glow does not clip; flashes are brief and low

## Reference guide

| Topic | Reference | Load when |
|-------|-----------|-----------|
| Core principles in depth (energy, explosion shape, chaos, simplification, wave/flag, timing, overlap) | `references/principles.md` | Designing any new effect or critiquing feel |
| Per element: water/splash, waves/ripples, fire, smoke/steam/dust, explosions, magic/pixie dust, wind, ice, lightning, combos | `references/elements.md` | Working on a specific element or combo |
| This codebase: recipes, presets, knobs per principle, timing table, verification | `references/godot-mapping.md` | Before editing `scripts/vfx/` or `data/vfx_presets.json` |
