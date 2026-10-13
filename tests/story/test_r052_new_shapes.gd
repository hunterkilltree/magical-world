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


func test_a_beam_hits_the_whole_line_and_stops_at_a_pillar() -> void:
	var near = _foe(Vector2(3, 0))
	var far = _foe(Vector2(9, 0.3))
	var off = _foe(Vector2(6, 3))
	var ev := F.cast(s, ["light", "lightning"], Vector2(6, 0))
	assert_true(near.hp < near.max_hp and far.hp < far.max_hp, "Photon Railgun pierces the line")
	assert_eq(off.hp, off.max_hp, "but not beside it")
	assert_eq(F.of_type(ev, "beam").size(), 1)
	# The pillar at (0, -7) blocks a beam fired straight north from (0, -4).
	var s2 := F.make()
	s2.player.pos = Vector2(0, -4)
	var behind = s2.spawn("hexcaller", Vector2(0, -10))
	behind.atk_cd = 99
	F.cast(s2, ["light"], Vector2(0, -12))
	assert_eq(behind.hp, behind.max_hp, "the pillar takes it")


func test_healing_areas_heal_you() -> void:
	s.player.hp = 40
	F.cast(s, ["nature", "nature"], Vector2(0, 0.5))
	var ev := F.run(s, 2.0)
	assert_true(s.player.hp > 55.0, "World Tree heals: %s" % s.player.hp)
	assert_true(F.of_type(ev, "heal").size() >= 3)


func test_black_hole_swallows_shots() -> void:
	F.cast(s, ["dark", "dark"], Vector2(0, -6))
	var b = F.ArenaSim.Shot.new()
	b.id = 999
	b.kind = "orb"
	b.owner = "enemy"
	b.pos = Vector2(0, -6)
	b.vel = Vector2(0, 8.5)
	b.r = 0.3
	b.life = 3
	b.dmg = 12
	s.shots.append(b)
	var ev := F.run(s, F.DT)
	assert_eq(s.shots.size(), 0, "eaten")
	assert_true(F.tags(ev).has("swallowed"))


func test_meteor_shower_drops_four() -> void:
	F.cast(s, ["earth", "fire", "lightning"], Vector2(0, -7))
	var ev := F.run(s, 2.5)
	assert_eq(F.of_type(ev, "explode").size(), 4, "four meteors")


func test_supernova_leaves_a_sea_of_fire() -> void:
	F.cast(s, ["fire", "fire"], Vector2(0, -7))
	F.run(s, 0.8)
	assert_true(s.areas.any(func(a): return a.key == "burning"), "fire left behind")


func test_wooden_walls_grow_back() -> void:
	F.cast(s, ["earth", "nature"], Vector2(0, -6))
	assert_eq(s.walls.size(), 5)
	var w = s.walls[0]
	w.hp = 50
	F.run(s, 1.0)
	assert_true(w.hp > 55.0, "regrows: %s" % w.hp)


func test_crystal_walls_reflect_orbs() -> void:
	F.cast(s, ["earth", "light"], Vector2(6, 0))
	var hex = _foe(Vector2(9, 0))
	var b = F.ArenaSim.Shot.new()
	b.id = 999
	b.kind = "orb"
	b.owner = "enemy"
	b.pos = Vector2(8, 0)
	b.vel = Vector2(-8.5, 0)
	b.r = 0.3
	b.life = 3
	b.dmg = 12
	s.shots.append(b)
	var ev := F.run(s, 1.0)
	assert_true(F.tags(ev).has("reflected"), "REFLECTED")
	assert_true(hex.hp < hex.max_hp, "the hex hits its own caster")
	assert_eq(s.player.hp, 100.0)
