# One zone in play: the wizard, thralls, boss, the zone objective and the spell queue.
# Pure logic driven by tick(); the main scene only draws the nodes it exposes.
extends RefCounted

const Player = preload("res://scripts/player.gd")
const Enemy = preload("res://scripts/core/enemy.gd")
const Boss = preload("res://scripts/core/boss.gd")
const ZoneRun = preload("res://scripts/core/zone_run.gd")
const ElementQueue = preload("res://scripts/core/element_queue.gd")
const Caster = preload("res://scripts/core/caster.gd")
const Roster = preload("res://scripts/core/wizard_roster.gd")
const SpellBook = preload("res://scripts/core/spell_book.gd")

const EFFECT_TIME := 0.4
const POPUP_TIME := 1.0
const DAMAGE_COLOR := Color("#fde047")
const HURT_COLOR := Color("#ef4444")
const HEAL_COLOR := Color("#4ade80")

var grid
var inventory
var run
var wizard
var enemies: Array = []
var boss = null
var queue := ElementQueue.new()
var caster := Caster.new()
var wizard_data: Dictionary = {}
var effects: Array = []  # {kind: circle|beam, pos, radius, color, ttl, dir, length}: spell flashes
var popups: Array = []  # {pos, text, color, ttl}: floating damage numbers
var state := "playing"  # playing | complete | dead | failed


static func create(g, inv, wizard_info := {}):
	var p = new()
	p._setup(g, inv, wizard_info)
	return p


func _setup(g, inv, wizard_info: Dictionary) -> void:
	grid = g
	inventory = inv
	wizard_data = wizard_info
	run = ZoneRun.new(g, inv)
	wizard = Player.new()
	wizard.grid = g
	wizard.color = Color(wizard_info.get("glow", "#9c72ff"))
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
	for e in effects:
		e["ttl"] -= delta
	effects = effects.filter(func(e): return e["ttl"] > 0.0)
	for pop in popups:
		pop["ttl"] -= delta
		pop["pos"] = pop["pos"] + Vector2(0, -40.0 * delta)
	popups = popups.filter(func(pop): return pop["ttl"] > 0.0)
	var hp_before: int = wizard.health.current
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
	var lost: int = hp_before - wizard.health.current
	if lost > 0:
		_popup(wizard.position, "-%d" % lost, HURT_COLOR)
	# Zones without a hold rule open their gates once every thrall is dead.
	if not grid.gates_open and not grid.GATE_HOLD.has(grid.id) and not enemies.is_empty() \
			and enemies.all(func(e): return e.health.is_dead()):
		grid.open_gates()
	run.tick(delta)
	run.update(cell)
	_update_state()


func queue_element(element: String) -> bool:
	var ok := queue.push(element)
	_sync_view()
	return ok


# What the queue would cast right now: {name, id, type, complete, ready, cooldown}, or {}.
func queue_preview() -> Dictionary:
	var q: Array = queue.queue
	if q.is_empty():
		return {}
	var spell := SpellBook.find(q) if q.size() == 2 else {}
	if spell.is_empty():
		spell = SpellBook.fallback_bolt(q[0])
	var left := caster.cooldown_left(spell)
	return {"name": spell["name"], "id": spell["id"], "type": spell["type"],
		"complete": q.size() == 2, "ready": left <= 0.0, "cooldown": left}


func _sync_view() -> void:
	wizard.queued_colors = queue.queue.map(func(e): return SpellBook.element_color(e))


func _popup(pos: Vector2, text: String, color: Color) -> void:
	popups.append({"pos": pos, "text": text, "color": color, "ttl": POPUP_TIME})


# Resolves the queue and casts it. Returns targets hit, or -1 if nothing was queued,
# the spell is cooling down, or the zone is over. Fire aoe spells also burn
# destructible tiles in range.
func cast() -> int:
	if state != "playing":
		return -1
	var spell := queue.resolve()
	_sync_view()
	if spell.is_empty():
		return -1
	var targets: Array = enemies.filter(func(e): return not e.health.is_dead())
	if boss != null and not boss.health.is_dead():
		targets.append(boss)
	var boost := Roster.boost_for(wizard_data, spell)
	var before := {}
	for t in targets:
		before[t] = t.health.current
	var hp_before: int = wizard.health.current
	var hits := caster.cast(spell, wizard.position, targets, wizard.facing, wizard, boost)
	var recipe: Array = spell.get("recipe", [spell.get("category", "")])
	if hits >= 0:
		var fx := {"kind": "circle", "pos": wizard.position, "radius": float(spell["radius"]),
			"color": SpellBook.element_color(recipe[0]), "ttl": EFFECT_TIME}
		if spell["type"] == "beam":
			fx["kind"] = "beam"
			fx["dir"] = wizard.facing
			fx["length"] = Caster.BEAM_LENGTH
		effects.append(fx)
		for t in targets:
			var dealt: int = before[t] - t.health.current
			if dealt > 0:
				_popup(t.position, str(dealt), DAMAGE_COLOR)
		var gained: int = wizard.health.current - hp_before
		if gained > 0:
			_popup(wizard.position, "+%d" % gained, HEAL_COLOR)
	if hits >= 0 and spell["type"] == "aoe" and "fire" in recipe:
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
