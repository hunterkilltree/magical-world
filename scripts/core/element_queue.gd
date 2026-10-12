# Up to five queued elements. The first two pick the recipe (exact order first, then the
# reversed pair); every element after them is an infusion that strengthens the spell.
# Casting resolves the queue and clears it.
extends RefCounted

const MAX := 5
const INFUSION_DAMAGE := 0.25  # per infusion
const INFUSION_RADIUS := 0.15  # per infusion of an element already in the recipe
const INFUSION_COOLDOWN := 0.5  # seconds per infusion
const SpellBook = preload("res://scripts/core/spell_book.gd")

var queue: Array = []


func push(element: String) -> bool:
	if queue.size() >= MAX or not element in SpellBook.elements():
		return false
	queue.append(element)
	return true


func clear() -> void:
	queue.clear()


# The spell `elements` would cast, without touching any queue: a copy of the recipe (or a
# fallback bolt of the first element) with infused damage, radius and cooldown, plus
# `infusions`. Empty input returns {}.
static func spell_for(elements: Array) -> Dictionary:
	if elements.is_empty():
		return {}
	var spell := {}
	if elements.size() >= 2:
		var pair := elements.slice(0, 2)
		spell = SpellBook.find(pair)
		if spell.is_empty():
			pair.reverse()
			spell = SpellBook.find(pair)
	if spell.is_empty():
		spell = SpellBook.fallback_bolt(elements[0])
	spell = spell.duplicate(true)
	var base_elements: Array = spell.get("recipe", [elements[0]])
	var extra := elements.slice(2)
	var matching := extra.filter(func(e): return e in base_elements).size()
	spell["infusions"] = extra.size()
	spell["damage"] = int(round(float(spell["damage"]) * (1.0 + INFUSION_DAMAGE * extra.size())))
	spell["radius"] = float(spell["radius"]) * (1.0 + INFUSION_RADIUS * matching)
	spell["cooldown"] = float(spell["cooldown"]) + INFUSION_COOLDOWN * extra.size()
	return spell


# Returns the resolved spell and clears the queue. Empty queue returns {}.
func resolve() -> Dictionary:
	var spell := spell_for(queue)
	clear()
	return spell
