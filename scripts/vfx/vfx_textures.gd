# Procedural textures for the VFX layer (port of the canvas textures in wow.js / vfx.js):
# the rune circle, a 4-point star flare, a 2x2 soft-cloud atlas, ground decals (scorch, frost,
# crack, glow) and the light-column gradient. Line art is painted once into SubViewports, so this
# node must be in the tree; radial and linear fades are GradientTexture2Ds.
extends Node

const Painter := preload("res://scripts/vfx/painter.gd")

var _cache := {}


func rune() -> Texture2D:
	return _painted("rune", 512, _draw_rune)


# Gradients used while painting are made first: a texture created inside the paint call is not
# ready in time and draws as solid white.
func star() -> Texture2D:
	if _cache.has("star"):
		return _cache["star"]
	var core := radial([[0.0, Color(1, 1, 1, 1)], [0.12, Color(1, 1, 1, 0.75)], [0.4, Color(1, 1, 1, 0.12)], [1.0, Color(1, 1, 1, 0)]], 128)
	return _painted("star", 256, func(c: CanvasItem, S: float): _draw_star(c, S, core))


func cloud() -> Texture2D:
	if _cache.has("cloud"):
		return _cache["cloud"]
	var blob := radial([[0.0, Color(1, 1, 1, 1)], [1.0, Color(1, 1, 1, 0)]], 64)
	return _painted("cloud", 256, func(c: CanvasItem, S: float): _draw_cloud(c, S, blob))


func decal(kind: String) -> Texture2D:
	if kind == "glow":
		return glow()
	if _cache.has("decal_" + kind):
		return _cache["decal_" + kind]
	var st: Array = DECAL_STOPS[kind]
	var base := radial([[0.0, st[0]], [0.55, st[1]], [1.0, st[2]]], 128)
	return _painted("decal_" + kind, 256, func(c: CanvasItem, S: float): _draw_decal(c, S, kind, base))


func glow() -> Texture2D:
	if not _cache.has("glow"):
		_cache["glow"] = radial([[0.0, Color(1, 1, 1, 1)], [0.55, Color(1, 1, 1, 0.25)], [1.0, Color(1, 1, 1, 0)]], 128)
	return _cache["glow"]


# Light column: transparent at the top, solid at the base (UV.y 0 at the top).
func beam() -> Texture2D:
	if not _cache.has("beam"):
		var img := Image.create(4, 128, false, Image.FORMAT_RGBA8)
		for y in 128:
			var k := y / 127.0
			var a := k / 0.7 * 0.5 if k < 0.7 else 0.5 + (k - 0.7) / 0.3 * 0.5
			for x in 4:
				img.set_pixel(x, y, Color(1, 1, 1, a))
		_cache["beam"] = ImageTexture.create_from_image(img)
	return _cache["beam"]


# A radial fade built on the CPU (GradientTexture2D is generated lazily, too late to paint with).
static func radial(stops: Array, size := 128) -> ImageTexture:
	var g := Gradient.new()
	g.offsets = PackedFloat32Array(stops.map(func(s): return s[0]))
	g.colors = PackedColorArray(stops.map(func(s): return s[1]))
	var img := Image.create(size, size, false, Image.FORMAT_RGBA8)
	var h := size / 2.0
	for y in size:
		for x in size:
			var d := Vector2(x + 0.5 - h, y + 0.5 - h).length() / h
			img.set_pixel(x, y, g.sample(minf(d, 1.0)))
	return ImageTexture.create_from_image(img)


func _painted(key: String, S: int, fn: Callable) -> Texture2D:
	if _cache.has(key):
		return _cache[key]
	var vp := SubViewport.new()
	vp.size = Vector2i(S, S)
	vp.transparent_bg = true
	vp.disable_3d = true
	vp.render_target_update_mode = SubViewport.UPDATE_ONCE
	var p := Painter.new()
	p.fn = fn
	p.size = S
	vp.add_child(p)
	add_child(vp)
	var tex := vp.get_texture()
	_cache[key] = tex
	return tex


