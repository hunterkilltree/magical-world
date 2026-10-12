extends "res://harness/test_case.gd"

# Geometry ported from three.js must face outward in Godot (clockwise front faces).

const MK = preload("res://scripts/view3d/mesh_kit.gd")


# Fraction of triangles whose winding agrees with their outward vertex normals.
func _outward(geo: Dictionary) -> float:
	var b := MK.Batch.new()
	b.add(geo, MK.mat("test_probe", {}))
	var a: Array = b.commit().surface_get_arrays(0)
	var v: PackedVector3Array = a[Mesh.ARRAY_VERTEX]
	var n: PackedVector3Array = a[Mesh.ARRAY_NORMAL]
	var idx: PackedInt32Array = a[Mesh.ARRAY_INDEX]
	var good := 0
	var total := 0
	for k in range(0, idx.size(), 3):
		var face := (v[idx[k + 1]] - v[idx[k]]).cross(v[idx[k + 2]] - v[idx[k]])
		if face.length() < 1e-9:
			continue
		total += 1
		var avg := n[idx[k]] + n[idx[k + 1]] + n[idx[k + 2]]
		if face.dot(avg) < 0.0:  # clockwise seen from the side the normal points to
			good += 1
	return float(good) / maxf(1.0, float(total))


func test_primitives_face_outward() -> void:
	var curve := MK.Spline.new([Vector3(0, 0, 0), Vector3(0.1, -0.1, 0.05), Vector3(0.15, -0.3, 0.1), Vector3(0.1, -0.4, 0.2)])
	var shapes := {
		"sphere": MK.sphere(0.5, 16, 12),
		"hemisphere": MK.sphere(0.5, 16, 12, 0, TAU, 0, PI / 2.0),
		"cylinder": MK.cylinder(0.3, 0.4, 0.8, 16),
		"cone": MK.cone(0.3, 0.6, 12),
		"torus": MK.torus(0.4, 0.1, 10, 24),
		"lathe": MK.lathe([Vector2(0.01, -0.4), Vector2(0.4, -0.2), Vector2(0.3, 0.3), Vector2(0.05, 0.4)], 20),
		"tube": MK.tube(curve, 20, 0.05, 10),
		"octahedron": MK.octahedron(0.3),
		"dodecahedron": MK.dodecahedron(0.3),
		"icosahedron": MK.icosahedron(0.3, 1),
		"box": MK.box(0.3, 0.2, 0.1),
		"capsule": MK.capsule(0.1, 0.3),
	}
	for name in shapes:
		var f := _outward(shapes[name])
		assert_true(f > 0.97, "%s faces outward (%.2f)" % [name, f])


func test_a_mirroring_transform_keeps_faces_outward() -> void:
	var b := MK.Batch.new()
	b.add(MK.sphere(0.5, 12, 8), MK.mat("test_probe", {}), Transform3D(Basis.from_scale(Vector3(-1, 1, 1)), Vector3.ZERO))
	var a: Array = b.commit().surface_get_arrays(0)
	var v: PackedVector3Array = a[Mesh.ARRAY_VERTEX]
	var idx: PackedInt32Array = a[Mesh.ARRAY_INDEX]
	var face := (v[idx[4]] - v[idx[3]]).cross(v[idx[5]] - v[idx[3]])
	assert_true(face.dot(v[idx[3]]) < 0.0, "still clockwise from outside")


func test_three_js_euler_order() -> void:
	# three.js XYZ: the matrix is Rx * Ry * Rz
	var b := MK.euler(0.3, 0.5, 0.7)
	var expect := Basis(Vector3.RIGHT, 0.3) * Basis(Vector3.UP, 0.5) * Basis(Vector3.BACK, 0.7)
	assert_true(b.is_equal_approx(expect), "XYZ order")
	assert_true((Basis(Vector3.UP, PI / 2.0) * Vector3.BACK).is_equal_approx(Vector3.RIGHT), "right-handed like three.js")
