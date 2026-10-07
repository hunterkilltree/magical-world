extends "res://harness/test_case.gd"

const PATH := "user://test_r023_main.json"
const FRAGMENTS := ["rune_fragment_1", "rune_fragment_2", "rune_fragment_3"]

var main = null


func _boot():
	main = load("res://scenes/main.tscn").instantiate()
	main.save_path = PATH
	main.start()
	return main


func after_test() -> void:
	if main != null and is_instance_valid(main):
		main.free()
	main = null
	if FileAccess.file_exists(PATH):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(PATH))


func test_boots_into_the_menu_with_continue_disabled() -> void:
	_boot()
	assert_eq(main.state, "menu", "menu")
	assert_true(main.continue_button.disabled, "no save to continue")


func test_new_game_shows_the_overworld_with_only_the_tundra_open() -> void:
	_boot()
	main.new_game()
	assert_eq(main.state, "overworld", "overworld")
	assert_eq(main.zone_buttons.size(), 6, "six zones")
	assert_true(not main.zone_buttons["tundra"].disabled, "tundra open")
	for id in ["pine", "keep", "volcano", "bog", "cavern"]:
		assert_true(main.zone_buttons[id].disabled, "%s locked" % id)
	assert_true(main.zone_buttons["tundra"].text.contains("Hvítmark Tundra"), "labelled by name")


func test_a_locked_zone_cannot_be_entered() -> void:
	_boot()
	main.new_game()
	assert_true(not main.enter_zone("keep"), "refused")
	assert_eq(main.state, "overworld", "still on the overworld")


func test_entering_a_zone_puts_the_wizard_in_the_world() -> void:
	_boot()
	main.new_game()
	assert_true(main.enter_zone("tundra"), "entered")
	assert_eq(main.state, "zone", "zone")
	assert_true(main.play.wizard.get_parent() != null, "wizard is in the scene")
	assert_eq(main.play.enemies.size(), 2, "thralls")
	var start: Vector2 = main.play.wizard.position
	main.tick(0.1, Vector2.UP)
	assert_true(main.play.wizard.position != start, "input moves the wizard")


func test_finishing_a_zone_shows_a_result_then_returns_to_the_overworld() -> void:
	_boot()
	main.new_game()
	main.session.campaign.complete("tundra")
	main.enter_zone("pine")
	main.play.wizard.position = main.play.grid.cell_center(main.play.grid.cells_of("C")[0])
	main.tick(0.016, Vector2.ZERO)
	assert_eq(main.state, "zone_result", "result banner")
	assert_true(main._banner.text.contains("Zone complete"), "banner text")
	main.continue_after_zone()
	assert_eq(main.state, "overworld", "back on the overworld")
	assert_true(main.zone_buttons["pine"].text.contains("complete"), "pine marked complete")
	assert_true(not main.zone_buttons["keep"].disabled, "keep now open")
	assert_true(main.session.has_save(), "autosaved")


func test_dying_returns_without_completing() -> void:
	_boot()
	main.new_game()
	main.enter_zone("tundra")
	main.play.wizard.take_damage(1000)
	main.tick(0.016, Vector2.ZERO)
	assert_eq(main.state, "zone_result", "result")
	assert_true(main._banner.text.contains("fell"), "banner")
	main.continue_after_zone()
	assert_true(not main.session.campaign.is_complete("tundra"), "not complete")


func test_continue_restores_progress_from_the_menu() -> void:
	_boot()
	main.new_game()
	main.session.campaign.complete("tundra")
	main.enter_zone("pine")
	main.play.wizard.position = main.play.grid.cell_center(main.play.grid.cells_of("C")[0])
	main.tick(0.016, Vector2.ZERO)
	main.show_menu()
	assert_true(not main.continue_button.disabled, "a save exists now")
	assert_true(main.continue_game(), "continued")
	assert_eq(main.state, "overworld", "overworld")
	assert_true(main.zone_buttons["pine"].text.contains("complete"), "pine complete after continue")


func test_killing_the_hollow_warden_shows_the_ending() -> void:
	_boot()
	main.new_game()
	main.session.campaign.restore(["tundra", "pine", "keep", "volcano", "bog"])
	for id in FRAGMENTS:
		main.session.inventory.add({"id": id, "kind": "rune_fragment"})
	main.enter_zone("cavern")
	main.play.boss.take_damage(99999)
	main.tick(0.016, Vector2.ZERO)
	assert_eq(main.state, "ending", "ending screen")
	assert_true(main.session.ending_played(), "recorded")


