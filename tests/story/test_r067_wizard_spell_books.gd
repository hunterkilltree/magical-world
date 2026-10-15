extends "res://harness/test_case.gd"

const SpellBook := preload("res://scripts/core/spell_book.gd")
const Roster := preload("res://scripts/core/wizard_roster.gd")
const ArenaSim := preload("res://scripts/core/arena_sim.gd")
const F := preload("res://tests/support/arena_fixture.gd")
const Bench := preload("res://tests/support/spell_bench.gd")

const BAND := 0.25 # a school spell's damage per energy, against the court's rate for its shape and elements
const WALL_BAND := 0.2 # a school wall's total health, against the court's median walls
const VISUALS := ["wildfire", "steam_cloud", "black_hole", "vortex", "magma", "mud", "magnetic", "thunder_pool"]
const COURT_ONLY := ["invulnerable", "revive", "armor", "reflectPlayer", "pool", "cleanse", "heal", "swallow", "deflect",
	"deflectField", "repel"]
const KNOWN := ["name", "desc", "shape", "mult", "burnMult", "cd", "visual", "range", "arc", "knock", "count", "spread",
	"speed", "radius", "pierce", "life", "explode", "splash", "jumps", "chainOnImpact", "width", "delay", "burst",
	"hitsAll", "tick", "pull", "repeat", "interval", "scatter", "leaves", "segments", "hp", "mat", "touchChill", "regen",
	"reflect"] + SpellBook.DEF_PAYLOAD


func _mixes() -> Array:
	return SpellBook.book().keys().filter(func(k): return "+" in k)


func _els(mix: String) -> Array:
	return Array(mix.split("+"))


func test_every_wizard_learned_every_mix() -> void:
	assert_eq(_mixes().size(), 70, "two- and three-element mixes in the court book")
	for id in Roster.ids():
		var sc := SpellBook.school(id)
		assert_true(sc.get("name", "") != "", "%s has a school" % id)
		var b := SpellBook.book(id)
		assert_eq(b.size(), 80, id)
		for mix in _mixes():
			assert_true(b.has(mix), "%s knows %s" % [id, mix])


func test_single_elements_are_the_same_for_everyone() -> void:
	for id in Roster.ids():
		for el in SpellBook.ORDER:
			assert_true(not SpellBook.school(id)["combos"].has(el), "%s keeps the court's %s" % [id, el])
			var sp := SpellBook.resolve([el], id)
			assert_eq(sp["name"], SpellBook.resolve([el])["name"], "%s %s" % [id, el])
			assert_eq(sp["key"], el)


func test_each_court_spell_is_kept_by_exactly_one_wizard() -> void:
	for mix in _mixes():
		var keepers := Roster.ids().filter(func(id): return not SpellBook.school(id)["combos"].has(mix))
		assert_eq(keepers.size(), 1, "%s kept by %s" % [mix, keepers])
		if keepers.size() == 1:
			var sp := SpellBook.resolve(_els(mix), keepers[0])
			assert_eq(sp["name"], SpellBook.book()[mix]["name"], mix)
			assert_eq(sp["key"], mix, "a kept court spell keeps its key")


func test_a_mix_makes_a_different_spell_for_each_wizard() -> void:
	var count := {}
	for mix in _mixes():
		var names := {}
		var shapes := {}
		for id in Roster.ids():
			var sp := SpellBook.resolve(_els(mix), id)
			assert_true(not names.has(sp["name"]), "%s: %s and %s both cast %s" % [mix, names.get(sp["name"]), id, sp["name"]])
			names[sp["name"]] = id
			shapes[sp["def"]["shape"]] = true
			count[sp["name"]] = count.get(sp["name"], 0) + 1
		assert_true(shapes.size() >= 3, "%s takes at least three shapes across the six books" % mix)
	for el in SpellBook.ORDER:
		assert_true(not count.has(SpellBook.resolve([el])["name"]), "a combo is named like a single element")
	for n in count:
		assert_eq(count[n], 1, "%s names one spell" % n)
	assert_eq(count.size(), 420, "70 mixes x 6 wizards")


