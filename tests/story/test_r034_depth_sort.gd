extends "res://harness/test_case.gd"

const ZoneModel = preload("res://scripts/view3d/zone_model.gd")

const PATH := "user://test_r034_main.json"

var main = null


func after_test() -> void:
	if main != null and is_instance_valid(main):
		main.free()
	main = null
	if FileAccess.file_exists(PATH):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(PATH))


func test_characters_stand_in_the_3d_world_and_effects_draw_over_it() -> void:
	main = load("res://scenes/main.tscn").instantiate()
	main.save_path = PATH
	main.start()
	main.new_game()
	main.enter_zone("tundra")
	var view = main.zone_view
	assert_true(view is Node3D, "the zone is drawn in 3D (depth buffer sorts it)")
	for m in [view.wizard_model] + view.enemy_models:
		assert_eq(m.get_parent(), view, "characters share the zone's 3D world")
	# the logic layer (2D nodes) is not drawn any more
	assert_true(not main.play.wizard.get_parent().visible, "2D layer hidden")
	# spell effects, numbers and bars are canvas items, drawn over the 3D view
	assert_true(main.effects_view is CanvasItem and main.effects_view.visible and main.effects_view.get_parent().visible, "effects over the 3D")
	assert_true(main.overhead is CanvasItem, "health bars over the 3D")


func test_characters_stand_on_the_tile_under_them() -> void:
	main = load("res://scenes/main.tscn").instantiate()
	main.save_path = PATH
	main.start()
	main.new_game()
	main.enter_zone("tundra")
	var view = main.zone_view
	var g = main.play.grid
	var hazard: Vector2i = g.cells_of("~")[0]
	main.play.wizard.position = g.cell_center(hazard)
	view.sync(0.0)
	assert_true(absf(view.wizard_model.position.y - ZoneModel.HEIGHT["~"]) < 0.001, "wades in the hazard tile")
