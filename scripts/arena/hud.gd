# HUD and screens (menu, pause, death) drawn over the 3D arena. Reads the sim; what the player
# asks for goes back out through signals. Port of story/design/court_of_waves/reference/game/hud.js.
extends CanvasLayer

signal picked(id: String)
signal start_pressed
signal resume_pressed
signal restart_pressed
signal menu_pressed
signal element_pressed(el: String)

const SpellBook := preload("res://scripts/core/spell_book.gd")
const Roster := preload("res://scripts/core/wizard_roster.gd")
const Controls := preload("res://scripts/core/controls.gd")
const ArenaSim := preload("res://scripts/core/arena_sim.gd")

const INK := Color("#f4f1ff")
const DIM := Color("#a79fc0")
const PANEL := Color(0.086, 0.07, 0.145, 0.86)
const STATUS := [
	["burn", "Burning", "#ff6a2b"], ["wet", "Wet", "#3d9bff"], ["chill", "Chilled", "#a8ecff"], ["frozen", "Frozen", "#ffffff"],
	["shock", "Shocked", "#f4e15c"], ["slow", "Mired", "#b3793f"], ["stoneskin", "Stoneskin", "#b3793f"], ["ward", "Ward", "#d04bff"],
	["haste", "Haste", "#f4e15c"],
]

var view # ArenaView, for health bars over enemies
var sim: ArenaSim
var wizard_id := Roster.DEFAULT_ID

var root: Control
var hud: Control
var overlay: Control
var vignette: ColorRect
var hp_bar: ProgressBar
var hp_text: Label
var en_bar: ProgressBar
var en_text: Label
var who_name: Label
var who_role: Label
var who_swatch: ColorRect
var stat_labels := {}
var slots: Array = []
var shape_label: Label
var spell_label: Label
var cost_label: Label
var status_row: HBoxContainer
var tiles := {} # cast/nova/self/dodge -> {bar}
var toast: Label
var banner: Label
var menu_screen: Control
var pause_screen: Control
var dead_screen: Control
var roster_buttons := {}
var grimoire_box: GridContainer
var found_label: Label
var dead_kicker: Label
var dead_stats: GridContainer
var blurb_label: Label

var vig := 0.0
var toast_t := 0.0
var banner_t := 0.0
var _last_toast := ""
var _prev_mode := ""
var _dead_filled := false


func _init() -> void:
	layer = 10
	root = Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
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


func _panel(parent: Control) -> PanelContainer:
	var p := PanelContainer.new()
	var sb := StyleBoxFlat.new()
	sb.bg_color = PANEL
	sb.set_corner_radius_all(8)
	sb.set_content_margin_all(10)
	sb.border_color = Color(1, 1, 1, 0.08)
	sb.set_border_width_all(1)
	p.add_theme_stylebox_override("panel", sb)
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	parent.add_child(p)
	return p


func _bar(color: Color, width := 220.0) -> ProgressBar:
	var b := ProgressBar.new()
	b.custom_minimum_size = Vector2(width, 14)
	b.show_percentage = false
	b.max_value = 1.0
	var bg := StyleBoxFlat.new()
	bg.bg_color = Color(0, 0, 0, 0.45)
	bg.set_corner_radius_all(4)
	var fg := StyleBoxFlat.new()
	fg.bg_color = color
	fg.set_corner_radius_all(4)
	b.add_theme_stylebox_override("background", bg)
	b.add_theme_stylebox_override("fill", fg)
	b.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return b


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
	hp_bar = _bar(Color("#ef4444"))
	hp_row.add_child(hp_bar)
	hp_text = _label("100", 13)
	hp_row.add_child(hp_text)
	v.add_child(hp_row)
	var en_row := HBoxContainer.new()
	en_row.add_child(_label("EN", 13, DIM))
	en_bar = _bar(Color("#7c5cff"))
	en_row.add_child(en_bar)
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
	bc.offset_left = -330
	bc.offset_right = 330
	bc.offset_top = -190
	bc.offset_bottom = -12
	bc.alignment = BoxContainer.ALIGNMENT_END
	bc.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hud.add_child(bc)
	var pv := HBoxContainer.new()
	pv.alignment = BoxContainer.ALIGNMENT_CENTER
	pv.add_theme_constant_override("separation", 12)
	shape_label = _label("Queue elements - 1-6", 13, DIM)
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
		var p := PanelContainer.new()
		var sb := StyleBoxFlat.new()
		sb.bg_color = Color(0, 0, 0, 0.5)
		sb.set_corner_radius_all(22)
		sb.border_color = Color(1, 1, 1, 0.18)
		sb.set_border_width_all(2)
		p.add_theme_stylebox_override("panel", sb)
		p.custom_minimum_size = Vector2(96, 36)
		var l := _label("", 13)
		l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		l.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		p.add_child(l)
		qrow.add_child(p)
		slots.append({"panel": p, "style": sb, "label": l, "el": "?"})
	bc.add_child(qrow)
	var erow := HBoxContainer.new()
	erow.alignment = BoxContainer.ALIGNMENT_CENTER
	erow.add_theme_constant_override("separation", 6)
	for el in SpellBook.ORDER:
		var E := SpellBook.element(el)
		var b := Button.new()
		b.text = "%s  %s" % [E["key"], E["name"]]
		b.focus_mode = Control.FOCUS_NONE
		b.custom_minimum_size = Vector2(98, 34)
		b.add_theme_font_size_override("font_size", 13)
		var sb := StyleBoxFlat.new()
		sb.bg_color = Color(SpellBook.color(el), 0.22)
		sb.border_color = SpellBook.color(el)
		sb.set_border_width_all(2)
		sb.set_corner_radius_all(6)
		b.add_theme_stylebox_override("normal", sb)
		b.add_theme_stylebox_override("hover", sb)
		b.add_theme_stylebox_override("pressed", sb)
		b.add_theme_color_override("font_color", INK)
		b.button_down.connect(_on_element.bind(el))
		erow.add_child(b)
	bc.add_child(erow)
	var trow := HBoxContainer.new()
	trow.alignment = BoxContainer.ALIGNMENT_CENTER
	trow.add_theme_constant_override("separation", 10)
	for pair in [["cast", "Cast  LMB"], ["nova", "Area  RMB/E"], ["self", "Self  F"], ["dodge", "Dodge  Space"]]:
		var col := VBoxContainer.new()
		col.add_child(_label(pair[1], 11, DIM))
		var bar := _bar(Color("#c4b5fd"), 110)
		bar.custom_minimum_size.y = 6
		col.add_child(bar)
		tiles[pair[0]] = bar
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
	hud.add_child(toast)
	banner = _label("", 40)
	banner.anchor_left = 0.5
	banner.anchor_right = 0.5
	banner.offset_left = -400
	banner.offset_right = 400
	banner.offset_top = 110
	banner.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hud.add_child(banner)


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
	p.set_anchors_preset(Control.PRESET_CENTER)
	p.offset_left = -420
	p.offset_right = 420
	p.offset_top = -300
	p.offset_bottom = 300
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
	v.add_child(row)


