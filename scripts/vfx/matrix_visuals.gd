# Visuals from the effects matrix (COMBINATIONS_AND_EFFECTS_SUMMARY.md, section 3), drawn on top of
# the generic area discs: per-spell ground areas (wildfire grass clumps that ignite, steam cloud with
# orbiting wisps, black-hole singularity, vortex rings, water pool, burning land, magma, mud,
# magnetic field, the World Tree, the Glacier pillar) and dashed status-aura rings around enemies.
# Everything is built under `parent` and returned in a dict so ArenaView frees it with the area.
extends RefCounted

const K := preload("res://scripts/arena/mesh_kit.gd")

const STATUS_RINGS := [
	["frozen", Color("#7dd3fc")], ["burn", Color("#ff8a3a")], ["shock", Color("#f4e15c")], ["root", Color("#5cc84a")],
	["stun", Color("#ffffff")], ["confuse", Color("#c084fc")], ["silence", Color("#9ca3af")], ["weaken", Color("#b91c1c")],
]


# Which matrix look an area uses ("" for none).
static func visual_of(a) -> String:
	if a.key == "burning":
		return "burning_land"
	return String(a.sp.get("def", {}).get("visual", ""))


static func _flat_disc(parent: Node3D, at: Vector3, r: float, c: Color, alpha: float, y := 0.035) -> MeshInstance3D:
	return K.put(parent, K.disc(1.0, 48), K.flat(c, alpha), at + Vector3(0, y, 0), [-PI / 2, 0, 0], [r, r, 1], false)


static func _glow_mat(c: Color, energy := 1.5) -> StandardMaterial3D:
	var m := K.flat(c, 0.9, true)
	m.albedo_color = Color(c.r * energy, c.g * energy, c.b * energy, 0.9)
	return m


# A dashed ring: `n` arc pieces lying flat.
static func dashed_ring(parent: Node3D, r: float, c: Color, n := 12, tube := 0.03) -> Node3D:
	var g := K.group(parent)
	var mat := _glow_mat(c, 1.4)
	var piece := K.torus(r, tube, TAU / n * 0.55, 8, 6)
	for i in n:
		K.put(g, piece, mat, null, [PI / 2, 0, i / float(n) * TAU], null, false)
	g.set_meta("mat", mat)
	return g


