# Campaign plan: the Court of Waves, chapter by chapter

Status: **the foundation is built.** R-090 to R-094 (chapter runner, profile and save, unlocks, objectives, story cards and barks in
English and Vietnamese) are `done` in `story/STORY.md`; the prologue is playable with `?c=prologue`. The chapters themselves
(R-095 onward: Hvítmark Tundra first) are added as the work reaches them. **Decision: the campaign is built in the browser port
first, with all its content as engine-neutral JSON in `data/`, and ported to Godot later.** Each part becomes a requirement with its
test, as `CLAUDE.md` says. This file is the design behind them, in the same way `COOP_PLAN.md` is for co-op.

## Why a campaign

Today the game is one thing: endless waves, no memory between runs, "there is no winning, only how long you last".
The arena, the ten elements, 225 role spells, twelve spell forms, eight wizards, two arenas and co-op for four are
all built. What is missing is **a reason to be in the next fight, and a reason the fight is different from the last.**

The retired Grauhold Reach campaign (R-001 to R-036, see git history `e2615b5`) already has the right bones: six
zones, the Hollow Warden, the Staff of the Cracked Rune, three rune fragments. It was a 2D overworld game, which is
why it was dropped. This plan keeps its **world, names and beats** and moves them into what we built: a round
arena with waves. **Each chapter is an arena run with its own place, rules, enemy, set piece and lesson.**

Two rules from `CLAUDE.md` shape everything below:

1. **The core pillar wins.** Every chapter must make the player combine elements in a new way. A chapter that
   could be played with one spell is a failed chapter. Story never gets in the way of the spell system.
2. **Existing numbers are final.** Nothing here retunes `spells.json`, `enemies.json` or the role books. New
   enemies, bosses, hazards and objectives are **our own tuning, not playtested**, and live in their own data files.
   Chapter difficulty comes from the existing wave scaling plus new content, never from changing old values.

## The story

### The world

Grauhold Reach is a coastal highland of Norse-flavoured names and grim, wry people. Beneath its keep lies the
**Sunken Verrglass**, a crystal throat where raw magic wells up from the deep. It rises and falls like a tide, in
waves. The keep's inner court, the **Court of Waves**, was built on top of it to hold the tide.

Raw elements do not hold a tide. **Woven ones do.** That is the oldest law of the Reach, and it is the game's core
pillar said as lore: *one element is a spark, two woven together are a spell.* Every equinox the sworn circle of
wizards met in the court to re-weave the **Rune**, a ten-sigil spell set into the **Staff of the Cracked Rune**,
with pairs of elements woven in the right order.

### What went wrong

The Court's last Warden-Archmage, the **Hollow Warden**, decided the circle was too slow, and wove the Rune
**alone**. A circle of one cannot hold. The Rune cracked, and the night the Reach fell the tide came up wrong.
What rises at the four gates are **thralls: unfinished spells given bodies.** Every one is a half-cast thought of
the Rune, doing its one move over and over. That is why they are so easy to read and so many.

The Warden did not become a tyrant. He **hollowed himself out** to stand in the crack and hold it shut with
whatever he had left: void, dark, grief. His shade is still down there. His captains are still loyal. The land
beyond the Hvítmark shore answers to him because nothing else is holding it.

You are not there to kill him. **You are there to finish the spell.**

### The player and the party

