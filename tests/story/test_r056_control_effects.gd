extends "res://harness/test_case.gd"

const F := preload("res://tests/support/arena_fixture.gd")
const SpellBook := preload("res://scripts/core/spell_book.gd")

var s


func before_each() -> void:
	s = F.make()
	s.player.pos = Vector2.ZERO


func _thrall(at: Vector2):
	var e = s.spawn("thrall", at)
	e.atk_cd = 0
	return e


func test_solar_flare_stuns_and_blinds() -> void:
	var e = _thrall(Vector2(0, -1.4))
	s._apply_payload(e, SpellBook.resolve(["fire", "light"])["payload"])
	assert_eq(e.st.stun, 3.5, "stunned 3.5 s")
	assert_eq(e.st.blind, 3.5, "blinded 3.5 s")
	F.run(s, 2.0)
	assert_eq(s.player.hp, 100.0, "a stunned thrall does nothing")


func test_graveyard_silences() -> void:
	var e = _thrall(Vector2(0, -1.4))
	e.st.silence = 2.0
	F.run(s, 1.5)
	assert_eq(s.player.hp, 100.0, "silenced: no attacks")
	assert_eq(SpellBook.resolve(["earth", "dark"])["payload"]["silence"], 5.0)


func test_abyss_water_weakens_and_drains_energy() -> void:
	var e = _thrall(Vector2(0, -1.4))
	s.player.energy = 20
	s._apply_payload(e, SpellBook.resolve(["water", "dark"])["payload"])
	assert_eq(e.st.weaken, 4.0)
	assert_eq(s.player.energy, 24.0, "energy drained back")
	assert_eq(s._enemy_hits(e, s.player, 10.0, "phys"), 6.0, "40% less damage")


func test_sandstorm_makes_enemies_miss() -> void:
	var e = _thrall(Vector2(0, -1.4))
	e.st.inaccurate = 99
	var misses := 0
	for i in 200:
		if s._enemy_hits(e, s.player, 0.01, "phys") == 0.0:
			misses += 1
		s.player.hp = 100
	assert_true(misses > 90 and misses < 150, "about 60%% miss: %d of 200" % misses)


func test_shadow_storm_confuses() -> void:
	var a = _thrall(Vector2(0, -1.0))
	var b = s.spawn("thrall", Vector2(0, -2.2))
	b.atk_cd = 99
	a.st.confuse = 5
	s.player.pos = Vector2(8, 8)
	F.run(s, 2.0)
	assert_true(b.hp < b.max_hp, "the confused thrall mauls its neighbour")
	assert_eq(s.player.hp, 100.0)


func test_living_vines_and_glacier_prison_hold_longer() -> void:
	var e = _thrall(Vector2(0, -6))
	s._apply_payload(e, SpellBook.resolve(["water", "nature"])["payload"])
	assert_eq(e.st.root, 5.0, "rooted 5 s")
	var f = _thrall(Vector2(3, -6))
	s._apply_payload(f, SpellBook.resolve(["ice", "ice"])["payload"])
	assert_eq(f.st.frozen, 6.0, "frozen 6 s")


func test_mud_slows_harder() -> void:
	var e = _thrall(Vector2(0, -6))
	s._apply_payload(e, SpellBook.resolve(["earth", "water"])["payload"])
	assert_true(is_equal_approx(s.slow_mul(e.st), 0.2), "Mudslide: -80%% speed (%s)" % s.slow_mul(e.st))
	var f = _thrall(Vector2(3, -6))
	s._apply_payload(f, SpellBook.resolve(["earth", "earth", "fire"])["payload"])
	assert_true(is_equal_approx(s.slow_mul(f.st), 0.4), "Magma Burst: -60%%")
	var g = _thrall(Vector2(-3, -6))
	s._apply_payload(g, {"parts": {}, "els": ["earth"], "knock": 0.0, "slow": 1.0})
	assert_true(is_equal_approx(s.slow_mul(g.st), 0.6), "an ordinary slow is still -40%%")
