extends "res://harness/test_case.gd"

const F := preload("res://tests/support/arena_fixture.gd")
const SpellBook := preload("res://scripts/core/spell_book.gd")

var s


func before_each() -> void:
	s = F.make()
	s.player.pos = Vector2.ZERO


func _orb(at: Vector2, vel: Vector2):
	var b = F.ArenaSim.Shot.new()
	b.id = 999
	b.kind = "orb"
	b.owner = "enemy"
	b.pos = at
	b.vel = vel
	b.r = 0.3
	b.life = 3
	b.dmg = 12
	return b


func test_supernova_two_blasts_and_ten_seconds_of_burning_land() -> void:
	F.cast(s, ["fire", "fire"], Vector2(0, -7))
	var ev := F.run(s, 1.5)
	assert_eq(F.of_type(ev, "explode").size(), 2, "multi-stage")
	var land = s.areas.filter(func(a): return a.key == "burning")
	assert_eq(land.size(), 1)
	assert_eq(land[0].max_life, 10.0, "10 s of burning land")
	assert_eq(SpellBook.resolve(["fire", "fire"])["payload"]["burnDps"], SpellBook.resolve(["fire"])["payload"]["burnDps"] * 2 * 2,
		"severe burn: two fires x2")


func test_tsunami_washes_shots_away_and_leaves_a_pool() -> void:
	s.shots.append(_orb(Vector2(0, -3), Vector2(0, 8.5)))
	var ev := F.cast(s, ["water", "water"], Vector2(0, -6))
	assert_eq(s.shots.size(), 0, "deflected")
	assert_true(F.tags(ev).has("deflected"))
	assert_eq(s.areas.filter(func(a): return a.key == "water_pool").size(), 1, "a water pool")


func test_magnetic_field_deflects_and_repels() -> void:
	F.cast(s, ["earth", "earth", "lightning"], Vector2(0, -5))
	var e = s.spawn("thrall", Vector2(0.5, -5))
	e.atk_cd = 99
	e.speed = 0
	s.shots.append(_orb(Vector2(1, -5), Vector2(0, 0.1)))
	var ev := F.run(s, 0.5)
	assert_true(F.tags(ev).has("deflected"), "the orb is destroyed")
	assert_true(e.pos.distance_to(Vector2(0, -5)) > 1.0, "the thrall is pushed out: %s" % e.pos)


func test_mountain_rise_is_a_wall() -> void:
	F.cast(s, ["earth", "earth", "water"], Vector2(0, -6))
	assert_eq(s.walls.size(), 7)


func test_thermal_shock() -> void:
	var e = s.spawn("hexcaller", Vector2(0, -6))
	e.atk_cd = 99
	e.st.frozen = 2
	var hp0: float = e.hp
	s.events = []
	s._apply_payload(e, {"parts": {"fire": 10.0}, "burn": 3.0, "burnDps": 5.0, "els": ["fire"], "knock": 0.0})
	assert_true(is_equal_approx(hp0 - e.hp, 18.0), "fire on a frozen enemy x1.8: %s" % (hp0 - e.hp))
	assert_true(F.tags(s.events).has("thermal"), "THERMAL SHOCK")
	assert_eq(e.st.frozen, 0.0, "and it thaws")
	var hits := F.of_type(s.events, "hit")
	assert_true(hits[0]["crit"], "shown as a critical hit")


func test_plasma_spear_and_steam_bomb() -> void:
	var a = s.spawn("bulwark", Vector2(4, 0))
	a.atk_cd = 99
	var ev := F.cast(s, ["fire", "lightning", "lightning"], Vector2(8, 0))
	assert_eq(F.of_type(ev, "beam").size(), 1, "Plasma Spear is a beam")
	assert_true(a.hp < a.max_hp)
	s.player.shape_cd = {}
	s.player.cd["cast"] = 0
	F.cast(s, ["fire", "water", "water"], Vector2(-5, 0))
	var cloud = s.areas.filter(func(x): return x.key == "fire+water+water")
	assert_eq(cloud.size(), 1, "Steam Bomb is a cloud")
	assert_eq(cloud[0].r, 4.4)
