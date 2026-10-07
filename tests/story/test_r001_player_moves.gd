extends "res://harness/test_case.gd"

var Player = load("res://scripts/player.gd")


func test_moves_at_full_speed_in_direction() -> void:
	assert_eq(Player.velocity_for(Vector2.RIGHT), Vector2(200, 0), "right")


func test_diagonal_is_not_faster() -> void:
	var v: Vector2 = Player.velocity_for(Vector2(1, 1))
	assert_true(absf(v.length() - 200.0) < 0.01, "diagonal length %s" % v.length())


func test_no_input_no_movement() -> void:
	assert_eq(Player.velocity_for(Vector2.ZERO), Vector2.ZERO, "idle")
