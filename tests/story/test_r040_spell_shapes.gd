extends "res://harness/test_case.gd"

const F := preload("res://tests/support/arena_fixture.gd")

var s


func before_each() -> void:
	s = F.make()
	s.player.pos = Vector2.ZERO


func _foe(at: Vector2, kind := "hexcaller"):
	var e = s.spawn(kind, at)
	e.atk_cd = 99
	e.speed = 0
	return e


func test_a_cone_hits_what_is_in_its_arc() -> void:
	var front = _foe(Vector2(0, -3))
	var behind = _foe(Vector2(0, 3))
	F.cast(s, ["fire"], Vector2(0, -6))
	assert_true(front.hp < front.max_hp, "in front: hit")
	assert_true(front.st.burn > 0, "and burning")
	assert_eq(behind.hp, behind.max_hp, "behind: untouched")


func test_bolts_fan_and_pierce() -> void:
	F.cast(s, ["arcane", "ice"], Vector2(0, -6))
	assert_eq(s.shots.size(), 5, "Prism Lances: five in a fan")
	var a = _foe(Vector2(0, -3))
	var b = _foe(Vector2(0, -5))
	s.shots = []
	s.player.cd["cast"] = 0
	F.cast(s, ["arcane"], Vector2(0, -6))
	F.run(s, 0.5)
	assert_true(a.hp < a.max_hp and b.hp < b.max_hp, "Arcane Bolt pierces one")


func test_a_chain_jumps() -> void:
	var foes := [_foe(Vector2(0, -3)), _foe(Vector2(1.5, -5)), _foe(Vector2(3, -6.5)), _foe(Vector2(4.5, -8))]
	var ev := F.cast(s, ["lightning"], Vector2(0, -6))
	var hit := foes.filter(func(e): return e.hp < e.max_hp).size()
	assert_eq(hit, 3, "Arc hits one and jumps to two more")
	assert_eq(F.of_type(ev, "chain")[0]["pts"].size(), 4, "start + three targets")


func test_boulders_splash_and_leave_ground() -> void:
	var a = _foe(Vector2(0, -4))
	var b = _foe(Vector2(1.0, -4.2))
	F.cast(s, ["earth", "fire"], Vector2(0, -6))
	F.run(s, 0.6)
	assert_true(a.hp < a.max_hp and b.hp < b.max_hp, "Molten Core splashes")
	assert_true(s.areas.any(func(x): return x.key == "burning"), "burning ground left behind")


func test_lodestone_discharges() -> void:
	var foes := [_foe(Vector2(0, -4)), _foe(Vector2(2, -4)), _foe(Vector2(-2, -4)), _foe(Vector2(0, -6.5))]
	F.cast(s, ["earth", "lightning"], Vector2(0, -6))
	var ev := F.run(s, 0.5)
	assert_true(F.of_type(ev, "chain").size() >= 1, "it discharges")
	assert_true(foes.filter(func(e): return e.hp < e.max_hp).size() >= 3, "into nearby enemies")


func test_areas_tick_pull_and_starfall_lands_late() -> void:
	var e = _foe(Vector2(2.5, -6))
	F.cast(s, ["arcane", "water"], Vector2(0, -6))
	F.run(s, 1.0)
	assert_true(e.pos.distance_to(Vector2(0, -6)) < 2.0, "Undertow pulls to the centre: %s" % e.pos)
	s.areas = []
	s.player.shape_cd = {}
	var f = _foe(Vector2(0, -6), "bulwark")
	f.T = f.T.duplicate()
	f.T.erase("shield") # so the test does not depend on which way it faces
	F.run(s, 0.5)
	F.cast(s, ["arcane", "fire", "lightning"], Vector2(0, -6))
	F.run(s, 0.8)
	assert_eq(f.hp, f.max_hp, "Starfall has not landed yet")
	var ev := F.run(s, 0.4)
	assert_true(f.hp < f.max_hp, "a second later it lands")
	assert_true(F.of_type(ev, "explode").size() >= 1)


func test_walls_block_enemies_and_their_shots_not_yours() -> void:
	F.cast(s, ["earth", "earth"], Vector2(0, -6))
	assert_eq(s.walls.size(), 5, "Stone Rampart: five segments")
	assert_eq(s.walls[0].hp, 140.0)
	var orb_from := Vector2(0, -6)
	s.shots.append(_orb(orb_from, Vector2(0, 8.5)))
	var hp0: float = s.player.hp
	F.run(s, 1.0)
	assert_eq(s.player.hp, hp0, "the orb hit the wall")
	assert_true(s.walls[2].hp < 140.0, "and damaged it")
	var e = _foe(Vector2(0, -5))
	s.player.cd["cast"] = 0
	F.cast(s, ["arcane"], Vector2(0, -6))
	F.run(s, 0.4)
	assert_true(e.hp < e.max_hp, "your bolt passes the wall")


func test_fire_melts_ice_walls() -> void:
	F.cast(s, ["earth", "ice"], Vector2(0, -6))
	assert_eq(s.walls.size(), 6, "Rime Bulwark: six segments")
	var w = s.walls[0]
	s._wall_hit(w, {"parts": {"fire": 6.0}, "burn": 3.0, "els": ["fire"]}, 1.0)
	assert_eq(w.hp, 80.0 - 18.0, "x3 against ice")


func _orb(at: Vector2, vel: Vector2):
	var b = F.ArenaSim.Shot.new()
	b.id = 999
	b.kind = "orb"
	b.owner = "enemy"
	b.pos = at
	b.vel = vel
	b.r = 0.3
	b.life = 3.0
	b.dmg = 12
	return b
