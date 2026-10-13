# Draws ZonePlay.effects (spell flashes and beams) and ZonePlay.popups (floating numbers).
# `ground` maps logic pixels onto the screen; with the 3D zone view it lays the rings and
# beams flat on the floor, while the numbers stay upright at their projected point.
extends Node2D

var play = null
var ground := Transform2D.IDENTITY


func _draw() -> void:
	if play == null:
		return
	draw_set_transform_matrix(ground)
	for e in play.effects:
		var a: float = clampf(e["ttl"] / 0.4, 0.0, 1.0)
		var c: Color = e["color"]
		if e.get("kind", "circle") == "beam":
			var from: Vector2 = e["pos"]
			var to: Vector2 = from + e["dir"].normalized() * e["length"]
			draw_line(from, to, Color(c.r, c.g, c.b, 0.30 * a), e["radius"] * 2.0)
			draw_line(from, to, Color(c.r, c.g, c.b, 0.75 * a), e["radius"] * 0.9)
			draw_line(from, to, Color(1.0, 0.95, 0.7, a), 7.0)
			draw_circle(from, 12.0, Color(1.0, 0.95, 0.7, a))
		else:
			draw_circle(e["pos"], e["radius"], Color(c.r, c.g, c.b, 0.25 * a))
			draw_arc(e["pos"], e["radius"], 0.0, TAU, 48, Color(c.r, c.g, c.b, a), 3.0)
	draw_set_transform_matrix(Transform2D.IDENTITY)
	var font := ThemeDB.fallback_font
	for pop in play.popups:
		var a: float = clampf(pop["ttl"] / 0.4, 0.0, 1.0)
		var col: Color = pop["color"]
		var width := font.get_string_size(pop["text"], HORIZONTAL_ALIGNMENT_LEFT, -1, 20).x
		var at: Vector2 = ground * Vector2(pop["pos"]) + Vector2(-width / 2.0, -26)
		draw_string_outline(font, at, pop["text"], HORIZONTAL_ALIGNMENT_LEFT, -1, 20, 5, Color(0, 0, 0, a))
		draw_string(font, at, pop["text"], HORIZONTAL_ALIGNMENT_LEFT, -1, 20, Color(col.r, col.g, col.b, a))
