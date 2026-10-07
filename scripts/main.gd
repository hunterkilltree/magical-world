extends Node2D

const Level = preload("res://scripts/level.gd")
const Player = preload("res://scripts/player.gd")
const Enemy = preload("res://scripts/core/enemy.gd")
const ElementQueue = preload("res://scripts/core/element_queue.gd")
const Caster = preload("res://scripts/core/caster.gd")
const SpellBook = preload("res://scripts/core/spell_book.gd")

const ZONE := "tundra"

var level
var player
var enemies: Array = []
var queue := ElementQueue.new()
var caster := Caster.new()


func _ready() -> void:
	level = Level.new()
	add_child(level)
	if not level.build(ZONE):
		push_error("could not load zone " + ZONE)
		return
	player = Player.new()
	player.grid = level.grid
	player.position = level.entry_positions()[0]
	add_child(player)
	for p in level.enemy_spawn_positions():
		var e := Enemy.new()
		e.grid = level.grid
		e.position = p
		add_child(e)
		enemies.append(e)
	var cam := Camera2D.new()
	cam.position = Vector2(level.grid.width, level.grid.height) * level.grid.TILE / 2.0
	add_child(cam)
	print("Magical World booted: ", ZONE)


func _physics_process(delta: float) -> void:
	if player == null:
		return
	caster.update(delta)
	level.grid.update_gate_hold(level.grid.world_to_cell(player.position), delta)
	for e in enemies:
		if is_instance_valid(e) and not e.health.is_dead():
			e.step(delta, player)
		elif is_instance_valid(e):
			e.queue_free()
	level.queue_redraw()


# 1-9 queue an element (order of data/spells.json); Space casts.
func _unhandled_key_input(event: InputEvent) -> void:
	if not (event is InputEventKey and event.pressed and not event.echo):
		return
	var elements := SpellBook.elements()
	var idx: int = event.keycode - KEY_1
	if idx >= 0 and idx < elements.size():
		queue.push(elements[idx])
	elif event.keycode == KEY_SPACE:
		var spell := queue.resolve()
		var live := enemies.filter(func(e): return is_instance_valid(e) and not e.health.is_dead())
		caster.cast(spell, player.position, live)
