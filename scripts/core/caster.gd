# Applies spells to targets and enforces per-spell cooldowns.
# A target is anything with `position` and `take_damage(int)`.
extends RefCounted

var _cooldowns: Dictionary = {}  # spell id -> seconds remaining


func update(delta: float) -> void:
	for k in _cooldowns.keys():
		_cooldowns[k] -= delta
		if _cooldowns[k] <= 0.0:
			_cooldowns.erase(k)


func can_cast(spell: Dictionary) -> bool:
	return not _cooldowns.has(spell["id"])


# Returns the number of targets hit, or -1 if the spell is still on cooldown.
# Only aoe spells damage here (other types arrive with R-020); the cooldown still starts.
func cast(spell: Dictionary, origin: Vector2, targets: Array) -> int:
	if spell.is_empty() or not can_cast(spell):
		return -1
	_cooldowns[spell["id"]] = float(spell["cooldown"])
	var hits := 0
	if spell["type"] == "aoe":
		for t in targets:
			if t.position.distance_to(origin) <= float(spell["radius"]):
				t.take_damage(int(spell["damage"]))
				hits += 1
	return hits
