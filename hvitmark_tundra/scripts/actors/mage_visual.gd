extends Node2D
## Placeholder mage drawn with shapes: robe, pointed hat and a staff with a glowing crystal.
## Idle feedback: a gentle breathing bob and a pulsing staff crystal; it leans into movement.

const ROBE := Color("#4f6fd6")
const HAT := Color("#2f3f8f")
const STAFF := Color("#8b6b3d")
const CRYSTAL := Color("#9be7ff")

var _t := 0.0
var _facing := 1.0
var _lean := 0.0


func set_motion(velocity: Vector2, _input_dir: Vector2) -> void:
	if absf(velocity.x) > 8.0:
		_facing = signf(velocity.x)
	_lean = clampf(velocity.x / 260.0, -1.0, 1.0) * 0.12


func _process(delta: float) -> void:
	_t += delta
	scale = Vector2(_facing, 1.0 + 0.03 * sin(_t * 3.2))
	rotation = _lean * _facing
	queue_redraw()


func _draw() -> void:
	# soft shadow
	draw_set_transform(Vector2(0, 14), 0.0, Vector2(1.0, 0.4))
	draw_circle(Vector2.ZERO, 15.0, Color(0, 0, 0, 0.3))
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
	# staff (right hand side), crystal on top
	draw_line(Vector2(15, 12), Vector2(15, -24), STAFF, 3.0)
	var pulse := 0.5 + 0.5 * sin(_t * 4.0)
	draw_circle(Vector2(15, -27), 8.0 + 2.0 * pulse, Color(CRYSTAL, 0.25))
	draw_circle(Vector2(15, -27), 5.0, CRYSTAL)
	# body, hat
	draw_circle(Vector2.ZERO, 14.0, ROBE)
	draw_arc(Vector2.ZERO, 14.0, 0.0, TAU, 24, Color.WHITE, 2.0)  # outline keeps it readable on snow
	draw_colored_polygon(PackedVector2Array([Vector2(-10, -8), Vector2(10, -8), Vector2(0, -30)]), HAT)
	draw_line(Vector2(-13, -8), Vector2(13, -8), HAT.darkened(0.3), 4.0)
