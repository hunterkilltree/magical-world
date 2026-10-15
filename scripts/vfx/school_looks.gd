# Each school's look (R-070), after the natural-magic tradition of Scott Cunningham's Earth Power
# and Earth, Air, Fire & Water: the four elements and spirit, each with its quarter of the circle,
# and magic worked through stones, candles, ice, wind, written signs and knotted cords.
#
# - Every combo, from any book, lights its elements' quarters around the caster: earth and nature in
#   the north (up the screen), air (wind, lightning) in the east, fire and light in the south, water
#   and ice in the west, arcane and dark at the heart.
# - A wizard's combos draw their school's circle instead of the court's rune, carry the school's
#   motif out along the spell, and mark where it lands with it a beat later.
#
# Called by the director; `fx` is the VfxDirector (particles, rune, flare, _add, _after...). Every
# mote is tagged in its options ("school:<motif>", "quarter:<element>") so tests can find it.
extends RefCounted

const K := preload("res://scripts/arena/mesh_kit.gd")
const SpellBook := preload("res://scripts/core/spell_book.gd")

# Where an element sits on the circle around the caster (north is -z, up the screen); ZERO = the heart.
const QUARTER := {
	"earth": Vector2(0, -1), "nature": Vector2(0, -1), "wind": Vector2(1, 0), "lightning": Vector2(1, 0),
	"fire": Vector2(0, 1), "light": Vector2(0, 1), "water": Vector2(-1, 0), "ice": Vector2(-1, 0),
	"arcane": Vector2.ZERO, "dark": Vector2.ZERO,
}


static func look_of(book: String) -> Dictionary:
	return SpellBook.school(book).get("look", {})


# Whose book a sim event's spell came from: a school spell names it in its key ("mix@wizard"); a
# court combo belongs to the caster, who keeps it; anything else (barrels, burning ground) has none.
static func book_of(key: String, caster_book: String) -> String:
	if "@" in key:
		return key.get_slice("@", 1)
	return caster_book if "+" in key else ""


static func _ease(x: float) -> float:
	return 1.0 - pow(1.0 - clampf(x, 0.0, 1.0), 3)


static func _hdr(c: Color, k: float) -> Array:
	return [c.r * k, c.g * k, c.b * k]


# ---------------------------------------------------------------- the quarters
static func quarters(fx, at: Vector2, els: Array, r := 1.35) -> void:
	var used := {}
	var done := []
	for el in els:
		if done.has(el):
			continue
		done.append(el)
		var q: Vector2 = QUARTER.get(el, Vector2.ZERO)
		var n: int = used.get(q, 0)
		used[q] = n + 1
		var p := at
		if q != Vector2.ZERO:
			# a second element of the same quarter stands a little to one side of the first
			var a: float = atan2(q.y, q.x) + [0.0, 0.35, -0.35][mini(n, 2)] + randf_range(-0.15, 0.15)
			p = at + Vector2(cos(a), sin(a)) * r * randf_range(0.92, 1.08)
		var c := SpellBook.color(el)
		fx.ground_glow(p.x, p.y, c, 0.75, 0.55, 1.2)
		fx.flare(Vector3(p.x, 0.35, p.y), c, 0.5, 0.12)
		_element_motes(fx, el, Vector3(p.x, 0.25, p.y), "quarter:" + el)


