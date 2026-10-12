# Procedural geometry with the same parameters as the three.js primitives used by the
# design mockups in story/design/*.js, so their builders port line for line.
# A geometry is {v: PackedVector3Array, n: PackedVector3Array, i: PackedInt32Array, ccw: bool}
# (ccw = three.js winding; Godot's front faces are clockwise, Batch flips them).
# Batch merges many transformed geometries into one ArrayMesh, one surface per material.
extends RefCounted

static var _materials: Dictionary = {}
static var _hulls: Dictionary = {}


# ---- materials ---------------------------------------------------------------

# A cached StandardMaterial3D. `o`: color, roughness, metalness, emissive, emissive_intensity, double.
static func mat(name: String, o: Dictionary) -> StandardMaterial3D:
	if _materials.has(name):
		return _materials[name]
	var m := StandardMaterial3D.new()
	m.resource_name = name
	m.albedo_color = Color(o.get("color", "#ffffff"))
	m.roughness = float(o.get("roughness", 1.0))
	m.metallic = float(o.get("metalness", 0.0))
	if o.has("emissive") and float(o.get("emissive_intensity", 1.0)) > 0.0:
		m.emission_enabled = true
		m.emission = Color(o["emissive"])
		m.emission_energy_multiplier = float(o.get("emissive_intensity", 1.0))
	if o.get("double", false):
		m.cull_mode = BaseMaterial3D.CULL_DISABLED
	_materials[name] = m
	return m


# three.js Euler (order XYZ) as a Basis.
static func euler(x: float, y: float, z: float) -> Basis:
	return Basis(Vector3.RIGHT, x) * Basis(Vector3.UP, y) * Basis(Vector3.BACK, z)


# position * rotation(XYZ) * scale, as three.js composes an object's matrix.
static func xform(pos := Vector3.ZERO, rot := Vector3.ZERO, scale := Vector3.ONE) -> Transform3D:
	return Transform3D(euler(rot.x, rot.y, rot.z) * Basis.from_scale(scale), pos)


# ---- primitives --------------------------------------------------------------

static func _geo(v: PackedVector3Array, n: PackedVector3Array, i: PackedInt32Array, ccw := true) -> Dictionary:
	return {"v": v, "n": n, "i": i, "ccw": ccw}


static func sphere(r: float, ws := 32, hs := 16, phi0 := 0.0, phi_len := TAU, th0 := 0.0, th_len := PI) -> Dictionary:
	var v := PackedVector3Array()
	var n := PackedVector3Array()
	var idx := PackedInt32Array()
	var th_end := minf(th0 + th_len, PI)
	for iy in hs + 1:
		var fv := float(iy) / hs
		for ix in ws + 1:
			var fu := float(ix) / ws
			var p := Vector3(-r * cos(phi0 + fu * phi_len) * sin(th0 + fv * th_len),
				r * cos(th0 + fv * th_len),
				r * sin(phi0 + fu * phi_len) * sin(th0 + fv * th_len))
			v.append(p)
			n.append(p.normalized() if p.length() > 0.0 else Vector3.UP)
	for iy in hs:
		for ix in ws:
			var a := iy * (ws + 1) + ix + 1
			var b := iy * (ws + 1) + ix
			var c := (iy + 1) * (ws + 1) + ix
			var d := (iy + 1) * (ws + 1) + ix + 1
			if iy != 0 or th0 > 0.0:
				idx.append_array([a, b, d])
			if iy != hs - 1 or th_end < PI:
				idx.append_array([b, c, d])
	return _geo(v, n, idx)


