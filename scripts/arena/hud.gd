# HUD and screens (menu, pause, death) drawn over the 3D arena. Reads the sim; what the player
# asks for goes back out through signals. Port of story/design/court_of_waves/reference/game/hud.js.
extends CanvasLayer

signal picked(id: String)
signal start_pressed
signal resume_pressed
signal restart_pressed
signal menu_pressed
signal element_pressed(el: String)
signal volume_changed(v: float)

const SpellBook := preload("res://scripts/core/spell_book.gd")
const Roster := preload("res://scripts/core/wizard_roster.gd")
const Controls := preload("res://scripts/core/controls.gd")
const ArenaSim := preload("res://scripts/core/arena_sim.gd")

const INK := Color("#f4f1ff")
const DIM := Color("#a79fc0")
const GOLD := Color("#f0c84a")
const GLASS := Color(0.07, 0.055, 0.12, 0.9)
const STATUS := [
	["burn", "Burning", "#ff6a2b"], ["wet", "Wet", "#3d9bff"], ["chill", "Chilled", "#a8ecff"], ["frozen", "Frozen", "#ffffff"],
	["shock", "Shocked", "#f4e15c"], ["slow", "Mired", "#b3793f"], ["stoneskin", "Stoneskin", "#b3793f"], ["ward", "Ward", "#d04bff"],
	["haste", "Haste", "#f4e15c"], ["root", "Rooted", "#5cc84a"], ["regen", "Regen", "#5cc84a"],
	["armor", "Armour +75%", "#b3793f"], ["reflect", "Reflect 50%", "#fff1a8"], ["invuln", "Invulnerable", "#ffd86b"],
]

var view # ArenaView, for health bars over enemies
var sim: ArenaSim
var wizard_id := Roster.DEFAULT_ID

var root: Control
var hud: Control
var overlay: Control
var vignette: ColorRect
var hp_bar: ProgressBar
var hp_ghost: ProgressBar # drains after the bar, showing what was just lost
var hp_text: Label
var en_bar: ProgressBar
var en_ghost: ProgressBar
var en_text: Label
var cost_mark: ColorRect # the queued spell's cost, on the energy bar
var who_name: Label
var who_role: Label
var who_swatch: ColorRect
var stat_labels := {}
var slots: Array = []
var shape_label: Label
var spell_label: Label
var cost_label: Label
var status_row: HBoxContainer
var tiles := {} # cast/nova/self/dodge -> RadialTile
var keycaps := {} # element -> {button, style, flash}
var toast: Label
var banner: Label
var menu_screen: Control
var pause_screen: Control
var dead_screen: Control
var roster_buttons := {}
var grimoire_box: GridContainer
var found_label: Label
var volume_slider: HSlider
var dead_kicker: Label
var dead_stats: GridContainer
var blurb_label: Label

var vig := 0.0
var toast_t := 0.0
var banner_t := 0.0
var _t := 0.0
var _toast_k := 9.0 # seconds since the toast text changed
var _banner_k := 9.0
var _shake := 0.0 # the queue shakes when elements cancel
var _hp_hold := 0.0
var _en_hold := 0.0
var _dead_t := 0.0
var _last_toast := ""
var _prev_mode := ""
var _dead_filled := false


func _init() -> void:
	layer = 10
	root = Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.theme = _make_theme()
	add_child(root)
	vignette = ColorRect.new()
	vignette.set_anchors_preset(Control.PRESET_FULL_RECT)
	vignette.mouse_filter = Control.MOUSE_FILTER_IGNORE
	vignette.color = Color(0.6, 0.05, 0.08, 0.0)
	root.add_child(vignette)
	overlay = Control.new()
	overlay.set_anchors_preset(Control.PRESET_FULL_RECT)
	overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
	overlay.draw.connect(_draw_overlay)
	root.add_child(overlay)
	hud = Control.new()
	hud.set_anchors_preset(Control.PRESET_FULL_RECT)
	hud.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(hud)
	_build_hud()
	_build_menu()
	_build_pause()
	_build_dead()


# ---------------------------------------------------------------- building
func _label(text: String, size := 16, color := INK) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", color)
	l.add_theme_color_override("font_outline_color", Color(0.05, 0.04, 0.09))
	l.add_theme_constant_override("outline_size", 4)
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return l


