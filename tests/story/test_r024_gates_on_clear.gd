extends "res://harness/test_case.gd"

const ZonePlay = preload("res://scripts/core/zone_play.gd")
const ZoneGrid = preload("res://scripts/core/zone_grid.gd")
const Inventory = preload("res://scripts/core/inventory.gd")

var plays: Array = []


func after_test() -> void:
	for p in plays:
		p.free_nodes()


func _play(zone: String):
	var p = ZonePlay.create(ZoneGrid.load_zone(zone), Inventory.new())
	plays.append(p)
	return p


func _kill(p, thrall) -> void:
	thrall.take_damage(9999)
	p.tick(0.016, Vector2.ZERO)


func test_gates_open_once_every_thrall_is_dead() -> void:
	for zone in ["pine", "keep", "volcano", "bog", "cavern"]:
		var p = _play(zone)
		assert_true(not p.grid.gates_open, "%s starts shut" % zone)
		for i in p.enemies.size() - 1:
			_kill(p, p.enemies[i])
		assert_true(not p.grid.gates_open, "%s still shut with one thrall left" % zone)
		_kill(p, p.enemies[-1])
		assert_true(p.grid.gates_open, "%s open once they are all dead" % zone)
		p.grid.cells_of("G").map(func(c): assert_true(p.grid.is_walkable(c), "%s gate walkable" % zone))


func test_the_tundra_keeps_its_hold_rule() -> void:
	var p = _play("tundra")
	for e in p.enemies:
		_kill(p, e)
	assert_true(not p.grid.gates_open, "killing the raiders does not open the bridge gate")


func test_gates_stay_open_and_a_dead_wizard_does_not_open_them() -> void:
	var p = _play("pine")
	p.wizard.take_damage(9999)
	p.tick(0.016, Vector2.ZERO)
	assert_eq(p.state, "dead", "dead")
	for e in p.enemies:
		e.take_damage(9999)
	p.tick(0.016, Vector2.ZERO)
	assert_true(not p.grid.gates_open, "a finished zone no longer ticks")