static func cylinder(rt: float, rb: float, h: float, rs := 32, hs := 1, open := false, th0 := 0.0, th_len := TAU) -> Dictionary:
	var v := PackedVector3Array()
	var n := PackedVector3Array()
	var idx := PackedInt32Array()
	var slope := (rb - rt) / h
	for y in hs + 1:
		var fv := float(y) / hs
		var radius := fv * (rb - rt) + rt
		for x in rs + 1:
			var theta := float(x) / rs * th_len + th0
			v.append(Vector3(radius * sin(theta), -fv * h + h / 2.0, radius * cos(theta)))
			n.append(Vector3(sin(theta), slope, cos(theta)).normalized())
	for x in rs:
		for y in hs:
			var a := y * (rs + 1) + x
			var b := (y + 1) * (rs + 1) + x
			var c := (y + 1) * (rs + 1) + x + 1
			var d := y * (rs + 1) + x + 1
			idx.append_array([a, b, d, b, c, d])
	if not open:
		for top in [true, false]:
			var radius := rt if top else rb
			if radius <= 0.0:
				continue
			var sign := 1.0 if top else -1.0
			var center := v.size()
			v.append(Vector3(0, h / 2.0 * sign, 0))
			n.append(Vector3(0, sign, 0))
			var ring := v.size()
			for x in rs + 1:
				var theta := float(x) / rs * th_len + th0
				v.append(Vector3(radius * sin(theta), h / 2.0 * sign, radius * cos(theta)))
				n.append(Vector3(0, sign, 0))
			for x in rs:
				if top:
					idx.append_array([ring + x, ring + x + 1, center])
				else:
					idx.append_array([ring + x + 1, ring + x, center])
	return _geo(v, n, idx)


static func cone(r: float, h: float, rs := 32, open := false, th0 := 0.0, th_len := TAU) -> Dictionary:
	return cylinder(0.0, r, h, rs, 1, open, th0, th_len)


# Lies in the XY plane (axis along Z), as in three.js.
static func torus(radius: float, tube: float, rseg := 12, tseg := 48, arc := TAU) -> Dictionary:
	var v := PackedVector3Array()
	var n := PackedVector3Array()
	var idx := PackedInt32Array()
	for j in rseg + 1:
		for i in tseg + 1:
			var u := float(i) / tseg * arc
			var w := float(j) / rseg * TAU
			var p := Vector3((radius + tube * cos(w)) * cos(u), (radius + tube * cos(w)) * sin(u), tube * sin(w))
			v.append(p)
			n.append((p - Vector3(radius * cos(u), radius * sin(u), 0)).normalized())
	for j in range(1, rseg + 1):
		for i in range(1, tseg + 1):
			var a := (tseg + 1) * j + i - 1
			var b := (tseg + 1) * (j - 1) + i - 1
			var c := (tseg + 1) * (j - 1) + i
			var d := (tseg + 1) * j + i
			idx.append_array([a, b, d, b, c, d])
	return _geo(v, n, idx)


# Profile points are Vector2(radius, y), revolved around Y.
static func lathe(points: Array, segs := 12, phi0 := 0.0, phi_len := TAU) -> Dictionary:
	var v := PackedVector3Array()
	var n := PackedVector3Array()
	var idx := PackedInt32Array()
	var count := points.size()
	var init_normals: Array = []
	var prev := Vector2.ZERO
	for j in count:
		if j == count - 1:
			init_normals.append(prev.normalized())
			continue
		var d: Vector2 = points[j + 1] - points[j]
		var cur := Vector2(d.y, -d.x)
		init_normals.append(cur.normalized() if j == 0 else (cur + prev).normalized())
		prev = cur
	for i in segs + 1:
		var phi := phi0 + float(i) / segs * phi_len
		var s := sin(phi)
		var c := cos(phi)
		for j in count:
			var p: Vector2 = points[j]
			var nn: Vector2 = init_normals[j]
			v.append(Vector3(p.x * s, p.y, p.x * c))
			n.append(Vector3(nn.x * s, nn.y, nn.x * c).normalized())
	for i in segs:
		for j in count - 1:
			var base := j + i * count
			var a := base
			var b := base + count
			var c := base + count + 1
			var d := base + 1
			idx.append_array([a, b, d, c, d, b])
	return _geo(v, n, idx)