You carry the Staff, which is cracked. It only mends by casting: **every new combination you weave seals a hairline
of the Rune** (the grimoire counter the pause screen already shows, "0 / 95 cast", becomes the rune's health bar).
Up to four wizards answer the roll call in co-op. That is not a coincidence of the engine: the finale is a
**circle**, and a circle needs more than one caster.

**Elder Bram**, the court's seneschal, is the one fixed NPC (from the old campaign). He keeps the grimoire, gives
the briefings and the dry commentary, and is the voice of the camp between chapters.

### The eight wizards

Each has one reason to be here and one small thing the story lets them do. The small things are **voice and
information, never raw power**, so balance stays where it is.

| Wizard | Role | Reason | In the story |
|---|---|---|---|
| Brann Cinderhand | Destroyer | His staff has burned more than a hat. He wants one fight that ends in a good way. | Starts in the circle. Comic relief with a conscience. |
| Sister Vela | Controller | Last of the shelf's cryomancers. Speaks only when the room is quiet. | Starts in the circle. Her lines come in the quiet after a wave. |
| Old Morrow | Guardian | Argues with rocks, usually wins. | Starts in the circle. Rocks answer him in the bog. |
| Kessa Voltmark | Trickster | Outcast engineer of the Voltmark. Her rod hums near water. | Starts in the circle. |
| Aldric the Unwritten | Arcanist | Reads three spells ahead of you. Knows how this ends, and does not say. | Starts in the circle. Shows the **next wave's gate and mix** on the HUD. |
| Thane Granitebrow | Destroyer | Heir of a hall in the Wastes, and of the chained Colossus that guards it. "It is a family matter." | Joins in chapter 4. |
| Ilsa Galesinger | Trickster | A gale-singer. The pines stopped answering her when the tide came. | Joins in chapter 2. |
| The Hollow Warden | Controller | The first to hold the Staff. | **Opens only when the campaign is done** (see Chapter 6). |

### How it ends

The Verrglass fight is not a damage race. The Warden **mirrors what he has seen you cast.** He only knows what he
has watched, so the way to beat him is variety: weave combinations he has not seen. Then he stops attacking, and the
**Circle Cast** begins: the living wizards weave their signature spells in order, inside a short window, and the
Rune closes around him. The shade fades, and the Warden's wizard joins your roster.

Then the court opens on the morning after, and the tide **does not stop.** It never did. The circle only holds it.
That is why there is an endless mode: **the Siege**, the Court holding the tide for as long as it can.

*Optional bad ending (stretch):* take the Staff's power instead of mending it, and you become the next Hollow Warden.
Same roster unlock, a darker epilogue, and the Siege starts with a hollow modifier.

## The shape of a chapter

```
Briefing card (Bram)  ->  Arena run: N waves under the chapter's rules  ->  Mid-chapter event
   ->  Climax wave or boss  ->  Rune fragment / grimoire pages / unlocks  ->  Camp (save, story card)
```

- A chapter is one **arena** (our round court of radius 24 with its own theme), one **ground rule**, one **new enemy**,
  one **objective** that is not only "survive", and one **set piece** the player remembers.
- **Checkpoint between waves.** Dying restarts the wave, not the chapter, in solo. In co-op a downed wizard is
  revived as today; the chapter fails only when everyone is down.
- **Lesson combos.** Each chapter names 3 to 4 reactions it wants the player to discover, and shows them in the
  Grimoire with a "seen in chapter N" mark. Doing one earns a grimoire page; the page is how the Rune mends.
- Chapters are about **15 to 25 minutes** each; the whole campaign is **two to three hours**, one session per sitting.

| # | Chapter | Place (arena theme) | Objective | Boss | Waves |
|---|---|---|---|---|---|
| 0 | The Night the Rune Cracked | Court of Waves (`court`) | Survive, learn to weave | none | 3 |
| 1 | Hvítmark Tundra | Frozen shelf (`tundra`, new) | **Hold** the ice-bridge winch | none | 5 |
| 2 | Ashvold Pinewood | Hollow Glade (`forest`, have) | **Burn** the log pile and take the cache | none | 6 |
| 3 | Grauhold Keep | Court of Waves (`court`, ruined) | Light the braziers, breach the gatehouse | Warden of the Keep | 5 + boss |
| 4 | Eldrhólt Wastes | Cinder islands (`cinder`, new) | Cross three islands | Cinder Colossus | 6 + boss |
| 5 | Mirefen Bog | The bog (`bog`, new) | **Escape** before dark | none | 4 + timer |
| 6 | The Sunken Verrglass | Crystal throat (`verrglass`, new) | Descend, then **re-weave** | The Hollow Warden | 3 tiers + finale |
| ∞ | The Siege | Any arena you have cleared | Hold as long as you can | none | endless |

## Chapter by chapter

### Chapter 0: The Night the Rune Cracked (prologue)

*Vi (draft): Đêm Rune Vỡ.*

- **Story.** The equinox oath at dusk in the Court of Waves. Bram reads the roll. The circle weaves, badly, and at
  the third wave the Rune splits in your hand with a sound like a bell dropped down a well. The sea gate is the only
  way out.
- **Gameplay.** Three short waves, grave thralls only. Prompts teach: queue an element, cast, queue two (the first
  woven spell, **Steam** from fire and water), the area cast, the self cast, and "careless casting hurts you" through a
  rune barrel. The existing HUD hints become guided prompts.
- **Elements:** fire, water, earth. **Grimoire:** the first three pages.
- **Set piece.** The crack: the staff glows split, the floor rune goes dark, the gates open at once.
- **Sample line (Bram).** "That was meant to take an hour and a good lunch. Run."
- **Co-op.** Everyone is at the oath. Roles are named on the roll, as the menu already does.

### Chapter 1: Hvítmark Tundra

*Vi (draft): Bình nguyên băng Hvítmark.*

- **Story.** The party lands on the south shelf. Raiders hold the north ice bridge; the winch that lowers it is the
  only way to the pines. **Vela** knows the shelf and breaks her silence only in the quiet after a wave.
- **Objective: hold.** Defend the **bridge winch** (a structure with health) for ninety seconds of waves. Enemies
  go for it before they go for you. Lose it and the wave restarts.
- **Ground rule: thin ice.** The arena floor is frozen. Heavy hits (earth, boulders) crack tiles into water, water
  wets and chills whoever stands in it, fire melts ice into puddles, lightning charges the puddles. Ice does what ice does.
- **New enemy: Rimeraider** (our tuning). A fast skirmisher glazed in ice: resists ice and chill, weak to fire, throws
  shards from range, dashes across ice. A raider that is wet and frozen is a gift to anyone holding an earth spell.
- **Lesson combos.** Freeze then **shatter** (ice, then earth). Wet then **conduct** (water, then lightning). The
  fire versus ice cancel rule, now in a place where it matters.
- **Elements:** ice, lightning. **Grimoire:** the "frozen-ground" pages.
- **Set piece.** The winch drops the bridge, and the shelf behind you fractures and slides into the sea.
- **Sample line (Vela).** "It is quiet now. Good. Count them, and then count them again."
- **Co-op.** The guardian role is rewarded here: wards and walls over the winch are the easy way to hold.

### Chapter 2: Ashvold Pinewood

*Vi (draft): Rừng thông Ashvold.*

- **Arena.** The **Hollow Glade** we already have. Dry brush, puddles, barrels.
- **Story.** A woodcutter's cache holds the **first rune fragment**. The log pile blocks the short way; burning it opens
  the path, and **announces you to the wood.** Somewhere in the trees someone is singing a gale. **Ilsa** answers,
  and joins.
- **Objective: burn, and choose when.** The log pile resists everything but fire. Burn it early and the pines
  send their ambushers early; burn it late and you meet a bigger final wave but a calmer start. The player picks the
  moment, and the sim logs which.
- **New enemy: Pine Ambusher** (our tuning). Hides in standing brush, invisible until the brush burns, a gust clears
  it, or lightning reveals it. It leaps from cover. Plus a **thorn sprout** that roots whoever steps near.
- **Ground rule: fire spreads.** Wind pushes burning brush downwind. Nature feeds it. Wet ground stops it.
  (The reactions exist; this chapter makes them the whole puzzle.)
- **Lesson combos.** Fire with wind (a burning gale), water to cut a firebreak, nature then fire, lightning to reveal.
- **Elements:** nature, wind. **Wizard:** Ilsa. **Reward:** rune fragment I.
- **Set piece.** The fire front rolling through the pines toward the cache while you hold the glade.
- **Sample line (Ilsa).** "The pines used to sing back. Do not say 'sorry' to the trees. They are not in a forgiving mood."

### Chapter 3: Grauhold Keep

*Vi (draft): Thành trì Grauhold.*

- **Arena.** The Court of Waves again, **ruined**: broken pillars, collapsed arches, the four gates sealed by
  portcullises. The same space as the prologue, now you know what it is for.
- **Story.** The keep's gatehouse is held by the Hollow Warden's captain, the **Warden of the Keep**, still loyal and
  still sure he is guarding something. Bram: "He is not wrong, and that is the unfortunate part."
- **Objective: braziers.** Light four braziers (with fire, or a spell that carries it) to raise the inner portcullis.
  Between waves, braziers gutter; the player decides where to stand.
- **Boss: Warden of the Keep** (our tuning; numbers in the boss data file, not in `enemies.json`).
  - *Phase 1, the Shield.* A full-front shield. Frozen, shocked or interrupted, it drops. Crowd control is the answer.
  - *Phase 2, the Choir.* He calls hexcallers; he is vulnerable only while his charge is running. Use the pillars
    to make him charge into stone, which stuns him.
  - *Phase 3, the Ember.* Burning armour, faster, and each of his slams leaves fire. Water, ice and walls.
- **Lesson combos.** Interrupt chains (freeze or shock to cancel a windup), terrain bait (pillars), walls versus charge.
- **Elements:** arcane (the library under the keep). **Wizard:** Aldric speaks properly for the first time and
  **the next-wave preview** is introduced for him. **Reward:** rune fragment II.
- **Set piece.** The portcullis rising on a court full of ghosts that stand when you enter.
- **Sample line (Aldric).** "He will charge on the third beat. I would suggest you are not standing there."

### Chapter 4: Eldrhólt Wastes

*Vi (draft): Hoang mạc tro tàn Eldrhólt.*

- **Arena.** Three **islands** in a lava ring, joined by cooling bridges. The round court becomes a campaign in three
  steps; each island is a stage of two waves, and the boss is on the last.
- **Ground rule: lava floods.** Lava channels rise and fall on a timer. Bridges are crust: **water or ice cools
  lava into a walkable path**, fire or time melts it back. Standing in lava burns. Steam obscures the view a little.
- **New enemy: Cinderling** (our tuning). Explodes into a pool of lava on death; a water or ice kill turns the pool
  into an obsidian shard that blocks enemies and shots instead. Kill method changes the room.
- **Boss: Cinder Colossus.** Chained by four chains to the island. Not evil, only bound. Its slam is slow and its
  chains hold it in place until broken.
  - **The choice.** *Shatter it:* freeze it, then hit it with earth; it breaks and gives fragment III quickly, but the lava
    channels keep flooding for the rest of the chapter. *Free it:* conduct lightning through water into the four chains
    until they snap; it stops fighting, turns and kneels, and returns in the finale as a **single guard** (absorbs one lethal hit).
    Free is slower and riskier.
- **Lesson combos.** Cool a path (water, ice), shatter (ice then earth), conduct (water then lightning), steam, obsidian.
- **Wizard:** **Thane Granitebrow**, whose hall this is. **Reward:** rune fragment III.
- **Set piece.** The chains snapping one by one, or the Colossus coming apart at the shoulder.
- **Sample line (Thane).** "No, I do not need help. Yes, you may stand behind me. It is a family matter."

### Chapter 5: Mirefen Bog

*Vi (draft): Đầm lầy Mirefen.*

- **Arena.** A low, wet, foggy ground. A causeway of three stretches winds toward a sunken barge.
- **Story.** The barge carries the Warden's supply of **void-glass**. Reading its ledgers is the chapter's reveal:
  the void-glass was not for conquest. It is **patching the crack**, crate by crate, and it is running out. The thralls
  are not the Warden's army; they are what leaks when he runs short. Bram, quietly: "I think we have been the
  enemy in the story for some time."
- **Objective: escape.** Follow the causeway, take the ledgers, and **get out before dark.** A dusk timer shortens
  the visible radius and strengthens the wave as it falls.
- **Ground rule: mud, fog, gas.** Mud slows everyone, fog hides the far field, **methane** collects in pockets and
  ignites in chain explosions. Water is everywhere, so lightning is dangerous to the caster (the "cast lightning while
  wet" rule finally earns its keep).
- **New enemy: Bog Wisp** (our tuning). A lantern that lures thralls toward it. Pop one over water and it releases
  gas; pop it over fire and it blows. Plus drowned thralls that rise from the water.
- **Elements:** **light**, which also works as the lantern that pushes the fog back. **Wizard:** Morrow is in his
  element: the rocks answer him.
- **Lesson combos.** Fire in gas (a controlled blast), light to see, wind to clear the fog, earth to ground a
  charged pool.
- **Set piece.** A methane chain-blast down the causeway behind you, timed to the second.
- **Sample line (Morrow).** "The rock says go left. The rock is sulking. Go left anyway."

### Chapter 6: The Sunken Verrglass

*Vi (draft): Hố pha lê chìm Verrglass.*

- **Arena.** The crystal throat in three **tiers**, descending. The way out is the way in: the floor of each tier
  collapses behind you into the next.
- **Story.** You arrive at the dais with three fragments. The Warden is **not a surprise**: you know why he is
  here. He tells you once, plainly, and then he has to fight you, because the Rune does not mend itself while he
  stands in the crack.
- **Ground rule: refraction.** Crystal pillars **refract beams** (the beam spells bounce and split) and mirror light.
  **Dark** pools swallow light and heal what is in them.
- **Elements:** **dark**, the last, given to you by the Warden as the first thing he says. All ten are open now.
- **Boss: the Hollow Warden** (our tuning).
  - *Phase 1, the Hollow Court.* Thralls and void bolts; learn his tells.
  - *Phase 2, the Mirror.* He **mirrors the combinations you have cast** in this fight and in the chapter. Cast the
    same mix twice and he echoes it back at you. The way through is variety, which is the pillar. A HUD ring shows the
    mixes he has "seen"; breaking new ground makes him flicker.
  - *Phase 3, the Circle.* He lowers his hands. A **Circle Cast** starts: each living wizard weaves their **role
    signature** (the Rune lists them) in order inside a short window. Solo: three guided glyph casts while the court holds.
- **Lesson combos.** Everything; the final exam is variety, not a trick.
- **Rewards.** Rune mended. **The Hollow Warden** joins the roster. If the Colossus was freed, it kneels at the
  door. The Siege unlocks.
- **Set piece.** The Rune closing around the shade like a hand round a candle.
- **Sample line (the Warden).** "You cast a new one. Good. I have not seen that one. I wish I had, years ago."

### The Siege (endless, after the campaign)

- **Story.** The morning after. The tide does not stop. The Court holds it. This is the existing endless mode, now
  in-fiction.
- **Gameplay.** Choose any arena you have cleared. **Mutators** from the chapters can be switched on for score
  multipliers: thin ice, methane, fire spreads, mirror warden, dusk. Best wave and score are saved per wizard
  (IMPROVEMENT_PLAN item 7). **Seeded runs:** the sim is deterministic, so a seed can be shared for a daily court.
- **Open play stays.** The current menu (any wizard, any arena, endless) remains as **Quick play** with everything
  unlocked, so existing tests and habits do not break. The campaign is a second door, not a replacement.

## Features across the chapters

| Feature | What it is | Why |
|---|---|---|
| **Campaign runner** | `data/campaign.json` lists chapters (arena theme, waves, rules, objective, dialogue keys). A small state machine runs briefing, waves, climax, reward, camp. | One data file drives every chapter; testable headlessly. |
| **Profile and save** | Per-player save: unlocked elements and wizards, grimoire pages found, chosen endings, best wave and score per wizard. Web: `localStorage`; Godot: `user://`. | IMPROVEMENT_PLAN item 7: a reason to keep playing. |
| **Unlock gates** | Elements unlock by chapter; locked ones show greyed in the HUD and a toast when pressed. Wizards unlock by chapter. Quick play is unaffected. | Teaches six elements before ten, as the plan asks. |
| **Objectives** | New sim layer: `hold` (defend a structure), `burn` (destroy with fire), `escape` (timer and exit), `braziers`, `cross`, `circle`. | "Survive" alone cannot carry six chapters. |
| **Boss framework** | Boss health bar, phases, telegraphs, immunities and a "seen mixes" tracker for the mirror. | Needed by three chapters. |
| **Arena themes and hazards** | `tundra`, `cinder`, `bog`, `verrglass` on top of `court` and `forest`; each adds **one** new reaction, kept in the single reaction function. | The ground rules are the chapter lessons. |
| **Story cards and barks** | Short cards before and after chapters, one-line barks in the quiet after waves, per-wizard lines. **English and Vietnamese** in one strings table (`data/story/en.json`, `vi.json`); the UI already carries Vietnamese subtitles for the roles. | Tone is part of the game; the owner's audience is bilingual. |
| **Rune Mending** | Grimoire pages found fill the Rune. Thresholds (10, 25, 50, 75, 95) open **cosmetics and quality of life only**: staff glows, spell trails, title cards, a hold-to-recast hint. | Rewards exploration without touching balance. |
| **Circle Cast** | Co-op finale mechanic: each living wizard weaves their role signature in order inside a window. Solo variant: guided glyphs. | Makes co-op matter to the story. |
| **Wave preview** | Aldric shows the next wave's gate and mix on the HUD. | Gives each wizard a small identity. |
| **Mutators and seeds** | Optional modifiers and a shareable seed for the Siege. | Replay value with no new content. |
| **Music and ambience** | One loop per arena theme, quiet in the camp. CC0 only, credited in `audio/CREDITS.md`. | The game has sound effects but no music. |
| **Campaign bot** | Extend the R-049 bot to clear the prologue and chapter 1 in a test. | Keeps the chapters honest as the rules change. |

## Proposed requirements

Ordered so each step is playable on its own. Test approach is headless and in the style of the existing tests. `S`
means a small slice that ships alone; `M` and `L` are larger.

| ID | Title | Test sketch | Size |
|---|---|---|---|
| R-090 | Campaign data and chapter runner | A fake two-chapter file runs briefing, waves, clear, reward; a failed wave restarts the wave | M |
| R-091 | Profile and save | Round-trips unlocks, pages, best wave per wizard; corrupt save falls back safely | S |
| R-092 | Element and wizard unlocks | Pressing a locked element is refused with a toast; Quick play still has all ten | S |
| R-093 | Objectives: hold, burn, escape | Winch loses health to enemies and ends the wave at 0; log pile ignores non-fire; timer ends the chapter | M |
| R-094 | Story cards, barks, English and Vietnamese | Every key exists in both tables; no card references a missing key | S |
| R-095 | Prologue and Hvítmark Tundra | Tundra arena builds; thin ice cracks under a boulder; Rimeraider resists ice, weak to fire | L |
| R-096 | Ashvold Pinewood | Ambusher is hidden in brush and revealed by fire, gust or lightning; the burn timing is recorded | M |
| R-097 | Boss framework and the Warden of the Keep | Phase changes at set health; shield drops when frozen; a pillar stuns a charge | L |
| R-098 | Eldrhólt Wastes and the Cinder Colossus | Water cools lava to a path that melts back; Cinderling kill method decides lava or obsidian; both Colossus outcomes reach the finale | L |
| R-099 | Mirefen Bog | Mud slows; methane chain-blasts; the dusk timer ends the chapter; wisp over water releases gas | L |
| R-100 | The Sunken Verrglass | Beam bounces off a crystal; the mirror echoes a repeated mix and not a new one; the Circle Cast succeeds only in order | L |
| R-101 | Rune Mending | Pages found move the Rune; thresholds unlock only cosmetics | S |
| R-102 | The Siege and mutators | Mutators change only what they name; seeded runs match | M |
| R-103 | Co-op campaign | Party enters a chapter together; progress is shared; Circle Cast needs every living wizard | L |
| R-104 | Music and ambience | Every arena theme has a bed; mute works | S |

A sensible first release is **R-090 to R-094 plus the prologue and Chapter 1**: one complete, playable
chapter with save, unlocks and story, before any boss.

## Risks and open questions

- **Engine: decided.** Roles, co-op, the arenas and the spell forms live in the **browser port** (`src/`); the Godot
  project has the older school-based spell books and a different spell data layer. The campaign is built in the browser
  port first, with content as engine-neutral JSON in `data/` (`campaign.json`, `story/en.json`, `story/vi.json`,
  `campaign_enemies.json`) so the Godot port only has to read it and implement the rules. Godot follows once a chapter is
  proven.
- **Untested numbers.** Every new enemy, boss, hazard and timer is unplaytested. Keep them in their own data files and
  let the playtest (IMPROVEMENT_PLAN item 4) drive the values, never feel.
- **Content volume.** Four new arenas, five new enemy types and three bosses is a lot. Chapters 0 and 1 prove the
  loop; the others can ship one at a time, each its own PR.
- **Tone and translation.** The Vietnamese lines above are **drafts for a native review**. Chapter titles and
  barks should be written, not machine-translated.
- **Co-op balance.** Hold and escape objectives change with party size (the winch's health, the dusk timer). They
  scale with the existing party factor; the numbers need a four-player playtest.
- **Don't break Quick play.** Everything campaign-only sits behind the campaign door, so the golden digests and
  the existing tests keep meaning what they mean.
