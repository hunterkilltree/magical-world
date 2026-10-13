extends "res://harness/test_case.gd"

const ZoneGrid = preload("res://scripts/core/zone_grid.gd")
const ZoneModel = preload("res://scripts/view3d/zone_model.gd")

const PATH := "user://test_r035_main.json"
const ZONES := ["tundra", "pine", "keep", "volcano", "bog", "cavern"]

var main = null


func after_test() -> void:
	if main != null and is_instance_valid(main):
		main.free()
	main = null
	if FileAccess.file_exists(PATH):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(PATH))


# Main in the running tree (the camera needs a viewport), inside `zone`.
func _enter(zone: String) -> void:
	main = load("res://scenes/main.tscn").instantiate()
	main.save_path = PATH
	tree.root.add_child(main)
	main.start()
	main.new_game()
	main.session.campaign.restore(ZONES.slice(0, 5))
	main.enter_zone(zone)


func _terrain_vertices(view) -> int:
	var mesh: ArrayMesh = view.zone_model.get_node("Terrain").mesh
	var n := 0
	for s in mesh.get_surface_count():
		n += (mesh.surface_get_arrays(s)[Mesh.ARRAY_VERTEX] as PackedVector3Array).size()
	return n


func test_every_zone_is_built_as_a_3d_diorama() -> void:
	for id in ZONES:
		var g = ZoneGrid.load_zone(id)
		var m = ZoneModel.new()
		m.build(g)
		var terrain: MeshInstance3D = m.get_node("Terrain")
		assert_true(terrain.mesh.get_surface_count() >= 5, "%s: floors, walls and props" % id)
		m.free()


func test_the_camera_is_a_tilted_orthographic_view_that_follows_the_wizard() -> void:
	_enter("tundra")
	var view = main.zone_view
	assert_not_null(view, "zone view")
	var cam: Camera3D = view.camera
	assert_true(cam.current or cam == main.get_viewport().get_camera_3d(), "zone camera in use")
	assert_eq(cam.projection, Camera3D.PROJECTION_ORTHOGONAL, "orthographic")
	assert_true(absf(cam.rotation_degrees.x + view.PITCH_DEG) < 0.01, "tilted down")
	assert_true(absf(cam.rotation_degrees.y) < 0.01, "north is up the screen")
	# the wizard is on screen, in the map area above the spell UI
	var at: Vector2 = view.logic_to_screen(main.play.wizard.position)
	assert_true(view.map_rect().has_point(at), "wizard on screen at %s" % at)
	# the wizard crosses to the north shelf: the camera follows
	var before: Vector3 = cam.position
	main.play.wizard.position = main.play.grid.cell_center(Vector2i(12, 2))
	for i in 90:
		main.tick(1.0 / 60.0, Vector2.ZERO)
	assert_true(cam.position.z < before.z - 0.5, "camera followed north")
	assert_true(view.map_rect().has_point(view.logic_to_screen(main.play.wizard.position)), "still on screen")


func test_the_camera_stays_over_the_map() -> void:
	_enter("tundra")
	var view = main.zone_view
	var g = main.play.grid
	main.play.wizard.position = Vector2(0, 0)  # the far north-west corner
	for i in 120:
		view.sync(1.0 / 60.0)
	var area: Rect2 = view.map_rect()
	var corner: Vector2 = view.logic_to_screen(Vector2.ZERO)
	assert_true(absf(corner.x) < 0.5 and absf(corner.y) < 0.5, "map's north-west corner at the top-left, got %s" % corner)
	main.play.wizard.position = Vector2(g.width, g.height) * g.TILE
	for i in 120:
		view.sync(1.0 / 60.0)
	var far: Vector2 = view.logic_to_screen(Vector2(g.width, g.height) * g.TILE)
	assert_true(absf(far.x - area.end.x) < 0.5 and absf(far.y - area.end.y) < 0.5,
		"map's south-east corner at the bottom-right of the map area, got %s in %s" % [far, area])


func test_clicking_the_floor_picks_the_point_under_the_cursor() -> void:
	_enter("tundra")
	var view = main.zone_view
	for p in [main.play.wizard.position, main.play.wizard.position + Vector2(70, -90), Vector2(300, 260)]:
		var screen: Vector2 = view.logic_to_screen(p)
		var back = view.screen_to_logic(screen)
		assert_not_null(back, "ray hits the floor")
		if back != null:
			assert_true((back as Vector2).distance_to(p) < 1.0, "round trip %s -> %s" % [p, back])


func test_spell_rings_lie_on_the_floor() -> void:
	_enter("tundra")
	main.tick(0.016, Vector2.ZERO)
	var ground: Transform2D = main.effects_view.ground
	var p: Vector2 = main.play.wizard.position
	assert_true((ground * p).distance_to(main.zone_view.logic_to_screen(p)) < 0.5, "ground transform matches the camera")
	assert_true(absf(ground.x.x) > absf(ground.y.y), "the floor is foreshortened north-south")


func test_closed_gates_have_bars_that_go_when_they_open() -> void:
	_enter("tundra")
	var view = main.zone_view
	var closed := _terrain_vertices(view)
	main.play.grid.open_gates()
	main.tick(0.016, Vector2.ZERO)
	assert_true(_terrain_vertices(view) < closed, "portcullis bars removed")


func test_front_walls_are_cut_down_so_they_never_hide_the_wizard() -> void:
	var g = ZoneGrid.load_zone("tundra")
	# row 17 is the south wall, right below the entry
	var front: Vector2i = Vector2i(g.cells_of("S")[0].x, g.cells_of("S")[0].y + 1)
	assert_eq(g.tile_at(front), "#", "a wall south of the entry")
	assert_eq(ZoneModel.wall_height(g, front), ZoneModel.LOW_WALL, "front wall is low")
	# the north-west rim of the shelf has only void and wall to its north
	var back := Vector2i(10, 0)
	assert_eq(g.tile_at(back), "#", "a back wall")
	assert_eq(ZoneModel.wall_height(g, back), ZoneModel.HEIGHT["#"], "back wall is full height")
