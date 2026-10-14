# Fractal, re-striking lightning bolt (the handoff's godot/lightning_bolt.gd, a port of vfx.js
# bolt() / boltSegs() / segGeo()). strike([from, to, ...], colour, {life, w, quiet}); it rebuilds its
# camera-facing ribbon every 0.07 s, flickers, and frees itself. The director adds the endpoint
# sparks, flare and light flash (not for quiet bolts).
extends Node3D

const STRIP := preload("res://shaders/energy_strip.gdshader")

var points: PackedVector3Array
var life := 0.26
var width := 0.2
var quiet := false
var _age := 0.0
var _next := 0.07
var _glow: MeshInstance3D
var _core: MeshInstance3D


func strike(pts: Array, color: Color, opts := {}) -> void:
	points = PackedVector3Array(pts)
	life = opts.get("life", 0.26)
	width = opts.get("w", 0.2)
	quiet = opts.get("quiet", false)
	_glow = _make_layer(color, 1.7, 2.2)
	_core = _make_layer(Color("#fff8e8"), 3.2, 0.9)
	_build()


func _make_layer(c: Color, k: float, falloff: float) -> MeshInstance3D:
	var m := ShaderMaterial.new()
	m.shader = STRIP
	m.set_shader_parameter("color", c)
	m.set_shader_parameter("intensity", k)
	m.set_shader_parameter("falloff", falloff)
	var mi := MeshInstance3D.new()
	mi.material_override = m
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)
	return mi


# Steps the bolt; the director calls it each frame (so effects pause with the game). Returns false once gone.
func advance(delta: float) -> bool:
	_age += delta
	var k := _age / life
	if k >= 1.0:
		queue_free()
		return false
	if _age > _next and k < 0.8:
		_next += 0.07
		_build()
	var a := (1.0 if randf() > 0.22 else 0.25) * (1.0 - k * k)
	_glow.material_override.set_shader_parameter("alpha", a)
	_core.material_override.set_shader_parameter("alpha", a)
	return true


func _fractal(a: Vector3, b: Vector3, depth: int, rough: float, out: Array) -> void:
	if depth == 0:
		out.append(b)
		return
	var L := a.distance_to(b)
	var d := (b - a).normalized()
	var r := Vector3(randf() - 0.5, randf() - 0.5, randf() - 0.5)
	r = (r - d * r.dot(d)).normalized()
	var m := a.lerp(b, 0.5) + r * (randf() - 0.5) * L * rough
	_fractal(a, m, depth - 1, rough, out)
	_fractal(m, b, depth - 1, rough, out)


func segments() -> Array:
	var segs := [] # [a, b, width_mul, fade]
	for i in points.size() - 1:
		var a := points[i]
		var b := points[i + 1]
		var L := a.distance_to(b)
		var path := [a]
		_fractal(a, b, 5 if L > 6.0 else (4 if L > 2.5 else 3), 0.32, path)
		for k in path.size() - 1:
			segs.append([path[k], path[k + 1], 1.0, 1.0])
			if k > 0 and k < path.size() - 2 and randf() < 0.28:
				var dir: Vector3 = ((path[k + 1] - path[k]).normalized() * 0.75 + Vector3(randf() - 0.5, randf() - 0.5, randf() - 0.5).normalized() * 0.7).normalized()
				var end: Vector3 = path[k] + dir * L * randf_range(0.12, 0.3)
				end.y = maxf(end.y, 0.05)
				var br := [path[k]]
				_fractal(path[k], end, 3, 0.4, br)
				for q in br.size() - 1:
					var t := 1.0 - float(q) / br.size()
					segs.append([br[q], br[q + 1], 0.55 * t, 0.6 * t])
	return segs


func _build() -> void:
	var cam := get_viewport().get_camera_3d() if is_inside_tree() else null
	var cam_pos := cam.global_position if cam else Vector3(0, 20, 20)
	var segs := segments()
	_glow.mesh = ribbon(self, segs, width, cam_pos)
	_core.mesh = ribbon(self, segs, 0.045, cam_pos)


# Camera-facing quads for [a, b, width_mul, fade] segments; UV.x runs across, COLOR.a fades.
static func ribbon(node: Node3D, segs: Array, w: float, cam: Vector3) -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var local_cam := node.to_local(cam) if node.is_inside_tree() else cam
	for s in segs:
		var a: Vector3 = node.to_local(s[0]) if node.is_inside_tree() else s[0]
		var b: Vector3 = node.to_local(s[1]) if node.is_inside_tree() else s[1]
		var ww: float = w * s[2]
		var d := (b - a).normalized()
		var side := d.cross(local_cam - a).normalized() * ww
		var ea := a - d * ww * 0.6
		var eb := b + d * ww * 0.6
		var col := Color(1, 1, 1, s[3])
		for v in [[ea + side, 0.0], [ea - side, 1.0], [eb + side, 0.0], [ea - side, 1.0], [eb - side, 1.0], [eb + side, 0.0]]:
			st.set_color(col)
			st.set_uv(Vector2(v[1], 0.0))
			st.add_vertex(v[0])
	return st.commit()
