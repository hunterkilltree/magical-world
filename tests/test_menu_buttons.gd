extends "res://harness/test_case.gd"

# Buttons whose handler rebuilds the screen free themselves in _clear_ui, so
# they must be connected deferred: freeing a button while it is emitting
# `pressed` crashes the game (New Game -> zone click segfaulted).

const PATH := "user://test_menu_buttons.json"

var main = null


func after_test() -> void:
	if main != null and is_instance_valid(main):
		main.free()
	main = null
	if FileAccess.file_exists(PATH):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(PATH))


func _buttons() -> Array:
	var out := []
	var stack: Array = [main._ui]
	while not stack.is_empty():
		var n: Node = stack.pop_back()
		if n is Button:
			out.append(n)
		stack.append_array(n.get_children())
	return out


func _assert_screen_buttons_deferred(screen: String) -> void:
	var checked := 0
	for b in _buttons():
		for c in b.get_signal_connection_list("pressed"):
			var method: String = (c["callable"] as Callable).get_method()
			if method == "cycle_wizard":
				continue  # only relabels its own button
			assert_true(c["flags"] & CONNECT_DEFERRED != 0,
				"%s: '%s' -> %s must be CONNECT_DEFERRED" % [screen, b.text, method])
			checked += 1
	assert_true(checked > 0, "%s has screen-changing buttons" % screen)


func test_menu_buttons_are_deferred() -> void:
	main = load("res://scenes/main.tscn").instantiate()
	main.save_path = PATH
	main.start()
	main.show_menu()
	_assert_screen_buttons_deferred("menu")


func test_overworld_buttons_are_deferred() -> void:
	main = load("res://scenes/main.tscn").instantiate()
	main.save_path = PATH
	main.start()
	main.new_game()
	_assert_screen_buttons_deferred("overworld")