func test_overworld_lets_you_cycle_the_wizard() -> void:
	_boot()
	main.new_game()
	assert_true(main.wizard_button.text.contains("Aldric"), "starts as Aldric")
	var before: String = main.session.wizard_id
	main.cycle_wizard()
	assert_true(main.session.wizard_id != before, "next wizard")
	assert_true(main.wizard_button.text.contains(main.session.wizard()["name"]), "button shows the new wizard")


func test_the_chosen_wizard_is_drawn_and_named_in_the_hud() -> void:
	_boot()
	main.new_game()
	main.session.select_wizard("ember_pyromancer")
	main.enter_zone("tundra")
	assert_eq(main.play.wizard.color, Color("#ff7a2f"), "Brann's colour")
	main.tick(0.016, Vector2.ZERO)
	assert_true(main._hud.text.contains("Brann Cinderhand"), "HUD names the wizard")


func test_casting_shows_an_effect_that_is_cleaned_up_when_leaving() -> void:
	_boot()
	main.new_game()
	main.enter_zone("tundra")
	main.play.queue_element("fire")
	main.play.queue_element("fire")
	main.play.cast()
	main.tick(0.016, Vector2.ZERO)
	assert_eq(main.effects_view.play.effects.size(), 1, "effect on screen")
	assert_true(main._hud.text.contains("Queue:"), "HUD queue")
	main.continue_after_zone()
	assert_true(main.effects_view == null, "effect layer removed with the zone")


func test_the_zone_view_has_the_spell_bar_and_letter_keys() -> void:
	_boot()
	main.new_game()
	main.enter_zone("tundra")
	assert_eq(main.hud.orb_count(), 9, "nine orbs")
	assert_true(main.hud.play == main.play, "bar follows the zone")
	var ev := InputEventKey.new()
	ev.keycode = KEY_F
	ev.pressed = true
	main._unhandled_key_input(ev)
	assert_eq(main.play.queue.queue, ["dark"], "F queues dark")
	ev = InputEventKey.new()
	ev.keycode = KEY_Q
	ev.pressed = true
	main._unhandled_key_input(ev)
	assert_eq(main.play.queue.queue, ["dark", "fire"], "Q queues fire")
	main.tick(0.016, Vector2.ZERO)
	main.continue_after_zone()
	assert_true(main.hud == null, "bar removed with the zone")


func test_dead_thralls_leave_the_screen() -> void:
	_boot()
	main.new_game()
	main.enter_zone("tundra")
	var thrall = main.play.enemies[0]
	thrall.take_damage(999)
	main.tick(0.016, Vector2.ZERO)
	assert_true(not thrall.visible, "corpse hidden")
	assert_true(main.play.enemies[1].visible, "the living one stays")


func test_the_queue_bar_mirrors_the_games_queue() -> void:
	_boot()
	main.new_game()
	main.enter_zone("tundra")
	assert_true(main.queue_bar != null, "bar present in a zone")
	assert_eq(main.queue_bar.max_slots, 2, "the game queues pairs")
	var ev := InputEventKey.new()
	ev.keycode = KEY_Q
	ev.pressed = true
	main._unhandled_key_input(ev)
	assert_eq(main.queue_bar.queue, PackedStringArray(["Fire"]), "fire appears")
	assert_true(main.preview_label.text.contains("Fire Bolt"), "preview names the bolt")
	ev = InputEventKey.new()
	ev.keycode = KEY_A
	ev.pressed = true
	main._unhandled_key_input(ev)
	assert_eq(main.queue_bar.queue, PackedStringArray(["Fire", "Ice"]), "ice appears")
	assert_true(main.preview_label.text.contains("Thermal Shock"), "preview names the pair's spell")
	ev = InputEventKey.new()
	ev.keycode = KEY_SPACE
	ev.pressed = true
	main._unhandled_key_input(ev)
	assert_eq(main.queue_bar.queue.size(), 0, "casting empties the bar")
	main.continue_after_zone()
	assert_true(main.queue_bar == null, "bar removed with the zone")
