# A zone's grid as the 3D diorama from story/design/zone-model.js: tiles as blocks of
# different heights, rock walls with a floor-coloured cap, cover boulders, crates, gates,
# chests, markers and the biome dressing (ice spikes, pines, basalt, dead trees, crystals).
# Built from the live ZoneGrid, so opened gates, burnt crates, broken ice and looted chests
# show; call build() again when signature() changes.
extends Node3D

const MeshKit = preload("res://scripts/view3d/mesh_kit.gd")

const T := 0.42  # one tile in world units (the design's tile size)
const HEIGHT := {".": 0.16, ",": 0.13, "#": 0.78, "~": 0.05, "^": 0.44, "w": 0.02}
const LOW_WALL := 0.26  # a wall with open ground just north of it would hide whoever stands there
# zones.json does not carry the biome per zone; the design's `dress`
const DRESS := {"tundra": "ice", "pine": "pine", "keep": "ruin", "volcano": "basalt", "bog": "bog", "cavern": "crystal"}

var grid = null


# Small deterministic brightness offset (-0.06 .. 0.06) so floors do not look stamped.
static func tile_shade(c: Vector2i) -> float:
	return float(absi((c.x * 73856093) ^ (c.y * 19349663)) % 13 - 6) / 100.0


static func cell_height(t: String) -> float:
	return HEIGHT.get(t, HEIGHT["."]) if t != " " else 0.0


# Wall height at c: full, or cut down to a rim when it stands between the camera and open
# ground (open ground within two tiles north of it).
static func wall_height(g, c: Vector2i) -> float:
	for dy in [1, 2]:
		if not (g.tile_at(c + Vector2i(0, -dy)) in ["#", " "]):
			return LOW_WALL
	return HEIGHT["#"]


# Centre of a cell in world space, at ground level (y = 0).
static func cell_pos(g, c: Vector2i) -> Vector3:
	return Vector3((c.x - (g.width - 1) / 2.0) * T, 0.0, (c.y - (g.height - 1) / 2.0) * T)


# Everything the model depends on that can change during a run.
static func signature(g) -> String:
	var parts := PackedStringArray()
	for y in g.height:
		var row := ""
		for x in g.width:
			row += g.tile_at(Vector2i(x, y))
		parts.append(row)
	parts.append(str(g.gates_open))
	parts.append(str(g.looted_cells().size()))
	return "|".join(parts)


