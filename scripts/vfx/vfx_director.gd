# The spectacle layer (VFX handoff, story/design/court_of_waves/VFX_HANDOFF.md): a port of vfx.js
# (realistic layers: fireballs, shells, flares, sparks, sprites, lightning, trails, heat haze) and
# wow.js (rune circles, light columns, callouts, debris, decals, screen punches, per-spell
# signatures, the charge-up circle). It only reacts to sim events and reads sim state; it never
# changes gameplay. ArenaView owns it and applies `kick` and `fov` to the camera.
extends Node3D

const K := preload("res://scripts/arena/mesh_kit.gd")
const Particles := preload("res://scripts/vfx/vfx_particles.gd")
const Textures := preload("res://scripts/vfx/vfx_textures.gd")
const ScreenFx := preload("res://scripts/vfx/screen_fx.gd")
const Bolt := preload("res://scripts/vfx/lightning_bolt.gd")
const SpellBook := preload("res://scripts/core/spell_book.gd")
const FIREBALL := preload("res://shaders/fireball.gdshader")
const DOME := preload("res://shaders/shockwave_dome.gdshader")
const STRIP := preload("res://shaders/energy_strip.gdshader")
const MAX_DECALS := 16
const MAX_DEBRIS := 180
const MAX_TRAIL_LIGHTS := 4
const GOLD := Color("#f0c84a")
const YELLOW := Color("#f4e15c")

var view # ArenaView: shake(), camera
var particles: Particles
var textures: Textures
var screen: ScreenFx
var kick := Vector3.ZERO # camera push, decays exp(-10 dt)
var fov := 0.0 # camera FOV offset in degrees, decays exp(-6 dt)
var t := 0.0
var live: Array = [] # {node, life, max, tick, end}
var bolts: Array = []
var debris: Array = []
var decals: Array = []
var callouts: Array = []
var trails := {} # shot id -> {pts, glow, core, w, dying, hot, arc, dusty, last, mesh}
var _lights: Array = [] # flash pool
var _light_i := 0
var _trail_lights: Array = []
var _flares: Array = []
var _flare_i := 0
var _charge: Node3D
var _charge_mat: StandardMaterial3D
var _charge_nodes: Array = []
var _charge_light: OmniLight3D
var _orb: MeshInstance3D
var _charge_s := 0.0
var _last_tip = null
var _fx: Dictionary = {}
var _ramps: Dictionary = {}
var _quad: PlaneMesh
var _column: Mesh
var _ready_done := false


func setup(arena_view) -> void:
	if _ready_done:
		return
	_ready_done = true
	view = arena_view
	textures = Textures.new()
	add_child(textures)
	particles = Particles.new()
	add_child(particles)
	particles.setup(textures.cloud())
	screen = ScreenFx.new()
	add_child(screen)
	var P := Particles.presets()
	_fx = P["element_fx"]
	_ramps = P["fireball_ramps"]
	_quad = PlaneMesh.new()
	_quad.size = Vector2(2, 2)
	_column = K.cyl_part(1, 1, 1, 0, TAU, 24)
	for i in 4:
		var l := OmniLight3D.new()
		l.light_energy = 0
		l.omni_range = 9.0
		add_child(l)
		_lights.append(l)
	for i in MAX_TRAIL_LIGHTS:
		var l := OmniLight3D.new()
		l.light_energy = 0
		l.omni_range = 6.0
		add_child(l)
		_trail_lights.append(l)
	for i in 10:
		var s := Sprite3D.new()
		s.texture = textures.star()
		s.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		s.no_depth_test = true
		s.shaded = false
		s.alpha_cut = SpriteBase3D.ALPHA_CUT_DISABLED
		s.pixel_size = 1.0 / 256.0
		s.visible = false
		s.render_priority = 6
		add_child(s)
		_flares.append({"s": s, "life": 0.0, "max": 1.0, "size": 1.0})
	var mat := _additive(Color.WHITE, 1.0, textures.rune())
	_charge_mat = mat
	_charge = K.group(self)
	K.put(_charge, _quad, mat, null, null, null, false)
	var order: Array = SpellBook.ORDER
	for i in order.size():
		var a := i / float(order.size()) * TAU - PI / 2
		var node := K.put(_charge, K.disc(0.1, 20), _additive(SpellBook.color(order[i]), 3.0), [cos(a) * 0.734, 0.004, sin(a) * 0.734], [-PI / 2, 0, 0], null, false)
		node.visible = false
		_charge_nodes.append(node)
	_charge.visible = false
	_charge_light = OmniLight3D.new()
	_charge_light.light_energy = 0
	_charge_light.omni_range = 6.0
	add_child(_charge_light)
	_orb = K.put(self, K.poly(1.0, 20), _additive(Color.WHITE, 2.6), null, null, null, false)
	_orb.visible = false


static func ease_out(k: float) -> float:
	return 1.0 - pow(1.0 - clampf(k, 0.0, 1.0), 3)


static func tier_of(e: Dictionary) -> float:
	var d: int = e.get("distinct", SpellBook.make_spell(e["els"], {"shape": "bolt"})["counts"].size())
	return 3.0 if d >= 3 else 2.0 if d >= 2 else 1.3 if e["els"].size() >= 2 else 1.0


# Which fireball colour ramp an explosion uses (vfx.js pickRamp, plus our extra elements).
static func pick_ramp(els: Array) -> String:
	if els.has("fire") and els.has("arcane"):
		return "hexfire"
	if els.has("fire") and els.has("earth"):
		return "earth"
	for e in ["fire", "arcane", "lightning", "earth", "ice", "water", "nature", "light", "dark"]:
		if els.has(e):
			return e
	return "fire"


func _sprite_of(el: String) -> String:
	return _fx.get(el, {}).get("sprite", "arcane")


func _spark_of(el: String) -> String:
	return _fx.get(el, {}).get("spark", "arcane")


func _additive(c: Color, k := 2.0, tex: Texture2D = null) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.cull_mode = BaseMaterial3D.CULL_DISABLED
	m.depth_draw_mode = BaseMaterial3D.DEPTH_DRAW_DISABLED
	m.albedo_color = Color(c.r * k, c.g * k, c.b * k, 1.0)
	if tex:
		m.albedo_texture = tex
	return m


func _add(node: Node3D, life: float, tick: Callable, end := Callable()) -> Node3D:
	if node.get_parent() == null:
		add_child(node)
	live.append({"node": node, "life": life, "max": life, "tick": tick, "end": end})
	return node


# ---------------------------------------------------------------- primitives (vfx.js)
func flare(at: Vector3, c: Color, size: float, life := 0.14) -> void:
	var f: Dictionary = _flares[_flare_i % _flares.size()]
	_flare_i += 1
	var s: Sprite3D = f["s"]
	s.position = at
	s.modulate = Color(c.r * 2.2, c.g * 2.2, c.b * 2.2, 1)
	s.rotation.z = randf() * TAU
	f["life"] = life
	f["max"] = life
	f["size"] = size
	s.visible = true


func light_flash(at: Vector3, c: Color, power := 30.0) -> void:
	var l: OmniLight3D = _lights[_light_i % _lights.size()]
	_light_i += 1
	l.light_color = c
	l.light_energy = power / 10.0
	l.position = at + Vector3(0, 1.4, 0)


func heat(at: Vector3, r: float, life: float, s := 1.0) -> void:
	screen.heat(at, r, life, s)


func fireball(at: Vector3, r: float, ramp: String, life := 0.6) -> MeshInstance3D:
	var R: Array = _ramps.get(ramp, _ramps["fire"])
	var m := ShaderMaterial.new()
	m.shader = FIREBALL
	m.set_shader_parameter("c0", Color(R[0]))
	m.set_shader_parameter("c1", Color(R[1]))
	m.set_shader_parameter("c2", Color(R[2]))
	m.set_shader_parameter("c3", Color(R[3]))
	var mesh := SphereMesh.new()
	mesh.radius = 1.0
	mesh.height = 2.0
	mesh.radial_segments = 48
	mesh.rings = 24
	var o := MeshInstance3D.new()
	o.mesh = mesh
	o.material_override = m
	o.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	o.position = at
	o.set_meta("ramp", ramp)
	_add(o, life, func(k: float, _dt: float, _el: float):
		m.set_shader_parameter("age", k)
		o.scale = Vector3.ONE * r * (0.3 + 0.75 * ease_out(k * 2.6))
		o.position.y = at.y + k * r * 0.5)
	return o


# `squeeze`: anticipation. A small pop, one frame pulled inward, then the burst (elemental-vfx).
func shell(at: Vector3, r: float, c: Color, life := 0.3, dome := false, k0 := 2.4, squeeze := false) -> MeshInstance3D:
	var m := ShaderMaterial.new()
	m.shader = DOME
	m.set_shader_parameter("color", c)
	m.set_shader_parameter("intensity", k0)
	var mesh := SphereMesh.new()
	mesh.radius = 1.0
	mesh.height = 1.0 if dome else 2.0
	mesh.is_hemisphere = dome
	mesh.radial_segments = 40
	mesh.rings = 14 if dome else 20
	var o := MeshInstance3D.new()
	o.mesh = mesh
	o.material_override = m
	o.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	o.position = at
	if squeeze:
		o.set_meta("squeeze", true)
	_add(o, life, func(k: float, _dt: float, el: float):
		var s := r * (0.15 + 0.85 * ease_out(k))
		if squeeze:
			s = r * (0.3 if el < 0.035 else 0.16) if el < 0.07 else r * (0.15 + 0.85 * ease_out((el - 0.07) / maxf(0.01, life - 0.07)))
		o.scale = Vector3(s, s * (0.55 if dome else 1.0), s)
		m.set_shader_parameter("fade", (1 - k) * (1 - k)))
	return o


func bolt(pts: Array, c: Color, o := {}) -> Node3D:
	var b := Bolt.new()
	add_child(b)
	b.strike(pts, c, o)
	bolts.append(b)
	var end: Vector3 = pts[pts.size() - 1]
	var quiet: bool = o.get("quiet", false)
	for i in (2 if quiet else 8):
		particles.spark("lightning", end, Vector3(randf_range(-7, 7), randf_range(1, 7), randf_range(-7, 7)))
	if not quiet:
		flare(end, c, 1.6, 0.1)
		light_flash(end, c, 30)
	return b


func dust_ring(x: float, z: float, r: float, n := 18, speed := 6.0, kind := "dust") -> void:
	for i in n:
		var a := i / float(n) * TAU + randf() * 0.3
		var sp := speed * randf_range(0.7, 1.2)
		particles.sprite(kind, Vector3(x + sin(a) * r * 0.3, 0.25, z + cos(a) * r * 0.3), Vector3(sin(a) * sp, randf_range(0.2, 1.2), cos(a) * sp))


func radial_sparks(name: String, at: Vector3, n: int, s0: float, s1: float, up := 0.6) -> void:
	for i in n:
		var a := randf() * TAU
		var u := randf() * up + 0.05
		var sp := randf_range(s0, s1)
		var h := sqrt(maxf(0.0, 1 - u * u))
		particles.spark(name, at, Vector3(cos(a) * h * sp, u * sp, sin(a) * h * sp))