# Panels, buttons, bars and sliders take their look from the one theme on `root` (R-062).
func _make_theme() -> Theme:
	var t := Theme.new()
	t.default_font_size = 16
	var panel := _box(GLASS, Color(GOLD, 0.32), 10, 12)
	panel.border_width_top = 2
	panel.shadow_color = Color(0, 0, 0, 0.35)
	panel.shadow_size = 8
	t.set_stylebox("panel", "PanelContainer", panel)
	t.set_stylebox("normal", "Button", _box(Color(0.13, 0.1, 0.22, 0.95), Color(GOLD, 0.22), 6, 8))
	t.set_stylebox("hover", "Button", _box(Color(0.19, 0.15, 0.3, 0.97), Color(GOLD, 0.75), 6, 8))
	t.set_stylebox("pressed", "Button", _box(Color(GOLD, 0.2), GOLD, 6, 8))
	t.set_stylebox("hover_pressed", "Button", _box(Color(GOLD, 0.26), GOLD, 6, 8))
	t.set_stylebox("disabled", "Button", _box(Color(0.1, 0.08, 0.16, 0.6), Color(1, 1, 1, 0.06), 6, 8))
	t.set_stylebox("focus", "Button", StyleBoxEmpty.new())
	t.set_color("font_color", "Button", INK)
	t.set_color("font_hover_color", "Button", Color("#fff3c4"))
	t.set_color("font_pressed_color", "Button", GOLD)
	t.set_color("font_hover_pressed_color", "Button", GOLD)
	t.set_stylebox("background", "ProgressBar", _box(Color(0, 0, 0, 0.5), Color(0, 0, 0, 0), 4, 0))
	t.set_stylebox("fill", "ProgressBar", _box(GOLD, Color(0, 0, 0, 0), 4, 0))
	var track := _box(Color(1, 1, 1, 0.14), Color(0, 0, 0, 0), 3, 0)
	track.content_margin_top = 3
	track.content_margin_bottom = 3
	t.set_stylebox("slider", "HSlider", track)
	t.set_stylebox("grabber_area", "HSlider", _box(Color(GOLD, 0.75), Color(0, 0, 0, 0), 3, 0))
	t.set_stylebox("grabber_area_highlight", "HSlider", _box(GOLD, Color(0, 0, 0, 0), 3, 0))
	return t


static func _box(bg: Color, border: Color, radius: int, margin: int) -> StyleBoxFlat:
	var b := StyleBoxFlat.new()
	b.bg_color = bg
	b.border_color = border
	b.set_border_width_all(1 if border.a > 0 else 0)
	b.set_corner_radius_all(radius)
	b.set_content_margin_all(margin)
	b.anti_aliasing = true
	return b


func _panel(parent: Control) -> PanelContainer:
	var p := PanelContainer.new()
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	parent.add_child(p)
	return p


func _bar(color: Color, width := 220.0) -> ProgressBar:
	var b := ProgressBar.new()
	b.custom_minimum_size = Vector2(width, 14)
	b.show_percentage = false
	b.max_value = 1.0
	var fg := StyleBoxFlat.new()
	fg.bg_color = color
	fg.set_corner_radius_all(4)
	b.add_theme_stylebox_override("fill", fg)
	b.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return b


# A bar over a paler ghost that drains after it. Returns [holder, bar, ghost].
func _ghost_bar(color: Color, width := 220.0) -> Array:
	var holder := Control.new()
	holder.custom_minimum_size = Vector2(width, 14)
	holder.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	holder.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var ghost := _bar(Color(color.lightened(0.45), 0.75), width)
	ghost.value = 1.0
	holder.add_child(ghost)
	var front := _bar(color, width)
	front.add_theme_stylebox_override("background", StyleBoxEmpty.new())
	holder.add_child(front)
	return [holder, front, ghost]


func _button(text: String, cb: Callable) -> Button:
	var b := Button.new()
	b.text = text
	b.custom_minimum_size = Vector2(120, 40)
	b.add_theme_font_size_override("font_size", 16)
	b.focus_mode = Control.FOCUS_NONE
	b.pressed.connect(cb)
	return b


