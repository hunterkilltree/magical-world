extends "res://harness/test_case.gd"

const M := preload("res://tests/support/main_fixture.gd")
const SpellBook := preload("res://scripts/core/spell_book.gd")

var main


func before_each() -> void:
	main = M.make(tree)
	main.sim.player.pos = Vector2.ZERO


func after_test() -> void:
	main.free()


func test_ten_element_keys() -> void:
	var labels := []
	for el in SpellBook.ORDER:
		labels.append("%s  %s" % [SpellBook.element(el)["key"], SpellBook.element(el)["name"]])
	var found := []
	for b in main.hud.find_children("*", "Button", true, false):
		if b.text in labels:
			found.append(b.text)
	assert_eq(found.size(), 10, "ten element buttons: %s" % [found])
	for pair in [[KEY_7, "nature"], [KEY_8, "wind"], [KEY_9, "light"], [KEY_0, "dark"]]:
		var ev := InputEventKey.new()
		ev.physical_keycode = pair[0]
		ev.pressed = true
		main._unhandled_input(ev)
	assert_eq(main._actions, ["el:nature", "el:wind", "el:light", "el:dark"], "keys 7, 8, 9, 0")
	main._physics_process(M.DT)
	assert_eq(main.sim.player.queue, ["nature", "wind"], "7 and 8 queue; 9 (light) is cancelled by 0 (dark)")


func test_new_statuses_show() -> void:
	main.sim.player.st.root = 1.0
	main.sim.player.st.regen = 2.0
	M.frames(main, 1)
	var names := []
	for c in main.hud.status_row.get_children():
		names.append(c.text)
	assert_true(names.has("Rooted") and names.has("Regen"), "statuses %s" % [names])


func test_beams_and_heals_are_drawn() -> void:
	var before: int = main.view.transients.size()
	M.frames(main, 1, {"aim": Vector2(0, -6), "actions": ["el:light", "el:lightning", "cast"]})
	assert_true(main.view.transients.size() > before, "the beam leaves an effect")
	main.sim.player.hp = 50
	main.sim.player.cd["self"] = 0
	M.frames(main, 1, {"actions": ["el:light", "self"]})
	var heals: Array = main.view.get_children().filter(func(n): return n is Label3D and n.text == "+15")
	assert_eq(heals.size(), 1, "a green heal number")
	if heals.size() == 1:
		assert_eq(heals[0].modulate.to_html(false), "7dff8a")


func test_living_and_crystal_walls_have_a_look() -> void:
	M.frames(main, 1, {"aim": Vector2(0, -6), "actions": ["el:earth", "el:nature", "cast"]})
	assert_eq(main.view.wall_views.size(), 5)
	main.sim.player.cd["cast"] = 0
	main.sim.player.shape_cd = {}
	M.frames(main, 1, {"aim": Vector2(6, 0), "actions": ["el:earth", "el:light", "cast"]})
	assert_eq(main.view.wall_views.size(), 10)
	var grimoire_n := SpellBook.grimoire().size()
	M.frames(main, 1, {"actions": ["pause"]})
	assert_eq(main.hud.grimoire_box.get_child_count(), grimoire_n * 3, "the grimoire lists all 74")
