extends "res://harness/test_case.gd"

const ZonePlay = preload("res://scripts/core/zone_play.gd")
const ZoneGrid = preload("res://scripts/core/zone_grid.gd")
const Inventory = preload("res://scripts/core/inventory.gd")
const Caster = preload("res://scripts/core/caster.gd")

var play


func before_each() -> void:
	play = ZonePlay.create(ZoneGrid.load_zone("tundra"), Inventory.new())


func after_test() -> void:
	play.free_nodes()


func test_a_beam_leaves_a_streak_along_the_facing() -> void:
	play.wizard.facing = Vector2.UP
	play.queue_element("fire")
	play.queue_element("lightning")
	play.cast()
	var e: Dictionary = play.effects[0]
	assert_eq(e["kind"], "beam", "beam")
	assert_eq(e["dir"], Vector2.UP, "along the facing")
	assert_eq(e["length"], Caster.BEAM_LENGTH, "its full length")
	assert_eq(e["radius"], 40.0, "plasma spear's width")
	assert_eq(e["color"], Color("#f97316"), "fire orange")


func test_other_spells_leave_a_circle() -> void:
	play.queue_element("fire")
	play.queue_element("fire")
	play.cast()
	assert_eq(play.effects[0]["kind"], "circle", "supernova is a circle")
