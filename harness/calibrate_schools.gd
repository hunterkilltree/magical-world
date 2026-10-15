extends SceneTree

# Reports the `mult` each school spell (data/schools.json, R-067) needs to sit on its target on the
# spell bench (tests/support/spell_bench.gd): the court's rate for its shape, scaled by how hard its
# elements hit. Prints only the spells more than 5% off, with the mult to write into schools.json
# (and burnMult, which scales with it for fire). Changes no files.
#   godot --headless --path . --script res://harness/calibrate_schools.gd
const Bench := preload("res://tests/support/spell_bench.gd")
const SpellBook := preload("res://scripts/core/spell_book.gd")


func _scale(def: Dictionary, f: float) -> void:
	def["mult"] = f
	if def.has("burnMult"):
		def["burnMult"] = f


func _init() -> void:
	print("court rates by shape: ", Bench.court_rates())
	var off := 0
	for id in SpellBook.schools():
		var b := SpellBook.book(id)
		for mix in SpellBook.school(id)["combos"]:
			var def: Dictionary = b[mix]
			if def["shape"] == "wall" or mix == "water+water":
				continue
			var els := Array(mix.split("+"))
			var target: float = Bench.target(els, def["shape"])
			var f0: float = def["mult"]
			var d0: float = Bench.measure(id, els)["dpe"]
			if absf(d0 / target - 1.0) <= 0.05:
				continue
			off += 1
			# secant steps: damage is close to linear in mult, but statuses and burn make it not quite
			var f1 := f0 * target / maxf(0.01, d0)
			_scale(def, f1)
			var d1: float = Bench.measure(id, els)["dpe"]
			for i in 8:
				if absf(d1 / target - 1.0) <= 0.03:
					break
				var f2: float = f1 + (target - d1) * (f1 - f0) / (d1 - d0) if absf(d1 - d0) > 1e-4 else f1 * target / maxf(0.01, d1)
				f0 = f1
				d0 = d1
				f1 = maxf(0.02, f2)
				_scale(def, f1)
				d1 = Bench.measure(id, els)["dpe"]
			print("%s %s (%s): mult %.2f -> %.2f  (%.2f per energy, held to %.2f)" % [id, mix, def["name"],
				SpellBook.school(id)["combos"][mix]["mult"], snappedf(f1, 0.01), d1, target])
	print("%d school spells off their target by more than 5%%" % off)
	quit()
