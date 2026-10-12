# A wizard (or thrall, or boss) as the 3D model from story/design/wizards-model.js: the same
# parts, proportions and rig (hips, knees, ankles, shoulders, coat panels, head), plus the
# design's idle / walk / run gait. Looks come from data/wizard_models.json. Model units: the
# wizard is about 2 tall and faces +Z; scale and place the node to put it in a zone.
extends Node3D

const MeshKit = preload("res://scripts/view3d/mesh_kit.gd")

const DATA_PATH := "res://data/wizard_models.json"
const HIP := 0.74
const THIGH := 0.34
const SHIN := 0.32
const HY := 0.12  # head centre above the head pivot
const GAIT := {
	"idle": {"speed": 1.5, "amp": 0.06, "lean": 0.0, "bob": 0.006, "arm": 0.5, "knee": 0.04},
	"walk": {"speed": 4.6, "amp": 0.52, "lean": 0.05, "bob": 0.032, "arm": 0.75, "knee": 0.10},
	"run": {"speed": 8.6, "amp": 0.98, "lean": 0.20, "bob": 0.062, "arm": 1.05, "knee": 0.10},
}

static var _data: Dictionary = {}
static var _blueprints: Dictionary = {}  # look id -> Array of {name, parent, pos, rot, mesh}

var spec: Dictionary = {}
var groups: Dictionary = {}  # rig group name -> Node3D
var phase := 0.0
var stride := 0.0  # 0 standing, 0.5 walking, 1 running (smoothed by animate)
var _rest: Dictionary = {}  # group name -> [pos, rot]
var _locked: Dictionary = {}  # shoulder group name -> true when it holds a prop or is raised


# ---- looks -------------------------------------------------------------------

static func _load() -> void:
	if _data.is_empty():
		var parsed = JSON.parse_string(FileAccess.get_file_as_string(DATA_PATH))
		if parsed is Dictionary:
			_data = parsed


static func wizard_spec(id: String) -> Dictionary:
	_load()
	for w in _data.get("wizards", []):
		if w["id"] == id:
			return w
	return _data["wizards"][0]


static func thrall_spec() -> Dictionary:
	_load()
	return _data["thrall"]


# The boss look for a zone, or {} if the zone has none.
static func boss_spec(zone_id: String) -> Dictionary:
	_load()
	return _data.get("bosses", {}).get(zone_id, {})


static func create(look: Dictionary) -> Node3D:
	var m = new()
	m._build(look)
	return m


# ---- rig ---------------------------------------------------------------------

func _build(look: Dictionary) -> void:
	spec = look
	name = String(look["id"])
	if not _blueprints.has(look["id"]):
		_blueprints[look["id"]] = _Builder.new(look).groups
	for g in _blueprints[look["id"]]:
		var node := Node3D.new()
		node.name = g["name"]
		node.transform = MeshKit.xform(g["pos"], g["rot"])
		var parent: Node3D = self if g["parent"] == "" else groups[g["parent"]]
		parent.add_child(node)
		groups[g["name"]] = node
		_rest[g["name"]] = [g["pos"], g["rot"]]
		if g["mesh"] != null:
			var mi := MeshInstance3D.new()
			mi.mesh = g["mesh"]
			node.add_child(mi)
	var prop: String = look.get("prop", "")
	for i in 2:
		var side := "left" if i == 0 else "right"
		var holds := prop != "" and prop != "orb" and String(look.get("propSide", "right")) == side
		_locked["shoulder_%d" % i] = holds or String(look.get("raise", "")) == side
	animate(0.0, 0.0)


func _pose(group: String, rot: Vector3, pos = null) -> void:
	var node: Node3D = groups.get(group)
	if node == null:
		return
	node.transform = MeshKit.xform(_rest[group][0] if pos == null else pos, rot)


func _rest_rot(group: String) -> Vector3:
	return _rest[group][1]


