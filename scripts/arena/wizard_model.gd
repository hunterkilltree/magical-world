# One of the six wizards (data/wizards.json) as a rigged placeholder model, and its walk cycle.
# Port of buildWizard / animateRig / GAIT from story/design/court_of_waves/reference/wizard-rig.js.
# The model faces +Z; its feet are planted on y = 0 by animate().
extends Node3D

const K := preload("res://scripts/arena/mesh_kit.gd")

const HIP := 0.74
const THIGH := 0.34
const SHIN := 0.32
const GAIT := {
	"idle": {"speed": 1.5, "amp": 0.06, "lean": 0.0, "bob": 0.006, "arm": 0.5},
	"walk": {"speed": 4.6, "amp": 0.52, "lean": 0.05, "bob": 0.032, "arm": 0.75},
	"run": {"speed": 8.6, "amp": 0.98, "lean": 0.20, "bob": 0.062, "arm": 1.05},
}

var spec := {}
var root: Node3D
var head: Node3D
var hips: Array = []
var knees: Array = []
var ankles: Array = []
var shoulders: Array = []
var locked: Array = [] # shoulders holding a prop or raised
var panels: Array = []
var soles: Array = []
var tip: Node3D # where spells leave from (staff gem, orb, ...)


func build(s: Dictionary) -> void:
	spec = s
	name = s.get("id", "wizard")
	root = K.group(self)
	var skin := K.mat(0xe0b48c, 0.85, 0.0, null, 1.0, "skin")
	var iron := K.mat(0x6b7078, 0.5, 0.35, null, 1.0, "iron")
	var brass := K.mat(0xc79a45, 0.36, 0.38, null, 1.0, "brass")
	var wood := K.mat(0x7a5a34, 0.92, 0.0, null, 1.0, "wood")
	var boot := K.mat(0x3b2c22, 0.9, 0.0, null, 1.0, "boot")
	var bone := K.mat(0xded3bb, 0.85, 0.0, null, 1.0, "bone")
	var robe := K.mat(s["robe"], 0.93)
	var trim := K.mat(s["trim"], 0.55, 0.2)
	var leg := K.mat(s["legs"], 0.94)
	var glow := K.glow(s["glow"], 1.6)
	var hair := K.mat(s["hair"], 0.95)
	var sole_m := K.mat(0x241a14, 0.98, 0.0, null, 1.0, "sole")
	var robe2 := K.mat(s["robe"], 0.93)
	robe2.cull_mode = BaseMaterial3D.CULL_DISABLED

	# ---- legs (rigged)
	for i in 2:
		var sd := -1.0 if i == 0 else 1.0
		var hip := K.group(root, [sd * 0.115, HIP, 0])
		K.put(hip, K.sphere(0.098, 18, 14), leg, [0, 0, 0], null, [1, 0.9, 1])
		K.put(hip, K.capsule(0.082, THIGH - 0.10), leg, [0, -THIGH / 2, 0])
		var knee := K.group(hip, [0, -THIGH, 0])
		K.put(knee, K.sphere(0.073, 16, 12), leg)
		K.put(knee, K.capsule(0.066, SHIN - 0.10), leg, [0, -SHIN / 2, 0])
		K.put(knee, K.torus(0.072, 0.016), trim, [0, -SHIN * 0.45, 0], [PI / 2, 0, 0.2])
		var ankle := K.group(knee, [0, -SHIN, 0])
		K.put(ankle, K.cyl(0.072, 0.062, 0.10, 14), boot, [0, 0.015, 0])
		K.put(ankle, K.box(0.108, 0.072, 0.235), boot, [0, -0.038, 0.052])
		K.put(ankle, K.sphere(0.054, 14, 10), boot, [0, -0.040, 0.158], null, [1, 0.72, 1.25])
		soles.append(K.put(ankle, K.box(0.112, 0.022, 0.238), sole_m, [0, -0.072, 0.052]))
		hips.append(hip)
		knees.append(knee)
		ankles.append(ankle)

	# ---- coat, hem at the hip so the legs read
	var flare: float = s.get("flare", 1.0)
	K.put(root, K.lathe([[0.04, 0.640], [0.335 * flare, 0.650], [0.348 * flare, 0.700], [0.315, 0.840],
		[0.272, 1.000], [0.238, 1.060], [0.250, 1.170], [0.175, 1.270], [0.105, 1.300]], 40), robe)
	K.put(root, K.torus(0.343 * flare, 0.024, TAU, 44), trim, [0, 0.672, 0], [PI / 2, 0, 0])
	for k in 2:
		var panel := K.group(root, [0, 0.70, 0], [0, 0.0 if k == 0 else PI, 0])
		var plen := 0.60 if s.get("tattered", false) else 0.48
		K.put(panel, K.cyl_part(0.335 * flare, 0.375 * flare, plen, -0.82, 1.64), robe2, [0, -plen / 2, 0])
		K.put(panel, K.torus(0.372 * flare, 0.018, 1.64, 26), trim, [0, -plen, 0], [PI / 2, 0, -0.82 + PI / 2])
		if s.get("tattered", false):
			for i in 5:
				var a := -0.72 + (i / 4.0) * 1.44
				K.put(panel, K.cone(0.048, 0.20, 5), robe, [sin(a) * 0.365 * flare, -plen - 0.06, cos(a) * 0.365 * flare], [PI, a, 0])
		panels.append(panel)
	K.put(root, K.box(0.072, 0.62, 0.02), trim, [0, 0.98, 0.288], [0.10, 0, 0])

	# ---- belt
	K.put(root, K.torus(0.285, 0.036, TAU, 40), trim, [0, 0.86, 0], [PI / 2, 0, 0])
	K.put(root, K.box(0.115, 0.09, 0.045), brass, [0, 0.86, 0.29])
	if s.get("pouch", false):
		K.put(root, K.sphere(0.075), boot, [0.215, 0.795, 0.20], null, [1, 0.9, 0.7])

	# ---- shoulders
	match s.get("pads", ""):
		"stone":
			for i in 2:
				K.put(root, K.poly(0.135, 12), trim, [(-1 if i == 0 else 1) * 0.215, 1.19, 0], [0.3 * i, 0.6 * i, 0.2])
		"plate":
			for i in 2:
				var sd := -1.0 if i == 0 else 1.0
				K.put(root, K.sphere_part(0.135, 0, TAU, 0, PI / 2), trim, [sd * 0.205, 1.17, 0], [0, 0, sd * 0.35])
		"mantle":
			K.put(root, K.sphere_part(0.31, 0, TAU, 0, PI / 2.1, 26, 10), trim, [0, 1.10, 0], null, [1, 0.72, 1])

	# ---- arms (rigged at the shoulder)
	var prop: String = s.get("prop", "")
	var raised_local := Vector3.ZERO
	for i in 2:
		var sd := -1.0 if i == 0 else 1.0
		var side := "left" if sd < 0 else "right"
		var raised: bool = s.get("raise", "") == side
		var holds: bool = prop != "" and prop != "orb" and s.get("propSide", "right") == side
		var sh := K.group(root, [sd * 0.19, 1.17, 0])
		locked.append(raised or holds)
		var pts := []
		var src := [[0.19, 1.17, 0], [0.34, 1.20, 0.06], [0.40, 1.36, 0.14], [0.34, 1.52, 0.18]] if raised \
			else [[0.19, 1.17, 0], [0.30, 1.03, 0.04], [0.33, 0.88, 0.12], [0.30, 0.80, 0.20]]
		for q in src:
			pts.append(Vector3(sd * q[0] - sd * 0.19, q[1] - 1.17, q[2]))
		for k in pts.size() - 1:
			_limb(sh, pts[k], pts[k + 1], 0.072, robe)
		var cuff_at: Vector3 = pts[2].lerp(pts[3], 0.6)
		var cuff := K.put(sh, K.torus(0.076, 0.018), trim, cuff_at)
		cuff.basis = Basis.looking_at(pts[3] - pts[2], Vector3.UP if absf((pts[3] - pts[2]).normalized().y) < 0.95 else Vector3.RIGHT)
		cuff.position = cuff_at
		K.put(sh, K.sphere(0.055), skin, pts[3])
		if raised:
			raised_local = sh.position + pts[3]
		shoulders.append(sh)

	# ---- head
	head = K.group(root, [0, 1.30, 0])
	var hy := 0.12
	K.put(head, K.cyl(0.075, 0.09, 0.09, 16), skin, [0, 0.01, 0])
	K.put(head, K.sphere(0.155, 26, 20), skin, [0, hy, 0], null, [1, 1.06, 0.98])
	K.put(head, K.cone(0.033, 0.09), skin, [0, hy - 0.02, 0.15], [PI / 2, 0, 0])
	var void_face: bool = s.get("face", "") == "void"
	if void_face:
		K.put(head, K.sphere(0.15, 22, 16), K.mat(0x0b0714, 1.0, 0.0, null, 1.0, "void"), [0, hy, 0.03], null, [0.95, 1, 0.9])
	for i in 2:
		var sd := -1.0 if i == 0 else 1.0
		K.put(head, K.sphere(0.021, 12, 10), glow if void_face else K.mat(0x241c18, 0.4, 0.0, null, 1.0, "eye"), [sd * 0.058, hy + 0.03, 0.138])
	var beard: float = s.get("beard", 0.0)
	if beard > 0:
		var bp := []
		for q in [[0.005, 0], [0.10, 0.05], [0.135, 0.16], [0.15, 0.30], [0.14, 0.44], [0.10, 0.54], [0.03, 0.60]]:
			bp.append([q[0], hy - 0.03 - (0.60 - q[1]) * beard])
		K.put(head, K.lathe(bp, 28), hair, [0, 0, 0.035], null, [1, 1, 0.72])
		K.put(head, K.box(0.11, 0.035, 0.03), hair, [0, hy + 0.005, 0.145])
	if s.get("brows", false):
		for i in 2:
			var sd := -1.0 if i == 0 else 1.0
			K.put(head, K.box(0.058, 0.022, 0.024), hair, [sd * 0.062, hy + 0.068, 0.132], [0, 0, sd * 0.22])
	if s.get("wildHair", false):
		for i in 10:
			var a := i / 10.0 * TAU
			K.put(head, K.cone(0.032, 0.24, 6), hair, [sin(a) * 0.11, hy + 0.12, cos(a) * 0.11], [cos(a) * 0.7, 0, -sin(a) * 0.7])
	var hat: String = s.get("hat", "")
	if hat in ["point", "tall", "brim"]:
		var h := 0.78 if hat == "tall" else 0.34 if hat == "brim" else 0.56
		var br := 0.42 if hat == "brim" else 0.24 if hat == "tall" else 0.30
		var tilt: float = s.get("hatTilt", -0.12)
		var lean: float = s.get("hatLean", 0.10)
		K.put(head, K.torus(br, 0.035, TAU, 40), robe, [0, hy + 0.11, 0], [PI / 2, 0, 0], [1, 1, 0.55])
		K.put(head, K.disc(br), robe2, [0, hy + 0.10, 0], [-PI / 2, 0, 0])
		K.put(head, K.cone(br * 0.75, h, 26), robe, [0, hy + 0.12 + h / 2, 0], [tilt, 0, lean])
		K.put(head, K.torus(br * 0.70, 0.028, TAU, 34), trim, [0, hy + 0.17, 0], [PI / 2, 0, 0])
		tip = K.put(head, K.sphere(0.045), glow, [sin(lean) * -h * 0.9, hy + 0.12 + h * 0.98, sin(tilt) * h * 0.9], null, [1, 1.2, 1])
	elif hat == "hood" or hat == "deephood":
		var deep := hat == "deephood"
		K.put(head, K.sphere_part(0.225 if deep else 0.205, 0, TAU, 0, PI * 0.62, 28, 14), robe2,
			[0, hy + 0.05, -0.03 if deep else -0.02], [0.30 if deep else 0.22, 0, 0], [1, 1.25, 1.12])
		K.put(head, K.torus(0.185 if deep else 0.17, 0.03, TAU, 34), trim, [0, hy + 0.02, 0.045], [1.30, 0, 0])
		K.put(head, K.sphere_part(0.24, 0, TAU, PI * 0.42, PI * 0.30, 26, 8), robe2, [0, hy - 0.10, -0.02], null, [1.25, 1.1, 1.15])
	elif hat == "crown":
		for i in 7:
			var a := i / 7.0 * TAU
			K.put(head, K.cone(0.035, 0.20 + (i % 2) * 0.10, 5), glow, [sin(a) * 0.135, hy + 0.19, cos(a) * 0.135], [cos(a) * 0.28, 0, -sin(a) * 0.28])
		K.put(head, K.torus(0.145, 0.028, TAU, 30), trim, [0, hy + 0.10, 0], [PI / 2, 0, 0])
	elif hat == "cap":
		K.put(head, K.sphere_part(0.17, 0, TAU, 0, PI / 2, 24, 8), robe, [0, hy + 0.06, 0], null, [1, 0.8, 1])
		K.put(head, K.torus(0.168, 0.03, TAU, 30), trim, [0, hy + 0.06, 0], [PI / 2, 0, 0])

	# ---- held prop
	var px := -0.40 if s.get("propSide", "right") == "left" else 0.40
	if prop in ["staff", "crystal", "skull", "rod"]:
		var top: float = s.get("propHeight", 1.95)
		var plean: float = s.get("propLean", 0.05)
		K.put(root, K.cyl(0.028, 0.033, top, 16), wood, [px, top / 2, 0.16], [0, 0, plean])
		var hx := px + sin(-plean) * top
		if prop == "staff":
			K.put(root, K.torus(0.10, 0.022, TAU, 30), iron, [hx, top - 0.02, 0.16], [0, PI / 2, 0])
			tip = K.put(root, K.poly(0.072, 8), glow, [hx, top - 0.02, 0.16], null, [1, 1.4, 1])
		elif prop == "crystal":
			for i in 4:
				var a := i / 4.0 * TAU
				var shard := K.put(root, K.poly(0.055, 8), glow, [hx + sin(a) * 0.06, top + 0.02 + (i % 2) * 0.05, 0.16 + cos(a) * 0.06], [0.3, a, 0.2], [0.8, 1.9, 0.8])
				if i == 0:
					tip = shard
			K.put(root, K.cone(0.07, 0.14, 14), iron, [hx, top - 0.07, 0.16])
		elif prop == "skull":
			tip = K.put(root, K.sphere(0.10, 20, 16), bone, [hx, top + 0.03, 0.16], null, [0.95, 1, 1.05])
			K.put(root, K.box(0.13, 0.055, 0.07), bone, [hx, top - 0.05, 0.19])
			for i in 2:
				var sd := -1.0 if i == 0 else 1.0
				K.put(root, K.sphere(0.028), glow, [hx + sd * 0.04, top + 0.05, 0.245])
				K.put(root, K.cone(0.032, 0.22, 6), bone, [hx + sd * 0.085, top + 0.11, 0.14], [0, 0, sd * -0.7])
		else:
			tip = K.put(root, K.cyl(0.012, 0.012, 0.42, 10), iron, [hx, top + 0.20, 0.16])
			for i in 3:
				K.put(root, K.torus(0.055 + i * 0.02, 0.012), glow, [hx, top - 0.02 + i * 0.09, 0.16], [PI / 2, 0, 0])
	if prop == "orb" and raised_local != Vector3.ZERO:
		var p := raised_local + Vector3(0, 0.16, 0)
		tip = K.put(root, K.poly(0.11, 20), glow, p)
		for i in 3:
			K.put(root, K.torus(0.16 + i * 0.03, 0.008, TAU, 34), brass, p, [1.2 + i * 0.5, i * 0.8, 0.3])
	if prop == "club":
		var cx := 0.40
		K.put(root, K.cyl(0.045, 0.055, 0.75, 14), wood, [cx, 0.72, 0.18], [0, 0, 0.22])
		K.put(root, K.poly(0.15, 12), trim, [cx + 0.17, 1.12, 0.18], [0.4, 0.6, 0.2])
		tip = K.put(root, K.poly(0.045, 8), glow, [cx + 0.17, 1.12, 0.31])
	var motes: int = s.get("motes", 0)
	for i in motes:
		var a := i / float(motes) * TAU + 0.4
		var r := 0.36 + (i % 3) * 0.10
		K.put(root, K.poly(0.026 + (i % 2) * 0.012, 8), glow, [sin(a) * r, 0.85 + (i % 4) * 0.26, cos(a) * r], [a, a * 0.7, 0.3], null, false)
	if tip == null:
		tip = head


