extends StaticBody2D
## The north gate. Closed: solid and drawn as iron bars. open() lifts the bars and removes
## the collision. The objective that triggers it arrives in a later milestone.

signal opened

var is_open := false

var _size := Vector2(100, 50)
var _openness := 0.0  # 0 = closed, 1 = fully raised


## Place and size the gate over a world-space rectangle.
func setup(rect: Rect2) -> void:
	position = rect.get_center()
	_size = rect.size
	($CollisionShape2D.shape as RectangleShape2D).size = rect.size
	queue_redraw()


func open() -> void:
	if is_open:
		return
	is_open = true
	$CollisionShape2D.set_deferred("disabled", true)
	var tw := create_tween()
	tw.tween_method(_set_openness, 0.0, 1.0, 1.2).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN_OUT)
	opened.emit()


func _set_openness(v: float) -> void:
	_openness = v
	queue_redraw()


func _draw() -> void:
	var r := Rect2(-_size / 2.0, _size)
	draw_rect(r, Color("#1b1f27"))
	var bar_h := _size.y * (1.0 - _openness)
	if bar_h > 1.0:
		var x := r.position.x + 6.0
		while x < r.end.x - 4.0:
			draw_rect(Rect2(x, r.position.y, 8.0, bar_h), Color("#4a5260"))
			draw_rect(Rect2(x, r.position.y, 2.0, bar_h), Color("#8a93a3"))
			x += 20.0
		draw_rect(Rect2(r.position.x, r.position.y + bar_h - 5.0, _size.x, 5.0), Color("#d4a72c"))
	draw_rect(r, Color("#d4a72c"), false, 3.0)
