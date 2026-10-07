class_name SpellQueue
extends RefCounted
## A small first-in-first-out queue of spells waiting to be cast. Pure data: no input, no UI.

signal changed
signal rejected_full(spell: Spell)

var max_size := 4
var _items: Array[Spell] = []


func size() -> int:
	return _items.size()


func is_empty() -> bool:
	return _items.is_empty()


func is_full() -> bool:
	return _items.size() >= max_size


## Appends a spell. Returns false (and emits rejected_full) if the queue is full.
func push(spell: Spell) -> bool:
	if is_full():
		rejected_full.emit(spell)
		return false
	_items.append(spell)
	changed.emit()
	return true


## The spell that will be cast next, or null.
func peek() -> Spell:
	return null if _items.is_empty() else _items[0]


## Removes and returns the oldest spell, or null if empty.
func pop_next() -> Spell:
	if _items.is_empty():
		return null
	var s: Spell = _items.pop_front()
	changed.emit()
	return s


func clear() -> void:
	if _items.is_empty():
		return
	_items.clear()
	changed.emit()


func to_array() -> Array[Spell]:
	return _items.duplicate()
