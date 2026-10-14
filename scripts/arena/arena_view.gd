# The 3D view of an ArenaSim: builds the court, mirrors the sim's bodies, shots, areas and
# walls each frame, and turns sim events into effects (particles, lightning, damage numbers,
# shake). It only reads the sim. Port of story/design/court_of_waves/reference/game/render.js.
extends Node3D

const K := preload("res://scripts/arena/mesh_kit.gd")
const WizardModel := preload("res://scripts/arena/wizard_model.gd")
const EnemyModel := preload("res://scripts/arena/enemy_model.gd")
const ArenaSim := preload("res://scripts/core/arena_sim.gd")
const SpellBook := preload("res://scripts/core/spell_book.gd")
const Roster := preload("res://scripts/core/wizard_roster.gd")
const VfxDirector := preload("res://scripts/vfx/vfx_director.gd")
const MatrixVisuals := preload("res://scripts/vfx/matrix_visuals.gd")

const TAGS := {
	"steam": ["STEAM", "#e8eef4"], "freeze": ["FROZEN", "#a8ecff"], "shatter": ["SHATTER", "#ffffff"],
	"conduct": ["CONDUCTED x2", "#f4e15c"], "thaw": ["THAW", "#ffb070"], "blocked": ["BLOCKED", "#e0c060"],
	"interrupt": ["INTERRUPTED", "#ffffff"], "evade": ["EVADE", "#c4b5fd"],
	"entangled": ["ENTANGLED", "#5cc84a"], "kindled": ["KINDLED", "#ff8a3a"], "fanned": ["FANNED", "#ffb070"],
	"windchill": ["WINDCHILL", "#bfe8dc"], "purged": ["PURGED x1.5", "#fff1a8"], "swallowed": ["SWALLOWED", "#b08ae8"],
	"reflected": ["REFLECTED", "#fff1a8"], "regrown": ["REGROWN", "#5cc84a"],
	"thermal": ["THERMAL SHOCK", "#ffb070"], "miss": ["MISS", "#d6c08a"], "confused": ["CONFUSED", "#c084fc"],
	"deflected": ["DEFLECTED", "#67e8f9"], "immune": ["IMMUNE", "#ffd86b"], "revived": ["REVIVED", "#7dff8a"],
}
# Particle looks per element / effect: colours, lifetime, size, gravity (negative rises), additive glow.
const STYLE := {
	"fire": {"cols": ["#ffd27a", "#ff7a2f", "#ff4a1a"], "life": 0.5, "size": 0.32, "grav": -4.0, "glow": true},
	"water": {"cols": ["#5cb8ff", "#2f7fff", "#bfe6ff"], "life": 0.55, "size": 0.14, "grav": 14.0, "glow": true},
	"ice": {"cols": ["#e8fbff", "#a8ecff", "#7dd3fc"], "life": 0.7, "size": 0.14, "grav": 2.0, "glow": true},
	"lightning": {"cols": ["#ffffff", "#fff2a0", "#f4e15c"], "life": 0.22, "size": 0.12, "grav": 0.0, "glow": true},
	"earth": {"cols": ["#7a5634", "#9c7346", "#5a4030"], "life": 0.7, "size": 0.18, "grav": 16.0, "glow": false},
	"arcane": {"cols": ["#f0a8ff", "#d04bff", "#9c4bff"], "life": 0.6, "size": 0.24, "grav": -1.0, "glow": true},
	"hex": {"cols": ["#b8ffe0", "#5cffb0", "#2fd59a"], "life": 0.6, "size": 0.2, "grav": -1.0, "glow": true},
	"steam": {"cols": ["#e8eef4", "#cfd8e2"], "life": 1.1, "size": 0.7, "grav": -2.5, "glow": false},
	"smoke": {"cols": ["#3a3440", "#2a2630"], "life": 1.1, "size": 0.7, "grav": -1.8, "glow": false},
	"spark": {"cols": ["#ffffff", "#ffe2a0"], "life": 0.25, "size": 0.1, "grav": 9.0, "glow": true},
	"blood": {"cols": ["#4a1f1f", "#2e1414"], "life": 0.55, "size": 0.12, "grav": 14.0, "glow": false},
	"rune": {"cols": ["#ff5050", "#ff2a2a", "#ff8a6a"], "life": 0.75, "size": 0.18, "grav": -2.0, "glow": true},
	"nature": {"cols": ["#b6f08a", "#5cc84a", "#2f8a2a"], "life": 0.8, "size": 0.18, "grav": 3.0, "glow": false},
	"wind": {"cols": ["#ffffff", "#dff5ee", "#bfe8dc"], "life": 0.5, "size": 0.2, "grav": -0.5, "glow": false},
	"light": {"cols": ["#ffffff", "#fff8d0", "#fff1a8"], "life": 0.5, "size": 0.22, "grav": -1.5, "glow": true},
	"dark": {"cols": ["#b08ae8", "#6a35b8", "#2a1450"], "life": 0.7, "size": 0.24, "grav": -0.8, "glow": false},
	"heal": {"cols": ["#e8ffd8", "#7dff8a", "#3ccf5a"], "life": 0.8, "size": 0.18, "grav": -2.0, "glow": true},
}
const RED := Color("#ff3b3b")
const BANNER := preload("res://shaders/banner.gdshader")

var camera: Camera3D
var director: VfxDirector # the VFX handoff's spectacle layer
var env: Environment
var shake := 0.0
var t := 0.0
var aim := Vector2(0, -1)
var menu_blend := 1.0
var cam_target := Vector3(0, 0, 3.5)

var wizard: Node3D # WizardModel
var wizard_id := ""
var _pv := {} # player view extras: phase, yaw, ice, ward, stones, motes
var enemy_views := {} # id -> {model, tele, spawn_ring, yaw, phase, arm, ice}
var shot_views := {}
var area_views := {}
var wall_views := {}
var prop_views := {} # prop id -> {node, mat, ...}
var pillar_views: Array = []
var braziers: Array = []
var banners: Array = [] # gate banners (cloth shader)
var floor_rune: MeshInstance3D # a faint rune circle turning at the centre
var ripples := 0 # puddle rings spawned so far (R-064)
var _ripple_t := {} # puddle id -> seconds to its next ring
var _flicker := FastNoiseLite.new() # brazier light: smooth but never repeating
var transients: Array = [] # {node, t, max, update: Callable}
var corpses: Array = []
var _reticle: Node3D
var _ret_ring: MeshInstance3D
var _ret_area: MeshInstance3D
var _cone_prev: MeshInstance3D
var _cone_key := ""
var _wall_prev: MeshInstance3D
var ret_dim := false # the queued spell can't be cast now (energy or recharge): the reticle dims
var _stacks := {} # damage-number target -> {t, n}: numbers landing together stack instead of overlapping
var _quad_glow: QuadMesh
var _arena_built := false


func _ready() -> void:
	setup()


