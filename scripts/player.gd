extends Node2D

const Health = preload("res://scripts/core/health.gd")
const Mover = preload("res://scripts/core/mover.gd")
const DrawUtil = preload("res://scripts/core/draw_util.gd")

const SPEED := 200.0
const RADIUS := 10.0

var health := Health.new()
var facing := Vector2.RIGHT  # last movement direction; beams are aimed along it
var color := Color("#9c72ff")
var queued_colors: Array = []  # elements waiting in the queue, drawn orbiting the wizard
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
	health.update(delta)
	if health.is_dead():
		return
	if input.length() > 0.1:
		facing = input.normalized()
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
	DrawUtil.shadow(self, RADIUS)
	# staff pointing the way the wizard faces (beams fire along it)
	var tip := facing * (RADIUS + 12.0)
	draw_line(facing * 3.0, tip, Color("#8b6b3d"), 3.0)
	draw_circle(tip, 3.5, color.lightened(0.5))
	draw_circle(Vector2.ZERO, RADIUS, color)
	draw_arc(Vector2.ZERO, RADIUS, 0.0, TAU, 24, Color.WHITE, 2.0)  # outline: glows can match the tiles
	# pointed hat
	draw_colored_polygon(PackedVector2Array([Vector2(-8, -7), Vector2(8, -7), Vector2(0, -25)]), color.darkened(0.45))
	draw_line(Vector2(-10, -7), Vector2(10, -7), color.darkened(0.6), 3.0)
	# queued elements orbit the wizard
	var t := Time.get_ticks_msec() / 450.0
	for i in queued_colors.size():
		var orb := Vector2.from_angle(t + i * PI) * (RADIUS + 9.0) + Vector2(0, -4)
		draw_circle(orb, 5.0, queued_colors[i])
		draw_arc(orb, 5.0, 0.0, TAU, 12, Color.WHITE, 1.5)
	DrawUtil.bar(self, -36.0, 30.0, float(health.current) / float(health.max_health), Color("#4ade80"))
