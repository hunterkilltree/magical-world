extends "res://harness/test_case.gd"

const SpellBook := preload("res://scripts/core/spell_book.gd")
const Roster := preload("res://scripts/core/wizard_roster.gd")

const ROLES := ["destroyer", "controller", "guardian", "trickster", "arcanist"]
const WIZARD_ROLE := {"ember_pyromancer": "destroyer", "rime_cryomancer": "controller", "void_necromancer": "controller",
	"stone_druid": "guardian", "storm_conduit": "trickster", "arcane_archmage": "arcanist"}


func _pairs() -> Array:
	var out := []
	var els: Array = SpellBook.ORDER
	for i in els.size():
		for j in range(i + 1, els.size()):
			out.append([els[i], els[j]])
	return out


func test_every_wizard_has_a_role() -> void:
	for id in Roster.ids():
		assert_eq(SpellBook.role_of(id), WIZARD_ROLE[id], id)
	assert_eq(SpellBook.role_of(""), "", "the court book has no role")
	assert_eq(SpellBook.roles_data()["role_order"], ROLES)


func test_each_role_has_a_spell_for_all_45_pairs() -> void:
	assert_eq(_pairs().size(), 45)
	var ids := {}
	var names := {}
	for r in ROLES:
		var own := SpellBook.role_spells(r)
		assert_eq(own.size(), 45, r)
		for pair in _pairs():
			var k := SpellBook.norm("+".join(PackedStringArray(pair)))
			assert_true(own.has(k), "%s has %s" % [r, k])
			var def: Dictionary = own[k]
			assert_eq(def["role"], r)
			ids[def["id"]] = true
			names[def["name"]] = true
	assert_eq(ids.size(), 225, "225 distinct spell ids")
	assert_true(names.size() >= 200, "names are mostly unique: %d" % names.size())
	assert_true(ids.has("FIRE_WATER_DESTROYER"))


func test_a_role_pair_replaces_the_courts_pair_but_singles_and_doubles_are_shared() -> void:
	for id in WIZARD_ROLE:
		var b := SpellBook.book(id)
		var fw: Dictionary = b["fire+water"]
		assert_eq(fw["role"], WIZARD_ROLE[id], id)
		assert_eq(SpellBook.key_of(b, "fire+water"), "fire+water@" + WIZARD_ROLE[id])
		assert_eq(b["fire+fire"]["name"], SpellBook.book()["fire+fire"]["name"], "%s shares the double" % id)
		assert_eq(b["fire+lightning+wind"]["name"], SpellBook.book()["fire+lightning+wind"]["name"], "%s shares the named triple" % id)
	var names := {}
	for r in ROLES:
		names[SpellBook.role_spells(r)["fire+water"]["name"]] = true
	assert_eq(names.size(), 5, "one mix, five different spells")
	assert_eq(SpellBook.resolve(["fire", "water"])["def"].get("role", ""), "", "the court book is unchanged")


func test_resolve_order() -> void:
	var w := "ember_pyromancer"
	var base := SpellBook.resolve(["fire", "earth"], w)
	assert_eq(base["name"], SpellBook.role_spells("destroyer")["earth+fire"]["name"])
	assert_eq(base["power"], 1.0)
	var rep := SpellBook.resolve(["fire", "earth", "fire"], w)
	assert_eq(rep["key"], "earth+fire@destroyer", "a repeat keeps the role pair")
	assert_true(absf(rep["power"] - 1.3) < 0.001, "+30% per repeat")
	var triple := SpellBook.resolve(["fire", "lightning", "wind"], w)
	assert_eq(triple["name"], "Firestorm", "a named triple wins")
	var rider := SpellBook.resolve(["fire", "earth", "light"], w)
	assert_true(absf(rider["power"] - 1.5) < 0.001, "an unnamed triple rides its best pair x1.5: %s" % rider["power"])
	assert_true(rider["name"].contains("+"), rider["name"])
	var three := SpellBook.resolve(["earth", "earth", "earth"], w)
	assert_true(absf(three["power"] - 1.3) < 0.001, "three of a kind is its double x1.3")


func test_opposites_cancel_only_when_the_role_has_no_spell() -> void:
	var q := ["fire"]
	assert_eq(SpellBook.queue_element(q, "ice", "ember_pyromancer"), "queued", "the Destroyer knows fire+ice")
	assert_eq(q, ["fire", "ice"])
	assert_eq(SpellBook.resolve(q, "ember_pyromancer")["def"]["role"], "destroyer")
	var c := ["fire"]
	assert_eq(SpellBook.queue_element(c, "ice"), "cancel", "the court book still cancels")


func test_damage_cost_and_cooldown_come_from_the_elements_and_shape() -> void:
	for r in ROLES:
		var own := SpellBook.role_spells(r)
		for k in own:
			var def: Dictionary = own[k]
			var els: Array = k.split("+")
			var sp := SpellBook.make_spell(els, def, 1.0, k + "@" + r)
			var shape := SpellBook.shape(def["shape"])
			assert_eq(sp["cost"], roundi(2 * 8 * float(shape["cost"])), k)
			assert_eq(sp["cd"], float(def.get("cd", shape["cd"])), k)
			assert_eq(sp["tier"], 2)
	var bomb := SpellBook.make_spell(["fire", "water"], SpellBook.role_spells("destroyer")["fire+water"], 1.0)
	assert_true(bomb["payload"]["parts"].has("fire"), "fire deals its damage")
	assert_true(not bomb["payload"]["parts"].has("water"), "water deals none")


func test_the_grimoire_lists_the_roles_45_spells() -> void:
	var g := SpellBook.grimoire("stone_druid")
	var own := g.filter(func(e): return e["own"])
	assert_eq(own.size(), 45)
	assert_eq(SpellBook.role("guardian")["name"], "Guardian")
