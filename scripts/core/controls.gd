# Key bindings for the nine elements: letters in two rows (Q W E R T / A S D F), plus the
# digits 1-9 in element order. Space casts; those are handled by the main scene.
extends RefCounted

const SpellBook = preload("res://scripts/core/spell_book.gd")

const LAYOUT := [["fire", KEY_Q], ["water", KEY_W], ["earth", KEY_E], ["nature", KEY_R], ["lightning", KEY_T],
	["ice", KEY_A], ["wind", KEY_S], ["light", KEY_D], ["dark", KEY_F]]


static func key_for(element: String) -> int:
	for pair in LAYOUT:
		if pair[0] == element:
			return pair[1]
	return KEY_NONE


static func label(element: String) -> String:
	var k := key_for(element)
	return OS.get_keycode_string(k) if k != KEY_NONE else ""


# The element a key queues, or "" if it is not an element key.
static func element_for_keycode(code: int) -> String:
	for pair in LAYOUT:
		if pair[1] == code:
			return pair[0]
	var idx := code - KEY_1
	var elements := SpellBook.elements()
	if idx >= 0 and idx < elements.size():
		return elements[idx]
	return ""