# Builds lights, camera and the court once (safe to call before the node enters the tree).
func setup() -> void:
	if _arena_built:
		return
	_arena_built = true
	var we := WorldEnvironment.new()
	env = Environment.new()
	# a night sky: deep violet overhead, a dusky band at the horizon (R-064)
	var sky_m := ProceduralSkyMaterial.new()
	sky_m.sky_top_color = Color("#0b0a1f")
	sky_m.sky_horizon_color = Color("#3a2f63")
	sky_m.sky_curve = 0.12
	sky_m.ground_horizon_color = Color("#2a2347")
	sky_m.ground_bottom_color = Color("#0d0b18")
	var sky := Sky.new()
	sky.sky_material = sky_m
	env.background_mode = Environment.BG_SKY
	env.sky = sky
	env.background_color = Color("#1a1530")
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color("#a49ce0")
	env.ambient_light_energy = 0.38
	env.tonemap_mode = Environment.TONE_MAPPER_ACES
	env.tonemap_exposure = 1.1
	env.fog_enabled = true
	env.fog_mode = Environment.FOG_MODE_DEPTH
	env.fog_light_color = Color("#1a1530")
	env.fog_depth_begin = 30.0
	env.fog_depth_end = 64.0
	env.glow_enabled = true
	env.glow_intensity = 0.8
	env.glow_bloom = 0.1
	env.glow_hdr_threshold = 1.0
	env.glow_blend_mode = Environment.GLOW_BLEND_MODE_ADDITIVE
	we.environment = env
	add_child(we)
	var moon := DirectionalLight3D.new()
	moon.light_color = Color("#ccd2ff")
	moon.light_energy = 1.0
	moon.shadow_enabled = true
	moon.sky_mode = DirectionalLight3D.SKY_MODE_LIGHT_ONLY # no sun disc in the night sky
	moon.directional_shadow_max_distance = 60.0
	add_child(moon)
	moon.look_at_from_position(Vector3(-9, 22, 8), Vector3.ZERO)
	camera = Camera3D.new()
	camera.fov = 40
	camera.near = 0.5
	camera.far = 160
	add_child(camera)
	camera.position = Vector3(0, 13.5, 16)
	_quad_glow = QuadMesh.new()
	_quad_glow.size = Vector2(1, 1)
	_build_arena()
	_build_reticle()
	director = VfxDirector.new()
	add_child(director)
	director.setup(self)
	_flicker.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	_flicker.frequency = 0.9
	var rune_m := K.flat(Color("#f0c84a"), 0.06, true) # faint: it must never read as a spell ring
	rune_m.albedo_texture = director.textures.rune()
	var plane := PlaneMesh.new()
	plane.size = Vector2(2, 2)
	floor_rune = K.put(self, plane, rune_m, [0, 0.012, 0], null, [3.4, 1, 3.4], false)


# ---------------------------------------------------------------- arena
func _build_arena() -> void:
	var R := ArenaSim.ARENA_R
	var rnd := RandomNumberGenerator.new()
	rnd.seed = 31
	var floor_m := StandardMaterial3D.new()
	floor_m.albedo_texture = _floor_texture(R + 1.2)
	floor_m.roughness = 0.9
	K.put(self, K.disc(R + 1.2, 96), floor_m, [0, 0, 0], [-PI / 2, 0, 0], null, false)
	var rim := K.mat(0x231e2c, 1.0, 0.0, null, 1.0, "court_rim")
	K.put(self, K.cyl_part(R + 1.2, R + 1.8, 1.0, 0, TAU, 64), rim, [0, -0.5, 0], null, null, false)
	K.put(self, K.disc(90, 48), K.mat(0x1b1824, 1.0), [0, -0.6, 0], [-PI / 2, 0, 0], null, false)
	var stone := K.mat(0x5d566a, 0.95, 0.0, null, 1.0, "wall_stone")
	var stone_dark := K.mat(0x463f52, 0.95, 0.0, null, 1.0, "wall_stone_dark")
	var iron := K.mat(0x3b3640, 0.55, 0.5, null, 1.0, "gate_iron")
	var coal := K.glow(Color("#ff8a3a"), 3.0)
	var gates := ArenaSim.gates()
	var gate_angles := []
	for g in gates:
		gate_angles.append(atan2(g.x, -g.y))
	var N := 40
	var rr := R + 0.85
	for i in N:
		var a := (i + 0.5) / N * TAU
		var near_gate := false
		for ga in gate_angles:
			if absf(atan2(sin(a - ga), cos(a - ga))) < 0.15:
				near_gate = true
		if near_gate:
			continue
		var w := TAU * rr / N + 0.05
		var h := 2.1 + rnd.randf() * 0.7
		K.put(self, K.box(w, h, 1.3), stone_dark if i % 3 == 0 else stone, [sin(a) * rr, h / 2, -cos(a) * rr], [0, -a, 0])
		if i % 2 == 0:
			K.put(self, K.box(w * 0.45, 0.45, 1.3), stone, [sin(a) * rr, h + 0.22, -cos(a) * rr], [0, -a, 0])
	for ga in gate_angles:
		var G := K.group(self, [sin(ga) * rr, 0, -cos(ga) * rr], [0, -ga, 0])
		for sd in [-1, 1]:
			K.put(G, K.box(1.0, 3.6, 1.6), stone_dark, [sd * 2.75, 1.8, 0])
			K.put(G, K.box(1.2, 0.3, 1.8), stone, [sd * 2.75, 3.75, 0])
			K.put(G, K.cyl(0.06, 0.09, 1.1, 8), iron, [sd * 2.75, 0.55, 1.2])
			K.put(G, K.cyl(0.32, 0.18, 0.28, 12), iron, [sd * 2.75, 1.2, 1.2])
			K.put(G, K.sphere(0.2, 10, 8), coal, [sd * 2.75, 1.32, 1.2], null, null, false)
			var light := OmniLight3D.new()
			light.light_color = Color("#ff8a3a")
			light.light_energy = 1.6
			light.omni_range = 7.0
			light.position = Vector3(sd * 2.75, 1.9, 1.35)
			G.add_child(light)
			braziers.append({"light": light, "group": G, "local": Vector3(sd * 2.75, 1.45, 1.2)})
		K.put(G, K.box(6.6, 0.7, 1.6), stone, [0, 3.95, 0])
		for sd in [-1, 1]:
			var cloth := PlaneMesh.new()
			cloth.size = Vector2(0.9, 2.1)
			cloth.orientation = PlaneMesh.FACE_Z
			cloth.subdivide_width = 4
			cloth.subdivide_depth = 16
			var bm := ShaderMaterial.new()
			bm.shader = BANNER
			bm.set_shader_parameter("phase", rnd.randf() * TAU)
			bm.set_shader_parameter("speed", 1.7 + rnd.randf() * 0.6)
			bm.set_shader_parameter("wave", 0.12)
			banners.append(K.put(G, cloth, bm, [sd * 1.35, 2.6, 0.86], null, null, false))
		for k in range(-4, 5):
			K.put(G, K.box(0.08, 1.2, 0.08), iron, [k * 0.5, 3.0, -0.3])
		K.put(G, K.box(4.6, 0.1, 0.1), iron, [0, 2.45, -0.3])
		K.put(G, K.ring(1.1, 1.22, 40), K.flat(Color("#8a2b2b"), 0.6), [0, 0.015, rr - 13.2], [-PI / 2, 0, 0], null, false)
	var pine := K.mat(0x1c2a27, 1.0, 0.0, null, 1.0, "pine")
	for i in 54:
		var a := rnd.randf() * TAU
		var r := R + 4 + rnd.randf() * 16
		var s := 1.3 + rnd.randf() * 1.8
		var x := sin(a) * r
		var z := -cos(a) * r
		K.put(self, K.cone(0.9 * s, 2.6 * s, 7), pine, [x, 1.0 * s, z])
		K.put(self, K.cone(0.65 * s, 2.0 * s, 7), pine, [x, 2.2 * s, z])
	var tower := K.mat(0x3a3446, 0.95)
	for d in [[-7, -22, 1.8, 10], [8, -23, 1.5, 8], [-17, -12, 1.3, 7]]:
		K.put(self, K.cyl(d[2], d[2] * 1.08, d[3], 10), tower, [d[0], d[3] / 2.0, d[1]])
		K.put(self, K.cone(d[2] * 1.3, d[2] * 1.8, 10), stone_dark, [d[0], d[3] + d[2] * 0.9, d[1]])


