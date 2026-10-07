# Hvitmark Tundra (prototype)

A top-down fantasy combat prototype in Godot **4.3+** (it uses `TileMapLayer`). Built in small,
tested milestones. This folder is a **separate Godot project**: it does not touch the Grauhold Reach
game in the repository root.

## Milestone 1 (this one)

Project structure, Main scene, the tundra arena, the player mage with a follow camera and smooth
movement, the HUD, keyboard spell input and the 4-slot spell queue. **Not yet:** casting effects,
projectiles, enemies, combat, the bridge objective, the gate opening, VFX.

## Run it

1. Godot 4.3 or newer: **Project Manager -> Import** -> choose `hvitmark_tundra/project.godot`.
2. Open the project and press **F5** (the main scene is `scenes/Main.tscn`).

## Controls

| Key | Action |
|-----|--------|
| Arrow keys | Move |
| Q W E R T / A S D F | Add that spell to the queue (max 4) |
| SPACE | Cast the next queued spell (milestone 1: just removes it and shows a message) |
| ESC | Clear the queue |
| TAB | Switch movement between ARROWS (default) and WASD |
| F1 / F2 | Debug: damage / heal the player by 10 (to see the HP bar move) |

**W, A, S, D are both movement and spell keys** (Ice Lance, Fire Bolt, Lightning, Heal). By default the
arrows move and W/A/S/D queue spells. After TAB, W/A/S/D move and those four spells need **Shift** held.

## Manual test checklist

1. The mage appears near the bottom centre of a blue/white arena; title, objective and HP bar are at the top-left.
2. Arrow keys move the mage smoothly; the camera follows. You cannot walk through stone walls, boulders or water.
3. Walk north (up the middle): you reach the yellow bridge shelf and the iron gate; the gate is closed and blocks you.
4. Press Q, W, F, T: four orbs appear in the QUEUE area (the first is ringed "next"), the matching bottom buttons flash.
5. Press a fifth key: "Queue full" appears and nothing is added.
6. SPACE: the first spell leaves the queue and a message names it. ESC: the queue empties.
7. F1 lowers the HP bar, F2 raises it. TAB changes the hint under the queue.

## Automated checks

```bash
hvitmark_tundra/harness/run.sh all      # parse every script, boot headlessly, run the 59 tests
hvitmark_tundra/harness/run.sh shot out.png QWFT 0   # real frame under Xvfb (keys to queue, physics frames to walk north)
```
Set `GODOT=/path/to/godot` if Godot is not on your PATH as `godot` or `godot4`.

## Layout

```
Main (Node2D)                      scenes/Main.tscn, scripts/main.gd (wiring only)
├── World
│   └── Arena                      scenes/world/Arena.tscn, scripts/world/arena.gd
│       ├── Ground (TileMapLayer)  snow, ice, water, bridge
│       ├── Obstacles (TileMapLayer) walls and boulders
│       ├── Bridge (Area2D)        the objective zone (used in a later milestone)
│       └── Gate (StaticBody2D)    scripts/world/gate.gd: closed, open() ready
├── Actors
│   ├── Player (CharacterBody2D)   scenes/actors/Player.tscn, scripts/actors/player.gd
│   │   ├── CollisionShape2D, Visual (mage drawing), SpellCaster, Camera2D
│   └── Enemies                    empty until milestone 2
├── Projectiles                    empty until milestone 2
├── Effects                        empty until milestone 2
└── UI (CanvasLayer)
    └── HUD                        scenes/ui/HUD.tscn, scripts/ui/hud.gd
```

Spells are `Resource` files in `resources/spells/` (`scripts/spells/spell.gd`); `SpellDatabase` lists
them; `SpellQueue` is the queue; `SpellCaster` turns key presses into queue changes. Input actions live
in the project's Input Map. The arena layout is the ASCII `ROWS` in `scripts/world/arena.gd`.

Textures are generated in code (tiles, icons): no external assets. Physics layers: 1 world, 2 player,
3 enemies, 4 projectiles.
