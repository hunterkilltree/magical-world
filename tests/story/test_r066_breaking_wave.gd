extends "res://harness/test_case.gd"

const M := preload("res://tests/support/main_fixture.gd")
const Particles := preload("res://scripts/vfx/vfx_particles.gd")

var main


func before_each() -> void:
	main = M.make(tree)
	main.sim.player.pos = Vector2.ZERO


func after_test() -> void:
	main.free()


func _cone(key: String, rng: float, arc: float) -> Dictionary:
	var els := ["water", "water"] if key == "water+water" else ["water"]
	return {"type": "cone", "pos": Vector2.ZERO, "dir": Vector2(0, -1), "arc": arc, "range": rng, "els": els, "key": key}


func _tsunami() -> Dictionary:
	return _cone("water+water", 4.8, 100.0)


func _wave():
	for L in main.view.director.live:
		if is_instance_valid(L["node"]) and L["node"].has_meta("wave"):
			return L["node"]
	return null


# Plays `ev` and samples the wave each frame: [{t, foot, peak, curl, crest}], plus the particle trace.
func _run(ev: Dictionary, seconds: float) -> Dictionary:
	var p = main.view.director.particles
	p.trace = []
	var t0: float = p.clock
	main.view.consume([ev], main.sim)
	var w = _wave()
	var samples := []
	for i in roundi(seconds * 60):
		M.frames(main, 1)
		if w != null and is_instance_valid(w):
			samples.append({"t": p.clock - t0, "foot": w.foot_r, "curl": w.curl_now, "crest": w.crest_h.duplicate(), "peak": w.peak})
	var tr: Array = p.trace
	for s in tr:
		s["t"] -= t0
	p.trace = null
	return {"wave": w, "samples": samples, "trace": tr}


func test_a_tsunami_draws_a_wave_that_rises_curls_and_breaks() -> void:
	var r := _run(_tsunami(), 1.6)
	var S: Array = r["samples"]
	assert_true(r["wave"] != null, "a wave sheet is drawn")
	if S.is_empty():
		return
	var tallest := 0.0
	var curl := 0.0
	for s in S:
		tallest = maxf(tallest, s["crest"].max())
		curl = maxf(curl, s["curl"])
	assert_true(tallest > 1.3, "it rises tall (%.2f m)" % tallest)
	assert_true(curl > 0.8, "its lip curls over (%.2f)" % curl)
	var late: Array = S.filter(func(s): return s["t"] > 1.0)
	assert_true(late.size() > 0 and late[0]["crest"].max() < tallest * 0.4, "then the lip plunges and it collapses")
	assert_true(not main.view.director.live.any(func(L): return L["node"] == r["wave"]), "and it is gone once it has settled")


func test_it_draws_back_then_rushes_out_and_slows() -> void:
	var S: Array = _run(_tsunami(), 1.0)["samples"]
	var start := 0.7 # the Tsunami wave's r0
	var back := S.filter(func(s): return s["t"] < 0.08).map(func(s): return s["foot"])
	assert_true(back.min() < start - 0.1, "it draws back for a beat first (%.2f)" % back.min())
	var far: float = S[S.size() - 1]["foot"]
	assert_true(far > 4.0, "it reaches the end of the cone (%.2f)" % far)
	# fast then slow: from when it sets off, half the distance takes well under half the time of 90%
	var at := func(frac: float) -> float:
		for s in S:
			if s["t"] > 0.06 and s["foot"] >= start + (far - start) * frac:
				return s["t"]
		return -1.0
	var t0: float = at.call(0.02)
	var ratio: float = (at.call(0.5) - t0) / maxf(0.01, at.call(0.9) - t0)
	assert_true(ratio < 0.45, "it rushes out and slows (half-distance at %.2f of the 90%% time)" % ratio)


