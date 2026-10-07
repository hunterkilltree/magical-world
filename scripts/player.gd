extends Node2D

const Health = preload("res://scripts/core/health.gd")
const Mover = preload("res://scripts/core/mover.gd")

const SPEED := 200.0
const RADIUS := 10.0

var health := Health.new()
var grid = null  # ZoneGrid; null means unobstructed
var _dot_carry := 0.0


static func velocity_for(input: Vector2) -> Vector2:
	return input.normalized() * SPEED


func take_damage(amount: int) -> void:
	health.take_damage(amount)


func _physics_process(delta: float) -> void:
	step(delta, Input.get_vector("ui_left", "ui_right", "ui_up", "ui_down"))


# Moves with grid collision and applies terrain effects for this frame.
func step(delta: float, input: Vector2) -> void:
	if health.is_dead():
		return
	var v := velocity_for(input)
	if grid != null:
		var effect: Dictionary = grid.stand_on(grid.world_to_cell(position), delta)
		v *= float(effect["speed"])
		_dot_carry += float(effect["dps"]) * delta
		if _dot_carry >= 1.0:
			var whole := int(_dot_carry)
			_dot_carry -= whole
			health.take_damage(whole)
	position = Mover.move(grid, position, v, delta, RADIUS)


func _draw() -> void:
	draw_circle(Vector2.ZERO, RADIUS, Color("#9c72ff"))
