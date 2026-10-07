extends "res://harness/test_case.gd"

const ArenaScene := preload("res://scenes/world/Arena.tscn")

var arena: Arena


func before_each() -> void:
	arena = ArenaScene.instantiate()
	tree.root.add_child(arena)  # runs _ready, which builds the arena


func after_test() -> void:
	tree.root.remove_child(arena)
	arena.free()


func _walkable(ch: String) -> bool:
	return ch in [".", ",", "B", "S", "E"]


func test_the_layout_is_a_clean_rectangle_of_tiles() -> void:
	assert_eq(arena.grid_size, Vector2i(26, 18), "26 x 18 tiles")
	for i in Arena.ROWS.size():
		assert_eq(Arena.ROWS[i].length(), 26, "row %d width" % i)
	var r := arena.world_rect()
	assert_eq(r.size, Vector2(26 * 56, 18 * 56), "world size in pixels")


func test_the_player_starts_near_the_bottom_centre() -> void:
	var r := arena.world_rect()
	assert_true(absf(arena.player_start.x - r.get_center().x) < 1.0, "horizontally centred")
	assert_true(arena.player_start.y > r.size.y * 0.85, "near the bottom edge")


func test_the_bridge_and_gate_are_in_the_north_and_centred() -> void:
	var r := arena.world_rect()
	assert_true(arena.bridge_rect.get_center().y < r.size.y * 0.25, "bridge in the north")
	assert_true(absf(arena.bridge_rect.get_center().x - r.get_center().x) < 1.0, "bridge centred")
	assert_true(arena.gate_rect.end.y <= arena.bridge_rect.position.y + 0.1, "gate is beyond the bridge")
	assert_true(absf(arena.gate_rect.get_center().x - r.get_center().x) < 1.0, "gate centred")
	assert_true(arena.bridge_rect.size.x >= 6 * 56 and arena.bridge_rect.size.y >= 2 * 56, "a decent shelf")


func test_enemy_spawn_markers_are_inside_the_arena() -> void:
	assert_true(arena.enemy_spawns.size() >= 2, "markers for later milestones")
	for p in arena.enemy_spawns:
		assert_true(arena.world_rect().has_point(p), "inside")


func test_the_bridge_is_reachable_on_foot_from_the_start() -> void:
	# Breadth-first search over the ASCII layout: walls, boulders, water and the gate block.
	var start := Vector2i(int(arena.player_start.x) / 56, int(arena.player_start.y) / 56)
	var seen := {start: true}
	var queue := [start]
	while not queue.is_empty():
		var c: Vector2i = queue.pop_front()
		for d in [Vector2i.UP, Vector2i.DOWN, Vector2i.LEFT, Vector2i.RIGHT]:
			var n: Vector2i = c + d
			if seen.has(n) or n.x < 0 or n.y < 0 or n.x >= 26 or n.y >= 18:
				continue
			if _walkable(Arena.ROWS[n.y][n.x]):
				seen[n] = true
				queue.append(n)
	var reached := 0
	var total := 0
	for y in 18:
		for x in 26:
			if Arena.ROWS[y][x] == "B":
				total += 1
				if seen.has(Vector2i(x, y)):
					reached += 1
	assert_true(total > 0 and reached == total, "all %d bridge tiles reachable (%d)" % [total, reached])
	for y in 18:
		for x in 26:
			if Arena.ROWS[y][x] == "G":
				assert_true(not seen.has(Vector2i(x, y)), "the closed gate is not walkable")


func test_solid_tiles_carry_collision_and_floors_do_not() -> void:
	var wall := _first_cell("#")
	var water := _first_cell("~")
	var boulder := _first_cell("o")
	var snow := _first_cell(".")
	assert_true(arena.obstacles.get_cell_tile_data(wall).get_collision_polygons_count(0) > 0, "walls collide")
	assert_true(arena.ground.get_cell_tile_data(water).get_collision_polygons_count(0) > 0, "water collides")
	assert_true(arena.obstacles.get_cell_tile_data(boulder).get_collision_polygons_count(0) > 0, "boulders collide")
	assert_eq(arena.ground.get_cell_tile_data(snow).get_collision_polygons_count(0), 0, "snow is walkable")
	assert_true(arena.ground.get_cell_tile_data(_first_cell("B")).get_collision_polygons_count(0) == 0, "the bridge is walkable")


func test_the_gate_starts_closed_and_opens_on_request() -> void:
	var gate := arena.gate
	assert_true(not gate.is_open, "closed")
	assert_true(not (gate.get_node("CollisionShape2D") as CollisionShape2D).disabled, "solid")
	var opened := [0]
	gate.opened.connect(func() -> void: opened[0] += 1)
	gate.open()
	gate.open()
	await tree.process_frame
	assert_true(gate.is_open, "open")
	assert_true((gate.get_node("CollisionShape2D") as CollisionShape2D).disabled, "no longer solid")
	assert_eq(opened[0], 1, "signalled once")


func test_building_twice_is_harmless() -> void:
	var n := arena.enemy_spawns.size()
	arena.build()
	assert_eq(arena.enemy_spawns.size(), n, "no duplicate spawns")


func _first_cell(ch: String) -> Vector2i:
	for y in Arena.ROWS.size():
		var x := Arena.ROWS[y].find(ch)
		if x >= 0:
			return Vector2i(x, y)
	return Vector2i(-1, -1)