# A few motes of one element, each moving by its own nature (elemental-vfx R-065).
static func _element_motes(fx, el: String, p: Vector3, tag: String) -> void:
	for i in randi_range(3, 5):
		var j := Vector3(randf_range(-0.15, 0.15), randf_range(0.0, 0.2), randf_range(-0.15, 0.15))
		var o := {"tag": tag, "k": randf_range(0.3, 0.5), "life": randf_range(0.45, 0.9)}
		var a := randf() * TAU
		match el:
			"fire":
				fx.particles.sprite("flame", p + j, Vector3(randf_range(-0.3, 0.3), randf_range(0.8, 1.8), randf_range(-0.3, 0.3)), o)
			"water":
				fx.particles.spark("water", p + j, Vector3(randf_range(-1.0, 1.0), randf_range(2.5, 4.0), randf_range(-1.0, 1.0)), o)
			"ice":
				o["buoy"] = -0.35
				fx.particles.sprite("mist", p + j, Vector3(randf_range(-0.6, 0.6), -0.1, randf_range(-0.6, 0.6)), o)
			"earth":
				o["buoy"] = -0.2
				fx.particles.sprite("dust", p + j, Vector3(randf_range(-0.8, 0.8), randf_range(0.3, 0.9), randf_range(-0.8, 0.8)), o)
			"nature":
				o["buoy"] = 0.3
				o["drag"] = 1.6
				fx.particles.sprite("spore", p + j, Vector3(randf_range(-0.4, 0.4), randf_range(0.6, 1.2), randf_range(-0.4, 0.4)), o)
			"wind":
				fx.particles.sprite("gust", p + Vector3(cos(a), 0, sin(a)) * 0.22, Vector3(-sin(a), 0.3, cos(a)) * randf_range(1.5, 2.5), o)
			"lightning":
				fx.particles.spark("lightning", p + j, Vector3(randf_range(-3, 3), randf_range(0.5, 3), randf_range(-3, 3)), o)
			"light":
				o["buoy"] = 1.4
				fx.particles.sprite("radiance", p + j, Vector3(randf_range(-0.3, 0.3), randf_range(0.8, 1.6), randf_range(-0.3, 0.3)), o)
			"dark":
				o["buoy"] = -0.8
				fx.particles.sprite("shadow", p + j + Vector3(0, 0.3, 0), Vector3(randf_range(-0.4, 0.4), -0.2, randf_range(-0.4, 0.4)), o)
			_: # arcane: spirit turning at the heart
				fx.particles.sprite("arcane", p + Vector3(cos(a), 0, sin(a)) * 0.2, Vector3(-sin(a), 0.4, cos(a)) * randf_range(1.2, 2.0), o)


# ---------------------------------------------------------------- the motif
# `n` motes of the school's motif about `p`: glyphs swirl and rise, embers climb, frost sinks, grit
# hops and falls, sparks crack outward, wisps sink.
static func motif(fx, look: Dictionary, p: Vector3, n: int, spread := 0.3) -> void:
	var tint := Color(look.get("tint", "#ffffff"))
	var tag := "school:" + String(look.get("motif", ""))
	for i in n:
		var q := p + Vector3(randf_range(-spread, spread), randf_range(-0.1, 0.25), randf_range(-spread, spread))
		var a := randf() * TAU
		match look.get("motif", ""):
			"glyphs":
				fx.particles.sprite("arcane", q, Vector3(-sin(a), randf_range(0.2, 0.7), cos(a)) * randf_range(0.8, 1.8),
					{"tag": tag, "k": randf_range(0.28, 0.5), "life": randf_range(0.5, 0.95), "buoy": 0.25, "drag": 1.8,
					"c0": _hdr(tint.lerp(Color.WHITE, 0.3), 2.2), "c1": _hdr(tint, 0.7)})
			"embers":
				fx.particles.spark("fire", q, Vector3(randf_range(-0.8, 0.8), randf_range(1.5, 3.2), randf_range(-0.8, 0.8)),
					{"tag": tag, "life": randf_range(0.4, 0.8), "grav": -1.5})
				if randf() < 0.3:
					fx.particles.sprite("hotsmoke", q, Vector3(0, randf_range(0.6, 1.2), 0), {"tag": tag, "k": randf_range(0.3, 0.45)})
			"frost":
				fx.particles.sprite("mist", q, Vector3(randf_range(-0.6, 0.6), randf_range(-0.3, 0.1), randf_range(-0.6, 0.6)),
					{"tag": tag, "k": randf_range(0.3, 0.5), "buoy": -0.35, "life": randf_range(0.6, 1.1),
					"c0": _hdr(tint.lerp(Color.WHITE, 0.5), 1.4), "c1": _hdr(tint, 0.6)})
				if randf() < 0.4:
					fx.particles.spark("ice", q, Vector3(randf_range(-1.5, 1.5), randf_range(0.5, 2.0), randf_range(-1.5, 1.5)), {"tag": tag, "life": 0.3})
			"grit":
				fx.particles.spark("earth", q, Vector3(randf_range(-1.6, 1.6), randf_range(1.0, 2.6), randf_range(-1.6, 1.6)), {"tag": tag})
				if randf() < 0.5:
					fx.particles.sprite("dust", Vector3(q.x, maxf(0.2, q.y - 0.3), q.z), Vector3(randf_range(-0.6, 0.6), 0.3, randf_range(-0.6, 0.6)),
						{"tag": tag, "k": randf_range(0.35, 0.6), "buoy": -0.2})
			"sparks":
				fx.particles.spark("lightning", q, Vector3(randf_range(-4, 4), randf_range(-0.5, 3), randf_range(-4, 4)),
					{"tag": tag, "life": randf_range(0.08, 0.18), "grav": 0.0})
			"wisps":
				fx.particles.sprite("shadow", q + Vector3(0, 0.3, 0), Vector3(randf_range(-0.5, 0.5), randf_range(-0.5, -0.1), randf_range(-0.5, 0.5)),
					{"tag": tag, "k": randf_range(0.35, 0.6), "buoy": -0.7, "drag": 1.4, "life": randf_range(0.7, 1.2),
					"c0": _hdr(tint, 1.2), "c1": _hdr(tint.darkened(0.6), 0.5)})