# The arena's props come from the sim (positions, sizes); call once per sim.
func build_props(sim: ArenaSim) -> void:
	for v in prop_views.values():
		v["node"].queue_free()
	prop_views.clear()
	for v in pillar_views:
		v["node"].queue_free()
	pillar_views.clear()
	var rnd := RandomNumberGenerator.new()
	rnd.seed = 47
	var stone_dark := K.mat(0x463f52, 0.95, 0.0, null, 1.0, "wall_stone_dark")
	var rune := K.mat(0x6d28ff, 0.4, 0.0, 0x7c3aff, 1.6, "pillar_rune")
	for p in sim.pillars:
		var h := 3.2 + rnd.randf() * 0.8
		var m := K.mat(0x6c6578, 0.9)
		m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		var G := K.group(self, [p.pos.x, 0, p.pos.y])
		K.put(G, K.cyl(p.r + 0.15, p.r + 0.25, 0.4, 10), stone_dark, [0, 0.2, 0])
		K.put(G, K.cyl(p.r * 0.85, p.r, h, 10), m, [0, h / 2, 0])
		K.put(G, K.cyl(p.r + 0.04, p.r + 0.04, 0.12, 10), rune, [0, 1.3, 0])
		K.put(G, K.box(p.r * 2.3, 0.35, p.r * 2.3), m, [0, h + 0.17, 0], [0, rnd.randf(), 0])
		pillar_views.append({"p": p, "mat": m, "node": G})
	for p in sim.puddles:
		var m := K.mat(0x1f3b58, 0.1, 0.2)
		m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		m.albedo_color.a = 0.9
		var G := K.group(self, [p.pos.x, 0, p.pos.y])
		K.put(G, K.disc(p.r, 36), m, [0, 0.025, 0], [-PI / 2, 0, rnd.randf() * 3], [1.06, 0.94, 1], false)
		for k in 10:
			var a := k / 10.0 * TAU + rnd.randf()
			K.put(G, K.poly(0.09 + rnd.randf() * 0.08, 12), stone_dark, [sin(a) * p.r * 1.03, 0.05, cos(a) * p.r * 0.96])
		prop_views[p.id] = {"node": G, "mat": m, "fx": _emitter(G, "lightning", 40, Vector3(p.r * 0.7, 0.05, p.r * 0.7))}
	for p in sim.brush:
		var m := K.mat(0x9c8a4c, 0.95)
		var G := K.group(self, [p.pos.x, 0, p.pos.y])
		var tufts := K.group(G)
		for k in 24:
			var a := rnd.randf() * TAU
			var r: float = sqrt(rnd.randf()) * p.r * 0.85
			var h := 0.35 + rnd.randf() * 0.45
			K.put(tufts, K.cone(0.08 + rnd.randf() * 0.06, h, 4), m, [sin(a) * r, h / 2, cos(a) * r], [(rnd.randf() - 0.5) * 0.4, rnd.randf() * 3, (rnd.randf() - 0.5) * 0.4])
		prop_views[p.id] = {"node": G, "mat": m, "tufts": tufts, "fx": _emitter(G, "fire", 60, Vector3(p.r * 0.7, 0.1, p.r * 0.7))}
	var wood := K.mat(0x6e4526, 0.85, 0.0, null, 1.0, "barrel_wood")
	var lid := K.mat(0x4f321c, 0.9, 0.0, null, 1.0, "barrel_lid")
	var brass := K.mat(0xc9a227, 0.4, 0.45, null, 1.0, "arena_brass")
	for p in sim.barrels:
		var G := K.group(self, [p.pos.x, 0, p.pos.y])
		K.put(G, K.cyl(0.38, 0.34, 0.9, 14), wood, [0, 0.45, 0])
		for y in [0.18, 0.72]:
			K.put(G, K.torus(0.378, 0.03, TAU, 20, 6), brass, [0, y, 0], [PI / 2, 0, 0])
		var rm := K.mat(0xff5a2a, 0.5, 0.0, 0xff4a1a, 1.6)
		K.put(G, K.box(0.16, 0.26, 0.04), rm, [0, 0.46, 0.37])
		K.put(G, K.cyl(0.33, 0.33, 0.04, 14), lid, [0, 0.91, 0])
		prop_views[p.id] = {"node": G, "rune": rm}


static var _floor_tex: ImageTexture
static var _puff_tex: GradientTexture2D


# A soft round dot for particles.
static func _puff_texture() -> GradientTexture2D:
	if _puff_tex == null:
		var g := Gradient.new()
		g.set_color(0, Color(1, 1, 1, 1))
		g.set_color(1, Color(1, 1, 1, 0))
		g.add_point(0.35, Color(1, 1, 1, 0.8))
		_puff_tex = GradientTexture2D.new()
		_puff_tex.gradient = g
		_puff_tex.fill = GradientTexture2D.FILL_RADIAL
		_puff_tex.fill_from = Vector2(0.5, 0.5)
		_puff_tex.fill_to = Vector2(1.0, 0.5)
		_puff_tex.width = 32
		_puff_tex.height = 32
	return _puff_tex


func _floor_texture(radius: float) -> ImageTexture:
	if _floor_tex:
		return _floor_tex
	var S := 512
	var img := Image.create(S, S, false, Image.FORMAT_RGB8)
	var px := S / (radius * 2)
	var c := S / 2.0
	for y in S:
		for x in S:
			var dx := (x - c) / px
			var dy := (y - c) / px
			var r := sqrt(dx * dx + dy * dy)
			var col := Color("#3f3a4b")
			if r < 0.9:
				col = Color("#332e3d")
			else:
				var ring_i := int((r - 0.9) / 1.25)
				var n := maxi(6, roundi(TAU * (0.9 + ring_i * 1.25 + 0.6) / 1.5))
				var a := fposmod(atan2(dy, dx) + ring_i * 1.7, TAU)
				var seg := int(a / TAU * n)
				var h := absi(hash(Vector2i(ring_i, seg)))
				col = Color.from_hsv((250.0 + (h % 18)) / 360.0, 0.07 + ((h >> 5) % 6) / 100.0, 0.27 + ((h >> 9) % 9) / 100.0)
				var edge_r := fposmod(r - 0.9, 1.25)
				var edge_a := fposmod(a / TAU * n, 1.0)
				if edge_r < 0.05 or edge_a < 0.03:
					col = Color("#25212e")
				if (r > 4.5 and r < 4.6) or (r > 5.1 and r < 5.2):
					col = Color(0.79, 0.64, 0.15).lerp(col, 0.4)
			img.set_pixel(x, y, col)
	img.generate_mipmaps()
	_floor_tex = ImageTexture.create_from_image(img)
	return _floor_tex


func _build_reticle() -> void:
	_reticle = K.group(self)
	_ret_ring = K.put(_reticle, K.ring(0.8, 1.0, 40), K.flat(Color.WHITE, 0.85), [0, 0.04, 0], [-PI / 2, 0, 0], [0.34, 0.34, 1], false)
	_ret_area = K.put(_reticle, K.ring(0.94, 1.0, 64), K.flat(Color.WHITE, 0.5), [0, 0.04, 0], [-PI / 2, 0, 0], null, false)
	_cone_prev = K.put(self, K.wedge(5, 50), K.flat(Color.WHITE, 0.08), [0, 0.035, 0], null, null, false)
	_wall_prev = K.put(self, K.box(1, 0.01, 0.5), K.flat(Color.WHITE, 0.18), [0, 0.04, 0], null, null, false)


# ---------------------------------------------------------------- setup per run
func reset(sim: ArenaSim) -> void:
	setup()
	if prop_views.is_empty():
		build_props(sim)
	for m in [enemy_views, shot_views, area_views, wall_views]:
		for v in m.values():
			_free_view(v)
		m.clear()
	for c in corpses:
		_free_view(c["v"])
	corpses.clear()
	for tr in transients:
		if is_instance_valid(tr["node"]):
			tr["node"].queue_free()
	transients.clear()
	director.reset()
	if wizard == null or wizard_id != sim.player.wizard:
		set_wizard(sim.player.wizard)
	cam_target = Vector3(sim.player.pos.x, 0, sim.player.pos.y)
	shake = 0


