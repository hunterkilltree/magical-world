extends "res://harness/test_case.gd"

const F := preload("res://tests/support/arena_fixture.gd")

var s


func before_each() -> void:
	s = F.make()
	s.player.pos = Vector2.ZERO


func test_a_thrall_winds_up_then_lunges() -> void:
	var e = s.spawn("thrall", Vector2(0, -5))
	var states := {}
	var hp0: float = s.player.hp
	for i in 180:
		s.step(F.input(), F.DT)
		states[e.state] = true
		if s.player.hp < hp0:
			break
	assert_true(states.has("windup"), "a readable windup first")
	assert_eq(hp0 - s.player.hp, 10.0, "the lunge does 10")


func test_a_thrall_claws_walls_in_its_way() -> void:
	F.cast(s, ["earth", "earth"], Vector2(0, -6))
	var e = s.spawn("thrall", Vector2(0, -4))
	F.run(s, 3.0)
	assert_true(s.walls.any(func(w): return w.hp < w.max_hp) or s.walls.size() < 5, "it attacks the wall")


func test_the_bulwark_shield_blocks_bolts_not_boulders() -> void:
	var e = s.spawn("bulwark", Vector2(0, -5))
	e.face = atan2(0.0, 1.0) # facing the player (+z)
	e.atk_cd = 99
	e.speed = 0
	var ev := F.cast(s, ["arcane"], Vector2(0, -6))
	ev.append_array(F.run(s, 0.4))
	assert_true(F.tags(ev).has("blocked"), "BLOCKED")
	var after_bolt: float = e.hp
	assert_true(e.max_hp - after_bolt < 3.0, "a blocked bolt barely scratches: %s" % (e.max_hp - after_bolt))
	s.player.cd["cast"] = 0
	s.player.shape_cd = {}
	F.cast(s, ["earth"], Vector2(0, -6))
	F.run(s, 0.6)
	assert_true(after_bolt - e.hp > 5.0, "a boulder gets through")


func test_the_bulwark_slams_a_disc() -> void:
	var e = s.spawn("bulwark", Vector2(0, -2.2))
	e.face = 0.0
	e.atk_cd = 0
	var ev := F.run(s, 2.0)
	assert_eq(F.of_type(ev, "slam").size(), 1, "one slam")
	assert_eq(s.player.hp, 100.0 - 22.0, "22 damage")


func test_the_hexcaller_keeps_its_distance_and_shoots() -> void:
	var e = s.spawn("hexcaller", Vector2(0, -3))
	e.atk_cd = 99
	F.run(s, 2.0)
	assert_true(e.pos.distance_to(s.player.pos) > 4.0, "backs off: %s" % e.pos.distance_to(s.player.pos))
	e.atk_cd = 0
	var states := {}
	for i in 120:
		s.step(F.input(), F.DT)
		states[e.state] = true
	assert_true(states.has("charge"), "charges first")
	assert_true(s.player.hp < 100.0 or s.shots.any(func(b): return b.kind == "orb"), "fires an orb")


func test_a_dodge_slips_the_orb() -> void:
	var b = F.ArenaSim.Shot.new()
	b.id = 999
	b.kind = "orb"
	b.owner = "enemy"
	b.pos = Vector2(0, -1.5)
	b.vel = Vector2(0, 8.5)
	b.r = 0.3
	b.life = 3.0
	b.dmg = 12
	s.shots.append(b)
	var ev := F.run(s, F.DT, ["dodge"], Vector2(0, -1)) # straight through it
	ev.append_array(F.run(s, 0.25))
	assert_eq(s.player.hp, 100.0, "no damage while dodging")
	assert_true(F.tags(ev).has("evade"), "EVADE")