# Advances the design's gait. `target_stride`: 0 stand, 0.5 walk, 1 run.
func animate(delta: float, target_stride: float) -> void:
	stride = move_toward(stride, clampf(target_stride, 0.0, 1.0), delta * 4.0)
	var g := _gait(stride)
	phase += delta * g["speed"]
	var amp: float = g["amp"]
	var lean: float = g["lean"]
	for i in 2:
		var p := phase + (PI if i == 1 else 0.0)
		var swing := sin(p)
		var bend := maxf(0.0, sin(p - 0.7))
		_pose("hip_%d" % i, Vector3(swing * amp - lean * 0.5, 0, 0))
		_pose("knee_%d" % i, Vector3(-bend * amp * 1.55 - g["knee"], 0, 0))
		_pose("ankle_%d" % i, Vector3(-swing * amp * 0.30 + bend * 0.18, 0, 0))
		var sh := "shoulder_%d" % i
		if _locked.get(sh, false):
			_pose(sh, Vector3(sin(phase * 0.5) * 0.02, 0, 0))
		else:
			_pose(sh, Vector3(-sin(p) * amp * g["arm"], 0, sin(phase * 2.0) * 0.02))
	for k in 2:
		var panel := "panel_front" if k == 0 else "panel_back"
		var r := _rest_rot(panel)
		_pose(panel, Vector3(-sin(phase * 2.0) * amp * 0.10 - lean * 0.4 * (-1.0 if k == 1 else 1.0), r.y, r.z))
	_pose("head", Vector3(-lean * 0.8 + sin(phase * 2.0) * 0.015, -sin(phase) * amp * 0.05, 0))
	var root_rot := Vector3(lean, sin(phase) * amp * 0.06, sin(phase) * amp * 0.035)
	if groups.has("motes"):
		_pose("motes", Vector3(0, phase * 0.25, 0))
	# Plant the stance foot: sink the root until the lowest sole is back on the ground.
	_pose("root", root_rot, Vector3.ZERO)
	_pose("root", root_rot, Vector3(0, -lowest_sole() + absf(sin(phase)) * g["bob"] * 0.35, 0))


static func _gait(s: float) -> Dictionary:
	var a: Dictionary = GAIT["idle"] if s <= 0.5 else GAIT["walk"]
	var b: Dictionary = GAIT["walk"] if s <= 0.5 else GAIT["run"]
	var t := s * 2.0 if s <= 0.5 else (s - 0.5) * 2.0
	var out := {}
	for k in a:
		out[k] = lerpf(a[k], b[k], t)
	return out


# Lowest sole height in model space (0 when the feet are planted).
func lowest_sole() -> float:
	var lowest := INF
	for i in 2:
		var xf: Transform3D = groups["root"].transform * groups["hip_%d" % i].transform \
			* groups["knee_%d" % i].transform * groups["ankle_%d" % i].transform
		lowest = minf(lowest, (xf * Vector3(0, -0.072, 0.052)).y)
	return lowest


# Bounds of every part in this node's own space (works outside the scene tree).
func local_aabb() -> AABB:
	var out := AABB()
	var first := true
	for mi in find_children("*", "MeshInstance3D", true, false):
		var xf := Transform3D.IDENTITY
		var n: Node = mi
		while n != self:
			xf = (n as Node3D).transform * xf
			n = n.get_parent()
		var b: AABB = xf * (mi as MeshInstance3D).get_aabb()
		out = b if first else out.merge(b)
		first = false
	return out


# ---- the design's builder, ported ----------------------------------------------

