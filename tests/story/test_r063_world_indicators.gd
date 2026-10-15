extends "res://harness/test_case.gd"

const M := preload("res://tests/support/main_fixture.gd")

var main


func before_each() -> void:
	main = M.make(tree)
	main.sim.player.pos = Vector2.ZERO


func after_test() -> void:
	main.free()


# Steps until `e` is winding up (or charging), then returns the telegraph's data.
func _until_windup(e, state := "windup") -> Dictionary:
	for i in 240:
		M.frames(main, 1)
		if e.state == state:
			break
	return main.view.enemy_views[e.id]["tele_d"]


func test_thrall_telegraphs_fill_over_the_windup() -> void:
	var th = main.sim.spawn("thrall", Vector2(0, -1.3))
	th.atk_cd = 0
	var T := _until_windup(th)
	assert_eq(th.state, "windup", "the thrall winds up")
	var A: Dictionary = th.T["atk"]
	var checked := 0
	while th.state == "windup":
		var w: float = 1.0 - maxf(0.0, th.state_t) / A["windup"]
		assert_true(absf(T["parts"]["fill"].scale.x - maxf(0.01, w)) < 0.05, "fill %.2f at windup %.2f" % [T["parts"]["fill"].scale.x, w])
		checked += 1
		M.frames(main, 1)
	assert_true(checked >= 10, "checked through the windup")


func test_telegraphs_pulse_just_before_the_strike() -> void:
	var th = main.sim.spawn("thrall", Vector2(0, -1.3))
	th.atk_cd = 0
	var T := _until_windup(th)
	var early := false
	var late := false
	var alphas := {}
	while th.state == "windup":
		if th.state_t > 0.25:
			early = early or T["pulse"]
		elif th.state_t < 0.18:
			late = late or T["pulse"]
			alphas[snappedf(T["m2"].albedo_color.a, 0.05)] = true
		M.frames(main, 1)
	assert_true(not early, "no pulse early in the windup")
	assert_true(late, "a pulse in the last moments")
	assert_true(alphas.size() >= 2, "the edge flickers")


func test_hexcaller_aim_lines_fill_toward_you() -> void:
	var hx = main.sim.spawn("hexcaller", Vector2(0, -7))
	hx.atk_cd = 0
	var T := _until_windup(hx, "charge")
	assert_eq(hx.state, "charge", "the hexcaller charges")
	M.frames(main, 10)
	var A: Dictionary = hx.T["atk"]
	var w: float = 1.0 - maxf(0.0, hx.state_t) / A["windup"]
	var L: float = minf(A["range"], main.sim.player.pos.distance_to(hx.pos))
	assert_true(absf(T["parts"]["fill"].scale.z - L * w) < 0.4, "fill %.2f of %.2f" % [T["parts"]["fill"].scale.z, L * w])


func test_enemy_bars_drain_through_a_ghost() -> void:
	var e = main.sim.spawn("bulwark", Vector2(0, -6))
	e.atk_cd = 99
	M.frames(main, 60)
	e.hp = e.max_hp * 0.3
	M.frames(main, 1)
	assert_true(main.hud.enemy_ghost[e.id] > 0.9, "the ghost lags behind the hit")
	M.frames(main, 120)
	assert_true(absf(main.hud.enemy_ghost[e.id] - 0.3) < 0.03, "and drains to the bar")


func _numbers() -> Array:
	return main.view.get_children().filter(func(n): return n is Label3D and n.text.is_valid_int())


func test_damage_numbers_pop_arc_and_stack() -> void:
	var at := Vector2(2, -4)
	main.view.consume([{"type": "hit", "id": 77, "pos": at, "dmg": 12.0, "el": "fire", "dot": false},
		{"type": "hit", "id": 77, "pos": at, "dmg": 9.0, "el": "fire", "dot": false}], main.sim)
	var nums := _numbers()
	assert_eq(nums.size(), 2, "two numbers")
	if nums.size() != 2:
		return
	assert_true(absf(nums[0].position.y - nums[1].position.y) >= 0.3, "stacked, not overlapping")
	M.frames(main, 1)
	assert_true(nums[0].scale.x > 1.1, "they pop in")
	var x0: float = nums[0].position.x
	M.frames(main, 20)
	assert_true(absf(nums[0].scale.x - 1.0) < 0.05, "and settle")
	assert_true(absf(nums[0].position.x - x0) > 0.1, "drifting sideways as they rise")


func test_spell_callouts_stack() -> void:
	var d = main.view.director
	d.callout(Vector2.ZERO, "Thunderflare", Color.ORANGE)
	d.callout(Vector2.ZERO, "Storm Pool", Color.CYAN)
	M.frames(main, 15)
	var ys: Array = d.callouts.filter(func(c): return is_instance_valid(c)).map(func(c): return c.position.y)
	assert_eq(ys.size(), 2, "two callouts")
	if ys.size() == 2:
		assert_true(absf(ys[0] - ys[1]) >= 0.6, "the older one moves up out of the way (%.2f apart)" % absf(ys[0] - ys[1]))


func test_the_reticle_dims_when_the_spell_cannot_be_cast() -> void:
	var v = main.view
	M.frames(main, 1, {"aim": Vector2(0, -6), "actions": ["el:fire", "el:lightning"]})
	assert_true(not v.ret_dim, "castable: full reticle")
	var bright: float = v._ret_ring.material_override.albedo_color.a
	main.sim.player.energy = 5
	M.frames(main, 1)
	assert_true(v.ret_dim, "too little energy dims it")
	assert_true(v._ret_ring.material_override.albedo_color.a < bright * 0.6, "visibly")
	main.sim.player.energy = 100
	M.frames(main, 1, {"actions": ["clear", "el:ice", "el:water"]})
	M.frames(main, 1, {"aim": Vector2(0, -6), "actions": ["cast"]})
	M.frames(main, 1, {"actions": ["el:ice", "el:water"]})
	assert_true(v.ret_dim, "a recharging area dims it too")
