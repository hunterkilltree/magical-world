extends "res://harness/test_case.gd"

const F := preload("res://tests/support/arena_fixture.gd")
const ArenaSim := preload("res://scripts/core/arena_sim.gd")

var s


func before_each() -> void:
	s = F.make()


func test_moves_at_full_speed_diagonals_included() -> void:
	F.run(s, 0.5, [], Vector2(1, 0))
	assert_true(absf(s.player.vel.length() - 5.4) < 0.01, "speed %s" % s.player.vel.length())
	F.run(s, 0.5, [], Vector2(1, 1))
	assert_true(absf(s.player.vel.length() - 5.4) < 0.01, "diagonal speed %s" % s.player.vel.length())
	F.run(s, 0.5)
	assert_true(s.player.vel.length() < 0.01, "stops without input")


func test_stays_inside_the_court() -> void:
	s.player.pos = Vector2(30, 0)
	F.run(s, F.DT)
	assert_true(s.player.pos.length() <= ArenaSim.BOUND - s.player.r + 0.001, "clamped to %s" % s.player.pos.length())


func test_faces_the_cursor() -> void:
	F.run(s, F.DT, [], Vector2.ZERO, s.player.pos + Vector2(5, 0))
	assert_eq(s.player.f, Vector2(1, 0))


func test_energy_is_spent_and_regenerates() -> void:
	F.cast(s, ["fire", "lightning"], Vector2(0, -10))
	assert_true(absf(s.player.energy - (100 - 16)) < 0.4, "Thunderflare costs 16: %s" % s.player.energy)
	s.player.energy = 50
	s.hitstop = 0 # the combo's time-freeze (R-055) would slow the clock
	s.shots = [] # and so would the Thunderflare's blast
	F.run(s, 1.0)
	assert_true(absf(s.player.energy - 68.0) < 0.1, "regen 18/s: %s" % s.player.energy)
	s.player.energy = 5
	var ev := F.cast(s, ["earth", "earth"], Vector2(0, -10))
	assert_eq(F.of_type(ev, "noEnergy").size(), 1, "too poor to cast")
	assert_eq(s.walls.size(), 0)


func test_cooldowns_shared_and_per_shape() -> void:
	F.cast(s, ["ice", "water", "water"], Vector2(0, -6))
	assert_eq(s.areas.size(), 1, "Hoarfrost Field placed")
	assert_true(absf(s.player.cd["cast"] - 0.45) < 0.02, "shared cooldown min(2.2, 0.45)")
	assert_true(absf(s.player.shape_cd["area"] - 2.2) < 0.02, "areas recharge on their own")
	F.run(s, 0.7) # 0.45 s of game time, plus the first-cast time-freeze (R-055)
	var ev := F.cast(s, ["lightning", "water"], Vector2(0, -6))
	assert_eq(F.of_type(ev, "cooldown").size(), 1, "another area is refused")
	assert_eq(s.areas.size(), 1)
	s.player.queue = []
	s.player.cd["cast"] = 0
	F.cast(s, ["arcane"], Vector2(0, -6))
	assert_eq(s.shots.size(), 1, "a bolt still casts")
	assert_true(absf(s.player.cd["cast"] - 0.3) < 0.02, "bolt cooldown 0.3")


func test_holding_cast_recasts_the_last_spell() -> void:
	F.cast(s, ["arcane"], Vector2(0, -6))
	assert_eq(s.player.last, ["arcane"])
	F.run(s, 0.4)
	s.step(F.input(["recast"], Vector2.ZERO, Vector2(0, -6)), F.DT)
	assert_eq(s.stats["casts"], 2, "recast with an empty queue")
	s.player.queue = ["fire"]
	F.run(s, 0.4)
	s.step(F.input(["recast"], Vector2.ZERO, Vector2(0, -6)), F.DT)
	assert_eq(s.stats["casts"], 2, "not while something is queued")


func test_dodge_evades_hits_but_not_burning() -> void:
	F.run(s, F.DT, ["dodge"], Vector2(1, 0))
	assert_true(s.player.dodge > 0, "dodging")
	assert_true(absf(s.player.vel.length() - 13.5) < 0.01, "dodge speed")
	assert_eq(s._hurt(s.player, 10, "phys"), 0.0, "a direct hit misses")
	assert_true(s._hurt(s.player, 2, "fire", {"dot": true}) > 0, "damage over time lands")
	F.run(s, 0.3)
	assert_eq(s.player.dodge <= 0, true, "0.26 s")
	F.run(s, F.DT, ["dodge"])
	assert_true(s.player.dodge <= 0, "1 s cooldown")


func test_the_run_ends_at_zero_health() -> void:
	s._hurt(s.player, 150, "phys")
	var ev := F.run(s, F.DT)
	assert_eq(s.mode, "dead")
	assert_eq(s.player.alive, false)
	assert_eq(F.of_type(ev, "playerDeath").size(), 1)
