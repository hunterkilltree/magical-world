# Enemy stats (data/enemies.json) and wave composition. The AI behaviour lives in
# arena_sim.gd, keyed by these ids. Port of the prototype's enemies.js.
extends RefCounted

const DATA_PATH := "res://data/enemies.json"

static var _data: Dictionary = {}


static func data() -> Dictionary:
	if _data.is_empty():
		var parsed = JSON.parse_string(FileAccess.get_file_as_string(DATA_PATH))
		if parsed is Dictionary:
			_data = parsed
	return _data


static func type(kind: String) -> Dictionary:
	return data()["types"].get(kind, {})


# Wave n: thralls 3 + 1.5n, hexcallers from wave 2, bulwarks from wave 3, shuffled with `rng`.
# Returns {list, hp_scale, speed_scale, interval}.
static func wave_roster(n: int, rng: RandomNumberGenerator) -> Dictionary:
	var list := []
	for i in 3 + floori(n * 1.5):
		list.append("thrall")
	if n >= 2:
		for i in 1 + floori((n - 2) * 0.7):
			list.append("hexcaller")
	if n >= 3:
		for i in 1 + floori((n - 3) * 0.5):
			list.append("bulwark")
	for i in range(list.size() - 1, 0, -1):
		var j := rng.randi_range(0, i)
		var tmp = list[i]
		list[i] = list[j]
		list[j] = tmp
	return {
		"list": list,
		"hp_scale": 1.0 + 0.12 * (n - 1),
		"speed_scale": 1.0 + minf(0.25, 0.03 * (n - 1)),
		"interval": maxf(0.28, 0.75 - n * 0.05),
	}