func set_wizard(id: String) -> void:
	if wizard:
		wizard.queue_free()
		for m in _pv.get("motes", []):
			m.queue_free()
	wizard_id = id
	var spec := Roster.find(id)
	if spec.is_empty():
		spec = Roster.all()[0]
	wizard = WizardModel.new()
	wizard.build(spec)
	add_child(wizard)
	var ice_m := K.mat(0xcff4ff, 0.1, 0.0, 0x4ab0ff, 0.35, "ice_case")
	ice_m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	ice_m.albedo_color.a = 0.55
	var ice := K.put(wizard, K.poly(1.0, 20), ice_m, [0, 1.0, 0], null, [0.7, 1.15, 0.7])
	ice.visible = false
	var ward := K.put(wizard, K.sphere(1.0), K.flat(Color("#b48cff"), 0.14, true), [0, 1.0, 0])
	ward.visible = false
	var stones := K.group(wizard)
	var rock := K.mat(0x7a6e62, 0.95, 0.0, null, 1.0, "wall_rock")
	for i in 6:
		var a := i / 6.0 * TAU
		K.put(stones, K.poly(0.11, 12), rock, [sin(a) * 0.72, 0.2, cos(a) * 0.72])
	stones.visible = false
	var motes := []
	for i in 3:
		var m := K.put(self, K.sphere(0.09, 10, 8), K.glow(Color.WHITE, 2.4))
		m.visible = false
		motes.append(m)
	_pv = {"phase": 0.0, "yaw": PI, "ice": ice, "ward": ward, "stones": stones, "motes": motes,
		"burn": _emitter(wizard, "fire", 38, Vector3(0.25, 0.6, 0.25), 1.0),
		"shock": _emitter(wizard, "lightning", 40, Vector3(0.35, 0.8, 0.35), 1.0)}


func _free_view(v: Dictionary) -> void:
	for k in v:
		if v[k] is Node and is_instance_valid(v[k]):
			v[k].queue_free()


# Mouse position on screen -> point on the ground plane (y = 0) as Vector2(x, z).
func screen_to_ground(screen: Vector2) -> Vector2:
	var from := camera.project_ray_origin(screen)
	var dir := camera.project_ray_normal(screen)
	if absf(dir.y) < 1e-4:
		return Vector2(from.x, from.z)
	var k := -from.y / dir.y
	var hit := from + dir * k
	return Vector2(hit.x, hit.z)


func ground(p: Vector2, y := 0.0) -> Vector3:
	return Vector3(p.x, y, p.y)


# ---------------------------------------------------------------- effects
func _particles(style: String, n: int) -> CPUParticles3D:
	var S: Dictionary = STYLE.get(style, STYLE["arcane"])
	var p := CPUParticles3D.new()
	p.amount = n
	p.lifetime = S["life"]
	p.mesh = _quad_glow
	var m := K.flat(Color.WHITE, 0.4 if style == "steam" else 0.5 if style == "smoke" else 0.9, S["glow"])
	m.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
	m.billboard_keep_scale = true
	m.vertex_color_use_as_albedo = true
	m.albedo_texture = _puff_texture()
	p.material_override = m
	p.gravity = Vector3(0, -S["grav"], 0)
	p.damping_min = 1.0
	p.damping_max = 2.5
	p.scale_amount_min = S["size"] * 0.7
	p.scale_amount_max = S["size"] * 1.3
	var curve := Curve.new()
	curve.add_point(Vector2(0, 1))
	curve.add_point(Vector2(1, 0.15))
	p.scale_amount_curve = curve
	var grad := Gradient.new()
	var cols: Array = S["cols"]
	grad.set_color(0, Color(cols[0]))
	grad.set_color(1, Color(cols[cols.size() - 1], 0.0))
	p.color_ramp = grad
	return p


# A looping emitter under `parent` (status effects, burning brush, charged puddles). Off until used.
func _emitter(parent: Node3D, style: String, rate: int, box: Vector3, y := 0.2) -> CPUParticles3D:
	var p := _particles(style, maxi(4, int(rate * STYLE[style]["life"])))
	p.emission_shape = CPUParticles3D.EMISSION_SHAPE_BOX
	p.emission_box_extents = box
	p.position = Vector3(0, y, 0)
	p.direction = Vector3(0, 1, 0)
	p.spread = 30.0
	p.initial_velocity_min = 0.3
	p.initial_velocity_max = 1.2
	p.emitting = false
	parent.add_child(p)
	return p


func _transient(node: Node3D, life: float, update: Callable) -> void:
	transients.append({"node": node, "t": 0.0, "max": life, "update": update})


# A floating number: pops in, arcs up and sideways, fades. Numbers for the same `key` (a target id)
# within 0.25 s stack upward.
func text(at: Vector3, s: String, color: Color, size := 48, life := 0.9, key = null) -> void:
	var l := Label3D.new()
	l.text = s
	l.modulate = color
	l.outline_modulate = Color(0.08, 0.06, 0.12, 0.9)
	l.outline_size = 10
	l.font_size = size
	l.pixel_size = 0.01
	l.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	l.no_depth_test = true
	l.fixed_size = false
	var lift := 0.0
	if key != null:
		var st = _stacks.get(key)
		if st == null or t - st["t"] > 0.25:
			st = {"n": -1}
			_stacks[key] = st
		st["n"] += 1
		st["t"] = t
		lift = st["n"] * 0.38
	l.position = at + Vector3(randf_range(-0.15, 0.15), lift, 0)
	l.scale = Vector3.ONE * 1.6
	add_child(l)
	var p0 := l.position
	var drift := randf_range(0.35, 0.6) * (1.0 if randf() < 0.5 else -1.0)
	_transient(l, life, func(k: float):
		var e := _ease(k)
		l.position = p0 + Vector3(drift * e, 0.9 * e, 0)
		var pop := 1.0 - minf(1.0, k * life / 0.12)
		l.scale = Vector3.ONE * (1.0 + 0.6 * pop * pop)
		l.modulate.a = 1.0 - k * k)


func ring_fx(at: Vector2, r: float, color: Color, dur := 0.4) -> void:
	var m := K.flat(color, 0.85)
	var o := K.put(self, K.ring(0.85, 1.0, 48), m, ground(at, 0.06), [-PI / 2, 0, 0], null, false)
	_transient(o, dur, func(k: float):
		var e := _ease(k)
		o.scale = Vector3.ONE * (0.2 + r * e)
		m.albedo_color.a = 0.85 * (1 - k))


# Fractal re-striking bolt through ground points (the VFX director's bolt). Low bolts are quiet.
func lightning(pts: Array, color: Color, y0 := 1.15, y1 := 1.0) -> void:
	var quiet := y1 < 0.5
	var p3 := []
	for i in pts.size():
		p3.append(Vector3(pts[i].x, y0 if i == 0 else y1, pts[i].y))
	director.bolt(p3, color, {"quiet": quiet, "w": 0.11 if quiet else 0.22, "life": 0.14 if quiet else 0.26})


# A straight ray of light: a bright core and a wide halo that fade out.
func beam_fx(from: Vector2, to: Vector2, width: float, color: Color) -> void:
	var g := K.group(self)
	var core := K.flat(Color(1, 1, 1), 1.0, true)
	var halo := K.flat(color, 0.6, true)
	var a := ground(from, 1.1)
	var b := ground(to, 1.1)
	_segment(g, a, b, maxf(0.08, width * 0.35), core)
	_segment(g, a, b, maxf(0.3, width * 1.2), halo)
	shake = minf(1.0, shake + 0.15 * width)
	_transient(g, 0.35, func(k: float):
		core.albedo_color.a = 1.0 - k
		halo.albedo_color.a = 0.6 * (1.0 - k)
		g.scale = Vector3(1, 1 - k * 0.6, 1))


