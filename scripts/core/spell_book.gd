# Spell lookup from data/spells.json. Recipes are ordered (water+earth != earth+water).
extends RefCounted

const DATA_PATH := "res://data/spells.json"

const ELEMENT_COLORS := {"fire": "#f97316", "water": "#06b6d4", "earth": "#a16207", "nature": "#22c55e",
	"lightning": "#eab308", "ice": "#38bdf8", "wind": "#14b8a6", "light": "#fbbf24", "dark": "#6b21a8"}

static var _data: Dictionary = {}


static func _load() -> void:
	if _data.is_empty():
		var parsed = JSON.parse_string(FileAccess.get_file_as_string(DATA_PATH))
		if parsed is Dictionary:
			_data = parsed


static func element_color(element: String) -> Color:
	return Color(ELEMENT_COLORS.get(element, "#ffffff"))


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
