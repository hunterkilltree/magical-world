# One zone in play: the wizard, thralls, boss, the zone objective and the spell queue.
# Pure logic driven by tick(); the main scene only draws the nodes it exposes.
extends RefCounted

const Player = preload("res://scripts/player.gd")
const Enemy = preload("res://scripts/core/enemy.gd")
const Boss = preload("res://scripts/core/boss.gd")
const ZoneRun = preload("res://scripts/core/zone_run.gd")
const ElementQueue = preload("res://scripts/core/element_queue.gd")
const Caster = preload("res://scripts/core/caster.gd")

var grid
var inventory
var run
var wizard
var enemies: Array = []
var boss = null
var queue := ElementQueue.new()
var caster := Caster.new()
var state := "playing"  # playing | complete | dead | failed


static func create(g, inv):
	var p = new()
	p._setup(g, inv)
	return p


func _setup(g, inv) -> void:
	grid = g
	inventory = inv
	run = ZoneRun.new(g, inv)
	wizard = Player.new()
	wizard.grid = g
	wizard.position = g.cell_center(g.cells_of("S")[0])
	for c in g.cells_of("E"):
		var e = Enemy.new()
		e.grid = g
		e.position = g.cell_center(c)
		enemies.append(e)
	boss = Boss.spawn_for(g)
	if boss != null:
		run.bind_boss(boss)


func tick(delta: float, input: Vector2) -> void:
	if state != "playing":
		return
	wizard.step(delta, input)
	var cell: Vector2i = grid.world_to_cell(wizard.position)
	grid.update_gate_hold(cell, delta)
	if grid.tile_at(cell) == "C":
		grid.open_loot(cell, inventory)  # {} once looted
	caster.update(delta)
	for e in enemies:
		e.step(delta, wizard)
	if boss != null:
		boss.step(delta, wizard)
	run.tick(delta)
	run.update(cell)
	_update_state()


func queue_element(element: String) -> bool:
	return queue.push(element)


# Resolves the queue and casts it. Returns targets hit, or -1 if nothing was queued,
# the spell is cooling down, or the zone is over. Fire aoe spells also burn
# destructible tiles in range.
func cast() -> int:
	if state != "playing":
		return -1
	var spell := queue.resolve()
	if spell.is_empty():
		return -1
	var targets: Array = enemies.filter(func(e): return not e.health.is_dead())
	if boss != null and not boss.health.is_dead():
		targets.append(boss)
	var hits := caster.cast(spell, wizard.position, targets)
	if hits >= 0 and spell["type"] == "aoe" and "fire" in spell["recipe"]:
		for c in grid.cells_of("D"):
			if grid.cell_center(c).distance_to(wizard.position) <= float(spell["radius"]):
				grid.damage_tile(c, int(spell["damage"]), "fire")
	_update_state()
	return hits


func _update_state() -> void:
	if state != "playing":
		return
	if run.done:
		state = "complete"
	elif wizard.health.is_dead():
		state = "dead"
	elif run.failed:
		state = "failed"


# Frees the nodes this play created (call once when leaving the zone).
func free_nodes() -> void:
	for n in [wizard, boss] + enemies:
		if n != null and is_instance_valid(n):
			n.free()
	enemies.clear()
	boss = null
	wizard = null
