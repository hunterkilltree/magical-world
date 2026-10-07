# Renders the Main scene and saves a PNG. Needs a display (xvfb-run).
# Usage: xvfb-run -a godot --path . --rendering-driver opengl3 --script res://harness/screenshot.gd -- OUT.png [KEYS] [moveframes]
#   KEYS: letters to queue, e.g. QWFT      moveframes: physics frames of "walk north" first
extends SceneTree


func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	var out: String = args[0] if args.size() > 0 else "/tmp/shot.png"
	var keys: String = args[1] if args.size() > 1 else ""
	var move_frames: int = int(args[2]) if args.size() > 2 else 0
	var main = load("res://scenes/Main.tscn").instantiate()
	root.add_child(main)
	await process_frame
	if move_frames > 0:
		main.player.input_override = Vector2.UP
		for i in move_frames:
			await physics_frame
		main.player.input_override = Vector2.ZERO
	for ch in keys:
		var spell := SpellDatabase.for_key(OS.find_keycode_from_string(String(ch)))
		if spell != null:
			main.player.caster.queue_spell(spell)
	for i in 12:
		await process_frame
	var img := root.get_texture().get_image()
	img.save_png(out)
	print("saved ", out, " ", img.get_size())
	quit(0)