func test_the_crest_is_uneven_and_breaks_unevenly() -> void:
	var S: Array = _run(_tsunami(), 0.9)["samples"]
	var mid: Array = S.filter(func(s): return s["t"] > 0.45 and s["t"] < 0.5)[0]["crest"]
	# away from the tapered ends, the crest height should not be one flat line
	var inner := mid.slice(8, 20)
	assert_true(inner.max() - inner.min() > 0.08, "crest heights vary across the arc (%.2f)" % (inner.max() - inner.min()))
	var ws = WaveSheetProbe.new()
	assert_true(ws.delays_vary(), "parts of the crest break at different times")


func test_droplets_peel_off_then_it_plunges_with_a_jet_and_foam() -> void:
	var r := _run(_tsunami(), 1.6)
	var tr: Array = r["trace"]
	var w = r["wave"]
	var t_break := 0.62
	var riding := tr.filter(func(s): return s["name"] == "spray" and s["t"] > 0.1 and s["t"] < t_break and s["at"].y > 0.8)
	assert_true(riding.size() >= 15, "spray peels off the lip as it rides in (%d)" % riding.size())
	var plunge := tr.filter(func(s): return s["kind"] == "spark" and s["name"] == "water" and s["t"] >= t_break and s["vel"].y > 3.0)
	var angles := plunge.map(func(s): return rad_to_deg(atan2(s["at"].x, -s["at"].z)))
	assert_true(plunge.size() >= 30, "the lip plunges in splashes (%d)" % plunge.size())
	if angles.size():
		assert_true(angles.max() - angles.min() > 55.0, "all along the arc (%.0f deg)" % (angles.max() - angles.min()))
	var jets := tr.filter(func(s): return s["kind"] == "spark" and s["name"] == "water" and s["t"] > t_break + 0.2 \
		and s["vel"].y > 5.0 and Vector2(s["vel"].x, s["vel"].z).length() < 1.2)
	assert_true(jets.size() >= 6, "a jet rises a beat after the plunge (%d)" % jets.size())
	var foam := tr.filter(func(s): return s["name"] == "foam")
	assert_true(foam.size() >= 9, "foam spreads (%d)" % foam.size())
	var buoy: float = Particles.presets()["sprite_presets"]["foam"]["buoy"]
	assert_true(buoy < 0.0, "and settles")


func test_torrent_is_a_lower_faster_wave() -> void:
	var t := _run(_cone("water", 5.6, 40.0), 0.8)
	var T: Array = t["samples"]
	var tor_peak := 0.0
	var tor_curl := 0.0
	var reach_at := -1.0
	for s in T:
		tor_peak = maxf(tor_peak, s["crest"].max())
		tor_curl = maxf(tor_curl, s["curl"])
		if reach_at < 0 and s["foot"] > 5.6 * 0.8:
			reach_at = s["t"]
	assert_true(t["wave"] != null, "Torrent draws a wave too")
	assert_true(tor_peak < 1.0, "it is low (%.2f m)" % tor_peak)
	assert_true(tor_curl < 0.6, "it barely curls (%.2f)" % tor_curl)
	assert_true(reach_at > 0 and reach_at < 0.35, "it is fast (%.2f s to its reach)" % reach_at)


func test_a_tsunami_stays_within_a_third_of_the_pools() -> void:
	var tr: Array = _run(_tsunami(), 1.6)["trace"]
	var sprites := tr.filter(func(s): return s["kind"] == "sprite").size()
	var sparks := tr.filter(func(s): return s["kind"] == "spark").size()
	assert_true(sprites < Particles.SMOKE_MAX / 3, "sprites %d" % sprites)
	assert_true(sparks < Particles.SPARK_MAX / 3, "sparks %d" % sparks)


class WaveSheetProbe:
	const WaveSheet := preload("res://scripts/vfx/wave_sheet.gd")

	func delays_vary() -> bool:
		var w = WaveSheet.new()
		w._ph = [0.3, 1.7, 2.9, 4.1]
		var ds := []
		for i in 9:
			ds.append(w.seg_delay(i / 8.0))
		w.free()
		return ds.max() - ds.min() > 0.02