func crown(x: float, z: float, r: float, n := 26) -> void:
	for i in n:
		# push and pull: the bowl tears unevenly, so neither spacing nor height repeats
		var a := (i + randf_range(-0.45, 0.45)) / float(n) * TAU
		var sp := randf_range(2.6, 6.4)
		var at := Vector3(x + sin(a) * r * 0.5, 0.15, z + cos(a) * r * 0.5)
		particles.spark("water", at, Vector3(sin(a) * sp, randf_range(6, 10), cos(a) * sp))
		if i % 2 == 0:
			particles.sprite("spray", at + Vector3(0, 0.15, 0), Vector3(sin(a) * sp * 0.6, randf_range(3, 5), cos(a) * sp * 0.6))
	for i in 10:
		particles.sprite("mist", Vector3(x + randf_range(-r, r) * 0.6, 0.3, z + randf_range(-r, r) * 0.6), Vector3(randf_range(-1, 1), 0.4, randf_range(-1, 1)))


# ---------------------------------------------------------------- timing (elemental-vfx)
# Calls `fn` after `delay` seconds of effect time: overlapping bursts and delayed secondaries.
func _after(delay: float, fn: Callable) -> void:
	_add(Node3D.new(), delay, func(_k: float, _dt: float, _el: float): pass, fn)


# "The ones that got away": a few pieces 1.5 - 2.5x faster than the pack, flying low.
func stragglers(name: String, at: Vector3, n: int, speed: float) -> void:
	for i in n:
		var a := randf() * TAU
		var sp := speed * randf_range(1.5, 2.5)
		particles.spark(name, at, Vector3(cos(a) * sp, randf_range(0.3, 2.0), sin(a) * sp))


# Magic motes: few, each with its own life, and a physics per element. Light floats up, dark sinks,
# nature drifts like spores, arcane swirls around the source.
const MOTE_PHYSICS := {"light": [1.6, 2.6, 0.3, 0.9], "dark": [-0.8, 1.6, 0.6, 1.3], "nature": [0.3, 1.6, 0.6, 1.2], "arcane": [0.0, 2.2, 0.4, 1.0]}


func magic_motes(el: String, at: Vector3, n: int, k: float) -> void:
	var P: Array = MOTE_PHYSICS.get(el, MOTE_PHYSICS["arcane"])
	for i in n:
		var a := randf() * TAU
		var sp := randf_range(1.5, 5.0)
		var v := Vector3(sin(a) * sp, randf_range(0.2, 1.5) * signf(P[0] + 0.01), cos(a) * sp)
		if el == "arcane":
			v += Vector3(cos(a), 0, -sin(a)) * sp * 0.8
		particles.sprite(_sprite_of(el), at, v, _mote_opts(el, k))


# Sprite options that give a magic element its own physics, with a life of its own per mote.
func _mote_opts(el: String, k: float, o := {}) -> Dictionary:
	var P: Array = MOTE_PHYSICS.get(el, MOTE_PHYSICS["arcane"])
	var out := {"k": k * randf_range(0.6, 1.3), "buoy": P[0], "drag": P[1], "life": randf_range(P[2], P[3])}
	out.merge(o, true)
	return out


# Wind is invisible: it shows only through what it moves. Dust swept round in one curl (tangential,
# a little outward and up), pushed along `push`; it settles once the gust has passed.
func wind_carry(at: Vector3, n: int, r: float, push := Vector2.ZERO) -> void:
	var spin := 1.0 if randf() < 0.5 else -1.0
	for i in n:
		var a := randf() * TAU
		var rr := r * (0.25 + 0.75 * sqrt(randf()))
		var p := Vector3(at.x + sin(a) * rr, maxf(0.2, at.y + randf_range(-0.5, 0.3)), at.z + cos(a) * rr)
		var sp := randf_range(3.0, 6.5)
		var tang := Vector3(cos(a), 0, -sin(a)) * spin * sp
		var v := tang + Vector3(sin(a), 0, cos(a)) * sp * randf_range(0.1, 0.35) + Vector3(push.x, randf_range(0.6, 2.2), push.y)
		particles.sprite("dust", p, v, {"k": randf_range(0.35, 0.75), "buoy": -0.2, "drag": 1.3, "life": randf_range(0.7, 1.3)})
	for i in maxi(1, n / 6):
		var a := randf() * TAU
		particles.spark("wind", at + Vector3(sin(a) * r * 0.6, 0.2, cos(a) * r * 0.6), Vector3(cos(a), 0.1, -sin(a)) * spin * randf_range(6, 10) + Vector3(push.x, 0, push.y))


# After a projectile's burst dies, the element takes over (elemental-vfx: burst first, then nature).
func hit_resolve(el: String, p: Vector3) -> void:
	match el:
		"fire":
			for i in randi_range(1, 2):
				particles.sprite("hotsmoke", p + Vector3(randf_range(-0.2, 0.2), 0.1, randf_range(-0.2, 0.2)), Vector3(randf_range(-0.4, 0.4), randf_range(1.0, 1.8), randf_range(-0.4, 0.4)), {"k": randf_range(0.4, 0.6)})
			stragglers("fire", p, 1, 9)
		"ice":
			spray("ice", p.x, p.y, p.z, randi_range(2, 4), 3.2, {"size": 0.6})
			for i in 3:
				particles.sprite("mist", p, Vector3(randf_range(-1.2, 1.2), randf_range(-0.3, 0.2), randf_range(-1.2, 1.2)), {"k": randf_range(0.5, 0.8), "buoy": -0.35})
		"earth":
			for i in 4:
				particles.sprite("dust", Vector3(p.x, 0.4, p.z), Vector3(randf_range(-2, 2), randf_range(0.5, 1.6), randf_range(-2, 2)), {"k": randf_range(0.5, 0.8)})
		"lightning":
			forks(p.x, p.z, 1.0, YELLOW, 2)
		"wind":
			wind_carry(Vector3(p.x, 0.5, p.z), 7, 0.6)
		"nature", "light", "dark", "arcane":
			magic_motes(el, p, 3, 0.5)


# A splash's secondary: the cavity refills and a narrow column shoots up from the centre, falls
# back and rings out. Bigger splashes throw taller, thicker jets.
func jet(x: float, z: float, r: float) -> void:
	var n := clampi(roundi(6 + r * 4), 6, 16)
	var lift := clampf(0.7 + r * 0.15, 0.8, 1.2)
	for i in n:
		particles.spark("water", Vector3(x + randf_range(-0.12, 0.12), 0.15, z + randf_range(-0.12, 0.12)),
			Vector3(randf_range(-0.8, 0.8), randf_range(6.5, 9.5) * lift, randf_range(-0.8, 0.8)))
	for i in roundi(n / 3.0):
		particles.sprite("spray", Vector3(x, 0.3 + i * 0.25, z), Vector3(randf_range(-0.4, 0.4), randf_range(3, 5) * lift, randf_range(-0.4, 0.4)), {"k": 0.6})
	_after(0.5 * lift, func(): ring_flash(Vector2(x, z), r * 0.8, Color("#9fd0ff")))


# ---------------------------------------------------------------- primitives (wow.js)
func rune(x: float, z: float, c: Color, r: float, life: float, opt := {}) -> MeshInstance3D:
	var m := _additive(c, opt.get("k", 2.2), textures.rune())
	m.albedo_color.a = 0
	var g := K.put(self, _quad, m, [x, opt.get("y", 0.05), z], [0, randf() * TAU, 0], null, false)
	var spin: float = opt.get("spin", 2.5)
	var r0: float = opt.get("r0", r * 0.4)
	var hold: bool = opt.get("hold", false)
	var amax: float = opt.get("a", 1.0)
	_add(g, life, func(k: float, dt: float, el: float):
		g.rotation.y += dt * spin * (1 - k * 0.6)
		g.scale = Vector3.ONE * (r0 + (r - r0) * ease_out(el / 0.3)) / 2.0 * 2.0
		var f := (k / 0.08 if k < 0.08 else (1 - k) / 0.15 if k > 0.85 else 1.0) if hold else (k / 0.12 if k < 0.12 else 1 - (k - 0.12) / 0.88)
		m.albedo_color.a = f * amax)
	return g


# A light column (open cylinder, fading upward).
func column(x: float, z: float, c: Color, r: float, h: float, life: float, opt := {}) -> MeshInstance3D:
	var m := _additive(c, opt.get("k", 2.4), textures.beam())
	var b := MeshInstance3D.new()
	b.mesh = _column
	b.material_override = m
	b.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	b.position = Vector3(x, 0, z)
	var grow: bool = opt.get("grow", false)
	_add(b, life, func(k: float, _dt: float, el: float):
		var w := r * (0.3 + 0.7 * k) if grow else r * (1 - 0.85 * ease_out(k))
		var hh := h if grow else h * (0.5 + 0.5 * ease_out(el / 0.1))
		b.scale = Vector3(w, hh, w)
		b.position.y = hh / 2
		m.albedo_color.a = 0.2 + 0.8 * k if grow else 1 - k)
	return b


func ground_glow(x: float, z: float, c: Color, r: float, life: float, k := 1.6) -> void:
	var m := _additive(c, k, textures.glow())
	var g := K.put(self, _quad, m, [x, 0.045, z], null, [r / 2.0 * 2.0, 1, r / 2.0 * 2.0], false)
	g.scale = Vector3(r, 1, r) / 2.0 * 2.0
	_add(g, life, func(kk: float, _dt: float, _el: float): m.albedo_color.a = 1 - kk)


func decal(kind: String, x: float, z: float, r: float, life := 7.0, hot := false) -> void:
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.albedo_texture = textures.decal(kind)
	m.albedo_color = Color(1, 1, 1, 0)
	m.render_priority = -1
	var d := K.put(self, _quad, m, [x, 0.02 + (decals.size() % 8) * 0.0015, z], [0, randf() * TAU, 0], null, false)
	d.scale = Vector3(r, 1, r) / 2.0 * 2.0
	d.set_meta("kind", kind)
	decals.append({"node": d, "mat": m, "life": life, "max": life})
	while decals.size() > MAX_DECALS:
		decals.pop_front()["node"].queue_free()
	if hot:
		ground_glow(x, z, Color("#ff5a1a"), r * 1.1, 1.8, 1.3)


const DEBRIS_MAT := {
	"ice": [0xd6f6ff, 0x5ab8ff, 0.7], "rock": [0x7a6e62, null, 0.0], "lava": [0x3a1a10, 0xff5a1a, 2.2],
	"arcane": [0x5a2a90, 0xd04bff, 1.8], "mud": [0x4a3524, null, 0.0], "wood": [0x5a3c22, null, 0.0],
	"leaf": [0x3f7a2e, 0x2a5a1e, 0.4], "crystal": [0xfff6d8, 0xfff1a8, 1.2], "void": [0x2a1450, 0x6a35b8, 1.4],
}