static func build(parent: Node3D, a) -> Dictionary:
	var vis := visual_of(a)
	var at := Vector3(a.pos.x, 0, a.pos.y)
	var v := {"kind": vis}
	if vis == "":
		return v
	var root := K.group(parent, at)
	v["root"] = root
	var r: float = a.r
	match vis:
		"wildfire":
			# 7 clustered sub-zones: lush green centre -> burnt amber -> fiery edge, with grass clumps.
			var rng := RandomNumberGenerator.new()
			rng.seed = a.id
			var clumps := []
			for i in 7:
				var ang := i / 7.0 * TAU + rng.randf() * 0.5
				var off := Vector3(sin(ang), 0, cos(ang)) * r * (0.45 if i else 0.0)
				var zr := r * rng.randf_range(0.35, 0.5)
				_flat_disc(root, off, zr, Color("#ea580c"), 0.27, 0.031)
				_flat_disc(root, off, zr * 0.8, Color("#b45309"), 0.4, 0.033)
				_flat_disc(root, off, zr * 0.5, Color("#15803d"), 0.33, 0.035)
				for j in 4:
					var p := off + Vector3(rng.randf_range(-1, 1), 0, rng.randf_range(-1, 1)) * zr * 0.6
					clumps.append(_grass_clump(root, p, rng))
			v["clumps"] = clumps
		"steam_cloud":
			_flat_disc(root, Vector3.ZERO, r, Color("#78350f"), 0.2, 0.03)
			_flat_disc(root, Vector3.ZERO, r * 0.75, Color("#b45309"), 0.27, 0.032)
			_flat_disc(root, Vector3.ZERO, r * 0.45, Color("#9a3412"), 0.33, 0.034)
			v["ring"] = dashed_ring(root, r, Color("#d6a26a"), 24, 0.025)
			v["ring"].position.y = 0.05
		"black_hole":
			_flat_disc(root, Vector3.ZERO, r, Color("#1e1b4b"), 0.53, 0.03)
			_flat_disc(root, Vector3.ZERO, r * 0.35, Color("#05020d"), 0.95, 0.034)
			K.put(root, K.ring(0.97, 1.0, 64), _glow_mat(Color("#a855f7"), 1.6), [0, 0.04, 0], [-PI / 2, 0, 0], [r, r, 1], false)
			var rings := []
			for i in 3:
				var ring := K.put(root, K.torus(r * (0.45 + i * 0.18), 0.03, TAU, 48, 6), _glow_mat(Color("#a855f7"), 1.2), [0, 0.6 + i * 0.25, 0], [PI / 2 + 0.35 * (i - 1), 0, 0], [1, 0.45, 1], false)
				rings.append(ring)
			v["rings"] = rings
			v["core"] = K.put(root, K.sphere(0.45, 20, 12), K.mat(0x020008, 1.0), [0, 0.9, 0], null, null, false)
		"vortex":
			var c: Color = a.color
			var rings := []
			for i in 4:
				var ring := K.put(root, K.torus(1.0, 0.035, TAU * 0.7, 40, 6), _glow_mat(c, 1.5), [0, 0.3 + i * 0.45, 0], [PI / 2, 0, i * 1.3], [r * (1.0 - i * 0.18), r * (1.0 - i * 0.18), 0.5], false)
				rings.append(ring)
			v["rings"] = rings
		"water_pool":
			var m := K.mat(0x1f6f9f, 0.05, 0.3)
			m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
			m.albedo_color.a = 0.65
			K.put(root, K.disc(1.0, 48), m, [0, 0.03, 0], [-PI / 2, 0, 0], [r, r, 1], false)
			K.put(root, K.ring(0.94, 1.0, 64), _glow_mat(Color("#67e8f9"), 1.1), [0, 0.04, 0], [-PI / 2, 0, 0], [r, r, 1], false)
		"burning_land":
			_flat_disc(root, Vector3.ZERO, r, Color("#2a1208"), 0.75, 0.03)
			v["glow"] = K.put(root, K.disc(1.0, 48), _glow_mat(Color("#ff5a1a"), 1.2), [0, 0.034, 0], [-PI / 2, 0, 0], [r * 0.85, r * 0.85, 1], false)
		"magma":
			_flat_disc(root, Vector3.ZERO, r, Color("#3a1006"), 0.85, 0.03)
			v["glow"] = K.put(root, K.disc(1.0, 48), _glow_mat(Color("#ff6a1a"), 1.8), [0, 0.034, 0], [-PI / 2, 0, 0], [r * 0.7, r * 0.7, 1], false)
			var crust := K.mat(0x241008, 0.95)
			var rng := RandomNumberGenerator.new()
			rng.seed = a.id
			for i in 9:
				var ang := rng.randf() * TAU
				K.put(root, K.poly(rng.randf_range(0.18, 0.35), 12), crust, [sin(ang) * r * rng.randf_range(0.2, 0.8), 0.04, cos(ang) * r * rng.randf_range(0.2, 0.8)], null, [1, 0.25, 1], false)
		"mud":
			_flat_disc(root, Vector3.ZERO, r, Color("#4a3524"), 0.85, 0.03)
			_flat_disc(root, Vector3.ZERO, r * 0.6, Color("#5c4330"), 0.85, 0.033)
		"magnetic":
			v["rings"] = [
				K.put(root, K.ring(0.95, 1.0, 64), _glow_mat(Color("#f4c84a"), 1.6), [0, 0.05, 0], [-PI / 2, 0, 0], [r, r, 1], false),
				K.put(root, K.ring(0.95, 1.0, 64), _glow_mat(Color("#5fb0ff"), 1.6), [0, 0.06, 0], [-PI / 2, 0, 0], [r * 0.7, r * 0.7, 1], false),
				K.put(root, K.torus(r * 0.85, 0.02, TAU, 48, 6), _glow_mat(Color("#5f8fd0"), 0.7), [0, 0.6, 0], [PI / 2, 0, 0], [1, 1, 0.35], false),
			]
		"world_tree":
			var bark := K.mat(0x6b4a2a, 0.9)
			var leaf := K.mat(0x3f9a3e, 0.8, 0.0, 0x8fd14f, 0.35)
			# A sapling-sized Yggdrasil: tall enough to read, short enough not to hide the fight.
			K.put(root, K.cyl(0.14, 0.24, 1.5, 8), bark, [0, 0.75, 0])
			for i in 3:
				K.put(root, K.sphere(0.62 - i * 0.14, 14, 8), leaf, [0, 1.5 + i * 0.36, 0], null, [1.3, 0.75, 1.3])
			v["aura"] = K.put(root, K.ring(0.9, 1.0, 64), _glow_mat(Color("#ffd86b"), 1.6), [0, 0.05, 0], [-PI / 2, 0, 0], [r, r, 1], false)
			v["tree"] = root.get_child(0)
			root.scale = Vector3(1, 0.05, 1)
		"thunder_pool":
			K.put(root, K.disc(1.0, 48), K.flat(Color("#1e3a5f"), 0.45), [0, 0.03, 0], [-PI / 2, 0, 0], [r, r, 1], false)
	return v


