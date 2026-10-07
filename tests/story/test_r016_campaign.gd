extends "res://harness/test_case.gd"

const Campaign = preload("res://scripts/core/campaign.gd")
const ZoneGrid = preload("res://scripts/core/zone_grid.gd")
const ZoneRun = preload("res://scripts/core/zone_run.gd")
const Inventory = preload("res://scripts/core/inventory.gd")

const ALL := ["tundra", "pine", "keep", "volcano", "bog", "cavern"]


func _unlocked(c) -> Array:
	var out := []
	for z in ALL:
		if c.is_unlocked(z):
			out.append(z)
	return out


func test_graph_data_is_sound() -> void:
	var c = Campaign.new()
	assert_eq(c.zone_ids(), ALL, "six zones in order")
	for r in c.routes:
		assert_true(r[0] in ALL and r[1] in ALL, "route %s references known zones" % [r])
	# Every zone is reachable from the start by following routes.
	var seen := {"tundra": true}
	var queue := ["tundra"]
	while not queue.is_empty():
		var z: String = queue.pop_front()
		for n in c.neighbours(z):
			if not seen.has(n):
				seen[n] = true
				queue.append(n)
	assert_eq(seen.size(), 6, "graph is connected")


func test_only_the_first_zone_starts_unlocked() -> void:
	var c = Campaign.new()
	assert_eq(_unlocked(c), ["tundra"], "start")


func test_completing_a_zone_unlocks_its_neighbours_only() -> void:
	var c = Campaign.new()
	assert_true(c.complete("tundra"), "tundra completes")
	assert_eq(_unlocked(c), ["tundra", "pine"], "pine unlocked")
	assert_true(not c.is_unlocked("keep"), "keep still locked")


func test_cannot_complete_a_locked_zone() -> void:
	var c = Campaign.new()
	assert_true(not c.complete("keep"), "keep is locked")
	assert_eq(_unlocked(c), ["tundra"], "nothing unlocked by the attempt")
	assert_true(not c.is_complete("keep"), "not complete")


func test_pine_opens_both_keep_and_bog() -> void:
	var c = Campaign.new()
	c.complete("tundra")
	c.complete("pine")
	assert_true(c.is_unlocked("keep") and c.is_unlocked("bog"), "keep and bog")
	assert_true(not c.is_unlocked("cavern"), "cavern still locked")


func test_cavern_stays_locked_until_the_bog_is_complete() -> void:
	var c = Campaign.new()
	for z in ["tundra", "pine", "keep", "volcano"]:
		assert_true(c.complete(z), z)
	assert_true(not c.is_unlocked("cavern"), "bog not done yet")
	assert_true(c.complete("bog"), "bog")
	assert_true(c.is_unlocked("cavern"), "cavern opens")
	assert_true(c.complete("cavern"), "cavern")
	assert_true(c.all_complete(), "campaign finished")


func test_unlock_signalled_once_and_completing_twice_is_harmless() -> void:
	var c = Campaign.new()
	var got := []
	c.zone_unlocked.connect(func(id): got.append(id))
	c.complete("tundra")
	c.complete("tundra")
	assert_eq(got, ["pine"], "pine announced once")


func test_a_finished_zone_run_advances_the_campaign() -> void:
	var c = Campaign.new()
	var run = ZoneRun.new(ZoneGrid.load_zone("tundra"), Inventory.new())
	c.bind_run("tundra", run)
	assert_true(not c.is_unlocked("pine"), "not yet")
	run.completed.emit()
	assert_true(c.is_complete("tundra") and c.is_unlocked("pine"), "run completion drives the campaign")
