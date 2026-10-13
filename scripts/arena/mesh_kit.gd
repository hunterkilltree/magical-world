# Placeholder-geometry helpers that follow three.js conventions (torus in the XY plane, circle
# facing +Z, lathe around Y, XYZ Euler order), so the prototype's models port line for line.
extends RefCounted

static var _mats := {}


# A StandardMaterial3D. Named materials are shared; unnamed ones are fresh (so they can be tinted).
static func mat(color, rough := 0.8, metal := 0.0, emissive = null, energy := 1.0, name := "") -> StandardMaterial3D:
	if name != "" and _mats.has(name):
		return _mats[name]
	var m := StandardMaterial3D.new()
	m.albedo_color = _col(color)
	m.roughness = rough
	m.metallic = metal
	if emissive != null:
		m.emission_enabled = true
		m.emission = _col(emissive)
		m.emission_energy_multiplier = energy
	if name != "":
		_mats[name] = m
	return m


# An unshaded, see-through material for ground decals, telegraphs and glows.
static func flat(color, alpha := 1.0, additive := false) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.albedo_color = _col(color)
	m.albedo_color.a = alpha
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.cull_mode = BaseMaterial3D.CULL_DISABLED
	m.no_depth_test = false
	if additive:
		m.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	return m


static func glow(color, energy := 2.0) -> StandardMaterial3D:
	var m := mat(color, 0.3, 0.0, color, energy)
	return m


static func _col(c) -> Color:
	if c is Color:
		return c
	if c is String:
		return Color(c)
	return Color.hex((int(c) << 8) | 0xff)


static func put(parent: Node3D, mesh: Mesh, material: Material, pos = null, rot = null, scl = null, shadow := true) -> MeshInstance3D:
	var o := MeshInstance3D.new()
	o.mesh = mesh
	o.material_override = material
	o.rotation_order = EULER_ORDER_XYZ
	o.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if shadow else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	if pos != null:
		o.position = _v3(pos)
	if rot != null:
		o.rotation = _v3(rot)
	if scl != null:
		o.scale = _v3(scl)
	parent.add_child(o)
	return o


static func group(parent: Node3D, pos = null, rot = null) -> Node3D:
	var g := Node3D.new()
	g.rotation_order = EULER_ORDER_XYZ
	if pos != null:
		g.position = _v3(pos)
	if rot != null:
		g.rotation = _v3(rot)
	parent.add_child(g)
	return g


static func _v3(a) -> Vector3:
	if a is Vector3:
		return a
	return Vector3(a[0], a[1], a[2])


# ---------------------------------------------------------------- primitives
static func box(w: float, h: float, d: float) -> Mesh:
	var m := BoxMesh.new()
	m.size = Vector3(w, h, d)
	return m


static func sphere(r: float, ws := 16, hs := 12) -> Mesh:
	var m := SphereMesh.new()
	m.radius = r
	m.height = r * 2
	m.radial_segments = ws
	m.rings = hs
	return m


# three's SphereGeometry with phi/theta ranges (hoods, mantles, domes).
static func sphere_part(r: float, phi0: float, phi_len: float, th0: float, th_len: float, ws := 20, hs := 12) -> Mesh:
	return _grid(func(u, v): return Vector3(-r * cos(phi0 + u * phi_len) * sin(th0 + v * th_len), r * cos(th0 + v * th_len),
		r * sin(phi0 + u * phi_len) * sin(th0 + v * th_len)), ws, hs, func(p: Vector3): return p)


static func cyl(rt: float, rb: float, h: float, seg := 16) -> Mesh:
	var m := CylinderMesh.new()
	m.top_radius = rt
	m.bottom_radius = rb
	m.height = h
	m.radial_segments = seg
	return m


# An open cylinder wall over part of the circle (three's thetaStart/thetaLength).
static func cyl_part(rt: float, rb: float, h: float, th0 := 0.0, th_len := TAU, seg := 24) -> Mesh:
	return _grid(func(u, v): return Vector3(lerpf(rt, rb, v) * sin(th0 + u * th_len), h / 2 - v * h,
		lerpf(rt, rb, v) * cos(th0 + u * th_len)), seg, 1, func(p: Vector3): return Vector3(p.x, 0, p.z))