func _build_hud() -> void:
	# top-left: who, health, energy
	var tl := _panel(hud)
	tl.position = Vector2(16, 16)
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 6)
	tl.add_child(v)
	var who := HBoxContainer.new()
	who_swatch = ColorRect.new()
	who_swatch.custom_minimum_size = Vector2(12, 12)
	who.add_child(who_swatch)
	who_name = _label("", 16)
	who.add_child(who_name)
	who_role = _label("", 13, DIM)
	who.add_child(who_role)
	v.add_child(who)
	var hp_row := HBoxContainer.new()
	hp_row.add_child(_label("HP", 13, DIM))
	var hb := _ghost_bar(Color("#ef4444"))
	hp_bar = hb[1]
	hp_ghost = hb[2]
	hp_row.add_child(hb[0])
	hp_text = _label("100", 13)
	hp_row.add_child(hp_text)
	v.add_child(hp_row)
	var en_row := HBoxContainer.new()
	en_row.add_child(_label("EN", 13, DIM))
	var eb := _ghost_bar(Color("#7c5cff"))
	en_bar = eb[1]
	en_ghost = eb[2]
	cost_mark = ColorRect.new()
	cost_mark.color = Color(1, 1, 1, 0.38)
	cost_mark.size = Vector2(0, 14)
	cost_mark.mouse_filter = Control.MOUSE_FILTER_IGNORE
	cost_mark.visible = false
	eb[0].add_child(cost_mark)
	en_row.add_child(eb[0])
	en_text = _label("100", 13)
	en_row.add_child(en_text)
	v.add_child(en_row)
	status_row = HBoxContainer.new()
	status_row.add_theme_constant_override("separation", 4)
	v.add_child(status_row)
	# top-right: wave / left / kills / score
	var tr := _panel(hud)
	tr.anchor_left = 1.0
	tr.anchor_right = 1.0
	tr.offset_left = -300
	tr.offset_right = -16
	tr.offset_top = 16
	var g := HBoxContainer.new()
	g.add_theme_constant_override("separation", 18)
	tr.add_child(g)
	for k in ["Wave", "Left", "Kills", "Score"]:
		var col := VBoxContainer.new()
		col.add_child(_label(k.to_upper(), 11, DIM))
		var val := _label("-", 22)
		col.add_child(val)
		stat_labels[k] = val
		g.add_child(col)
	# bottom-centre: spell preview, queue, element keys, cooldown tiles
	var bc := VBoxContainer.new()
	bc.anchor_left = 0.5
	bc.anchor_right = 0.5
	bc.anchor_top = 1.0
	bc.anchor_bottom = 1.0
	bc.offset_left = -420
	bc.offset_right = 420
	bc.offset_top = -190
	bc.offset_bottom = -12
	bc.alignment = BoxContainer.ALIGNMENT_END
	bc.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hud.add_child(bc)
	var pv := HBoxContainer.new()
	pv.alignment = BoxContainer.ALIGNMENT_CENTER
	pv.add_theme_constant_override("separation", 12)
	shape_label = _label("Queue elements - 1-0", 13, DIM)
	spell_label = _label("-", 22)
	cost_label = _label("", 13, DIM)
	pv.add_child(shape_label)
	pv.add_child(spell_label)
	pv.add_child(cost_label)
	bc.add_child(pv)
	var qrow := HBoxContainer.new()
	qrow.alignment = BoxContainer.ALIGNMENT_CENTER
	qrow.add_theme_constant_override("separation", 8)
	for i in SpellBook.max_queue():
		# an element orb: its own colours, so it opts out of the panel theme
		var p := PanelContainer.new()
		p.theme_type_variation = "Orb"
		var sb := _box(Color(0, 0, 0, 0.5), Color(1, 1, 1, 0.18), 18, 0)
		sb.set_border_width_all(2)
		p.add_theme_stylebox_override("panel", sb)
		p.custom_minimum_size = Vector2(96, 36)
		p.pivot_offset = Vector2(48, 18)
		var l := _label("", 13)
		l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		l.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		p.add_child(l)
		qrow.add_child(p)
		slots.append({"panel": p, "style": sb, "label": l, "el": "?", "pop": 0.0})
	bc.add_child(qrow)
	var erow := HBoxContainer.new()
	erow.alignment = BoxContainer.ALIGNMENT_CENTER
	erow.add_theme_constant_override("separation", 6)
	for el in SpellBook.ORDER:
		var E := SpellBook.element(el)
		var b := Button.new()
		b.text = "%s  %s" % [E["key"], E["name"]]
		b.focus_mode = Control.FOCUS_NONE
		b.custom_minimum_size = Vector2(76, 34)
		b.add_theme_font_size_override("font_size", 12)
		# a keycap: element colour, thicker bottom edge, flashes when its element is queued
		var sb := _box(Color(SpellBook.color(el), 0.18), SpellBook.color(el), 6, 4)
		sb.set_border_width_all(1)
		sb.border_width_bottom = 4
		b.add_theme_stylebox_override("normal", sb)
		b.add_theme_stylebox_override("hover", sb)
		b.add_theme_stylebox_override("pressed", sb)
		b.add_theme_color_override("font_color", INK)
		b.button_down.connect(_on_element.bind(el))
		erow.add_child(b)
		keycaps[el] = {"button": b, "style": sb, "flash": 0.0}
	bc.add_child(erow)
	var trow := HBoxContainer.new()
	trow.alignment = BoxContainer.ALIGNMENT_CENTER
	trow.add_theme_constant_override("separation", 10)
	trow.add_theme_constant_override("separation", 18)
	for pair in [["cast", "Cast  LMB"], ["nova", "Area  RMB/E"], ["self", "Self  F"], ["dodge", "Dodge  Space"]]:
		var col := HBoxContainer.new()
		col.add_theme_constant_override("separation", 6)
		var tile := RadialTile.new()
		tile.custom_minimum_size = Vector2(24, 24)
		tile.mouse_filter = Control.MOUSE_FILTER_IGNORE
		col.add_child(tile)
		var lab := _label(pair[1], 12, DIM)
		lab.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		col.add_child(lab)
		tiles[pair[0]] = tile
		trow.add_child(col)
	bc.add_child(trow)
	toast = _label("", 18, Color("#ffd27a"))
	toast.anchor_left = 0.5
	toast.anchor_right = 0.5
	toast.anchor_top = 1.0
	toast.anchor_bottom = 1.0
	toast.offset_left = -300
	toast.offset_right = 300
	toast.offset_top = -230
	toast.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	toast.pivot_offset = Vector2(300, 12)
	hud.add_child(toast)
	banner = _label("", 40)
	banner.anchor_left = 0.5
	banner.anchor_right = 0.5
	banner.offset_left = -400
	banner.offset_right = 400
	banner.offset_top = 110
	banner.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	banner.add_theme_color_override("font_color", Color("#fff3c4"))
	banner.pivot_offset = Vector2(400, 28)
	hud.add_child(banner)