func build(g) -> void:
	grid = g
	for c in get_children():
		c.free()
	var batch := MeshKit.Batch.new()
	var id: String = g.id
	var dress: String = DRESS.get(id, "ruin")
	var col: Dictionary = g.colors
	var rand := _Rng.new(id.length() * 7919 + 13)  # dressing: the design's sequence
	var m := {
		"floor": MeshKit.mat(id + "_floor", {"color": col["ground"], "roughness": 0.95}),
		"rough": MeshKit.mat(id + "_rough", {"color": col["rough"], "roughness": 0.98}),
		"rock": MeshKit.mat(id + "_rock", {"color": col["rock"], "roughness": 0.93}),
		"ledge": MeshKit.mat(id + "_ledge", {"color": col["ground"], "roughness": 0.85}),
		"hazard": MeshKit.mat(id + "_hazard", {"color": col["hazard"], "roughness": 0.3, "metalness": 0.15,
			"emissive": col["hazard"], "emissive_intensity": 0.35 if dress == "basalt" else 0.0}),
		"water": MeshKit.mat(id + "_broken_ice", {"color": "#1e4a66", "roughness": 0.08, "metalness": 0.2}),
		"glow": MeshKit.mat(id + "_glow", {"color": col["glow"], "emissive": col["glow"], "emissive_intensity": 0.75, "roughness": 0.3}),
		"cover": MeshKit.mat(id + "_cover", {"color": "#7f7a72", "roughness": 0.96}),
		"wood": MeshKit.mat("crate", {"color": "#6b4a28", "roughness": 0.92}),
		"metal": MeshKit.mat("gate_metal", {"color": "#6f6862", "roughness": 0.5, "metalness": 0.35}),
		"brass": MeshKit.mat("brass_trim", {"color": "#c9a227", "roughness": 0.36, "metalness": 0.4}),
		"friendly": MeshKit.mat("entry_marker", {"color": "#4ade80", "emissive": "#22c55e", "emissive_intensity": 0.6, "roughness": 0.35}),
		"hostile": MeshKit.mat("enemy_marker", {"color": "#ef4444", "emissive": "#dc2626", "emissive_intensity": 0.6, "roughness": 0.35}),
		"gate": MeshKit.mat("gate_marker", {"color": "#f7e26b", "emissive": "#eab308", "emissive_intensity": 0.55, "roughness": 0.35}),
		"destruct": MeshKit.mat("destruct_marker", {"color": "#a855f7", "emissive": "#9333ea", "emissive_intensity": 0.55, "roughness": 0.35}),
		"base": MeshKit.mat(id + "_base", {"color": Color(col["rock"]).darkened(0.75).to_html(false), "roughness": 1.0}),
	}

	# a dark plinth under the whole map, so the void reads as a drop
	batch.add(MeshKit.box(g.width * T + 2.0, 0.4, g.height * T + 2.0), m["base"], MeshKit.xform(Vector3(0, -0.22, 0)))

	for y in g.height:
		for x in g.width:
			var c := Vector2i(x, y)
			var ch: String = g.tile_at(c)
			if ch == " ":
				continue
			var p := cell_pos(g, c)
			var base := ch if ch in ["#", "~", "^", ",", "w"] else "."
			var h := wall_height(g, c) if base == "#" else cell_height(base)
			var mat: Material = {"#": m["rock"], "~": m["hazard"], ",": m["rough"], "^": m["ledge"], "w": m["water"]}.get(base, m["floor"])
			if base in [".", ","]:
				mat = _shaded(id, base, Color(col["ground"] if base == "." else col["rough"]), tile_shade(c))
			# full-width tiles: the design's 1.5% gaps show the dark base as seams from above
			batch.add(MeshKit.box(T, h, T), mat, MeshKit.xform(p + Vector3(0, h / 2.0, 0)))
			if base == "#":
				batch.add(MeshKit.box(T, 0.06, T), _shaded(id, "cap", Color(col["ground"]), tile_shade(c) * 0.6),
					MeshKit.xform(p + Vector3(0, h + 0.03, 0)))
			elif base == "^":
				batch.add(MeshKit.box(T * 0.99, 0.05, T * 0.99), m["brass"], MeshKit.xform(p + Vector3(0, h + 0.025, 0)))

	# ---- markers & props ----
	var seen := {}
	for y in g.height:
		for x in g.width:
			var c := Vector2i(x, y)
			var ch: String = g.tile_at(c)
			var left: String = g.tile_at(c + Vector2i.LEFT)
			# per-cell seed, so rebuilding after a crate burns does not reshuffle the boulders
			var cell_rand := _Rng.new(id.length() * 7919 + x * 131 + y * 8191)
			var p := cell_pos(g, c)
			var top := cell_height(ch if ch in ["#", "~", "^", ",", "w"] else ".")
			var at := func(dx: float, dy: float, dz: float) -> Vector3: return Vector3(p.x + dx, top + dy, p.z + dz)
			match ch:
				"o":
					for k in 3:
						batch.add(MeshKit.dodecahedron(0.085 + cell_rand.next() * 0.04), m["cover"],
							MeshKit.xform(at.call((cell_rand.next() - 0.5) * 0.22, 0.07, (cell_rand.next() - 0.5) * 0.22), Vector3(cell_rand.next() * 3, cell_rand.next() * 3, cell_rand.next() * 0.6)))
				"D":
					var ry := cell_rand.next() * 0.8
					batch.add(MeshKit.box(0.26, 0.24, 0.26), m["wood"], MeshKit.xform(at.call(0, 0.12, 0), Vector3(0, ry, 0)))
					batch.add(MeshKit.box(0.28, 0.03, 0.28), m["destruct"], MeshKit.xform(at.call(0, 0.245, 0), Vector3(0, cell_rand.next() * 0.8, 0)))
				"G":
					if left != "G":
						for sd in [-1.0, 1.0]:
							batch.add(MeshKit.cylinder(0.05, 0.065, 0.62, 8), m["metal"], MeshKit.xform(at.call(sd * 0.30, 0.31, 0)))
						batch.add(MeshKit.box(0.86, 0.09, 0.14), m["gate"], MeshKit.xform(at.call(0.21, 0.66, 0)))
					if not g.gates_open:
						# closed: a portcullis of iron bars fills the gate tile
						for k in 4:
							batch.add(MeshKit.cylinder(0.018, 0.018, 0.60, 6), m["metal"], MeshKit.xform(at.call(-0.15 + k * 0.1, 0.31, 0)))
						batch.add(MeshKit.box(T, 0.03, 0.04), m["metal"], MeshKit.xform(at.call(0, 0.42, 0)))
				"S":
					if not seen.has("S"):
						seen["S"] = true
						batch.add(MeshKit.torus(0.30, 0.035, 10, 30), m["friendly"], MeshKit.xform(at.call(0.21, 0.05, 0), Vector3(PI / 2.0, 0, 0)))
						batch.add(MeshKit.cone(0.10, 0.30, 10), m["friendly"], MeshKit.xform(at.call(0.21, 0.24, 0)))
				"E":
					batch.add(MeshKit.octahedron(0.10), m["hostile"], MeshKit.xform(at.call(0, 0.34, 0), Vector3.ZERO, Vector3(1, 1.4, 1)))
					batch.add(MeshKit.cylinder(0.012, 0.012, 0.30, 6), m["metal"], MeshKit.xform(at.call(0, 0.15, 0)))
				"C":
					if left != "C":
						var looted: bool = g.is_looted(c)
						batch.add(MeshKit.box(0.30, 0.20, 0.24), m["wood"], MeshKit.xform(at.call(0.21, 0.10, 0), Vector3(0, 0.4, 0)))
						# an opened chest has its lid thrown back
						batch.add(MeshKit.cylinder(0.12, 0.12, 0.30, 12, 1, false, 0, PI), m["wood"],
							MeshKit.xform(at.call(0.21 - (0.10 if looted else 0.0), 0.20 + (0.08 if looted else 0.0), 0.0 if not looted else -0.08),
								Vector3(-1.2 if looted else 0.0, 0.4 if looted else 0.0, PI / 2.0)))
						batch.add(MeshKit.box(0.32, 0.04, 0.04), m["brass"] if not looted else m["metal"], MeshKit.xform(at.call(0.21, 0.13, 0), Vector3(0, 0.4, 0)))
				"B":
					if not seen.has("B"):
						seen["B"] = true
						batch.add(MeshKit.cylinder(0.52, 0.58, 0.10, 24), MeshKit.mat("boss_pad", {"color": "#6b2020", "roughness": 0.9}),
							MeshKit.xform(at.call(0.21, 0.05, 0)))
						for k in 4:
							var a := (k / 4.0) * TAU + 0.4
							batch.add(MeshKit.cylinder(0.045, 0.055, 0.50, 8), MeshKit.mat("boss_pillar", {"color": "#8a2b2b", "roughness": 0.88}),
								MeshKit.xform(at.call(0.21 + sin(a) * 0.44, 0.30, cos(a) * 0.44)))
				"*":
					if not seen.has("*"):
						seen["*"] = true
						batch.add(MeshKit.cylinder(0.24, 0.30, 0.14, 16), m["brass"], MeshKit.xform(at.call(0.21, 0.07, 0)))
						batch.add(MeshKit.octahedron(0.14), m["glow"], MeshKit.xform(at.call(0.21, 0.34, 0), Vector3.ZERO, Vector3(1, 1.5, 1)))

	# ---- biome dressing on rough tiles ----
	var rough_cells: Array = g.cells_of(",")
	var picked := []
	for i in (30 if dress == "pine" else 22):
		if not rough_cells.is_empty():
			picked.append(rough_cells[int(rand.next() * rough_cells.size())])
	for c in picked:
		var p := cell_pos(g, c)
		var y := cell_height(",")
		var jx := (rand.next() - 0.5) * 0.22
		var jz := (rand.next() - 0.5) * 0.22
		var s := 0.6 + rand.next() * 0.7
		var at := Vector3(p.x + jx, y, p.z + jz)
		match dress:
			"pine":
				batch.add(MeshKit.cylinder(0.022, 0.030, 0.18 * s, 8), MeshKit.mat("trunk", {"color": "#4a3423", "roughness": 0.95}),
					MeshKit.xform(at + Vector3(0, 0.09 * s, 0)))
				for k in 3:
					batch.add(MeshKit.cone(0.17 * s * (1 - k * 0.22), 0.24 * s, 8), MeshKit.mat("pine_needle", {"color": "#2f5230", "roughness": 0.95}),
						MeshKit.xform(at + Vector3(0, (0.20 + k * 0.14) * s, 0)))
			"ice":
				batch.add(MeshKit.cone(0.075 * s, 0.40 * s, 5), MeshKit.mat("ice_spike", {"color": "#bfe4f5", "roughness": 0.2}),
					MeshKit.xform(at + Vector3(0, 0.20 * s, 0), Vector3((rand.next() - 0.5) * 0.3, rand.next() * 3, (rand.next() - 0.5) * 0.3)))
			"basalt":
				batch.add(MeshKit.cylinder(0.055 * s, 0.08 * s, 0.36 * s, 6), MeshKit.mat("basalt", {"color": "#2b2422", "roughness": 0.95}),
					MeshKit.xform(at + Vector3(0, 0.18 * s, 0), Vector3(0, rand.next() * 3, (rand.next() - 0.5) * 0.2)))
			"bog":
				var wood := MeshKit.mat("dead_wood", {"color": "#4a4436", "roughness": 0.97})
				batch.add(MeshKit.cylinder(0.020, 0.034, 0.46 * s, 6), wood,
					MeshKit.xform(at + Vector3(0, 0.23 * s, 0), Vector3((rand.next() - 0.5) * 0.2, 0, (rand.next() - 0.5) * 0.2)))
				batch.add(MeshKit.cylinder(0.011, 0.014, 0.20 * s, 5), wood,
					MeshKit.xform(at + Vector3(0, 0.36 * s, 0), Vector3(0, rand.next() * 3, 0.9)))
			"crystal":
				batch.add(MeshKit.octahedron(0.085 * s), m["glow"],
					MeshKit.xform(at + Vector3(0, 0.14 * s, 0), Vector3((rand.next() - 0.5) * 0.5, rand.next() * 3, (rand.next() - 0.5) * 0.5), Vector3(0.7, 1.9, 0.7)))
			_:
				batch.add(MeshKit.cylinder(0.05, 0.065, 0.34 * s, 8), MeshKit.mat("broken_pillar", {"color": "#8a8279", "roughness": 0.94}),
					MeshKit.xform(at + Vector3(0, 0.17 * s, 0), Vector3((rand.next() - 0.5) * 0.25, rand.next() * 3, (rand.next() - 0.5) * 0.25)))

	var mi := MeshInstance3D.new()
	mi.name = "Terrain"
	mi.mesh = batch.commit()
	add_child(mi)


# One of three shades of a floor material (dark, plain, light) for tile variation.
static func _shaded(id: String, kind: String, base: Color, shade: float) -> Material:
	var step := 0 if absf(shade) < 0.025 else (1 if shade > 0.0 else -1)
	var c := base.lightened(0.06) if step > 0 else (base.darkened(0.07) if step < 0 else base)
	return MeshKit.mat("%s_%s_%d" % [id, kind, step], {"color": c.to_html(false), "roughness": 0.95})


# The design's seeded generator: seed = seed * 1664525 + 1013904223 (mod 2^32).
class _Rng:
	var seed := 0

	func _init(s: int) -> void:
		seed = s

	func next() -> float:
		seed = (seed * 1664525 + 1013904223) & 0xFFFFFFFF
		return float(seed) / 4294967296.0
