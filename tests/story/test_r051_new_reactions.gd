extends "res://harness/test_case.gd"

const F := preload("res://tests/support/arena_fixture.gd")
const SpellBook := preload("res://scripts/core/spell_book.gd")

var s


func before_each() -> void:
	s = F.make(false)


func _pl(els: Array) -> Dictionary:
	return SpellBook.make_spell(els, {"shape": "bolt"})["payload"]


func _foe(at := Vector2(0, -8), kind := "hexcaller"):
	var e = s.spawn(kind, at)
	e.atk_cd = 99
	return e


func test_entangled() -> void:
	var e = _foe()
	e.st.wet = 2
	s.events = []
	s._apply_payload(e, _pl(["nature"]))
	assert_true(e.st.root >= 2.0, "wet + nature roots for 2 s: %s" % e.st.root)
	assert_true(F.tags(s.events).has("entangled"))
	var d = _foe(Vector2(5, -8))
	s._apply_payload(d, _pl(["nature"]))
	assert_true(absf(d.st.root - 0.8) < 0.01, "dry: a short root")


func test_kindled() -> void:
	var e = _foe()
	e.st.root = 1.0
	s.events = []
	s._apply_payload(e, _pl(["fire"]))
	assert_eq(e.st.burn_dps, 7.5, "burns 50% hotter")
	assert_true(F.tags(s.events).has("kindled"))


func test_fanned_and_windchill() -> void:
	var a = _foe(Vector2(0, -8))
	var b = _foe(Vector2(1.5, -8))
	var far = _foe(Vector2(8, -8))
	a.st.burn = 3
	a.st.burn_dps = 5
	s.events = []
	s._apply_payload(a, _pl(["wind"]))
	assert_true(b.st.burn > 0, "the fire spreads to a neighbour")
	assert_eq(far.st.burn, 0.0, "not across the court")
	assert_true(F.tags(s.events).has("fanned"))
	var w = _foe(Vector2(-6, -6))
	w.st.wet = 2
	s._apply_payload(w, _pl(["wind"]))
	assert_eq(w.st.chill, 1.0, "wind on wet chills")


func test_purged_and_true_damage() -> void:
	var e = _foe()
	e.st.curse = 2
	var hp0: float = e.hp
	s.events = []
	s._apply_payload(e, {"parts": {"light": 8.0}, "els": ["light"], "knock": 0.0})
	assert_true(is_equal_approx(hp0 - e.hp, 8.0 * 1.5 * 1.5), "x1.5 resist, x1.5 purge (the purge uses up the curse): %s" % (hp0 - e.hp))
	assert_eq(e.st.curse, 0.0, "the curse is lifted")
	assert_true(F.tags(s.events).has("purged"))
	var h = _foe(Vector2(4, -8))
	hp0 = h.hp
	s._apply_payload(h, SpellBook.resolve(["fire", "dark"])["payload"], {"scale": 1.0})
	var expected: float = SpellBook.resolve(["fire", "dark"])["payload"]["parts"]["dark"] + SpellBook.resolve(["fire", "dark"])["payload"]["parts"]["fire"]
	assert_true(is_equal_approx(hp0 - h.hp, expected), "Hellfire ignores the hexcaller's x0.5 dark resist")


func test_forced_freeze() -> void:
	var e = _foe()
	s._apply_payload(e, SpellBook.resolve(["ice", "ice"])["payload"])
	assert_eq(e.st.frozen, 6.0, "Glacier Prison freezes outright for 6 s")


func test_resists_for_the_new_elements() -> void:
	var th = _foe(Vector2(0, -8), "thrall")
	assert_eq(th.resist["light"], 1.3)
	assert_eq(th.resist["dark"], 0.7)
	var bw = _foe(Vector2(3, -8), "bulwark")
	assert_eq(bw.resist["wind"], 0.4)


func test_brush_fans_and_regrows() -> void:
	var a = s.brush[0]
	var b = s.brush[1]
	b.pos = a.pos + Vector2(5.5, 0)
	s._env_hit(a, ["fire"], false)
	s._env_hit(a, ["wind"], false)
	assert_eq(b.state, "burning", "wind carries the fire")
	a.state = "ash"
	s._env_hit(a, ["nature"], false)
	assert_eq(a.state, "dry", "nature regrows ash")
