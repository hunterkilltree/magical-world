# The VFX layer's two particle pools (port of the Smoke and Streaks classes in vfx.js), simulated
# on the CPU and drawn as one MultiMesh each:
#   sprite(name, ...)  soft billboards (flame, hotsmoke, smoke, dust, mud, mist, steam, spray,
#                      arcane, plasma, hex + our spore, gust, radiance, shadow) from data/vfx_presets.json
#   spark(name, ...)   velocity-stretched additive streaks that bounce off the ground
# Sprites cool c0 -> c1 over `heat` of their life and slide from additive to alpha (flame -> smoke).
extends Node3D

const SMOKE_SHADER := preload("res://shaders/smoke_sprite.gdshader")
const SPARK_SHADER := preload("res://shaders/spark_streak.gdshader")
const PRESETS := "res://data/vfx_presets.json"
const SMOKE_MAX := 1400
const SPARK_MAX := 1400

static var _presets: Dictionary = {}

var sm := {} # sprite presets
var sp := {} # spark presets
var _smoke: MultiMesh
var _spark: MultiMesh
var _sbuf: PackedFloat32Array
var _kbuf: PackedFloat32Array
# Per-particle state, struct-of-arrays.
var _s_p := PackedVector3Array()
var _s_v := PackedVector3Array()
var _s_c0 := PackedVector3Array()
var _s_c1 := PackedVector3Array()
var _s_life := PackedFloat32Array()
var _s_L := PackedFloat32Array()
var _s_s0 := PackedFloat32Array()
var _s_s1 := PackedFloat32Array()
var _s_a0 := PackedFloat32Array()
var _s_heat := PackedFloat32Array()
var _s_g0 := PackedFloat32Array()
var _s_drag := PackedFloat32Array()
var _s_buoy := PackedFloat32Array()
var _s_rot := PackedFloat32Array()
var _s_rs := PackedFloat32Array()
var _s_cell := PackedFloat32Array()
var _k_p := PackedVector3Array()
var _k_v := PackedVector3Array()
var _k_c0 := PackedVector3Array()
var _k_c1 := PackedVector3Array()
var _k_life := PackedFloat32Array()
var _k_L := PackedFloat32Array()
var _k_grav := PackedFloat32Array()
var _k_drag := PackedFloat32Array()
var _k_st := PackedFloat32Array()
var _k_w0 := PackedFloat32Array()
var _s_next := 0
var _k_next := 0
var _s_live := {} # index -> true
var _k_live := {}
var clock := 0.0 # seconds of update() so far
var trace = null # tests: set to [] to log every spawn as {kind, name, at, vel, o, t}


static func presets() -> Dictionary:
	if _presets.is_empty():
		var parsed = JSON.parse_string(FileAccess.get_file_as_string(PRESETS))
		if parsed is Dictionary:
			_presets = parsed
	return _presets


func setup(atlas: Texture2D) -> void:
	sm = presets()["sprite_presets"]
	sp = presets()["spark_presets"]
	_smoke = _make(SMOKE_MAX, SMOKE_SHADER, atlas)
	_spark = _make(SPARK_MAX, SPARK_SHADER, null)
	_sbuf = PackedFloat32Array()
	_sbuf.resize(SMOKE_MAX * 20)
	_kbuf = PackedFloat32Array()
	_kbuf.resize(SPARK_MAX * 20)
	_s_p.resize(SMOKE_MAX)
	_s_v.resize(SMOKE_MAX)
	_s_c0.resize(SMOKE_MAX)
	_s_c1.resize(SMOKE_MAX)
	_s_life.resize(SMOKE_MAX)
	_s_L.resize(SMOKE_MAX)
	_s_s0.resize(SMOKE_MAX)
	_s_s1.resize(SMOKE_MAX)
	_s_a0.resize(SMOKE_MAX)
	_s_heat.resize(SMOKE_MAX)
	_s_g0.resize(SMOKE_MAX)
	_s_drag.resize(SMOKE_MAX)
	_s_buoy.resize(SMOKE_MAX)
	_s_rot.resize(SMOKE_MAX)
	_s_rs.resize(SMOKE_MAX)
	_s_cell.resize(SMOKE_MAX)
	_k_p.resize(SPARK_MAX)
	_k_v.resize(SPARK_MAX)
	_k_c0.resize(SPARK_MAX)
	_k_c1.resize(SPARK_MAX)
	_k_life.resize(SPARK_MAX)
	_k_L.resize(SPARK_MAX)
	_k_grav.resize(SPARK_MAX)
	_k_drag.resize(SPARK_MAX)
	_k_st.resize(SPARK_MAX)
	_k_w0.resize(SPARK_MAX)


