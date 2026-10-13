# Court of Waves — playable arena

An elemental action prototype set in the Grauhold Keep inner court. You play one of the six wizards from `wizards.html`, built from the same rig (`wizard-rig.js`).

## Run it
The game uses ES modules, so serve it over HTTP. Opening the file directly won't work.

```
cd <project folder>
npx serve .          # or: python3 -m http.server 8000
```
Then open `http://localhost:8000/arena.html` (add `?w=rime_cryomancer` etc. to pick a wizard).

## Controls
WASD move · mouse aim · 1–6 queue Fire / Water / Ice / Lightning / Earth / Arcane (up to 3) · left click casts at the cursor (hold to recast) · right click or E casts as an area around you · F self-cast · Space dodge · X clear · Esc pause · R restart.

## Architecture (`game/`)
- `spells.js`: data only. Elements (hit payload + self-cast effect), shapes (cost, cooldown), and the `COMBOS` table. `resolveSpell(queue)` turns a queue into a spell.
- `enemies.js`: enemy stats and the wave formula.
- `sim.js`: all gameplay logic, with no three.js and no DOM. `step(state, input, dt)` runs at a fixed 60 Hz and returns events. Element interactions all live in `applyPayload`.
- `render.js` / `models.js`: the three.js scene, particles, telegraphs, and the overlay for HP bars and damage numbers. Reads state and events, never writes gameplay state.
- `wow.js`: the spectacle layer — charge-up rune circle, combo cast bursts and callouts, per-spell signature visuals (`SIG` table, keyed like `COMBOS`), debris, decals and screen shockwave / aberration.
- `vfx.js`: realistic layers — noise-shaded fireballs that cool and dissolve, textured flame/smoke/steam/dust sprites, velocity-stretched sparks, fractal re-striking lightning, projectile ribbon trails, fresnel shockwave domes, lens flares and heat-haze distortion.
- `audio.js`: synthesized sound effects driven by sim events (no audio files). M mutes.
- `input.js`: turns keyboard and mouse input into a movement vector, an aim point and a list of actions.
- `hud.js`: the DOM HUD plus the menu, pause and death screens.
- `main.js`: the loop that wires these together.

## Adding a spell
Add one entry to `COMBOS` in `spells.js`:

```js
'fire+ice+earth': { name: 'Obsidian Spike', shape: 'boulder', speed: 12, mult: 1.8, explode: 2,
  desc: 'Shown in the grimoire.' }
```
- The key is the elements joined with `+`, in any order. An exact key with repeats (`earth+earth`) takes priority over the distinct-element key.
- `shape` is one of `cone`, `bolt`, `chain`, `boulder`, `area` or `wall`. Shape options: `range`, `arc`, `count`, `spread`, `speed`, `pierce`, `radius`, `explode`, `splash`, `jumps`, `life`, `tick`, `pull`, `delay` + `burst`, `hitsAll` (also hits you), `segments`, `hp`, `mat`, `touchChill`, `leaves`, `chainOnImpact`, `knock` and `slow`.
- Damage and status effects come automatically from the elements' `hit` payloads, scaled by `mult`.
- Three-element queues with no entry fall back to the strongest pair, with the third element added as a rider.

A new shape needs one function in `CAST` in `sim.js`, plus visuals in `render.js`.

## Known limits
- All models are procedural primitives.
- Enemies steer around obstacles but don't pathfind.
