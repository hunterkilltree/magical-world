extends "res://harness/test_case.gd"

const ZoneGrid = preload("res://scripts/core/zone_grid.gd")
const Inventory = preload("res://scripts/core/inventory.gd")


func test_cache_opens_once_and_adds_item() -> void:
	var g = ZoneGrid.load_zone("tundra")
	var inv = Inventory.new()
	var c: Vector2i = g.cells_of("C")[0]
	var item: Dictionary = g.open_loot(c, inv)
	assert_true(not item.is_empty(), "got an item")
	assert_true(inv.has_item(item["id"]), "in inventory")
	assert_true(g.is_looted(c), "marked looted")
	assert_eq(g.open_loot(c, inv), {}, "second open is empty")
	assert_eq(inv.items.size(), 1, "no duplicate")


func test_non_cache_tile_gives_nothing() -> void:
	var g = ZoneGrid.load_zone("tundra")
	assert_eq(g.open_loot(g.cells_of("S")[0]), {}, "entry is not a cache")


func test_caches_are_independent() -> void:
	var g = ZoneGrid.load_zone("tundra")
	var inv = Inventory.new()
	var cells: Array = g.cells_of("C")
	g.open_loot(cells[0], inv)
	assert_true(not g.open_loot(cells[1], inv).is_empty(), "second cache still closed")
