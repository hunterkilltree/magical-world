extends "res://harness/test_case.gd"

const M := preload("res://tests/support/main_fixture.gd")
const SpellBook := preload("res://scripts/core/spell_book.gd")

var main


func after_test() -> void:
	main.free()


func test_the_menu_picks_a_wizard_and_starts() -> void:
	main = M.make(tree, "menu")
	assert_true(main.hud.menu_screen.visible, "menu shown")
	assert_eq(main.hud.roster_buttons.size(), 6, "six wizards")
	main.hud.roster_buttons["storm_conduit"].pressed.emit()
	assert_eq(main.wizard_id, "storm_conduit")
	assert_eq(main.view.wizard.spec["id"], "storm_conduit", "the model changes")
	main.hud.start_pressed.emit()
	M.frames(main, 1)
	assert_eq(main.sim.mode, "play")
	assert_true(not main.hud.menu_screen.visible and main.hud.hud.visible, "HUD shown")
	assert_eq(main.hud.who_name.text.strip_edges(), "Kessa Voltmark")


func test_the_start_button_stands_in_the_middle_of_the_screen() -> void:
	main = M.make(tree, "menu")
	var b: Button = main.hud.start_button
	assert_eq(b.get_parent(), main.hud.menu_screen, "on the screen itself, not at the foot of the wizard card")
	for a in [b.anchor_left, b.anchor_right, b.anchor_top, b.anchor_bottom]:
		assert_eq(a, 0.5, "anchored at the centre")
	assert_eq(b.grow_horizontal, Control.GROW_DIRECTION_BOTH)
	assert_eq(b.grow_vertical, Control.GROW_DIRECTION_BOTH)
	assert_eq(b.text, "Enter the court")
	b.pressed.emit()
	M.frames(main, 1)
	assert_eq(main.sim.mode, "play", "it starts the run")


func test_the_hud_shows_queue_spell_and_numbers() -> void:
	main = M.make(tree)
	M.frames(main, 1, {"actions": ["el:fire", "el:lightning"]})
	var h = main.hud
	assert_eq(h.slots[0]["label"].text, "Fire")
	assert_eq(h.slots[1]["label"].text, "Lightning")
	assert_eq(h.slots[2]["label"].text, "")
	assert_eq(h.spell_label.text, "Thunderflare")
	assert_eq(h.shape_label.text, "Bolt")
	assert_eq(h.cost_label.text, "16 energy")
	main.sim.player.hp = 37.2
	M.frames(main, 1)
	assert_eq(h.hp_text.text, "38")
	assert_eq(h.stat_labels["Kills"].text, "0")
	M.frames(main, 1, {"actions": ["el:arcane", "el:water"]})
	assert_true(h.toast.text.begins_with("Queue holds 3"), "toast: %s" % h.toast.text)
	M.frames(main, 1, {"actions": ["cast"]})
	assert_true(h.tiles["cast"].value < 1.0, "the cast tile empties while on cooldown")


func test_statuses_and_self_damage_are_named() -> void:
	main = M.make(tree)
	main.sim.player.st.wet = 3
	M.frames(main, 1, {"actions": ["el:lightning", "cast"]})
	var names := []
	for c in main.hud.status_row.get_children():
		names.append(c.text)
	assert_true(names.has("Shocked"), "statuses %s" % [names])
	assert_true(main.hud.toast.text.contains("Cast lightning while wet"), main.hud.toast.text)


func test_pause_shows_the_grimoire() -> void:
	main = M.make(tree)
	M.frames(main, 1, {"actions": ["el:earth", "el:earth", "cast"]})
	M.frames(main, 1, {"actions": ["pause"]})
	assert_eq(main.sim.mode, "paused")
	assert_true(main.hud.pause_screen.visible)
	assert_eq(main.hud.found_label.text.strip_edges(), "1 / %d cast" % SpellBook.grimoire().size())
	main.hud.resume_pressed.emit()
	assert_eq(main.sim.mode, "play")


func test_death_screen_and_restart() -> void:
	main = M.make(tree)
	main.sim.kills = 7
	main.sim.player.hp = 0
	M.frames(main, 80)
	assert_eq(main.sim.mode, "dead")
	assert_true(main.hud.dead_screen.visible, "death screen after a beat")
	assert_eq(main.hud.dead_kicker.text, "Fallen on wave 0")
	var texts := []
	for c in main.hud.dead_stats.get_children():
		texts.append(c.text)
	assert_true(texts.has("Kills") and texts.has("7"), "stats %s" % [texts])
	assert_true(texts.has("Self-inflicted") and texts.has("Spells found"))
	var ev := InputEventKey.new()
	ev.physical_keycode = KEY_R
	ev.pressed = true
	main._unhandled_input(ev)
	assert_eq(main.sim.mode, "play", "R restarts")
	assert_eq(main.sim.player.hp, 100.0)
