# Versioned JSON save of campaign progress: completed zones, looted caches, inventory.
extends RefCounted

const VERSION := 1


static func to_dict(campaign, grids: Dictionary, inventory) -> Dictionary:
	var looted := {}
	for zone_id in grids:
		var cells := []
		for c in grids[zone_id].looted_cells():
			cells.append([c.x, c.y])
		looted[zone_id] = cells
	return {
		"version": VERSION,
		"completed": campaign.completed_ids(),
		"looted": looted,
		"inventory": inventory.to_array(),
	}


# Restores campaign and inventory, and loot for each grid given. Returns false (changing
# nothing) for an empty or wrong-version dictionary.
static func apply(data: Dictionary, campaign, grids: Dictionary, inventory) -> bool:
	if data.is_empty() or int(data.get("version", -1)) != VERSION:
		return false
	campaign.restore(data.get("completed", []))
	inventory.restore(data.get("inventory", []))
	for zone_id in grids:
		apply_grid(data, grids[zone_id])
	return true


# Restores a zone's looted caches (use when a zone is loaded after the save was applied).
static func apply_grid(data: Dictionary, grid) -> void:
	var cells := []
	for c in data.get("looted", {}).get(grid.id, []):
		if c is Array and c.size() == 2:
			cells.append(Vector2i(int(c[0]), int(c[1])))
	grid.restore_loot(cells)


static func write(path: String, data: Dictionary) -> bool:
	var f := FileAccess.open(path, FileAccess.WRITE)
	if f == null:
		return false
	f.store_string(JSON.stringify(data))
	f.close()
	return true


# {} if the file is missing, unreadable, not a JSON object, or the wrong version.
static func read(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		return {}
	var json := JSON.new()  # parse() reports errors quietly, unlike parse_string()
	if json.parse(FileAccess.get_file_as_string(path)) != OK:
		return {}
	var parsed = json.data
	if not parsed is Dictionary or int(parsed.get("version", -1)) != VERSION:
		return {}
	return parsed
