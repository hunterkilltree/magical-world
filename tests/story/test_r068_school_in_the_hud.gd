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


func test_the_menu_names_each_wizards_school() -> void:
	main = M.make(tree, "menu")
	for id in main.hud.roster_buttons:
		main.hud.roster_buttons[id].pressed.emit()
		var sc := SpellBook.school(id)
		var text: String = main.hud.school_label.text
		assert_true(text.contains(sc["name"]), "%s: %s" % [id, text])
		assert_eq(sc["signature"].size(), 3, id)
		for mix in sc["signature"]:
			assert_true(text.contains(sc["combos"][mix]["name"]), "%s: the card shows %s" % [id, sc["combos"][mix]["name"]])


func test_picking_a_wizard_switches_the_book() -> void:
	_pick("void_necromancer")
	assert_eq(main.sim.player.book, "void_necromancer")
	M.frames(main, 1, {"actions": ["el:fire", "el:water"]})
	var want := SpellBook.resolve(["fire", "water"], "void_necromancer")
	assert_eq(main.hud.spell_label.text, want["name"], "the preview names the wizard's own spell")
	assert_true(want["name"] != SpellBook.resolve(["fire", "water"])["name"])
	var ev := M.frames(main, 1, {"actions": ["cast"]})
	var casts := ev.filter(func(e): return e["type"] == "cast")
	assert_eq(casts.size(), 1)
	assert_eq(casts[0]["name"], want["name"])


func test_the_grimoire_lists_the_wizards_own_book() -> void:
	_pick("stone_druid")
	M.frames(main, 1, {"actions": ["el:fire", "el:lightning", "cast"]})
	M.frames(main, 1, {"actions": ["pause"]})
	assert_true(main.hud.pause_screen.visible)
	var texts := []
	for c in main.hud.grimoire_box.get_children():
		if c is Label:
			texts.append(c.text)
	var all := "\n".join(PackedStringArray(texts))
	var mine: String = SpellBook.book("stone_druid")["fire+lightning"]["name"]
	assert_true(all.contains(mine), "Morrow's fire+lightning is listed")
	assert_true(not all.contains("Thunderflare  ("), "Brann's Thunderflare is not in Morrow's book")
	assert_true(all.contains("Stone Rampart"), "the court spells Morrow keeps are listed")
	assert_eq(main.hud.found_label.text.strip_edges(), "1 / 80 cast", "found counts against his book")


func test_every_school_spell_draws() -> void:
	# each wizard casts all 70 of their combos through the real view, effects and sound
	main = M.make(tree)
	var drawn := 0
	for id in SpellBook.schools():
		main.sim.player.book = id
		for mix in SpellBook.book(id):
			if not "+" in mix:
				continue
			var p = main.sim.player
			p.energy = p.max_energy
			p.cd["cast"] = 0.0
			p.shape_cd.clear()
			var actions := []
			for el in mix.split("+"):
				actions.append("el:" + el)
			actions.append("cast")
			var ev := M.frames(main, 1, {"actions": actions, "aim": Vector2(0, -2)})
			drawn += ev.filter(func(e): return e["type"] == "cast").size()
			M.frames(main, 4)
	assert_eq(drawn, 420, "six books of 70")
