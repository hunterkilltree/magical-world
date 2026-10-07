# Draws a zone grid in a slightly oblique style: floors flat, walls and boulders raised with
# a front face. Logic lives in core/zone_grid.gd; this is only the view.
extends Node2D

const ZoneGrid = preload("res://scripts/core/zone_grid.gd")

const WALL_HEIGHT := 12.0
const TILE_COLORS := {
	"S": "#4ade80", "E": "#ef4444", "G": "#f7e26b", "C": "#c9a227",
	"D": "#a855f7", "B": "#6b2020", "*": "#c9a227", "^": "#ffffff", "w": "#3b82f6",
}

var grid = null


func build(zone_id: String) -> bool:
	grid = ZoneGrid.load_zone(zone_id)
	queue_redraw()
	return grid != null


func show_grid(g) -> void:
	grid = g
	queue_redraw()


# World positions of the party entry tiles.
func entry_positions() -> Array:
	var out := []
	for c in grid.cells_of("S"):
		out.append(grid.cell_center(c))
	return out


func enemy_spawn_positions() -> Array:
	var out := []
	for c in grid.cells_of("E"):
		out.append(grid.cell_center(c))
	return out


# ---- look (pure helpers, tested) -------------------------------------------

static func is_raised(g, c: Vector2i) -> bool:
	return g.tile_at(c) in ["#", "o"]


# A raised tile shows its front face only where nothing solid stands directly below it.
static func front_visible(g, c: Vector2i) -> bool:
	return is_raised(g, c) and not is_raised(g, c + Vector2i.DOWN)


# Small deterministic brightness offset (-0.06 .. 0.06) so floors do not look stamped.
static func tile_shade(c: Vector2i) -> float:
	return float(absi((c.x * 73856093) ^ (c.y * 19349663)) % 13 - 6) / 100.0


static func _shaded(col: Color, amount: float) -> Color:
	return Color(clampf(col.r * (1.0 + amount), 0.0, 1.0), clampf(col.g * (1.0 + amount), 0.0, 1.0),
		clampf(col.b * (1.0 + amount), 0.0, 1.0), col.a)


# ---- drawing ---------------------------------------------------------------

func _draw() -> void:
	if grid == null:
		return
	var tile := float(grid.TILE)
	var size := Vector2(tile, tile)
	var rock := Color(grid.colors["rock"])
	# Pass 1: everything flat.
	for y in grid.height:
		for x in grid.width:
			var c := Vector2i(x, y)
			var t: String = grid.tile_at(c)
			if t == " " or is_raised(grid, c):
				continue
			var col: Color
			match t:
				",":
					col = Color(grid.colors["rough"])
				"~":
					col = Color(grid.colors["hazard"])
				".":
					col = Color(grid.colors["ground"])
				_:
					col = Color(TILE_COLORS.get(t, grid.colors["ground"]))
			var shade := tile_shade(c) if t in [".", ",", "~"] else 0.0
			var r := Rect2(Vector2(x, y) * tile, size)
			draw_rect(r, _shaded(col, shade))
			draw_rect(r, Color(0, 0, 0, 0.10), false, 1.0)  # slab edges
			if t == "~":
				draw_line(r.position + Vector2(5, 11), r.position + Vector2(27, 11), Color(1, 1, 1, 0.25), 1.5)
				draw_line(r.position + Vector2(5, 21), r.position + Vector2(27, 21), Color(1, 1, 1, 0.18), 1.5)
	# Pass 2: raised tiles, top to bottom so lower walls overlap the ones behind.
	for y in grid.height:
		for x in grid.width:
			var c := Vector2i(x, y)
			if not is_raised(grid, c):
				continue
			var boulder: bool = grid.tile_at(c) == "o"
			var top_col := Color("#94a3b8") if boulder else _shaded(rock, 0.18)
			var top := Rect2(Vector2(x, y) * tile + Vector2(0, -WALL_HEIGHT), size)
			if front_visible(grid, c):
				var face := Rect2(top.position + Vector2(0, tile), Vector2(tile, WALL_HEIGHT))
				draw_rect(face, _shaded(top_col, -0.38))
				draw_line(face.position + Vector2(0, WALL_HEIGHT / 2.0), face.position + Vector2(tile, WALL_HEIGHT / 2.0), Color(0, 0, 0, 0.25), 1.0)
				var off := 8.0 if (x + y) % 2 == 0 else 20.0
				draw_line(face.position + Vector2(off, 0), face.position + Vector2(off, WALL_HEIGHT / 2.0), Color(0, 0, 0, 0.25), 1.0)
				draw_line(face.position + Vector2(off + 12.0, WALL_HEIGHT / 2.0), face.position + Vector2(off + 12.0, WALL_HEIGHT), Color(0, 0, 0, 0.25), 1.0)
				draw_rect(Rect2(face.position + Vector2(0, WALL_HEIGHT), Vector2(tile, 3)), Color(0, 0, 0, 0.18))  # contact shadow
			draw_rect(top, _shaded(top_col, tile_shade(c) * 0.6))
			draw_rect(top, Color(0, 0, 0, 0.18), false, 1.0)
			draw_line(top.position + Vector2(1, 1), top.position + Vector2(tile - 1, 1), Color(1, 1, 1, 0.22), 1.5)  # lit edge
