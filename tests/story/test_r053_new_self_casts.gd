extends "res://harness/test_case.gd"

const F := preload("res://tests/support/arena_fixture.gd")

var s


func before_each() -> void:
	s = F.make()
	s.player.pos = Vector2.ZERO


func test_nature_regenerates() -> void:
	s.player.hp = 50
	F.cast(s, ["nature"], Vector2(0, -6), "self")
	F.run(s, 2.0)
	assert_true(absf(s.player.hp - 58.0) < 0.5, "4 a second: %s" % s.player.hp)


func test_wind_hastes_and_shoves() -> void:
	var e = s.spawn("thrall", Vector2(1.5, 0))
	F.cast(s, ["wind"], Vector2(0, -6), "self")
	assert_true(s.player.st.haste > 1.9, "haste")
	assert_true(e.kvel.x > 3.0, "the thrall is blown away")


func test_light_heals() -> void:
	s.player.hp = 50
	var ev := F.cast(s, ["light"], Vector2(0, -6), "self")
	assert_eq(s.player.hp, 65.0)
	assert_eq(F.of_type(ev, "heal").size(), 1)


func test_dark_pact() -> void:
	s.player.energy = 10
	var ev := F.cast(s, ["dark"], Vector2(0, -6), "self")
	assert_eq(s.player.hp, 90.0, "costs 10 health")
	assert_true(s.player.energy > 50.0, "for 50 energy: %s" % s.player.energy)
	var mine := F.of_type(ev, "hurt").filter(func(e): return e["self"])
	assert_eq(mine[0]["reason"], "Dark pact")
