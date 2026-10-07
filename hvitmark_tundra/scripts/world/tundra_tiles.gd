class_name TundraTiles
extends RefCounted
## Builds the arena's TileSet at runtime from simple painted tiles, so the prototype needs no
## image files. Swap in real art later by replacing build() with a TileSet resource.
## Walls, boulders and water carry collision (physics layer 1 = "world").

const TILE := 56

enum T { SNOW, ICE, WATER, WALL, BRIDGE, BOULDER }

const SNOW_COLOR := Color("#e6f0f8")
const ICE_COLOR := Color("#b6dbec")
const WATER_COLOR := Color("#2b5d8e")
const WALL_COLOR := Color("#7b8795")
const BRIDGE_COLOR := Color("#d8a834")


static func build() -> TileSet:
	var atlas := Image.create(TILE * T.size(), TILE, false, Image.FORMAT_RGBA8)
	atlas.fill(Color(0, 0, 0, 0))
	_paint_snow(atlas, T.SNOW)
	_paint_ice(atlas, T.ICE)
	_paint_water(atlas, T.WATER)
	_paint_wall(atlas, T.WALL)
	_paint_bridge(atlas, T.BRIDGE)
	_paint_boulder(atlas, T.BOULDER)

	var ts := TileSet.new()
	ts.tile_size = Vector2i(TILE, TILE)
	ts.add_physics_layer()
	ts.set_physics_layer_collision_layer(0, 1)  # "world"
	ts.set_physics_layer_collision_mask(0, 0)
	var src := TileSetAtlasSource.new()
	src.texture = ImageTexture.create_from_image(atlas)
	src.texture_region_size = Vector2i(TILE, TILE)
	ts.add_source(src, 0)
	for t in T.values():
		src.create_tile(Vector2i(t, 0))
	var h := TILE / 2.0
	var square := PackedVector2Array([Vector2(-h, -h), Vector2(h, -h), Vector2(h, h), Vector2(-h, h)])
	var octagon := PackedVector2Array()
	for i in 8:
		octagon.append(Vector2.from_angle(TAU * i / 8.0 + PI / 8.0) * (h - 6.0) * 1.08)
	_solid(src, T.WALL, square)
	_solid(src, T.WATER, square)
	_solid(src, T.BOULDER, octagon)
	return ts


static func _solid(src: TileSetAtlasSource, tile: int, points: PackedVector2Array) -> void:
	var td := src.get_tile_data(Vector2i(tile, 0), 0)
	td.add_collision_polygon(0)
	td.set_collision_polygon_points(0, 0, points)


# ---- painting ------------------------------------------------------------------------------

static func _rect(img: Image, tile: int, x: int, y: int, w: int, h: int, c: Color) -> void:
	img.fill_rect(Rect2i(tile * TILE + x, y, w, h), c)


static func _border(img: Image, tile: int, c: Color) -> void:
	_rect(img, tile, 0, 0, TILE, 1, c)
	_rect(img, tile, 0, TILE - 1, TILE, 1, c)
	_rect(img, tile, 0, 0, 1, TILE, c)
	_rect(img, tile, TILE - 1, 0, 1, TILE, c)


static func _paint_snow(img: Image, tile: int) -> void:
	_rect(img, tile, 0, 0, TILE, TILE, SNOW_COLOR)
	var rng := RandomNumberGenerator.new()
	rng.seed = 11
	for i in 22:
		_rect(img, tile, rng.randi_range(2, TILE - 5), rng.randi_range(2, TILE - 5), 3, 2, SNOW_COLOR.darkened(0.07))
	_border(img, tile, SNOW_COLOR.darkened(0.04))


static func _paint_ice(img: Image, tile: int) -> void:
	_rect(img, tile, 0, 0, TILE, TILE, ICE_COLOR)
	for i in 4:  # diagonal glints
		for k in 14:
			var x := 6 + i * 13 + k
			var y := 38 - k - i * 4
			if x < TILE - 2 and y > 2 and y < TILE - 2:
				img.set_pixel(tile * TILE + x, y, ICE_COLOR.lightened(0.45))
	_border(img, tile, ICE_COLOR.darkened(0.08))


static func _paint_water(img: Image, tile: int) -> void:
	_rect(img, tile, 0, 0, TILE, TILE, WATER_COLOR)
	for row in 3:
		for x in range(4, TILE - 4):
			var y := 12 + row * 16 + int(round(2.0 * sin(x * 0.4 + row * 1.7)))
			img.set_pixel(tile * TILE + x, y, WATER_COLOR.lightened(0.28))
	_border(img, tile, WATER_COLOR.darkened(0.25))


static func _paint_wall(img: Image, tile: int) -> void:
	_rect(img, tile, 0, 0, TILE, TILE, WALL_COLOR)
	var mortar := WALL_COLOR.darkened(0.35)
	for r in 4:
		_rect(img, tile, 0, r * 14, TILE, 1, mortar)
		var off := 0 if r % 2 == 0 else 14
		for x in range(off, TILE, 28):
			_rect(img, tile, x, r * 14, 1, 14, mortar)
	_rect(img, tile, 0, 0, TILE, 2, WALL_COLOR.lightened(0.3))  # lit top edge
	_rect(img, tile, 0, 0, 2, TILE, WALL_COLOR.lightened(0.2))
	_rect(img, tile, 0, TILE - 3, TILE, 3, WALL_COLOR.darkened(0.45))
	_rect(img, tile, TILE - 2, 0, 2, TILE, WALL_COLOR.darkened(0.35))


static func _paint_bridge(img: Image, tile: int) -> void:
	_rect(img, tile, 0, 0, TILE, TILE, BRIDGE_COLOR)
	for x in range(0, TILE, 14):
		_rect(img, tile, x, 0, 1, TILE, BRIDGE_COLOR.darkened(0.3))
	for x in range(7, TILE, 14):  # nails
		_rect(img, tile, x - 1, 4, 2, 2, BRIDGE_COLOR.darkened(0.5))
		_rect(img, tile, x - 1, TILE - 6, 2, 2, BRIDGE_COLOR.darkened(0.5))
	_border(img, tile, BRIDGE_COLOR.darkened(0.45))


static func _paint_boulder(img: Image, tile: int) -> void:
	var c := Vector2(TILE / 2.0, TILE / 2.0)
	var r := 22.0
	var rock := Color("#8d98a6")
	for y in TILE:
		for x in TILE:
			var d := Vector2(x + 0.5, y + 0.5).distance_to(c)
			if d > r:
				continue
			var shade := ((x + y) / float(TILE * 2) - 0.5) * -0.5  # lighter up-left, darker down-right
			var col := rock.lightened(shade) if shade > 0.0 else rock.darkened(-shade)
			if d > r - 1.8:
				col = rock.darkened(0.55)
			img.set_pixel(tile * TILE + x, y, col)
