# A stylised breaking wave swept along a cone's arc (Tsunami, Torrent). Its profile is a long back
# slope, a crest, and a lip that curls forward over a concave front face. `step(el)` poses it for
# effect time `el`: a beat drawn back (anticipation), a fast rush out that slows, the crest rising and
# curling, then the lip plunging and the sheet fading into the pool. Each part of the arc has its own
# height and break time (smooth along the arc: the path must not kink). The director spawns the
# spray, the plunge splash and the foam from `lip_point` / `landing`.
extends MeshInstance3D

const SHADER := preload("res://shaders/wave_sheet.gdshader")
const N := 28 # segments across the arc
const BACK := 9 # profile points from the back foot to the crest
const LIP := 9 # the curling lip, crest included
const FACE := 6 # the concave front face

var center := Vector2.ZERO
var a0 := 0.0 # facing angle: forward is (sin, cos)
var half := 0.5 # half the arc, radians
var r0 := 0.7 # where the wave rises, metres from the caster
var reach := 5.0 # where its foot ends up
var hmax := 1.6
var curl_max := 1.0
var t_rise := 0.7 # seconds of travel
var t_break := 0.62 # when the lip starts to fall
var life := 1.45
var mat: ShaderMaterial
var peak := 0.0 # tallest the crest has been (tests)
var curl_now := 0.0
var foot_r := 0.0 # radius of the front foot at the middle of the arc (tests)
var crest_h: Array = [] # crest height per segment for the current pose
var _crest: Array = [] # world point of the lip's leading edge per segment
var _fwd: Array = [] # outward direction per segment
var _ph: Array = []


func setup(at: Vector2, facing: float, half_arc: float, o: Dictionary) -> void:
	center = at
	a0 = facing
	half = half_arc
	for k in o:
		set(k, o[k])
	_ph = [randf() * TAU, randf() * TAU, randf() * TAU, randf() * TAU]
	mat = ShaderMaterial.new()
	mat.shader = SHADER
	material_override = mat
	cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	set_meta("wave", true)
	step(0.0)


# Height across the arc: low at the ends (the wave spreads into a flat sheet), uneven in between.
func seg_height(u: float) -> float:
	return pow(sin(PI * u), 0.55) * (1.0 + 0.13 * sin(7.0 * u + _ph[0]) + 0.08 * sin(13.0 * u + _ph[1]))


# Parts of the crest break a little earlier or later than others.
func seg_delay(u: float) -> float:
	return 0.08 * (0.5 + 0.5 * sin(5.0 * u + _ph[2])) + 0.03 * (0.5 + 0.5 * sin(11.0 * u + _ph[3]))


static func _ease_out(x: float) -> float:
	x = clampf(x, 0.0, 1.0)
	return 1.0 - pow(1.0 - x, 3.0)


static func _smooth(x: float) -> float:
	x = clampf(x, 0.0, 1.0)
	return x * x * (3.0 - 2.0 * x)


# Profile for crest height H, curl c and break b: [outer (back foot -> crest -> lip tip), front face].
# Points are Vector3(u, y, v): u metres outward of the foot line, y height, v the shader's profile.
func profile(H: float, c: float, b: float, back_len: float) -> Array:
	var outer := []
	for j in BACK:
		var s := j / float(BACK - 1)
		# the back starts above the foam line: only the front foot (where the wave meets the ground) foams
		outer.append(Vector3(lerpf(-back_len, 0.1 * H, s), H * s * s * (3.0 - 2.0 * s), lerpf(0.07, 0.72, s)))
	var rho0 := 0.46 * H * (0.35 + 0.65 * c) # a big lip: it has to read from the gameplay camera
	var C := Vector2(0.1 * H, H - rho0)
	var sweep := c * 3.4
	for j in range(1, LIP):
		var q := j / float(LIP - 1)
		var phi := PI / 2 - q * sweep
		var rho := rho0 * (1.0 - 0.45 * q)
		var p := C + Vector2(cos(phi), sin(phi)) * rho
		# breaking: the lip is thrown forward and falls
		p.x += b * q * 0.8 * H
		p.y = maxf(0.05, p.y - b * q * 0.9 * H)
		outer.append(Vector3(p.x, p.y, lerpf(0.72, 1.0, q)))
	var face := []
	var f0 := Vector2(0.1 * H + rho0 + 0.35 * H, 0.0)
	var f1 := Vector2(0.2 * H, 0.15 * H)
	var f2 := Vector2(0.1 * H + rho0 * 0.7, C.y - rho0 * 0.7)
	for j in FACE:
		var s := j / float(FACE - 1)
		var p := f0.lerp(f1, s).lerp(f1.lerp(f2, s), s)
		face.append(Vector3(p.x, p.y, lerpf(0.02, 0.55, s)))
	return [outer, face]