# Centres a panel on its screen at its content's size.
func _center(p: Control) -> void:
	p.set_anchors_preset(Control.PRESET_CENTER)
	p.grow_horizontal = Control.GROW_DIRECTION_BOTH
	p.grow_vertical = Control.GROW_DIRECTION_BOTH


func _screen() -> Control:
	var s := ColorRect.new()
	s.color = Color(0.05, 0.04, 0.09, 0.55)
	s.set_anchors_preset(Control.PRESET_FULL_RECT)
	s.visible = false
	root.add_child(s)
	return s


func _build_menu() -> void:
	menu_screen = _screen()
	menu_screen.color = Color(0, 0, 0, 0)
	var p := _panel(menu_screen)
	p.anchor_left = 1.0
	p.anchor_right = 1.0
	p.anchor_top = 0.5
	p.anchor_bottom = 0.5
	p.offset_left = -440
	p.offset_right = -32
	p.offset_top = -344
	p.offset_bottom = 344
	p.mouse_filter = Control.MOUSE_FILTER_STOP
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 5)
	p.add_child(v)
	v.add_child(_label("COURT OF WAVES", 30))
	v.add_child(_label("Queue up to three elements. The mix decides the spell.", 14, DIM))
	v.add_child(_label("Choose your wizard", 13, DIM))
	for w in Roster.all():
		var b := _button("%s  -  %s" % [w["name"], w["role"]], _on_pick.bind(w["id"]))
		b.custom_minimum_size.y = 34
		b.alignment = HORIZONTAL_ALIGNMENT_LEFT
		b.toggle_mode = true
		b.add_theme_color_override("icon_normal_color", Color(w["glow"]))
		var sw := ColorRect.new()
		sw.color = Color(w["glow"])
		sw.custom_minimum_size = Vector2(6, 0)
		sw.position = Vector2(0, 0)
		sw.size = Vector2(6, 40)
		sw.mouse_filter = Control.MOUSE_FILTER_IGNORE
		b.add_child(sw)
		roster_buttons[w["id"]] = b
		v.add_child(b)
	blurb_label = _label("", 13, DIM)
	blurb_label.autowrap_mode = TextServer.AUTOWRAP_WORD
	blurb_label.custom_minimum_size = Vector2(380, 40)
	v.add_child(blurb_label)
	var ctl := GridContainer.new()
	ctl.columns = 2
	ctl.add_theme_constant_override("h_separation", 14)
	for pair in Controls.HELP:
		ctl.add_child(_label(pair[0], 11))
		ctl.add_child(_label(pair[1], 11, DIM))
	v.add_child(ctl)
	v.add_child(_button("Enter the court", _on_start))
	_set_who()


