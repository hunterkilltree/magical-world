# Tracks completion of a zone. The objective depends on the zone:
#   tundra: gates open + a cache looted + reach the north exit
#   pine:   loot the north-east cache
extends RefCounted

signal completed

var grid
var inventory
var done := false


func _init(g, inv) -> void:
	grid = g
	inventory = inv


func exit_cells() -> Array:
	var out := []
	for x in grid.width:
		var c := Vector2i(x, 0)
		if grid.is_walkable(c):
			out.append(c)
	return out


func any_loot_opened() -> bool:
	return not inventory.items.is_empty()


# Caches in the north-east quadrant (the pine objective).
func north_east_caches() -> Array:
	var out := []
	for c in grid.cells_of("C"):
		if c.x >= grid.width / 2 and c.y < grid.height / 2:
			out.append(c)
	return out


func _objective_met(party_cell: Vector2i) -> bool:
	match grid.id:
		"tundra":
			return grid.gates_open and any_loot_opened() and party_cell in exit_cells()
		"pine":
			for c in north_east_caches():
				if grid.is_looted(c):
					return true
	return false


func update(party_cell: Vector2i) -> void:
	if done or not _objective_met(party_cell):
		return
	done = true
	completed.emit()
