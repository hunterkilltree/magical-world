extends "res://harness/test_case.gd"

const SaveGame = preload("res://scripts/core/save_game.gd")
const Campaign = preload("res://scripts/core/campaign.gd")
const ZoneGrid = preload("res://scripts/core/zone_grid.gd")
const Inventory = preload("res://scripts/core/inventory.gd")

const PATH := "user://test_r017_save.json"


func after_test() -> void:
	if FileAccess.file_exists(PATH):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(PATH))


func _play() -> Dictionary:
	# A session: tundra and pine done, a tundra cache and a pine cache looted, fragment held.
	var camp = Campaign.new()
	camp.complete("tundra")
	camp.complete("pine")
	var grids := {"tundra": ZoneGrid.load_zone("tundra"), "pine": ZoneGrid.load_zone("pine")}
	var inv = Inventory.new()
	grids["tundra"].open_loot(grids["tundra"].cells_of("C")[0], inv)
	grids["pine"].open_loot(grids["pine"].cells_of("C")[1], inv)
	inv.add({"id": "rune_fragment_2", "kind": "rune_fragment"})
	return {"campaign": camp, "grids": grids, "inventory": inv}


func test_progress_survives_a_quit_and_reload() -> void:
	var s := _play()
	assert_true(SaveGame.write(PATH, SaveGame.to_dict(s["campaign"], s["grids"], s["inventory"])), "written")

	var camp = Campaign.new()
	var grids := {"tundra": ZoneGrid.load_zone("tundra"), "pine": ZoneGrid.load_zone("pine")}
	var inv = Inventory.new()
	assert_true(SaveGame.apply(SaveGame.read(PATH), camp, grids, inv), "applied")

	assert_true(camp.is_complete("tundra") and camp.is_complete("pine"), "completed zones")
	assert_true(camp.is_unlocked("keep") and camp.is_unlocked("bog"), "unlocks follow")
	assert_true(not camp.is_unlocked("cavern"), "cavern still locked")
	assert_true(grids["tundra"].is_looted(grids["tundra"].cells_of("C")[0]), "tundra cache looted")
	assert_true(grids["pine"].is_looted(grids["pine"].cells_of("C")[1]), "pine cache looted")
	assert_eq(grids["tundra"].open_loot(grids["tundra"].cells_of("C")[0]), {}, "cannot loot it twice")
	assert_true(not grids["tundra"].is_looted(grids["tundra"].cells_of("C")[1]), "other cache still closed")
	assert_true(inv.has_item("rune_fragment_2"), "rune fragment kept")
	assert_eq(inv.items.size(), 3, "all three items")


func test_loot_can_be_restored_onto_a_zone_loaded_later() -> void:
	var s := _play()
	var data: Dictionary = SaveGame.to_dict(s["campaign"], s["grids"], s["inventory"])
	var late = ZoneGrid.load_zone("pine")
	SaveGame.apply_grid(data, late)
	assert_true(late.is_looted(late.cells_of("C")[1]), "restored when the zone loads")


func test_applying_twice_does_not_duplicate_items() -> void:
	var s := _play()
	var data: Dictionary = SaveGame.to_dict(s["campaign"], s["grids"], s["inventory"])
	var inv = Inventory.new()
	SaveGame.apply(data, Campaign.new(), {}, inv)
	SaveGame.apply(data, Campaign.new(), {}, inv)
	assert_eq(inv.items.size(), 3, "inventory replaced, not appended")


func test_missing_file_reads_empty_and_changes_nothing() -> void:
	var data: Dictionary = SaveGame.read("user://does_not_exist.json")
	assert_eq(data, {}, "empty")
	var camp = Campaign.new()
	var inv = Inventory.new()
	assert_true(not SaveGame.apply(data, camp, {}, inv), "nothing to apply")
	assert_true(not camp.is_complete("tundra") and inv.items.is_empty(), "untouched")


func test_corrupt_and_wrong_version_files_are_rejected() -> void:
	var f := FileAccess.open(PATH, FileAccess.WRITE)
	f.store_string("{ this is not json")
	f.close()
	assert_eq(SaveGame.read(PATH), {}, "corrupt")
	f = FileAccess.open(PATH, FileAccess.WRITE)
	f.store_string(JSON.stringify({"version": 999, "completed": ["tundra"]}))
	f.close()
	assert_eq(SaveGame.read(PATH), {}, "wrong version")


func test_a_tampered_save_cannot_skip_ahead() -> void:
	var data := {"version": SaveGame.VERSION, "completed": ["cavern", "volcano", "nowhere"],
		"looted": {}, "inventory": []}
	var camp = Campaign.new()
	assert_true(SaveGame.apply(data, camp, {}, Inventory.new()), "applies")
	assert_true(not camp.is_complete("cavern") and not camp.is_complete("volcano"), "unreachable zones dropped")
	assert_true(camp.is_unlocked("tundra") and not camp.is_unlocked("pine"), "still at the start")


func test_only_real_caches_are_restored() -> void:
	var data := {"version": SaveGame.VERSION, "completed": [], "inventory": [],
		"looted": {"tundra": [[0, 0], [1, 1]]}}
	var g = ZoneGrid.load_zone("tundra")
	SaveGame.apply_grid(data, g)
	assert_true(not g.is_looted(Vector2i(0, 0)), "void cell ignored")
	assert_true(not g.is_looted(Vector2i(1, 1)), "non-cache cell ignored")


func test_a_restored_pine_save_does_not_regrant_the_fragment() -> void:
	var g = ZoneGrid.load_zone("pine")
	var inv = Inventory.new()
	var cells: Array = g.cells_of("C")
	assert_eq(g.open_loot(cells[0], inv)["id"], "rune_fragment_1", "first cache holds the fragment")
	var data: Dictionary = SaveGame.to_dict(Campaign.new(), {"pine": g}, inv)
	var reloaded = ZoneGrid.load_zone("pine")
	SaveGame.apply_grid(data, reloaded)
	assert_true(reloaded.open_loot(cells[1])["id"] != "rune_fragment_1", "fragment is not granted twice")
