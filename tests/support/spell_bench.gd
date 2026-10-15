# A spell bench: casts one spell from a book at a fixed group of training dummies (five thralls that
# stand still, no resists, too tough to die) and reports what it did. `dpe` is damage per energy.
#
# The school spells (R-067) are held to the court book's rate for their shape, scaled by how hard
# their elements hit: `target(els, shape)` = `punch(els)` x the median, over the court's damaging
# spells of that shape, of dpe / punch. So a school bolt of water and wind hits as hard as a court
# bolt would with water and wind, which is softer than one of fire and lightning.
extends RefCounted

const ArenaSim := preload("res://scripts/core/arena_sim.gd")
const SpellBook := preload("res://scripts/core/spell_book.gd")
const DT := 1.0 / 60.0
const AIM := Vector2(0, -0.5)
const SPOTS := [Vector2(0, 0), Vector2(1.1, -0.3), Vector2(-1.1, -0.3), Vector2(0.6, -1.2), Vector2(-0.6, -1.2)]

static var _rates := {}


static func _arena(book: String) -> ArenaSim:
	var s := ArenaSim.new("", 5)
	s.player.book = book
	s.mode = "play"
	s.wave_t = 1e9
	s.puddles = []
	s.brush = []
	s.barrels = []
	s.player.pos = Vector2(0, 4)
	s.player.max_hp = 1e6
	s.player.hp = 1e6
	return s


static func _dummies(s: ArenaSim) -> Array:
	var out := []
	for o in SPOTS:
		var e = s.spawn("thrall", AIM + o, 1000.0, 0.0)
		e.resist = {}
		out.append(e)
	return out


# Steps until nothing the spell left behind can still hurt (or `max_t`); returns the time taken.
static func _settle(s: ArenaSim, dummies: Array, max_t: float) -> float:
	var t := DT
	while t < max_t:
		s.step({"move": Vector2.ZERO, "aim": AIM, "actions": []}, DT)
		t += DT
		if t > 0.5 and _spent(s, dummies):
			break
	return t


static func _dealt(dummies: Array) -> float:
	var dmg := 0.0
	for e in dummies:
		dmg += e.max_hp - e.hp
	return dmg


# Queues `els`, casts them from `book` ("" is the court book) and steps until the spell is spent.
# Returns {dmg, cost, dpe, name, shape, t}.
static func measure(book: String, els: Array, max_t := 9.0) -> Dictionary:
	var s := _arena(book)
	var dummies := _dummies(s)
	var sp := SpellBook.resolve(els, book)
	var actions := []
	for el in els:
		actions.append("el:" + el)
	actions.append("cast")
	s.step({"move": Vector2.ZERO, "aim": AIM, "actions": actions}, DT)
	var t := _settle(s, dummies, max_t)
	var dmg := _dealt(dummies)
	return {"dmg": dmg, "cost": sp["cost"], "dpe": dmg / maxf(1.0, sp["cost"]), "name": sp["name"],
		"shape": sp["def"]["shape"], "t": t}


# How hard a mix of elements hits on its own: one plain blast of their payload (mult 1) over the
# dummies, per 8 energy per element.
static func punch(els: Array) -> float:
	var s := _arena("")
	var dummies := _dummies(s)
	var sp := SpellBook.make_spell(els, {"shape": "area", "mult": 1.0})
	s._explode(AIM + Vector2(0, -0.4), 3.0, sp["payload"], {})
	_settle(s, dummies, 9.0)
	return _dealt(dummies) / (els.size() * 8.0)


# shape -> median of dpe / punch over the court's damaging two- and three-element spells.
static func court_rates() -> Dictionary:
	if not _rates.is_empty():
		return _rates
	var by := {}
	for mix in SpellBook.book():
		if not "+" in mix:
			continue
		var d: Dictionary = SpellBook.book()[mix]
		if d["shape"] == "wall":
			continue
		var els := Array(mix.split("+"))
		var r := measure("", els)
		var p := punch(els)
		if r["dpe"] < 1.0 or p <= 0.0:
			continue # a utility spell (Tsunami, Rainbow Mist, Absolute Zero...)
		by[d["shape"]] = by.get(d["shape"], []) + [r["dpe"] / p]
	for k in by:
		_rates[k] = median(by[k])
	return _rates


# The damage per energy a school spell of `shape` made of `els` is held to.
static func target(els: Array, shape: String) -> float:
	return punch(els) * court_rates()[shape]


static func median(a: Array) -> float:
	var s := a.duplicate()
	s.sort()
	var n := s.size()
	return s[n / 2] if n % 2 == 1 else (s[n / 2 - 1] + s[n / 2]) / 2.0


static func _spent(s, dummies: Array) -> bool:
	if not s.areas.is_empty():
		return false
	for b in s.shots:
		if b.owner == "player":
			return false
	for e in dummies:
		if e.st.burn > 0:
			return false
	return true
