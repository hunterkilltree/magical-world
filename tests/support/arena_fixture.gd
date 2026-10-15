# Shared helpers for ArenaSim tests: a quiet arena (no waves, optionally no props) and ticking.
extends RefCounted

const ArenaSim := preload("res://scripts/core/arena_sim.gd")
const SpellBook := preload("res://scripts/core/spell_book.gd")
const DT := 1.0 / 60.0


# A sim in play mode with the first wave held back, casting from the court book (R-067).
# `bare` removes puddles, brush and barrels.
static func make(bare := true, seed_value := 7) -> ArenaSim:
	var s := ArenaSim.new("ember_pyromancer", seed_value)
	s.player.book = ""
	s.mode = "play"
	s.wave_t = 1e9
	if bare:
		s.puddles = []
		s.brush = []
		s.barrels = []
	return s


static func input(actions := [], move := Vector2.ZERO, aim = null) -> Dictionary:
	return {"move": move, "aim": aim if aim != null else Vector2(0, -10), "actions": actions}


# Steps `seconds` of game time, sending `actions` on the first tick only. Returns every event.
static func run(s: ArenaSim, seconds: float, actions := [], move := Vector2.ZERO, aim = null) -> Array:
	var out := []
	var n := maxi(1, roundi(seconds / DT))
	for i in n:
		out.append_array(s.step(input(actions if i == 0 else [], move, aim), DT))
	return out


# Queues `els` and casts at `aim` in one tick.
static func cast(s: ArenaSim, els: Array, aim: Vector2, how := "cast") -> Array:
	var actions := []
	for e in els:
		actions.append("el:" + e)
	actions.append(how)
	return s.step(input(actions, Vector2.ZERO, aim), DT)


static func of_type(events: Array, type: String) -> Array:
	return events.filter(func(e): return e["type"] == type)


static func tags(events: Array) -> Array:
	return of_type(events, "tag").map(func(e): return e["tag"])
