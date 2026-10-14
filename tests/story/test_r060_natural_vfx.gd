extends "res://harness/test_case.gd"

const M := preload("res://tests/support/main_fixture.gd")
const SpellBook := preload("res://scripts/core/spell_book.gd")
const Particles := preload("res://scripts/vfx/vfx_particles.gd")

const AT := Vector2(0, -5)

var main


func before_each() -> void:
	main = M.make(tree)
	main.sim.player.pos = Vector2.ZERO


func after_test() -> void:
	main.free()


# Plays `ev` through the view and returns every particle spawned within `near` metres of it over `seconds`.
func _trace(ev: Dictionary, seconds: float, near := 3.0) -> Array:
	var p = main.view.director.particles
	p.trace = []
	var t0: float = p.clock
	main.view.consume([ev], main.sim)
	M.frames(main, roundi(seconds * 60))
	var out: Array = p.trace.filter(func(s): return Vector2(s["at"].x, s["at"].z).distance_to(ev.get("pos", AT)) <= near)
	for s in out:
		s["t"] -= t0
	p.trace = null
	return out


func _explode(els: Array, big: bool, key: String) -> Dictionary:
	return {"type": "explode", "pos": AT, "r": 2.4, "els": els, "big": big, "color": SpellBook.color(els[0]), "key": key}


func _cpu_bursts() -> int:
	return main.view.get_children().filter(func(n): return n is CPUParticles3D).size()


func test_every_effect_is_drawn_once_by_the_director() -> void:
	var c := Color.WHITE
	var events := [
		_explode(["fire", "lightning"], true, "fire+lightning"),
		{"type": "impact", "pos": AT, "color": c, "els": ["fire"], "enemy": false, "kind": "bolt", "key": "fire"},
		{"type": "impact", "pos": AT, "color": c, "els": [], "enemy": true},
		{"type": "cone", "pos": Vector2.ZERO, "dir": Vector2(0, -1), "arc": 60.0, "range": 4.0, "els": ["fire"], "key": "fire"},
		{"type": "nova", "pos": Vector2.ZERO, "r": 2.5, "els": ["ice"], "color": c},
		{"type": "selfcast", "els": ["nature"], "color": c, "pos": Vector2.ZERO},
		{"type": "block", "pos": AT, "color": c},
		{"type": "heal", "pos": Vector2.ZERO, "amt": 5.0, "source": "Light"},
		{"type": "hurt", "id": main.sim.player.id, "pos": Vector2.ZERO, "dmg": 3.0, "el": "fire", "dot": false, "self": false},
		{"type": "hit", "id": -1, "pos": AT, "dmg": 3.0, "el": "fire", "dot": false},
		{"type": "ward", "pos": Vector2.ZERO, "amt": 3.0},
		{"type": "death", "id": -99, "pos": AT, "kind": "thrall", "frozen": false},
		{"type": "wall", "pos": AT, "dir": Vector2(1, 0), "n": 3, "mat": "stone", "key": "earth+earth"},
		{"type": "wallBreak", "id": -1, "pos": AT, "mat": "stone"},
		{"type": "ignite", "pos": AT, "r": 1.5},
		{"type": "steam", "pos": AT, "r": 1.5},
		{"type": "charge", "pos": AT, "r": 1.5},
		{"type": "dodge", "pos": Vector2.ZERO, "dir": Vector2(1, 0)},
		{"type": "beam", "from": Vector2.ZERO, "to": AT, "width": 0.6, "color": c, "els": ["light"], "key": "light"},
		{"type": "cast", "els": ["fire"], "key": "fire", "name": "Firebolt", "color": c, "pos": Vector2.ZERO, "dir": Vector2(0, -1),
			"shape": "bolt", "mode": "aim", "from_queue": true, "distinct": 1},
	]
	var before := _cpu_bursts()
	for ev in events:
		var p = main.view.director.particles
		p.trace = []
		main.view.consume([ev], main.sim)
		M.frames(main, 2)
		assert_true(p.trace.size() > 0, "the director draws %s" % ev["type"])
		p.trace = null
	assert_eq(_cpu_bursts(), before, "no generic CPU particle bursts on top of the director")


