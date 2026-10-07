extends "res://harness/test_case.gd"

const TYPES := ["aoe", "beam", "projectile", "vortex", "barrier", "summon", "buff"]

var data: Dictionary


func before_each() -> void:
	var parsed = JSON.parse_string(FileAccess.get_file_as_string("res://data/spells.json"))
	assert_true(parsed is Dictionary, "spells.json should parse to a dictionary")
	data = parsed if parsed is Dictionary else {"elements": [], "spells": []}


func test_nine_elements() -> void:
	assert_eq(data["elements"].size(), 9, "element count")


func test_spell_ids_unique() -> void:
	var seen := {}
	for s in data["spells"]:
		assert_true(not seen.has(s["id"]), "duplicate id %s" % s["id"])
		seen[s["id"]] = true
	assert_true(seen.size() > 0, "no spells loaded")


func test_recipes_use_known_elements_and_are_unique() -> void:
	var seen := {}
	for s in data["spells"]:
		assert_eq(s["recipe"].size(), 2, "%s recipe length" % s["id"])
		for e in s["recipe"]:
			assert_true(e in data["elements"], "%s uses unknown element %s" % [s["id"], e])
		var key: String = "+".join(s["recipe"])
		assert_true(not seen.has(key), "recipe %s used twice" % key)
		seen[key] = true


func test_spell_types_known() -> void:
	for s in data["spells"]:
		assert_true(s["type"] in TYPES, "%s has unknown type %s" % [s["id"], s["type"]])
