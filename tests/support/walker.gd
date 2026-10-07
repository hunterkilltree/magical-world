# Shared scripted-wizard simulation for zone-run tests.
extends RefCounted

const DT := 1.0 / 60.0


# Walks wizard `p` along the BFS path to `target`, ticking gates, the run and enemies.
# `t` is the calling test (for assertions). Returns false if no path exists.
static func walk_to(t, p, g, run, target: Vector2i, avoid: Array = [], enemies: Array = []) -> bool:
	var path: Array = g.find_path(g.world_to_cell(p.position), target, avoid)
	t.assert_true(not path.is_empty(), "path to %s exists" % target)
	for cell in path:
		var goal: Vector2 = g.cell_center(cell)
		var guard := 0
		while p.position.distance_to(goal) > 3.0 and guard < 600:
			p.step(DT, (goal - p.position).normalized())
			g.update_gate_hold(g.world_to_cell(p.position), DT)
			for e in enemies:
				e.step(DT, p)
			run.update(g.world_to_cell(p.position))
			guard += 1
	return not path.is_empty()
