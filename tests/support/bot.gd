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
	if play == null:
		return {"play": null, "state": "locked", "seconds": 0.0, "casts": 0}
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
	# Hold a 100-125 px band from the boss (it chases at 60-90 px/s, the wizard moves at 200),
	# cycling through aoe spells every tick; thralls get the same treatment as elsewhere.
	var recipes := [["fire", "fire"], ["fire", "ice"], ["fire", "nature"], ["fire", "wind"]]
	var guards := [["nature", "nature"], ["water", "light"], ["earth", "water"]]  # invulnerable, regen, shield
	var i := 0
	while play.state == "playing" and not play.boss.health.is_dead() and ctx["t"] < ctx["max"]:
		var r: Array = recipes[i % recipes.size()]
		if play.wizard.health.current < 60:
			r = guards[(i / 7) % guards.size()]  # try a different defensive spell each time
		play.queue_element(r[0])
		play.queue_element(r[1])
		if play.cast() >= 0:
			ctx["casts"] += 1
		var away: Vector2 = play.wizard.position - play.boss.position
		var move := Vector2.ZERO
		if away.length() < 110.0:
			move = _flee_dir(play)
		elif away.length() > 135.0:
			move = -away.normalized()
		_tick(play, move, ctx)
		i += 1


# Of 16 headings, the one that ends furthest from the boss after 80 px while staying on
# walkable ground the whole way. Straight-line fleeing gets the wizard cornered.
static func _flee_dir(play) -> Vector2:
	var best := Vector2.ZERO
	var best_d := -1.0
	for k in 16:
		var dir := Vector2.from_angle(TAU * k / 16.0)
		var ok := true
		for step in [20.0, 40.0, 60.0, 80.0]:
			if not play.grid.can_stand(play.wizard.position + dir * step, 12.0):
				ok = false
				break
		if not ok:
			continue
		var d: float = (play.wizard.position + dir * 80.0).distance_to(play.boss.position)
		if d > best_d:
			best_d = d
			best = dir
	return best