# Where a school's spell lands, a beat after the hit (overlap): its motif, and the school's mark.
static func accent(fx, look: Dictionary, p: Vector3, r := 1.0) -> void:
	if not look.is_empty():
		fx._after(0.07, func(): _accent_now(fx, look, p, r))


static func _accent_now(fx, look: Dictionary, p: Vector3, r: float) -> void:
	var tint := Color(look["tint"])
	var low := Vector3(p.x, 0.3, p.z)
	match look["motif"]:
		"glyphs":
			fx.rune(p.x, p.z, tint, 0.5 + r * 0.25, 0.4, {"tex": fx.textures.sigil("pentacle"), "spin": 3.0, "r0": 0.2, "k": 1.6})
			motif(fx, look, p, 5, 0.35)
		"embers":
			motif(fx, look, p, 7, 0.4)
			fx.flare(p, tint, 0.7, 0.1)
		"frost":
			motif(fx, look, low, 6, 0.4)
			fx.spray("ice", p.x, 0.5, p.z, 3, 3.0, {"size": 0.5})
		"grit":
			motif(fx, look, low, 6, 0.45)
			fx.spray("rock", p.x, 0.4, p.z, 3, 3.0, {"size": 0.6})
		"sparks":
			motif(fx, look, p, 6, 0.3)
			fx.forks(p.x, p.z, 0.9, tint, 2)
		"wisps":
			# drawn in: the wisps close on the spot (binding), sinking as they come
			for i in 7:
				var a := randf() * TAU
				var d := Vector3(cos(a), 0, sin(a))
				fx.particles.sprite("shadow", p + d * randf_range(0.7, 1.1), -d * randf_range(1.2, 2.0) + Vector3(0, -0.3, 0),
					{"tag": "school:wisps", "k": randf_range(0.35, 0.55), "buoy": -0.5, "drag": 1.6, "life": randf_range(0.5, 0.8),
					"c0": _hdr(tint, 1.2), "c1": _hdr(tint.darkened(0.6), 0.5)})
			fx.flare(p, tint.darkened(0.2), 0.55, 0.1)


# ---------------------------------------------------------------- the circles
# The painted circle a school stamps wherever the court would stamp its rune (queue, new spell,
# area, nova): stones pour their sand circle, the others their sigil.
static func circle_texture(fx, look: Dictionary) -> Texture2D:
	var kind: String = look["sigil"]
	return fx.textures.sigil("sand" if kind == "stones" else kind)