func test_school_spells_cast_under_their_own_key() -> void:
	var sp := SpellBook.resolve(["water", "fire"], "arcane_archmage")
	assert_eq(sp["key"], "fire+water@arcane_archmage")
	assert_eq(sp["name"], SpellBook.school("arcane_archmage")["combos"]["fire+water"]["name"])
	assert_eq(SpellBook.resolve(["fire", "water"], "arcane_archmage")["key"], sp["key"], "order does not matter")
	var g := SpellBook.grimoire("arcane_archmage")
	assert_eq(g.size(), 80)
	assert_eq(g.filter(func(e): return e["own"]).size(), SpellBook.school("arcane_archmage")["combos"].size(), "own entries")


func test_the_resolve_rules_hold_in_every_book() -> void:
	for id in Roster.ids():
		var b := SpellBook.book(id)
		var three := SpellBook.resolve(["ice", "ice", "ice"], id)
		assert_eq(three["name"], b["ice+ice"]["name"], "%s: three of a kind powers up the double" % id)
		assert_true(is_equal_approx(three["power"], 1.3), id)
		assert_eq(three["key"], SpellBook.key_of(b, "ice+ice"))
		var rep := SpellBook.resolve(["lightning", "earth", "lightning"], id)
		assert_eq(rep["name"], b["earth+lightning"]["name"], "%s: a repeat adds 30%%" % id)
		assert_true(is_equal_approx(rep["power"], 1.3), id)
		# fire, water and earth have no three-element entry: the best pair of this book carries the third
		var ride := SpellBook.resolve(["fire", "water", "earth"], id)
		var best := ""
		for k in ["earth+fire", "earth+water", "fire+water"]:
			if best == "" or SpellBook.RANK.find(b[k]["shape"]) < SpellBook.RANK.find(b[best]["shape"]):
				best = k
		assert_true(ride["name"].begins_with(b[best]["name"] + " + "), "%s rides %s: %s" % [id, best, ride["name"]])
		assert_true(is_equal_approx(ride["power"], 1.15), id)
		assert_true(not b.has("fire+ice") and not b.has("dark+light"), "%s: opposites still cancel" % id)


func test_the_caster_casts_from_their_own_book() -> void:
	var seen := {}
	for id in Roster.ids():
		var s := ArenaSim.new(id, 3)
		s.mode = "play"
		s.wave_t = 1e9
		var ev := F.of_type(F.cast(s, ["fire", "water"], Vector2(0, -2)), "cast")
		assert_eq(ev.size(), 1, id)
		assert_eq(ev[0]["name"], SpellBook.resolve(["fire", "water"], id)["name"], id)
		assert_true(s.stats["found"].has(SpellBook.resolve(["fire", "water"], id)["key"]), "%s found it under its key" % id)
		seen[ev[0]["name"]] = true
	assert_eq(seen.size(), 6, "six wizards, six different spells")
	var court := F.make()
	assert_eq(court.player.book, "", "the test arena casts from the court book")


