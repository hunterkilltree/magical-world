# Spell lookup from data/spells.json. Recipes are ordered (water+earth != earth+water).
extends RefCounted

const DATA_PATH := "res://data/spells.json"

static var _data: Dictionary = {}


static func _load() -> void:
	if _data.is_empty():
		var parsed = JSON.parse_string(FileAccess.get_file_as_string(DATA_PATH))
		if parsed is Dictionary:
			_data = parsed


static func all() -> Array:
	_load()
	return _data.get("spells", [])


static func elements() -> Array:
	_load()
	return _data.get("elements", [])


static func find(recipe: Array) -> Dictionary:
	_load()
	for s in _data.get("spells", []):
		if s["recipe"] == recipe:
			return s
	return {}


static func fallback_bolt(element: String) -> Dictionary:
	return {"id": "bolt_" + element, "name": element.capitalize() + " Bolt", "type": "projectile",
		"category": element, "damage": 60, "radius": 24, "duration": 0.0, "cooldown": 0.5,
		"fallback": true}
