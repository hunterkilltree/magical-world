# Campaign progress over the overworld route graph (data/overworld.json).
# The first region starts unlocked; completing a zone unlocks its route neighbours.
extends RefCounted

signal zone_unlocked(id: String)

const DATA_PATH := "res://data/overworld.json"

var routes: Array = []
var _order: Array = []
var _unlocked: Dictionary = {}
var _completed: Dictionary = {}


func _init() -> void:
	var data = JSON.parse_string(FileAccess.get_file_as_string(DATA_PATH))
	for r in data["regions"]:
		_order.append(r["id"])
	routes = data["routes"]
	_unlocked[_order[0]] = true


func zone_ids() -> Array:
	return _order.duplicate()


func neighbours(id: String) -> Array:
	var out := []
	for r in routes:
		if r[0] == id:
			out.append(r[1])
		elif r[1] == id:
			out.append(r[0])
	return out


func is_unlocked(id: String) -> bool:
	return _unlocked.has(id)


func is_complete(id: String) -> bool:
	return _completed.has(id)


func all_complete() -> bool:
	return _completed.size() == _order.size()


# Marks a zone complete and unlocks its neighbours. Returns false if the zone is locked
# or unknown; completing an already-complete zone is a no-op that returns true.
func complete(id: String) -> bool:
	if not is_unlocked(id):
		return false
	if _completed.has(id):
		return true
	_completed[id] = true
	for n in neighbours(id):
		if not _unlocked.has(n):
			_unlocked[n] = true
			zone_unlocked.emit(n)
	return true


# Completes `id` when the given ZoneRun completes.
func bind_run(id: String, run) -> void:
	run.completed.connect(func(): complete(id))
