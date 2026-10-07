# Applies spells and enforces per-spell cooldowns. A target is anything with `position` and
# `take_damage(int)`; it may also have `root(seconds)` and a `grid`. `actor` has `health`.
#
#   aoe         every target within radius
#   projectile  nearest target within RANGE, 50% splash within radius of the impact
#   beam        every target along `aim` up to BEAM_LENGTH and within radius of the line
#   vortex      targets within radius are pulled PULL px toward the centre, then damaged
#   summon      targets within radius are damaged and rooted for the spell's duration
#   barrier     a shield for the actor worth the spell's damage, lasting its duration
#   buff        per spell: rainbow_mist regenerates, crystal_garden shields, world_tree
#               makes the actor invulnerable
# `boost` (wizard affinity) scales the spell's damage. death_forest also steals health.
extends RefCounted

const Mover = preload("res://scripts/core/mover.gd")

const RANGE := 400.0
const BEAM_LENGTH := 480.0
const SPLASH := 0.5
const PULL := 64.0
const LIFESTEAL := {"death_forest": 0.3}
const REGEN_RATES := {"rainbow_mist": 120.0}
const GLOBAL_COOLDOWN := 0.8  # no two casts closer than this: queueing two elements takes time

var _cooldowns: Dictionary = {}  # spell id -> seconds remaining
var _global := 0.0


func update(delta: float) -> void:
	_global = maxf(0.0, _global - delta)
	for k in _cooldowns.keys():
		_cooldowns[k] -= delta
		if _cooldowns[k] <= 0.0:
			_cooldowns.erase(k)


# Seconds until `spell` can be cast again (its own cooldown or the global one, whichever is longer).
func cooldown_left(spell: Dictionary) -> float:
	return maxf(_cooldowns.get(spell["id"], 0.0), _global)


func can_cast(spell: Dictionary) -> bool:
	return not _cooldowns.has(spell["id"])


# Returns the number of targets hit (0 for barriers and buffs), or -1 if the spell or the
# global cooldown is still running.
func cast(spell: Dictionary, origin: Vector2, targets: Array, aim := Vector2.RIGHT, actor = null, boost := 1.0) -> int:
	if spell.is_empty() or _global > 0.0 or not can_cast(spell):
		return -1
	_cooldowns[spell["id"]] = float(spell["cooldown"])
	_global = GLOBAL_COOLDOWN
	var damage := int(round(float(spell["damage"]) * boost))
	var radius := float(spell["radius"])
	var dealt := 0
	var hits := 0
	match spell["type"]:
		"aoe":
			for t in targets:
				if t.position.distance_to(origin) <= radius:
					t.take_damage(damage)
					dealt += damage
					hits += 1
		"projectile":
			var impact = null
			for t in targets:
				var d: float = t.position.distance_to(origin)
				if d <= RANGE and (impact == null or d < impact.position.distance_to(origin)):
					impact = t
			if impact != null:
				var at: Vector2 = impact.position
				for t in targets:
					if t == impact:
						impact.take_damage(damage)
						dealt += damage
						hits += 1
					elif t.position.distance_to(at) <= radius:
						t.take_damage(int(round(damage * SPLASH)))
						dealt += int(round(damage * SPLASH))
						hits += 1
		"beam":
			var dir := aim.normalized()
			for t in targets:
				var rel: Vector2 = t.position - origin
				var along := rel.dot(dir)
				if along >= 0.0 and along <= BEAM_LENGTH and absf(rel.cross(dir)) <= radius:
					t.take_damage(damage)
					dealt += damage
					hits += 1
		"vortex":
			for t in targets:
				if t.position.distance_to(origin) <= radius:
					var to_centre: Vector2 = origin - t.position
					var step := minf(to_centre.length(), PULL)
					if step > 0.0:
						t.position = Mover.move(t.get("grid"), t.position, to_centre.normalized() * step, 1.0)
					t.take_damage(damage)
					dealt += damage
					hits += 1
		"summon":
			for t in targets:
				if t.position.distance_to(origin) <= radius:
					t.take_damage(damage)
					if t.has_method("root"):
						t.root(float(spell["duration"]))
					dealt += damage
					hits += 1
		"barrier":
			if actor != null:
				actor.health.add_shield(damage, float(spell["duration"]))
		"buff":
			_buff(spell, damage, actor)
	if LIFESTEAL.has(spell["id"]) and actor != null and dealt > 0:
		actor.health.heal(int(round(dealt * LIFESTEAL[spell["id"]])))
	return hits


func _buff(spell: Dictionary, damage: int, actor) -> void:
	if actor == null:
		return
	var duration := float(spell["duration"])
	match spell["id"]:
		"rainbow_mist":
			actor.health.add_regen(REGEN_RATES["rainbow_mist"], duration)
		"crystal_garden":
			actor.health.add_shield(damage, duration)
		"world_tree":
			actor.health.make_invulnerable(duration)
