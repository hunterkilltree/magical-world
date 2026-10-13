extends "res://harness/test_case.gd"

const F := preload("res://tests/support/arena_fixture.gd")
const SpellBook := preload("res://scripts/core/spell_book.gd")

var s


func before_each() -> void:
	s = F.make()


func _pl(els: Array) -> Dictionary:
	return SpellBook.make_spell(els, {"shape": "bolt"})["payload"]


func _target(kind := "hexcaller"):
	return s.spawn(kind, Vector2(0, -8))


func test_water_puts_out_fire_and_soaks() -> void:
	var e = _target()
	e.st.burn = 2.0
	s.events = []
	s._apply_payload(e, _pl(["water"]))
	assert_eq(e.st.burn, 0.0, "no longer burning")
	assert_eq(e.st.wet, 4.0, "soaked")
	assert_true(F.tags(s.events).has("steam"), "STEAM")


func test_fire_dries_thaws_or_burns() -> void:
	var e = _target()
	e.st.wet = 3.0
	s._apply_payload(e, _pl(["fire"]))
	assert_eq(e.st.wet, 0.0, "dried")
	assert_eq(e.st.burn, 0.0, "a wet target does not catch")
	e.st.frozen = 1.0
	s._apply_payload(e, _pl(["fire"]))
	assert_eq(e.st.frozen, 0.0, "thawed")
	s._apply_payload(e, _pl(["fire"]))
	assert_eq(e.st.burn, 3.0, "burns for 3 s")
	assert_eq(e.st.burn_dps, 5.0, "5 dps per fire")


func test_ice_puts_out_fire_freezes_wet_and_stacks_chill() -> void:
	var e = _target()
	e.st.burn = 2.0
	s._apply_payload(e, _pl(["ice"]))
	assert_eq(e.st.burn, 0.0, "fire out")
	assert_eq(e.st.chill, 0.0, "no chill when it only put out fire")
	e.st.wet = 2.0
	s._apply_payload(e, _pl(["ice"]))
	assert_eq(e.st.frozen, 2.4, "wet freezes")
	var d = _target()
	s._apply_payload(d, _pl(["ice"]))
	s._apply_payload(d, _pl(["ice"]))
	assert_eq(d.st.chill, 2.0, "two stacks")
	assert_eq(s.slow_mul(d.st), 1.0 - 2 * 0.16, "-16% speed a stack")
	s._apply_payload(d, _pl(["ice"]))
	assert_eq(d.st.frozen, 1.8, "three stacks freeze")
	assert_eq(d.st.chill, 0.0, "stacks spent")


func test_resist_conduct_and_shatter() -> void:
	var thrall = _target("thrall")
	var hp0: float = thrall.hp
	s._apply_payload(thrall, {"parts": {"fire": 6.0}, "els": ["fire"], "knock": 0.0})
	assert_true(is_equal_approx(hp0 - thrall.hp, 6.0 * 1.4), "thralls take x1.4 fire")
	var hex = _target()
	hex.st.wet = 2.0
	s.events = []
	hp0 = hex.hp
	s._apply_payload(hex, _pl(["lightning"]))
	assert_true(is_equal_approx(hp0 - hex.hp, 18.0), "lightning on wet doubles: %s" % (hp0 - hex.hp))
	assert_true(F.tags(s.events).has("conduct"), "CONDUCTED")
	var bul = _target("bulwark")
	bul.st.frozen = 1.0
	s.events = []
	hp0 = bul.hp
	s._apply_payload(bul, {"parts": {"earth": 12.0}, "els": ["earth"], "knock": 0.0})
	assert_true(is_equal_approx(hp0 - bul.hp, 12.0 * 0.5 * 2.2), "earth on frozen x2.2 (after resist 0.5)")
	assert_eq(bul.st.frozen, 0.0, "the freeze breaks")
	assert_true(F.tags(s.events).has("shatter"), "SHATTER")


func test_frozen_or_shocked_enemies_lose_their_windup() -> void:
	var e = s.spawn("thrall", s.player.pos + Vector2(0, -1.2))
	e.atk_cd = 0
	F.run(s, 0.1)
	assert_eq(e.state, "windup", "the thrall starts its attack")
	s._apply_payload(e, _pl(["lightning"]))
	var ev := F.run(s, F.DT)
	assert_eq(e.state, "recover", "interrupted")
	assert_true(F.tags(ev).has("interrupt"), "INTERRUPTED")
