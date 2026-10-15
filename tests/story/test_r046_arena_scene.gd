extends "res://harness/test_case.gd"

const M := preload("res://tests/support/main_fixture.gd")
const Roster := preload("res://scripts/core/wizard_roster.gd")

var main


func before_each() -> void:
	main = M.make(tree)


func after_test() -> void:
	main.free()


func test_the_main_scene_is_3d_with_the_court() -> void:
	assert_true(main is Node3D, "Node3D root")
	var v = main.view
	assert_eq(v.pillar_views.size(), main.sim.pillars.size(), "pillars")
	for p in main.sim.puddles + main.sim.brush + main.sim.barrels:
		assert_true(v.prop_views.has(p.id), "prop %s" % p.id)
	assert_eq(v.braziers.size(), 8, "two braziers at each of the four gates")


func test_the_camera_follows_and_leans_toward_the_cursor() -> void:
	var cam: Camera3D = main.view.camera
	assert_eq(cam.fov, 40.0)
	main.sim.player.pos = Vector2(3, 2)
	M.frames(main, 240, {"aim": Vector2(3, 2)})
	var off: Vector3 = cam.position - Vector3(3, 0, 2)
	assert_true(off.distance_to(Vector3(0, 13.5, 12.5)) < 0.3, "offset (0, 13.5, 12.5): %s" % off)
	M.frames(main, 240, {"aim": Vector2(3, -8)})
	assert_true(absf(cam.position.z - (2 + 12.5 - 10 * 0.15)) < 0.3, "leans 15%% toward the aim: %s" % cam.position)


func test_the_mouse_ray_hits_the_ground() -> void:
	M.frames(main, 120, {"aim": main.sim.player.pos})
	var cam: Camera3D = main.view.camera
	var world := Vector3(2, 0, -1)
	var back: Vector2 = main.view.screen_to_ground(cam.unproject_position(world))
	assert_true(back.distance_to(Vector2(2, -1)) < 0.05, "round trip %s" % back)


func test_the_chosen_wizard_is_built_and_walks() -> void:
	main.hud._on_pick("rime_cryomancer")
	var w = main.view.wizard
	assert_eq(w.spec["id"], "rime_cryomancer")
	assert_eq(w.spec["hat"], Roster.find("rime_cryomancer")["hat"])
	assert_eq(w.hips.size(), 2, "rigged legs")
	var hip0: float = w.hips[0].rotation.x
	M.frames(main, 20, {"move": Vector2(1, 0)})
	assert_true(absf(w.hips[0].rotation.x - hip0) > 0.05, "the legs swing when walking")
	var lowest := INF
	for i in 2:
		lowest = minf(lowest, (w.root.transform * w.hips[i].transform * w.knees[i].transform * w.ankles[i].transform * w.soles[i].transform).origin.y)
	assert_true(absf(lowest) < 0.06, "feet planted on the ground: %s" % lowest)


func test_enemies_shots_areas_and_walls_appear() -> void:
	var s = main.sim
	s.player.pos = Vector2.ZERO
	var e = s.spawn("bulwark", Vector2(0, -6))
	e.atk_cd = 99
	M.frames(main, 1, {"aim": Vector2(0, -6), "actions": ["el:arcane", "cast"]})
	assert_true(main.view.enemy_views.has(e.id), "enemy model")
	assert_eq(main.view.shot_views.size(), 1, "bolt")
	s.player.cd["cast"] = 0
	M.frames(main, 1, {"aim": Vector2(4, 0), "actions": ["el:ice", "el:water", "cast"]})
	assert_eq(main.view.area_views.size(), 1, "area")
	s.player.cd["cast"] = 0
	M.frames(main, 1, {"aim": Vector2(-4, 0), "actions": ["el:earth", "el:earth", "cast"]})
	assert_eq(main.view.wall_views.size(), 5, "wall segments")
	s.enemies.clear()
	M.frames(main, 1)
	assert_eq(main.view.enemy_views.size(), 0, "views follow the sim")