# Physical chunks: gravity 20, bounce 0.32, 1.3 - 2.1 s, shrink out over the last 0.4 s.
func spray(type: String, x: float, y: float, z: float, n: int, speed: float, opt := {}) -> void:
	var spec: Array = DEBRIS_MAT.get(type, DEBRIS_MAT["rock"])
	var mat := K.mat(spec[0], 0.4 if spec[1] != null else 0.95, 0.0, spec[1], spec[2], "debris_" + type)
	for i in n:
		var mesh: Mesh = K.cone(0.07, 0.38, 4) if type in ["ice", "arcane", "crystal"] else K.poly(0.12, 20) if type == "lava" else K.poly(0.14, 12)
		var m := K.put(self, mesh, mat, null, null, null, type == "rock" or type == "lava")
		var a := randf() * TAU
		var sp := speed * randf_range(0.4, 1.2)
		var sz: float = opt.get("size", 1.0) * randf_range(0.6, 1.4)
		var j: float = opt.get("spread", 0.3)
		var dir: Vector2 = opt.get("dir", Vector2.ZERO)
		m.scale = Vector3.ONE * sz
		m.position = Vector3(x + randf_range(-0.5, 0.5) * j, y, z + randf_range(-0.5, 0.5) * j)
		m.rotation = Vector3(randf() * 6, randf() * 6, randf() * 6)
		debris.append({"m": m, "type": type, "v": Vector3(cos(a) * sp + dir.x, sp * opt.get("up", 0.9) * randf_range(0.5, 1.5), sin(a) * sp + dir.y),
			"spin": Vector2(randf_range(-7, 7), randf_range(-7, 7)), "life": randf_range(1.3, 2.1), "size": sz, "r": 0.1 * sz})
	while debris.size() > MAX_DEBRIS:
		debris.pop_front()["m"].queue_free()


func spikes(x: float, z: float, r: float, n: int, life: float, opt := {}) -> void:
	var g := K.group(self, [x, 0, z])
	var mat := K.mat(0xcff4ff, 0.1, 0.0, 0x4ab0ff, 0.6, "spike_ice")
	var list := []
	var ring: bool = opt.get("ring", false)
	var mesh := K.cone(0.22, 1.0, 5)
	for i in n:
		var a := randf() * TAU
		var rr := r * randf_range(0.75, 1.05) if ring else sqrt(randf()) * r
		var tilt := 0.45 if ring else randf_range(-0.25, 0.25)
		var holder := K.group(g, [sin(a) * rr, 0, cos(a) * rr], [cos(a) * tilt, 0, -sin(a) * tilt])
		var s := K.put(holder, mesh, mat, [0, 0.5, 0])
		holder.scale = Vector3.ONE * 0.001
		list.append({"s": holder, "h": opt.get("h", 1.1) * randf_range(0.5, 1.3), "w": randf_range(0.6, 1.4), "delay": randf() * 0.14})
	_add(g, life, func(_k: float, _dt: float, el: float):
		var out := maxf(0.0, (life - el) / 0.2) if el > life - 0.2 else 1.0
		for sp in list:
			var u := ease_out((el - sp["delay"]) / 0.12)
			sp["s"].scale = Vector3(maxf(0.001, sp["w"] * u), maxf(0.001, sp["h"] * u * out), maxf(0.001, sp["w"] * u)),
		func(): spray("ice", x, 0.5, z, mini(16, roundi(n * 0.8)), 4, {"spread": r}))


func helix(el: String, x: float, z: float, n: int) -> void:
	# a smooth underlying turn (the path), with every mote nudged off it (push and pull)
	var a := randf() * TAU
	var y := 0.15
	for i in n:
		a += 0.55 * randf_range(0.6, 1.4)
		y += 0.03 * randf_range(0.5, 1.5)
		var rr := 0.75 * randf_range(0.8, 1.2)
		particles.sprite(_sprite_of(el), Vector3(x + sin(a) * rr, y, z + cos(a) * rr),
			Vector3(cos(a) * 2.2, randf_range(3.5, 5.0), -sin(a) * 2.2), {"buoy": 0.0, "drag": 1.2, "life": randf_range(0.6, 0.9), "k": 0.6 * randf_range(0.75, 1.25)})


# Two elements on one turning path, each with its own physics: the first rides the spiral out,
# the second lifts off it and lags (no identical twins).
func spiral(a1: String, a2: String, x: float, z: float, r: float) -> void:
	var a := randf() * TAU
	for i in 40:
		a += 0.5 * randf_range(0.6, 1.4)
		var rr := (0.2 + i / 40.0 * r) * randf_range(0.85, 1.15)
		var second := randf() < 0.45
		var p := Vector3(x + sin(a) * rr, randf_range(0.4, 1.0), z + cos(a) * rr)
		var v := Vector3(cos(a), 0, -sin(a)) * randf_range(3, 5) + Vector3(0, randf_range(2.0, 3.2) if second else 1.2, 0)
		var o := {"buoy": 0.6 if second else 0.0, "drag": 2.6 if second else 2.0, "k": randf_range(0.5, 0.85)}
		particles.sprite(_sprite_of(a2 if second else a1), p, v, o)


func forks(x: float, z: float, r: float, c: Color, n: int) -> void:
	for i in n:
		var a := i / float(n) * TAU + randf() * 0.5
		var L := r * randf_range(0.9, 1.5)
		bolt([Vector3(x, 0.9, z), Vector3(x + sin(a) * L * 0.55, 0.12, z + cos(a) * L * 0.55), Vector3(x + sin(a + 0.3) * L, 0.12, z + cos(a + 0.3) * L)],
			c, {"quiet": true, "w": 0.11, "life": 0.14})


func wall_debris(e: Dictionary, type: String) -> void:
	var d: Vector2 = e["dir"]
	var n: int = e["n"]
	var at: Vector2 = e["pos"]
	for i in n:
		var o := (i - (n - 1) / 2.0) * 0.95
		spray(type, at.x - d.y * o, 0.4, at.y + d.x * o, 3, 3.5)
	screen.wave(Vector3(at.x, 0.5, at.y), 0.4)
	punch(0.2, -0.8, 0.25)


func punch(ab: float, fov_k := 0.0, sh := 0.0) -> void:
	screen.punch(ab)
	fov += fov_k
	if sh > 0 and view:
		view.shake = minf(1.4, view.shake + sh)


# The spell name over the caster: uppercase, in the spell colour lightened 35%, with an outline.
func callout(at: Vector2, spell_name: String, c: Color, kicker := "") -> void:
	var g := K.group(self, [at.x, 3.1, at.y])
	var main := _label(spell_name.to_upper(), c.lerp(Color.WHITE, 0.35), 96 if kicker != "" else 72)
	g.add_child(main)
	if kicker != "":
		var k := _label(kicker, GOLD, 40)
		k.position.y = 0.55
		g.add_child(k)
	var life := 2.1 if kicker != "" else 1.3
	# older callouts step up out of the way instead of overlapping the new one
	for old in callouts:
		if is_instance_valid(old):
			old.set_meta("lift", old.get_meta("lift", 0.0) + 0.75)
	g.set_meta("lift", 0.0)
	g.set_meta("lift_now", 0.0)
	callouts.append(g)
	while callouts.size() > 3:
		var old: Node3D = callouts.pop_front()
		if is_instance_valid(old):
			old.queue_free()
	_add(g, life, func(_k: float, dt: float, el: float):
		var lift: float = g.get_meta("lift_now") + (g.get_meta("lift") - g.get_meta("lift_now")) * minf(1.0, dt * 14.0)
		g.set_meta("lift_now", lift)
		g.position.y = 3.1 + el * 0.3 + lift
		var pop := 1.4 - el / 0.14 * 0.4 if el < 0.14 else 1.0
		g.scale = Vector3.ONE * pop
		var a := clampf(minf((life - el) / 0.35, el / 0.05), 0, 1)
		for lbl in g.get_children():
			lbl.modulate.a = a
			lbl.outline_modulate.a = a * 0.9)


func _label(text: String, c: Color, size: int) -> Label3D:
	var l := Label3D.new()
	l.text = text
	l.modulate = c
	l.outline_modulate = Color(0.055, 0.04, 0.094, 0.9)
	l.outline_size = 18
	l.font_size = size
	l.pixel_size = 0.006
	l.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	l.no_depth_test = true
	l.render_priority = 8
	l.outline_render_priority = 7
	return l


# ---------------------------------------------------------------- recipes
func release(e: Dictionary, tip, tier: float) -> void:
	if tip == null:
		return
	var els := _distinct(e["els"])
	var d: Vector2 = e["dir"]
	var shape: String = e["shape"]
	var mode: String = e["mode"]
	var power := maxf(1.0, tier)
	var c: Color = e["color"]
	var f: Vector3 = tip
	flare(f, c, 1.1 + power * 0.55, 0.1 + power * 0.03)
	shell(f, 0.5 + power * 0.35, c, 0.22)
	kick += Vector3(-d.x, 0.15, -d.y) * 0.12 * power
	var spread := 0.6 if shape == "cone" else PI if shape in ["area", "wall"] or mode != "aim" else 0.22
	var base := atan2(d.x, d.y)
	# one budget shared by the elements: per-element counts stacked into a white blowout at the tip
	var n := roundi((8 + 6 * power) / float(els.size())) + 4
	for el in els:
		for i in n:
			var a := base + randf_range(-spread, spread)
			var sp := randf_range(8, 18) * (1.0 if mode == "aim" else 0.6)
			particles.spark(_spark_of(el), f, Vector3(sin(a) * sp, randf_range(-1, 3), cos(a) * sp))
		for i in roundi(3 + 3 * power):
			var a := base + randf_range(-spread, spread) * 0.7
			var sp := randf_range(2, 5) * (1.5 if el == "water" else 1.0)
			particles.sprite(_sprite_of(el), f, Vector3(sin(a) * sp, randf_range(0, 1), cos(a) * sp), {"k": 0.7})
		if el == "fire":
			heat(f, 1.0, 0.5, 0.7)
		if el == "lightning":
			for i in ceili(power):
				var a := base + randf_range(-0.6, 0.6)
				var L := randf_range(1.2, 2.4)
				bolt([f, f + Vector3(sin(a) * L, randf_range(-0.6, 0.3), cos(a) * L)], YELLOW, {"life": 0.12, "w": 0.12, "quiet": true})
	if tier >= 2:
		# anticipation -> climax: streaks converge on the staff, then blow out
		for i in 22:
			var a := randf() * TAU
			var b := randf_range(-0.6, 0.9)
			var R := randf_range(1.2, 1.8)
			var off := Vector3(cos(a) * cos(b), sin(b), sin(a) * cos(b)) * R
			particles.spark(_spark_of(els[i % els.size()]), f + off, -off * 9, {"life": 0.11, "grav": 0.0, "st": 0.05})
		var at: Vector2 = e["pos"]
		dust_ring(at.x, at.y, 1.2, roundi(8 + 4 * tier), 4 + tier, "mist" if els.has("ice") else "dust")
		shell(Vector3(at.x, 0, at.y), 1.6 + tier * 0.4, c, 0.35, true, 1.6)


