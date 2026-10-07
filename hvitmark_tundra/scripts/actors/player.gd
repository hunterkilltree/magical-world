class_name Player
extends CharacterBody2D
## The mage. Top-down CharacterBody2D with smooth movement, HP, a follow camera and a SpellCaster.
##
## Movement keys: the ARROW KEYS always move. W/A/S/D are also spell keys (Ice Lance, Fire Bolt,
## Lightning, Heal), so by default they only queue spells. Press TAB to switch to WASD movement:
## W/A/S/D then move, and those four spells need SHIFT held to queue.

signal health_changed(hp: float, max_hp: float)
signal move_scheme_changed(wasd_enabled: bool)
signal died

@export var max_hp := 100.0
@export var move_speed := 260.0
@export var acceleration := 1800.0
@export var friction := 2200.0

var hp := 100.0
var wasd_movement := false
## Tests set this to drive movement without real key presses (null = read the keyboard).
var input_override: Variant = null

@onready var caster: SpellCaster = $SpellCaster
@onready var camera: Camera2D = $Camera2D
@onready var visual: Node2D = $Visual


func _ready() -> void:
	hp = max_hp
	caster.wasd_needs_shift = wasd_movement
	health_changed.emit(hp, max_hp)


func _physics_process(delta: float) -> void:
	var dir := _read_move_input()
	var target := dir * move_speed
	if dir == Vector2.ZERO:
		velocity = velocity.move_toward(Vector2.ZERO, friction * delta)
	else:
		velocity = velocity.move_toward(target, acceleration * delta)
	move_and_slide()
	visual.call("set_motion", velocity, dir)


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("toggle_move_scheme"):
		set_wasd_movement(not wasd_movement)
	elif event.is_action_pressed("debug_damage"):
		take_damage(10.0)
	elif event.is_action_pressed("debug_heal"):
		heal(10.0)


func set_wasd_movement(enabled: bool) -> void:
	wasd_movement = enabled
	caster.wasd_needs_shift = enabled
	move_scheme_changed.emit(enabled)


func take_damage(amount: float) -> void:
	if hp <= 0.0:
		return
	hp = maxf(0.0, hp - amount)
	health_changed.emit(hp, max_hp)
	if hp <= 0.0:
		died.emit()


func heal(amount: float) -> void:
	if hp <= 0.0:
		return
	hp = minf(max_hp, hp + amount)
	health_changed.emit(hp, max_hp)


func _read_move_input() -> Vector2:
	if input_override != null:
		return (input_override as Vector2).limit_length(1.0)
	var v := Input.get_vector("move_left", "move_right", "move_up", "move_down")
	if wasd_movement:
		v += Input.get_vector("wasd_left", "wasd_right", "wasd_up", "wasd_down")
	return v.limit_length(1.0)