# A flat disc in the XY plane facing +Z.
static func circle(r: float, segs := 32) -> Dictionary:
	var v := PackedVector3Array([Vector3.ZERO])
	var n := PackedVector3Array([Vector3.BACK])
	var idx := PackedInt32Array()
	for s in segs + 1:
		var t := float(s) / segs * TAU
		v.append(Vector3(r * cos(t), r * sin(t), 0))
		n.append(Vector3.BACK)
	for s in range(1, segs + 1):
		idx.append_array([s, s + 1, 0])
	return _geo(v, n, idx)


static func box(w: float, h: float, d: float) -> Dictionary:
	var m := BoxMesh.new()
	m.size = Vector3(w, h, d)
	return _from_arrays(m.get_mesh_arrays())


# Total height is length + 2 * radius, as three.js's CapsuleGeometry.
static func capsule(radius: float, length: float, cap_segs := 4, radial := 16) -> Dictionary:
	var m := CapsuleMesh.new()
	m.radius = radius
	m.height = length + 2.0 * radius
	m.radial_segments = radial
	m.rings = cap_segs * 2
	return _from_arrays(m.get_mesh_arrays())


static func _from_arrays(a: Array) -> Dictionary:
	return _geo(a[Mesh.ARRAY_VERTEX], a[Mesh.ARRAY_NORMAL], a[Mesh.ARRAY_INDEX], false)


# ---- polyhedra (flat shaded, like three.js at detail 0) -----------------------

static func octahedron(r: float) -> Dictionary:
	return _flat_hull("octa", r)


static func dodecahedron(r: float) -> Dictionary:
	return _flat_hull("dodeca", r)


# detail 0 is flat shaded; detail 1 splits each face in four and is smooth, as in three.js.
static func icosahedron(r: float, detail := 0) -> Dictionary:
	if detail == 0:
		return _flat_hull("icosa", r)
	var tris: Array = _hull("icosa")
	var v := PackedVector3Array()
	var n := PackedVector3Array()
	var idx := PackedInt32Array()
	for t in tris:
		var a: Vector3 = t[0]
		var b: Vector3 = t[1]
		var c: Vector3 = t[2]
		var ab := ((a + b) / 2.0).normalized()
		var bc := ((b + c) / 2.0).normalized()
		var ca := ((c + a) / 2.0).normalized()
		for tri in [[a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]]:
			for p in tri:
				idx.append(v.size())
				v.append(p * r)
				n.append(p)
	return _geo(v, n, idx)


static func _flat_hull(kind: String, r: float) -> Dictionary:
	var v := PackedVector3Array()
	var n := PackedVector3Array()
	var idx := PackedInt32Array()
	for t in _hull(kind):
		var fn: Vector3 = (t[1] - t[0]).cross(t[2] - t[0]).normalized()
		for p in t:
			idx.append(v.size())
			v.append(p * r)
			n.append(fn)
	return _geo(v, n, idx)


# Outward (counter-clockwise) unit-sphere triangles of a convex polyhedron.
static func _hull(kind: String) -> Array:
	if _hulls.has(kind):
		return _hulls[kind]
	var t := (1.0 + sqrt(5.0)) / 2.0
	var pts: Array = []
	match kind:
		"octa":
			pts = [Vector3(1, 0, 0), Vector3(-1, 0, 0), Vector3(0, 1, 0), Vector3(0, -1, 0), Vector3(0, 0, 1), Vector3(0, 0, -1)]
		"icosa":
			for a in [-1.0, 1.0]:
				for b in [-t, t]:
					pts.append_array([Vector3(a, b, 0), Vector3(0, a, b), Vector3(b, 0, a)])
		"dodeca":
			var r := 1.0 / t
			for a in [-1.0, 1.0]:
				for b in [-1.0, 1.0]:
					for c in [-1.0, 1.0]:
						pts.append(Vector3(a, b, c))
					pts.append_array([Vector3(0, a * r, b * t), Vector3(a * r, b * t, 0), Vector3(a * t, 0, b * r)])
	for i in pts.size():
		pts[i] = (pts[i] as Vector3).normalized()
	var tris: Array = []
	for i in pts.size():
		for j in range(i + 1, pts.size()):
			for k in range(j + 1, pts.size()):
				var a: Vector3 = pts[i]
				var b: Vector3 = pts[j]
				var c: Vector3 = pts[k]
				var fn := (b - a).cross(c - a)
				if fn.length() < 1e-6:
					continue
				var above := 0
				var below := 0
				for p in pts:
					var s: float = fn.dot(p - a)
					if s > 1e-5:
						above += 1
					elif s < -1e-5:
						below += 1
				if above > 0 and below > 0:
					continue
				tris.append([a, c, b] if above > 0 else [a, b, c])
	_hulls[kind] = tris
	return tris