func step(el: float) -> void:
	mat.set_shader_parameter("t", el)
	var fade := 1.0 - _smooth((el - (t_break + 0.25)) / maxf(0.05, life - t_break - 0.25))
	mat.set_shader_parameter("fade", fade)
	var verts := PackedVector3Array()
	var uvs := PackedVector2Array()
	var idx := PackedInt32Array()
	crest_h.clear()
	_crest.clear()
	_fwd.clear()
	var rows := [] # per segment: [outer, face] in world space
	var tallest := 0.0
	for i in N:
		var u := i / float(N - 1)
		var e := el - seg_delay(u)
		var R: float
		if el < 0.06:
			R = r0 - 0.25 * sin(PI * el / 0.06) # the whole body draws back for a beat
		elif e < 0.06:
			R = r0
		else:
			R = r0 + (reach - r0) * _ease_out((e - 0.06) / t_rise)
		var grow := _smooth((e - 0.02) / (t_break * 0.55))
		var c := curl_max * _smooth((e - 0.08) / maxf(0.05, t_break - 0.08))
		var b := _smooth((e - t_break) / 0.3)
		b *= b
		var H := hmax * seg_height(u) * (0.2 + 0.8 * grow) * (1.0 - 0.85 * b)
		var ang := a0 + (u - 0.5) * 2.0 * half
		var f := Vector3(sin(ang), 0, cos(ang))
		var pr := profile(H, c, b, minf(1.1 * H, maxf(0.3, R - 0.4)))
		var row := []
		for part in pr:
			var pts := []
			for p in part:
				var rr := maxf(0.25, R + p.x)
				pts.append([Vector3(center.x, 0, center.y) + f * rr + Vector3(0, p.y, 0), p.z])
			row.append(pts)
		rows.append(row)
		crest_h.append(H)
		tallest = maxf(tallest, H)
		# spray peels off the lip's leading edge (the curl's tip points back down into the barrel)
		var lead := 0
		for j in pr[0].size():
			if pr[0][j].x > pr[0][lead].x:
				lead = j
		_crest.append(row[0][lead][0])
		_fwd.append(f)
		if i == N / 2:
			foot_r = R
			curl_now = c
	peak = maxf(peak, tallest)
	for part in 2:
		var M: int = rows[0][part].size()
		var base := verts.size()
		for i in N:
			for j in M:
				var pv: Array = rows[i][part][j]
				verts.append(pv[0])
				uvs.append(Vector2(i / float(N - 1), pv[1]))
		for i in N - 1:
			for j in M - 1:
				var a := base + i * M + j
				var bb := a + M
				idx.append_array([a, bb, a + 1, a + 1, bb, bb + 1])
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = verts
	arrays[Mesh.ARRAY_TEX_UV] = uvs
	arrays[Mesh.ARRAY_INDEX] = idx
	var am := ArrayMesh.new()
	am.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	mesh = am


func _seg(u: float) -> int:
	return clampi(roundi(u * (N - 1)), 0, N - 1)


# The lip's leading edge in the current pose at arc position u (0..1).
func lip_point(u: float) -> Vector3:
	return _crest[_seg(u)]


func forward(u: float) -> Vector3:
	return _fwd[_seg(u)]


# Where that part of the lip lands on the ground.
func landing(u: float) -> Vector3:
	var p: Vector3 = _crest[_seg(u)]
	return Vector3(p.x, 0.15, p.z) + _fwd[_seg(u)] * 0.3
