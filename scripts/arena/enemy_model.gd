# Placeholder enemy silhouettes (Grave Thrall, Iron Bulwark, Hexcaller) and spell walls.
# Port of buildEnemy / buildWall from story/design/court_of_waves/reference/game/models.js.
# The model faces +Z.
extends Node3D

const K := preload("res://scripts/arena/mesh_kit.gd")

var kind := ""
var body: Node3D
var torso: Node3D
var legs: Array = []
var arms: Array = []
var mats: Array = [] # tinted for hit flash / frozen / burning
var base_emission: Array = []
var shield: Node3D
var orb: Node3D
var sigil: Node3D
var height := 1.35
var ice_r := 0.62
var floats := false


func _m(color, rough := 0.8, metal := 0.0, emissive = null, energy := 1.0, double := false) -> StandardMaterial3D:
	var m := K.mat(color, rough, metal, emissive, energy)
	m.emission_enabled = true
	if emissive == null:
		m.emission = Color.BLACK
	if double:
		m.cull_mode = BaseMaterial3D.CULL_DISABLED
	mats.append(m)
	base_emission.append([m.emission, m.emission_energy_multiplier])
	return m


func build(k: String) -> void:
	kind = k
	name = k
	body = K.group(self)
	if k == "thrall":
		_thrall()
	elif k == "bulwark":
		_bulwark()
	else:
		_hexcaller()


func _thrall() -> void:
	var skin := _m(0x7d8a63, 0.85)
	var rag := _m(0x3e302b, 0.95, 0.0, null, 1.0, true)
	var bone := _m(0xd8ccb0, 0.8)
	var eye := _m(0xff3b2f, 0.5, 0.0, 0xff2a1a, 2.4)
	for sd in [-1, 1]:
		var hip := K.group(body, [sd * 0.14, 0.46, 0])
		K.put(hip, K.capsule(0.075, 0.3), skin, [0, -0.22, 0])
		K.put(hip, K.box(0.13, 0.06, 0.22), skin, [0, -0.44, 0.05])
		legs.append(hip)
	torso = K.group(body, [0, 0.5, 0])
	K.put(torso, K.capsule(0.22, 0.26), skin, [0, 0.26, 0.06], [0.65, 0, 0], [1.1, 1, 0.9])
	K.put(torso, K.cyl_part(0.0, 0.3, 0.34, 0, TAU, 8), rag, [0, -0.02, 0], [PI, 0, 0])
	for i in 3:
		K.put(torso, K.cone(0.045, 0.2, 5), bone, [0, 0.52 - i * 0.12, -0.1 - i * 0.05], [-0.9, 0, 0])
	var head := K.group(torso, [0, 0.52, 0.3])
	K.put(head, K.sphere(0.17, 14, 12), skin, null, null, [1, 0.9, 1.1])
	K.put(head, K.box(0.2, 0.07, 0.14), bone, [0, -0.1, 0.08])
	for sd in [-1, 1]:
		K.put(head, K.sphere(0.036, 8, 6), eye, [sd * 0.07, 0.03, 0.15])
		K.put(head, K.cone(0.04, 0.26, 6), bone, [sd * 0.12, 0.15, -0.04], [-0.6, 0, sd * -0.5])
	for sd in [-1, 1]:
		var sh := K.group(torso, [sd * 0.27, 0.36, 0.14])
		K.put(sh, K.capsule(0.055, 0.42), skin, [0, -0.26, 0.08], [0.3, 0, 0])
		for c in [-1, 0, 1]:
			K.put(sh, K.cone(0.02, 0.13, 4), bone, [c * 0.035, -0.53, 0.18], [PI * 0.85, 0, 0])
		arms.append(sh)
	height = 1.35
	ice_r = 0.62


func _bulwark() -> void:
	var iron := _m(0x6e5c4e, 0.5, 0.55)
	var dark := _m(0x3a3330, 0.6, 0.5)
	var cloth := _m(0x6b2020, 0.95)
	var brass := _m(0xc9a227, 0.4, 0.5)
	var slit := _m(0xff8a2a, 0.5, 0.0, 0xff7a1a, 2.6)
	var wood := _m(0x5a3c22, 0.9)
	for sd in [-1, 1]:
		var hip := K.group(body, [sd * 0.22, 0.8, 0])
		K.put(hip, K.cyl(0.13, 0.15, 0.72, 10), dark, [0, -0.38, 0])
		K.put(hip, K.box(0.26, 0.14, 0.38), iron, [0, -0.76, 0.06])
		legs.append(hip)
	torso = K.group(body, [0, 0.8, 0])
	K.put(torso, K.cyl(0.46, 0.38, 0.88, 14), iron, [0, 0.48, 0])
	K.put(torso, K.box(0.66, 0.5, 0.1), iron, [0, 0.58, 0.39])
	K.put(torso, K.box(0.42, 0.7, 0.04), cloth, [0.12, 0.02, 0.41])
	K.put(torso, K.torus(0.4, 0.04), brass, [0, 0.1, 0], [PI / 2, 0, 0])
	for sd in [-1, 1]:
		K.put(torso, K.sphere_part(0.26, 0, TAU, 0, PI / 2, 14, 6), iron, [sd * 0.5, 0.88, 0], [0, 0, sd * 0.4])
	K.put(torso, K.cyl(0.22, 0.24, 0.38, 12), dark, [0, 1.12, 0.02])
	K.put(torso, K.box(0.06, 0.14, 0.42), brass, [0, 1.36, 0])
	K.put(torso, K.box(0.28, 0.045, 0.03), slit, [0, 1.14, 0.24])
	shield = K.group(torso, [-0.34, 0.5, 0.56], [0, 0.12, 0])
	K.put(shield, K.box(0.92, 1.3, 0.1), dark)
	for y in [0.66, -0.66]:
		K.put(shield, K.box(0.96, 0.07, 0.13), brass, [0, y, 0])
	for x in [-0.47, 0.47]:
		K.put(shield, K.box(0.07, 1.36, 0.13), brass, [x, 0, 0])
	K.put(shield, K.sphere(0.12, 12, 8), brass, [0, 0.12, 0.06])
	K.put(shield, K.box(0.07, 0.5, 0.02), slit, [0, -0.3, 0.06])
	var arm := K.group(torso, [0.55, 0.82, 0.05])
	K.put(arm, K.cyl(0.1, 0.09, 0.55, 10), iron, [0, -0.26, 0])
	K.put(arm, K.cyl(0.045, 0.05, 0.95, 8), wood, [0, -0.85, 0])
	K.put(arm, K.box(0.36, 0.28, 0.28), dark, [0, -1.32, 0])
	K.put(arm, K.box(0.38, 0.06, 0.3), brass, [0, -1.2, 0])
	arms.append(arm)
	height = 2.3
	ice_r = 1.0


