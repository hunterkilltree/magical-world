# Thin game shell: input -> ArenaSim (fixed 60 Hz) -> ArenaView (3D) + Hud + Sfx.
# Menu (pick a wizard) -> play (endless waves) -> dead -> restart. Port of the prototype's main.js.
extends Node3D

const ArenaSim := preload("res://scripts/core/arena_sim.gd")
const ArenaView := preload("res://scripts/arena/arena_view.gd")
const Hud := preload("res://scripts/arena/hud.gd")
const Controls := preload("res://scripts/core/controls.gd")
const Roster := preload("res://scripts/core/wizard_roster.gd")
const Sfx := preload("res://scripts/audio/sfx.gd")

const STEP := 1.0 / 60.0

var sim: ArenaSim
var view: ArenaView
var hud: Hud
var sfx: Sfx
var wizard_id := Roster.DEFAULT_ID
var aim := Vector2(0, -1)
var _actions: Array = []
var _events: Array = []
var _started := false


func _ready() -> void:
	start()


# Builds everything once (tests call it directly; _ready is late under --script).
func start() -> void:
	if _started:
		return
	_started = true
	Controls.install()
	view = ArenaView.new()
	add_child(view)
	view.setup()
	hud = Hud.new()
	hud.view = view
	add_child(hud)
	hud.picked.connect(_on_pick)
	hud.start_pressed.connect(begin)
	hud.resume_pressed.connect(resume)
	hud.restart_pressed.connect(new_game.bind("play"))
	hud.menu_pressed.connect(new_game.bind("menu"))
	hud.element_pressed.connect(_on_element)
	sfx = Sfx.new()
	add_child(sfx)
	sfx.setup()
	hud.set_volume(sfx.volume)
	hud.volume_changed.connect(sfx.set_volume)
	new_game("menu")


func new_game(mode := "play") -> void:
	sim = ArenaSim.new(wizard_id)
	sim.mode = mode
	_actions.clear()
	_events.clear()
	view.reset(sim)
	hud.wizard_id = wizard_id
	hud.update(sim, [], 0.0)


func begin() -> void:
	if sim.mode == "menu":
		sim.mode = "play"


func resume() -> void:
	if sim.mode == "paused":
		sim.mode = "play"


func _on_pick(id: String) -> void:
	wizard_id = id
	sim.player.wizard = id
	sim.player.book = id
	view.set_wizard(id)


func _on_element(el: String) -> void:
	_actions.append("el:" + el)


func _unhandled_input(event: InputEvent) -> void:
	var a := Controls.action_for(event)
	if a == "":
		return
	if a == "mute":
		sfx.set_muted(not sfx.muted)
		hud.say("Sound off" if sfx.muted else "Sound on")
		return
	if a == "restart":
		if sim.mode == "dead" or sim.mode == "paused":
			new_game("play")
		return
	if sim.mode == "menu" and a != "pause":
		return
	_actions.append(a)


func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT and sim and sim.mode == "play":
		sim.mode = "paused"


func _physics_process(_delta: float) -> void:
	if sim == null:
		return
	aim = view.screen_to_ground(get_viewport().get_mouse_position())
	var actions := _actions.duplicate()
	_actions.clear()
	if Input.is_action_pressed("cast") and not actions.has("cast"):
		actions.append("recast")
	_events.append_array(sim.step({"move": Controls.move_vector(), "aim": aim, "actions": actions}, STEP))


func _process(delta: float) -> void:
	if sim == null:
		return
	view.consume(_events, sim)
	view.render(sim, 0.0 if sim.mode == "paused" else minf(delta, 0.05), aim)
	hud.update(sim, _events, delta)
	sfx.consume(_events, sim)
	sfx.update(delta)
	_events.clear()


# One frame without the engine loop (tests and screenshots): step the sim, then draw.
func tick(dt: float, inp := {}) -> Array:
	var i := {"move": inp.get("move", Vector2.ZERO), "aim": inp.get("aim", aim), "actions": inp.get("actions", [])}
	aim = i["aim"]
	var ev := sim.step(i, dt)
	view.consume(ev, sim)
	view.render(sim, dt, aim)
	hud.update(sim, ev, dt)
	sfx.consume(ev, sim)
	sfx.update(dt)
	return ev
