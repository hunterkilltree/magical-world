extends "res://harness/test_case.gd"

const ZONE_IDS := ["tundra", "pine", "keep", "volcano", "bog", "cavern"]
const BOSS_ZONES := ["keep", "volcano", "cavern"]

var data: Dictionary


func before_each() -> void:
	var parsed = JSON.parse_string(FileAccess.get_file_as_string("res://data/zones.json"))
	assert_true(parsed is Dictionary, "zones.json should parse to a dictionary")
	data = parsed if parsed is Dictionary else {"zones": [], "tile_key": {}}


func test_six_zones_in_order() -> void:
	var ids := []
	for z in data["zones"]:
		ids.append(z["id"])
	assert_eq(ids, ZONE_IDS, "zone ids")


func test_grids_are_26_by_18() -> void:
	for z in data["zones"]:
		assert_eq(z["rows"].size(), 18, "%s row count" % z["id"])
		for r in z["rows"]:
			assert_eq(r.length(), 26, "%s row width" % z["id"])


func test_only_known_tiles() -> void:
	var known: Dictionary = data["tile_key"]
	for z in data["zones"]:
		for r in z["rows"]:
			for i in r.length():
				assert_true(known.has(r[i]), "%s has unknown tile '%s'" % [z["id"], r[i]])


func test_entry_and_enemy_spawn_present() -> void:
	for z in data["zones"]:
		var all: String = "".join(z["rows"])
		assert_true(all.contains("S"), "%s needs an entry" % z["id"])
		assert_true(all.contains("E"), "%s needs an enemy spawn" % z["id"])


func test_boss_pads_only_in_boss_zones() -> void:
	for z in data["zones"]:
		var has_boss: bool = "".join(z["rows"]).contains("B")
		assert_eq(has_boss, z["id"] in BOSS_ZONES, "%s boss pad" % z["id"])