func _build_pause() -> void:
	pause_screen = _screen()
	pause_screen.mouse_filter = Control.MOUSE_FILTER_STOP
	var p := _panel(pause_screen)
	_center(p)
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 8)
	p.add_child(v)
	var head := HBoxContainer.new()
	head.add_child(_label("Paused - Grimoire", 26))
	found_label = _label("", 14, DIM)
	head.add_child(found_label)
	v.add_child(head)
	var scroll := ScrollContainer.new()
	scroll.custom_minimum_size = Vector2(800, 440)
	v.add_child(scroll)
	grimoire_box = GridContainer.new()
	grimoire_box.columns = 3
	grimoire_box.add_theme_constant_override("h_separation", 14)
	grimoire_box.add_theme_constant_override("v_separation", 4)
	scroll.add_child(grimoire_box)
	var row := HBoxContainer.new()
	row.add_child(_button("Resume", _on_resume))
	row.add_child(_button("Restart", _on_restart))
	row.add_child(_button("Menu", _on_menu))
	var vol := HBoxContainer.new()
	vol.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	vol.alignment = BoxContainer.ALIGNMENT_END
	vol.add_child(_label("Volume  (M mutes)", 13, DIM))
	volume_slider = HSlider.new()
	volume_slider.min_value = 0.0
	volume_slider.max_value = 1.0
	volume_slider.step = 0.05
	volume_slider.custom_minimum_size = Vector2(180, 24)
	volume_slider.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	volume_slider.focus_mode = Control.FOCUS_NONE
	volume_slider.value_changed.connect(_on_volume)
	vol.add_child(volume_slider)
	row.add_child(vol)
	v.add_child(row)


func _build_dead() -> void:
	dead_screen = _screen()
	dead_screen.mouse_filter = Control.MOUSE_FILTER_STOP
	var p := _panel(dead_screen)
	_center(p)
	p.custom_minimum_size = Vector2(380, 0)
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 10)
	p.add_child(v)
	dead_kicker = _label("", 30, Color("#ffb4a8"))
	v.add_child(dead_kicker)
	dead_stats = GridContainer.new()
	dead_stats.columns = 2
	dead_stats.add_theme_constant_override("h_separation", 30)
	v.add_child(dead_stats)
	var row := HBoxContainer.new()
	row.add_child(_button("Try again  (R)", _on_restart))
	row.add_child(_button("Menu", _on_menu))
	v.add_child(row)


# ---------------------------------------------------------------- callbacks
func _on_pick(id: String) -> void:
	wizard_id = id
	_set_who()
	picked.emit(id)


func _on_start() -> void:
	start_pressed.emit()


# Shows the saved volume without echoing it back as a change.
func set_volume(v: float) -> void:
	volume_slider.set_value_no_signal(v)


func _on_volume(v: float) -> void:
	volume_changed.emit(v)


func _on_resume() -> void:
	resume_pressed.emit()


func _on_restart() -> void:
	restart_pressed.emit()


func _on_menu() -> void:
	menu_pressed.emit()


func _on_element(el: String) -> void:
	element_pressed.emit(el)


func _set_who() -> void:
	var w := Roster.find(wizard_id)
	if w.is_empty():
		return
	who_name.text = w["name"] + "  "
	who_role.text = w["role"]
	who_swatch.color = Color(w["glow"])
	for id in roster_buttons:
		roster_buttons[id].button_pressed = id == wizard_id
	if blurb_label:
		blurb_label.text = w["blurb"]


# ---------------------------------------------------------------- per frame
func say(text: String) -> void:
	if text == _last_toast and toast_t > 0:
		return
	_last_toast = text
	toast_t = 1.6
	_toast_k = 0.0
	toast.text = text


