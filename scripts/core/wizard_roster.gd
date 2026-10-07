# The six playable wizards (data/wizards.json). Each deals bonus damage with spells that
# contain one of its affinity elements.
extends RefCounted

const DATA_PATH := "res://data/wizards.json"

static var _data: Array = []


static func all() -> Array:
	if _data.is_empty():
		var parsed = JSON.parse_string(FileAccess.get_file_as_string(DATA_PATH))
		if parsed is Dictionary:
			_data = parsed["wizards"]
	return _data


static func find(id: String) -> Dictionary:
	for w in all():
		if w["id"] == id:
			return w
	return {}


# Damage multiplier for `wizard` casting `spell` (1.0 when no recipe element is an affinity).
static func boost_for(wizard: Dictionary, spell: Dictionary) -> float:
	if wizard.is_empty():
		return 1.0
	var recipe: Array = spell.get("recipe", [spell.get("category", "")])
	for e in recipe:
		if e in wizard["affinity"]:
			return float(wizard["boost"])
	return 1.0
