# Parses every .gd file under res:// and fails if any cannot be loaded.
# Usage: godot --headless --path . --script res://harness/check_all.gd
extends SceneTree

const SKIP_DIRS := [".godot", ".git", "addons"]


func _initialize() -> void:
	var files: Array[String] = []
	_collect("res://", files)
	files.sort()
	var failed := 0
	for path in files:
		var script = ResourceLoader.load(path, "", ResourceLoader.CACHE_MODE_IGNORE)
		if script == null or (script is GDScript and not script.can_instantiate()):
			printerr("CHECK FAIL: ", path)
			failed += 1
	print("check_all: %d scripts, %d failed" % [files.size(), failed])
	quit(1 if failed > 0 else 0)


func _collect(dir_path: String, out: Array[String]) -> void:
	var dir := DirAccess.open(dir_path)
	if dir == null:
		return
	dir.list_dir_begin()
	var name := dir.get_next()
	while name != "":
		var full := dir_path.path_join(name)
		if dir.current_is_dir():
			if not name in SKIP_DIRS and not name.begins_with("."):
				_collect(full, out)
		elif name.ends_with(".gd"):
			out.append(full)
		name = dir.get_next()
	dir.list_dir_end()
