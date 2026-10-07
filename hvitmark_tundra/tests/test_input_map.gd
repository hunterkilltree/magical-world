extends "res://harness/test_case.gd"


func _keys(action: String) -> Array:
	return InputMap.action_get_events(action).filter(func(e: InputEvent) -> bool: return e is InputEventKey) \
		.map(func(e: InputEventKey) -> int: return e.physical_keycode)


func test_all_actions_exist() -> void:
	for a in ["move_left", "move_right", "move_up", "move_down", "wasd_left", "wasd_right", "wasd_up", "wasd_down",
			"cast_spell", "clear_queue", "toggle_move_scheme", "debug_damage", "debug_heal",
			"spell_q", "spell_w", "spell_e", "spell_r", "spell_t", "spell_a", "spell_s", "spell_d", "spell_f"]:
		assert_true(InputMap.has_action(a), a)


func test_movement_uses_the_arrow_keys_by_default() -> void:
	assert_eq(_keys("move_left"), [KEY_LEFT], "left")
	assert_eq(_keys("move_right"), [KEY_RIGHT], "right")
	assert_eq(_keys("move_up"), [KEY_UP], "up")
	assert_eq(_keys("move_down"), [KEY_DOWN], "down")


func test_wasd_movement_actions_exist_for_the_tab_mode() -> void:
	assert_eq(_keys("wasd_up"), [KEY_W], "W")
	assert_eq(_keys("wasd_left"), [KEY_A], "A")
	assert_eq(_keys("wasd_down"), [KEY_S], "S")
	assert_eq(_keys("wasd_right"), [KEY_D], "D")


func test_cast_clear_and_toggle_keys() -> void:
	assert_eq(_keys("cast_spell"), [KEY_SPACE], "space casts")
	assert_eq(_keys("clear_queue"), [KEY_ESCAPE], "escape clears")
	assert_eq(_keys("toggle_move_scheme"), [KEY_TAB], "tab toggles")
