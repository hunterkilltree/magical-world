extends "res://harness/test_case.gd"

const ZoneGrid = preload("res://scripts/core/zone_grid.gd")
const ZoneRun = preload("res://scripts/core/zone_run.gd")
const Inventory = preload("res://scripts/core/inventory.gd")
const Boss = preload("res://scripts/core/boss.gd")
const Campaign = preload("res://scripts/core/campaign.gd")
const Caster = preload("res://scripts/core/caster.gd")
const SpellBook = preload("res://scripts/core/spell_book.gd")
const Player = preload("res://scripts/player.gd")

const FRAGMENTS := ["rune_fragment_1", "rune_fragment_2", "rune_fragment_3"]

var nodes: Array = []


func after_test() -> void:
	for n in nodes:
		n.free()


func _with_fragments(inv, ids: Array) -> void:
	for id in ids:
		inv.add({"id": id, "kind": "rune_fragment"})


func _final_boss(inv) -> Array:
	var g = ZoneGrid.load_zone("cavern")
	var run = ZoneRun.new(g, inv)
	var b = Boss.spawn_for(g)
	nodes.append(b)
	run.bind_boss(b)
	return [run, b]


func test_pine_cache_holds_the_first_fragment_once() -> void:
	var g = ZoneGrid.load_zone("pine")
	var inv = Inventory.new()
	var cells: Array = g.cells_of("C")
	var first: Dictionary = g.open_loot(cells[0], inv)
	assert_eq(first["id"], "rune_fragment_1", "first fragment")
	assert_eq(first["kind"], "rune_fragment", "kind")
	var second: Dictionary = g.open_loot(cells[1], inv)
	assert_true(second["id"] != "rune_fragment_1", "only one fragment per zone")
	assert_eq(inv.items.size(), 2, "both caches paid out")


func test_other_zone_caches_are_ordinary_items() -> void:
	var g = ZoneGrid.load_zone("tundra")
	var item: Dictionary = g.open_loot(g.cells_of("C")[0])
	assert_eq(item["kind"], "item", "tundra cache is not a fragment")


func test_hollow_warden_cannot_be_hurt_without_all_three_fragments() -> void:
	for held in [[], ["rune_fragment_1"], ["rune_fragment_1", "rune_fragment_3"]]:
		var inv = Inventory.new()
		_with_fragments(inv, held)
		var pair := _final_boss(inv)
		var run = pair[0]
		var b = pair[1]
		var blocked := [0]
		b.damage_blocked.connect(func(): blocked[0] += 1)
		b.take_damage(99999)
		assert_eq(b.health.current, b.health.max_health, "untouched holding %d fragments" % held.size())
		assert_eq(b.phase, 0, "still phase 0")
		assert_eq(blocked[0], 1, "blocked, signalled")
		assert_true(not run.done and not run.ending_played, "no zone completion, no ending")


func test_all_three_fragments_make_him_mortal_and_play_the_ending() -> void:
	var inv = Inventory.new()
	_with_fragments(inv, FRAGMENTS)
	var pair := _final_boss(inv)
	var run = pair[0]
	var b = pair[1]
	var heard := [0]
	run.ending_started.connect(func(): heard[0] += 1)
	b.take_damage(1000)
	assert_eq(b.health.current, 500, "damage lands")
	assert_true(not run.ending_played, "still alive")
	b.take_damage(500)
	assert_true(b.health.is_dead(), "dead")
	assert_true(run.done and run.ending_played, "zone complete, ending played")
	assert_eq(heard[0], 1, "ending signalled once")
	assert_true(inv.has_item("cracked_rune_mended"), "the Cracked Rune is mended")
	assert_true(inv.has_item("rune_fragment_1"), "fragments are kept")


func test_other_bosses_never_trigger_the_ending() -> void:
	var g = ZoneGrid.load_zone("keep")
	var inv = Inventory.new()
	var run = ZoneRun.new(g, inv)
	var b = Boss.spawn_for(g)
	nodes.append(b)
	run.bind_boss(b)
	b.take_damage(9999)
	assert_true(run.done, "keep complete")
	assert_true(not run.ending_played and not inv.has_item("cracked_rune_mended"), "no ending")


func test_full_campaign_from_landing_to_ending() -> void:
	var camp = Campaign.new()
	var inv = Inventory.new()

	# Chapter 1: Hvítmark Tundra (no boss; completion is exercised in R-013).
	assert_true(camp.complete("tundra"), "tundra")

	# Chapter 2: Ashvold Pinewood, loot the woodcutter's cache for fragment 1.
	var pine = ZoneGrid.load_zone("pine")
	var pine_run = ZoneRun.new(pine, inv)
	camp.bind_run("pine", pine_run)
	pine.open_loot(pine.cells_of("C")[0], inv)
	pine_run.update(pine.cells_of("S")[0])
	assert_true(camp.is_complete("pine"), "pine")

	# Chapters 3 and 4: the Warden and the Colossus drop fragments 2 and 3.
	for zone in ["keep", "volcano"]:
		var g = ZoneGrid.load_zone(zone)
		var run = ZoneRun.new(g, inv)
		camp.bind_run(zone, run)
		var b = Boss.spawn_for(g)
		nodes.append(b)
		run.bind_boss(b)
		b.take_damage(99999)
		assert_true(camp.is_complete(zone), zone)

	# Chapter 5: the bog opens the way down.
	assert_true(not camp.is_unlocked("cavern"), "cavern locked until the bog is done")
	assert_true(camp.complete("bog"), "bog")
	assert_true(camp.is_unlocked("cavern"), "cavern open")
	for f in FRAGMENTS:
		assert_true(inv.has_item(f), "holding " + f)

	# Chapter 6: two spells end the Hollow Warden.
	var cav = ZoneGrid.load_zone("cavern")
	var cav_run = ZoneRun.new(cav, inv)
	camp.bind_run("cavern", cav_run)
	var boss = Boss.spawn_for(cav)
	nodes.append(boss)
	cav_run.bind_boss(boss)
	var wizard = Player.new()
	nodes.append(wizard)
	wizard.position = boss.position + Vector2(50, 0)
	var caster = Caster.new()
	caster.cast(SpellBook.find(["fire", "fire"]), wizard.position, [boss])
	caster.cast(SpellBook.find(["fire", "ice"]), wizard.position, [boss])
	assert_true(boss.health.is_dead(), "Hollow Warden dead")
	assert_true(cav_run.ending_played, "ending")
	assert_true(camp.all_complete(), "all six zones complete")