func blast(e: Dictionary) -> void:
	var R: float = e["r"]
	var els: Array = e["els"]
	var big: bool = e["big"]
	var no_key: bool = e.get("key", "") == ""
	var at: Vector2 = e["pos"]
	var c: Color = e["color"]
	shell(Vector3(at.x, 0, at.y), R * 1.25, c, 0.38 if big else 0.28, true, 2.4, true)
	flare(Vector3(at.x, 1.0, at.y), c, R * (2.4 if big else 1.6), 0.16 if big else 0.1)
	if no_key or els.has("fire") or els.has("arcane") or els.has("lightning") or els.has("light") or els.has("dark"):
		fireball(Vector3(at.x, 0.75, at.y), R * (0.72 if big else 0.55), "fire" if no_key else pick_ramp(els), 0.85 if big else 0.6)
	var n := 60 if big else 32
	var s1 := 24.0 if big else 16.0
	var list := ["fire"] if no_key else _distinct(els)
	for i in list.size():
		# overlap: the first element carries the shared burst, each next one pops a beat later
		var el: String = list[i]
		var burst := func():
			radial_sparks(_spark_of(el), Vector3(at.x, 0.8, at.y), roundi(n / float(list.size())) + 6, 8, s1, 0.8)
			stragglers(_spark_of(el), Vector3(at.x, 0.8, at.y), randi_range(1, 3), s1)
		if i == 0:
			burst.call()
		else:
			_after(0.035 + 0.03 * i + randf() * 0.02, burst)
	if big:
		# overlap: a smaller burst off-centre while the first is slowing
		var off := Vector2.from_angle(randf() * TAU) * R * randf_range(0.2, 0.4)
		_after(randf_range(0.08, 0.14), func():
			var p2 := Vector3(at.x + off.x, 0.8, at.y + off.y)
			shell(Vector3(p2.x, 0, p2.z), R * 0.7, c, 0.25, true, 1.8)
			flare(p2 + Vector3(0, 0.2, 0), c, R * 1.2, 0.08)
			for el in list:
				radial_sparks(_spark_of(el), p2, roundi(24 / float(list.size())) + 4, 6, 14, 0.8))
	if els.has("wind"):
		# the wind takes the blast's dust and sweeps it round instead of throwing it out
		wind_carry(Vector3(at.x, 0.5, at.y), 22 if big else 14, R * 0.9)
	else:
		dust_ring(at.x, at.y, R, 26 if big else 14, R * 3, "mist" if els.has("ice") and not els.has("fire") else "dust")
	if no_key or els.has("fire"):
		for i in (16 if big else 9):
			particles.sprite("flame", Vector3(at.x + randf_range(-R, R) * 0.4, randf_range(0.4, 1.2), at.y + randf_range(-R, R) * 0.4),
				Vector3(randf_range(-3, 3), randf_range(1, 4), randf_range(-3, 3)), {"k": R * 0.55})
		# rogue embers rocket off sideways
		for i in randi_range(1, 3):
			var a := randf() * TAU
			var sp := randf_range(19, 28)
			particles.spark("fire", Vector3(at.x, 0.9, at.y), Vector3(cos(a) * sp, randf_range(0.5, 2.5), sin(a) * sp), {"life": randf_range(0.5, 0.9)})
		for i in (14 if big else 7):
			particles.sprite("hotsmoke", Vector3(at.x + randf_range(-R, R) * 0.35, randf_range(0.6, 1.6), at.y + randf_range(-R, R) * 0.35),
				Vector3(randf_range(-1.5, 1.5), randf_range(1.5, 3.2), randf_range(-1.5, 1.5)), {"k": R * 0.5})
		heat(Vector3(at.x, 1.2, at.y), R * 1.5, 1.3, 1.0)
	elif els.has("arcane"):
		for i in 18:
			var a := randf() * TAU
			var sp := randf_range(3, 7)
			particles.sprite("arcane", Vector3(at.x, 0.9, at.y), Vector3(sin(a) * sp, randf_range(-0.5, 2), cos(a) * sp), {"k": R * 0.45})
		for i in 6:
			particles.sprite("smoke", Vector3(at.x + randf_range(-1, 1), 0.8, at.y + randf_range(-1, 1)), Vector3(randf_range(-1, 1), randf_range(0.5, 1.5), randf_range(-1, 1)), {"k": R * 0.45})
	if els.has("lightning"):
		bolt([Vector3(at.x + randf_range(-2, 2), 16, at.y - randf_range(2, 5)), Vector3(at.x, 0.05, at.y)], YELLOW, {"life": 0.3, "w": 0.32})
		shell(Vector3(at.x, 0.9, at.y), R * 0.9, Color("#c8e0ff"), 0.2)
		for i in 8:
			particles.sprite("plasma", Vector3(at.x, 0.9, at.y), Vector3(randf_range(-4, 4), randf_range(0, 3), randf_range(-4, 4)), {"k": R * 0.4})
	if els.has("ice"):
		radial_sparks("ice", Vector3(at.x, 0.6, at.y), 24, 6, 14, 0.9)
		for i in 12:
			particles.sprite("mist", Vector3(at.x + randf_range(-R, R) * 0.5, 0.4, at.y + randf_range(-R, R) * 0.5), Vector3(randf_range(-2, 2), 0.3, randf_range(-2, 2)), {"k": R * 0.5})
	if els.has("water"):
		crown(at.x, at.y, R)
		_after(randf_range(0.2, 0.32), func(): jet(at.x, at.y, R))
	if els.has("earth"):
		for i in (10 if big else 6):
			particles.sprite("dust", Vector3(at.x + randf_range(-R, R) * 0.3, randf_range(0.4, 1.4), at.y + randf_range(-R, R) * 0.3),
				Vector3(randf_range(-1.5, 1.5), randf_range(1, 3), randf_range(-1.5, 1.5)), {"k": R * 0.5, "buoy": 0.6})
	for el in ["nature", "light", "dark"]:
		if els.has(el):
			magic_motes(el, Vector3(at.x, 0.8, at.y), 7, R * 0.45)
	kick.y += 0.35 if big else 0.15


func hit(e: Dictionary) -> void:
	var at: Vector2 = e["pos"]
	if e.get("enemy", false):
		radial_sparks("hex", Vector3(at.x, 1.1, at.y), 12, 3, 8)
		for i in 4:
			particles.sprite("hex", Vector3(at.x, 1.1, at.y), Vector3(randf_range(-2, 2), randf_range(0, 1.5), randf_range(-2, 2)))
		return
	var y := 0.8 if e.get("kind", "") == "boulder" else 1.1
	var p := Vector3(at.x, y, at.y)
	flare(p, e["color"], 1.0, 0.08)
	for el in _distinct(e["els"]):
		radial_sparks(_spark_of(el), p, 10, 4, 11)
		stragglers(_spark_of(el), p, 1, 11)
		if el in ["water", "fire"]:
			for i in 4:
				particles.sprite(_sprite_of(el), p, Vector3(randf_range(-2.5, 2.5), randf_range(0, 2), randf_range(-2.5, 2.5)), {"k": 0.6})
		hit_resolve(el, p)
	if e["els"].has("water"):
		_after(randf_range(0.18, 0.26), func(): jet(at.x, at.y, 0.7))
	if e.get("kind", "") == "boulder":
		dust_ring(at.x, at.y, 1.2, 14, 4.5)
		shell(Vector3(at.x, 0, at.y), 1.8, Color("#ffd9a0"), 0.25, true, 1.2)
		kick.y += 0.12


func cone(e: Dictionary) -> void:
	var d: Vector2 = e["dir"]
	var a0 := atan2(d.x, d.y)
	var half := deg_to_rad(e["arc"]) / 2
	var els: Array = e["els"]
	var steam := els.has("fire") and els.has("water")
	var mud := els.has("earth") and els.has("water")
	var R: float = e["range"]
	var at: Vector2 = e["pos"]
	var along := func(n: int, k0: float, k1: float) -> Array:
		var out := []
		for i in n:
			var a := a0 + randf_range(-half, half) * 0.9
			var sp := R * randf_range(k0, k1)
			out.append([Vector3(at.x + sin(a) * 0.6, 1.0, at.y + cos(a) * 0.6), Vector3(sin(a) * sp, randf_range(-0.2, 0.6), cos(a) * sp)])
		return out
	if steam:
		for pv in along.call(34, 2.2, 3.0):
			particles.sprite("steam", pv[0], pv[1], {"drag": 2.6, "k": 1.1})
		# one shared burst that splits: steam rises and vanishes, the water it didn't boil falls out
		for pv in along.call(14, 1.4, 2.2):
			particles.spark("water", pv[0], pv[1] * Vector3(0.8, 1, 0.8) + Vector3(0, randf_range(1.5, 3.5), 0))
	elif els.has("fire"):
		for pv in along.call(40, 2.2, 3.1):
			particles.sprite("flame", pv[0], pv[1], {"drag": 2.6, "k": 1.0})
		for pv in along.call(6, 2.0, 2.6):
			particles.sprite("hotsmoke", pv[0] + Vector3(0, 0.3, 0), pv[1] * Vector3(0.6, 1, 0.6) + Vector3(0, 1, 0), {"k": 0.7, "life": randf_range(1, 1.5)})
		for pv in along.call(26, 2.4, 3.6):
			particles.spark("fire", pv[0], pv[1] * Vector3(1.3, 1, 1.3) + Vector3(0, 2, 0))
		heat(Vector3(at.x + sin(a0) * R * 0.5, 1, at.y + cos(a0) * R * 0.5), R * 0.7, 0.7, 1.0)
	if mud:
		for pv in along.call(24, 2.2, 3.0):
			particles.sprite("mud", pv[0], pv[1] + Vector3(0, 3, 0), {"drag": 2.4, "k": 1.2})
	elif els.has("water") and not steam:
		for pv in along.call(30, 2.2, 3.0):
			particles.sprite("spray", pv[0], pv[1] + Vector3(0, 1, 0), {"drag": 2.4, "k": 1.1})
		for pv in along.call(30, 2.4, 3.4):
			particles.spark("water", pv[0], pv[1] * Vector3(1.4, 1, 1.4) + Vector3(0, 3, 0))
	var lead: String = els[0] if els.size() else ""
	for el in _distinct(els):
		if el not in ["ice", "lightning", "earth", "arcane", "nature", "wind", "light", "dark"] or (el == "earth" and mud):
			continue
		var layer := func():
			for pv in along.call(20, 1.8, 2.8):
				if el == "wind":
					# the air itself is invisible: show the dust it drives downstream, rising then settling
					particles.sprite("dust", pv[0] - Vector3(0, 0.6, 0), pv[1] * 0.8 + Vector3(0, randf_range(0.5, 1.8), 0),
						{"k": randf_range(0.4, 0.8), "buoy": -0.2, "drag": 2.0, "life": randf_range(0.6, 1.1)})
				elif el == "ice":
					particles.sprite("mist", pv[0], pv[1], {"drag": 2.4, "k": 0.9, "buoy": -0.3}) # cold mist sinks
				elif el in MOTE_PHYSICS:
					particles.sprite(_sprite_of(el), pv[0], pv[1], _mote_opts(el, 0.9, {"drag": 2.4}))
				else:
					particles.sprite(_sprite_of(el), pv[0], pv[1], {"drag": 2.4, "k": 0.9})
			for pv in along.call(14 if el != "wind" else 6, 2.2, 3.2):
				particles.spark(_spark_of(el), pv[0], pv[1] * 1.2)
		# overlap: a combo's other elements ride in a beat behind the lead one
		if el == lead:
			layer.call()
		else:
			_after(0.04 + randf() * 0.03, layer)


