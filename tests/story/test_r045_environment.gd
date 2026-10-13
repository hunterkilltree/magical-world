extends "res://harness/test_case.gd"

const F := preload("res://tests/support/arena_fixture.gd")

var s


func before_each() -> void:
	s = F.make(false)


func test_puddles_soak_charge_and_freeze() -> void:
	var pd = s.puddles[0]
	s.player.pos = pd.pos
	F.run(s, F.DT)
	assert_true(s.player.st.wet > 0, "standing in water soaks you")
	s.player.pos = Vector2(0, 3.5)
	var e = s.spawn("hexcaller", pd.pos)
	e.atk_cd = 99
	e.speed = 0
	s._env_hit(pd, ["lightning"], false)
	assert_eq(pd.state, "charged")
	var hp0: float = e.hp
	F.run(s, 0.5)
	assert_true(e.hp < hp0, "the charged puddle hurts whoever is in it")
	F.run(s, 2.3)
	assert_eq(pd.state, "water", "2.6 s of charge")
	s._env_hit(pd, ["ice"], false)
	assert_eq(pd.state, "frozen")
	assert_eq(pd.t, 10.0, "frozen for 10 s")
	s._env_hit(pd, ["fire"], false)
	assert_eq(pd.state, "water", "fire thaws it")


func test_brush_burns_spreads_and_goes_out() -> void:
	var a = s.brush[0]
	s._env_hit(a, ["fire"], false)
	assert_eq(a.state, "burning")
	s.brush[1].pos = a.pos + Vector2(3.5, 0)
	F.run(s, 1.3)
	assert_eq(s.brush[1].state, "burning", "spreads after 1.2 s")
	s._env_hit(s.brush[1], ["water"], false)
	assert_eq(s.brush[1].state, "dry", "water puts it out")
	F.run(s, 4.0)
	assert_eq(a.state, "ash", "burns 5 s then ash")


func test_walking_through_burning_brush_hurts() -> void:
	var a = s.brush[0]
	s._env_hit(a, ["fire"], false)
	s.player.pos = a.pos
	F.run(s, 0.6)
	assert_true(s.player.hp < 100.0)
	assert_true(s.player.st.burn > 0)


func test_barrels_blow_up() -> void:
	var b = s.barrels[0]
	s.player.pos = b.pos + Vector2(0, 2.0)
	s._env_hit(b, ["fire"], false)
	var ev := F.run(s, 0.2)
	assert_eq(b.alive, false, "detonated")
	var blast := F.of_type(ev, "explode")
	assert_eq(blast.size(), 1)
	assert_eq(blast[0]["r"], 2.8)
	var mine := F.of_type(ev, "hurt").filter(func(e): return e["self"])
	assert_eq(mine.size(), 1, "it reaches you")
	assert_eq(mine[0]["reason"], "Too close to a rune barrel")
	s._env_hit(s.barrels[1], ["water"], false)
	assert_eq(s.barrels[1].fuse, 0.0, "water does not light a barrel")
