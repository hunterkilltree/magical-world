# Up to two queued elements; order matters. Casting resolves the recipe and clears the queue.
extends RefCounted

const MAX := 2
const SpellBook = preload("res://scripts/core/spell_book.gd")

var queue: Array = []


func push(element: String) -> bool:
	if queue.size() >= MAX or not element in SpellBook.elements():
		return false
	queue.append(element)
	return true


func clear() -> void:
	queue.clear()


# Returns the resolved spell (or a fallback bolt of the first element) and clears the queue.
# Empty queue returns {}.
func resolve() -> Dictionary:
	if queue.is_empty():
		return {}
	var spell := SpellBook.find(queue)
	if spell.is_empty():
		spell = SpellBook.fallback_bolt(queue[0])
	clear()
	return spell
