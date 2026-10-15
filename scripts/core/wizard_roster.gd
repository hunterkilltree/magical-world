# The six playable wizards (data/wizards.json): name, role, blurb and the look the 3D model is
# built from (robe/trim/glow colours, hat, beard, held prop). The look is cosmetic; what a
# wizard's combos make is their school's (R-067: SpellBook.book(id), data/schools.json).
extends RefCounted

const DATA_PATH := "res://data/wizards.json"
const DEFAULT_ID := "ember_pyromancer"

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


static func ids() -> Array:
	var out := []
	for w in all():
		out.append(w["id"])
	return out
