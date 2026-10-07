# The Magicka-style spell bar: nine element orbs with their letters, two queue slots, a
# preview of what the queue will cast, and the wizard's weapon. View only.
extends Control

const SpellBook = preload("res://scripts/core/spell_book.gd")
const Controls = preload("res://scripts/core/controls.gd")

const ORB_R := 15.0

var play = null


func orb_count() -> int:
	return Controls.LAYOUT.size()


# Centre of an element's orb inside the panel: five on the top row, four below, offset.
func orb_pos(index: int) -> Vector2:
	if index < 5:
		return Vector2(26 + index * 38, 28)
	return Vector2(45 + (index - 5) * 38, 68)


func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, size), Color(0.04, 0.04, 0.07, 0.8))
	draw_rect(Rect2(Vector2.ZERO, size), Color(1, 1, 1, 0.25), false, 2.0)
	var font := ThemeDB.fallback_font
	var queued: Array = play.queue.queue if play != null else []
	for i in Controls.LAYOUT.size():
		var el: String = Controls.LAYOUT[i][0]
		var c := orb_pos(i)
		var col := SpellBook.element_color(el)
		draw_circle(c, ORB_R + 2.0, Color(0, 0, 0, 0.7))
		draw_circle(c, ORB_R, col)
		draw_circle(c + Vector2(-4, -5), 4.0, Color(1, 1, 1, 0.35))  # glassy highlight
		if el in queued:
			draw_arc(c, ORB_R + 3.5, 0.0, TAU, 32, Color.WHITE, 3.0)
		draw_string(font, c + Vector2(-5, 6), Controls.label(el), HORIZONTAL_ALIGNMENT_LEFT, -1, 16, Color(0, 0, 0, 0.75))
	# queue slots
	for s in 2:
		var c := Vector2(240 + s * 40, 28)
		draw_circle(c, 15.0, Color(0, 0, 0, 0.6))
		if s < queued.size():
			draw_circle(c, 13.0, SpellBook.element_color(queued[s]))
		else:
			draw_arc(c, 13.0, 0.0, TAU, 24, Color(1, 1, 1, 0.3), 1.5)
	if play == null:
		return
	var p: Dictionary = play.queue_preview()
	if not p.is_empty():
		var ready: bool = p["ready"]
		draw_string(font, Vector2(206, 64), p["name"], HORIZONTAL_ALIGNMENT_LEFT, -1, 13,
			Color.WHITE if ready else Color(1, 0.6, 0.5))
		var note: String = "ready" if ready else "%.1fs" % p["cooldown"]
		if not p["complete"]:
			note = "add one more"
		draw_string(font, Vector2(206, 80), "%s - %s" % [p["type"], note], HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Color(1, 1, 1, 0.65))
	else:
		draw_string(font, Vector2(206, 66), "Space casts", HORIZONTAL_ALIGNMENT_LEFT, -1, 13, Color(1, 1, 1, 0.5))
	# staff and weapon
	var glow: Color = play.wizard.color
	draw_line(Vector2(12, 90), Vector2(44, 84), Color("#8b6b3d"), 3.0)
	draw_circle(Vector2(46, 83), 4.0, glow.lightened(0.4))
	draw_string(font, Vector2(56, 92), String(play.wizard_data.get("weapon", "Staff")), HORIZONTAL_ALIGNMENT_LEFT, 150.0, 11, Color(1, 1, 1, 0.7))
