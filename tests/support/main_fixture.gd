# Builds the real main scene under the test tree, in play mode with the first wave held back.
extends RefCounted

const DT := 1.0 / 60.0


static func make(tree: SceneTree, mode := "play"):
	var main = load("res://scenes/main.tscn").instantiate()
	tree.root.add_child(main)
	main.start()
	main.new_game(mode)
	main.sim.wave_t = 1e9
	return main


static func frames(main, n: int, inp := {}) -> Array:
	var out := []
	for i in n:
		out.append_array(main.tick(DT, inp if i == 0 else {"move": inp.get("move", Vector2.ZERO), "aim": inp.get("aim", main.aim)}))
	return out
