extends "res://harness/test_case.gd"

const ZonePlay = preload("res://scripts/core/zone_play.gd")
const ZoneGrid = preload("res://scripts/core/zone_grid.gd")
const Inventory = preload("res://scripts/core/inventory.gd")
const PlayWalker = preload("res://tests/support/play_walker.gd")

var plays: Array = []


func after_test() -> void:
	for p in plays:
		p.free_nodes()


func _play(zone: String, inv = null):
	var p = ZonePlay.create(ZoneGrid.load_zone(zone), inv if inv != null else Inventory.new())
	plays.append(p)
	return p


# A competent defender: whenever a live thrall is close, cast the next spell in a rotation.
func _defend(p, rotation: Array, step: int) -> int:
	for e in p.enemies:
		if not e.health.is_dead() and e.position.distance_to(p.wizard.position) < 120.0:
			var recipe: Array = rotation[step % rotation.size()]
			p.queue_element(recipe[0])
			p.queue_element(recipe[1])
			if p.cast() >= 0:
				step += 1
			break
	return step


func test_spawns_wizard_thralls_and_boss() -> void:
	var tundra = _play("tundra")
	assert_eq(tundra.grid.tile_at(tundra.grid.world_to_cell(tundra.wizard.position)), "S", "wizard on the entry")
	assert_eq(tundra.enemies.size(), 2, "two thralls")
	assert_true(tundra.boss == null, "no boss in the tundra")
	assert_eq(tundra.state, "playing", "playing")
	var keep = _play("keep")
	assert_true(keep.boss != null, "the Warden of the Keep")
	assert_eq(_play("cavern").enemies.size(), 1, "one thrall in the cavern")


func test_stepping_on_a_cache_opens_it_once() -> void:
	var p = _play("pine")
	var cache: Vector2i = p.grid.cells_of("C")[0]
	p.wizard.position = p.grid.cell_center(cache)
	p.tick(0.016, Vector2.ZERO)
	assert_true(p.grid.is_looted(cache), "opened")
	assert_true(p.inventory.has_item("rune_fragment_1"), "fragment collected")
	p.tick(0.016, Vector2.ZERO)
	assert_eq(p.inventory.items.size(), 1, "no second payout")


func test_zone_one_plays_through_the_real_tick_loop() -> void:
	var p = _play("tundra")
	var g = p.grid
	var cache: Vector2i = g.cells_of("C")[0]
	PlayWalker.walk_to(self, p, cache, ["~"])
	assert_true(g.is_looted(cache), "cache collected by walking onto it")
	var hold := Vector2i(-1, -1)
	for c in g.reachable_from(g.world_to_cell(p.wizard.position), ["~"]).keys():
		if c.y < 8 and g.in_hold_area(c):
			hold = c
			break
	PlayWalker.walk_to(self, p, hold, ["~"])
	var waited := 0.0
	var casts := 0
	var rotation := [["fire", "fire"], ["water", "water"], ["fire", "ice"]]
	while not g.gates_open and waited < 40.0 and p.state == "playing":
		p.tick(0.1, Vector2.ZERO)
		casts = _defend(p, rotation, casts)
		waited += 0.1
	assert_true(g.gates_open, "gates held open (health %d, %d casts)" % [p.wizard.health.current, casts])
	assert_true(casts > 0, "the hold needed fighting")
	PlayWalker.walk_to(self, p, p.run.exit_cells()[0], ["~"])
	assert_eq(p.state, "complete", "zone complete (wizard health %d)" % p.wizard.health.current)


func test_pine_plays_through_the_real_tick_loop() -> void:
	var p = _play("pine")
	PlayWalker.walk_to(self, p, p.grid.cells_of("C")[0], [])
	assert_eq(p.state, "complete", "pine complete (wizard health %d)" % p.wizard.health.current)
	assert_true(p.inventory.has_item("rune_fragment_1"), "fragment")


func test_wizard_death_ends_the_zone() -> void:
	var p = _play("tundra")
	p.wizard.take_damage(1000)
	p.tick(0.016, Vector2.ZERO)
	assert_eq(p.state, "dead", "dead")
	var before: Vector2 = p.wizard.position
	p.tick(1.0, Vector2.RIGHT)
	assert_eq(p.wizard.position, before, "a finished zone no longer ticks")


func test_the_dark_ends_the_bog() -> void:
	var p = _play("bog")
	p.run.tick(95.0)
	p.tick(0.0, Vector2.ZERO)
	assert_eq(p.state, "failed", "night fell")


func test_spells_hit_thralls_and_the_boss_and_finish_the_zone() -> void:
	var p = _play("keep")
	var thrall = p.enemies[0]
	p.wizard.position = thrall.position + Vector2(40, 0)
	p.queue_element("fire")
	p.queue_element("fire")
	assert_true(p.cast() >= 1, "supernova hits")
	assert_true(thrall.health.is_dead(), "thrall dead")
	p.wizard.position = p.boss.position + Vector2(40, 0)
	p.queue_element("fire")
	p.queue_element("ice")
	p.cast()
	assert_true(p.boss.health.is_dead(), "Warden dead")
	assert_eq(p.state, "complete", "keep complete")


func test_casting_is_blocked_by_cooldown_and_empty_queue() -> void:
	var p = _play("tundra")
	assert_eq(p.cast(), -1, "nothing queued")
	p.queue_element("fire")
	p.queue_element("fire")
	p.cast()
	p.queue_element("fire")
	p.queue_element("fire")
	assert_eq(p.cast(), -1, "supernova on cooldown")


func test_fire_spells_burn_destructible_tiles_in_range() -> void:
	var p = _play("pine")
	var cells: Array = p.grid.cells_of("D")
	var pile: Vector2i = cells[0]
	p.wizard.position = p.grid.cell_center(pile) + Vector2(0, 40)
	p.queue_element("fire")
	p.queue_element("fire")
	p.cast()
	assert_eq(p.grid.tile_at(pile), ".", "log pile burned")
	assert_eq(p.grid.tile_at(cells[1]), ".", "its neighbour burned too")


func test_ice_spells_do_not_burn_anything() -> void:
	var p = _play("pine")
	var pile: Vector2i = p.grid.cells_of("D")[0]
	p.wizard.position = p.grid.cell_center(pile) + Vector2(0, 40)
	p.queue_element("water")
	p.queue_element("water")
	p.cast()
	assert_eq(p.grid.tile_at(pile), "D", "water does not burn logs")
