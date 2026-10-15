extends "res://harness/test_case.gd"

const F := preload("res://tests/support/arena_fixture.gd")

var s


func before_each() -> void:
	s = F.make()
	s.player.pos = Vector2.ZERO


func _self_hurts(events: Array) -> Array:
	return F.of_type(events, "hurt").filter(func(e): return e["self"])


func test_a_point_blank_thunderflare_catches_you() -> void:
	var e = s.spawn("hexcaller", Vector2(0, -1.3))
	e.atk_cd = 99
	var ev := F.cast(s, ["fire", "lightning"], Vector2(0, -6))
	ev.append_array(F.run(s, 0.3))
	var mine := _self_hurts(ev)
	assert_true(mine.size() >= 1, "your own blast hurts you")
	assert_eq(mine[0]["reason"], "Caught in your own blast")
	assert_true(s.stats["self_dmg"] > 0)


func test_point_blank_explosive_around_you() -> void:
	var ev := F.cast(s, ["fire", "lightning"], Vector2(0, -6), "nova")
	var mine := _self_hurts(ev)
	assert_eq(mine.size(), 1)
	assert_eq(mine[0]["reason"], "Point-blank Thunderflare")


func test_standing_in_your_own_field_freezes_you() -> void:
	F.cast(s, ["ice", "water", "water"], Vector2(0, 0), "nova")
	F.run(s, 1.2)
	assert_true(s.player.st.frozen > 0 or s.player.st.chill > 0, "Hoarfrost hits you too")


func test_lightning_while_wet() -> void:
	s.player.st.wet = 2
	var ev := F.cast(s, ["lightning"], Vector2(0, -6))
	var mine := _self_hurts(ev)
	assert_eq(mine.size(), 1)
	assert_eq(mine[0]["dmg"], 7.0)
	assert_eq(mine[0]["reason"], "Cast lightning while wet")
	assert_true(s.player.st.shock > 0, "and shocked")


func test_starfall_on_your_own_head() -> void:
	F.cast(s, ["arcane", "fire", "lightning"], Vector2(0, -0.5))
	var ev := F.run(s, 1.2)
	var mine := _self_hurts(ev)
	assert_true(mine.size() >= 1, "Starfall hits you if you stay under it")
	assert_true(mine[0]["reason"].begins_with("Stood under your own"))
