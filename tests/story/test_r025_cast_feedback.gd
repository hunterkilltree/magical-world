extends "res://harness/test_case.gd"

const ZonePlay = preload("res://scripts/core/zone_play.gd")
const ZoneGrid = preload("res://scripts/core/zone_grid.gd")
const Inventory = preload("res://scripts/core/inventory.gd")

var play


func before_each() -> void:
	play = ZonePlay.create(ZoneGrid.load_zone("tundra"), Inventory.new())


func after_test() -> void:
	play.free_nodes()


func test_a_cast_leaves_a_fading_effect_coloured_by_the_first_element() -> void:
	play.queue_element("fire")
	play.queue_element("fire")
	play.cast()
	assert_eq(play.effects.size(), 1, "one effect")
	var e: Dictionary = play.effects[0]
	assert_eq(e["radius"], 180.0, "supernova radius")
	assert_eq(e["color"], Color("#f97316"), "fire orange")
	assert_eq(e["pos"], play.wizard.position, "at the wizard")
	play.tick(0.3, Vector2.ZERO)
	assert_eq(play.effects.size(), 1, "still fading")
	assert_true(play.effects[0]["ttl"] < 0.4, "ttl counts down")
	play.tick(0.2, Vector2.ZERO)
	assert_eq(play.effects.size(), 0, "gone after 0.4 s")


func test_failed_casts_leave_nothing() -> void:
	assert_eq(play.cast(), -1, "empty queue")
	assert_eq(play.effects.size(), 0, "no effect")
	play.queue_element("fire")
	play.queue_element("fire")
	play.cast()
	play.tick(1.0, Vector2.ZERO)
	play.queue_element("fire")
	play.queue_element("fire")
	assert_eq(play.cast(), -1, "on cooldown")
	assert_eq(play.effects.size(), 0, "no second effect")
