extends "res://harness/test_case.gd"

const PATH := "user://test_r034_main.json"

var main = null


func after_test() -> void:
	if main != null and is_instance_valid(main):
		main.free()
	main = null
	if FileAccess.file_exists(PATH):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(PATH))


func test_the_zone_world_is_y_sorted() -> void:
	main = load("res://scenes/main.tscn").instantiate()
	main.save_path = PATH
	main.start()
	main.new_game()
	main.enter_zone("keep")  # unlocked or not, check the world node
	if main.play == null:
		main.enter_zone("tundra")
	var world: Node2D = main.play.wizard.get_parent()
	assert_true(world.y_sort_enabled, "world y-sorted")
	for e in main.play.enemies:
		assert_eq(e.get_parent(), world, "thralls share the sorted layer")
		assert_eq(e.z_index, main.play.wizard.z_index, "same layer as the wizard")
	assert_true(main._level.z_index < main.play.wizard.z_index, "level beneath")
	assert_true(main.effects_view.z_index > main.play.wizard.z_index, "effects above")
