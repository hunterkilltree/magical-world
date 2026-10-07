extends "res://harness/test_case.gd"

const MainScene := preload("res://scenes/Main.tscn")

var main: Node2D


func before_each() -> void:
	main = MainScene.instantiate()
	tree.root.add_child(main)
	await tree.process_frame
	await tree.process_frame


func after_test() -> void:
	tree.root.remove_child(main)
	main.free()


func _event(action: String) -> InputEventAction:
	var ev := InputEventAction.new()
	ev.action = action
	ev.pressed = true
	return ev


func _press(action: String) -> void:
	Input.parse_input_event(_event(action))
	await tree.process_frame


func test_the_scene_tree_matches_the_plan() -> void:
	for path in ["World/Arena/Ground", "World/Arena/Obstacles", "World/Arena/Bridge", "World/Arena/Gate",
			"Actors/Player", "Actors/Enemies", "Projectiles", "Effects", "UI/HUD",
			"Actors/Player/SpellCaster", "Actors/Player/Camera2D", "Actors/Player/CollisionShape2D", "Actors/Player/Visual"]:
		assert_true(main.has_node(path), path)
	assert_true(main.get_node("UI") is CanvasLayer, "UI is a CanvasLayer")
	assert_true(main.get_node("World/Arena/Ground") is TileMapLayer, "TileMapLayer")
	assert_true(main.get_node("Actors/Player") is CharacterBody2D, "the player is a CharacterBody2D")
	assert_eq(main.get_node("Actors/Enemies").get_child_count(), 0, "no enemies yet (next milestone)")


func test_main_wires_player_camera_and_hud() -> void:
	var player: Player = main.get_node("Actors/Player")
	var arena: Arena = main.get_node("World/Arena")
	assert_true(player.global_position.distance_to(arena.player_start) < 1.0, "player at the start")
	assert_true(player.camera.is_current(), "camera follows the player")
	var hud: Hud = main.get_node("UI/HUD")
	assert_eq(hud.objective_title_label.text, "CROSS THE SHELF", "objective shown")


func test_the_project_is_set_up_for_the_prototype() -> void:
	assert_eq(ProjectSettings.get_setting("application/config/name"), "Hvitmark Tundra", "name")
	assert_eq(ProjectSettings.get_setting("application/run/main_scene"), "res://scenes/Main.tscn", "main scene")
	assert_eq(ProjectSettings.get_setting("display/window/size/viewport_width"), 1280, "width")
	assert_eq(ProjectSettings.get_setting("display/window/size/viewport_height"), 720, "height")


func test_keyboard_to_queue_end_to_end() -> void:
	# Real input events through the engine's input pipeline, not method calls.
	var player: Player = main.get_node("Actors/Player")
	var hud: Hud = main.get_node("UI/HUD")
	for a in ["spell_q", "spell_w", "spell_f", "spell_t"]:
		await _press(a)
	assert_eq(player.caster.queue.size(), 4, "four queued by key press")
	assert_eq(hud.slots.filter(func(s: Control) -> bool: return s.spell != null).size(), 4, "and shown in the HUD")
	await _press("spell_a")
	assert_eq(player.caster.queue.size(), 4, "a fifth is refused")
	await _press("cast_spell")
	assert_eq(player.caster.queue.size(), 3, "SPACE casts one")
	assert_eq(hud.slots[0].spell.id, &"ice_lance", "the queue shifted up")
	await _press("clear_queue")
	assert_eq(player.caster.queue.size(), 0, "ESC clears")
	assert_eq(hud.slots.filter(func(s: Control) -> bool: return s.spell != null).size(), 0, "HUD emptied")


func test_spell_keys_do_not_move_the_player() -> void:
	var player: Player = main.get_node("Actors/Player")
	var p0 := player.global_position
	for a in ["spell_w", "spell_a", "spell_s", "spell_d"]:
		await _press(a)
	await tree.physics_frame
	await tree.physics_frame
	assert_true(player.global_position.distance_to(p0) < 0.5, "W/A/S/D queued spells without moving")
	assert_eq(player.caster.queue.size(), 4, "all four spells queued")
