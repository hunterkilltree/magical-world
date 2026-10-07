# The Lantern of Eldermere

## Premise

In the village of Eldermere, a great Moon Lantern has kept the dark at bay for
a thousand years. Tonight it went out. Shadow wisps now drift out of the
Hollow Wood, drinking the light from every window.

You are **Mira**, the village's youngest lamplighter. **Elder Bram** tells you
the Lantern can be relit with three Moon Shards, scattered across the Whispering
Wood, the Sunken Chapel and Glass Peak. Bring them home before the last
lamp goes dark.

Tone: cosy, hopeful, a little spooky. Short play sessions, no grind.

## Chapters

1. **Embers**: learn to move, meet Elder Bram, take your first hit from a wisp.
2. **The Whispering Wood**: find the first shard, outrun wisps.
3. **The Sunken Chapel / Glass Peak**: remaining shards.
4. **Relight**: return to the Lantern.

## Requirements

Format (parsed by `harness/run.sh reqs`):

    ### R-NNN [status] Title

Status is `planned` (no test needed yet), `active` (being built; must have a
test) or `done` (must have a passing test). Each active/done requirement needs
`tests/story/test_rNNN_<name>.gd`. To start work on a requirement, change it
to `active` and write its test first.

### R-001 [done] Mira moves in any direction
Chapter 1. Movement input produces a velocity of exactly 200 px/s in that
direction; diagonals are not faster; no input means no movement.

### R-002 [planned] Mira has health and can fall
Chapter 1. Mira starts with 3 health. `take_damage(n)` reduces it, never below
0, and emits `died` once when it reaches 0.

### R-003 [planned] Elder Bram gives the quest
Chapter 1. Interacting with Elder Bram within range shows his dialogue and
sets the quest flag `quest_started`.

### R-004 [planned] Moon Shards can be collected
Chapter 2. Touching a shard removes it and increments `shards` (0 to 3),
which persists across scene changes.

### R-005 [planned] Shadow wisps chase and hurt
Chapter 2. A wisp within 150 px of Mira moves toward her and deals 1 damage
on contact, with a 1 second cooldown between hits.

### R-006 [planned] Relighting the Lantern ends the game
Chapter 4. Interacting with the Lantern while holding 3 shards plays the
ending; with fewer, Bram says how many are still missing.
