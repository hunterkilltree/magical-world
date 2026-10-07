# Helpers for killing bosses in tests without hard-coding their health.
extends RefCounted

const SpellBook = preload("res://scripts/core/spell_book.gd")
const RECIPES := [["fire", "fire"], ["fire", "ice"], ["water", "water"], ["fire", "nature"]]  # all aoe


# Casts aoe spells from `origin` (clearing cooldowns between casts) until `boss` is dead.
static func burn_down(caster, origin: Vector2, boss, max_casts := 80) -> int:
	var n := 0
	while not boss.health.is_dead() and n < max_casts:
		caster.update(30.0)
		caster.cast(SpellBook.find(RECIPES[n % RECIPES.size()]), origin, [boss])
		n += 1
	return n


# The same through a ZonePlay (its queue, caster, boost and state).
static func burn_down_play(play, max_casts := 80) -> int:
	var n := 0
	while not play.boss.health.is_dead() and n < max_casts and play.state == "playing":
		play.caster.update(30.0)
		var r: Array = RECIPES[n % RECIPES.size()]
		play.queue_element(r[0])
		play.queue_element(r[1])
		play.cast()
		n += 1
	return n