static func cone(r: float, h: float, seg := 12) -> Mesh:
	return cyl(0.0, r, h, seg)


# three's CapsuleGeometry(radius, length): `length` is the straight middle part.
static func capsule(r: float, length: float) -> Mesh:
	var m := CapsuleMesh.new()
	m.radius = r
	m.height = length + 2 * r
	m.radial_segments = 12
	m.rings = 4
	return m


# Low-poly solids: octahedron, dodecahedron, icosahedron (as faceted spheres).
static func poly(r: float, faces := 12) -> Mesh:
	var m := SphereMesh.new()
	m.radius = r
	m.height = r * 2
	m.radial_segments = 4 if faces == 8 else 6 if faces == 12 else 7
	m.rings = 2 if faces == 8 else 3 if faces == 12 else 4
	return m


static func torus(radius: float, tube: float, arc := TAU, rs := 24, ts := 10) -> Mesh:
	return _grid(func(u, v): return Vector3((radius + tube * cos(v * TAU)) * cos(u * arc), (radius + tube * cos(v * TAU)) * sin(u * arc),
		tube * sin(v * TAU)), rs, ts, func(p: Vector3): return p - Vector3(p.x, p.y, 0).normalized() * radius)


# three's LatheGeometry: profile points [r, y] spun around Y.
static func lathe(profile: Array, seg := 32) -> Mesh:
	var n := profile.size() - 1
	return _grid(func(u, v):
		var i := mini(int(v * n), n - 1)
		var k: float = v * n - i
		var r: float = lerpf(profile[i][0], profile[i + 1][0], k)
		var y: float = lerpf(profile[i][1], profile[i + 1][1], k)
		return Vector3(r * sin(u * TAU), y, r * cos(u * TAU)), seg, n, func(p: Vector3): return Vector3(p.x, 0, p.z))


# A flat disc in the XY plane facing +Z (rotate x by -PI/2 to lay it on the ground).
static func disc(r: float, seg := 40) -> Mesh:
	return ring(0.0, r, seg)


static func ring(inner: float, outer: float, seg := 48) -> Mesh:
	return _grid(func(u, v): return Vector3(cos(u * TAU), sin(u * TAU), 0) * lerpf(inner, outer, v), seg, 1,
		func(_p): return Vector3(0, 0, 1))


# A ground wedge (pie slice) lying on XZ, opening along +Z: range r, arc in degrees.
static func wedge(r: float, arc_deg: float, seg := 24) -> Mesh:
	var half := deg_to_rad(arc_deg) / 2
	return _grid(func(u, v): return Vector3(sin(-half + u * 2 * half), 0, cos(-half + u * 2 * half)) * v * r, seg, 1,
		func(_p): return Vector3(0, 1, 0))


# A surface from fn(u, v) over a (nu x nv) grid, with normals pointing along outward(p).
static func _grid(fn: Callable, nu: int, nv: int, outward: Callable) -> Mesh:
	for flip in [false, true]:
		var st := SurfaceTool.new()
		st.begin(Mesh.PRIMITIVE_TRIANGLES)
		for j in nv + 1:
			for i in nu + 1:
				st.set_uv(Vector2(float(i) / nu, float(j) / nv))
				st.add_vertex(fn.call(float(i) / nu, float(j) / nv))
		for j in nv:
			for i in nu:
				var a := j * (nu + 1) + i
				var b := a + 1
				var c := a + nu + 1
				var d := c + 1
				if flip:
					st.add_index(a); st.add_index(b); st.add_index(c)
					st.add_index(b); st.add_index(d); st.add_index(c)
				else:
					st.add_index(a); st.add_index(c); st.add_index(b)
					st.add_index(b); st.add_index(c); st.add_index(d)
		st.generate_normals()
		var arrays := st.commit_to_arrays()
		var verts: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
		var norms: PackedVector3Array = arrays[Mesh.ARRAY_NORMAL]
		var k := ((nv / 2) * (nu + 1) + nu / 2) if nv > 1 else nu / 2 + nu + 1
		k = clampi(k, 0, verts.size() - 1)
		var out: Vector3 = outward.call(verts[k])
		if flip or out == Vector3.ZERO or norms[k].dot(out) >= 0:
			var mesh := ArrayMesh.new()
			mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
			return mesh
	return null
