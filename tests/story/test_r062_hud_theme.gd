extends "res://harness/test_case.gd"

const M := preload("res://tests/support/main_fixture.gd")
const SpellBook := preload("res://scripts/core/spell_book.gd")

var main
var h


func before_each() -> void:
	main = M.make(tree)
	main.sim.player.pos = Vector2.ZERO
	h = main.hud


func after_test() -> void:
	main.free()


func test_one_theme_dresses_every_panel_and_button() -> void:
	assert_true(h.root.theme != null, "the HUD root carries a theme")
	# ours only: engine-internal children (a ScrollContainer's focus box) keep their own look
	var panels: Array = h.root.find_children("*", "PanelContainer", true, false).filter(
		func(p): return p.theme_type_variation == "" and p.get_parent().get_children(false).has(p))
	assert_true(panels.size() >= 5, "HUD, menu, pause and death panels")
	for p in panels:
		assert_true(not p.has_theme_stylebox_override("panel"), "%s uses the theme" % p.get_path())
	for screen in [h.menu_screen, h.pause_screen, h.dead_screen]:
		for b in screen.find_children("*", "Button", true, false):
			assert_true(not b.has_theme_stylebox_override("normal"), "%s button uses the theme" % b.text)


func test_bars_drain_through_a_ghost() -> void:
	M.frames(main, 1)
	main.sim.player.hp = 40
	M.frames(main, 1)
	assert_true(absf(h.hp_bar.value - 0.4) < 0.01, "health drops at once")
	assert_true(h.hp_ghost.value > 0.9, "the ghost still shows what was lost")
	M.frames(main, 120)
	assert_true(absf(h.hp_ghost.value - h.hp_bar.value) < 0.02, "and drains down to it")


func test_low_health_pulses() -> void:
	main.sim.player.hp = 20
	var seen := {}
	for i in 40:
		M.frames(main, 1)
		seen[snappedf(h.hp_bar.modulate.r, 0.05)] = true
	assert_true(seen.size() >= 3, "the health bar pulses below 30%")


func test_the_energy_bar_previews_the_cost() -> void:
	M.frames(main, 1, {"actions": ["el:fire", "el:lightning"]})
	assert_true(h.cost_mark.visible, "a cost segment on the energy bar")
	var w: float = h.en_bar.custom_minimum_size.x
	assert_true(absf(h.cost_mark.size.x - w * 0.16) < 1.0, "16 energy wide (%.1f)" % h.cost_mark.size.x)
	assert_true(absf(h.cost_mark.position.x - w * 0.84) < 1.0, "ending at the current energy")
	M.frames(main, 1, {"actions": ["clear"]})
	assert_true(not h.cost_mark.visible, "gone with an empty queue")


func test_queue_orbs_pop_shake_and_glow() -> void:
	M.frames(main, 1, {"actions": ["el:fire"]})
	assert_true(h.slots[0]["panel"].scale.x > 1.1, "a queued element pops in")
	M.frames(main, 30)
	assert_true(absf(h.slots[0]["panel"].scale.x - 1.0) < 0.01, "and settles")
	M.frames(main, 1, {"actions": ["el:lightning"]})
	var c: Color = SpellBook.resolve(["fire", "lightning"])["color"]
	assert_true(h.slots[0]["style"].shadow_size > 0, "a combo glows")
	assert_eq(Color(h.slots[0]["style"].shadow_color, 1.0).to_html(false), c.to_html(false), "in the combo's colour")
	M.frames(main, 1, {"actions": ["clear", "el:fire", "el:ice"]})
	var shook := false
	for i in 6:
		shook = shook or absf(h.slots[0]["panel"].rotation) > 0.01
		M.frames(main, 1)
	assert_true(shook, "cancelling shakes the queue")


func test_element_keys_flash_when_pressed() -> void:
	var before: float = h.keycaps["water"]["style"].bg_color.a
	M.frames(main, 1, {"actions": ["el:water"]})
	assert_true(h.keycaps["water"]["style"].bg_color.a > before + 0.2, "the water key lights up")
	M.frames(main, 30)
	assert_true(absf(h.keycaps["water"]["style"].bg_color.a - before) < 0.02, "and dims again")


func test_cooldowns_sweep_radially() -> void:
	assert_true(not (h.tiles["dodge"] is ProgressBar), "a radial tile, not a bar")
	M.frames(main, 1, {"move": Vector2(1, 0), "actions": ["dodge"]})
	M.frames(main, 1)
	var p = main.sim.player
	assert_true(p.cd["dodge"] > 0, "dodge is recharging")
	assert_true(absf(h.tiles["dodge"].value - (1.0 - p.cd["dodge"] / p.cd_max["dodge"])) < 0.02, "sweep = time recharged")


func test_the_wave_banner_and_toasts_animate() -> void:
	h.update(main.sim, [{"type": "wave", "n": 2}], 1.0 / 60.0)
	assert_eq(h.banner.text, "Wave 2")
	assert_true(h.banner.scale.x > 1.15, "the banner lands big")
	for i in 30:
		h.update(main.sim, [], 1.0 / 60.0)
	assert_true(absf(h.banner.scale.x - 1.0) < 0.02, "and settles")
	h.say("Not enough energy")
	h.update(main.sim, [], 1.0 / 60.0)
	assert_true(h.toast.scale.x > 1.05, "toasts pop")


func test_death_stats_are_revealed_in_turn() -> void:
	main.sim.player.hp = 0
	var first := -1.0
	var last := -1.0
	for i in 160:
		M.frames(main, 1)
		if h.dead_screen.visible and h.dead_stats.get_child_count() >= 12:
			var rows: Array = h.dead_stats.get_children()
			if first < 0 and rows[1].modulate.a > 0.99:
				first = i
			if last < 0 and rows[11].modulate.a > 0.99:
				last = i
	assert_true(first >= 0 and last >= 0, "every stat shows")
	assert_true(last - first >= 20, "one after another, not all at once (%d frames apart)" % (last - first))
