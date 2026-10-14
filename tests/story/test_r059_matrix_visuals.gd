extends "res://harness/test_case.gd"

const M := preload("res://tests/support/main_fixture.gd")
const MatrixVisuals := preload("res://scripts/vfx/matrix_visuals.gd")

var main


func before_each() -> void:
	main = M.make(tree)
	main.sim.player.pos = Vector2(0, 4)


func after_test() -> void:
	main.free()


func _cast(els: Array, aim: Vector2) -> Array:
	main.sim.player.cd["cast"] = 0
	main.sim.player.shape_cd = {}
	main.sim.player.energy = 100
	var acts := []
	for el in els:
		acts.append("el:" + el)
	acts.append("cast")
	return M.frames(main, 1, {"aim": aim, "actions": acts})


func _area_kind(key: String) -> String:
	for a in main.sim.areas:
		if a.key == key:
			return main.view.area_views[a.id]["mx"].get("kind", "")
	return "missing"


func test_each_ground_area_has_its_look() -> void:
	var want := {
		["fire", "nature"]: ["fire+nature", "wildfire"], ["dark", "dark"]: ["dark+dark", "black_hole"],
		["fire", "water", "water"]: ["fire+water+water", "steam_cloud"], ["fire", "wind"]: ["fire+wind", "vortex"],
		["earth", "earth", "lightning"]: ["earth+earth+lightning", "magnetic"], ["nature", "nature"]: ["nature+nature", "world_tree"],
		["earth", "water", "water"]: ["earth+water+water", "mud"], ["earth", "earth", "fire"]: ["earth+earth+fire", "magma"],
	}
	for els in want:
		_cast(els, Vector2(0, -4))
		assert_eq(_area_kind(want[els][0]), want[els][1], str(els))
		main.sim.areas.clear()
		M.frames(main, 1)


func test_wildfire_grass_ignites() -> void:
	_cast(["fire", "nature"], Vector2(0, -4))
	M.frames(main, 40)
	var v: Dictionary
	for a in main.sim.areas:
		if a.key == "fire+nature":
			v = main.view.area_views[a.id]["mx"]
	assert_eq(v["clumps"].size(), 28, "7 sub-zones x 4 clumps")
	assert_true(v["clumps"].all(func(c): return c["lit"]), "the grass tips catch fire")


func test_tsunami_and_supernova_leave_ground() -> void:
	_cast(["water", "water"], Vector2(0, -2))
	assert_eq(_area_kind("water_pool"), "water_pool")
	main.sim.areas.clear()
	_cast(["fire", "fire"], Vector2(0, -4))
	M.frames(main, 80)
	assert_eq(_area_kind("burning"), "burning_land")


func test_status_rings_show_on_enemies() -> void:
	var e = main.sim.spawn("thrall", Vector2(2, -2))
	e.atk_cd = 99
	e.st.frozen = 5
	e.st.burn = 5
	M.frames(main, 1)
	var rings: Dictionary = main.view.enemy_views[e.id]["rings"]
	assert_true(rings["frozen"].visible, "cyan ring when frozen")
	assert_true(rings["burn"].visible, "orange ring when burning")
	assert_true(not rings["confuse"].visible)
	assert_true(absf(Color(rings["frozen"].get_meta("mat").albedo_color, 1).h - Color("#7dd3fc").h) < 0.01, "the frozen ring is cyan")


func test_crits_and_signature_beams() -> void:
	var e = main.sim.spawn("hexcaller", Vector2(0, 1.5)) # inside Flame Gout's 4.6 m
	e.atk_cd = 99
	e.st.frozen = 2
	M.frames(main, 1, {"aim": Vector2(0, -6), "actions": ["el:fire", "cast"]})
	var crit: Array = main.view.get_children().filter(func(n): return n is Label3D and n.text.begins_with("CRIT"))
	assert_true(crit.size() >= 1, "a CRIT number for the thermal shock")
	var before: int = main.view.director.live.size()
	_cast(["light", "light"], Vector2(0, -8))
	assert_true(main.view.director.live.size() >= before + 5, "Divine Judgement raises holy pillars")
