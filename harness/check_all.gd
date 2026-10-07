# Parses every .gd file under res:// and fails if any cannot be loaded.
# Usage: godot --headless --path . --script res://harness/check_all.gd
extends SceneTree

const SKIP_DIRS := [".godot", ".git", "addons"]


func _initialize() -> void:
	var files := _collect("res://")
	files.sort()
	var failed := 0
	for path in files:
		if path == get_script().resource_path:
			continue # reloading the running script crashes the engine
		var script = ResourceLoader.load(path, "", ResourceLoader.CACHE_MODE_IGNORE)
		if script == null or (script is GDScript and not script.can_instantiate()):
			printerr("CHECK FAIL: ", path)
			failed += 1
	print("check_all: %d scripts, %d failed" % [files.size(), failed])
	quit(1 if failed > 0 else 0)


func _collect(dir_path: String) -> Array:
	var out := []
	var dir := DirAccess.open(dir_path)
	if dir == null:
		return out
	for sub in dir.get_directories():
		if not SKIP_DIRS.has(sub) and not sub.begins_with("."):
			out.append_array(_collect(dir_path.path_join(sub)))
	for f in dir.get_files():
		if f.ends_with(".gd"):
			out.append(dir_path.path_join(f))
	return out
