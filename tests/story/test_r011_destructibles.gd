extends "res://harness/test_case.gd"

const ZoneGrid = preload("res://scripts/core/zone_grid.gd")


func test_destructible_blocks_until_destroyed() -> void:
	var g = ZoneGrid.load_zone("pine")
	var c: Vector2i = g.cells_of("D")[0]
	assert_true(not g.is_walkable(c), "blocked")
	assert_true(not g.damage_tile(c, 10), "first hit")
	assert_true(not g.damage_tile(c, 10), "second hit")
	assert_eq(g.tile_at(c), "D", "still standing")
	assert_true(g.damage_tile(c, 10), "third hit destroys")
	assert_eq(g.tile_at(c), ".", "now floor")
	assert_true(g.is_walkable(c), "walkable")


func test_fire_destroys_outright() -> void:
	var g = ZoneGrid.load_zone("bog")
	var c: Vector2i = g.cells_of("D")[0]
	assert_true(g.damage_tile(c, 1, "fire"), "burned")
	assert_true(g.is_walkable(c), "walkable")


func test_other_tiles_are_unaffected() -> void:
	var g = ZoneGrid.load_zone("pine")
	var c: Vector2i = g.cells_of("#")[0]
	assert_true(not g.damage_tile(c, 9999, "fire"), "walls are not destructible")
	assert_eq(g.tile_at(c), "#", "unchanged")
