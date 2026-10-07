# The playable game: menu -> overworld -> zone -> result -> overworld ... -> ending.
# Logic lives in scripts/core (GameSession, ZonePlay); this scene only builds UI and draws.
extends Node2D

const GameSession = preload("res://scripts/core/game_session.gd")
const Level = preload("res://scripts/level.gd")
const EffectsView = preload("res://scripts/effects_view.gd")
const SpellBook = preload("res://scripts/core/spell_book.gd")

const ENDING_TEXT := "The Hollow Warden falls, and the dark drains out of Grauhold Reach.\n\n" \
	+ "The three fragments knit around the Staff of the Cracked Rune, and for the first\n" \
	+ "time since the night the Reach fell, the rune burns clean.\n\n" \
	+ "Along the shore where the party first landed, the first lamp in the Reach comes back on."

var save_path := "user://savegame.json"
var session
var play = null
var state := "none"  # menu | overworld | zone | zone_result | ending
var zone_buttons: Dictionary = {}  # zone id -> Button
var continue_button: Button = null

var _ui: CanvasLayer
var _world: Node2D
var _level
var effects_view = null
var wizard_button: Button = null
var _hud: Label
var _banner: Label


var _started := false


func _ready() -> void:
	start()


# Builds the scene's children and shows the menu. Idempotent; tests call it directly
# because _ready does not run for nodes added while a --script SceneTree initialises.
func start() -> void:
	if _started:
		return
	_started = true
	_world = Node2D.new()
	add_child(_world)
	var cam := Camera2D.new()
	cam.position = Vector2(832, 576) / 2.0
	add_child(cam)
	_ui = CanvasLayer.new()
	add_child(_ui)
	session = GameSession.new(save_path)
	show_menu()


# ---- screens ---------------------------------------------------------------

func show_menu() -> void:
	_leave_world()
	_clear_ui()
	state = "menu"
	var box := _column("Grauhold Reach")
	var new_btn := Button.new()
	new_btn.text = "New Game"
	new_btn.pressed.connect(new_game)
	box.add_child(new_btn)
	continue_button = Button.new()
	continue_button.text = "Continue"
	continue_button.disabled = not session.has_save()
	continue_button.pressed.connect(continue_game)
	box.add_child(continue_button)


func new_game() -> void:
	session.new_game()
	show_overworld()


func continue_game() -> bool:
	if not session.continue_game():
		return false
	show_overworld()
	return true


func show_overworld() -> void:
	_leave_world()
	_clear_ui()
	state = "overworld"
	zone_buttons.clear()
	var box := _column("Grauhold Reach - choose a zone")
	for c in session.zone_choices():
		var b := Button.new()
		var tag := "complete" if c["complete"] else ("open" if c["unlocked"] else "locked")
		b.text = "%s  [%s]" % [c["name"], tag]
		b.disabled = not c["unlocked"]
		b.pressed.connect(enter_zone.bind(c["id"]))
		box.add_child(b)
		zone_buttons[c["id"]] = b
	var frags := 0
	for id in ["rune_fragment_1", "rune_fragment_2", "rune_fragment_3"]:
		if session.inventory.has_item(id):
			frags += 1
	var info := Label.new()
	info.text = "Rune fragments: %d / 3" % frags
	box.add_child(info)
	wizard_button = Button.new()
	wizard_button.text = _wizard_label()
	wizard_button.pressed.connect(cycle_wizard)
	box.add_child(wizard_button)
	var back := Button.new()
	back.text = "Main menu"
	back.pressed.connect(show_menu)
	box.add_child(back)


func cycle_wizard() -> void:
	session.cycle_wizard()
	if wizard_button != null:
		wizard_button.text = _wizard_label()


func _wizard_label() -> String:
	var w: Dictionary = session.wizard()
	return "Wizard: %s - %s (%s +%d%%)  [click to change]" % [w["name"], w["role"],
		", ".join(w["affinity"]), int(round((float(w["boost"]) - 1.0) * 100.0))]


