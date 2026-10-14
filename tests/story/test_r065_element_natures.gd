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


func _explode(els: Array, key: String, big := false) -> Dictionary:
	return {"type": "explode", "pos": AT, "r": 2.4, "els": els, "big": big, "color": SpellBook.color(els[0]), "key": key}


func _impact(el: String) -> Dictionary:
	return {"type": "impact", "pos": AT, "color": SpellBook.color(el), "els": [el], "enemy": false, "kind": "bolt", "key": el}


func _cone(els: Array, key: String) -> Dictionary:
	return {"type": "cone", "pos": Vector2.ZERO, "dir": Vector2(0, -1), "arc": 60.0, "range": 6.0, "els": els, "key": key}


# The buoyancy a sprite actually gets: its own option, else its preset's.
func _buoy(s: Dictionary) -> float:
	return s["o"].get("buoy", Particles.presets()["sprite_presets"][s["name"]]["buoy"])


func _sprites(tr: Array, name: String) -> Array:
	return tr.filter(func(s): return s["kind"] == "sprite" and s["name"] == name)


func test_shadow_sinks_wherever_it_appears() -> void:
	assert_true(Particles.presets()["sprite_presets"]["shadow"]["buoy"] < 0.0, "the shadow preset sinks")
	for ev in [_cone(["dark"], "dark"), _impact("dark")]:
		var shadow := _sprites(_trace(ev, 0.1, 8.0), "shadow")
		assert_true(shadow.size() > 0, "%s draws shadow" % ev["type"])
		assert_true(shadow.all(func(s): return _buoy(s) < 0.0), "every shadow mote of a %s sinks" % ev["type"])


func test_wind_is_shown_by_the_dust_it_carries() -> void:
	var cone := _trace(_cone(["wind"], "wind"), 0.1, 8.0)
	assert_true(_sprites(cone, "dust").size() >= 8, "a gust carries dust (%d)" % _sprites(cone, "dust").size())
	# (the court's own drifting dust is near-still; only count what the burst throws)
	var dust := _sprites(_trace(_explode(["wind"], "wind"), 0.05), "dust").filter(func(s): return Vector2(s["vel"].x, s["vel"].z).length() > 1.0)
	assert_true(dust.size() >= 8, "a wind burst carries dust (%d)" % dust.size())
	# swept in a curl: mostly around the centre, all turning the same way
	var cw := 0
	var curl := 0
	for s in dust:
		var rad := Vector2(s["at"].x - AT.x, s["at"].z - AT.y)
		var v := Vector2(s["vel"].x, s["vel"].z)
		if rad.length() < 0.05:
			continue
		var tang := rad.normalized().orthogonal()
		if absf(v.dot(tang)) > absf(v.dot(rad.normalized())):
			curl += 1
		if v.dot(tang) > 0:
			cw += 1
	assert_true(curl >= dust.size() * 0.6, "the dust swirls more than it scatters (%d of %d)" % [curl, dust.size()])
	assert_true(cw <= dust.size() * 0.15 or cw >= dust.size() * 0.85, "the curl turns one way (%d of %d)" % [cw, dust.size()])


func test_a_hit_resolves_by_element() -> void:
	var fire := _trace(_impact("fire"), 0.5)
	assert_true(_sprites(fire, "hotsmoke").any(func(s): return s["vel"].y > 0.5), "a fire hit leaves a rising wisp of smoke")
	var debris_before: int = main.view.director.debris.filter(func(d): return d["type"] == "ice").size()
	var ice := _trace(_impact("ice"), 0.1)
	assert_true(main.view.director.debris.filter(func(d): return d["type"] == "ice").size() > debris_before, "an ice hit throws rigid shards")
	var mist := _sprites(ice, "mist")
	assert_true(mist.size() > 0 and mist.all(func(s): return _buoy(s) < 0.0), "and cold mist that sinks")
	assert_true(_sprites(_trace(_impact("earth"), 0.1), "dust").size() > 0, "an earth hit kicks dust")
	var light := _sprites(_trace(_impact("light"), 0.1), "radiance")
	assert_true(light.size() > 0 and light.all(func(s): return _buoy(s) > 0.5), "light motes rise")
	assert_true(_sprites(_trace(_impact("wind"), 0.1), "dust").size() > 0, "a wind hit stirs dust")


func test_fire_meeting_water_splits_into_steam_and_droplets() -> void:
	var tr := _trace(_cone(["fire", "water"], "fire+water"), 0.1, 8.0)
	var steam := _sprites(tr, "steam")
	var drops := tr.filter(func(s): return s["kind"] == "spark" and s["name"] == "water")
	assert_true(steam.size() > 0 and steam.all(func(s): return _buoy(s) > 0.0), "steam rises")
	assert_true(drops.size() >= 6, "droplets fall out of the steam (%d)" % drops.size())


func test_a_combos_second_element_bursts_a_beat_later() -> void:
	var tr := _trace(_explode(["fire", "earth"], "earth+fire"), 0.4)
	var fire := tr.filter(func(s): return s["kind"] == "spark" and s["name"] == "fire").map(func(s): return s["t"])
	var earth := tr.filter(func(s): return s["kind"] == "spark" and s["name"] == "earth").map(func(s): return s["t"])
	assert_true(fire.size() > 0 and earth.size() > 0, "both elements burst")
	if fire.size() and earth.size():
		assert_true(fire.min() < 0.02, "the first element bursts at once")
		assert_true(earth.min() >= 0.03, "the second overlaps it a beat later (%.3f s)" % earth.min())


func test_cast_helices_have_no_exact_spacing() -> void:
	var tr := _sprites(_trace({"type": "selfcast", "els": ["arcane"], "color": Color.WHITE, "pos": Vector2.ZERO}, 0.02), "arcane")
	assert_true(tr.size() >= 8, "a helix of motes")
	var steps := []
	var radii := []
	for i in range(1, tr.size()):
		var a0 := atan2(tr[i - 1]["at"].x, tr[i - 1]["at"].z)
		var a1 := atan2(tr[i]["at"].x, tr[i]["at"].z)
		steps.append(wrapf(a1 - a0, -PI, PI))
		radii.append(Vector2(tr[i]["at"].x, tr[i]["at"].z).length())
	var spread := func(arr: Array) -> float:
		var m := 0.0
		for x in arr:
			m += x
		m /= maxf(1, arr.size())
		var v := 0.0
		for x in arr:
			v += (x - m) * (x - m)
		return sqrt(v / maxf(1, arr.size()))
	assert_true(spread.call(steps) > 0.05, "the turn between motes varies (%.3f)" % spread.call(steps))
	assert_true(spread.call(radii) > 0.03, "the helix radius varies (%.3f)" % spread.call(radii))


func test_glacier_prison_raises_its_pillar() -> void:
	main.view.consume([_explode(["ice", "ice"], "ice+ice", true)], main.sim)
	var pillar: Array = main.view.director.live.filter(func(L): return L["node"].has_meta("permafrost"))
	assert_eq(pillar.size(), 1, "a permafrost pillar rises")