func _hexcaller() -> void:
	var robe := _m(0x1f3d3b, 0.9, 0.0, null, 1.0, true)
	var inner := _m(0x050909, 1.0)
	var glow := _m(0x5cffb0, 0.4, 0.0, 0x3dffa0, 2.4)
	var trim := _m(0x8a7a4a, 0.5, 0.4)
	K.put(body, K.cyl_part(0.0, 0.46, 1.5, 0, TAU, 14), robe, [0, 0.95, 0])
	for i in 9:
		var a := i / 9.0 * TAU
		K.put(body, K.cone(0.07, 0.3, 4), robe, [sin(a) * 0.42, 0.12, cos(a) * 0.42], [PI, 0, 0])
	K.put(body, K.sphere(0.27, 14, 10), robe, [0, 1.55, 0], null, [1.15, 0.7, 1])
	K.put(body, K.torus(0.2, 0.03), trim, [0, 1.62, 0.02], [PI / 2, 0, 0])
	K.put(body, K.sphere_part(0.25, 0, TAU, 0, PI * 0.65, 14, 8), robe, [0, 1.8, -0.03], [0.28, 0, 0], [1, 1.2, 1.1])
	K.put(body, K.sphere(0.17, 12, 10), inner, [0, 1.75, 0.08])
	for sd in [-1, 1]:
		K.put(body, K.sphere(0.03, 8, 6), glow, [sd * 0.06, 1.77, 0.23])
	for sd in [-1, 1]:
		var h := K.group(body, [sd * 0.44, 1.22, 0.26])
		K.put(h, K.sphere(0.07, 10, 8), glow, null, null, null, false)
		arms.append(h)
	orb = K.put(body, K.poly(0.12, 20), glow, [0, 1.25, 0.52], null, null, false)
	sigil = K.put(body, K.torus(0.62, 0.02, TAU, 44, 6), glow, [0, -0.15, 0], [PI / 2, 0, 0], null, false)
	height = 2.35
	ice_r = 0.85
	floats = true


# Hit flash (f 0..1), frozen, burning and chill tints over each material's own glow.
func tint(f: float, frozen: bool, burning: bool, chill: float, t: float) -> void:
	for i in mats.size():
		var m: StandardMaterial3D = mats[i]
		var e0: Color = base_emission[i][0]
		var i0: float = base_emission[i][1]
		m.emission = e0
		m.emission_energy_multiplier = i0
		if f > 0:
			m.emission = e0.lerp(Color.WHITE, f)
			m.emission_energy_multiplier = maxf(i0, 1.4 * f)
		elif frozen:
			m.emission = e0.lerp(Color("#6fc8ff"), 0.5)
			m.emission_energy_multiplier = maxf(i0, 0.6)
		elif burning:
			m.emission = e0.lerp(Color("#ff6a2a"), 0.35)
			m.emission_energy_multiplier = maxf(i0, 0.5 + sin(t * 20) * 0.15)
		elif chill > 0:
			m.emission = e0.lerp(Color("#6fc8ff"), 0.12 * chill)
			m.emission_energy_multiplier = maxf(i0, 0.4)


static func build_wall(parent: Node3D, mat_kind: String, seed_value: float) -> Node3D:
	var g := K.group(parent)
	if mat_kind == "ice":
		var m := K.mat(0xbfefff, 0.12, 0.05, 0x3aa0ff, 0.4, "wall_ice")
		m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		m.albedo_color.a = 0.85
		K.put(g, K.poly(0.55, 20), m, [0, 0.78, 0], [0.2, seed_value, 0.1], [0.85, 1.6, 0.7])
		K.put(g, K.poly(0.28, 20), m, [0.3, 0.3, 0.15], [0.5, seed_value * 2, 0.3], [0.7, 1.3, 0.7])
	else:
		var m := K.mat(0x7a6e62, 0.95, 0.0, null, 1.0, "wall_rock")
		K.put(g, K.poly(0.55, 12), m, [0, 0.72, 0], [0.3, seed_value, 0.2], [0.95, 1.45, 0.8])
		K.put(g, K.poly(0.25, 12), m, [-0.28, 0.2, 0.2], [seed_value, 0.4, 0])
	return g