func _segment(parent: Node3D, a: Vector3, b: Vector3, w: float, m: Material) -> void:
	var L := a.distance_to(b)
	if L < 1e-3:
		return
	var o := K.put(parent, K.box(w, w, L), m, (a + b) / 2, null, null, false)
	o.look_at_from_position((a + b) / 2, b, Vector3.UP if absf((b - a).normalized().y) < 0.99 else Vector3.RIGHT)


func _style(el: String) -> String:
	return el if STYLE.has(el) else "arcane"


func _el_color(el: String) -> Color:
	if SpellBook.element(el).is_empty():
		return Color("#5cffb0") if el == "hex" else Color("#f4f1ff")
	return SpellBook.color(el)


# Turns this tick's sim events into effects.
func consume(events: Array, sim: ArenaSim) -> void:
	for e in events:
		# Every particle look is the director's (R-060); this keeps text, corpses, shake and geometry.
		director.on_event(e, sim)
		match e["type"]:
			"explode":
				shake = minf(1.2, shake + (0.55 if e["big"] else 0.28))
			"impact":
				if not e.get("enemy", false) and e.get("kind", "") == "boulder":
					shake = minf(1.0, shake + 0.12)
			"chain":
				lightning(e["pts"], e["color"])
			"beam":
				beam_fx(e["from"], e["to"], e["width"], e["color"])
			"heal":
				text(ground(e["pos"], 2.5), "+" + str(roundi(e["amt"])), Color("#7dff8a"), 44, 0.9, "heal")
			"hit":
				var col := _el_color(e["el"])
				if e.get("crit", false):
					text(ground(e["pos"], 2.5), "CRIT -%d!" % roundi(e["dmg"]), Color("#ffd27a"), 72, 1.1, e["id"])
				else:
					text(ground(e["pos"], 2.2), str(roundi(e["dmg"])), col, 40 if e["dot"] else 56, 0.9, e["id"])
			"hurt":
				var col := Color("#ff9a3c") if e["self"] else Color("#ff5a5a")
				text(ground(e["pos"], 2.4), "-" + str(roundi(e["dmg"])), col, 52, 0.9, e["id"])
				if not e["dot"]:
					shake = minf(1.0, shake + 0.2)
			"tag":
				if TAGS.has(e["tag"]):
					# tags carry no target id: stack the ones landing on the same spot
					text(ground(e["pos"], 2.9), TAGS[e["tag"]][0], Color(TAGS[e["tag"]][1]), 40, 1.0, "tag:%d:%d" % [roundi(e["pos"].x), roundi(e["pos"].y)])
			"death":
				var v = enemy_views.get(e["id"])
				if v:
					enemy_views.erase(e["id"])
					v["tele"].visible = false
					v["spawn_ring"].visible = false
					corpses.append({"v": v, "t": 0.0})
			"spawn":
				ring_fx(e["pos"], 1.2, Color("#ff3b3b"), 0.9)
			"wall":
				shake = minf(1.0, shake + 0.1)
			"slam":
				ring_fx(e["pos"], e["r"], RED, 0.4)
				shake = minf(1.2, shake + 0.4)
			"playerDeath":
				shake = minf(1.2, shake + 0.5)


# ---------------------------------------------------------------- frame
func render(sim: ArenaSim, dt: float, aim_point: Vector2) -> void:
	aim = aim_point
	t += dt
	_update_player(sim, dt)
	_sync_enemies(sim, dt)
	_sync_shots(sim, dt)
	_sync_areas(sim, dt)
	_sync_walls(sim, dt)
	_sync_props(sim)
	_update_reticle(sim)
	for i in range(transients.size() - 1, -1, -1):
		var tr: Dictionary = transients[i]
		tr["t"] += dt
		var k := minf(1.0, tr["t"] / tr["max"])
		if not is_instance_valid(tr["node"]):
			transients.remove_at(i)
			continue
		if tr["update"].is_valid():
			tr["update"].call(k)
		if k >= 1.0:
			tr["node"].queue_free()
			transients.remove_at(i)
	for i in range(corpses.size() - 1, -1, -1):
		var c: Dictionary = corpses[i]
		c["t"] += dt
		var model = c["v"]["model"]
		model.body.rotation.x = -1.4 * _ease(c["t"] / 0.4)
		if c["t"] > 0.7:
			model.position.y -= dt * 1.2
		if c["t"] > 1.8:
			_free_view(c["v"])
			corpses.remove_at(i)
	for i in braziers.size():
		var b: Dictionary = braziers[i]
		# two octaves of smooth noise: a slow breath and a quicker lick, never in step or repeating
		var n := _flicker.get_noise_2d(t * 2.2, i * 31.0) * 0.6 + _flicker.get_noise_2d(t * 6.5, i * 31.0 + 500.0) * 0.4
		b["light"].light_energy = 1.6 * (0.88 + n * 0.16)
	_ambient_life(sim, dt)
	floor_rune.rotation.y += dt * 0.06
	_update_camera(sim, dt)
	director.update(dt, sim, tip_pos())


# The court breathing between fights (R-064): embers off the braziers (a few drift away on the air),
# dust motes hanging over the court, and rings spreading across still puddles.
func _ambient_life(sim: ArenaSim, dt: float) -> void:
	if dt <= 0:
		return
	var parts = director.particles
	for b in braziers:
		if randf() < dt * 2.6:
			var at: Vector3 = b["group"].to_global(b["local"])
			var rogue := randf() < 0.18
			var side := Vector2.from_angle(randf() * TAU) * (randf_range(1.8, 2.8) if rogue else randf_range(0.0, 0.4))
			parts.spark("fire", at + Vector3(randf_range(-0.1, 0.1), 0.05, randf_range(-0.1, 0.1)),
				Vector3(side.x, randf_range(1.4, 2.6), side.y), {"grav": -0.6, "life": randf_range(0.9, 1.6), "w": 0.6})
	if randf() < dt * 4.0:
		var a := randf() * TAU
		var r := sqrt(randf()) * ArenaSim.ARENA_R
		parts.sprite("dust", Vector3(sin(a) * r, randf_range(0.4, 2.2), -cos(a) * r), Vector3(randf_range(0.1, 0.3), randf_range(-0.05, 0.08), randf_range(-0.1, 0.1)),
			{"buoy": 0.02, "drag": 0.15, "life": randf_range(4.0, 6.0), "k": 0.22, "a": 0.14})
	for pd in sim.puddles:
		if pd.state != "water":
			continue
		var left: float = _ripple_t.get(pd.id, randf_range(0.2, 1.5)) - dt
		if left <= 0:
			left = randf_range(1.2, 3.0)
			var a := randf() * TAU
			var at: Vector2 = pd.pos + Vector2(sin(a), cos(a)) * sqrt(randf()) * pd.r * 0.55
			var m := K.flat(Color("#bfe0ff"), 0.0)
			var o := K.put(self, K.ring(0.9, 1.0, 40), m, ground(at, 0.04), [-PI / 2, 0, 0], null, false)
			var size: float = pd.r * randf_range(0.25, 0.45)
			_transient(o, 1.5, func(k: float):
				o.scale = Vector3.ONE * (0.1 + size * _ease(k))
				m.albedo_color.a = 0.32 * (1.0 - k))
			ripples += 1
		_ripple_t[pd.id] = left


# The wizard's staff tip in world space (where spells leave from), or null without a wizard.
func tip_pos():
	if wizard == null:
		return null
	if wizard.tip and wizard.tip.is_inside_tree():
		return wizard.tip.global_position
	return wizard.position + Vector3(0, 1.6, 0)


