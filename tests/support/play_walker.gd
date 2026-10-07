# Steers a ZonePlay's wizard along a BFS path using the real tick loop.
extends RefCounted

const DT := 1.0 / 60.0


static func walk_to(t, play, target: Vector2i, avoid: Array = []) -> bool:
	var g = play.grid
	var path: Array = g.find_path(g.world_to_cell(play.wizard.position), target, avoid)
	t.assert_true(not path.is_empty(), "path to %s exists" % target)
	for cell in path:
		var goal: Vector2 = g.cell_center(cell)
		var guard := 0
		while play.state == "playing" and play.wizard.position.distance_to(goal) > 3.0 and guard < 600:
			play.tick(DT, (goal - play.wizard.position).normalized())
			guard += 1
	return not path.is_empty()