func area_start(e: Dictionary) -> void:
	var at: Vector2 = e["pos"]
	var r: float = e["r"]
	match e["key"]:
		"ice+water":
			for i in 30:
				var a := randf() * TAU
				var rr := sqrt(randf()) * r
				particles.sprite("mist", Vector3(at.x + sin(a) * rr, 0.3, at.y + cos(a) * rr), Vector3(sin(a) * 2.5, 0.3, cos(a) * 2.5), {"k": 1.2})
			radial_sparks("ice", Vector3(at.x, 0.3, at.y), 34, 4, 10, 0.95)
			shell(Vector3(at.x, 0, at.y), r * 1.1, Color("#bfefff"), 0.4, true, 1.6)
		"lightning+water":
			crown(at.x, at.y, r, 30)
			for i in 2:
				bolt([Vector3(at.x + randf_range(-3, 3), 15, at.y - randf_range(2, 5)), Vector3(at.x + randf_range(-1, 1), 0.05, at.y + randf_range(-1, 1))], YELLOW, {"life": 0.3, "w": 0.3})
			shell(Vector3(at.x, 0, at.y), r * 1.1, Color("#9fd0ff"), 0.35, true)
		"arcane+water":
			for i in 30:
				var a := randf() * TAU
				var rr := r * randf_range(0.6, 1.0)
				particles.sprite("arcane", Vector3(at.x + sin(a) * rr, 0.4, at.y + cos(a) * rr), Vector3(cos(a) * 4 - sin(a) * 2, 0.4, -sin(a) * 4 - cos(a) * 2), {"k": 0.8})
		"burning":
			for i in 14:
				particles.sprite("flame", Vector3(at.x + randf_range(-r, r) * 0.6, 0.3, at.y + randf_range(-r, r) * 0.6), Vector3(0, randf_range(0.5, 2), 0), {"k": 0.9})
		_:
			if e["delay"] > 0:
				radial_sparks("arcane", Vector3(at.x, 0.2, at.y), 20, 2, 5, 1.0)
			else:
				for el in _distinct(e["els"]):
					radial_sparks(_spark_of(el), Vector3(at.x, 0.3, at.y), 16, 2, 6, 1.0)
				shell(Vector3(at.x, 0, at.y), r * 1.05, e["color"], 0.35, true, 1.4)


func wall_fx(e: Dictionary) -> void:
	var d: Vector2 = e["dir"]
	var n: int = e["n"]
	var at: Vector2 = e["pos"]
	var mat: String = e["mat"]
	for i in n:
		var o := (i - (n - 1) / 2.0) * 0.95
		var x := at.x - d.y * o
		var z := at.y + d.x * o
		for k in 4:
			particles.sprite("mist" if mat == "ice" else "spore" if mat == "wood" else "radiance" if mat == "crystal" else "dust",
				Vector3(x, 0.3, z), Vector3(randf_range(-2.5, 2.5), randf_range(0.4, 1.5), randf_range(-2.5, 2.5)), {"k": 0.9})
		radial_sparks("ice" if mat == "ice" else "nature" if mat == "wood" else "light" if mat == "crystal" else "earth", Vector3(x, 0.5, z), 4, 3, 7, 0.9)
	kick.y += 0.2


func tag_vfx(e: Dictionary) -> void:
	var at: Vector2 = e["pos"]
	match e["tag"]:
		"shatter":
			radial_sparks("ice", Vector3(at.x, 1, at.y), 34, 6, 16, 0.85)
			for i in 8:
				particles.sprite("mist", Vector3(at.x, 0.8, at.y), Vector3(randf_range(-2.5, 2.5), randf_range(0, 1), randf_range(-2.5, 2.5)))
			shell(Vector3(at.x, 1, at.y), 1.8, Color("#e0f8ff"), 0.22)
			flare(Vector3(at.x, 1, at.y), Color("#bfefff"), 2, 0.1)
		"freeze":
			for i in 8:
				particles.sprite("mist", Vector3(at.x, 0.4, at.y), Vector3(randf_range(-1.5, 1.5), 0.2, randf_range(-1.5, 1.5)), {"k": 0.7})
		"conduct":
			radial_sparks("lightning", Vector3(at.x, 1, at.y), 14, 5, 12)
		"steam":
			for i in 8:
				particles.sprite("steam", Vector3(at.x, 1, at.y), Vector3(randf_range(-1, 1), randf_range(0.5, 1.5), randf_range(-1, 1)), {"k": 0.8})


# ---------------------------------------------------------------- wow.js layer
func cast_fx(e: Dictionary) -> void:
	var at: Vector2 = e["pos"]
	var distinct: int = e.get("distinct", _distinct(e["els"]).size())
	var combo := distinct >= 2
	var tier := tier_of(e)
	var c: Color = e["color"]
	if not e.get("from_queue", true):
		if combo:
			rune(at.x, at.y, c, 1.3, 0.35, {"a": 0.5, "spin": 5.0})
		_sig(e["key"], "cast", e)
		return
	rune(at.x, at.y, c, 1.1 + tier * 0.45, 0.55 + tier * 0.1, {"spin": 4 + tier, "r0": 0.5})
	if tier >= 1.3:
		# lower intensity than other columns: it stacks with the rune, flare and sparks on the caster
		column(at.x, at.y, c, 0.35 + 0.18 * tier, 4 + tier * 2.2, 0.4 + tier * 0.05, {"k": 1.4})
		screen.wave(Vector3(at.x, 1, at.y), 0.18 * tier)
		punch(0.25 * tier, -0.9 * tier, 0.08 * tier)
		for el in _distinct(e["els"]):
			helix(el, at.x, at.y, roundi(8 + tier * 3)) # sparse: dense additive helices blow out to white
	if combo:
		screen.screen_flash(c, 0.04 * tier)
		callout(at, e["name"], c, "NEW SPELL" if e.get("is_new", false) else "")
	if combo and e.get("is_new", false):
		screen.wave(Vector3(at.x, 1, at.y), 0.8)
		punch(0.4, -2.5, 0.2)
		rune(at.x, at.y, GOLD, 3.2, 1.1, {"spin": -2.0, "r0": 1.0, "a": 0.7})
	_sig(e["key"], "cast", e)


func explode_fx(e: Dictionary) -> void:
	var at: Vector2 = e["pos"]
	var els: Array = e["els"]
	var R: float = e["r"]
	var big: bool = e["big"]
	screen.wave(Vector3(at.x, 0.8, at.y), 0.85 if big else 0.4)
	punch(0.7 if big else 0.25, -2.2 if big else -0.6)
	screen.screen_flash(e["color"], 0.035 if big else 0.015)
	ground_glow(at.x, at.y, e["color"], R * 1.3, 0.6, 1.2)
	if e.get("key", "") == "":
		spray("lava", at.x, 0.7, at.y, 12, 6)
		decal("scorch", at.x, at.y, R * 0.9, 8, true)
		return
	if els.has("fire") or els.has("arcane") or els.has("lightning") or els.has("dark"):
		decal("scorch", at.x, at.y, R * 0.85, 7, els.has("fire"))
	if els.has("ice"):
		decal("frost", at.x, at.y, R * 0.9)
		spray("ice", at.x, 0.8, at.y, 10, 5)
	if els.has("earth"):
		spray("lava" if els.has("fire") else "rock", at.x, 0.6, at.y, 14 if big else 8, 5)
	if els.has("arcane"):
		spray("arcane", at.x, 0.8, at.y, 8 if big else 4, 4.5)
	if els.has("nature"):
		spray("leaf", at.x, 0.8, at.y, 8, 4)
	if els.has("dark"):
		spray("void", at.x, 0.8, at.y, 6, 4)
	if big:
		column(at.x, at.y, e["color"], R * 0.4, 7, 0.45, {"k": 1.6})
	_sig(e["key"], "explode", e)


func reaction_fx(e: Dictionary) -> void:
	var at: Vector2 = e["pos"]
	match e["tag"]:
		"shatter":
			spray("ice", at.x, 1, at.y, 16, 5.5, {"size": 1.3})
			screen.wave(Vector3(at.x, 1, at.y), 0.45)
			punch(0.45, -1.2, 0.25)
			screen.screen_flash(Color.WHITE, 0.05)
			ground_glow(at.x, at.y, Color("#a8ecff"), 2, 0.5)
		"freeze":
			spikes(at.x, at.y, 0.75, 6, 1.1, {"ring": true, "h": 0.9})
			decal("frost", at.x, at.y, 1.2, 5)
		"conduct":
			for i in 3:
				var a := randf() * TAU
				var r := randf_range(1.2, 2.2)
				bolt([Vector3(at.x, 1.0, at.y), Vector3(at.x + sin(a) * r, 0.1, at.y + cos(a) * r)], YELLOW, {"quiet": true, "w": 0.11, "life": 0.14})
			light_flash(Vector3(at.x, 0, at.y), YELLOW, 30)
			punch(0.2, 0, 0.1)
		"steam":
			for i in 22:
				particles.sprite("steam", Vector3(at.x, 0.8, at.y), Vector3(randf_range(-2.2, 2.2), randf_range(0.5, 2), randf_range(-2.2, 2.2)), {"k": 1.3})
		"entangled", "regrown":
			spray("leaf", at.x, 0.4, at.y, 6, 2.5)
		"purged":
			flare(Vector3(at.x, 1.2, at.y), Color("#fff1a8"), 2.2, 0.14)
		"swallowed":
			for i in 6:
				particles.sprite("shadow", Vector3(at.x, 1.1, at.y), Vector3(randf_range(-1, 1), 0.3, randf_range(-1, 1)), {"k": 0.6})


