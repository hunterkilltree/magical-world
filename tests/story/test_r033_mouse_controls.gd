extends "res://harness/test_case.gd"

const ZonePlay = preload("res://scripts/core/zone_play.gd")
const ZoneGrid = preload("res://scripts/core/zone_grid.gd")
const Inventory = preload("res://scripts/core/inventory.gd")

const PATH := "user://test_r033_main.json"

var play
var main = null


func before_each() -> void:
	play = ZonePlay.create(ZoneGrid.load_zone("tundra"), Inventory.new())


func after_test() -> void:
	play.free_nodes()
	if main != null and is_instance_valid(main):
		main.free()
	main = null
	if FileAccess.file_exists(PATH):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(PATH))


# A walkable point a few tiles from the start, in a straight open line.
func _open_point_near(from: Vector2) -> Vector2:
	for i in 16:
		var dir := Vector2.from_angle(i * TAU / 16.0)
		var ok := true
		for d in range(4, 65, 4):
			if not play.grid.can_stand(from + dir * d, 10.0):
				ok = false
		if ok:
			return from + dir * 64.0
	return from


func test_a_click_walks_the_wizard_to_the_point_and_stops() -> void:
	var start: Vector2 = play.wizard.position
	var goal := _open_point_near(start)
	assert_true(goal != start, "found open ground")
	play.move_to(goal)
	for i in 120:
		play.tick(1.0 / 60.0, Vector2.ZERO)
	assert_true(play.wizard.position.distance_to(goal) < 6.0, "arrived: %s vs %s" % [play.wizard.position, goal])
	assert_true(not play.has_move_target(), "walk finished")
	var at: Vector2 = play.wizard.position
	play.tick(0.1, Vector2.ZERO)
	assert_eq(play.wizard.position, at, "stays put after arriving")


func test_arrow_keys_cancel_the_walk() -> void:
	var start: Vector2 = play.wizard.position
	play.move_to(_open_point_near(start))
	play.tick(0.05, Vector2.ZERO)
	play.tick(0.05, Vector2.RIGHT)
	assert_true(not play.has_move_target(), "keys took over")


func test_a_blocked_walk_gives_up() -> void:
	play.move_to(Vector2(-500, -500))  # off the map, behind walls
	for i in 300:
		play.tick(1.0 / 60.0, Vector2.ZERO)
	assert_true(not play.has_move_target(), "gave up")


func test_the_wizard_faces_the_mouse() -> void:
	var w = play.wizard
	play.aim_at(w.position + Vector2(0, -100))
	assert_true(w.facing.distance_to(Vector2.UP) < 0.001, "faces up")
	play.tick(0.05, Vector2.RIGHT)
	assert_true(w.facing.y < -0.99, "walking right keeps aiming at the cursor: %s" % w.facing)


func test_a_beam_fires_where_you_point() -> void:
	play.aim_at(play.wizard.position + Vector2(0, 100))
	play.queue_element("fire")
	play.queue_element("lightning")
	play.cast()
	var fx: Dictionary = play.effects[-1]
	assert_eq(fx["kind"], "beam", "beam")
	assert_true(fx["dir"].distance_to(Vector2.DOWN) < 0.01, "points down: %s" % fx["dir"])


func _click(button: int) -> InputEventMouseButton:
	var ev := InputEventMouseButton.new()
	ev.button_index = button
	ev.pressed = true
	return ev


func test_main_left_click_moves_and_right_click_casts() -> void:
	main = load("res://scenes/main.tscn").instantiate()
	main.save_path = PATH
	main.start()
	main.new_game()
	main.enter_zone("tundra")
	var w = main.play.wizard
	var target: Vector2 = w.position + Vector2(64, 0)
	main.handle_zone_mouse(_click(MOUSE_BUTTON_LEFT), target)
	assert_true(main.play.has_move_target(), "walking")
	main.play.queue_element("fire")
	main.play.queue_element("fire")
	main.handle_zone_mouse(_click(MOUSE_BUTTON_RIGHT), w.position + Vector2(0, -50))
	assert_eq(main.play.queue.queue.size(), 0, "cast")
	assert_true(w.facing.distance_to(Vector2.UP) < 0.001, "aimed up")
	var motion := InputEventMouseMotion.new()
	main.handle_zone_mouse(motion, w.position + Vector2(-80, 0))
	assert_true(w.facing.distance_to(Vector2.LEFT) < 0.001, "motion aims")
