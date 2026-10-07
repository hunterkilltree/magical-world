# R-014: each zone has a scripted run to its objective. Zones are added one at a time.
extends "res://harness/test_case.gd"

const ZoneGrid = preload("res://scripts/core/zone_grid.gd")
const ZoneRun = preload("res://scripts/core/zone_run.gd")
const Inventory = preload("res://scripts/core/inventory.gd")
const Player = preload("res://scripts/player.gd")
const Enemy = preload("res://scripts/core/enemy.gd")
const Walker = preload("res://tests/support/walker.gd")
const Boss = preload("res://scripts/core/boss.gd")
const Caster = preload("res://scripts/core/caster.gd")
const SpellBook = preload("res://scripts/core/spell_book.gd")

var nodes: Array = []


func after_test() -> void:
	for n in nodes:
		n.free()


func _wizard(g):
	var p = Player.new()
	nodes.append(p)
	p.grid = g
	p.position = g.cell_center(g.cells_of("S")[0])
	return p


func _thralls(g) -> Array:
	var out := []
	for c in g.cells_of("E"):
		var e = Enemy.new()
		nodes.append(e)
		e.grid = g
		e.position = g.cell_center(c)
		out.append(e)
	return out


# ---- zone 2: Ashvold Pinewood ---------------------------------------------

func _ne_cache(g) -> Vector2i:
	for c in g.cells_of("C"):
		if c.x >= g.width / 2 and c.y < g.height / 2:
			return c
	return Vector2i(-1, -1)


func test_pine_has_a_north_east_cache() -> void:
	var g = ZoneGrid.load_zone("pine")
	assert_true(_ne_cache(g).x >= 0, "north-east cache exists")


func test_pine_run_reaches_the_cache_with_ambushers_chasing() -> void:
	var g = ZoneGrid.load_zone("pine")
	var inv = Inventory.new()
	var run = ZoneRun.new(g, inv)
	var p = _wizard(g)
	var cache := _ne_cache(g)
	Walker.walk_to(self, p, g, run, cache, [], _thralls(g))
	assert_true(not run.done, "standing at the cache is not enough")
	g.open_loot(cache, inv)
	run.update(g.world_to_cell(p.position))
	assert_true(run.done, "zone complete once the cache is looted")
	assert_true(p.health.current > 0, "wizard survived the ambush")


func test_pine_cache_is_reachable_without_burning_the_log_pile() -> void:
	var g = ZoneGrid.load_zone("pine")
	var start: Vector2i = g.cells_of("S")[0]
	var long_way: Array = g.find_path(start, _ne_cache(g))
	assert_true(not long_way.is_empty(), "long way exists with the pile intact")
	for c in g.cells_of("D"):
		g.damage_tile(c, 1, "fire")
	var short_way: Array = g.find_path(start, _ne_cache(g))
	assert_true(short_way.size() <= long_way.size(), "burning never makes the route longer")


func test_pine_not_complete_by_looting_nothing() -> void:
	var g = ZoneGrid.load_zone("pine")
	var run = ZoneRun.new(g, Inventory.new())
	run.update(g.cells_of("S")[0])
	assert_true(not run.done, "fresh run is incomplete")


# ---- zone 5: Mirefen Bog ---------------------------------------------------
# Objective: loot the sunken barge (north-east cache) and get back out to the
# ferry landing (entry) before dark.

func _barge(g) -> Vector2i:
	return g.cells_of("C")[0]


func test_bog_dry_causeway_route_exists() -> void:
	var g = ZoneGrid.load_zone("bog")
	var path: Array = g.find_path(g.cells_of("S")[0], _barge(g), ["~"])
	assert_true(not path.is_empty(), "a route to the barge that avoids the sink pools")


func test_bog_run_there_and_back_before_dark() -> void:
	var g = ZoneGrid.load_zone("bog")
	var inv = Inventory.new()
	var run = ZoneRun.new(g, inv)
	var p = _wizard(g)
	var thralls := _thralls(g)
	Walker.walk_to(self, p, g, run, _barge(g), ["~"], thralls)
	assert_true(not run.done, "reaching the barge is not enough")
	g.open_loot(_barge(g), inv)
	run.update(g.world_to_cell(p.position))
	assert_true(not run.done, "looted but still in the bog")
	Walker.walk_to(self, p, g, run, g.cells_of("S")[0], ["~"], thralls)
	assert_true(run.done, "zone complete back at the ferry landing")
	assert_true(not run.failed, "made it before dark")
	assert_true(run.elapsed < 90.0, "took %.1fs" % run.elapsed)
	assert_true(p.health.current > 0, "wizard survived")


func test_bog_returning_empty_handed_is_not_enough() -> void:
	var g = ZoneGrid.load_zone("bog")
	var run = ZoneRun.new(g, Inventory.new())
	run.update(g.cells_of("S")[0])
	assert_true(not run.done, "no barge loot, no completion")


