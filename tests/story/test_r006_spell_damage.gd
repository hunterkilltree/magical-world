extends "res://harness/test_case.gd"

const Caster = preload("res://scripts/core/caster.gd")
const SpellBook = preload("res://scripts/core/spell_book.gd")


class Dummy:
	extends RefCounted
	var position := Vector2.ZERO
	var hp := 1000
	func take_damage(n: int) -> void:
		hp -= n


func _supernova() -> Dictionary:
	return SpellBook.find(["fire", "fire"])  # aoe, radius 180, damage 850, cooldown 8


func test_aoe_hits_only_targets_in_radius_once() -> void:
	var near := Dummy.new()
	near.position = Vector2(100, 0)
	var far := Dummy.new()
	far.position = Vector2(500, 0)
	var c = Caster.new()
	var hits: int = c.cast(_supernova(), Vector2.ZERO, [near, far])
	assert_eq(hits, 1, "hits")
	assert_eq(near.hp, 150, "near took damage once")
	assert_eq(far.hp, 1000, "far untouched")


func test_cooldown_blocks_recast_until_elapsed() -> void:
	var c = Caster.new()
	var d := Dummy.new()
	assert_eq(c.cast(_supernova(), Vector2.ZERO, [d]), 1, "first cast")
	assert_eq(c.cast(_supernova(), Vector2.ZERO, [d]), -1, "on cooldown")
	c.update(7.9)
	assert_eq(c.cast(_supernova(), Vector2.ZERO, [d]), -1, "still cooling")
	c.update(0.2)
	assert_eq(c.cast(_supernova(), Vector2.ZERO, [d]), 1, "ready again")


func test_cooldowns_are_per_spell() -> void:
	var c = Caster.new()
	var d := Dummy.new()
	c.cast(_supernova(), Vector2.ZERO, [d])
	assert_eq(c.cast(SpellBook.find(["water", "water"]), Vector2.ZERO, [d]), 1, "different spell")