# Per-spell signatures, keyed like the combos (wow.js SIG). Our extra spells get a few too.
func _sig(key: String, hook: String, e: Dictionary) -> void:
	var at: Vector2 = e.get("pos", Vector2.ZERO)
	match [key, hook]:
		["fire+lightning", "explode"]:
			forks(at.x, at.y, e["r"] * 1.4, YELLOW, 7)
		["arcane+fire", "explode"]:
			rune(at.x, at.y, Color("#d04bff"), e["r"] * 1.25, 0.9, {"spin": -4.0, "r0": 0.5})
			spiral("arcane", "fire", at.x, at.y, e["r"])
		["arcane+earth", "explode"]:
			column(at.x, at.y, Color("#d04bff"), 0.7, 10, 0.55)
			rune(at.x, at.y, Color("#d04bff"), e["r"] * 1.1, 0.9, {"spin": 5.0})
			spray("arcane", at.x, 0.8, at.y, 10, 6)
		["earth+fire", "impact"]:
			spray("lava", at.x, 0.8, at.y, 16, 6)
			decal("scorch", at.x, at.y, 2, 6, true)
			screen.wave(Vector3(at.x, 0.6, at.y), 0.5)
			punch(0.3, -1, 0.2)
		["earth+lightning", "impact"]:
			forks(at.x, at.y, 2.2, YELLOW, 5)
		["arcane+fire+lightning", "area"], ["fire+fire", "area"], ["earth+fire+lightning", "area"]:
			column(at.x, at.y, e["color"], 0.3, 30, maxf(0.05, e["delay"]), {"grow": true, "k": 1.6})
		["arcane+fire+lightning", "explode"], ["fire+fire", "explode"], ["earth+fire+lightning", "explode"]:
			screen.wave(Vector3(at.x, 0.6, at.y), 1.5)
			punch(0.9, -5, 0.6)
			screen.screen_flash(Color("#fff2d0"), 0.03, 0.03)
			column(at.x, at.y, e["color"], 1.0, 16, 0.6, {"k": 1.4})
			rune(at.x, at.y, e["color"], e["r"] * 1.6, 1.4, {"spin": 3.0, "r0": 1.0})
			forks(at.x, at.y, e["r"] * 1.6, YELLOW, 10 if key != "fire+fire" else 4)
			spray("lava", at.x, 0.8, at.y, 22, 8)
			spray("rock", at.x, 0.6, at.y, 14, 6)
			decal("scorch", at.x, at.y, e["r"] * 1.2, 9, true)
		["ice+water", "area"]:
			spikes(at.x, at.y, e["r"] * 0.9, 22, e["life"], {"h": 1.2})
			decal("frost", at.x, at.y, e["r"] * 1.15, e["life"] + 3)
			screen.wave(Vector3(at.x, 0.4, at.y), 0.5)
			punch(0.3, -1, 0.15)
		["ice+water+wind", "explode"]:
			spikes(at.x, at.y, e["r"] * 0.9, 26, 3.0, {"h": 1.6})
			decal("frost", at.x, at.y, e["r"] * 1.2, 8)
		["lightning+water", "area"]:
			column(at.x, at.y, YELLOW, e["r"] * 0.85, 4, 0.5)
			ring_flash(at, e["r"] * 1.1, Color("#3d9bff"))
			forks(at.x, at.y, e["r"], YELLOW, 6)
		["arcane+water", "area"], ["dark+dark", "area"], ["arcane+dark+water", "area"], ["wind+wind", "area"]:
			rune(at.x, at.y, e["color"], e["r"], e["life"], {"hold": true, "spin": -3.5, "r0": e["r"] * 0.5, "a": 0.75})
		["nature+nature", "area"], ["light+nature+water", "area"]:
			rune(at.x, at.y, Color("#7dff8a"), e["r"], e["life"], {"hold": true, "spin": 1.2, "r0": e["r"] * 0.6, "a": 0.6})
			column(at.x, at.y, Color("#7dff8a"), 0.6, 6, 0.8, {"k": 1.4})
		["light+light", "beam"]:
			# Holy pillars smiting down along the line.
			var a: Vector2 = e["from"]
			var b: Vector2 = e["to"]
			var k := 0.0
			while k <= 1.0:
				var p := a.lerp(b, k)
				column(p.x, p.y, Color("#fff1a8"), 0.55, 9, 0.6, {"k": 2.0})
				k += 0.18
			screen.screen_flash(Color("#fff6d0"), 0.06)
			punch(0.4, -1.5, 0.3)
		["light+lightning", "beam"]:
			laser_trail(e["from"], e["to"], e["color"], 0.8)
		["fire+lightning+lightning", "beam"]:
			var a: Vector2 = e["from"]
			var b: Vector2 = e["to"]
			bolt([Vector3(a.x, 1.1, a.y), Vector3(b.x, 1.1, b.y)], Color("#ffb070"), {"w": 0.3, "life": 0.35})
			for i in 4:
				var p := a.lerp(b, randf_range(0.2, 0.9))
				var ang := randf() * TAU
				bolt([Vector3(p.x, 1.1, p.y), Vector3(p.x + sin(ang) * 1.6, 0.1, p.y + cos(ang) * 1.6)], YELLOW, {"quiet": true, "w": 0.12, "life": 0.2})
		["ice+ice", "explode"]:
			permafrost_pillar(at, e["r"])
		["earth+ice", "wall"]:
			wall_debris(e, "ice")
			decal("frost", e["pos"].x, e["pos"].y, 2.4, 9)
		["earth+earth", "wall"]:
			wall_debris(e, "rock")
			decal("crack", e["pos"].x, e["pos"].y, 2.6, 9)
		["arcane+ice", "cast"]:
			prism_fan(e)
		["arcane+lightning", "chain"]:
			bolt(_lift(e["pts"]), Color("#d04bff"))
			for i in range(1, e["pts"].size()):
				rune(e["pts"][i].x, e["pts"][i].y, Color("#d04bff"), 1.0, 0.45, {"spin": 6.0})
		["ice+lightning", "chain"]:
			for i in range(1, e["pts"].size()):
				spray("ice", e["pts"][i].x, 1, e["pts"][i].y, 4, 3)
		["fire+water", "cone"]:
			var a0 := atan2(e["dir"].x, e["dir"].y)
			for i in 50:
				var a := a0 + randf_range(-0.5, 0.5) * deg_to_rad(e["arc"])
				var sp := randf_range(4, 10)
				particles.sprite("steam", Vector3(at.x, 1, at.y), Vector3(sin(a) * sp, randf_range(0.5, 1.5), cos(a) * sp), {"k": 1.8, "drag": 1.2})
		["earth+water", "cone"]:
			var a0 := atan2(e["dir"].x, e["dir"].y)
			for i in 12:
				var a := a0 + randf_range(-0.5, 0.5) * deg_to_rad(e["arc"])
				var dd := randf_range(1, 1 + e["range"] * 0.7)
				spray("mud", at.x + sin(a) * dd, 0.3, at.y + cos(a) * dd, 1, 2, {"dir": Vector2(sin(a), cos(a)) * 5})


# A glowing laser line that lingers (Photon Railgun).
func laser_trail(a: Vector2, b: Vector2, c: Color, life: float) -> void:
	var node := Node3D.new()
	add_child(node)
	var gm := MeshInstance3D.new()
	gm.material_override = _strip(c, 2.2, 1.4)
	node.add_child(gm)
	var cm := MeshInstance3D.new()
	cm.material_override = _strip(Color.WHITE, 2.6, 0.8)
	node.add_child(cm)
	var cam: Vector3 = view.camera.global_position if view and view.camera and view.camera.is_inside_tree() else Vector3(0, 20, 20)
	var seg := [[Vector3(a.x, 1.1, a.y), Vector3(b.x, 1.1, b.y), 1.0, 1.0]]
	gm.mesh = Bolt.ribbon(self, seg, 0.35, cam)
	cm.mesh = Bolt.ribbon(self, seg, 0.08, cam)
	_add(node, life, func(k: float, _dt: float, _el: float):
		gm.material_override.set_shader_parameter("alpha", (1 - k) * (1 - k))
		cm.material_override.set_shader_parameter("alpha", 1 - k))


# Glacier Prison: a permafrost pillar with spinning crystal shards.
func permafrost_pillar(at: Vector2, r: float) -> void:
	var g := K.group(self, [at.x, 0, at.y])
	g.set_meta("permafrost", true)
	var mat := K.mat(0xd6f6ff, 0.08, 0.05, 0x5ab8ff, 0.8, "permafrost")
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.albedo_color.a = 0.8
	var pillar := K.put(g, K.cyl(r * 0.35, r * 0.5, 3.2, 7), mat, [0, 1.6, 0])
	var shards := []
	for i in 8:
		var a := i / 8.0 * TAU
		shards.append(K.put(g, K.cone(0.12, 0.6, 4), mat, [sin(a) * r * 0.7, 1.2, cos(a) * r * 0.7], [0.4, a, 0]))
	spikes(at.x, at.y, r * 0.9, 18, 3.0, {"h": 1.4})
	decal("frost", at.x, at.y, r * 1.2, 8)
	_add(g, 3.0, func(k: float, dt: float, el: float):
		# a fast ease-out pop with a slight overshoot: growth that reads as force
		var u := clampf(el / 0.18, 0.0, 1.0)
		var grow := 1.0 - pow(1.0 - u, 3.0) + 0.15 * sin(u * PI)
		pillar.scale = Vector3(1, maxf(0.001, grow), 1) * (1.0 if k < 0.85 else (1 - k) / 0.15)
		g.rotation.y += dt * 1.5,
		func(): spray("ice", at.x, 1.2, at.y, 16, 5, {"spread": r}))


func prism_fan(e: Dictionary) -> void:
	var at: Vector2 = e["pos"]
	var d: Vector2 = e["dir"]
	var a0 := atan2(d.x, d.y)
	for i in 46:
		var a := a0 + randf_range(-0.3, 0.3)
		var sp := randf_range(8, 18)
		var c := Color.from_hsv(randf(), 0.6, 1.0)
		particles.sprite("radiance", Vector3(at.x, 1.2, at.y), Vector3(sin(a) * sp, randf_range(-1, 1), cos(a) * sp),
			{"k": 0.35, "life": 0.35, "c0": [c.r * 3, c.g * 3, c.b * 3], "c1": [c.r, c.g, c.b], "buoy": 0.0})


func ring_flash(at: Vector2, r: float, c: Color) -> void:
	var m := _additive(c, 1.2)
	var o := K.put(self, K.ring(0.85, 1.0, 48), m, [at.x, 0.06, at.y], [-PI / 2, 0, 0], null, false)
	_add(o, 0.5, func(k: float, _dt: float, _el: float):
		o.scale = Vector3.ONE * (0.2 + r * ease_out(k))
		m.albedo_color.a = 1 - k)


static func _lift(pts: Array, y := 1.0) -> Array:
	var out := []
	for i in pts.size():
		out.append(Vector3(pts[i].x, 1.15 if i == 0 else y, pts[i].y))
	return out


static func _distinct(els: Array) -> Array:
	var out := []
	for e in els:
		if not out.has(e):
			out.append(e)
	return out


