# A simple player for ArenaSim: kites away from enemies, soaks them with a Torrent and follows
# with an Arc (conducted x2), throws Thunderflares at range, and dodges red telegraphs.
# It sends the same input a human does, so it only proves what the real rules allow.
extends RefCounted

const ArenaSim := preload("res://scripts/core/arena_sim.gd")

var s: ArenaSim
var _next := "water"


func _init(sim: ArenaSim) -> void:
	s = sim


func input() -> Dictionary:
	var p := s.player
	var foes := s.live()
	var actions := []
	var move := Vector2.ZERO
	var aim := p.pos + p.f
	if foes.is_empty():
		return {"move": -p.pos.normalized() if p.pos.length() > 3 else Vector2.ZERO, "aim": aim, "actions": actions}
	var near = foes[0]
	for e in foes:
		if e.pos.distance_to(p.pos) < near.pos.distance_to(p.pos):
			near = e
	var dist: float = near.pos.distance_to(p.pos)
	aim = near.pos
	# Kite: away from everyone (closer weighs more), sideways, and back toward the centre.
	for e in foes:
		var v: Vector2 = p.pos - e.pos
		var d := maxf(0.5, v.length())
		move += v / d / d * (3.0 if e.kind == "bulwark" else 1.0)
	move = move.normalized() + move.normalized().orthogonal() * 0.6
	# Keep out of puddles (wet + lightning hurts you), burning brush and barrels.
	for o in s.puddles + s.brush + s.barrels:
		var v: Vector2 = p.pos - o.pos
		var bad: bool = o.type == "puddle" or o.state == "burning" or (o.type == "barrel" and o.alive)
		if bad and v.length() < o.r + 1.5:
			move += v.normalized() * 1.5
	if p.pos.length() > 8.5:
		move += -p.pos.normalized() * (p.pos.length() - 8.5)
	if _danger():
		actions.append("dodge")
	if p.cd["cast"] <= 0:
		var wet := p.st.wet > 0
		if dist < 4.5:
			var el := "earth" if wet and _next == "lightning" else _next
			actions.append_array(["el:" + el, "cast"])
			_next = "lightning" if _next == "water" else "water"
		elif p.energy > 40 and dist > 5.0:
			actions.append_array(["el:fire", "el:arcane" if wet else "el:lightning", "cast"])
		elif p.energy > 15:
			actions.append_array(["el:arcane", "cast"])
	return {"move": move, "aim": aim, "actions": actions}


func _danger() -> bool:
	var p := s.player
	if p.cd["dodge"] > 0:
		return false
	for e in s.live():
		var d: float = e.pos.distance_to(p.pos)
		if e.kind == "thrall" and e.state == "windup" and e.state_t < 0.2 and d < 2.6:
			return true
		if e.kind == "bulwark" and e.state == "windup" and e.state_t < 0.25 and e.slam.distance_to(p.pos) < 2.8:
			return true
	for b in s.shots:
		if b.owner == "enemy" and b.pos.distance_to(p.pos) < 1.4:
			return true
	return false
