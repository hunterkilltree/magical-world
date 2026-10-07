extends "res://harness/test_case.gd"

const MainScene := preload("res://scenes/Main.tscn")

var main: Node2D
var player: Player
var arena: Arena


func before_each() -> void:
	main = MainScene.instantiate()
	tree.root.add_child(main)
	player = main.get_node("Actors/Player")
	arena = main.get_node("World/Arena")
	await tree.physics_frame
	await tree.physics_frame


func after_test() -> void:
	Input.action_release("wasd_right")
	Input.action_release("move_up")
	tree.root.remove_child(main)
	main.free()


func _run(frames: int) -> void:
	for i in frames:
		await tree.physics_frame


func _put(p: Vector2) -> void:
	player.global_position = p
	player.velocity = Vector2.ZERO


# ---- movement ----------------------------------------------------------------------------------

func test_the_player_starts_at_the_arena_start() -> void:
	assert_true(player.global_position.distance_to(arena.player_start) < 1.0, "at the start tile")


func test_movement_follows_input_and_accelerates_smoothly() -> void:
	var x0 := player.global_position.x
	player.input_override = Vector2.RIGHT
	await _run(1)
	assert_true(player.velocity.length() > 0.0 and player.velocity.length() < player.move_speed * 0.5, "first frame is a gentle start")
	await _run(40)
	assert_true(player.global_position.x > x0 + 100.0, "moved east")
	assert_true(player.velocity.length() >= player.move_speed * 0.98, "reached full speed")
	assert_true(player.velocity.length() <= player.move_speed + 1.0, "never faster")


func test_diagonals_are_not_faster() -> void:
	player.input_override = Vector2(1, -1)
	await _run(40)
	assert_true(player.velocity.length() <= player.move_speed + 1.0, "speed %f" % player.velocity.length())


func test_the_player_slows_to_a_stop_when_input_stops() -> void:
	player.input_override = Vector2.UP
	await _run(30)
	player.input_override = Vector2.ZERO
	await _run(30)
	assert_true(player.velocity.length() < 1.0, "stopped")


# ---- collision ---------------------------------------------------------------------------------

func test_walls_stop_the_player() -> void:
	player.input_override = Vector2.DOWN  # the south wall is right below the start
	await _run(90)
	assert_true(player.global_position.y <= 17 * 56 - 14 + 0.5, "stopped at the wall (y=%f)" % player.global_position.y)


func test_water_stops_the_player() -> void:
	_put(arena.cell_center(Vector2i(10, 5)))  # lane cell; water starts at column 9
	player.input_override = Vector2.LEFT
	await _run(90)
	assert_true(player.global_position.x >= 10 * 56 + 14 - 0.5, "kept out of the water (x=%f)" % player.global_position.x)


func test_boulders_stop_the_player() -> void:
	var b := Vector2i(-1, -1)
	for y in Arena.ROWS.size():
		var x := Arena.ROWS[y].find("o")
		if x >= 0:
			b = Vector2i(x, y)
			break
	var centre := arena.cell_center(b)
	_put(centre + Vector2(-130, 0))
	player.input_override = Vector2.RIGHT
	await _run(120)
	assert_true(player.global_position.x < centre.x - 28.0, "stopped before the boulder (x=%f, boulder %f)" % [player.global_position.x, centre.x])


func test_the_closed_gate_blocks_and_the_open_gate_lets_you_through() -> void:
	_put(arena.bridge_rect.get_center())
	player.input_override = Vector2.UP
	await _run(150)
	assert_true(not arena.gate.is_open, "gate closed")
	assert_true(player.global_position.y >= arena.gate_rect.end.y + 14 - 0.5, "held back by the gate (y=%f)" % player.global_position.y)
	arena.gate.open()
	await _run(90)
	assert_true(player.global_position.y < arena.gate_rect.end.y - 5.0, "walked into the open gateway (y=%f)" % player.global_position.y)


# ---- camera ------------------------------------------------------------------------------------

func test_the_camera_follows_the_player_inside_the_arena() -> void:
	var cam := player.camera
	assert_true(cam.is_current(), "current camera")
	assert_true(cam.position_smoothing_enabled, "smooth follow")
	var r := arena.world_rect()
	assert_eq(cam.limit_left, int(r.position.x), "left limit")
	assert_eq(cam.limit_top, int(r.position.y), "top limit")
	assert_eq(cam.limit_right, int(r.end.x), "right limit")
	assert_eq(cam.limit_bottom, int(r.end.y) + Main_CAMERA_MARGIN, "bottom limit leaves room for the HUD")
	player.input_override = Vector2.UP
	await _run(60)
	await tree.process_frame
	assert_true(cam.get_screen_center_position().y < arena.player_start.y - 20.0, "the view moved north with the player")


const Main_CAMERA_MARGIN := 150


# ---- health, movement scheme -------------------------------------------------------------------

func test_hp_changes_are_signalled_and_clamped() -> void:
	var seen := []
	player.health_changed.connect(func(hp: float, mx: float) -> void: seen.append([hp, mx]))
	var died := [0]
	player.died.connect(func() -> void: died[0] += 1)
	player.take_damage(30.0)
	player.heal(10.0)
	player.heal(500.0)
	player.take_damage(500.0)
	player.take_damage(5.0)
	assert_eq(seen[0], [70.0, 100.0], "after 30 damage")
	assert_eq(seen[1], [80.0, 100.0], "after healing 10")
	assert_eq(seen[2], [100.0, 100.0], "healing is capped")
	assert_eq(player.hp, 0.0, "damage is floored at zero")
	assert_eq(died[0], 1, "death is signalled once")
	player.heal(10.0)
	assert_eq(player.hp, 0.0, "no healing the dead")


func test_debug_keys_change_hp() -> void:
	var dmg := InputEventAction.new()
	dmg.action = "debug_damage"
	dmg.pressed = true
	player._unhandled_input(dmg)
	assert_eq(player.hp, 90.0, "F1 hurts")
	var heal := InputEventAction.new()
	heal.action = "debug_heal"
	heal.pressed = true
	player._unhandled_input(heal)
	assert_eq(player.hp, 100.0, "F2 heals")


func test_arrows_always_move_and_wasd_only_after_tab() -> void:
	Input.action_press("wasd_right")
	assert_eq(player._read_move_input(), Vector2.ZERO, "W/A/S/D do not move by default")
	var tab := InputEventAction.new()
	tab.action = "toggle_move_scheme"
	tab.pressed = true
	var changes := []
	player.move_scheme_changed.connect(func(on: bool) -> void: changes.append(on))
	player._unhandled_input(tab)
	assert_true(player.wasd_movement and player.caster.wasd_needs_shift, "Tab switches to WASD and frees those spell keys")
	assert_eq(player._read_move_input(), Vector2.RIGHT, "D now moves")
	Input.action_release("wasd_right")
	Input.action_press("move_up")
	assert_eq(player._read_move_input(), Vector2.UP, "arrows still work in WASD mode")
	player._unhandled_input(tab)
	assert_true(not player.wasd_movement and not player.caster.wasd_needs_shift, "Tab switches back")
	assert_eq(changes, [true, false], "both changes signalled")
