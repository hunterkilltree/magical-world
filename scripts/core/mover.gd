# Grid-collision movement shared by the wizard and enemies.
extends RefCounted


static func move(grid, pos: Vector2, velocity: Vector2, delta: float, radius := 10.0) -> Vector2:
	var cand := Vector2(pos.x + velocity.x * delta, pos.y)
	if grid == null or grid.can_stand(cand, radius):
		pos = cand
	cand = Vector2(pos.x, pos.y + velocity.y * delta)
	if grid == null or grid.can_stand(cand, radius):
		pos = cand
	return pos
