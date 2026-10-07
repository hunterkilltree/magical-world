extends "res://harness/test_case.gd"

const Roster = preload("res://scripts/core/wizard_roster.gd")
const SpellBook = preload("res://scripts/core/spell_book.gd")
const GameSession = preload("res://scripts/core/game_session.gd")
const ZoneGrid = preload("res://scripts/core/zone_grid.gd")
const ZonePlay = preload("res://scripts/core/zone_play.gd")
const Inventory = preload("res://scripts/core/inventory.gd")

const PATH := "user://test_r018_session.json"

var plays: Array = []


func after_test() -> void:
	for p in plays:
		p.free_nodes()
	if FileAccess.file_exists(PATH):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(PATH))


func test_six_wizards_whose_affinities_partition_the_nine_elements() -> void:
	var all: Array = Roster.all()
	assert_eq(all.size(), 6, "six wizards")
	var seen := {}
	for w in all:
		assert_true(w["glow"].begins_with("#") and w["glow"].length() == 7, "%s has a colour" % w["id"])
		assert_true(float(w["boost"]) > 1.0, "%s boost" % w["id"])
		for e in w["affinity"]:
			assert_true(not seen.has(e), "%s claimed twice" % e)
			seen[e] = w["id"]
	for e in SpellBook.elements():
		assert_true(seen.has(e), "%s belongs to a wizard" % e)
	assert_eq(all[0]["id"], "arcane_archmage", "Aldric is the default")


func test_affinity_boosts_only_matching_spells() -> void:
	var brann: Dictionary = Roster.find("ember_pyromancer")
	var vela: Dictionary = Roster.find("rime_cryomancer")
	var supernova := SpellBook.find(["fire", "fire"])
	var thermal := SpellBook.find(["fire", "ice"])
	var tsunami := SpellBook.find(["water", "water"])
	assert_eq(Roster.boost_for(brann, supernova), brann["boost"], "fire for the pyromancer")
	assert_eq(Roster.boost_for(brann, tsunami), 1.0, "water is not his")
	assert_eq(Roster.boost_for(vela, tsunami), vela["boost"], "water for the cryomancer")
	assert_eq(Roster.boost_for(brann, thermal), brann["boost"], "any element in the recipe counts")
	assert_eq(Roster.boost_for(brann, thermal), Roster.boost_for(vela, thermal), "once, not twice")


func test_the_shade_is_locked_until_the_game_is_finished() -> void:
	var s = GameSession.new(PATH)
	s.new_game()
	assert_eq(s.wizard_id, "arcane_archmage", "default wizard")
	assert_eq(s.available_wizards().size(), 5, "five at the start")
	assert_true(not s.select_wizard("void_necromancer"), "shade refused")
	assert_true(s.select_wizard("ember_pyromancer"), "Brann")
	assert_eq(s.wizard_id, "ember_pyromancer", "selected")
	s.inventory.add({"id": "cracked_rune_mended", "kind": "relic"})
	assert_eq(s.available_wizards().size(), 6, "the shade joins after the ending")
	assert_true(s.select_wizard("void_necromancer"), "now allowed")
	assert_true(not s.select_wizard("nobody"), "unknown wizard")


func test_cycling_visits_the_available_wizards_and_wraps() -> void:
	var s = GameSession.new(PATH)
	s.new_game()
	var seen := []
	for i in 5:
		seen.append(s.wizard_id)
		s.cycle_wizard()
	assert_eq(seen.size(), 5, "five steps")
	assert_eq(_unique(seen), 5, "all different")
	assert_true(not "void_necromancer" in seen, "never lands on the locked shade")
	assert_eq(s.wizard_id, seen[0], "wraps back to the first after five")


func _unique(list: Array) -> int:
	var d := {}
	for x in list:
		d[x] = true
	return d.size()


func test_the_choice_is_saved_and_restored() -> void:
	var s = GameSession.new(PATH)
	s.new_game()
	s.select_wizard("storm_conduit")
	s.campaign.complete("tundra")
	s.save()
	var s2 = GameSession.new(PATH)
	assert_true(s2.continue_game(), "continues")
	assert_eq(s2.wizard_id, "storm_conduit", "Kessa again")


func test_the_chosen_wizard_deals_boosted_damage_and_is_drawn_in_their_colour() -> void:
	# Volcano boss has 900 hp: supernova does 850 (Aldric) or 1105 (Brann, fire).
	var results := {}
	for id in ["arcane_archmage", "ember_pyromancer"]:
		var p = ZonePlay.create(ZoneGrid.load_zone("volcano"), Inventory.new(), Roster.find(id))
		plays.append(p)
		p.wizard.position = p.boss.position + Vector2(40, 0)
		p.queue_element("fire")
		p.queue_element("fire")
		p.cast()
		results[id] = p.boss.health.is_dead()
		assert_eq(p.wizard.color, Color(Roster.find(id)["glow"]), "%s colour" % id)
	assert_true(not results["arcane_archmage"], "Aldric leaves the Colossus at 50")
	assert_true(results["ember_pyromancer"], "Brann's fire finishes it")
