extends "res://harness/test_case.gd"

const M := preload("res://tests/support/main_fixture.gd")
const SpellBook := preload("res://scripts/core/spell_book.gd")

var main


func after_test() -> void:
	main.free()


func _pick(id: String) -> void:
	main = M.make(tree, "menu")
	main.hud.roster_buttons[id].pressed.emit()
	main.hud.start_pressed.emit()
	M.frames(main, 1)


# R-068 after R-071: the book a wizard shows is their role's.
func test_the_menu_names_each_wizards_role_and_signature() -> void:
	main = M.make(tree, "menu")
	for id in main.hud.roster_buttons:
		main.hud.roster_buttons[id].pressed.emit()
		var ro := SpellBook.role(SpellBook.role_of(id))
		var text: String = main.hud.school_label.text
		assert_true(text.contains(ro["name"]), "%s: %s" % [id, text])
		var sig := SpellBook.resolve(ro["signature"], id)
		assert_true(text.contains(sig["name"]), "%s: the card shows %s" % [id, sig["name"]])


func test_picking_a_wizard_switches_the_book() -> void:
	_pick("void_necromancer")
	assert_eq(main.sim.player.book, "void_necromancer")
	M.frames(main, 1, {"actions": ["el:fire", "el:water"]})
	var want := SpellBook.resolve(["fire", "water"], "void_necromancer")
	assert_eq(main.hud.spell_label.text, want["name"], "the preview names the role's own spell")
	assert_true(want["name"] != SpellBook.resolve(["fire", "water"])["name"])
	var ev := M.frames(main, 40, {"actions": ["cast"]})
	var casts := ev.filter(func(e): return e["type"] == "cast")
	assert_eq(casts.size(), 1)
	assert_eq(casts[0]["name"], want["name"])


func test_the_grimoire_lists_the_roles_own_book() -> void:
	_pick("stone_druid")
	M.frames(main, 1, {"actions": ["el:fire", "el:lightning", "cast"]})
	M.frames(main, 40)
	M.frames(main, 1, {"actions": ["pause"]})
	assert_true(main.hud.pause_screen.visible)
	var texts := []
	for c in main.hud.grimoire_box.get_children():
		if c is Label:
			texts.append(c.text)
	var all := "\n".join(PackedStringArray(texts))
	var mine: String = SpellBook.book("stone_druid")["fire+lightning"]["name"]
	assert_true(all.contains(mine), "the Guardian's fire+lightning is listed")
	var other: String = SpellBook.role_spells("destroyer")["fire+lightning"]["name"]
	assert_true(not all.contains(other + "  ("), "the Destroyer's version is not in the Guardian's book")
	var total := SpellBook.grimoire("stone_druid").size()
	assert_eq(main.hud.found_label.text.strip_edges(), "1 / %d cast" % total, "found counts against the role's book")


func test_every_role_spell_draws() -> void:
	# one wizard per role casts all 45 of their pairs through the real view, effects and sound
	main = M.make(tree)
	var drawn := 0
	for id in ["ember_pyromancer", "rime_cryomancer", "stone_druid", "storm_conduit", "arcane_archmage"]:
		main.sim.player.book = id
		for mix in SpellBook.book(id):
			if not "+" in mix or SpellBook.shape(SpellBook.book(id)[mix]["shape"]).is_empty():
				continue
			if mix.split("+").size() != 2 or mix.split("+")[0] == mix.split("+")[1]:
				continue
			var p = main.sim.player
			var guard := 0
			while (not p.wind.is_empty() or p.dash_t > 0 or p.st.stun > 0 or p.st.frozen > 0) and guard < 200:
				M.frames(main, 1, {"aim": Vector2(0, -2)})
				p.st.stun = 0.0
				p.st.frozen = 0.0
				guard += 1
			p.energy = p.max_energy
			p.hp = p.max_hp
			p.cd["cast"] = 0.0
			p.shape_cd.clear()
			p.queue = []
			var actions := []
			for el in mix.split("+"):
				actions.append("el:" + el)
			actions.append("cast")
			var ev := M.frames(main, 1, {"actions": actions, "aim": Vector2(0, -2)})
			var waited := 0
			while not p.wind.is_empty() and waited < 200: # the windup, slowed by hit-stop
				ev.append_array(M.frames(main, 1, {"aim": Vector2(0, -2)}))
				waited += 1
			ev.append_array(M.frames(main, 4, {"aim": Vector2(0, -2)}))
			var got := ev.filter(func(e): return e["type"] == "cast").size()
			drawn += got
	assert_eq(drawn, 225, "five books of 45 pairs")
