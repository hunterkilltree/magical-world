extends "res://harness/test_case.gd"

const Level = preload("res://scripts/level.gd")
const ZoneGrid = preload("res://scripts/core/zone_grid.gd")


func _find(g, wall_below: bool) -> Vector2i:
	for c in g.cells_of("#"):
		var below: String = g.tile_at(c + Vector2i.DOWN)
		if (below in ["#", "o"]) == wall_below:
			return c
	return Vector2i(-1, -1)


func test_a_wall_shows_its_front_face_only_where_nothing_solid_is_below() -> void:
	var g = ZoneGrid.load_zone("keep")
	var exposed := _find(g, false)
	var buried := _find(g, true)
	assert_true(exposed.x >= 0 and buried.x >= 0, "the keep has both kinds")
	assert_true(Level.front_visible(g, exposed), "floor below: front face drawn")
	assert_true(not Level.front_visible(g, buried), "wall below: no front face")


func test_only_walls_and_boulders_are_raised() -> void:
	var g = ZoneGrid.load_zone("keep")
	assert_true(not Level.front_visible(g, g.cells_of("S")[0]), "entry")
	assert_true(not Level.front_visible(g, g.cells_of("C")[0]), "cache")
	assert_true(Level.is_raised(g, g.cells_of("o")[0]), "boulders are raised")
	assert_true(Level.is_raised(g, g.cells_of("#")[0]), "walls are raised")
	assert_true(not Level.is_raised(g, g.cells_of("S")[0]), "floor is not")


func test_floor_variation_is_deterministic_and_small() -> void:
	for c in [Vector2i(3, 4), Vector2i(10, 2), Vector2i(0, 0)]:
		var a: float = Level.tile_shade(c)
		assert_eq(a, Level.tile_shade(c), "same every time")
		assert_true(absf(a) <= 0.06, "within 6%%: %f" % a)
	assert_true(Level.tile_shade(Vector2i(1, 1)) != Level.tile_shade(Vector2i(2, 5)), "varies between tiles")
