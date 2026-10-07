# R-014: each zone has a scripted run to its objective. Zones are added one at a time.
extends "res://harness/test_case.gd"

const ZoneGrid = preload("res://scripts/core/zone_grid.gd")
const ZoneRun = preload("res://scripts/core/zone_run.gd")
const Inventory = preload("res://scripts/core/inventory.gd")
const Player = preload("res://scripts/player.gd")
const Enemy = preload("res://scripts/core/enemy.gd")
const Walker = preload("res://tests/support/walker.gd")

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