func update(s: ArenaSim, events: Array, dt: float) -> void:
	sim = s
	_t += dt
	var p := s.player
	_show_screens(s, dt)
	for e in events:
		match e["type"]:
			"queue":
				if keycaps.has(e["el"]):
					keycaps[e["el"]]["flash"] = 1.0
			"wave":
				_banner("Wave %d" % e["n"])
			"waveClear":
				_banner("Wave %d cleared  +%d health" % [e["n"], e["heal"]])
			"hurt":
				vig = minf(1.0, vig + (0.08 if e["dot"] else 0.55))
				if e["self"] and e["reason"] != "" and not e["dot"]:
					say("Self-inflicted - " + e["reason"])
			"noEnergy":
				say("Not enough energy")
			"queueFull":
				say("Queue holds %d elements - cast or clear (X)" % SpellBook.max_queue())
			"cancel":
				_shake = 0.35
				say("%s and %s cancel out" % [SpellBook.element(e["a"])["name"], SpellBook.element(e["b"])["name"]])
			"heal":
				pass
			"fizzle":
				say("Queue an element first (1-0)")
			"cooldown":
				say("%s spells recharging - %.1fs" % [SpellBook.shape(e["shape"])["label"], e["t"]])
	toast_t -= dt
	toast.modulate.a = clampf(toast_t / 0.4, 0, 1)
	_toast_k += dt
	toast.scale = Vector2.ONE * (1.0 + 0.25 * exp(-14.0 * _toast_k))
	banner_t -= dt
	banner.modulate.a = clampf(banner_t / 0.5, 0, 1)
	_banner_k += dt
	banner.scale = Vector2.ONE * (1.0 + 0.6 * exp(-12.0 * _banner_k))
	vig *= exp(-4 * dt)
	var low_hp: bool = p.alive and p.hp / p.max_hp < 0.3
	var pulse := 0.5 + 0.5 * sin(_t * 9.0)
	var low := 0.25 + (pulse - 0.5) * 0.2 if low_hp else 0.0
	vignette.color.a = clampf((vig + low) * 0.35, 0, 0.6)
	hp_bar.modulate = Color(1.0 + 0.7 * pulse, 1.0 + 0.25 * pulse, 1.0 + 0.25 * pulse) if low_hp else Color.WHITE
	_hp_hold = _drain(hp_bar, hp_ghost, maxf(0.0, p.hp / p.max_hp), _hp_hold, dt)
	hp_text.text = str(ceili(p.hp))
	_en_hold = _drain(en_bar, en_ghost, p.energy / p.max_energy, _en_hold, dt)
	en_text.text = str(floori(p.energy))
	stat_labels["Wave"].text = str(s.wave) if s.wave else "-"
	stat_labels["Left"].text = str(s.remaining) if s.wave else "-"
	stat_labels["Kills"].text = str(s.kills)
	stat_labels["Score"].text = str(s.score)
	var queued := not p.queue.is_empty()
	var sp := SpellBook.resolve(p.queue if queued else p.last)
	var combo: bool = _counts(p.queue).size() >= 2
	_shake = maxf(0.0, _shake - dt)
	for i in slots.size():
		var el: String = p.queue[i] if i < p.queue.size() else ""
		var sl: Dictionary = slots[i]
		var sb: StyleBoxFlat = sl["style"]
		if sl["el"] != el:
			sl["el"] = el
			sl["label"].text = SpellBook.element(el)["name"] if el != "" else ""
			sb.bg_color = Color(SpellBook.color(el), 0.35) if el != "" else Color(0, 0, 0, 0.5)
			sb.border_color = SpellBook.color(el) if el != "" else Color(1, 1, 1, 0.18)
			if el != "":
				sl["pop"] = 1.0
		sl["pop"] *= exp(-12.0 * dt)
		var orb: Control = sl["panel"]
		orb.scale = Vector2.ONE * (1.0 + 0.3 * sl["pop"])
		orb.rotation = sin(_t * 70.0 + i * 1.7) * 0.12 * (_shake / 0.35) if _shake > 0 else 0.0
		if el == "":
			sb.shadow_size = 0
		elif combo:
			sb.shadow_color = Color(sp["color"], 0.85)
			sb.shadow_size = roundi(7 + 3 * sin(_t * 6.0))
		else:
			sb.shadow_color = Color(SpellBook.color(el), 0.5)
			sb.shadow_size = 3
	for el in keycaps:
		var kc: Dictionary = keycaps[el]
		kc["flash"] = maxf(0.0, kc["flash"] - dt * 4.0)
		kc["style"].bg_color.a = 0.18 + 0.55 * kc["flash"]
	var cost: float = sp["cost"] if queued and not sp.is_empty() else 0.0
	cost_mark.visible = cost > 0
	if cost_mark.visible:
		var w: float = en_bar.custom_minimum_size.x
		var have: float = p.energy / p.max_energy
		var need: float = cost / p.max_energy
		cost_mark.color = Color(1, 1, 1, 0.38) if need <= have else Color(1, 0.3, 0.3, 0.5)
		cost_mark.position = Vector2(w * maxf(0.0, have - need), 0)
		cost_mark.size = Vector2(w * minf(need, have), 14)
	shape_label.text = (SpellBook.shape(sp["def"]["shape"])["label"] if queued else "Recast - hold click") if not sp.is_empty() else "Queue elements - 1-0"
	spell_label.text = sp["name"] if not sp.is_empty() else "-"
	spell_label.add_theme_color_override("font_color", sp["color"] if not sp.is_empty() else INK)
	spell_label.modulate.a = 1.0 if queued else 0.55
	cost_label.text = "%d energy" % sp["cost"] if not sp.is_empty() else ""
	for k in tiles:
		var f: float = p.cd[k] / maxf(0.001, p.cd_max[k]) if p.cd[k] > 0 else 0.0
		if k == "cast" and not sp.is_empty():
			var sh: String = sp["def"]["shape"]
			var c: float = p.shape_cd.get(sh, 0.0)
			if c > 0:
				f = maxf(f, c / maxf(0.001, p.shape_max.get(sh, 1.0)))
		tiles[k].value = 1.0 - f
	_update_status(p)
	overlay.queue_redraw()