func _update_camera(sim: ArenaSim, dt: float) -> void:
	var p := sim.player
	var menu := sim.mode == "menu"
	menu_blend += ((1.0 if menu else 0.0) - menu_blend) * (1 - exp(-3 * dt))
	var want := Vector3(p.pos.x + (aim.x - p.pos.x) * 0.15 * (1 - menu_blend), 0, p.pos.y + (aim.y - p.pos.y) * 0.15 * (1 - menu_blend))
	cam_target = cam_target.lerp(want, 1 - exp(-6 * dt))
	var ang := t * 0.12 + 0.5
	var off := Vector3(0, 13.5, 12.5).lerp(Vector3(sin(ang) * 6.5, 3.2, cos(ang) * 6.5), menu_blend)
	var side := Vector3(cos(ang), 0, -sin(ang)) * 2.3 * menu_blend
	shake *= exp(-9 * dt)
	var jitter := Vector3(randf() - 0.5, (randf() - 0.5) * 0.6, randf() - 0.5) * shake * 0.5
	camera.position = cam_target + off + side + jitter + director.kick
	camera.fov = 40.0 + director.fov
	camera.look_at(Vector3(cam_target.x + side.x, 0.8 + menu_blend * 0.4, cam_target.z + side.z), Vector3.UP)
	for pl in pillar_views:
		var dz: float = pl["p"].pos.y - p.pos.y
		var dx: float = absf(pl["p"].pos.x - p.pos.x)
		var hide: bool = menu_blend < 0.5 and dz > 0 and dz < 4.2 and dx < pl["p"].r + 0.9
		var m: StandardMaterial3D = pl["mat"]
		m.albedo_color.a += ((0.28 if hide else 1.0) - m.albedo_color.a) * minf(1.0, dt * 10)


func _update_player(sim: ArenaSim, dt: float) -> void:
	var p := sim.player
	if wizard == null:
		return
	wizard.position = ground(p.pos)
	var want := 0.0 if sim.mode == "menu" else atan2(p.f.x, p.f.y)
	_pv["yaw"] = _lerp_angle(_pv["yaw"], want, 1 - exp(-18 * dt))
	wizard.rotation.y = _pv["yaw"]
	var frozen := p.st.frozen > 0
	_pv["ice"].visible = frozen
	_pv["ward"].visible = p.st.ward > 0
	_pv["stones"].visible = p.st.stoneskin > 0
	_pv["stones"].rotation.y += dt * 3
	_pv["burn"].emitting = p.st.burn > 0
	_pv["shock"].emitting = p.st.shock > 0 or p.st.haste > 0
	if not p.alive:
		var k := _ease(p.dead_t / 0.7)
		wizard.root.rotation.x = -1.45 * k
		wizard.root.position.y = 0.12 * k
	else:
		var k := minf(1.0, p.cur_speed / ArenaSim.TUNING["speed"])
		if not frozen:
			_pv["phase"] += dt * WizardModel.blend_gait(k)["speed"]
		wizard.animate(_pv["phase"], WizardModel.blend_gait(k), k < 0.1)
		var c := p.cast_t / 0.3
		wizard.root.rotation.x += sin(c * PI) * 0.22
		if p.dodge > 0:
			var d := 1 - p.dodge / ArenaSim.TUNING["dodge_time"]
			wizard.root.rotation.x += sin(d * PI) * 0.6
			wizard.scale = Vector3(1, 1 - sin(d * PI) * 0.22, 1)
		else:
			wizard.scale = Vector3.ONE
		if p.hurt_t > 0:
			wizard.root.rotation.x -= p.hurt_t * 0.6
	for i in 3:
		var m: MeshInstance3D = _pv["motes"][i]
		var el: String = p.queue[i] if i < p.queue.size() else ""
		m.visible = el != "" and p.alive
		if el == "":
			continue
		var mm: StandardMaterial3D = m.material_override
		mm.albedo_color = SpellBook.color(el)
		mm.emission = SpellBook.color(el)
		var a := t * 3 + i / 3.0 * TAU
		m.position = Vector3(p.pos.x + sin(a) * 0.75, 1.15 + sin(t * 4 + i) * 0.08, p.pos.y + cos(a) * 0.75)


func _make_telegraph(kind: String) -> Dictionary:
	var g := K.group(self)
	var m := K.flat(RED, 0.0)
	var m2 := K.flat(RED, 0.0)
	var parts := {}
	# m: the fill that grows over the windup; m2: the faint full outline, which pulses just before the strike
	if kind == "thrall":
		parts["wedge"] = K.put(g, K.wedge(1.75, 90), m2, null, null, null, false)
		parts["fill"] = K.put(g, K.wedge(1.75, 90), m, [0, 0.004, 0], null, null, false)
	elif kind == "bulwark":
		parts["fill"] = K.put(g, K.disc(1.0, 40), m, null, [-PI / 2, 0, 0], null, false)
		parts["ring"] = K.put(g, K.ring(0.94, 1.0, 48), m2, [0, 0.005, 0], [-PI / 2, 0, 0], null, false)
	else:
		parts["line"] = K.put(g, K.box(0.14, 0.01, 1.0), m2, [0, 0, 0.5], null, null, false)
		parts["fill"] = K.put(g, K.box(0.14, 0.012, 1.0), m, [0, 0.003, 0.5], null, null, false)
	g.position.y = 0.035
	return {"group": g, "m": m, "m2": m2, "parts": parts, "pulse": false}


func _sync_enemies(sim: ArenaSim, dt: float) -> void:
	var seen := {}
	for e in sim.enemies:
		seen[e.id] = true
		var v = enemy_views.get(e.id)
		if v == null:
			var model := EnemyModel.new()
			model.build(e.kind)
			add_child(model)
			var ice_m := K.mat(0xcff4ff, 0.1, 0.0, 0x4ab0ff, 0.35, "ice_case")
			var ice := K.put(model, K.poly(1.0, 20), ice_m, [0, model.height * 0.45, 0], null, [model.ice_r, model.height * 0.55, model.ice_r])
			ice.visible = false
			var spawn_ring := K.put(self, K.disc(1.0, 32), K.flat(Color("#3a0a12"), 0.85), ground(e.pos, 0.03), [-PI / 2, 0, 0], [0.1, 0.1, 1], false)
			var tele := _make_telegraph(e.kind)
			v = {"model": model, "ice": ice, "spawn_ring": spawn_ring, "tele": tele["group"], "tele_d": tele,
				"phase": randf() * 6, "yaw": e.face, "arm": 0.0,
				"burn": _emitter(model, "fire", 30, Vector3(0.25, model.height * 0.35, 0.25), model.height * 0.4),
				"root": _emitter(model, "nature", 20, Vector3(model.ice_r * 0.6, 0.05, model.ice_r * 0.6), 0.05),
				"curse": _emitter(model, "dark", 16, Vector3(0.3, model.height * 0.4, 0.3), model.height * 0.4),
				"rings": MatrixVisuals.build_status_rings(model),
				"shock": _emitter(model, "lightning", 30, Vector3(0.3, model.height * 0.4, 0.3), model.height * 0.4)}
			enemy_views[e.id] = v
		_update_enemy_view(v, e, dt, sim)
	for id in enemy_views.keys():
		if not seen.has(id):
			_free_view(enemy_views[id])
			enemy_views.erase(id)