# ---- tubes along a centripetal Catmull-Rom curve (three.js CatmullRomCurve3) --

class Spline:
	var points: Array = []
	var _lengths: PackedFloat64Array = PackedFloat64Array()
	const DIVISIONS := 200

	func _init(pts: Array) -> void:
		points = pts
		var last := get_point(0.0)
		_lengths.append(0.0)
		var total := 0.0
		for i in range(1, DIVISIONS + 1):
			var p := get_point(float(i) / DIVISIONS)
			total += p.distance_to(last)
			_lengths.append(total)
			last = p

	func get_point(t: float) -> Vector3:
		var l := points.size()
		var p := (l - 1) * t
		var ip := floori(p)
		var weight := p - ip
		if weight == 0.0 and ip == l - 1:
			ip = l - 2
			weight = 1.0
		var p0: Vector3 = points[ip - 1] if ip > 0 else (points[0] - points[1]) + points[0]
		var p1: Vector3 = points[ip]
		var p2: Vector3 = points[ip + 1]
		var p3: Vector3 = points[ip + 2] if ip + 2 < l else (points[l - 1] - points[l - 2]) + points[l - 1]
		var dt0 := pow(p0.distance_squared_to(p1), 0.25)
		var dt1 := pow(p1.distance_squared_to(p2), 0.25)
		var dt2 := pow(p2.distance_squared_to(p3), 0.25)
		if dt1 < 1e-4:
			dt1 = 1.0
		if dt0 < 1e-4:
			dt0 = dt1
		if dt2 < 1e-4:
			dt2 = dt1
		var out := Vector3.ZERO
		for axis in 3:
			var x0: float = p0[axis]
			var x1: float = p1[axis]
			var x2: float = p2[axis]
			var x3: float = p3[axis]
			var t1 := ((x1 - x0) / dt0 - (x2 - x0) / (dt0 + dt1) + (x2 - x1) / dt1) * dt1
			var t2 := ((x2 - x1) / dt1 - (x3 - x1) / (dt1 + dt2) + (x3 - x2) / dt2) * dt1
			var c2 := -3.0 * x1 + 3.0 * x2 - 2.0 * t1 - t2
			var c3 := 2.0 * x1 - 2.0 * x2 + t1 + t2
			out[axis] = x1 + t1 * weight + c2 * weight * weight + c3 * weight * weight * weight
		return out

	# Arc-length parameterised point, like three.js getPointAt.
	func get_point_at(u: float) -> Vector3:
		return get_point(_u_to_t(u))

	func get_tangent_at(u: float) -> Vector3:
		var t := _u_to_t(u)
		var t1 := maxf(0.0, t - 0.0001)
		var t2 := minf(1.0, t + 0.0001)
		return (get_point(t2) - get_point(t1)).normalized()

	func _u_to_t(u: float) -> float:
		var target := u * _lengths[_lengths.size() - 1]
		var lo := 0
		var hi := _lengths.size() - 1
		while lo <= hi:
			var mid := (lo + hi) / 2
			if _lengths[mid] < target:
				lo = mid + 1
			elif _lengths[mid] > target:
				hi = mid - 1
			else:
				hi = mid
				break
		var i := maxi(0, hi)
		if i >= _lengths.size() - 1:
			return 1.0
		var seg := _lengths[i + 1] - _lengths[i]
		var frac := 0.0 if seg <= 0.0 else (target - _lengths[i]) / seg
		return (i + frac) / (_lengths.size() - 1)