func _banner(text: String) -> void:
	banner.text = text
	banner_t = 2.2
	_banner_k = 0.0


# The bar jumps to `v`; the ghost waits a beat, then drains to it (and jumps up with a gain).
func _drain(bar: ProgressBar, ghost: ProgressBar, v: float, hold: float, dt: float) -> float:
	if v < bar.value - 0.001:
		hold = 0.4
	bar.value = v
	hold -= dt
	if ghost.value <= v:
		ghost.value = v
	elif hold <= 0:
		ghost.value = maxf(v, ghost.value - dt * 0.6)
	return hold


func _update_status(p) -> void:
	var want := []
	for row in STATUS:
		var v: float = p.st.get(row[0])
		if v > 0:
			var label: String = row[1]
			if row[0] == "chill":
				label += " x%d" % floori(v)
			elif row[0] == "ward":
				label += " %d" % ceili(v)
			want.append([label, row[2]])
	var key := str(want)
	if status_row.get_meta("key", "") == key:
		return
	status_row.set_meta("key", key)
	for c in status_row.get_children():
		c.queue_free()
	for w in want:
		var l := _label(w[0], 12, Color(w[1]))
		status_row.add_child(l)


func _show_screens(s: ArenaSim, dt := 0.0) -> void:
	var dead := s.mode == "dead" and s.player.dead_t > 1.0
	menu_screen.visible = s.mode == "menu"
	pause_screen.visible = s.mode == "paused"
	dead_screen.visible = dead
	hud.visible = s.mode != "menu"
	if s.mode != _prev_mode:
		if s.mode == "paused":
			_fill_grimoire(s.stats["found"])
		if s.mode != "dead":
			_dead_filled = false
			_dead_t = 0.0
		_prev_mode = s.mode
	if dead and not _dead_filled:
		_dead_filled = true
		dead_kicker.text = "Fallen on wave %d" % s.wave
		for c in dead_stats.get_children():
			c.queue_free()
		for row in [["Wave reached", s.wave], ["Kills", s.kills], ["Score", s.score], ["Damage dealt", roundi(s.stats["dealt"])],
				["Self-inflicted", roundi(s.stats["self_dmg"])], ["Spells found", "%d / %d" % [s.stats["found"].size(), SpellBook.grimoire().size()]]]:
			dead_stats.add_child(_label(row[0], 15, DIM))
			dead_stats.add_child(_label(str(row[1]), 18))
	if dead:
		# stats land one row at a time
		_dead_t += dt
		var rows := dead_stats.get_children()
		for i in rows.size():
			rows[i].modulate.a = clampf((_dead_t - 0.25 - (i / 2) * 0.18) / 0.2, 0.0, 1.0)


