extends "res://harness/test_case.gd"

const ZoneGrid = preload("res://scripts/core/zone_grid.gd")
const ZoneRun = preload("res://scripts/core/zone_run.gd")
const Inventory = preload("res://scripts/core/inventory.gd")
const Player = preload("res://scripts/player.gd")

const Walker = preload("res://tests/support/walker.gd")


func test_full_run_completes_the_zone() -> void:
	var g = ZoneGrid.load_zone("tundra")
	var inv = Inventory.new()
	var run = ZoneRun.new(g, inv)
	var p = Player.new()
	p.grid = g
	p.position = g.cell_center(g.cells_of("S")[0])

	var cache: Vector2i = g.cells_of("C")[0]
	Walker.walk_to(self, p, g, run, cache, ["~"])
	g.open_loot(cache, inv)

	var reach: Dictionary = g.reachable_from(g.world_to_cell(p.position), ["~"])
	var hold_cell := Vector2i(-1, -1)
	for c in reach.keys():
		if c.y < 8 and g.in_hold_area(c):
			hold_cell = c
			break
	assert_true(hold_cell.x >= 0, "a hold position near the north gate exists")
	Walker.walk_to(self, p, g, run, hold_cell, ["~"])
	var waited := 0.0
	while not g.gates_open and waited < 30.0:
		g.update_gate_hold(g.world_to_cell(p.position), 0.1)
		waited += 0.1
	assert_true(g.gates_open, "gates opened by holding")
	assert_true(not run.done, "not complete before the exit")

	Walker.walk_to(self, p, g, run, run.exit_cells()[0], ["~"])
	assert_true(run.done, "zone complete at the north exit")
	assert_true(p.health.current > 0, "wizard survived")
	p.free()


func test_exit_does_not_count_without_gates_and_cache() -> void:
	var g = ZoneGrid.load_zone("tundra")
	var inv = Inventory.new()
	var run = ZoneRun.new(g, inv)
	var exit: Vector2i = run.exit_cells()[0]
	run.update(exit)
	assert_true(not run.done, "no gates, no cache")
	g.open_gates()
	run.update(exit)
	assert_true(not run.done, "gates but no cache")
	g.open_loot(g.cells_of("C")[0], inv)
	run.update(exit)
	assert_true(run.done, "gates and cache")
