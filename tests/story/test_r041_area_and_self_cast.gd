extends "res://harness/test_case.gd"

const F := preload("res://tests/support/arena_fixture.gd")

var s


func before_each() -> void:
	s = F.make()
	s.player.pos = Vector2.ZERO


func test_around_you_blasts_and_costs_more() -> void:
	var near = s.spawn("hexcaller", Vector2(2.5, 1))
	var far = s.spawn("hexcaller", Vector2(6, 0))
	F.cast(s, ["fire"], Vector2(0, -6), "nova")
	assert_true(near.hp < near.max_hp, "inside 3.4 m")
	assert_eq(far.hp, far.max_hp, "outside")
	assert_true(near.kvel.length() > 0, "extra knockback")
	assert_true(absf(s.player.energy - (100 - 10 + 18 * F.DT)) < 0.05, "Flame Gout 8 x1.3 = 10")
	assert_true(absf(s.player.cd["nova"] - 3.0) < 0.02, "3 s cooldown")


func test_around_you_places_areas_and_rings_walls() -> void:
	F.cast(s, ["ice", "water", "water"], Vector2(0, -6), "nova")
	assert_eq(s.areas.size(), 1)
	assert_true(s.areas[0].pos.length() < 0.01, "centred on you")
	F.run(s, F.DT)
	assert_true(s.player.st.frozen > 0, "standing in your own Hoarfrost freezes you")
	s.areas = []
	s.player.st.frozen = 0
	s.player.cd["nova"] = 0
	F.cast(s, ["earth", "earth"], Vector2(0, -6), "nova")
	assert_eq(s.walls.size(), 9, "a ring of nine")


func test_self_casts() -> void:
	F.cast(s, ["earth"], Vector2(0, -6), "self")
	assert_true(s.player.st.stoneskin > 3.9, "stoneskin 4 s")
	assert_true(absf(s.player.energy - (100 - 6 + 18 * F.DT)) < 0.05, "Hurled Stone 11 x0.5 = 6")
	assert_true(absf(s.player.cd["self"] - 1.4) < 0.02, "1.4 s cooldown")
	var taken = s._hurt(s.player, 10, "phys")
	assert_eq(taken, 5.0, "half damage")
	s.player.cd["self"] = 0
	F.cast(s, ["arcane"], Vector2(0, -6), "self")
	assert_eq(s.player.st.ward, 25.0, "ward")
	s._hurt(s.player, 4, "phys")
	assert_eq(s.player.st.ward, 23.0, "stoneskin halves 4 to 2, then the ward soaks it")
	s.player.st.burn = 2
	s.player.st.chill = 2
	s.player.cd["self"] = 0
	F.cast(s, ["water"], Vector2(0, -6), "self")
	assert_eq(s.player.st.burn, 0.0, "cleansed")
	assert_eq(s.player.st.chill, 0.0)
	assert_true(s.player.st.wet > 4.9, "and soaked")
	s.player.cd["self"] = 0
	F.cast(s, ["lightning"], Vector2(0, -6), "self")
	assert_true(s.player.st.haste > 2.9, "haste")
