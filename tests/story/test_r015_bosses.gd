extends "res://harness/test_case.gd"

const ZoneGrid = preload("res://scripts/core/zone_grid.gd")
const ZoneRun = preload("res://scripts/core/zone_run.gd")
const Inventory = preload("res://scripts/core/inventory.gd")
const Boss = preload("res://scripts/core/boss.gd")
const Player = preload("res://scripts/player.gd")
const Caster = preload("res://scripts/core/caster.gd")
const SpellBook = preload("res://scripts/core/spell_book.gd")

const BOSS_ZONES := ["keep", "volcano", "cavern"]

var nodes: Array = []


func after_test() -> void:
	for n in nodes:
		n.free()


func _boss(zone: String):
	var b = Boss.spawn_for(ZoneGrid.load_zone(zone))
	if b != null:
		nodes.append(b)
	return b


func _wizard():
	var p = Player.new()
	nodes.append(p)
	return p


func test_boss_data_matches_the_boss_pads() -> void:
	var data = JSON.parse_string(FileAccess.get_file_as_string("res://data/bosses.json"))
	var zones := []
	for b in data["bosses"]:
		zones.append(b["zone"])
		assert_true(int(b["health"]) > 0, "%s health" % b["zone"])
		assert_true(b["phases"].size() >= 2, "%s needs at least two phases" % b["zone"])
		for ph in b["phases"]:
			assert_true(float(ph["speed"]) > 0.0 and int(ph["damage"]) > 0, "%s phase stats" % b["zone"])
	assert_eq(zones, BOSS_ZONES, "one boss per zone with a boss pad")


func test_spawns_on_the_pad_and_only_in_boss_zones() -> void:
	for z in BOSS_ZONES:
		var g = ZoneGrid.load_zone(z)
		var b = _boss(z)
		assert_true(b != null, "%s has a boss" % z)
		var pad: Array = g.cells_of("B")
		assert_eq(g.tile_at(g.world_to_cell(b.position)), "B", "%s boss stands on its pad" % z)
	assert_true(_boss("pine") == null, "pine has no boss")
	assert_true(_boss("tundra") == null, "tundra has no boss")


func test_phases_advance_as_health_drops() -> void:
	var b = _boss("volcano")  # 900 hp, 3 phases
	var seen := []
	b.phase_changed.connect(func(i): seen.append(i))
	assert_eq(b.phase, 0, "starts in phase 0")
	var slow: float = b.speed()
	b.take_damage(200)  # 700/900 left, 22% lost
	assert_eq(b.phase, 0, "still phase 0")
	b.take_damage(200)  # 500/900 left, 44% lost
	assert_eq(b.phase, 1, "phase 1")
	assert_true(b.speed() > slow, "faster in phase 1")
	b.take_damage(300)  # 200/900 left, 78% lost
	assert_eq(b.phase, 2, "phase 2")
	assert_eq(seen, [1, 2], "each change signalled once")


func test_boss_fights_back_with_phase_damage_and_cooldown() -> void:
	var b = _boss("keep")
	var p = _wizard()
	p.position = b.position + Vector2(10, 0)
	b.step(0.1, p)
	assert_eq(p.health.current, 85, "phase 0 hit (15)")
	b.step(0.5, p)
	assert_eq(p.health.current, 85, "cooldown")
	b.take_damage(400)  # into phase 1
	b.step(0.6, p)
	assert_eq(p.health.current, 60, "phase 1 hit (25)")


func test_boss_chases_the_wizard() -> void:
	var b = _boss("cavern")
	var p = _wizard()
	p.position = b.position + Vector2(0, 300)
	var before: float = b.position.distance_to(p.position)
	b.step(1.0, p)
	assert_true(b.position.distance_to(p.position) < before, "closer")


func test_defeating_the_boss_completes_the_zone_and_drops_its_fragment() -> void:
	var g = ZoneGrid.load_zone("keep")
	var inv = Inventory.new()
	var run = ZoneRun.new(g, inv)
	var b = _boss("keep")
	run.bind_boss(b)
	var completed := [0]
	run.completed.connect(func(): completed[0] += 1)
	b.take_damage(599)
	assert_true(not run.done, "alive at 1 hp")
	b.take_damage(1)
	assert_true(run.done, "zone complete")
	assert_eq(completed[0], 1, "signalled once")
	assert_true(inv.has_item("rune_fragment_2"), "dropped the second fragment")


func test_final_boss_completes_the_zone_without_a_fragment() -> void:
	var g = ZoneGrid.load_zone("cavern")
	var inv = Inventory.new()
	var run = ZoneRun.new(g, inv)
	var b = _boss("cavern")
	run.bind_boss(b)
	b.take_damage(5000)
	assert_true(run.done, "zone complete")
	assert_eq(inv.items.size(), 0, "the Verrglass drops no fragment")


func test_dead_boss_does_nothing() -> void:
	var b = _boss("keep")
	var p = _wizard()
	p.position = b.position + Vector2(10, 0)
	b.take_damage(9999)
	b.step(1.0, p)
	assert_eq(p.health.current, 100, "dead boss deals no damage")


func test_two_spells_kill_the_verrglass_hollow() -> void:
	var g = ZoneGrid.load_zone("cavern")
	var run = ZoneRun.new(g, Inventory.new())
	var b = _boss("cavern")
	run.bind_boss(b)
	var p = _wizard()
	p.position = b.position + Vector2(50, 0)
	var caster = Caster.new()
	assert_eq(caster.cast(SpellBook.find(["fire", "fire"]), p.position, [b]), 1, "supernova")
	assert_true(not run.done, "850 of 1500")
	assert_eq(caster.cast(SpellBook.find(["fire", "ice"]), p.position, [b]), 1, "thermal shock")
	assert_true(b.health.is_dead(), "boss dead")
	assert_true(run.done, "zone complete")
