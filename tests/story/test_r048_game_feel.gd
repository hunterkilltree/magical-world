extends "res://harness/test_case.gd"

const M := preload("res://tests/support/main_fixture.gd")
const SpellBook := preload("res://scripts/core/spell_book.gd")

var main


func before_each() -> void:
	main = M.make(tree)
	main.sim.player.pos = Vector2.ZERO


func after_test() -> void:
	main.free()


func _labels() -> Array:
	return main.view.get_children().filter(func(n): return n is Label3D)


func test_attacks_are_telegraphed_in_red() -> void:
	var th = main.sim.spawn("thrall", Vector2(0, -1.3))
	th.atk_cd = 0
	var bw = main.sim.spawn("bulwark", Vector2(2.2, 0))
	bw.face = atan2(-1.0, 0.0)
	bw.atk_cd = 0
	var hx = main.sim.spawn("hexcaller", Vector2(-8, 0))
	hx.atk_cd = 0
	var seen := {}
	for i in 60:
		M.frames(main, 1)
		for e in [th, bw, hx]:
			var v = main.view.enemy_views.get(e.id)
			if v and v["tele_d"]["m"].albedo_color.a > 0.1:
				seen[e.kind] = v["tele_d"]["m"].albedo_color
	for k in ["thrall", "bulwark", "hexcaller"]:
		assert_true(seen.has(k), "%s telegraph shown" % k)
		if seen.has(k):
			assert_eq(Color(seen[k], 1.0).to_html(false), "ff3b3b", "%s telegraph is red" % k)


func test_hits_flash_and_numbers_take_the_element_colour() -> void:
	var e = main.sim.spawn("hexcaller", Vector2(0, -3))
	e.atk_cd = 99
	M.frames(main, 1, {"aim": Vector2(0, -6), "actions": ["el:fire", "cast"]})
	assert_true(e.flash > 0.1, "hit flash")
	var nums := _labels().filter(func(l): return l.text.is_valid_int())
	assert_true(nums.size() >= 1, "a damage number")
	assert_eq(nums[0].modulate.to_html(false), SpellBook.color("fire").to_html(false), "fire orange")
	main.sim.player.st.wet = 2
	main.sim.player.cd["cast"] = 0
	M.frames(main, 1, {"aim": Vector2(0, -6), "actions": ["el:lightning", "cast"]})
	var mine := _labels().filter(func(l): return l.text == "-7")
	assert_eq(mine.size(), 1, "self-damage number")
	assert_eq(mine[0].modulate.to_html(false), "ff9a3c", "self-damage is orange")


func test_big_blasts_slow_time_and_shake() -> void:
	var e = main.sim.spawn("hexcaller", Vector2(0, -4))
	e.atk_cd = 99
	M.frames(main, 1, {"aim": Vector2(0, -6), "actions": ["el:fire", "el:lightning", "cast"]})
	var shook := false
	var slowed := false
	for i in 30:
		M.frames(main, 1)
		slowed = slowed or main.sim.hitstop > 0
		shook = shook or main.view.shake > 0.3
	assert_true(slowed, "hitstop after the Thunderflare explodes")
	assert_true(shook, "the screen shakes")


func test_aim_previews_take_the_spell_colour() -> void:
	var v = main.view
	M.frames(main, 1, {"aim": Vector2(0, -6), "actions": ["el:fire"]})
	assert_true(v._cone_prev.visible, "cone wedge for a spray")
	assert_eq(Color(v._cone_prev.material_override.albedo_color, 1.0), SpellBook.color("fire"))
	M.frames(main, 1, {"aim": Vector2(0, -6), "actions": ["clear", "el:ice", "el:water"]})
	assert_true(v._ret_area.visible and not v._cone_prev.visible, "area ring")
	assert_true(absf(v._ret_area.scale.x - 3.0) < 0.01, "ring at the spell's radius")
	M.frames(main, 1, {"aim": Vector2(0, -6), "actions": ["clear", "el:earth", "el:earth"]})
	assert_true(v._wall_prev.visible, "wall strip")


func test_status_pips_follow_the_enemy() -> void:
	var e = main.sim.spawn("hexcaller", Vector2(0, -4))
	e.atk_cd = 99
	e.st.burn = 2
	e.st.wet = 0
	M.frames(main, 1)
	assert_true(main.view.enemy_views[e.id]["burn"].emitting, "burning enemies smoulder")
	assert_true(main.view.bar_anchor(e).y > 2.0, "the health bar sits above the head")
