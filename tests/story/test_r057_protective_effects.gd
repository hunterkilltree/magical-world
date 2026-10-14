extends "res://harness/test_case.gd"

const F := preload("res://tests/support/arena_fixture.gd")
const SpellBook := preload("res://scripts/core/spell_book.gd")

var s


func before_each() -> void:
	s = F.make()
	s.player.pos = Vector2.ZERO


func test_forest_fortress_armor() -> void:
	F.cast(s, ["earth", "nature"], Vector2(0, -6))
	assert_true(s.player.st.armor > 9.9, "armour for 10 s")
	assert_true(is_equal_approx(s._hurt(s.player, 17.5, "phys"), 10.0), "+75% armour")


func test_crystal_garden_reflects() -> void:
	F.cast(s, ["earth", "light"], Vector2(0, -6))
	assert_true(s.player.st.reflect > 6.9, "reflect for 7 s")
	var e = s.spawn("thrall", Vector2(1, 0))
	var hp0: float = e.hp
	s._enemy_hits(e, s.player, 10.0, "phys")
	assert_true(is_equal_approx(hp0 - e.hp, 5.0), "half comes back, raw: %s" % (hp0 - e.hp))


func test_world_tree_invulnerability_and_revive() -> void:
	F.cast(s, ["nature", "nature"], Vector2(0, 0.5))
	assert_eq(s.player.revives, 1, "a revive charge")
	F.run(s, 0.6)
	assert_eq(s._hurt(s.player, 50, "phys"), 0.0, "invulnerable under the tree")
	s.areas = []
	F.run(s, 0.5)
	s._hurt(s.player, 500, "phys")
	F.run(s, F.DT)
	assert_true(s.player.alive, "revived")
	assert_eq(s.player.hp, 50.0)
	assert_eq(s.player.revives, 0)
	assert_eq(s.mode, "play")


func test_rainbow_mist_cleanses() -> void:
	F.cast(s, ["water", "light"], Vector2(0, 0.5))
	s.player.st.burn = 3
	s.player.st.slow = 2
	s.player.st.chill = 2
	F.run(s, 0.9) # the next tick, after the cast's brief time-freeze
	assert_eq(s.player.st.burn, 0.0)
	assert_eq(s.player.st.slow, 0.0)
	assert_eq(s.player.st.chill, 0.0)


func test_death_forest_soul_drain() -> void:
	s.player.hp = 50
	var e = s.spawn("bulwark", Vector2(0, -6))
	e.atk_cd = 99
	var pl: Dictionary = SpellBook.resolve(["dark", "nature"])["payload"]
	var hp0: float = s.player.hp
	var dealt: float = s._apply_payload(e, pl)
	assert_true(s.player.hp > hp0, "drains")
	assert_true(s.player.hp - hp0 >= dealt * 0.3 - 0.001, "at least 30%% of the damage: %s of %s" % [s.player.hp - hp0, dealt])
