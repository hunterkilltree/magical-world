# Tracks completion of a zone that ends at an exit: gates must be open and a cache looted.
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


func update(party_cell: Vector2i) -> void:
	if done or not grid.gates_open or not any_loot_opened():
		return
	if party_cell in exit_cells():
		done = true
		completed.emit()