func _fill_grimoire(found: Dictionary) -> void:
	for c in grimoire_box.get_children():
		c.queue_free()
	var n := 0
	for g in SpellBook.grimoire():
		var have: bool = found.has(g["key"])
		if have:
			n += 1
		var dots := Dots.new()
		dots.custom_minimum_size = Vector2(44, 18)
		for e in g["els"]:
			dots.colors.append(SpellBook.color(e) if have else Color(SpellBook.color(e), 0.3))
		grimoire_box.add_child(dots)
		var nm := _label("%s  (%s)" % [g["def"]["name"], SpellBook.shape(g["def"]["shape"])["label"]], 13, SpellBook.mix_color(_counts(g["els"])) if have else DIM)
		grimoire_box.add_child(nm)
		var d := _label(g["def"].get("desc", ""), 11, DIM)
		d.custom_minimum_size = Vector2(380, 0)
		d.autowrap_mode = TextServer.AUTOWRAP_WORD
		grimoire_box.add_child(d)
	found_label.text = "   %d / %d cast" % [n, SpellBook.grimoire().size()]


func _counts(els: Array) -> Dictionary:
	var c := {}
	for e in els:
		c[e] = c.get(e, 0) + 1
	return c


# Enemy health bars with status pips, drawn over the 3D view.
func _draw_overlay() -> void:
	if sim == null or view == null or sim.mode == "menu" or view.camera == null or not view.camera.is_inside_tree():
		return
	var cam: Camera3D = view.camera
	for e in sim.enemies:
		if e.state == "spawn":
			continue
		var at: Vector3 = view.bar_anchor(e)
		if cam.is_position_behind(at):
			continue
		var sc := cam.unproject_position(at)
		var w := 58.0 if e.kind == "bulwark" else 42.0
		var x := sc.x - w / 2
		var k := maxf(0.0, e.hp / e.max_hp)
		overlay.draw_rect(Rect2(x - 1, sc.y - 1, w + 2, 7), Color(0.086, 0.07, 0.145, 0.82))
		overlay.draw_rect(Rect2(x, sc.y, w * k, 5), Color("#a8ecff") if e.st.frozen > 0 else Color("#ef4444"))
		var pips := []
		if e.st.burn > 0:
			pips.append(Color("#ff6a2b"))
		if e.st.wet > 0:
			pips.append(Color("#3d9bff"))
		for i in mini(3, floori(e.st.chill)):
			pips.append(Color("#a8ecff"))
		if e.st.frozen > 0:
			pips.append(Color.WHITE)
		if e.st.shock > 0:
			pips.append(Color("#f4e15c"))
		if e.st.slow > 0:
			pips.append(Color("#b3793f"))
		if e.st.root > 0:
			pips.append(Color("#5cc84a"))
		if e.st.blind > 0:
			pips.append(Color("#fff1a8"))
		if e.st.curse > 0:
			pips.append(Color("#6a35b8"))
		for i in pips.size():
			overlay.draw_circle(Vector2(x + 3 + i * 8, sc.y + 11), 3, pips[i])


# A cooldown tile: a ring that sweeps round as it recharges, with a dot when ready.
class RadialTile extends Control:
	var color := Color("#c4b5fd")
	var value := 1.0:
		set(v):
			if absf(v - value) > 0.002:
				value = v
				queue_redraw()

	func _draw() -> void:
		var c := size / 2.0
		var r := minf(size.x, size.y) / 2.0 - 2.0
		draw_circle(c, r, Color(0, 0, 0, 0.5))
		if value >= 0.999:
			draw_arc(c, r, 0, TAU, 32, color, 2.5, true)
			draw_circle(c, r * 0.32, color)
		else:
			draw_arc(c, r, -PI / 2, -PI / 2 + TAU * value, 32, Color(color, 0.7), 2.5, true)


# A spell's elements as coloured dots (the grimoire).
class Dots extends Control:
	var colors: Array = []

	func _draw() -> void:
		for i in colors.size():
			draw_circle(Vector2(7 + i * 14, size.y / 2.0), 5.0, colors[i])
