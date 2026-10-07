# Draws a zone grid. Logic lives in core/zone_grid.gd; this is only the view.
extends Node2D

const ZoneGrid = preload("res://scripts/core/zone_grid.gd")

const TILE_COLORS := {
	"S": "#4ade80", "E": "#ef4444", "G": "#f7e26b", "C": "#c9a227",
	"o": "#94a3b8", "D": "#a855f7", "B": "#6b2020", "*": "#c9a227", "^": "#ffffff", "w": "#3b82f6",
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


func _draw() -> void:
	if grid == null:
		return
	var size := Vector2(grid.TILE, grid.TILE)
	for y in grid.height:
		for x in grid.width:
			var t: String = grid.tile_at(Vector2i(x, y))
			if t == " ":
				continue
			var col: Color
			match t:
				"#":
					col = Color(grid.colors["rock"])
				",":
					col = Color(grid.colors["rough"])
				"~":
					col = Color(grid.colors["hazard"])
				".":
					col = Color(grid.colors["ground"])
				_:
					col = Color(TILE_COLORS.get(t, grid.colors["ground"]))
			draw_rect(Rect2(Vector2(x, y) * grid.TILE, size), col)
