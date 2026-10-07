extends "res://harness/test_case.gd"

const Health = preload("res://scripts/core/health.gd")
const Player = preload("res://scripts/player.gd")


func test_starts_at_100_and_never_below_zero() -> void:
	var h = Health.new()
	assert_eq(h.current, 100, "start")
	h.take_damage(30)
	assert_eq(h.current, 70, "after hit")
	h.take_damage(500)
	assert_eq(h.current, 0, "floor")


func test_died_fires_exactly_once() -> void:
	var h = Health.new()
	var count := [0]
	h.died.connect(func(): count[0] += 1)
	h.take_damage(100)
	h.take_damage(50)
	assert_eq(count[0], 1, "died count")
	assert_true(h.is_dead(), "dead")


func test_non_positive_damage_ignored() -> void:
	var h = Health.new()
	h.take_damage(0)
	h.take_damage(-20)
	assert_eq(h.current, 100, "unchanged")


func test_wizard_has_health() -> void:
	var p = Player.new()
	assert_eq(p.health.current, 100, "wizard health")
	p.take_damage(10)
	assert_eq(p.health.current, 90, "wizard hit")
	p.free()