# ---------------------------------------------------------------- events
func on_event(e: Dictionary, sim) -> void:
	match e["type"]:
		"queue":
			var p = sim.player
			var c := SpellBook.color(e["el"])
			ring_flash(p.pos, 1.1, c)
			ground_glow(p.pos.x, p.pos.y, c, 1.4, 0.35, 1.2)
			if _last_tip != null:
				for i in 12:
					var a := randf() * TAU
					particles.spark(_spark_of(e["el"]), _last_tip, Vector3(cos(a), randf_range(0.2, 1), sin(a)) * 2.5)
			var q: Array = p.queue
			if _distinct(q).size() >= 2 and q[q.size() - 1] == e["el"]:
				rune(p.pos.x, p.pos.y, SpellBook.resolve(q)["color"], 1.7, 0.45, {"r0": 0.6, "spin": 6.0, "a": 0.8})
				punch(0.15)
		"cast":
			cast_fx(e)
			release(e, _last_tip, tier_of(e) if e.get("from_queue", true) else 0.8)
		"nova":
			var at: Vector2 = e["pos"]
			dust_ring(at.x, at.y, e["r"], 22, e["r"] * 2.6)
			shell(Vector3(at.x, 0, at.y), e["r"] * 1.15, e["color"], 0.35, true)
			screen.wave(Vector3(at.x, 0.5, at.y), 0.5)
			punch(0.3, -1)
			rune(at.x, at.y, e["color"], e["r"], 0.6, {"spin": 5.0})
		"explode":
			explode_fx(e)
			blast(e)
		"impact":
			hit(e)
			if not e.get("enemy", false):
				if e.get("kind", "") == "boulder":
					spray("lava" if e["els"].has("fire") else "rock", e["pos"].x, 0.7, e["pos"].y, 7, 4)
					decal("crack", e["pos"].x, e["pos"].y, 1.1, 5)
					screen.wave(Vector3(e["pos"].x, 0.6, e["pos"].y), 0.2)
				_sig(e.get("key", ""), "impact", e)
		"area":
			area_start(e)
			rune(e["pos"].x, e["pos"].y, e["color"], e["r"], e["delay"] + 0.6, {"r0": e["r"] * 0.3, "spin": 3.0, "a": 0.7})
			_sig(e["key"], "area", e)
		"wall":
			wall_fx(e)
			if e["key"] not in ["earth+ice", "earth+earth"]:
				wall_debris(e, {"ice": "ice", "wood": "wood", "crystal": "crystal"}.get(e["mat"], "rock"))
			_sig(e["key"], "wall", e)
		"chain":
			if e["pts"].size() > 2:
				screen.wave(Vector3(e["pts"][1].x, 1, e["pts"][1].y), 0.2)
			_sig(e.get("key", ""), "chain", e)
		"cone":
			cone(e)
			_sig(e["key"], "cone", e)
		"beam":
			var a: Vector2 = e["from"]
			var b: Vector2 = e["to"]
			_sig(e.get("key", ""), "beam", e)
			flare(Vector3(b.x, 1.1, b.y), e["color"], 1.4, 0.12)
			screen.wave(Vector3(a.x, 1.1, a.y), 0.25)
			punch(0.3, -0.8)
			for el in _distinct(e["els"]):
				var k := 0.0
				while k <= 1.0:
					radial_sparks(_spark_of(el), Vector3(lerpf(a.x, b.x, k), 1.1, lerpf(a.y, b.y, k)), 3, 2, 6)
					k += 0.1
		"tag":
			reaction_fx(e)
			tag_vfx(e)
		"death":
			var at: Vector2 = e["pos"]
			if e["frozen"]:
				spray("ice", at.x, 1, at.y, 14, 5)
			else:
				dust_ring(at.x, at.y, 0.8, 10, 2.5)
		"slam":
			var at: Vector2 = e["pos"]
			dust_ring(at.x, at.y, e["r"], 24, 7)
			shell(Vector3(at.x, 0, at.y), e["r"] * 1.2, Color("#ffd9a0"), 0.3, true, 1.2)
			radial_sparks("earth", Vector3(at.x, 0.3, at.y), 20, 5, 12, 0.9)
			screen.wave(Vector3(at.x, 0.3, at.y), 0.5)
			decal("crack", at.x, at.y, 2.4, 6)
			spray("rock", at.x, 0.3, at.y, 8, 4)
		"cancel":
			screen.wave(Vector3(e["pos"].x, 1.6, e["pos"].y), 0.2)
			punch(0.2)
		"selfcast":
			var at: Vector2 = e["pos"]
			for el in _distinct(e["els"]):
				helix(el, at.x, at.y, 14)
			ground_glow(at.x, at.y, e["color"], 1.6, 0.5, 1.2)
		"heal":
			var at: Vector2 = e["pos"]
			for i in 7:
				var a := randf() * TAU
				particles.sprite("spore", Vector3(at.x + sin(a) * 0.5, randf_range(0.3, 1.2), at.y + cos(a) * 0.5),
					Vector3(sin(a) * 0.6, randf_range(0.6, 1.6), cos(a) * 0.6), {"k": 0.6, "buoy": 1.2, "life": randf_range(0.6, 1.1)})
		"ward":
			magic_motes("arcane", Vector3(e["pos"].x, 1.0, e["pos"].y), 6, 0.5)
		"block":
			var p := Vector3(e["pos"].x, 1.1, e["pos"].y)
			radial_sparks("light", p, 10, 4, 9)
			flare(p, Color("#fff6d8"), 0.9, 0.07)
		"hit":
			if not e["dot"]:
				var p := Vector3(e["pos"].x, 1.0, e["pos"].y)
				radial_sparks(_spark_of(e["el"]), p, 5, 2, 6)
		"hurt":
			if not e["dot"]:
				for i in 6:
					particles.sprite("blood", Vector3(e["pos"].x, 1.1, e["pos"].y), Vector3(randf_range(-2.5, 2.5), randf_range(0.5, 3), randf_range(-2.5, 2.5)), {"k": randf_range(0.7, 1.3)})
		"wallBreak":
			var at: Vector2 = e["pos"]
			spray({"ice": "ice", "wood": "wood", "crystal": "crystal"}.get(e["mat"], "rock"), at.x, 0.6, at.y, 8, 3.5)
			dust_ring(at.x, at.y, 0.8, 8, 3, "mist" if e["mat"] == "ice" else "dust")
		"ignite":
			var at: Vector2 = e["pos"]
			var r: float = e["r"]
			for i in 12:
				particles.sprite("flame", Vector3(at.x + randf_range(-r, r) * 0.6, 0.3, at.y + randf_range(-r, r) * 0.6), Vector3(0, randf_range(0.6, 2.0), 0), {"k": randf_range(0.6, 1.0)})
			for i in 2:
				particles.sprite("hotsmoke", Vector3(at.x, 0.8, at.y), Vector3(randf_range(-0.5, 0.5), 1.2, randf_range(-0.5, 0.5)), {"k": 0.8})
			stragglers("fire", Vector3(at.x, 0.4, at.y), randi_range(1, 2), 5)
		"steam":
			var at: Vector2 = e["pos"]
			var r: float = e["r"]
			for i in 10:
				particles.sprite("steam", Vector3(at.x + randf_range(-r, r) * 0.6, 0.3, at.y + randf_range(-r, r) * 0.6), Vector3(randf_range(-0.4, 0.4), randf_range(0.8, 1.8), randf_range(-0.4, 0.4)), {"k": 0.9})
		"charge":
			var at: Vector2 = e["pos"]
			radial_sparks("lightning", Vector3(at.x, 0.15, at.y), 12, 3, 8, 0.9)
			for i in 3:
				particles.sprite("plasma", Vector3(at.x + randf_range(-0.5, 0.5), 0.3, at.y + randf_range(-0.5, 0.5)), Vector3(0, 0.6, 0), {"k": 0.8})
		"dodge":
			var at: Vector2 = e["pos"]
			var d: Vector2 = e.get("dir", Vector2.ZERO)
			for i in 8:
				var a := randf() * TAU
				particles.sprite("dust", Vector3(at.x + sin(a) * 0.3, 0.2, at.y + cos(a) * 0.3),
					Vector3(sin(a) * 1.5 - d.x * 2, randf_range(0.2, 0.8), cos(a) * 1.5 - d.y * 2), {"k": 0.6})
			for i in 3:
				particles.sprite("gust", Vector3(at.x, 0.7, at.y), Vector3(-d.x * 3, 0.2, -d.y * 3), {"k": 0.7})
		"playerDeath":
			screen.wave(Vector3(e["pos"].x, 1, e["pos"].y), 1.0)
			punch(0.8, 3)
			screen.screen_flash(Color("#ef4444"), 0.12)


func reset() -> void:
	for L in live:
		if is_instance_valid(L["node"]):
			L["node"].queue_free()
	live.clear()
	for b in bolts:
		if is_instance_valid(b):
			b.queue_free()
	bolts.clear()
	for d in debris:
		d["m"].queue_free()
	debris.clear()
	for d in decals:
		d["node"].queue_free()
	decals.clear()
	callouts.clear()
	for tr in trails.values():
		tr["node"].queue_free()
	trails.clear()
	if particles:
		particles.clear()
	if screen:
		screen.clear()
	kick = Vector3.ZERO
	fov = 0.0


# ---------------------------------------------------------------- per frame
func update(dt: float, sim, tip) -> void:
	t += dt
	_last_tip = tip
	_update_charge(dt, sim, tip)
	for i in range(live.size() - 1, -1, -1):
		var L: Dictionary = live[i]
		L["life"] -= dt
		var node: Node3D = L["node"]
		if not is_instance_valid(node):
			live.remove_at(i)
			continue
		L["tick"].call(minf(1.0, 1.0 - L["life"] / L["max"]), dt, L["max"] - L["life"])
		if L["life"] <= 0:
			live.remove_at(i)
			node.queue_free()
			if L["end"].is_valid():
				L["end"].call()
	for i in range(bolts.size() - 1, -1, -1):
		if not is_instance_valid(bolts[i]) or not bolts[i].advance(dt):
			bolts.remove_at(i)
	for i in range(debris.size() - 1, -1, -1):
		var d: Dictionary = debris[i]
		d["life"] -= dt
		var m: MeshInstance3D = d["m"]
		if d["life"] <= 0:
			m.queue_free()
			debris.remove_at(i)
			continue
		d["v"].y -= 20 * dt
		m.position += d["v"] * dt
		if m.position.y < d["r"]:
			m.position.y = d["r"]
			d["v"] = Vector3(d["v"].x * 0.6, -d["v"].y * 0.32, d["v"].z * 0.6)
			d["spin"] *= 0.5
		m.rotation.x += d["spin"].x * dt
		m.rotation.z += d["spin"].y * dt
		if d["life"] < 0.4:
			m.scale = Vector3.ONE * d["size"] * (d["life"] / 0.4)
		# a hint of flame, not a stream: imply, don't simulate (elemental-vfx)
		if d["type"] == "lava" and m.position.y > 0.2 and randf() < dt * 10:
			particles.sprite("flame", m.position, Vector3(0, 0.5, 0), {"k": 0.35, "life": 0.3})
	for i in range(decals.size() - 1, -1, -1):
		var d: Dictionary = decals[i]
		d["life"] -= dt
		if d["life"] <= 0:
			d["node"].queue_free()
			decals.remove_at(i)
			continue
		d["mat"].albedo_color.a = minf(1.0, minf((d["max"] - d["life"]) / 0.15, d["life"] / 1.5))
	for f in _flares:
		var s: Sprite3D = f["s"]
		if not s.visible:
			continue
		f["life"] -= dt
		if f["life"] <= 0:
			s.visible = false
			continue
		var k: float = 1.0 - f["life"] / f["max"]
		s.pixel_size = f["size"] / 256.0 * (0.6 + k * 2 if k < 0.2 else 1 - (k - 0.2) * 0.6)
		s.modulate.a = 1 - k * k
	for l in _lights:
		l.light_energy *= exp(-14 * dt)
	if sim and sim.mode != "menu":
		_update_trails(sim, dt)
		_ambient(sim, dt)
	particles.update(dt)
	kick *= exp(-10 * dt)
	fov *= exp(-6 * dt)
	screen.update(dt, view.camera if view else null)


