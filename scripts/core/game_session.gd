# A whole playthrough: campaign progress, inventory, autosave and zone entry.
extends RefCounted

signal zone_completed(id: String)

const Campaign = preload("res://scripts/core/campaign.gd")
const Inventory = preload("res://scripts/core/inventory.gd")
const SaveGame = preload("res://scripts/core/save_game.gd")
const ZoneGrid = preload("res://scripts/core/zone_grid.gd")
const ZonePlay = preload("res://scripts/core/zone_play.gd")

const MENDED_RUNE := "cracked_rune_mended"

var save_path: String
var campaign = Campaign.new()
var inventory = Inventory.new()
var _loot: Dictionary = {}  # zone id -> Array of looted Vector2i


func _init(path := "user://savegame.json") -> void:
	save_path = path


func has_save() -> bool:
	return not SaveGame.read(save_path).is_empty()


func new_game() -> void:
	campaign = Campaign.new()
	inventory = Inventory.new()
	_loot.clear()


# Loads the save; returns false (leaving the session untouched) if there is none.
func continue_game() -> bool:
	var data := SaveGame.read(save_path)
	if data.is_empty():
		return false
	new_game()
	SaveGame.apply(data, campaign, {}, inventory)
	_loot = SaveGame.looted_map(data)
	return true


func save() -> bool:
	var data := SaveGame.to_dict(campaign, {}, inventory)
	var looted := {}
	for zone_id in _loot:
		looted[zone_id] = _loot[zone_id].map(func(c): return [c.x, c.y])
	data["looted"] = looted
	return SaveGame.write(save_path, data)


# One entry per zone, in campaign order.
func zone_choices() -> Array:
	var out := []
	for id in campaign.zone_ids():
		out.append({"id": id, "name": campaign.zone_name(id),
			"unlocked": campaign.is_unlocked(id), "complete": campaign.is_complete(id)})
	return out


# Starts a zone, or returns null if it is locked or unknown. Completing it advances the
# campaign and autosaves.
func enter_zone(id: String):
	if not campaign.is_unlocked(id):
		return null
	var grid = ZoneGrid.load_zone(id)
	if grid == null:
		return null
	grid.restore_loot(_loot.get(id, []))
	var play = ZonePlay.create(grid, inventory)
	campaign.bind_run(id, play.run)
	# Capture the grid, not `play`: play owns the run, so capturing it would form a cycle.
	play.run.completed.connect(func():
		_remember_loot(grid)
		save()
		zone_completed.emit(id))
	return play


# Remembers which caches were looted so they stay looted on re-entry.
func leave_zone(play) -> void:
	_remember_loot(play.grid)


func _remember_loot(grid) -> void:
	_loot[grid.id] = grid.looted_cells()


func ending_played() -> bool:
	return inventory.has_item(MENDED_RUNE)
