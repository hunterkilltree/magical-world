# Tracks completion of a zone. The objective depends on the zone:
#   tundra: gates open + a cache looted + reach the north exit
#   pine:   loot the north-east cache
#   boss zones (keep, volcano, cavern): reaching the pad sets `at_boss`; completion is
#   bind_boss(): defeating the boss completes the zone and drops its fragment
#   bog:    loot the barge and return to the ferry landing before dark (90 s)
extends RefCounted

signal completed
signal failed_signal
signal boss_reached

# Seconds until dark; zones listed here fail if not completed in time.
const DARK_TIME := {"bog": 90.0}

var grid
var inventory
var done := false
var failed := false
var at_boss := false  # the party has stood on a boss pad (defeating the boss is R-015)
var elapsed := 0.0


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
		"bog":
			return grid.tile_at(party_cell) == "S" and _any_cache_looted()
	return false


func _any_cache_looted() -> bool:
	for c in grid.cells_of("C"):
		if grid.is_looted(c):
			return true
	return false


func tick(delta: float) -> void:
	if done or failed:
		return
	elapsed += delta
	if DARK_TIME.has(grid.id) and elapsed >= DARK_TIME[grid.id]:
		failed = true
		failed_signal.emit()


# Killing the boss completes the zone and drops its rune fragment (if it has one).
func bind_boss(boss) -> void:
	boss.health.died.connect(func():
		if done or failed:
			return
		if boss.fragment != "":
			inventory.add({"id": boss.fragment, "kind": "rune_fragment"})
		done = true
		completed.emit())


func update(party_cell: Vector2i) -> void:
	if done or failed:
		return
	if not at_boss and grid.tile_at(party_cell) == "B":
		at_boss = true
		boss_reached.emit()
	if not _objective_met(party_cell):
		return
	done = true
	completed.emit()
