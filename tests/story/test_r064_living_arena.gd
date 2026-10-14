extends "res://harness/test_case.gd"

const M := preload("res://tests/support/main_fixture.gd")
const Particles := preload("res://scripts/vfx/vfx_particles.gd")

var main


func before_each() -> void:
	main = M.make(tree)
	main.sim.player.pos = Vector2.ZERO


func after_test() -> void:
	main.free()


func test_a_night_sky_and_fog() -> void:
	var env: Environment = main.view.env
	assert_eq(env.background_mode, Environment.BG_SKY, "a sky, not a flat colour")
	assert_true(env.sky != null and env.sky.sky_material is ProceduralSkyMaterial, "a gradient night sky")
	assert_true(env.fog_enabled, "light fog hides the edge of the world")


func test_braziers_flicker_smoothly_and_irregularly() -> void:
	var L: OmniLight3D = main.view.braziers[0]["light"]
	var vals := []
	for i in 120:
		M.frames(main, 1)
		vals.append(L.light_energy)
	var jump := 0.0
	var seen := {}
	for i in range(1, vals.size()):
		jump = maxf(jump, absf(vals[i] - vals[i - 1]))
		seen[snappedf(vals[i], 0.005)] = true
	assert_true(vals.max() - vals.min() > 0.12, "the flame breathes (%.2f range)" % (vals.max() - vals.min()))
	assert_true(jump < 0.08, "smoothly, not frame-to-frame noise (biggest step %.3f)" % jump)
	assert_true(seen.size() >= 30, "without repeating itself")


func test_embers_rise_and_dust_drifts_within_budget() -> void:
	var p = main.view.director.particles
	p.trace = []
	M.frames(main, 600)
	var embers: Array = p.trace.filter(func(s): return s["kind"] == "spark" and s["name"] == "fire")
	var motes: Array = p.trace.filter(func(s): return s["kind"] == "sprite" and s["name"] == "dust")
	p.trace = null
	assert_true(embers.size() >= 20, "braziers shed embers (%d)" % embers.size())
	assert_true(embers.any(func(s): return Vector2(s["vel"].x, s["vel"].z).length() > 1.5), "a few drift off sideways")
	assert_true(motes.size() >= 15, "dust drifts over the court (%d)" % motes.size())
	assert_true(p._s_live.size() < Particles.SMOKE_MAX / 10, "sprites within a tenth of the pool (%d)" % p._s_live.size())
	assert_true(p._k_live.size() < Particles.SPARK_MAX / 10, "sparks within a tenth of the pool (%d)" % p._k_live.size())


func test_gate_banners_ripple() -> void:
	var banners: Array = main.view.banners
	assert_true(banners.size() >= 4, "banners hang at the gates (%d)" % banners.size())
	for b in banners:
		var m = b.material_override
		assert_true(m is ShaderMaterial and m.get_shader_parameter("wave") > 0.0, "a cloth that waves")
	assert_true(banners[0].material_override.get_shader_parameter("phase") != banners[1].material_override.get_shader_parameter("phase"),
		"each out of step with the next")


func test_puddles_shimmer() -> void:
	var before: int = main.view.ripples
	M.frames(main, 360)
	assert_true(main.view.ripples - before >= main.sim.puddles.size(), "rings spread across the puddles (%d)" % (main.view.ripples - before))


func test_a_faint_rune_turns_at_the_heart_of_the_court() -> void:
	var r: MeshInstance3D = main.view.floor_rune
	assert_true(r != null and r.visible, "a rune circle in the middle")
	var a: float = r.material_override.albedo_color.a
	assert_true(a > 0.0 and a < 0.3, "faint (alpha %.2f)" % a)
	var y0 := r.rotation.y
	M.frames(main, 60)
	assert_true(absf(r.rotation.y - y0) > 0.01, "slowly turning")
