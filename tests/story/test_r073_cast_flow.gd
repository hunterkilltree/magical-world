extends "res://harness/test_case.gd"

const F := preload("res://tests/support/arena_fixture.gd")
const SpellBook := preload("res://scripts/core/spell_book.gd")
const ArenaSim := preload("res://scripts/core/arena_sim.gd")


func _brann() -> ArenaSim:
	var s := F.make()
	s.player.book = "ember_pyromancer"
	return s


func test_cast_timing_follows_the_role_style_and_the_weight() -> void:
	var bolt := SpellBook.make_spell(["fire"], {"name": "B", "shape": "bolt", "mult": 1.0})
	var wall := SpellBook.make_spell(["earth", "earth"], {"name": "W", "shape": "wall", "mult": 1.0})
	var slam: Dictionary = SpellBook.cast_timing(wall, "destroyer", "aim")
	var flick: Dictionary = SpellBook.cast_timing(bolt, "trickster", "aim")
	assert_eq(slam["style"], "slam")
	assert_eq(flick["style"], "flick")
	assert_true(slam["windup"] > flick["windup"], "a slam winds up longer than a flick")
	assert_true(slam["windup"] <= 0.34 and slam["weight"] <= 1.3)
	assert_true(slam["recoil"] > flick["recoil"])
	var self_t: Dictionary = SpellBook.cast_timing(wall, "destroyer", "self")
	assert_eq(self_t["windup"], 0.08)
	assert_eq(self_t["hold"], 0.0)
	var heavy: Dictionary = SpellBook.cast_timing(wall, "destroyer", "nova")
	assert_true(heavy["weight"] >= slam["weight"], "a nova is heavier")
	assert_true(SpellBook.release_hitstop(wall, slam, false, false, "aim") > 0.0, "slam stops time on release")


func test_a_cast_winds_up_then_releases() -> void:
	var s := _brann()
	var ev := F.cast(s, ["fire"], Vector2(0, -10))
	assert_eq(F.of_type(ev, "windup").size(), 1, "windup starts at once")
	assert_eq(F.of_type(ev, "cast").size(), 0, "nothing leaves the staff yet")
	assert_eq(s.shots.size(), 0)
	assert_true(not s.player.wind.is_empty())
	var t := 0.0
	var cast_ev := []
	while t < 0.6 and cast_ev.is_empty():
		cast_ev = F.of_type(F.run(s, F.DT), "cast")
		t += F.DT
	assert_eq(cast_ev.size(), 1, "released")
	var want: Dictionary = SpellBook.cast_timing(SpellBook.resolve(["fire"], "ember_pyromancer"), "destroyer", "aim")
	assert_true(absf(t - want["total"]) < 0.06, "released after %s, wanted %s" % [t, want["total"]])
	assert_true(s.player.wind.is_empty())
	assert_true(s.player.cast_t > 0.0, "the recoil runs")


func test_release_reads_the_aim_when_it_leaves() -> void:
	var s := _brann()
	F.cast(s, ["fire"], Vector2(10, 0))
	F.run(s, 0.3, [], Vector2.ZERO, Vector2(-10, 0))
	assert_true(s.player.f.x < -0.9, "it faced where the cursor ended up: %s" % s.player.f)


func test_no_second_cast_while_winding_up() -> void:
	var s := _brann()
	F.cast(s, ["fire"], Vector2(0, -10))
	var ev := F.cast(s, ["earth"], Vector2(0, -10))
	assert_eq(F.of_type(ev, "windup").size(), 0)
	assert_eq(s.player.queue, ["earth"], "the new element only queued")


func test_a_stun_interrupts_the_windup() -> void:
	var s := _brann()
	F.cast(s, ["earth", "earth"], Vector2(0, -10))
	s.player.st.stun = 1.0
	var ev := F.run(s, 0.6)
	assert_eq(F.of_type(ev, "cast").size(), 0)
	assert_true(s.player.wind.is_empty())
	assert_true(F.tags(ev).has("interrupt"))


func test_the_court_book_casts_at_once() -> void:
	var s := F.make()
	var ev := F.cast(s, ["fire"], Vector2(0, -10))
	assert_eq(F.of_type(ev, "cast").size(), 1, "no role, no windup")


func test_a_combos_first_cast_stops_time_on_release() -> void:
	var s := _brann()
	F.cast(s, ["fire", "earth"], Vector2(0, -10))
	var t := 0.0
	while t < 0.8 and s.hitstop <= 0.0:
		F.run(s, F.DT)
		t += F.DT
	assert_true(s.hitstop > 0.1, "first cast of a combo freezes time: %s" % s.hitstop)