func _draw_rune(c: CanvasItem, S: float) -> void:
	var k := S / 512.0
	var o := Vector2(S, S) / 2
	var w := Color.WHITE
	for r in [[248, 5], [228, 2.5], [150, 3.5], [66, 3]]:
		c.draw_arc(o, r[0] * k, 0, TAU, 128, w, r[1] * k, true)
	for i in 72:
		var a := i / 72.0 * TAU
		var r1 := 238.0 if i % 6 else 246.0
		c.draw_line(o + Vector2(cos(a), sin(a)) * 229 * k, o + Vector2(cos(a), sin(a)) * r1 * k, w, (2.0 if i % 6 else 4.0) * k, true)
	for t in 2:
		var pts := PackedVector2Array()
		for i in 4:
			var a := i / 3.0 * TAU + t * PI / 3 - PI / 2
			pts.append(o + Vector2(cos(a), sin(a)) * 150 * k)
		c.draw_polyline(pts, w, 3.5 * k, true)
	for i in 12:
		var a := i / 12.0 * TAU
		c.draw_line(o + Vector2(cos(a), sin(a)) * 70 * k, o + Vector2(cos(a), sin(a)) * 100 * k, w, 2 * k, true)
	for i in 6:
		var a := i / 6.0 * TAU - PI / 2
		var p := o + Vector2(cos(a), sin(a)) * 188 * k
		c.draw_arc(p, 24 * k, 0, TAU, 32, w, 3 * k, true)
		var rot := Transform2D(a + PI / 2, p)
		var s := i % 3
		var segs := [[Vector2(0, -13), Vector2(0, 13)], [Vector2(0, -6 + s * 4), Vector2(9, -12 + s * 6)]]
		if i > 2:
			segs.append([Vector2(0, 4), Vector2(-9, 10)])
		for seg in segs:
			c.draw_line(rot * (seg[0] * k), rot * (seg[1] * k), w, 3 * k, true)


func _draw_star(c: CanvasItem, S: float, core: Texture2D) -> void:
	var h := S / 2
	c.draw_texture_rect(core, Rect2(0, 0, S, S), false)
	for spike in [[S, 7.0, 0.0], [S * 0.85, 5.0, PI / 2], [S * 0.45, 3.0, PI / 4], [S * 0.45, 3.0, -PI / 4]]:
		var L: float = spike[0] / 2
		var wd: float = spike[1]
		var a: float = spike[2]
		var d := Vector2(cos(a), sin(a))
		var n := d.orthogonal()
		var ctr := Vector2(h, h)
		var pts := PackedVector2Array([ctr - d * L, ctr + n * wd, ctr + d * L, ctr - n * wd])
		var cols := PackedColorArray([Color(1, 1, 1, 0), Color(1, 1, 1, 0.95), Color(1, 1, 1, 0), Color(1, 1, 1, 0.95)])
		c.draw_polygon(pts, cols)


func _draw_cloud(c: CanvasItem, S: float, blob: Texture2D) -> void:
	var C := S / 2
	var rng := RandomNumberGenerator.new()
	rng.seed = 5
	for v in 4:
		var ox := (v % 2) * C
		var oy := floorf(v / 2.0) * C
		for i in 22:
			var a := rng.randf() * TAU
			var r := rng.randf() * 26.0 * C / 128.0
			var R := (14 + rng.randf() * 26) * C / 128.0
			var p := Vector2(ox + C / 2 + cos(a) * r, oy + C / 2 + sin(a) * r)
			c.draw_texture_rect(blob, Rect2(p - Vector2(R, R), Vector2(R, R) * 2), false, Color(1, 1, 1, 0.42))


const DECAL_STOPS := {
	"scorch": [Color(0.047, 0.027, 0.02, 0.92), Color(0.086, 0.05, 0.035, 0.55), Color(0.086, 0.05, 0.035, 0)],
	"frost": [Color(0.92, 0.98, 1, 0.6), Color(0.78, 0.925, 1, 0.22), Color(0.78, 0.925, 1, 0)],
	"crack": [Color(0.078, 0.063, 0.086, 0.4), Color(0.078, 0.063, 0.086, 0.12), Color(0.078, 0.063, 0.086, 0)],
}


func _draw_decal(c: CanvasItem, S: float, kind: String, base: Texture2D) -> void:
	c.draw_texture_rect(base, Rect2(0, 0, S, S), false)
	var col := Color(1, 1, 1, 0.9) if kind == "frost" else Color(0.03, 0.02, 0.024, 0.9)
	var rng := RandomNumberGenerator.new()
	rng.seed = hash(kind)
	var h := S / 2
	var n := 10 if kind == "frost" else 6 if kind == "crack" else 8
	for i in n:
		_branch(c, rng, Vector2(h, h), i / float(n) * TAU + rng.randf() * 0.4, h * (0.5 if kind == "crack" else 0.4),
			2.5 if kind == "frost" else 3.5, 0, col)


func _branch(c: CanvasItem, rng: RandomNumberGenerator, p: Vector2, a: float, length: float, w: float, depth: int, col: Color) -> void:
	if depth > 3 or length < 5:
		return
	var q := p + Vector2(cos(a), sin(a)) * length
	c.draw_line(p, q, col, w, true)
	_branch(c, rng, q, a + (rng.randf() - 0.5) * 0.9, length * 0.62, w * 0.7, depth + 1, col)
	if rng.randf() < 0.6:
		_branch(c, rng, q, a + (-1.0 if rng.randf() < 0.5 else 1.0) * (0.5 + rng.randf() * 0.5), length * 0.5, w * 0.6, depth + 1, col)