func test_bog_dark_falls_and_fails_the_run() -> void:
	var g = ZoneGrid.load_zone("bog")
	var inv = Inventory.new()
	var run = ZoneRun.new(g, inv)
	var failed_count := [0]
	run.failed_signal.connect(func(): failed_count[0] += 1)
	run.tick(89.0)
	assert_true(not run.failed, "still light")
	run.tick(2.0)
	assert_true(run.failed, "dark")
	run.tick(100.0)
	assert_eq(failed_count[0], 1, "failure signalled once")
	g.open_loot(_barge(g), inv)
	run.update(g.cells_of("S")[0])
	assert_true(not run.done, "too late to complete")


# ---- zone 6: Sunken Verrglass ---------------------------------------------
# Objective: descend the throat to the hollow and stand on the boss dais.
# Completion needs the boss defeated, which arrives with R-015.

func _dais(g) -> Vector2i:
	return g.cells_of("B")[0]


func test_cavern_dais_reachable_dry_and_through_the_void() -> void:
	var g = ZoneGrid.load_zone("cavern")
	var start: Vector2i = g.cells_of("S")[0]
	assert_true(not g.find_path(start, _dais(g), ["~"]).is_empty(), "dry route")
	var wet: Array = g.find_path(start, _dais(g))
	assert_true(not wet.is_empty(), "route through the void pools")
	assert_true(wet.size() < g.find_path(start, _dais(g), ["~"]).size(), "void route is the short one")


func test_cavern_dry_run_reaches_the_boss_with_a_thrall_chasing() -> void:
	var g = ZoneGrid.load_zone("cavern")
	var run = ZoneRun.new(g, Inventory.new())
	var reached := [0]
	run.boss_reached.connect(func(): reached[0] += 1)
	var p = _wizard(g)
	assert_true(not run.at_boss, "not at the boss yet")
	Walker.walk_to(self, p, g, run, _dais(g), ["~"], _thralls(g))
	assert_true(run.at_boss, "reached the hollow")
	assert_eq(reached[0], 1, "signalled once")
	assert_true(not run.done, "zone is not complete until the boss falls")
	assert_eq(p.health.current, 100, "dry route takes no void damage")


func test_cavern_void_shortcut_hurts_but_works() -> void:
	var g = ZoneGrid.load_zone("cavern")
	var run = ZoneRun.new(g, Inventory.new())
	var p = _wizard(g)
	Walker.walk_to(self, p, g, run, _dais(g))
	assert_true(run.at_boss, "reached the hollow")
	assert_true(p.health.current < 100, "void pools cost health")
	assert_true(p.health.current > 0, "but not the wizard")


func test_cavern_other_zones_never_report_a_boss() -> void:
	var g = ZoneGrid.load_zone("pine")
	var run = ZoneRun.new(g, Inventory.new())
	run.update(g.cells_of("S")[0])
	assert_true(not run.at_boss, "pine has no boss pad")


# ---- zone 4: Eldrhólt Wastes -----------------------------------------------
# Objective: cross the cinder islands and break the Cinder Colossus on the north shelf.
# The lava channels are the fast way; the dry way needs the gates open.

func _colossus(g, run):
	var b = Boss.spawn_for(g)
	nodes.append(b)
	run.bind_boss(b)
	return b


func test_volcano_routes_lava_or_open_gates() -> void:
	var g = ZoneGrid.load_zone("volcano")
	var start: Vector2i = g.cells_of("S")[0]
	var pad: Vector2i = g.cells_of("B")[0]
	assert_true(not g.find_path(start, pad).is_empty(), "route through the lava")
	assert_true(g.find_path(start, pad, ["~"]).is_empty(), "no dry route while the gates are shut")
	g.open_gates()
	assert_true(not g.find_path(start, pad, ["~"]).is_empty(), "dry route once the gates are open")


func test_volcano_lava_run_reaches_the_colossus_and_survives() -> void:
	var g = ZoneGrid.load_zone("volcano")
	var run = ZoneRun.new(g, Inventory.new())
	var colossus = _colossus(g, run)
	var p = _wizard(g)
	var chasers := _thralls(g)
	chasers.append(colossus)
	Walker.walk_to(self, p, g, run, g.cells_of("B")[0], [], chasers)
	assert_true(run.at_boss, "reached the north shelf")
	assert_true(not run.done, "the Colossus still stands")
	assert_true(p.health.current < 100, "lava and thralls cost health")
	assert_true(p.health.current > 0, "wizard survived the crossing (health %d)" % p.health.current)


func test_volcano_colossus_falls_to_two_spells_and_drops_fragment_three() -> void:
	var g = ZoneGrid.load_zone("volcano")
	var inv = Inventory.new()
	var run = ZoneRun.new(g, inv)
	var colossus = _colossus(g, run)
	var p = _wizard(g)
	p.position = colossus.position + Vector2(50, 0)
	var caster = Caster.new()
	caster.cast(SpellBook.find(["fire", "fire"]), p.position, [colossus])  # 850 of 900
	assert_true(not run.done, "50 hp left")
	assert_eq(colossus.phase, 2, "final phase near death")
	caster.cast(SpellBook.find(["fire", "ice"]), p.position, [colossus])
	assert_true(colossus.health.is_dead(), "Colossus broken")
	assert_true(run.done, "zone complete")
	assert_true(inv.has_item("rune_fragment_3"), "third fragment")