static func _grass_clump(parent: Node3D, at: Vector3, rng: RandomNumberGenerator) -> Dictionary:
	var g := K.group(parent, at)
	var blade := K.mat(0x2f8a1a, 0.9)
	var spine := K.mat(0x9be15d, 0.6, 0.0, 0x9be15d, 0.3)
	var tips := []
	for tier in 3:
		for i in 3:
			var ang := rng.randf() * TAU
			var h := 0.35 + tier * 0.15 + rng.randf() * 0.1
			var b := K.put(g, K.cone(0.05, h, 4), blade if tier < 2 else spine, [sin(ang) * 0.12, h / 2, cos(ang) * 0.12], [rng.randf_range(-0.3, 0.3), ang, rng.randf_range(-0.3, 0.3)], null, false)
			if tier == 2:
				tips.append(b)
	return {"g": g, "tips": tips, "phase": rng.randf() * TAU, "lit": false}


# Animates an area's look. `fx` is the VFX director (for flames, leaves, wisps).
static func update(v: Dictionary, a, dt: float, t: float, fx) -> void:
	if not v.has("root"):
		return
	var fade := minf(1.0, a.life / 0.4) if a.delay <= 0 else 1.0
	var root: Node3D = v["root"]
	match v["kind"]:
		"wildfire":
			var age: float = a.max_life - a.life
			for c in v["clumps"]:
				var g: Node3D = c["g"]
				g.rotation.z = sin(t * 2.2 + c["phase"]) * 0.12
				if age > 0.35 and not c["lit"]:
					c["lit"] = true
					for tip in c["tips"]:
						tip.material_override = _glow_mat(Color("#ff7a2f"), 2.0)
				if c["lit"] and fx and randf() < dt * 6:
					fx.particles.sprite("flame", g.global_position + Vector3(0, 0.6, 0) if g.is_inside_tree() else root.position, Vector3(0, 1.2, 0), {"k": 0.45})
			if fx and randf() < dt * 3:
				fx.spray("leaf", root.position.x + randf_range(-a.r, a.r) * 0.6, 0.6, root.position.z + randf_range(-a.r, a.r) * 0.6, 1, 1.5, {"size": 0.7})
		"steam_cloud":
			v["ring"].rotation.y += dt * 0.5
			if fx:
				for i in 6:
					var ang := t * 0.8 + i / 6.0 * TAU
					if randf() < dt * 8:
						fx.particles.sprite("steam", root.position + Vector3(sin(ang) * a.r * 0.6, 0.4, cos(ang) * a.r * 0.6), Vector3(cos(ang) * 1.2, 0.8, -sin(ang) * 1.2), {"k": 1.2})
		"black_hole":
			for i in v["rings"].size():
				v["rings"][i].rotation.y += dt * (1.6 + i * 0.7)
			v["core"].scale = Vector3.ONE * (1 + 0.15 * sin(t * 9))
			if fx:
				for i in 2:
					var ang := randf() * TAU
					var p := root.position + Vector3(sin(ang) * a.r, 0.4, cos(ang) * a.r)
					fx.particles.sprite("shadow", p, (root.position - p) * 1.4 + Vector3(cos(ang), 0.3, -sin(ang)) * 2.5, {"k": 0.6, "buoy": 0.0})
		"vortex":
			for i in v["rings"].size():
				var ring: Node3D = v["rings"][i]
				# push and pull: each ring breathes on its own beat, so the funnel never marches in step
				ring.rotation.z += dt * (3.0 + i * 0.8 + 0.6 * sin(t * 1.3 + i * 2.1))
				var s := fmod(t * (0.55 + i * 0.04) + i * 0.27 + 0.04 * sin(t * 2.0 + i), 1.0)
				var rr: float = a.r * (1.0 - s * 0.7)
				ring.scale = Vector3(rr, rr, 0.5)
				ring.position.y = 0.3 + s * 2.2
			if fx and a.delay <= 0:
				# wind is invisible: the funnel shows by what it drags in at the foot and spins upward
				for i in 2:
					if randf() < dt * 2.5 * a.r * fade:
						var ang := randf() * TAU
						var rr: float = a.r * randf_range(0.6, 1.0)
						var el: String = a.els[randi() % a.els.size()]
						var vel := Vector3(cos(ang), 0, -sin(ang)) * randf_range(3.5, 5.5) - Vector3(sin(ang), 0, cos(ang)) * randf_range(0.8, 1.6)
						fx.particles.sprite("dust" if el == "wind" else fx._sprite_of(el), root.position + Vector3(sin(ang) * rr, 0.25, cos(ang) * rr),
							vel + Vector3(0, randf_range(1.8, 3.2), 0), {"k": randf_range(0.4, 0.7), "buoy": 0.5, "drag": 0.9})
		"burning_land", "magma":
			v["glow"].material_override.albedo_color.a = (0.55 + 0.25 * sin(t * 5 + a.id)) * fade
		"magnetic":
			var pulse := 1.0 + 0.08 * sin(t * 8)
			v["rings"][0].scale = Vector3(a.r * pulse, a.r * pulse, 1)
			v["rings"][1].scale = Vector3(a.r * 0.7 / pulse, a.r * 0.7 / pulse, 1)
			v["rings"][2].rotation.y += dt * 2
		"world_tree":
			var age: float = a.max_life - a.life
			root.scale = Vector3(1, minf(1.0, 0.05 + age / 0.6), 1)
			v["aura"].rotation.y += dt * 0.6
			v["aura"].material_override.albedo_color.a = (0.6 + 0.3 * sin(t * 4)) * fade


# ---------------------------------------------------------------- status aura rings
static func build_status_rings(parent: Node3D) -> Dictionary:
	var out := {}
	for row in STATUS_RINGS:
		var ring := dashed_ring(parent, 0.8, row[1], 14, 0.022)
		ring.visible = false
		out[row[0]] = ring
	return out


# Shows a rotating dashed ring per active status (up to 3, stacked outward).
static func update_status_rings(rings: Dictionary, st, radius: float, t: float) -> void:
	var shown := 0
	for row in STATUS_RINGS:
		var ring: Node3D = rings[row[0]]
		var on: bool = st.get(row[0]) > 0 and shown < 3
		ring.visible = on
		if on:
			var r := radius * (1.05 + shown * 0.18)
			ring.scale = Vector3(r / 0.8, r / 0.8, r / 0.8)
			ring.position.y = 0.06 + shown * 0.02
			ring.rotation.y = t * (1.5 if shown % 2 == 0 else -1.5)
			shown += 1
