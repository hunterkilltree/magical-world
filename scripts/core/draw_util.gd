# Small drawing helpers shared by the wizard, thralls and bosses. Call from inside _draw().
extends RefCounted


static func shadow(ci: CanvasItem, radius: float) -> void:
	ci.draw_set_transform(Vector2(0, radius * 0.75), 0.0, Vector2(1.0, 0.4))
	ci.draw_circle(Vector2.ZERO, radius, Color(0, 0, 0, 0.32))
	ci.draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


# A health bar centred above the origin at height y (negative is up).
static func bar(ci: CanvasItem, y: float, width: float, fraction: float, color: Color) -> void:
	var f := clampf(fraction, 0.0, 1.0)
	ci.draw_rect(Rect2(-width / 2.0 - 1.0, y - 1.0, width + 2.0, 6.0), Color(0, 0, 0, 0.7))
	ci.draw_rect(Rect2(-width / 2.0, y, width * f, 4.0), color)