class _Builder:
	const MK = preload("res://scripts/view3d/mesh_kit.gd")

	var s: Dictionary
	var groups: Array = []
	var _batches: Dictionary = {}

	func _init(look: Dictionary) -> void:
		s = look
		_build()
		for g in groups:
			var b: MK.Batch = _batches[g["name"]]
			g["mesh"] = null if b.is_empty() else b.commit()

	func group(name: String, parent: String, pos := Vector3.ZERO, rot := Vector3.ZERO) -> void:
		groups.append({"name": name, "parent": parent, "pos": pos, "rot": rot, "mesh": null})
		_batches[name] = MK.Batch.new()

	func add(g: String, geo: Dictionary, m: Material, pos := Vector3.ZERO, rot := Vector3.ZERO, scale := Vector3.ONE) -> void:
		_batches[g].add(geo, m, MK.xform(pos, rot, scale))

	func add_q(g: String, geo: Dictionary, m: Material, pos: Vector3, basis: Basis) -> void:
		_batches[g].add(geo, m, Transform3D(basis, pos))

	func num(key: String, fallback: float) -> float:
		var v = s.get(key)
		return fallback if v == null else float(v)

	func _build() -> void:
		var id: String = s["id"]
		var skin := MK.mat("skin", {"color": "#e0b48c", "roughness": 0.85})
		var iron := MK.mat("iron", {"color": "#6b7078", "roughness": 0.5, "metalness": 0.35})
		var brass := MK.mat("brass", {"color": "#c79a45", "roughness": 0.36, "metalness": 0.38})
		var wood := MK.mat("wood", {"color": "#7a5a34", "roughness": 0.92})
		var boot := MK.mat("boot_leather", {"color": "#3b2c22", "roughness": 0.9})
		var bone := MK.mat("bone", {"color": "#ded3bb", "roughness": 0.85})
		var sole := MK.mat("sole", {"color": "#241a14", "roughness": 0.98})
		# the design sets DoubleSide on the shared robe material for the open skirt panels
		var robe := MK.mat(id + "_robe", {"color": s["robe"], "roughness": 0.93, "double": true})
		var trim := MK.mat(id + "_trim", {"color": s["trim"], "roughness": 0.55, "metalness": 0.2})
		var legs := MK.mat(id + "_legwrap", {"color": s["legs"], "roughness": 0.94})
		var glow := MK.mat(id + "_glow", {"color": s["glow"], "emissive": s["glow"], "emissive_intensity": 0.9,
			"roughness": 0.2, "metalness": 0.05})
		var hair := MK.mat(id + "_hair", {"color": s["hair"], "roughness": 0.95})

		group("root", "")

		# ---- legs (rigged) ----
		for i in 2:
			var sd := -1.0 if i == 0 else 1.0
			var hip := "hip_%d" % i
			var knee := "knee_%d" % i
			var ankle := "ankle_%d" % i
			group(hip, "root", Vector3(sd * 0.115, HIP, 0))
			add(hip, MK.sphere(0.098, 18, 14), legs, Vector3.ZERO, Vector3.ZERO, Vector3(1, 0.9, 1))
			add(hip, MK.capsule(0.082, THIGH - 0.10, 8, 18), legs, Vector3(0, -THIGH / 2.0, 0))
			group(knee, hip, Vector3(0, -THIGH, 0))
			add(knee, MK.sphere(0.073, 16, 12), legs)
			add(knee, MK.capsule(0.066, SHIN - 0.10, 8, 18), legs, Vector3(0, -SHIN / 2.0, 0))
			add(knee, MK.torus(0.072, 0.016, 8, 22), trim, Vector3(0, -SHIN * 0.45, 0), Vector3(PI / 2.0, 0, 0.2))
			group(ankle, knee, Vector3(0, -SHIN, 0))
			add(ankle, MK.cylinder(0.072, 0.062, 0.10, 14), boot, Vector3(0, 0.015, 0))
			add(ankle, MK.box(0.108, 0.072, 0.235), boot, Vector3(0, -0.038, 0.052))
			add(ankle, MK.sphere(0.054, 14, 10), boot, Vector3(0, -0.040, 0.158), Vector3.ZERO, Vector3(1, 0.72, 1.25))
			add(ankle, MK.box(0.112, 0.022, 0.238), sole, Vector3(0, -0.072, 0.052))

		# ---- coat (hem at the hip so the legs read) ----
		var flare := num("flare", 1.0)
		var prof := []
		for p in [[0.04, 0.640], [0.335 * flare, 0.650], [0.348 * flare, 0.700], [0.315, 0.840],
				[0.272, 1.000], [0.238, 1.060], [0.250, 1.170], [0.175, 1.270], [0.105, 1.300]]:
			prof.append(Vector2(p[0], p[1]))
		add("root", MK.lathe(prof, 40), robe)
		add("root", MK.torus(0.343 * flare, 0.024, 12, 44), trim, Vector3(0, 0.672, 0), Vector3(PI / 2.0, 0, 0))

		# hanging front / back panels; side slits let the stride show
		var tattered: bool = s.get("tattered", false)
		for k in 2:
			var panel := "panel_front" if k == 0 else "panel_back"
			group(panel, "root", Vector3(0, 0.70, 0), Vector3(0, 0.0 if k == 0 else PI, 0))
			var plen := 0.60 if tattered else 0.48
			add(panel, MK.cylinder(0.335 * flare, 0.375 * flare, plen, 24, 1, true, -0.82, 1.64), robe, Vector3(0, -plen / 2.0, 0))
			add(panel, MK.torus(0.372 * flare, 0.018, 8, 26, 1.64), trim, Vector3(0, -plen, 0), Vector3(PI / 2.0, 0, -0.82 + PI / 2.0))
			if tattered:
				for i in 5:
					var a := -0.72 + (i / 4.0) * 1.44
					add(panel, MK.cone(0.048, 0.20, 5), robe, Vector3(sin(a) * 0.365 * flare, -plen - 0.06, cos(a) * 0.365 * flare), Vector3(PI, a, 0))

		add("root", MK.box(0.072, 0.62, 0.02), trim, Vector3(0, 0.98, 0.288), Vector3(0.10, 0, 0))

		# ---- belt ----
		add("root", MK.torus(0.285, 0.036, 12, 40), trim, Vector3(0, 0.86, 0), Vector3(PI / 2.0, 0, 0))
		add("root", MK.box(0.115, 0.09, 0.045), brass, Vector3(0, 0.86, 0.29))
		if s.get("pouch", false):
			add("root", MK.sphere(0.075, 16, 12), boot, Vector3(0.215, 0.795, 0.20), Vector3.ZERO, Vector3(1, 0.9, 0.7))

		# ---- shoulders ----
		match String(s.get("pads", "")):
			"stone":
				for i in 2:
					var sd := -1.0 if i == 0 else 1.0
					add("root", MK.dodecahedron(0.135), trim, Vector3(sd * 0.215, 1.19, 0), Vector3(0.3 * i, 0.6 * i, 0.2))
			"plate":
				for i in 2:
					var sd := -1.0 if i == 0 else 1.0
					add("root", MK.sphere(0.135, 20, 12, 0, TAU, 0, PI / 2.0), trim, Vector3(sd * 0.205, 1.17, 0), Vector3(0, 0, sd * 0.35))
			"mantle":
				add("root", MK.sphere(0.31, 26, 16, 0, TAU, 0, PI / 2.1), trim, Vector3(0, 1.10, 0), Vector3.ZERO, Vector3(1, 0.72, 1))

		# ---- arms (rigged at the shoulder) ----
		var raised_local = null
		for i in 2:
			var sd := -1.0 if i == 0 else 1.0
			var side := "left" if i == 0 else "right"
			var raised := String(s.get("raise", "")) == side
			var sh := "shoulder_%d" % i
			var sh_pos := Vector3(sd * 0.19, 1.17, 0)
			group(sh, "root", sh_pos)
			var pts: Array = [[0.19, 1.17, 0.0], [0.34, 1.20, 0.06], [0.40, 1.36, 0.14], [0.34, 1.52, 0.18]] if raised \
				else [[0.19, 1.17, 0.0], [0.30, 1.03, 0.04], [0.33, 0.88, 0.12], [0.30, 0.80, 0.20]]
			var cpts := []
			for p in pts:
				cpts.append(Vector3(sd * p[0] - sd * 0.19, p[1] - 1.17, p[2]))
			var curve := MK.Spline.new(cpts)
			add(sh, MK.tube(curve, 30, 0.072, 14), robe)
			add_q(sh, MK.torus(0.076, 0.018, 10, 24), trim, curve.get_point_at(0.86),
				Basis(Quaternion(Vector3.BACK, curve.get_tangent_at(0.86))))
			var hand := curve.get_point_at(1.0)
			add(sh, MK.sphere(0.055, 16, 12), skin, hand)
			if raised:
				raised_local = Vector3(sh_pos.x + hand.x, sh_pos.y + hand.y, hand.z)

		# ---- head ----
		group("head", "root", Vector3(0, 1.30, 0))
		add("head", MK.cylinder(0.075, 0.09, 0.09, 16), skin, Vector3(0, 0.01, 0))
		add("head", MK.sphere(0.155, 26, 20), skin, Vector3(0, HY, 0), Vector3.ZERO, Vector3(1, 1.06, 0.98))
		add("head", MK.cone(0.033, 0.09, 12), skin, Vector3(0, HY - 0.02, 0.15), Vector3(PI / 2.0, 0, 0))
		var void_face := String(s.get("face", "")) == "void"
		if void_face:
			add("head", MK.sphere(0.15, 22, 16), MK.mat("void", {"color": "#0b0714", "roughness": 1.0}),
				Vector3(0, HY, 0.03), Vector3.ZERO, Vector3(0.95, 1, 0.9))
		var eye := glow if void_face else MK.mat("eye", {"color": "#241c18", "roughness": 0.4})
		for i in 2:
			var sd := -1.0 if i == 0 else 1.0
			add("head", MK.sphere(0.021, 12, 10), eye, Vector3(sd * 0.058, HY + 0.03, 0.138))

		var beard := num("beard", 0.0)
		if beard > 0.0:
			var bp := []
			for p in [[0.005, 0.0], [0.10, 0.05], [0.135, 0.16], [0.15, 0.30], [0.14, 0.44], [0.10, 0.54], [0.03, 0.60]]:
				bp.append(Vector2(p[0], HY - 0.03 - (0.60 - p[1]) * beard))
			add("head", MK.lathe(bp, 28), hair, Vector3(0, 0, 0.035), Vector3.ZERO, Vector3(1, 1, 0.72))
			add("head", MK.box(0.11, 0.035, 0.03), hair, Vector3(0, HY + 0.005, 0.145))
		if s.get("brows", false):
			for i in 2:
				var sd := -1.0 if i == 0 else 1.0
				add("head", MK.box(0.058, 0.022, 0.024), hair, Vector3(sd * 0.062, HY + 0.068, 0.132), Vector3(0, 0, sd * 0.22))
		if s.get("wildHair", false):
			for i in 10:
				var a := (i / 10.0) * TAU
				add("head", MK.cone(0.032, 0.24, 6), hair, Vector3(sin(a) * 0.11, HY + 0.12, cos(a) * 0.11), Vector3(cos(a) * 0.7, 0, -sin(a) * 0.7))

		var hat := String(s.get("hat", ""))
		if hat in ["point", "tall", "brim"]:
			var h := 0.78 if hat == "tall" else (0.34 if hat == "brim" else 0.56)
			var br := 0.42 if hat == "brim" else (0.24 if hat == "tall" else 0.30)
			var tilt := num("hatTilt", -0.12)
			var hlean := num("hatLean", 0.10)
			add("head", MK.torus(br, 0.035, 12, 40), robe, Vector3(0, HY + 0.11, 0), Vector3(PI / 2.0, 0, 0), Vector3(1, 1, 0.55))
			add("head", MK.circle(br, 40), robe, Vector3(0, HY + 0.10, 0), Vector3(-PI / 2.0, 0, 0))
			add("head", MK.cone(br * 0.75, h, 26), robe, Vector3(0, HY + 0.12 + h / 2.0, 0), Vector3(tilt, 0, hlean))
			add("head", MK.torus(br * 0.70, 0.028, 10, 34), trim, Vector3(0, HY + 0.17, 0), Vector3(PI / 2.0, 0, 0))
			add("head", MK.sphere(0.045, 16, 12), glow, Vector3(sin(hlean) * -h * 0.9, HY + 0.12 + h * 0.98, sin(tilt) * h * 0.9),
				Vector3.ZERO, Vector3(1, 1.2, 1))
		elif hat == "hood" or hat == "deephood":
			var deep := hat == "deephood"
			add("head", MK.sphere(0.225 if deep else 0.205, 28, 20, 0, TAU, 0, PI * 0.62), robe,
				Vector3(0, HY + 0.05, -0.03 if deep else -0.02), Vector3(0.30 if deep else 0.22, 0, 0), Vector3(1, 1.25, 1.12))
			add("head", MK.torus(0.185 if deep else 0.17, 0.03, 12, 34), trim, Vector3(0, HY + 0.02, 0.045), Vector3(1.30, 0, 0))
			add("head", MK.sphere(0.24, 26, 16, 0, TAU, PI * 0.42, PI * 0.30), robe, Vector3(0, HY - 0.10, -0.02),
				Vector3.ZERO, Vector3(1.25, 1.1, 1.15))
		elif hat == "crown":
			for i in 7:
				var a := (i / 7.0) * TAU
				add("head", MK.cone(0.035, 0.20 + (i % 2) * 0.10, 5), glow, Vector3(sin(a) * 0.135, HY + 0.19, cos(a) * 0.135),
					Vector3(cos(a) * 0.28, 0, -sin(a) * 0.28))
			add("head", MK.torus(0.145, 0.028, 10, 30), trim, Vector3(0, HY + 0.10, 0), Vector3(PI / 2.0, 0, 0))
		elif hat == "cap":
			add("head", MK.sphere(0.17, 24, 16, 0, TAU, 0, PI / 2.0), robe, Vector3(0, HY + 0.06, 0), Vector3.ZERO, Vector3(1, 0.8, 1))
			add("head", MK.torus(0.168, 0.03, 10, 30), trim, Vector3(0, HY + 0.06, 0), Vector3(PI / 2.0, 0, 0))

		# ---- held prop ----
		var prop := String(s.get("prop", ""))
		var px := -0.40 if String(s.get("propSide", "right")) == "left" else 0.40
		if prop in ["staff", "crystal", "skull", "rod"]:
			var top := num("propHeight", 1.95)
			var plean := num("propLean", 0.05)
			add("root", MK.cylinder(0.028, 0.033, top, 16), wood, Vector3(px, top / 2.0, 0.16), Vector3(0, 0, plean))
			var hx := px + sin(-plean) * top
			match prop:
				"staff":
					add("root", MK.torus(0.10, 0.022, 12, 30), iron, Vector3(hx, top - 0.02, 0.16), Vector3(0, PI / 2.0, 0))
					add("root", MK.octahedron(0.072), glow, Vector3(hx, top - 0.02, 0.16), Vector3.ZERO, Vector3(1, 1.4, 1))
				"crystal":
					for i in 4:
						var a := (i / 4.0) * TAU
						add("root", MK.octahedron(0.055), glow, Vector3(hx + sin(a) * 0.06, top + 0.02 + (i % 2) * 0.05, 0.16 + cos(a) * 0.06),
							Vector3(0.3, a, 0.2), Vector3(0.8, 1.9, 0.8))
					add("root", MK.cone(0.07, 0.14, 14), iron, Vector3(hx, top - 0.07, 0.16))
				"skull":
					add("root", MK.sphere(0.10, 20, 16), bone, Vector3(hx, top + 0.03, 0.16), Vector3.ZERO, Vector3(0.95, 1, 1.05))
					add("root", MK.box(0.13, 0.055, 0.07), bone, Vector3(hx, top - 0.05, 0.19))
					for i in 2:
						var sd := -1.0 if i == 0 else 1.0
						add("root", MK.sphere(0.028, 12, 10), glow, Vector3(hx + sd * 0.04, top + 0.05, 0.245))
						add("root", MK.cone(0.032, 0.22, 6), bone, Vector3(hx + sd * 0.085, top + 0.11, 0.14), Vector3(0, 0, sd * -0.7))
				_:
					add("root", MK.cylinder(0.012, 0.012, 0.42, 10), iron, Vector3(hx, top + 0.20, 0.16))
					for i in 3:
						add("root", MK.torus(0.055 + i * 0.02, 0.012, 8, 24), glow, Vector3(hx, top - 0.02 + i * 0.09, 0.16), Vector3(PI / 2.0, 0, 0))
		if prop == "orb" and raised_local != null:
			var p: Vector3 = raised_local + Vector3(0, 0.16, 0)
			add("root", MK.icosahedron(0.11, 1), glow, p)
			for i in 3:
				add("root", MK.torus(0.16 + i * 0.03, 0.008, 8, 34), brass, p, Vector3(1.2 + i * 0.5, i * 0.8, 0.3))
		if prop == "club":
			var cx := 0.40
			add("root", MK.cylinder(0.045, 0.055, 0.75, 14), wood, Vector3(cx, 0.72, 0.18), Vector3(0, 0, 0.22))
			add("root", MK.dodecahedron(0.15), trim, Vector3(cx + 0.17, 1.12, 0.18), Vector3(0.4, 0.6, 0.2))
			add("root", MK.octahedron(0.045), glow, Vector3(cx + 0.17, 1.12, 0.31))

		# motes drift round the wizard (their own group so they can orbit)
		var motes := int(num("motes", 0))
		if motes > 0:
			group("motes", "root")
			for i in motes:
				var a := (float(i) / motes) * TAU + 0.4
				var r := 0.36 + (i % 3) * 0.10
				add("motes", MK.octahedron(0.026 + (i % 2) * 0.012), glow, Vector3(sin(a) * r, 0.85 + (i % 4) * 0.26, cos(a) * r),
					Vector3(a, a * 0.7, 0.3))