# A sleeve segment: a capsule from a to b.
func _limb(parent: Node3D, a: Vector3, b: Vector3, r: float, m: Material) -> void:
	var d := b - a
	var o := K.put(parent, K.capsule(r, d.length()), m, (a + b) / 2)
	var up := d.normalized()
	var side := up.cross(Vector3.FORWARD if absf(up.z) < 0.95 else Vector3.RIGHT).normalized()
	o.basis = Basis(side, up, side.cross(up))


# Poses the rig for a gait phase, then plants the lowest sole on y = 0.
func animate(phase: float, G: Dictionary, idle := false) -> void:
	for i in hips.size():
		var p := phase + (PI if i else 0.0)
		var swing := sin(p)
		hips[i].rotation.x = swing * G["amp"] - G["lean"] * 0.5
		var bend := maxf(0.0, sin(p - 0.7))
		knees[i].rotation.x = -bend * G["amp"] * 1.55 - (0.04 if idle else 0.10)
		ankles[i].rotation.x = -swing * G["amp"] * 0.30 + bend * 0.18
	for i in shoulders.size():
		var sh: Node3D = shoulders[i]
		if locked[i]:
			sh.rotation.x = sin(phase * 0.5) * 0.02
			continue
		sh.rotation.x = -sin(phase + (PI if i else 0.0)) * G["amp"] * G["arm"]
		sh.rotation.z = sin(phase * 2) * 0.02
	for i in panels.size():
		panels[i].rotation.x = -sin(phase * 2) * G["amp"] * 0.10 - G["lean"] * 0.4 * (-1 if i else 1)
	root.rotation = Vector3(G["lean"], sin(phase) * G["amp"] * 0.06, sin(phase) * G["amp"] * 0.035)
	head.rotation = Vector3(-G["lean"] * 0.8 + sin(phase * 2) * 0.015, -sin(phase) * G["amp"] * 0.05, 0)
	root.position.y = 0
	var lowest := INF
	for i in soles.size():
		var y: float = (root.transform * hips[i].transform * knees[i].transform * ankles[i].transform * soles[i].transform).origin.y
		lowest = minf(lowest, y)
	if lowest != INF:
		root.position.y = -lowest + absf(sin(phase)) * G["bob"] * 0.35


# A gait blended from idle -> walk -> run by speed fraction k (0..1).
static func blend_gait(k: float) -> Dictionary:
	var a: Dictionary = GAIT["idle"] if k < 0.5 else GAIT["walk"]
	var b: Dictionary = GAIT["walk"] if k < 0.5 else GAIT["run"]
	var u := k * 2 if k < 0.5 else (k - 0.5) * 2
	var out := {}
	for key in a:
		out[key] = lerpf(a[key], b[key], u)
	return out
