extends Node2D

const SPEED := 200.0

var health := 3


static func velocity_for(input: Vector2) -> Vector2:
	return input.normalized() * SPEED


func _physics_process(delta: float) -> void:
	var input := Input.get_vector("ui_left", "ui_right", "ui_up", "ui_down")
	position += velocity_for(input) * delta