func test_school_spells_use_only_known_mechanics() -> void:
	for id in Roster.ids():
		var combos: Dictionary = SpellBook.school(id)["combos"]
		for mix in combos:
			var d: Dictionary = combos[mix]
			var tag := "%s %s (%s)" % [id, mix, d.get("name", "?")]
			assert_true(d.get("name", "") != "" and d.get("desc", "") != "", tag + " has a name and a line")
			assert_true(SpellBook.data()["shapes"].has(d.get("shape", "")), tag + " shape")
			for k in d:
				assert_true(KNOWN.has(k), "%s: unknown key %s" % [tag, k])
				assert_true(not COURT_ONLY.has(k), "%s: %s stays with the court's spells" % [tag, k])
			var els := _els(mix)
			if d.has("leaves"):
				assert_true(els.has("fire"), tag + ": only fire leaves the ground burning")
			if d.has("burnMult"):
				assert_true(els.has("fire"), tag + ": burnMult needs fire")
			if d.has("chainOnImpact"):
				assert_true(els.has("lightning"), tag + ": only lightning jumps on impact")
			if d.has("visual"):
				assert_true(VISUALS.has(d["visual"]), tag + ": known area look")
			if d["shape"] == "wall":
				var mat: String = d.get("mat", "")
				assert_true(["stone", "ice", "wood", "crystal"].has(mat), tag + " material")
				assert_eq(d.has("touchChill"), mat == "ice", tag + ": ice walls chill")
				assert_eq(d.has("regen"), mat == "wood", tag + ": wood walls regrow")
				assert_eq(d.has("reflect"), mat == "crystal", tag + ": crystal walls reflect")
			elif mix != "water+water":
				# the court runs from 0.15 to 3.0; a one-off burst is held to the rate of long fields, so a little higher
				assert_true(float(d.get("mult", 0)) >= 0.1 and float(d["mult"]) <= 4.5, "%s: mult %s" % [tag, d.get("mult")])
			if d["shape"] == "area" and not d.get("burst", false) and els.has("fire"):
				# a field that burns and roots every tick kindles without end (arena_sim "kindled")
				assert_true(not els.has("nature") and not d.has("root"), tag + ": a field that burns must not root")


func test_every_school_spell_casts_aimed_and_around_you() -> void:
	var casts := 0
	for id in Roster.ids():
		for mix in SpellBook.school(id)["combos"]:
			for how in ["cast", "nova"]:
				var s := F.make()
				s.player.book = id
				var ev := F.cast(s, _els(mix), Vector2(0, -2), how)
				ev.append_array(F.run(s, 0.5))
				casts += F.of_type(ev, "cast").size()
	assert_eq(casts, 700, "350 school spells, aimed and as a nova")


func test_water_and_water_moves_enemies_instead() -> void:
	# water deals no damage, so the schools' versions of water+water push, pull or soak, like Tsunami
	for id in Roster.ids():
		var d: Dictionary = SpellBook.book(id)["water+water"]
		assert_true(d.has("knock") or d.has("pull") or d["shape"] == "chain", "%s: %s moves or soaks" % [id, d["name"]])


func test_school_spells_hit_like_the_courts_spells_of_their_shape() -> void:
	# held to the court's rate for the shape, scaled by how hard the elements hit (spell_bench.gd)
	var rates := Bench.court_rates()
	assert_eq(rates.size(), 6, "a rate for every shape but the wall")
	var bad := []
	var n := 0
	for id in Roster.ids():
		var combos: Dictionary = SpellBook.school(id)["combos"]
		for mix in combos:
			var shape: String = combos[mix]["shape"]
			if shape == "wall" or mix == "water+water":
				continue
			var r := Bench.measure(id, _els(mix))
			var want := Bench.target(_els(mix), shape)
			n += 1
			if absf(r["dpe"] / want - 1.0) > BAND:
				bad.append("%s %s %s: %.2f per energy, held to %.2f" % [id, mix, r["name"], r["dpe"], want])
	assert_true(n > 300, "benched %d school spells" % n)
	assert_eq(bad, [], "school spells off the court's rate")


func test_school_walls_hold_like_the_courts() -> void:
	var court := {2: [], 3: []}
	for mix in _mixes():
		var d: Dictionary = SpellBook.book()[mix]
		if d["shape"] == "wall":
			court[_els(mix).size()].append(float(d["hp"]) * int(d["segments"]))
	for id in Roster.ids():
		var combos: Dictionary = SpellBook.school(id)["combos"]
		for mix in combos:
			var d: Dictionary = combos[mix]
			if d["shape"] != "wall":
				continue
			var total := float(d["hp"]) * int(d["segments"])
			var m := Bench.median(court[_els(mix).size()])
			assert_true(absf(total / m - 1.0) <= WALL_BAND, "%s %s %s: %d health in all, court median %d" % [id, mix, d["name"], total, m])
