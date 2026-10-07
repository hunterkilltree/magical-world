# Draws ZonePlay.effects (spell flashes). View only.
extends Node2D

var play = null


func _draw() -> void:
	if play == null:
		return
	for e in play.effects:
		var a: float = clampf(e["ttl"] / 0.4, 0.0, 1.0)
		var c: Color = e["color"]
		draw_circle(e["pos"], e["radius"], Color(c.r, c.g, c.b, 0.25 * a))
		draw_arc(e["pos"], e["radius"], 0.0, TAU, 48, Color(c.r, c.g, c.b, a), 3.0)
