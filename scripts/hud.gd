# The Magicka-style key reference: nine element orbs with their letters (queued ones ringed)
# and the wizard's weapon. The queue itself is ui/element_queue.tscn. View only.
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
	if play == null:
		return
	# staff and weapon
	var glow: Color = play.wizard.color
	draw_line(Vector2(12, 90), Vector2(44, 84), Color("#8b6b3d"), 3.0)
	draw_circle(Vector2(46, 83), 4.0, glow.lightened(0.4))
	draw_string(font, Vector2(56, 92), String(play.wizard_data.get("weapon", "Staff")), HORIZONTAL_ALIGNMENT_LEFT, 150.0, 11, Color(1, 1, 1, 0.7))
