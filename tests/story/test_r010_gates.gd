extends "res://harness/test_case.gd"

const ZoneGrid = preload("res://scripts/core/zone_grid.gd")


func test_gates_block_until_opened() -> void:
	var g = ZoneGrid.load_zone("tundra")
	for c in g.cells_of("G"):
		assert_true(not g.is_walkable(c), "closed gate at %s" % c)
	g.open_gates()
	for c in g.cells_of("G"):
		assert_true(g.is_walkable(c), "open gate at %s" % c)


func test_holding_the_gate_area_opens_it() -> void:
	var g = ZoneGrid.load_zone("tundra")
	var gate: Vector2i = g.cells_of("G")[0]
	var t := 0.0
	while t < 9.0:
		g.update_gate_hold(gate, 0.5)
		t += 0.5
	assert_true(not g.gates_open, "not yet at 9s")
	g.update_gate_hold(gate, 1.5)
	assert_true(g.gates_open, "open after 10s")
	g.update_gate_hold(Vector2i(0, 0), 1.0)
	assert_true(g.gates_open, "stays open")


func test_standing_away_does_not_count() -> void:
	var g = ZoneGrid.load_zone("tundra")
	for i in 100:
		g.update_gate_hold(g.cells_of("S")[0], 1.0)
	assert_true(not g.gates_open, "far away")


func test_zones_without_a_hold_rule_stay_shut() -> void:
	var g = ZoneGrid.load_zone("pine")
	var gate: Vector2i = g.cells_of("G")[0]
	for i in 100:
		g.update_gate_hold(gate, 1.0)
	assert_true(not g.gates_open, "pine gates need their own rule")
