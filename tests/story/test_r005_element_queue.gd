extends "res://harness/test_case.gd"

const ElementQueue = preload("res://scripts/core/element_queue.gd")


func test_queue_holds_two_elements_in_order() -> void:
	var q = ElementQueue.new()
	assert_true(q.push("fire"), "first")
	assert_true(q.push("ice"), "second")
	assert_true(not q.push("water"), "third is rejected")
	assert_eq(q.queue, ["fire", "ice"], "queue contents")


func test_unknown_element_rejected() -> void:
	var q = ElementQueue.new()
	assert_true(not q.push("cheese"), "unknown element")


func test_fire_then_ice_is_thermal_shock_and_queue_clears() -> void:
	var q = ElementQueue.new()
	q.push("fire")
	q.push("ice")
	assert_eq(q.resolve()["id"], "thermal_shock", "spell")
	assert_eq(q.queue.size(), 0, "cleared")


func test_order_matters() -> void:
	var q = ElementQueue.new()
	q.push("water")
	q.push("earth")
	assert_eq(q.resolve()["id"], "mud_prison", "water+earth")
	q.push("earth")
	q.push("water")
	assert_eq(q.resolve()["id"], "mountain_rise", "earth+water")


func test_unknown_pair_falls_back_to_bolt_of_first_element() -> void:
	var q = ElementQueue.new()
	q.push("earth")
	q.push("earth")
	var s: Dictionary = q.resolve()
	assert_eq(s["id"], "bolt_earth", "fallback bolt")
	assert_true(s["fallback"], "marked fallback")


func test_single_element_and_empty_queue() -> void:
	var q = ElementQueue.new()
	assert_eq(q.resolve(), {}, "empty queue")
	q.push("fire")
	assert_eq(q.resolve()["id"], "bolt_fire", "single element bolt")