func _update_enemy_view(v: Dictionary, e, dt: float, sim: ArenaSim) -> void:
	var model = v["model"]
	var st = e.st
	var A: Dictionary = e.T["atk"]
	v["yaw"] = _lerp_angle(v["yaw"], e.face, 1 - exp(-14 * dt))
	model.rotation.y = v["yaw"]
	var y := 0.0
	if e.state == "spawn":
		var k: float = 1 - e.state_t / 0.9
		y = -model.height * (1 - _ease(k))
		v["spawn_ring"].visible = true
		v["spawn_ring"].scale = Vector3(0.4 + minf(1.0, k * 2), 0.4 + minf(1.0, k * 2), 1)
	else:
		v["spawn_ring"].visible = false
	if model.floats:
		y += 0.28 + sin(t * 2.2 + e.id) * 0.08
	var frozen: bool = st.frozen > 0
	var spd: float = e.vel.length()
	if not frozen:
		v["phase"] += dt * (2 + spd * 2.6)
	for i in model.legs.size():
		model.legs[i].rotation.x = sin(v["phase"] + i * PI) * minf(1.0, spd / 2) * 0.7
	var w := 0.0
	if e.state == "windup" or e.state == "charge":
		w = 1 - maxf(0.0, e.state_t) / A["windup"]
	var lean := 0.0
	var squash := 1.0
	if not frozen:
		if e.kind == "thrall":
			var swing := sin(v["phase"]) * minf(1.0, spd / 2) * 0.5
			var target := 0.0
			if e.state == "windup":
				target = -2.6 * _ease(w)
				squash = 1 - 0.14 * w
			elif e.state == "strike":
				target = -0.4
				lean = 0.45
			v["arm"] += (target - v["arm"]) * minf(1.0, dt * (30 if e.state == "strike" else 14))
			for i in model.arms.size():
				model.arms[i].rotation.x = v["arm"] + ((swing if i else -swing) if e.state == "chase" else 0.0)
		elif e.kind == "bulwark":
			var target := 0.0
			if e.state == "windup":
				target = -3.4 * _ease(w)
			elif e.state == "recover":
				target = -0.9 if e.state_t > A["recover"] - 0.15 else -0.9 * (e.state_t / A["recover"])
			v["arm"] += (target - v["arm"]) * minf(1.0, dt * (40 if e.state == "recover" and e.state_t > A["recover"] - 0.15 else 9))
			model.arms[0].rotation.x = v["arm"]
			model.shield.position.x = -0.34 - 0.2 * w if e.state == "windup" else -0.34
			model.shield.rotation.y = 0.12 + 0.6 * w if e.state == "windup" else 0.12
		else:
			model.orb.scale = Vector3.ONE * (0.5 + 1.8 * w if e.state == "charge" else 0.5)
			for i in model.arms.size():
				model.arms[i].position.y = 1.22 + (0.25 * w if e.state == "charge" else sin(t * 3 + i) * 0.04)
			model.sigil.rotation.z += dt * (6 if e.state == "charge" else 1.2)
	var f: float = e.flash / 0.14
	model.body.rotation.x = lean - f * 0.3
	model.body.scale = Vector3(1 + f * 0.08, squash - f * 0.06, 1 + f * 0.08)
	var jitter := Vector2.ZERO
	if st.shock > 0:
		jitter = Vector2(randf() - 0.5, randf() - 0.5) * 0.08
	model.position = Vector3(e.pos.x + jitter.x, y, e.pos.y + jitter.y)
	model.tint(f, frozen, st.burn > 0, st.chill, t)
	v["ice"].visible = frozen
	v["burn"].emitting = st.burn > 0 and e.state != "spawn"
	v["shock"].emitting = st.shock > 0
	v["root"].emitting = st.root > 0
	v["curse"].emitting = st.curse > 0 or st.blind > 0
	MatrixVisuals.update_status_rings(v["rings"], st, model.ice_r, t)
	# telegraphs
	var T: Dictionary = v["tele_d"]
	var g: Node3D = T["group"]
	g.visible = not frozen and e.state != "spawn"
	var m: StandardMaterial3D = T["m"]
	var m2: StandardMaterial3D = T["m2"]
	var winding: bool = e.state == "windup" or e.state == "charge"
	T["pulse"] = winding and e.state_t < 0.2
	var flick := 0.45 + 0.55 * absf(sin(t * 22.0)) if T["pulse"] else 1.0
	var fw := maxf(0.01, w)
	if e.kind == "thrall":
		var on: bool = e.state == "windup" or e.state == "strike"
		g.position = ground(e.pos, 0.035)
		g.rotation.y = atan2(e.aim.x, e.aim.y)
		T["parts"]["fill"].scale = Vector3(fw, 1, fw) if e.state == "windup" else Vector3.ONE
		m.albedo_color.a = (0.7 if e.state == "strike" else 0.3 + 0.3 * w) if on else 0.0
		m2.albedo_color.a = 0.3 * flick if e.state == "windup" else 0.0
	elif e.kind == "bulwark":
		var on: bool = e.state == "windup"
		g.position = ground(e.slam, 0.035)
		T["parts"]["ring"].scale = Vector3(A["radius"], A["radius"], 1)
		var fr := maxf(0.01, A["radius"] * fw)
		T["parts"]["fill"].scale = Vector3(fr, fr, 1)
		m.albedo_color.a = 0.32 if on else 0.0
		m2.albedo_color.a = 0.95 * flick if on else 0.0
	else:
		var on: bool = e.state == "charge"
		var L := minf(A["range"], sim.player.pos.distance_to(e.pos))
		g.position = ground(e.pos, 0.035)
		g.rotation.y = atan2(e.aim.x, e.aim.y)
		T["parts"]["line"].scale = Vector3(1 + w, 1, L)
		T["parts"]["line"].position.z = L / 2
		T["parts"]["fill"].scale = Vector3(1 + w, 1, maxf(0.01, L * w))
		T["parts"]["fill"].position.z = L * w / 2
		m.albedo_color.a = 0.75 if on else 0.0
		m2.albedo_color.a = 0.22 * flick if on else 0.0


func _sync_shots(sim: ArenaSim, dt: float) -> void:
	var seen := {}
	for b in sim.shots:
		seen[b.id] = true
		var v = shot_views.get(b.id)
		if v == null:
			var obj: MeshInstance3D
			var style := "hex"
			if b.kind == "boulder":
				var col := Color("#7a6e62")
				if b.els.has("fire"):
					col = Color("#ff6a2b")
				elif b.els.has("arcane"):
					col = Color("#d04bff")
				elif b.els.has("lightning"):
					col = Color("#f4e15c")
				obj = K.put(self, K.poly(0.4, 12), K.mat(0x6e6258, 0.9, 0.0, col, 0.6))
				style = _style(b.els[0])
			elif b.kind == "orb":
				obj = K.put(self, K.sphere(0.28, 12, 8), K.glow(Color("#5cffb0"), 2.2), null, null, null, false)
			else:
				obj = K.put(self, K.sphere(b.r * 1.1, 12, 8), K.glow(b.color, 2.4), null, null, null, false)
				style = _style(b.els[0])
			var trail := _emitter(obj, style, 60, Vector3(0.1, 0.1, 0.1), 0.0)
			trail.local_coords = false
			trail.emitting = true
			trail.initial_velocity_max = 0.5
			v = {"obj": obj}
			shot_views[b.id] = v
		var y := 0.95 if b.kind == "boulder" else 1.15
		v["obj"].position = ground(b.pos, y)
		if b.kind == "boulder":
			v["obj"].rotation.x += dt * 9
			v["obj"].rotation.z += dt * 4
	for id in shot_views.keys():
		if not seen.has(id):
			_free_view(shot_views[id])
			shot_views.erase(id)


