extends Control
## One circular spell button in the bottom panel: coloured orb, key letter, flash when pressed.

var spell: Spell
var _flash := 0.0


func setup(s: Spell) -> void:
	spell = s
	tooltip_text = "%s [%s]\n%s" % [s.display_name, s.get_key_label(), s.description]
	queue_redraw()


## Pulse the button (called when its spell is queued).
func flash() -> void:
	_flash = 1.0
	set_process(true)


func _ready() -> void:
	set_process(false)


func _process(delta: float) -> void:
	_flash = maxf(0.0, _flash - delta * 3.5)
	queue_redraw()
	if _flash == 0.0:
		set_process(false)


func _draw() -> void:
	if spell == null:
		return
	var c := size / 2.0
	var r := minf(size.x, size.y) / 2.0 - 3.0
	draw_circle(c, r + 3.0, Color(0, 0, 0, 0.55))
	draw_circle(c, r, spell.icon_color.darkened(0.45))
	draw_circle(c, r - 4.0, spell.icon_color.lerp(Color.WHITE, 0.35 * _flash))
	draw_circle(c + Vector2(-r * 0.3, -r * 0.35), r * 0.22, Color(1, 1, 1, 0.35))
	draw_arc(c, r, 0.0, TAU, 32, Color(1, 1, 1, 0.45 + 0.5 * _flash), 2.0 + 2.0 * _flash)
	var font := ThemeDB.fallback_font
	var label := spell.get_key_label()
	var w := font.get_string_size(label, HORIZONTAL_ALIGNMENT_LEFT, -1, 22).x
	draw_string_outline(font, c + Vector2(-w / 2.0, 8.0), label, HORIZONTAL_ALIGNMENT_LEFT, -1, 22, 4, Color(0, 0, 0, 0.8))
	draw_string(font, c + Vector2(-w / 2.0, 8.0), label, HORIZONTAL_ALIGNMENT_LEFT, -1, 22, Color.WHITE)