func _make(n: int, shader: Shader, atlas: Texture2D) -> MultiMesh:
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_colors = true
	mm.use_custom_data = true
	var q := QuadMesh.new()
	q.size = Vector2(1, 1)
	mm.mesh = q
	mm.instance_count = n
	mm.visible_instance_count = n
	var mat := ShaderMaterial.new()
	mat.shader = shader
	if atlas:
		mat.set_shader_parameter("atlas", atlas)
	var mi := MultiMeshInstance3D.new()
	mi.multimesh = mm
	mi.material_override = mat
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	mi.custom_aabb = AABB(Vector3(-200, -50, -200), Vector3(400, 200, 400))
	add_child(mi)
	var buf := PackedFloat32Array()
	buf.resize(n * 20) # all zero: zero scale, invisible
	mm.buffer = buf
	return mm


func live_count() -> int:
	return _s_live.size() + _k_live.size()


static func _v(a: Array) -> Vector3:
	return Vector3(a[0], a[1], a[2])


# A soft sprite. o: {k (size), life, drag, buoy, glow, a, c0, c1}.
func sprite(name: String, at: Vector3, vel: Vector3, o := {}) -> void:
	if _smoke == null or not sm.has(name):
		return
	if trace != null:
		trace.append({"kind": "sprite", "name": name, "at": at, "vel": vel, "o": o, "t": clock})
	var P: Dictionary = sm[name]
	var i := _s_next
	_s_next = (i + 1) % SMOKE_MAX
	var k: float = o.get("k", 1.0)
	var L: float = o.get("life", randf_range(P["life"][0], P["life"][1]))
	_s_p[i] = at
	_s_v[i] = vel
	_s_life[i] = L
	_s_L[i] = L
	_s_s0[i] = P["s0"] * k * randf_range(0.8, 1.2)
	_s_s1[i] = P["s1"] * k * randf_range(0.8, 1.25)
	_s_a0[i] = o.get("a", P["a"])
	_s_heat[i] = P["heat"]
	_s_g0[i] = o.get("glow", P["glow"])
	_s_c0[i] = _v(o.get("c0", P["c0"]))
	_s_c1[i] = _v(o.get("c1", P["c1"]))
	_s_drag[i] = o.get("drag", P["drag"])
	_s_buoy[i] = o.get("buoy", P["buoy"])
	_s_rot[i] = randf() * TAU
	_s_rs[i] = randf_range(-1.6, 1.6)
	_s_cell[i] = float(randi() % 4)
	_s_live[i] = true


# A streak. o: {life, grav, st, w}.
func spark(name: String, at: Vector3, vel: Vector3, o := {}) -> void:
	if _spark == null or not sp.has(name):
		return
	if trace != null:
		trace.append({"kind": "spark", "name": name, "at": at, "vel": vel, "o": o, "t": clock})
	var P: Dictionary = sp[name]
	var i := _k_next
	_k_next = (i + 1) % SPARK_MAX
	var L: float = o.get("life", randf_range(P["life"][0], P["life"][1]))
	_k_p[i] = at
	_k_v[i] = vel
	_k_life[i] = L
	_k_L[i] = L
	_k_c0[i] = _v(P["c0"])
	_k_c1[i] = _v(P["c1"])
	_k_grav[i] = o.get("grav", P["grav"])
	_k_drag[i] = P["drag"]
	_k_st[i] = o.get("st", P["st"])
	_k_w0[i] = P["w"] * o.get("w", 1.0) * randf_range(0.7, 1.3)
	_k_live[i] = true


func clear() -> void:
	for i in _s_live:
		_s_life[i] = 0
		_write_dead(_sbuf, i)
	for i in _k_live:
		_k_life[i] = 0
		_write_dead(_kbuf, i)
	_s_live.clear()
	_k_live.clear()
	if _smoke:
		_smoke.buffer = _sbuf
		_spark.buffer = _kbuf


func update(dt: float) -> void:
	if _smoke == null:
		return
	clock += dt
	_update_smoke(dt)
	_update_sparks(dt)


