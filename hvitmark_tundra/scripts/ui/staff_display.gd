extends Control
## The staff icon at the left of the spell panel (placeholder drawing).

var crystal_color := Color("#9be7ff")


func _draw() -> void:
	var a := Vector2(size.x * 0.28, size.y * 0.92)
	var b := Vector2(size.x * 0.72, size.y * 0.18)
	draw_line(a, b, Color("#8b6b3d"), 5.0)
	draw_line(a + Vector2(2, 0), b + Vector2(2, 0), Color("#b08a52"), 1.5)
	draw_circle(b, 13.0, Color(crystal_color, 0.25))
	draw_circle(b, 8.0, crystal_color)
	draw_circle(b + Vector2(-2, -3), 2.5, Color(1, 1, 1, 0.8))
	var font := ThemeDB.fallback_font
	draw_string(font, Vector2(2, size.y + 2), "STAFF", HORIZONTAL_ALIGNMENT_LEFT, -1, 10, Color(1, 1, 1, 0.45))
