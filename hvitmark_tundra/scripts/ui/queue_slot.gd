extends Control
## One slot of the spell queue. Empty = dim ring. Filled = the spell's orb and key letter.
## The first slot is marked as "next to cast".

var spell: Spell = null
var is_next := false


func set_spell(s: Spell, next: bool) -> void:
	spell = s
	is_next = next and s != null
	queue_redraw()


func _draw() -> void:
	var c := size / 2.0
	var r := minf(size.x, size.y) / 2.0 - 3.0
	draw_circle(c, r + 3.0, Color(0, 0, 0, 0.55))
	if spell == null:
		draw_arc(c, r, 0.0, TAU, 32, Color(1, 1, 1, 0.22), 2.0)
		return
	draw_circle(c, r, spell.icon_color.darkened(0.45))
	draw_circle(c, r - 4.0, spell.icon_color)
	draw_circle(c + Vector2(-r * 0.3, -r * 0.35), r * 0.22, Color(1, 1, 1, 0.35))
	draw_arc(c, r, 0.0, TAU, 32, Color("#ffe27a") if is_next else Color(1, 1, 1, 0.5), 4.0 if is_next else 2.0)
	var font := ThemeDB.fallback_font
	var label := spell.get_key_label()
	var w := font.get_string_size(label, HORIZONTAL_ALIGNMENT_LEFT, -1, 22).x
	draw_string_outline(font, c + Vector2(-w / 2.0, 8.0), label, HORIZONTAL_ALIGNMENT_LEFT, -1, 22, 4, Color(0, 0, 0, 0.8))
	draw_string(font, c + Vector2(-w / 2.0, 8.0), label, HORIZONTAL_ALIGNMENT_LEFT, -1, 22, Color.WHITE)