func _update_charge(dt: float, sim, tip) -> void:
	var p = sim.player if sim else null
	var active: bool = p != null and (sim.mode == "play" or sim.mode == "paused") and p.alive
	var q: Array = p.queue if active else []
	var n := q.size()
	var sp := SpellBook.resolve(q) if n > 0 else {}
	var c: Color = sp["color"] if not sp.is_empty() else Color.WHITE
	var combo := _distinct(q).size() >= 2
	_charge_s += ([0.0, 0.95, 1.35, 1.8][mini(n, 3)] - _charge_s) * minf(1.0, dt * 12)
	_charge.visible = _charge_s > 0.03
	if _charge.visible and p:
		_charge.position = Vector3(p.pos.x, 0.05, p.pos.y)
		_charge.scale = Vector3.ONE * _charge_s
		_charge.rotation.y += dt * (0.5 + n * 0.7)
		var b := 1.5 + (0.9 if combo else 0.0) + sin(t * 7) * 0.3
		_charge_mat.albedo_color = Color(c.r * b, c.g * b, c.b * b, 0.35 + 0.15 * n)
		var order: Array = SpellBook.ORDER
		for i in order.size():
			_charge_nodes[i].visible = q.has(order[i])
			_charge_nodes[i].scale = Vector3.ONE * (1 + 0.3 * sin(t * 9 + i))
	if p:
		_charge_light.position = Vector3(p.pos.x, 0.6, p.pos.y)
	_charge_light.light_color = c
	_charge_light.light_energy += (((4 + n * 4) / 10.0 if n else 0.0) - _charge_light.light_energy) * minf(1.0, dt * 10)
	_orb.visible = n > 0 and tip != null
	if not _orb.visible:
		return
	_orb.position = tip
	_orb.scale = Vector3.ONE * (0.07 + 0.035 * n + sin(t * 12) * 0.012)
	_orb.material_override.albedo_color = Color(c.r * 2.6, c.g * 2.6, c.b * 2.6)
	var count := _rate(20.0 * n, dt)
	for i in count:
		var a := randf() * TAU
		var b := randf() * PI
		var R := randf_range(0.45, 0.7)
		var off := Vector3(sin(b) * cos(a), cos(b), sin(b) * sin(a)) * R
		var el: String = q[randi() % n]
		particles.sprite(_sprite_of(el), tip + off, -off * 3.2, {"k": 0.25, "life": 0.28, "buoy": 0.0, "drag": 0.0})


static func _rate(r: float, dt: float) -> int:
	var n := r * dt
	return floori(n) + (1 if randf() < fmod(n, 1.0) else 0)


# Ribbon trails (last 14 positions, tapering) and up to 4 lights following shots.
func _update_trails(sim, dt: float) -> void:
	var seen := {}
	var cam_pos: Vector3 = view.camera.global_position if view and view.camera and view.camera.is_inside_tree() else Vector3(0, 20, 20)
	var li := 0
	for b in sim.shots:
		seen[b.id] = true
		var y := 0.95 if b.kind == "boulder" else 1.15
		var tr = trails.get(b.id)
		var player_shot: bool = b.owner == "player"
		if tr == null:
			var c: Color = Color("#5cffb0") if not player_shot else b.color
			var w: float = 0.42 if b.kind == "boulder" else 0.3 if b.kind == "orb" else 0.16 + b.r * 0.6
			var node := Node3D.new()
			add_child(node)
			var glow := _strip(c, 1.6, 1.6)
			var core := _strip(Color.WHITE, 1.2, 1.0)
			var gm := MeshInstance3D.new()
			gm.material_override = glow
			node.add_child(gm)
			var cm := MeshInstance3D.new()
			cm.material_override = core
			node.add_child(cm)
			tr = {"pts": [], "node": node, "gm": gm, "cm": cm, "w": w, "dying": 0.0, "last": null,
				"hot": player_shot and b.els.has("fire"), "arc": player_shot and b.els.has("arcane"), "dusty": b.kind == "boulder",
				"prism": player_shot and b.sp.get("key", "") == "arcane+ice", "combo": player_shot and b.sp.get("counts", {}).size() >= 2}
			trails[b.id] = tr
		var at := Vector3(b.pos.x, y, b.pos.y)
		tr["pts"].push_front(at)
		if tr["pts"].size() > 14:
			tr["pts"].resize(14)
		tr["last"] = at
		if tr["hot"]:
			for i in _rate(40.0 if b.kind == "boulder" else 26.0, dt):
				particles.sprite("flame", at, Vector3(randf_range(-0.6, 0.6) - b.vel.x * 0.05, randf_range(0, 0.8), randf_range(-0.6, 0.6) - b.vel.y * 0.05), {"k": 0.8 if b.kind == "boulder" else 0.5})
		if tr["arc"]:
			for i in _rate(18.0, dt):
				particles.sprite("arcane", at, Vector3(randf_range(-0.5, 0.5), randf_range(0, 0.5), randf_range(-0.5, 0.5)), {"k": 0.45})
		if tr["dusty"] and not tr["hot"]:
			for i in _rate(8.0, dt):
				particles.sprite("dust", at - Vector3(0, 0.3, 0), Vector3(0, 0.3, 0), {"k": 0.5})
		if tr["prism"]:
			for i in _rate(50.0, dt):
				var c := Color.from_hsv(fmod(t * 1.5 + b.id * 0.13 + randf() * 0.2, 1.0), 0.6, 1.0)
				particles.sprite("radiance", at, Vector3(randf_range(-0.5, 0.5), randf_range(-0.5, 0.5), randf_range(-0.5, 0.5)),
					{"k": 0.3, "life": 0.4, "c0": [c.r * 3, c.g * 3, c.b * 3], "c1": [c.r, c.g, c.b], "buoy": 0.0})
		if li < _trail_lights.size() and (not player_shot or b.kind != "boulder" or tr["hot"]):
			var L: OmniLight3D = _trail_lights[li]
			li += 1
			L.position = at + Vector3(0, 0.2, 0)
			L.light_color = Color("#5cffb0") if not player_shot else b.color
			L.light_energy = 0.7
	for i in range(li, _trail_lights.size()):
		_trail_lights[i].light_energy *= exp(-20 * dt)
	for id in trails.keys():
		var tr: Dictionary = trails[id]
		if not seen.has(id):
			tr["dying"] += dt
			if tr["dying"] > 0.18 or tr["last"] == null:
				tr["node"].queue_free()
				trails.erase(id)
				continue
			tr["pts"].push_front(tr["last"])
			if tr["pts"].size() > 14:
				tr["pts"].resize(14)
		var pts: Array = tr["pts"]
		if pts.size() < 2:
			continue
		var N := pts.size()
		var fade: float = 1.0 - tr["dying"] / 0.18
		var glow := []
		var core := []
		for i in N - 1:
			var k := 1.0 - i / float(N - 1)
			glow.append([pts[i], pts[i + 1], tr["w"] * k, k * k * fade])
			core.append([pts[i], pts[i + 1], tr["w"] * 0.3 * k, k * fade])
		tr["gm"].mesh = Bolt.ribbon(self, glow, 1.0, cam_pos)
		tr["cm"].mesh = Bolt.ribbon(self, core, 1.0, cam_pos)


func _strip(c: Color, k: float, pw: float) -> ShaderMaterial:
	var m := ShaderMaterial.new()
	m.shader = STRIP
	m.set_shader_parameter("color", c)
	m.set_shader_parameter("intensity", k)
	m.set_shader_parameter("falloff", pw)
	return m


# Ongoing area, burning-brush and burning-body effects.
func _ambient(sim, dt: float) -> void:
	for a in sim.areas:
		if a.delay > 0:
			continue
		var ang := randf() * TAU
		var r: float = sqrt(randf()) * a.r
		var at := Vector3(a.pos.x + sin(ang) * r, 0.25, a.pos.y + cos(ang) * r)
		match a.key:
			"ice+water":
				if randf() < dt * 14:
					particles.sprite("mist", at, Vector3(randf_range(-0.4, 0.4), 0.15, randf_range(-0.4, 0.4)), {"k": 1.1})
			"burning", "fire+nature":
				for i in _rate(16.0 * a.r, dt):
					particles.sprite("flame", Vector3(a.pos.x + randf_range(-a.r, a.r) * 0.6, 0.2, a.pos.y + randf_range(-a.r, a.r) * 0.6), Vector3(0, randf_range(0.3, 1.2), 0), {"k": 0.7})
				if randf() < dt * 4:
					particles.sprite("hotsmoke", at + Vector3(0, 0.8, 0), Vector3(0, 1, 0), {"k": 0.7})
				if randf() < dt * 3:
					heat(Vector3(a.pos.x, 1, a.pos.y), a.r, 0.6, 0.6)
			"lightning+water", "lightning+lightning":
				for i in _rate(14.0, dt):
					particles.spark("lightning", at, Vector3(randf_range(-3, 3), randf_range(2, 6), randf_range(-3, 3)))
				if randf() < dt * 5:
					particles.sprite("plasma", at, Vector3(0, 0.6, 0), {"k": 0.8})
			"arcane+water", "dark+dark", "arcane+dark+water", "wind+wind", "water+wind", "fire+wind":
				for i in _rate(16.0, dt):
					var tx: float = -(at.z - a.pos.y)
					var tz: float = at.x - a.pos.x
					var el: String = a.els[randi() % a.els.size()]
					# wind draws itself with the dust it drags round; other elements with their own matter
					particles.sprite("dust" if el == "wind" else _sprite_of(el), at, Vector3(tx * 1.6 + (a.pos.x - at.x) * 0.8, 0.3, tz * 1.6 + (a.pos.y - at.z) * 0.8), {"k": 0.6})
			_:
				if randf() < dt * 6:
					particles.sprite(_sprite_of(a.els[randi() % a.els.size()]), at, Vector3(0, 0.6, 0), {"k": 0.7})
	for br in sim.brush:
		if br.state == "burning":
			for i in _rate(14.0, dt):
				particles.sprite("flame", Vector3(br.pos.x + randf_range(-br.r, br.r) * 0.6, 0.3, br.pos.y + randf_range(-br.r, br.r) * 0.6), Vector3(0, randf_range(0.4, 1.4), 0), {"k": 0.8})
			if randf() < dt * 3:
				particles.sprite("hotsmoke", Vector3(br.pos.x, 1.2, br.pos.y), Vector3(0, 1, 0), {"k": 0.8})
			if randf() < dt * 2:
				heat(Vector3(br.pos.x, 1, br.pos.y), br.r * 1.2, 0.6, 0.5)
	var bodies: Array = sim.enemies.filter(func(e): return e.state != "spawn")
	if sim.player.alive:
		bodies.append(sim.player)
	for b in bodies:
		if b.st.burn > 0:
			for i in _rate(9.0, dt):
				particles.sprite("flame", Vector3(b.pos.x + randf_range(-0.3, 0.3), randf_range(0.4, 1.4), b.pos.y + randf_range(-0.3, 0.3)), Vector3(0, randf_range(0.5, 1.2), 0), {"k": 0.45})
