extends "res://harness/test_case.gd"

const F := preload("res://tests/support/arena_fixture.gd")
const EnemyTypes := preload("res://scripts/core/enemy_types.gd")
const ArenaSim := preload("res://scripts/core/arena_sim.gd")


func test_rosters_match_the_preview() -> void:
	var rng := RandomNumberGenerator.new()
	for row in EnemyTypes.data()["waves_preview"]:
		var info := EnemyTypes.wave_roster(int(row["wave"]), rng)
		var counts := {}
		for k in info["list"]:
			counts[k] = counts.get(k, 0) + 1
		for k in row["counts"]:
			assert_eq(counts.get(k, 0), int(row["counts"][k]), "wave %d %s" % [row["wave"], k])
		assert_true(is_equal_approx(info["hp_scale"], row["hp_scale"]), "hp scale wave %d" % row["wave"])
		assert_true(is_equal_approx(info["speed_scale"], row["speed_scale"]), "speed scale wave %d" % row["wave"])
		assert_true(is_equal_approx(info["interval"], row["spawn_interval"]), "interval wave %d" % row["wave"])


func test_enemies_rise_at_the_far_gates() -> void:
	var s := ArenaSim.new("ember_pyromancer", 3)
	s.mode = "play"
	s.player.pos = ArenaSim.gates()[0] * 0.8 # stand by the north gate
	var ev := F.run(s, 2.6)
	assert_eq(s.wave, 1)
	assert_eq(F.of_type(ev, "wave").size(), 1, "wave banner")
	var spawned := F.of_type(ev, "spawn")
	assert_true(spawned.size() >= 1)
	for sp in spawned:
		assert_true(sp["pos"].distance_to(ArenaSim.gates()[0]) > 5.0, "never at the nearest gate")
	var e = s.enemies[0]
	assert_eq(e.state, "spawn", "rising")
	F.run(s, 1.0)
	assert_eq(e.state != "spawn", true, "up after 0.9 s")


func test_clearing_a_wave_heals_refills_and_rests() -> void:
	var s := ArenaSim.new("ember_pyromancer", 3)
	s.mode = "play"
	F.run(s, 2.4)
	assert_eq(s.wave, 1)
	s.spawn_q = []
	for i in 4:
		s.spawn("thrall", Vector2(0, -8)).hp = 0
	s.player.hp = 40
	s.player.energy = 10
	s.barrels[0].alive = false
	var ev := F.run(s, 0.1)
	assert_eq(s.kills, 4, "four thralls")
	assert_eq(s.score, 40, "10 each on wave 1")
	assert_eq(F.of_type(ev, "waveClear").size(), 1)
	assert_eq(s.player.hp, 75.0, "+35")
	assert_eq(s.player.energy, 100.0)
	assert_eq(s.barrels[0].alive, true, "barrels restored")
	F.run(s, 3.3)
	assert_eq(s.wave, 1, "a 3.5 s break")
	F.run(s, 0.4)
	assert_eq(s.wave, 2)


func test_later_waves_score_more() -> void:
	var s := F.make()
	s.wave = 3
	var e = s.spawn("bulwark", Vector2(0, -6))
	e.hp = 0
	F.run(s, F.DT)
	assert_eq(s.score, 60, "40 x (1 + 0.25 x 2)")
