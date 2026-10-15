extends "res://harness/test_case.gd"

const M := preload("res://tests/support/main_fixture.gd")
const SpellBook := preload("res://scripts/core/spell_book.gd")
const Roster := preload("res://scripts/core/wizard_roster.gd")
const Particles := preload("res://scripts/vfx/vfx_particles.gd")

var main


func after_test() -> void:
	if main:
		main.free()


# Lets the last cast play out (a delayed burst, candles, trails), then casts `els` from `book` at a
# point ahead and steps `n` frames; returns every particle spawned.
func _cast(book: String, els: Array, n := 20, aim := Vector2(0, -3)) -> Array:
	M.frames(main, 100, {"aim": aim})
	var p = main.sim.player
	main.sim.player.book = book
	p.energy = p.max_energy
	p.cd["cast"] = 0.0
	p.shape_cd.clear()
	main.view.director.particles.trace = []
	var actions := []
	for el in els:
		actions.append("el:" + el)
	actions.append("cast")
	M.frames(main, 1, {"actions": actions, "aim": aim})
	M.frames(main, 25 + n, {"aim": aim}) # the windup (R-073), then the spell
	var tr: Array = main.view.director.particles.trace
	main.view.director.particles.trace = null
	return tr


func _tagged(tr: Array, prefix: String) -> Array:
	return tr.filter(func(s): return String(s["o"].get("tag", "")).begins_with(prefix))


func test_each_school_has_its_own_look() -> void:
	var sigils := {}
	var motifs := {}
	for id in Roster.ids():
		var look: Dictionary = SpellBook.school(id).get("look", {})
		assert_true(look.has("sigil") and look.has("motif") and look.has("tint"), "%s has a look" % id)
		assert_eq(Color(look["tint"]), Color(Roster.find(id)["glow"]), "%s tints toward their own glow" % id)
		sigils[look.get("sigil")] = id
		motifs[look.get("motif")] = id
	assert_eq(sigils.size(), 6, "six circles")
	assert_eq(motifs.size(), 6, "six motifs")


func test_a_combo_takes_the_casters_colour_but_a_single_element_does_not() -> void:
	var court: Color = SpellBook.resolve(["fire", "water"])["color"]
	var seen := {}
	for id in Roster.ids():
		var glow := Color(SpellBook.school(id)["look"]["tint"])
		var c: Color = SpellBook.resolve(["fire", "water"], id)["color"]
		assert_true(_dist(c, glow) < _dist(court, glow), "%s: fire+water leans toward their glow" % id)
		seen[c.to_html()] = id
		assert_eq(SpellBook.resolve(["fire"], id)["color"], SpellBook.resolve(["fire"])["color"], "%s: single fire is shared" % id)
	assert_eq(seen.size(), 6, "six colours for one mix")
	# the court spells a wizard keeps take their colour too: Brann's Thunderflare is his
	var thunder: Color = SpellBook.resolve(["fire", "lightning"], "ember_pyromancer")["color"]
	assert_true(thunder != SpellBook.resolve(["fire", "lightning"])["color"], "a kept court spell is tinted")


func _dist(a: Color, b: Color) -> float:
	return Vector3(a.r - b.r, a.g - b.g, a.b - b.b).length()


func test_each_wizard_draws_their_own_circle() -> void:
	main = M.make(tree)
	for id in Roster.ids():
		_cast(id, ["fire", "water"], 2)
		assert_eq(main.view.director.last_sigil, SpellBook.school(id)["look"]["sigil"], id)
		_cast(id, ["earth"], 2)
		assert_eq(main.view.director.last_sigil, "rune", "%s: a single element keeps the court's rune" % id)
	_cast("", ["fire", "water"], 2)
	assert_eq(main.view.director.last_sigil, "rune", "the court book keeps its rune")


func test_the_same_combo_carries_each_schools_motif() -> void:
	main = M.make(tree)
	var looks := {}
	for id in Roster.ids():
		looks[id] = SpellBook.school(id)["look"]["motif"]
	for id in Roster.ids():
		var tr := _cast(id, ["fire", "water"], 24)
		var mine := _tagged(tr, "school:" + looks[id])
		assert_true(mine.size() >= 6, "%s: %d %s motes" % [id, mine.size(), looks[id]])
		for other in looks:
			if other != id:
				assert_eq(_tagged(tr, "school:" + looks[other]).size(), 0, "%s shows no %s" % [id, looks[other]])
	var court := _cast("", ["fire", "water"], 24)
	assert_eq(_tagged(court, "school:").size(), 0, "the court book has no school motif")


func test_the_motif_follows_the_spell_out_to_where_it_lands() -> void:
	main = M.make(tree)
	for e in [Vector2(0, -6), Vector2(1, -6.5)]:
		main.sim.spawn("thrall", e, 50.0, 0.0).atk_cd = 99
	# Aldric's fire+lightning is a volley of quills: the glyphs ride the quills and mark the hit
	var tr := _cast("arcane_archmage", ["fire", "lightning"], 40, Vector2(0, -6))
	var p: Vector2 = main.sim.player.pos
	var far := _tagged(tr, "school:glyphs").filter(func(s): return Vector2(s["at"].x, s["at"].z).distance_to(p) > 2.5)
	assert_true(far.size() >= 3, "glyphs away from the caster: %d" % far.size())


func test_elements_light_their_quarters_of_the_circle() -> void:
	# Earth in the north (up the screen), air in the east, fire in the south, water in the west,
	# spirit (arcane) at the heart: each element of a combo marks its own quarter around the caster.
	main = M.make(tree)
	var p: Vector2 = main.sim.player.pos
	var where := {"fire": Vector2(0, 1), "water": Vector2(-1, 0), "earth": Vector2(0, -1), "wind": Vector2(1, 0),
		"ice": Vector2(-1, 0), "lightning": Vector2(1, 0), "light": Vector2(0, 1), "nature": Vector2(0, -1)}
	for pair in [["fire", "water"], ["earth", "wind"], ["ice", "lightning"], ["light", "nature"]]:
		var tr := _cast("", pair, 2)
		for el in pair:
			var marks := _tagged(tr, "quarter:" + el)
			assert_true(marks.size() >= 3, "%s lights its quarter" % el)
			for s in marks.slice(0, 3):
				var d := (Vector2(s["at"].x, s["at"].z) - p).normalized()
				assert_true(d.dot(where[el]) > 0.6, "%s mark lies %s of the caster: %s" % [el, where[el], d])
	var heart := _tagged(_cast("", ["arcane", "fire"], 2), "quarter:arcane")
	assert_true(heart.size() >= 3, "arcane marks the heart")
	for s in heart:
		assert_true(Vector2(s["at"].x, s["at"].z).distance_to(p) < 0.6, "at the centre")
	assert_eq(_tagged(_cast("", ["fire"], 2), "quarter:").size(), 0, "a single element lights no quarters")


func test_a_school_combo_stays_within_a_third_of_the_pools() -> void:
	main = M.make(tree)
	for id in Roster.ids():
		var tr := _cast(id, ["arcane", "fire", "lightning"], 60)
		var sprites := tr.filter(func(s): return s["kind"] == "sprite").size()
		var sparks := tr.filter(func(s): return s["kind"] == "spark").size()
		assert_true(sprites < Particles.SMOKE_MAX / 3, "%s sprites %d" % [id, sprites])
		assert_true(sparks < Particles.SPARK_MAX / 3, "%s sparks %d" % [id, sparks])
