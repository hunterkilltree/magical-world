# A zone boss: spawns on the zone's boss pad, chases the wizard, and gets faster and
# harder-hitting as its health drops through its phases. Stats live in data/bosses.json.
extends Node2D

signal phase_changed(index: int)
signal damage_blocked

const Health = preload("res://scripts/core/health.gd")
const Mover = preload("res://scripts/core/mover.gd")

const DATA_PATH := "res://data/bosses.json"
const SIGHT := 640.0
const CONTACT_RANGE := 28.0
const CONTACT_COOLDOWN := 1.0

static var _data: Dictionary = {}

var zone_id := ""
var display_name := ""
var fragment := ""
var phases: Array = []
var phase := 0
var final := false  # defeating it plays the ending
var requires: Array = []  # item ids the party must hold before it can be hurt
var inventory = null  # the party inventory, set by ZoneRun.bind_boss
var health := Health.new()
var grid = null
var _hit_cooldown := 0.0


# The boss for this grid's zone placed on its boss pad, or null if the zone has none.
static func spawn_for(g):
	if g == null:
		return null
	if _data.is_empty():
		var parsed = JSON.parse_string(FileAccess.get_file_as_string(DATA_PATH))
		if parsed is Dictionary:
			_data = parsed
	var pads: Array = g.cells_of("B")
	if pads.is_empty():
		return null
	for entry in _data.get("bosses", []):
		if entry["zone"] == g.id:
			var b = new()
			b._init_from(entry)
			b.grid = g
			var sum := Vector2.ZERO
			for c in pads:
				sum += g.cell_center(c)
			b.position = sum / pads.size()
			return b
	return null


func _init_from(entry: Dictionary) -> void:
	zone_id = entry["zone"]
	display_name = entry["name"]
	fragment = entry["fragment"]
	phases = entry["phases"]
	final = entry.get("final", false)
	requires = entry.get("requires", [])
	health.max_health = int(entry["health"])
	health.current = health.max_health


func speed() -> float:
	return float(phases[phase]["speed"])


func contact_damage() -> int:
	return int(phases[phase]["damage"])


# A boss with `requires` is immune unless the bound inventory holds every listed item.
func vulnerable() -> bool:
	for id in requires:
		if inventory == null or not inventory.has_item(id):
			return false
	return true


func take_damage(amount: int) -> void:
	if not vulnerable():
		damage_blocked.emit()
		return
	health.take_damage(amount)
	var lost := 1.0 - float(health.current) / float(health.max_health)
	var idx := mini(phases.size() - 1, int(lost * phases.size()))
	if idx > phase:
		phase = idx
		phase_changed.emit(phase)


# `target` needs `position` and `health`. Dead bosses and dead targets are ignored.
func step(delta: float, target) -> void:
	_hit_cooldown = maxf(0.0, _hit_cooldown - delta)
	if health.is_dead() or target == null or target.health.is_dead():
		return
	var to_target: Vector2 = target.position - position
	var dist := to_target.length()
	if dist > SIGHT:
		return
	if dist <= CONTACT_RANGE:
		if _hit_cooldown == 0.0:
			target.health.take_damage(contact_damage())
			_hit_cooldown = CONTACT_COOLDOWN
		return
	position = Mover.move(grid, position, to_target.normalized() * speed(), delta, 14.0)


func _draw() -> void:
	draw_circle(Vector2.ZERO, 22.0, Color("#6b2020"))