static func tube(curve: Spline, tubular := 64, radius := 1.0, radial := 8) -> Dictionary:
	var v := PackedVector3Array()
	var n := PackedVector3Array()
	var idx := PackedInt32Array()
	# parallel-transport frames, seeded like three.js computeFrenetFrames
	var tangents: Array = []
	for i in tubular + 1:
		tangents.append(curve.get_tangent_at(float(i) / tubular))
	var t0: Vector3 = tangents[0]
	var axis := Vector3.RIGHT
	var smallest := absf(t0.x)
	if absf(t0.y) <= smallest:
		smallest = absf(t0.y)
		axis = Vector3.UP
	if absf(t0.z) <= smallest:
		axis = Vector3.BACK
	var normal := t0.cross(t0.cross(axis).normalized())
	for i in tubular + 1:
		var tg: Vector3 = tangents[i]
		if i > 0:
			var prev: Vector3 = tangents[i - 1]
			var ax := prev.cross(tg)
			if ax.length() > 1e-6:
				normal = normal.rotated(ax.normalized(), acos(clampf(prev.dot(tg), -1.0, 1.0)))
		var binormal := tg.cross(normal)
		var p := curve.get_point_at(float(i) / tubular)
		for j in radial + 1:
			var w := float(j) / radial * TAU
			var nn := (normal * -cos(w) + binormal * sin(w)).normalized()
			n.append(nn)
			v.append(p + nn * radius)
	for j in range(1, tubular + 1):
		for i in range(1, radial + 1):
			var a := (radial + 1) * (j - 1) + (i - 1)
			var b := (radial + 1) * j + (i - 1)
			var c := (radial + 1) * j + i
			var d := (radial + 1) * (j - 1) + i
			idx.append_array([a, b, d, b, c, d])
	return _geo(v, n, idx)


# ---- batching ----------------------------------------------------------------

class Part:
	var v := PackedVector3Array()
	var n := PackedVector3Array()
	var i := PackedInt32Array()


class Batch:
	var _parts: Dictionary = {}  # Material -> Part

	func add(geo: Dictionary, material: Material, xf := Transform3D.IDENTITY) -> void:
		if not _parts.has(material):
			_parts[material] = Part.new()
		var part: Part = _parts[material]
		var base := part.v.size()
		var nb := xf.basis.inverse().transposed()
		# a mirroring transform flips the winding as well
		var flip: bool = geo["ccw"] != (xf.basis.determinant() < 0.0)
		var src_v: PackedVector3Array = geo["v"]
		var src_n: PackedVector3Array = geo["n"]
		for k in src_v.size():
			part.v.append(xf * src_v[k])
			part.n.append((nb * src_n[k]).normalized())
		var src_i: PackedInt32Array = geo["i"]
		for k in range(0, src_i.size(), 3):
			if flip:
				part.i.append_array([base + src_i[k], base + src_i[k + 2], base + src_i[k + 1]])
			else:
				part.i.append_array([base + src_i[k], base + src_i[k + 1], base + src_i[k + 2]])

	func is_empty() -> bool:
		return _parts.is_empty()

	func commit() -> ArrayMesh:
		var mesh := ArrayMesh.new()
		for m in _parts:
			var part: Part = _parts[m]
			var arrays := []
			arrays.resize(Mesh.ARRAY_MAX)
			arrays[Mesh.ARRAY_VERTEX] = part.v
			arrays[Mesh.ARRAY_NORMAL] = part.n
			arrays[Mesh.ARRAY_INDEX] = part.i
			mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
			mesh.surface_set_material(mesh.get_surface_count() - 1, m)
		return mesh