# The school's circle at the caster's feet, in place of the court's rune. `small` for a recast.
static func sigil(fx, at: Vector2, look: Dictionary, c: Color, tier: float, small := false) -> void:
	var kind: String = look["sigil"]
	fx.last_sigil = kind
	var tint := Color(look["tint"])
	var R := (1.15 + tier * 0.42) * (0.65 if small else 1.0)
	var life := (0.55 + tier * 0.1) * (0.7 if small else 1.0)
	var col := c.lerp(tint, 0.5)
	match kind:
		"pentacle":
			_pentacle(fx, at, col, R, life, small)
		"candles":
			_candles(fx, at, tint, R, life, small)
		"snowflake":
			_snowflake(fx, at, col, R, life, small)
		"stones":
			_stones(fx, at, look, R, life, small)
		"whorl":
			_whorl(fx, at, col, tint, R, life, small)
		"knots":
			_knots(fx, at, col, look, R, life, small)
	for i in (3 if small else 6):
		var a := randf() * TAU
		motif(fx, look, Vector3(at.x + cos(a) * R * 0.9, 0.2, at.y + sin(a) * R * 0.9), 1, 0.1)


# Aldric: the five elements on a star (written, not drawn), with three small runes circling it.
static func _pentacle(fx, at: Vector2, c: Color, R: float, life: float, small: bool) -> void:
	fx.rune(at.x, at.y, c, R, life, {"tex": fx.textures.sigil("pentacle"), "spin": 1.2, "r0": R * 0.55})
	if small:
		return
	var g := K.group(fx, [at.x, 0.12, at.y])
	var marks := []
	var phase := randf() * TAU
	for i in 3:
		var m: StandardMaterial3D = fx._additive(c, 2.0, fx.textures.rune())
		var q := K.put(g, fx._quad, m, null, null, null, false)
		q.scale = Vector3.ONE * randf_range(0.15, 0.21)
		marks.append({"q": q, "m": m, "a": phase + i * TAU / 3 + randf_range(-0.3, 0.3), "w": randf_range(2.4, 3.4), "r": R * randf_range(1.0, 1.12)})
	fx._add(g, life * 1.1, func(k: float, dt: float, _el: float):
		for mk in marks:
			mk["a"] += dt * mk["w"]
			mk["q"].position = Vector3(cos(mk["a"]) * mk["r"], 0.0, sin(mk["a"]) * mk["r"])
			mk["q"].rotation.y += dt * 4.0
			mk["m"].albedo_color.a = k / 0.15 if k < 0.15 else 1.0 - (k - 0.15) / 0.85)


# Brann: a ring of candle flames that flare when lit, settle, and gutter into a thread of smoke.
static func _candles(fx, at: Vector2, tint: Color, R: float, life: float, small: bool) -> void:
	fx.ground_glow(at.x, at.y, tint, R * 1.25, life, 0.9)
	var n := 4 if small else randi_range(6, 8)
	var base := randf() * TAU
	for i in n:
		var a := base + i * TAU / n + randf_range(-0.28, 0.28)
		var rr := R * randf_range(0.88, 1.08)
		var p := Vector3(at.x + cos(a) * rr, 0.12, at.y + sin(a) * rr)
		var burn := life * randf_range(0.7, 1.0)
		var acc := [randf()]
		fx._add(Node3D.new(), burn, func(k: float, dt: float, _el: float):
			acc[0] += dt * (26.0 if k < 0.25 else 12.0)
			while acc[0] >= 1.0:
				acc[0] -= 1.0
				fx.particles.sprite("flame", p + Vector3(randf_range(-0.04, 0.04), 0, randf_range(-0.04, 0.04)),
					Vector3(randf_range(-0.15, 0.15), randf_range(1.2, 2.2) * (1.3 - k), randf_range(-0.15, 0.15)),
					{"tag": "school:embers", "k": (0.55 - 0.3 * k) * randf_range(0.8, 1.2), "life": randf_range(0.18, 0.32)}),
			func():
				fx.particles.sprite("hotsmoke", p + Vector3(0, 0.25, 0), Vector3(randf_range(-0.2, 0.2), randf_range(0.6, 1.0), randf_range(-0.2, 0.2)),
					{"tag": "school:embers", "k": randf_range(0.3, 0.45)}))


