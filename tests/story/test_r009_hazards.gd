extends "res://harness/test_case.gd"

const ZoneGrid = preload("res://scripts/core/zone_grid.gd")
const Player = preload("res://scripts/player.gd")


func _hazard_cell(g) -> Vector2i:
	return g.cells_of("~")[0]


func test_rough_tiles_slow() -> void:
	var g = ZoneGrid.load_zone("tundra")
	var e: Dictionary = g.stand_on(g.cells_of(",")[0], 0.1)
	assert_eq(e["speed"], 0.7, "rough speed")
	assert_eq(e["dps"], 0.0, "rough dps")


func test_floor_has_no_effect() -> void:
	var g = ZoneGrid.load_zone("tundra")
	var e: Dictionary = g.stand_on(g.cells_of("S")[0], 0.1)
	assert_eq(e["speed"], 1.0, "speed")
	assert_eq(e["dps"], 0.0, "dps")


func test_thin_ice_breaks_under_weight_then_hurts() -> void:
	var g = ZoneGrid.load_zone("tundra")
	var c := _hazard_cell(g)
	assert_eq(g.stand_on(c, 0.5)["dps"], 0.0, "ice holds briefly")
	g.stand_on(c, 0.6)
	assert_eq(g.tile_at(c), "w", "ice broke")
	assert_eq(g.stand_on(c, 0.1)["dps"], 10.0, "water hurts")


func test_lava_damages_over_time() -> void:
	var g = ZoneGrid.load_zone("volcano")
	var p = Player.new()
	p.grid = g
	p.position = g.cell_center(_hazard_cell(g))
	for i in 60:
		p.step(1.0 / 60.0, Vector2.ZERO)
	assert_true(p.health.current <= 86 and p.health.current >= 84, "about 15 damage, got %d lost" % (100 - p.health.current))
	p.free()


func test_bog_and_cavern_hazards() -> void:
	var bog = ZoneGrid.load_zone("bog")
	assert_eq(bog.stand_on(_hazard_cell(bog), 0.1)["speed"], 0.4, "bog slows")
	var cav = ZoneGrid.load_zone("cavern")
	assert_eq(cav.stand_on(_hazard_cell(cav), 0.1)["dps"], 8.0, "void hurts")
