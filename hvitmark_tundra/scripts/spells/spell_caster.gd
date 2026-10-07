class_name SpellCaster
extends Node
## Turns keyboard input into queue changes. Child of the Player.
##
##   Q W E R T / A S D F   queue a spell (up to the queue's max_size)
##   SPACE                 take the next spell off the queue and "cast" it
##   ESC                   clear the queue
##
## Milestone 1: casting only dequeues the spell and emits spell_cast; the projectile / effect
## systems that react to that signal arrive in the next milestone.

signal queue_changed(spells: Array[Spell])
signal spell_queued(spell: Spell)
signal queue_rejected(spell: Spell)
signal spell_cast(spell: Spell)
signal cast_failed_empty
signal queue_cleared

## When true, W/A/S/D only queue a spell while Shift is held (they are movement keys then).
var wasd_needs_shift := false

var queue := SpellQueue.new()


func _init() -> void:
	queue.changed.connect(func() -> void: queue_changed.emit(queue.to_array()))
	queue.rejected_full.connect(func(s: Spell) -> void: queue_rejected.emit(s))


func _unhandled_input(event: InputEvent) -> void:
	if handle_event(event) and is_inside_tree():
		get_viewport().set_input_as_handled()


## Returns true if the event did something. Public so it can be driven from tests.
func handle_event(event: InputEvent) -> bool:
	if event.is_action_pressed("cast_spell"):
		cast_next()
		return true
	if event.is_action_pressed("clear_queue"):
		clear_queue()
		return true
	for spell in SpellDatabase.all():
		if event.is_action_pressed(spell.get_input_action()):
			if _blocked_by_movement(spell, event):
				continue
			queue_spell(spell)
			return true
	return false


func queue_spell(spell: Spell) -> bool:
	if not queue.push(spell):
		return false
	spell_queued.emit(spell)
	return true


## Dequeues the next spell and announces it. Returns it, or null if the queue was empty.
func cast_next() -> Spell:
	var spell := queue.pop_next()
	if spell == null:
		cast_failed_empty.emit()
		return null
	spell_cast.emit(spell)
	return spell


func clear_queue() -> void:
	if queue.is_empty():
		return
	queue.clear()
	queue_cleared.emit()


func _blocked_by_movement(spell: Spell, event: InputEvent) -> bool:
	if not wasd_needs_shift or not SpellDatabase.MOVEMENT_CLASH_KEYS.has(spell.keyboard_key):
		return false
	return not (event is InputEventKey and (event as InputEventKey).shift_pressed)
