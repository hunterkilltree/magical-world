extends "res://harness/test_case.gd"


func test_main_scene_loads() -> void:
	var scene = load("res://scenes/main.tscn")
	assert_not_null(scene, "main.tscn should load")
	var node = scene.instantiate()
	assert_not_null(node, "main.tscn should instantiate")
	node.free()


func test_arithmetic_sanity() -> void:
	assert_eq(1 + 1, 2, "1+1")
