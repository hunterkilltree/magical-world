# Renders the main scene in a given state and saves a PNG. Needs a display (a desktop, or xvfb-run).
# Usage: godot --path . --script res://harness/screenshot.gd -- <menu|play|demo|combos|matrix|dead|pause|live> <out.png> [wizard_id]
# `live` starts a run and lets the real engine loop (input, physics, waves) go for five seconds.
extends SceneTree


func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	var what: String = args[0] if args.size() > 0 else "menu"
	var out: String = args[1] if args.size() > 1 else "user://shot.png"
	var main = load("res://scenes/main.tscn").instantiate()
	root.add_child(main)
	main.start()
	if args.size() > 2 and args[2] != "":
		main.hud._on_pick(args[2])
	await process_frame
	var dt := 1.0 / 60.0
	if what == "live":
		main.begin()
		for i in 300:
			await process_frame
	elif what != "menu":
		main.new_game("play")
		main.sim.wave_t = 1e9
		var p = main.sim.player
		if what == "demo" or what == "pause":
			# A mid-fight moment: a thrall winding up, a bulwark slamming, a hexcaller charging,
			# a storm pool, a stone wall, a burning brush patch and a Thunderflare in flight.
			p.pos = Vector2(0, 2)
			var th = main.sim.spawn("thrall", Vector2(-2.2, 0.2))
			var bw = main.sim.spawn("bulwark", Vector2(3.4, -1.0))
			var hx = main.sim.spawn("hexcaller", Vector2(-1, -7))
			for e in [th, bw, hx]:
				e.atk_cd = 0
			th.st.wet = 3
			bw.st.chill = 2
			main.sim._env_hit(main.sim.brush[0], ["fire"], false)
			for i in 30:
				main.tick(dt, {"aim": Vector2(0, -6)})
			main.tick(dt, {"aim": Vector2(1.5, -5), "actions": ["el:lightning", "el:water", "nova"]})
			main.tick(dt, {"aim": Vector2(0, -6), "actions": ["el:earth", "el:earth", "cast"]})
			for i in 30:
				main.tick(dt, {"aim": Vector2(0, -6)})
			main.sim.player.cd["cast"] = 0
			main.tick(dt, {"aim": Vector2(-1, -7), "actions": ["el:fire", "el:lightning", "cast"]})
			main.tick(dt, {"aim": Vector2(-1, -7), "actions": ["el:arcane", "el:ice"]})
			for i in 6:
				main.tick(dt, {"aim": Vector2(-1, -7)})
			if what == "pause":
				main.sim.stats["found"] = {"lightning+water": true, "earth+earth": true, "fire+lightning": true}
				main.tick(dt, {"actions": ["pause"]})
		elif what == "combos":
			# The new elements at work: a Black Hole pulling thralls, a living wall, a crystal wall,
			# a Photon Railgun and Meteor Shower falling.
			p.pos = Vector2(0, 3)
			for at in [Vector2(-5, -2), Vector2(-3.5, -3), Vector2(-4.5, -0.5), Vector2(4, -3), Vector2(6, -1)]:
				main.sim.spawn("thrall", at).atk_cd = 99
			main.sim.spawn("bulwark", Vector2(1, -5)).atk_cd = 99
			var casts := [[["dark", "dark"], Vector2(-4, -2)], [["earth", "nature"], Vector2(0, -2)],
				[["earth", "fire", "lightning"], Vector2(5, -2)], [["light", "lightning"], Vector2(5, -2)]]
			for c in casts:
				main.sim.player.cd["cast"] = 0
				main.sim.player.shape_cd = {}
				main.sim.player.energy = 100
				var acts := []
				for el in c[0]:
					acts.append("el:" + el)
				acts.append("cast")
				main.tick(dt, {"aim": c[1], "actions": acts})
				for i in 12:
					main.tick(dt, {"aim": c[1]})
			main.tick(dt, {"aim": Vector2(5, -2), "actions": ["el:nature", "el:water", "el:light"]})
		elif what == "matrix":
			# The effects matrix: Wildfire, a Black Hole, Steam Bomb, a Magnetic Field and the World Tree,
			# with frozen / burning / confused / rooted enemies showing their status rings.
			p.pos = Vector2(0, 4)
			var foes := []
			for at in [Vector2(-5, -3), Vector2(-3.8, -4.5), Vector2(4.5, -2), Vector2(6, -3.5), Vector2(1, -6), Vector2(-1.5, 0.5)]:
				var e = main.sim.spawn("thrall", at)
				e.atk_cd = 99
				foes.append(e)
			foes[0].st.frozen = 9
			foes[1].st.burn = 9
			foes[2].st.confuse = 9
			foes[3].st.root = 9
			foes[4].st.shock = 9
			foes[5].st.stun = 9
			var casts := [[["fire", "nature"], Vector2(-4.5, -3.5)], [["dark", "dark"], Vector2(5, -3)],
				[["fire", "water", "water"], Vector2(0, -6)], [["earth", "earth", "lightning"], Vector2(-1, 0)],
				[["nature", "nature"], Vector2(0, 4.5)]]
			for c in casts:
				main.sim.player.cd["cast"] = 0
				main.sim.player.shape_cd = {}
				main.sim.player.energy = 100
				var acts := []
				for el in c[0]:
					acts.append("el:" + el)
				acts.append("cast")
				main.tick(dt, {"aim": c[1], "actions": acts})
				for i in 10:
					main.tick(dt, {"aim": c[1]})
			for e in foes:
				e.speed = 0
			for i in 30:
				main.tick(dt, {"aim": Vector2(0, -6)})
		elif what == "dead":
			p.hp = 0
			for i in 90:
				main.tick(dt)
		else:
			for i in 60:
				main.tick(dt, {"move": Vector2(0.3, -1), "aim": Vector2(2, -6)})
	for i in 8:
		await process_frame
	var shot := root.get_texture().get_image()
	shot.save_png(out)
	print("saved ", out, " ", shot.get_size())
	quit(0)
