extends "res://harness/test_case.gd"

const ZoneGrid = preload("res://scripts/core/zone_grid.gd")
const Level = preload("res://scripts/level.gd")
const Player = preload("res://scripts/player.gd")


func test_unknown_zone_is_null() -> void:
	assert_true(ZoneGrid.load_zone("nowhere") == null, "unknown zone")


func test_blockers_and_void_never_walkable() -> void:
	var g = ZoneGrid.load_zone("tundra")
	for ch in ["#", " ", "o"]:
		for c in g.cells_of(ch):
			assert_true(not g.is_walkable(c), "%s at %s walkable" % [ch, c])
	assert_true(not g.is_walkable(Vector2i(-1, 0)), "out of bounds")


func test_entry_tiles_walkable_and_level_places_party() -> void:
	var level = Level.new()
	assert_true(level.build("tundra"), "level builds")
	var entries: Array = level.entry_positions()
	assert_eq(entries.size(), 2, "two entry tiles")
	for p in entries:
		assert_eq(level.grid.tile_at(level.grid.world_to_cell(p)), "S", "party on entry tile")
	assert_eq(level.enemy_spawn_positions().size(), 2, "enemy spawns")
	level.free()


func test_wizard_cannot_walk_into_a_wall() -> void:
	var g = ZoneGrid.load_zone("tundra")
	var p = Player.new()
	p.grid = g
	p.position = g.cell_center(g.cells_of("S")[0])
	for i in 600:
		p.step(1.0 / 60.0, Vector2.DOWN)  # the south wall is directly below the entry
	assert_true(g.is_walkable(g.world_to_cell(p.position)), "ended inside a wall")
	p.free()
