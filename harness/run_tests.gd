# Runs every tests/test_*.gd. Exit code 1 if any test fails.
# Usage: godot --headless --path . --script res://harness/run_tests.gd
# Optional filter: ... -- test_player   (substring match on file name)
extends SceneTree

const TEST_DIR := "res://tests"


func _initialize() -> void:
	var filter := ""
	var args := OS.get_cmdline_user_args()
	if args.size() > 0:
		filter = args[0]

	var passed := 0
	var failed := 0
	for file in _test_files(filter):
		var script = load(TEST_DIR.path_join(file))
		if script == null or not script.can_instantiate():
			printerr("FAIL  %s (script does not load)" % file)
			failed += 1
			continue
		for m in script.get_script_method_list():
			if not String(m.name).begins_with("test_"):
				continue
			var t = script.new()
			t.tree = self
			t.before_each()
			t.call(m.name)
			if t.failures.is_empty():
				passed += 1
				print("PASS  %s::%s" % [file, m.name])
			else:
				failed += 1
				printerr("FAIL  %s::%s" % [file, m.name])
				for f in t.failures:
					printerr("      ", f)
	print("tests: %d passed, %d failed" % [passed, failed])
	quit(1 if failed > 0 else 0)


func _test_files(filter: String) -> Array[String]:
	var out: Array[String] = []
	var dir := DirAccess.open(TEST_DIR)
	if dir == null:
		return out
	for f in dir.get_files():
		if f.begins_with("test_") and f.ends_with(".gd") and (filter == "" or filter in f):
			out.append(f)
	out.sort()
	return out