# Vela: a frost crystal grows out from her feet; light catches it twice, and cold pours off its rim.
static func _snowflake(fx, at: Vector2, c: Color, R: float, life: float, small: bool) -> void:
	fx.rune(at.x, at.y, c, R, life * 1.15, {"tex": fx.textures.sigil("snowflake"), "spin": 0.5, "r0": R * 0.15, "k": 2.0})
	if small:
		return
	var a := randf() * TAU
	fx._after(0.1, func(): fx.flare(Vector3(at.x + cos(a) * R * 0.6, 0.15, at.y + sin(a) * R * 0.6), Color("#eaf8ff"), 0.9, 0.12))
	fx._after(0.26, func(): fx.flare(Vector3(at.x - cos(a) * R * 0.45, 0.15, at.y - sin(a) * R * 0.45), Color("#eaf8ff"), 0.6, 0.1))
	for i in 8:
		var b := randf() * TAU
		fx.particles.sprite("mist", Vector3(at.x + cos(b) * R, 0.35, at.y + sin(b) * R), Vector3(cos(b), -0.2, sin(b)) * randf_range(0.6, 1.4),
			{"tag": "school:frost", "k": randf_range(0.35, 0.6), "buoy": -0.35, "life": randf_range(0.7, 1.2)})


# Morrow: a circle poured in sand, and standing stones that push up through it, then settle back.
static func _stones(fx, at: Vector2, look: Dictionary, R: float, life: float, small: bool) -> void:
	var tint := Color(look["tint"])
	fx.rune(at.x, at.y, tint, R * 1.05, life * 1.2, {"tex": fx.textures.sigil("sand"), "spin": 0.0, "r0": R * 1.05, "k": 1.1, "a": 0.8})
	if small:
		return
	var g := K.group(fx, [at.x, 0, at.y])
	var mat := K.mat(0x8f877a, 0.95, 0.0, null, 1.0, "school_stone")
	var stones := []
	var n := randi_range(6, 8)
	var base := randf() * TAU
	for i in n:
		var a := base + i * TAU / n + randf_range(-0.25, 0.25)
		var rr := R * randf_range(0.95, 1.12)
		var h := randf_range(0.45, 0.8)
		var s := K.put(g, K.cyl(0.09, 0.15, 1.0, 5), mat, [cos(a) * rr, -h, sin(a) * rr], [randf_range(-0.12, 0.12), randf() * TAU, randf_range(-0.12, 0.12)])
		s.scale = Vector3(randf_range(0.8, 1.2), h, randf_range(0.8, 1.2))
		stones.append({"s": s, "h": h, "d": randf() * 0.1})
		motif(fx, look, Vector3(at.x + cos(a) * rr, 0.2, at.y + sin(a) * rr), 1, 0.08)
	var hold := life * 1.3
	fx._add(g, hold, func(_k: float, _dt: float, el: float):
		for st in stones:
			var up := _ease((el - st["d"]) / 0.16) * clampf((hold - el) / 0.3, 0.0, 1.0)
			st["s"].position.y = st["h"] * (up - 0.5))


# Kessa: a whorl of wind spins up, sweeping dust round, and the storm in it forks to the ground.
static func _whorl(fx, at: Vector2, c: Color, tint: Color, R: float, life: float, small: bool) -> void:
	fx.rune(at.x, at.y, c, R, life, {"tex": fx.textures.sigil("whorl"), "spin": 7.5, "r0": R * 0.55, "k": 2.0})
	if small:
		return
	fx.wind_carry(Vector3(at.x, 0.4, at.y), 10, R * 0.8)
	for i in randi_range(2, 3):
		var a := randf() * TAU
		var p := Vector3(at.x + cos(a) * R, 0.9, at.y + sin(a) * R)
		fx._after(randf_range(0.04, 0.2), func():
			fx.bolt([p, Vector3(p.x + cos(a) * 0.5, 0.1, p.z + sin(a) * 0.5)], tint.lerp(Color.WHITE, 0.4), {"quiet": true, "w": 0.09, "life": 0.12}))


# The Hollow Warden: a knotted cord drawn round him, pulled tight inward; wisps sink from it.
static func _knots(fx, at: Vector2, c: Color, look: Dictionary, R: float, life: float, small: bool) -> void:
	fx.rune(at.x, at.y, c, R * 0.92, life * 1.1, {"tex": fx.textures.sigil("knots"), "spin": -1.1, "r0": R * 1.45, "k": 2.0})
	if small:
		return
	for i in 7:
		var a := randf() * TAU
		motif(fx, look, Vector3(at.x + cos(a) * R * 1.2, 0.3, at.y + sin(a) * R * 1.2), 1, 0.1)