func _update_smoke(dt: float) -> void:
	var dead := []
	for i in _s_live:
		var l: float = _s_life[i] - dt
		_s_life[i] = l
		if l <= 0:
			dead.append(i)
			_write_dead(_sbuf, i)
			continue
		var L: float = _s_L[i]
		var age := L - l
		var k := age / L
		var dr := maxf(0.0, 1.0 - _s_drag[i] * dt)
		var v: Vector3 = _s_v[i]
		v = Vector3(v.x * dr, v.y * dr + _s_buoy[i] * dt, v.z * dr)
		var p: Vector3 = _s_p[i] + v * dt
		if p.y < 0.1:
			p.y = 0.1
			v.y = absf(v.y) * 0.2
		_s_v[i] = v
		_s_p[i] = p
		var h := minf(1.0, k / maxf(0.01, _s_heat[i]))
		var c: Vector3 = _s_c0[i].lerp(_s_c1[i], h)
		var glow: float = _s_g0[i] * (1.0 - h)
		var size: float = _s_s0[i] + (_s_s1[i] - _s_s0[i]) * (1.0 - (1.0 - k) * (1.0 - k))
		_s_rot[i] += _s_rs[i] * dt * (1.0 - k * 0.7)
		var fin := minf(1.0, age / (0.06 * L + 0.02))
		var fout := 1.0 if k < 0.5 else 1.0 - (k - 0.5) / 0.5
		var a: float = _s_a0[i] * fin * fout * fout
		var o: int = i * 20
		_sbuf[o] = size; _sbuf[o + 1] = 0; _sbuf[o + 2] = 0; _sbuf[o + 3] = p.x
		_sbuf[o + 4] = 0; _sbuf[o + 5] = size; _sbuf[o + 6] = 0; _sbuf[o + 7] = p.y
		_sbuf[o + 8] = 0; _sbuf[o + 9] = 0; _sbuf[o + 10] = size; _sbuf[o + 11] = p.z
		_sbuf[o + 12] = c.x / 4.0; _sbuf[o + 13] = c.y / 4.0; _sbuf[o + 14] = c.z / 4.0; _sbuf[o + 15] = a
		_sbuf[o + 16] = _s_rot[i]; _sbuf[o + 17] = _s_cell[i]; _sbuf[o + 18] = glow; _sbuf[o + 19] = 0
	for i in dead:
		_s_live.erase(i)
	_smoke.buffer = _sbuf


func _update_sparks(dt: float) -> void:
	var dead := []
	for i in _k_live:
		var l: float = _k_life[i] - dt
		_k_life[i] = l
		if l <= 0:
			dead.append(i)
			_write_dead(_kbuf, i)
			continue
		var k: float = 1.0 - l / _k_L[i]
		var dr := maxf(0.0, 1.0 - _k_drag[i] * dt)
		var v: Vector3 = _k_v[i]
		v = Vector3(v.x * dr, v.y * dr - _k_grav[i] * dt, v.z * dr)
		var p: Vector3 = _k_p[i] + v * dt
		if p.y < 0.04:
			p.y = 0.04
			v = Vector3(v.x * 0.6, -v.y * 0.35, v.z * 0.6)
		_k_v[i] = v
		_k_p[i] = p
		var c: Vector3 = _k_c0[i].lerp(_k_c1[i], minf(1.0, k * 1.6))
		var st: Vector3 = v * _k_st[i]
		var o: int = i * 20
		_kbuf[o] = 1; _kbuf[o + 1] = 0; _kbuf[o + 2] = 0; _kbuf[o + 3] = p.x
		_kbuf[o + 4] = 0; _kbuf[o + 5] = 1; _kbuf[o + 6] = 0; _kbuf[o + 7] = p.y
		_kbuf[o + 8] = 0; _kbuf[o + 9] = 0; _kbuf[o + 10] = 1; _kbuf[o + 11] = p.z
		_kbuf[o + 12] = c.x / 4.0; _kbuf[o + 13] = c.y / 4.0; _kbuf[o + 14] = c.z / 4.0; _kbuf[o + 15] = pow(1.0 - k, 0.8)
		_kbuf[o + 16] = st.x; _kbuf[o + 17] = st.y; _kbuf[o + 18] = st.z; _kbuf[o + 19] = _k_w0[i] * (1.0 - k * 0.5)
	for i in dead:
		_k_live.erase(i)
	_spark.buffer = _kbuf


static func _write_dead(buf: PackedFloat32Array, i: int) -> void:
	var o := i * 20
	for q in 20:
		buf[o + q] = 0.0