func _sync_areas(sim: ArenaSim, dt: float) -> void:
	var seen := {}
	for a in sim.areas:
		seen[a.id] = true
		var v = area_views.get(a.id)
		if v == null:
			var fm := K.flat(a.color.darkened(0.45), 0.16)
			var em := K.flat(a.color, 0.8)
			var fill := K.put(self, K.disc(1.0, 48), fm, ground(a.pos, 0.03), [-PI / 2, 0, 0], [a.r, a.r, 1], false)
			var edge := K.put(self, K.ring(0.95, 1.0, 64), em, ground(a.pos, 0.04), [-PI / 2, 0, 0], [a.r, a.r, 1], false)
			v = {"fill": fill, "edge": edge, "fm": fm, "em": em, "zap": 0.0}
			if a.delay > 0:
				v["star"] = K.put(self, K.sphere(0.45, 16, 10), K.glow(a.color, 3.0), null, null, null, false)
			else:
				v["fxn"] = K.group(self, ground(a.pos))
				v["fx"] = _emitter(v["fxn"], _style(a.els[0]), int(28 * a.r), Vector3(a.r * 0.7, 0.05, a.r * 0.7), 0.1)
				v["fx"].emitting = true
			var mx := MatrixVisuals.build(self, a)
			v["mx"] = mx
			if mx.has("root"):
				v["mx_root"] = mx["root"]
			area_views[a.id] = v
		MatrixVisuals.update(v["mx"], a, dt, t, director)
		var fade := 1.0 if a.delay > 0 else minf(1.0, a.life / 0.4)
		if a.delay > 0:
			var k: float = 1 - a.delay / a.delay_max
			var r := maxf(0.01, a.r * _ease(k))
			v["fill"].scale = Vector3(r, r, 1)
			v["fm"].albedo_color.a = 0.18 + 0.2 * k
			v["em"].albedo_color.a = 0.5 + 0.5 * absf(sin(t * 14))
			v["star"].position = Vector3(a.pos.x + (1 - k) * 4, 0.6 + (1 - k) * 12, a.pos.y - (1 - k) * 2)
		else:
			v["fm"].albedo_color.a = 0.16 * fade
			v["em"].albedo_color.a = 0.8 * fade
			if a.els.has("lightning"):
				v["zap"] -= dt
				if v["zap"] <= 0:
					v["zap"] = 0.12
					var p0 := randf() * TAU
					var p1 := p0 + 1 + randf() * 2
					lightning([a.pos + Vector2(sin(p0), cos(p0)) * a.r * 0.8, a.pos + Vector2(sin(p1), cos(p1)) * a.r * 0.6], a.color, 0.2, 0.2)
	for id in area_views.keys():
		if not seen.has(id):
			_free_view(area_views[id])
			area_views.erase(id)


func _sync_walls(sim: ArenaSim, dt: float) -> void:
	var seen := {}
	for w in sim.walls:
		seen[w.id] = true
		var v = wall_views.get(w.id)
		if v == null:
			var obj := EnemyModel.build_wall(self, w.mat, w.id * 1.7)
			obj.position = ground(w.pos)
			v = {"obj": obj, "age": 0.0}
			wall_views[w.id] = v
		v["age"] += dt
		var rise := _ease(v["age"] / 0.16)
		var hp := maxf(0.0, w.hp / w.max_hp)
		v["obj"].scale = Vector3(1, maxf(0.05, rise * (0.75 + 0.25 * hp)), 1)
		v["obj"].position.y = -(0.6 - w.life) * 1.5 if w.life < 0.6 else 0.0
	for id in wall_views.keys():
		if not seen.has(id):
			_free_view(wall_views[id])
			wall_views.erase(id)


func _sync_props(sim: ArenaSim) -> void:
	for pd in sim.puddles:
		var v = prop_views.get(pd.id)
		if v == null:
			continue
		var m: StandardMaterial3D = v["mat"]
		m.emission_enabled = pd.state != "water"
		if pd.state == "frozen":
			m.albedo_color = Color("#cdeeff")
			m.emission = Color("#6fb8e8")
			m.emission_energy_multiplier = 0.2
			m.roughness = 0.35
		elif pd.state == "charged":
			m.albedo_color = Color("#3d7fbf")
			m.emission = Color("#f4e15c")
			m.emission_energy_multiplier = 0.25 + randf() * 0.35
			m.roughness = 0.1
		else:
			m.albedo_color = Color("#1f3b58", 0.9)
			m.roughness = 0.08
		v["fx"].emitting = pd.state == "charged"
	for br in sim.brush:
		var v = prop_views.get(br.id)
		if v == null:
			continue
		var m: StandardMaterial3D = v["mat"]
		m.emission_enabled = br.state == "burning"
		if br.state == "burning":
			m.albedo_color = Color("#4a2a12")
			m.emission = Color("#ff5a1a")
			m.emission_energy_multiplier = 0.8 + sin(t * 18 + br.pos.x) * 0.3
			v["tufts"].scale.y = maxf(0.4, br.t / 5.0)
		elif br.state == "ash":
			m.albedo_color = Color("#2b2724")
			v["tufts"].scale.y = 0.3
		else:
			m.albedo_color = Color("#9c8a4c")
			v["tufts"].scale.y = 1.0
		v["fx"].emitting = br.state == "burning"
	for b in sim.barrels:
		var v = prop_views.get(b.id)
		if v == null:
			continue
		v["node"].visible = b.alive
		v["rune"].emission_energy_multiplier = 6.0 if b.fuse > 0 else 1.4 + sin(t * 3 + b.pos.x) * 0.4
		v["node"].scale = Vector3.ONE * (1.12 if b.fuse > 0 else 1.0)


func _update_reticle(sim: ArenaSim) -> void:
	var p := sim.player
	var playing: bool = (sim.mode == "play" or sim.mode == "paused") and p.alive
	_reticle.visible = playing
	_cone_prev.visible = false
	_wall_prev.visible = false
	_ret_area.visible = false
	if not playing:
		return
	var queued := not p.queue.is_empty()
	var sp := SpellBook.resolve(p.queue if queued else p.last)
	var col: Color = sp["color"] if not sp.is_empty() else Color.WHITE
	ret_dim = not sp.is_empty() and (p.energy < sp["cost"] or p.shape_cd.get(ArenaSim.recharge_key(sp), 0.0) > 0)
	var dim := 0.4 if ret_dim else 1.0
	_ret_ring.material_override.albedo_color = Color(col, 0.85 * dim)
	var dv := aim - p.pos
	var L := dv.length()
	if L == 0:
		L = 1.0
	var u := dv / L
	var at := aim
	var shape: String = sp["def"]["shape"] if not sp.is_empty() else ""
	if shape == "area":
		var Lc := minf(L, float(sp["def"].get("range", ArenaSim.TUNING["aim_range"])))
		at = p.pos + u * Lc
		_ret_area.visible = true
		var r := float(sp["def"].get("radius", 3.0))
		_ret_area.scale = Vector3(r, r, 1)
		_ret_area.material_override.albedo_color = Color(col, (0.6 if queued else 0.25) * dim)
	_reticle.position = ground(at)
	var yaw := atan2(u.x, u.y)
	if shape == "cone":
		var key := "%s:%s" % [sp["def"].get("range", 5), sp["def"].get("arc", 50)]
		if key != _cone_key:
			_cone_prev.mesh = K.wedge(float(sp["def"].get("range", 5)), float(sp["def"].get("arc", 50)))
			_cone_key = key
		_cone_prev.visible = true
		_cone_prev.position = ground(p.pos, 0.035)
		_cone_prev.rotation.y = yaw
		_cone_prev.material_override.albedo_color = Color(col, (0.16 if queued else 0.06) * dim)
	if shape == "wall":
		_wall_prev.visible = true
		_wall_prev.position = ground(p.pos + u * ArenaSim.TUNING["wall_dist"], 0.04)
		_wall_prev.rotation.y = yaw
		_wall_prev.scale = Vector3(sp["def"].get("segments", 5) * 0.95, 1, 1)
		_wall_prev.material_override.albedo_color = Color(col, (0.3 if queued else 0.12) * dim)


# Where an enemy's health bar sits (above its head), for the HUD.
func bar_anchor(e) -> Vector3:
	var v = enemy_views.get(e.id)
	var h: float = v["model"].height + 0.35 + (0.3 if v["model"].floats else 0.0) if v else 2.0
	return Vector3(e.pos.x, h, e.pos.y)


static func _ease(k: float) -> float:
	return 1 - pow(1 - clampf(k, 0, 1), 3)


static func _lerp_angle(a: float, b: float, k: float) -> float:
	return a + atan2(sin(b - a), cos(b - a)) * k