# Starts a zone; returns false if it is locked.
func enter_zone(id: String) -> bool:
	var p = session.enter_zone(id)
	if p == null:
		return false
	_leave_world()
	_clear_ui()
	play = p
	state = "zone"
	_level = Level.new()
	_world.add_child(_level)
	_level.show_grid(play.grid)
	for e in play.enemies:
		_world.add_child(e)
	if play.boss != null:
		_world.add_child(play.boss)
	_world.add_child(play.wizard)
	effects_view = EffectsView.new()
	effects_view.play = play
	_world.add_child(effects_view)
	_hud = Label.new()
	_hud.position = Vector2(8, 4)
	_ui.add_child(_hud)
	_banner = Label.new()
	_banner.position = Vector2(220, 260)
	_banner.add_theme_font_size_override("font_size", 28)
	_ui.add_child(_banner)
	_update_hud()
	return true


func show_ending() -> void:
	_leave_world()
	_clear_ui()
	state = "ending"
	var box := _column("The End")
	var text := Label.new()
	text.text = ENDING_TEXT
	box.add_child(text)
	var btn := Button.new()
	btn.text = "Main menu"
	btn.pressed.connect(show_menu)
	box.add_child(btn)


# ---- zone loop -------------------------------------------------------------

func tick(delta: float, input: Vector2) -> void:
	if state != "zone" or play == null:
		return
	play.tick(delta, input)
	_level.queue_redraw()
	effects_view.queue_redraw()
	_update_hud()
	if play.state != "playing":
		_finish_zone()


func _physics_process(delta: float) -> void:
	tick(delta, Input.get_vector("ui_left", "ui_right", "ui_up", "ui_down"))


func _finish_zone() -> void:
	session.leave_zone(play)
	if play.run.ending_played:
		show_ending()
		return
	state = "zone_result"
	match play.state:
		"complete":
			_banner.text = "Zone complete!\nEnter to continue"
		"dead":
			_banner.text = "You fell.\nEnter to return"
		_:
			_banner.text = "Night fell.\nEnter to return"


# Leaves the zone result (or abandons a zone in play) and returns to the overworld.
func continue_after_zone() -> void:
	if state == "zone" and play != null:
		session.leave_zone(play)
	show_overworld()


func _unhandled_key_input(event: InputEvent) -> void:
	if not (event is InputEventKey and event.pressed and not event.echo):
		return
	if state == "zone_result" and (event.keycode == KEY_ENTER or event.keycode == KEY_KP_ENTER):
		continue_after_zone()
	elif state == "zone":
		if event.keycode == KEY_ESCAPE:
			continue_after_zone()
			return
		var elements := SpellBook.elements()
		var idx: int = event.keycode - KEY_1
		if idx >= 0 and idx < elements.size():
			play.queue_element(elements[idx])
		elif event.keycode == KEY_SPACE:
			play.cast()
			effects_view.queue_redraw()


func _update_hud() -> void:
	if _hud == null or play == null:
		return
	var h = play.wizard.health
	var line := "%s   %s   HP %d%s   Queue: %s" % [session.campaign.zone_name(play.grid.id),
		play.wizard_data.get("name", "Wizard"), h.current,
		(" +%d shield" % h.shield) if h.shield > 0 else "", ", ".join(play.queue.queue)]
	if play.boss != null:
		line += "   %s %d/%d" % [play.boss.display_name, play.boss.health.current, play.boss.health.max_health]
	_hud.text = line + "\n1-9 element, Space cast, Esc leave.  " + play.grid.objective


# ---- helpers ---------------------------------------------------------------

func _column(title: String) -> VBoxContainer:
	var box := VBoxContainer.new()
	box.position = Vector2(40, 40)
	box.add_theme_constant_override("separation", 8)
	var t := Label.new()
	t.text = title
	t.add_theme_font_size_override("font_size", 28)
	box.add_child(t)
	_ui.add_child(box)
	return box


func _clear_ui() -> void:
	for c in _ui.get_children():
		c.free()
	_hud = null
	_banner = null
	continue_button = null
	wizard_button = null


func _leave_world() -> void:
	if play != null:
		play.free_nodes()
		play = null
	if _level != null and is_instance_valid(_level):
		_level.free()
	_level = null
	if effects_view != null and is_instance_valid(effects_view):
		effects_view.free()
	effects_view = null