func _build_dead() -> void:
	dead_screen = _screen()
	dead_screen.mouse_filter = Control.MOUSE_FILTER_STOP
	var p := _panel(dead_screen)
	p.set_anchors_preset(Control.PRESET_CENTER)
	p.offset_left = -240
	p.offset_right = 240
	p.offset_top = -190
	p.offset_bottom = 190
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 10)
	p.add_child(v)
	dead_kicker = _label("", 28)
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
	toast.text = text


func update(s: ArenaSim, events: Array, dt: float) -> void:
	sim = s
	var p := s.player
	_show_screens(s)
	for e in events:
		match e["type"]:
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
				say("%s and %s cancel out" % [SpellBook.element(e["a"])["name"], SpellBook.element(e["b"])["name"]])
			"fizzle":
				say("Queue an element first (1-6)")
			"cooldown":
				say("%s spells recharging - %.1fs" % [SpellBook.shape(e["shape"])["label"], e["t"]])
	toast_t -= dt
	toast.modulate.a = clampf(toast_t / 0.4, 0, 1)
	banner_t -= dt
	banner.modulate.a = clampf(banner_t / 0.5, 0, 1)
	vig *= exp(-4 * dt)
	var low := 0.25 + sin(Time.get_ticks_msec() / 300.0) * 0.1 if p.alive and p.hp / p.max_hp < 0.3 else 0.0
	vignette.color.a = clampf((vig + low) * 0.35, 0, 0.6)
	hp_bar.value = maxf(0.0, p.hp / p.max_hp)
	hp_text.text = str(ceili(p.hp))
	en_bar.value = p.energy / p.max_energy
	en_text.text = str(floori(p.energy))
	stat_labels["Wave"].text = str(s.wave) if s.wave else "-"
	stat_labels["Left"].text = str(s.remaining) if s.wave else "-"
	stat_labels["Kills"].text = str(s.kills)
	stat_labels["Score"].text = str(s.score)
	for i in slots.size():
		var el: String = p.queue[i] if i < p.queue.size() else ""
		var sl: Dictionary = slots[i]
		if sl["el"] == el:
			continue
		sl["el"] = el
		sl["label"].text = SpellBook.element(el)["name"] if el != "" else ""
		sl["style"].bg_color = Color(SpellBook.color(el), 0.35) if el != "" else Color(0, 0, 0, 0.5)
		sl["style"].border_color = SpellBook.color(el) if el != "" else Color(1, 1, 1, 0.18)
	var queued := not p.queue.is_empty()
	var sp := SpellBook.resolve(p.queue if queued else p.last)
	shape_label.text = (SpellBook.shape(sp["def"]["shape"])["label"] if queued else "Recast - hold click") if not sp.is_empty() else "Queue elements - 1-6"
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


func _show_screens(s: ArenaSim) -> void:
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


func _fill_grimoire(found: Dictionary) -> void:
	for c in grimoire_box.get_children():
		c.queue_free()
	var n := 0
	for g in SpellBook.grimoire():
		var have: bool = found.has(g["key"])
		if have:
			n += 1
		var keys := ""
		for e in g["els"]:
			keys += SpellBook.element(e)["key"] + " "
		grimoire_box.add_child(_label(keys, 13, INK if have else DIM))
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
		for i in pips.size():
			overlay.draw_circle(Vector2(x + 3 + i * 8, sc.y + 11), 3, pips[i])
