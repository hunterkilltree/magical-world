# A scripted player that beats zones through GameSession + ZonePlay: walks BFS paths,
# fights thralls with a spell rotation, and kills bosses from range. Used to prove the
# whole game is beatable end to end.
extends RefCounted

const DT := 1.0 / 60.0
const ROTATION := [["fire", "fire"], ["water", "water"], ["fire", "ice"]]
# Tiles to keep off per zone (thin ice, void and bog water hurt or slow; lava has no dry route).
const AVOID := {"tundra": ["~"], "pine": [], "keep": [], "volcano": [], "bog": ["~"], "cavern": ["~"]}


# Plays one zone. Returns {play, state, seconds, casts}. Caller frees play.
static func play_zone(session, id: String, max_seconds := 180.0) -> Dictionary:
	var play = session.enter_zone(id)
	var ctx := {"t": 0.0, "rot": 0, "casts": 0, "max": max_seconds}
	var g = play.grid
	var avoid: Array = AVOID[id]
	match id:
		"tundra":
			var cache: Vector2i = g.cells_of("C")[0]
			_goto(play, cache, avoid, ctx)
			var hold := Vector2i(-1, -1)
			for c in g.reachable_from(g.world_to_cell(play.wizard.position), avoid).keys():
				if c.y < 8 and g.in_hold_area(c):
					hold = c
					break
			_goto(play, hold, avoid, ctx)
			while not g.gates_open and play.state == "playing" and ctx["t"] < ctx["max"]:
				_tick(play, Vector2.ZERO, ctx)
			_goto(play, play.run.exit_cells()[0], avoid, ctx)
		"pine":
			_goto(play, g.cells_of("C")[0], avoid, ctx)
		"bog":
			_goto(play, g.cells_of("C")[0], avoid, ctx)
			_goto(play, g.cells_of("S")[0], avoid, ctx)
		_:
			_fight_boss(play, avoid, ctx)
	return {"play": play, "state": play.state, "seconds": ctx["t"], "casts": ctx["casts"]}


static func _tick(play, input: Vector2, ctx: Dictionary) -> void:
	play.tick(DT, input)
	ctx["t"] += DT
	for e in play.enemies:
		if not e.health.is_dead() and e.position.distance_to(play.wizard.position) < 120.0:
			var r: Array = ROTATION[ctx["rot"] % ROTATION.size()]
			play.queue_element(r[0])
			play.queue_element(r[1])
			if play.cast() >= 0:
				ctx["rot"] += 1
				ctx["casts"] += 1
			break


static func _goto(play, target: Vector2i, avoid: Array, ctx: Dictionary) -> void:
	var g = play.grid
	var path: Array = g.find_path(g.world_to_cell(play.wizard.position), target, avoid)
	for cell in path:
		var goal: Vector2 = g.cell_center(cell)
		var guard := 0
		while play.state == "playing" and play.wizard.position.distance_to(goal) > 3.0 \
				and guard < 600 and ctx["t"] < ctx["max"]:
			_tick(play, (goal - play.wizard.position).normalized(), ctx)
			guard += 1


# Walk to within 150 px of the boss, then cast different spells until it falls.
static func _fight_boss(play, avoid: Array, ctx: Dictionary) -> void:
	var g = play.grid
	var path: Array = g.find_path(g.world_to_cell(play.wizard.position), g.cells_of("B")[0], avoid)
	for cell in path:
		if g.cell_center(cell).distance_to(play.boss.position) <= 150.0:
			_goto(play, cell, avoid, ctx)
			break
	var recipes := [["fire", "fire"], ["fire", "ice"], ["water", "water"], ["fire", "wind"]]
	var i := 0
	while play.state == "playing" and not play.boss.health.is_dead() and ctx["t"] < ctx["max"] and i < 40:
		var r: Array = recipes[i % recipes.size()]
		play.queue_element(r[0])
		play.queue_element(r[1])
		if play.cast() >= 0:
			ctx["casts"] += 1
		_tick(play, Vector2.ZERO, ctx)
		i += 1
