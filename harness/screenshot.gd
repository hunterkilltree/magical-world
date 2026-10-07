# Renders the main scene in a given state and saves a PNG. Needs a display (e.g. xvfb-run).
# Usage: xvfb-run -a godot --path . --script res://harness/screenshot.gd -- <menu|overworld|zone:<id>> <out.png> [wizard_id] [cast]
extends SceneTree


func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	var what: String = args[0] if args.size() > 0 else "menu"
	var out: String = args[1] if args.size() > 1 else "/tmp/shot.png"
	var main = load("res://scenes/main.tscn").instantiate()
	main.save_path = "user://screenshot_save.json"
	root.add_child(main)
	main.start()
	if what != "menu":
		main.new_game()
		if args.size() > 2 and args[2] != "":
			main.session.select_wizard(args[2])
		if what.begins_with("zone:"):
			var zone := what.substr(5)
			main.session.campaign.restore(["tundra", "pine", "keep", "volcano", "bog"])
			main.enter_zone(zone)
			for i in 20:
				main.tick(0.016, Vector2.ZERO)
			if args.size() > 3 and args[3] == "cast":
				main.play.queue_element("fire")
				main.play.queue_element("fire")
				main.play.cast()
				main.tick(0.05, Vector2.ZERO)
	for i in 3:
		await process_frame
	var img := root.get_texture().get_image()
	img.save_png(out)
	print("saved ", out, " ", img.get_size())
	quit(0)