func test_a_blast_squeezes_for_a_frame_before_it_bursts() -> void:
	main.view.consume([_explode(["fire"], false, "fire")], main.sim)
	var shell = null
	for L in main.view.director.live:
		if L["node"].has_meta("squeeze"):
			shell = L["node"]
	assert_true(shell != null, "the blast shell is marked")
	if shell == null:
		return
	var sizes := []
	for i in 12:
		M.frames(main, 1)
		if is_instance_valid(shell):
			sizes.append(shell.scale.x)
	var shrank := false
	for i in range(1, mini(6, sizes.size())):
		shrank = shrank or sizes[i] < sizes[i - 1] - 0.01
	assert_true(shrank, "the shell shrinks inward in its first frames")
	assert_true(sizes.max() > 2.4 * 0.8, "then bursts past most of its radius")


func test_big_blasts_overlap_a_second_burst() -> void:
	var tr := _trace(_explode(["fire"], true, "fire"), 0.4)
	var sparks := tr.filter(func(s): return s["kind"] == "spark")
	var first := sparks.filter(func(s): return s["t"] < 0.02).size()
	var second := sparks.filter(func(s): return s["t"] >= 0.06 and s["t"] <= 0.25).size()
	assert_true(first > 10, "a first burst")
	assert_true(second >= 8, "a second burst follows while the first slows (%d sparks)" % second)


func test_a_few_stragglers_fly_further() -> void:
	var tr := _trace(_explode(["fire"], true, "fire"), 0.05)
	var speeds: Array = tr.filter(func(s): return s["kind"] == "spark" and s["name"] == "fire").map(func(s): return s["vel"].length())
	speeds.sort()
	assert_true(speeds.size() > 10, "fire sparks")
	if speeds.size() > 10:
		var median: float = speeds[speeds.size() / 2]
		assert_true(speeds[-1] >= median * 1.8, "the fastest spark outruns the pack (%.1f vs median %.1f)" % [speeds[-1], median])


func test_water_splashes_throw_a_delayed_jet() -> void:
	var tr := _trace(_explode(["water", "water"], false, "water+water"), 0.8)
	var jet := tr.filter(func(s): return s["kind"] == "spark" and s["name"] == "water" and s["t"] >= 0.15 \
		and s["vel"].y > 5.0 and Vector2(s["vel"].x, s["vel"].z).length() < 2.0 \
		and Vector2(s["at"].x, s["at"].z).distance_to(AT) < 0.8)
	assert_true(jet.size() >= 6, "a narrow jet rises from the centre after the primary splash (%d)" % jet.size())


func test_fire_throws_rogue_embers() -> void:
	var tr := _trace(_explode(["fire"], false, "fire"), 0.05)
	var rogue := tr.filter(func(s): return s["kind"] == "spark" and s["name"] == "fire" \
		and s["vel"].y < 3.0 and Vector2(s["vel"].x, s["vel"].z).length() > 18.0)
	assert_true(rogue.size() >= 1, "some embers shoot off sideways")


func test_smoke_steam_and_dust_resolve_differently() -> void:
	var S: Dictionary = Particles.presets()["sprite_presets"]
	assert_true(S["steam"]["life"][1] < S["smoke"]["life"][0], "steam vanishes before smoke would")
	assert_true(S["hotsmoke"]["life"][0] > S["flame"]["life"][1], "smoke outlives flame")
	assert_true(S["dust"]["buoy"] <= 0.0, "dust settles")
	assert_true(S["flame"]["buoy"] > S["smoke"]["buoy"], "flame rises fastest")


func test_light_rises_and_dark_sinks() -> void:
	var light := _trace(_explode(["light"], false, "light"), 0.05).filter(func(s): return s["name"] == "radiance")
	var dark := _trace(_explode(["dark"], false, "dark"), 0.05).filter(func(s): return s["name"] == "shadow")
	assert_true(light.size() > 0 and dark.size() > 0, "both draw their motes")
	var up := func(arr: Array) -> float:
		var sum := 0.0
		for s in arr:
			sum += s["o"].get("buoy", 0.0)
		return sum / maxf(1, arr.size())
	assert_true(up.call(light) > 0.5, "light motes float up")
	assert_true(up.call(dark) < 0.0, "dark motes sink")


func test_a_big_combo_stays_within_a_third_of_the_pools() -> void:
	var tr := _trace(_explode(["fire", "fire"], true, "fire+fire"), 1.5, 50.0)
	var sprites := tr.filter(func(s): return s["kind"] == "sprite").size()
	var sparks := tr.filter(func(s): return s["kind"] == "spark").size()
	assert_true(sprites < Particles.SMOKE_MAX / 3, "sprites %d" % sprites)
	assert_true(sparks < Particles.SPARK_MAX / 3, "sparks %d" % sparks)
