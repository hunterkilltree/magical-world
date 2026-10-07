class_name SpellDatabase
extends RefCounted
## Loads and indexes the Spell resources. Add a spell: create a .tres, add its path here,
## and give it a spell_* action in the Input Map.

const PATHS: Array[String] = [
	"res://resources/spells/frost_bolt.tres",
	"res://resources/spells/ice_lance.tres",
	"res://resources/spells/frost_nova.tres",
	"res://resources/spells/arcane_missile.tres",
	"res://resources/spells/glacial_burst.tres",
	"res://resources/spells/fire_bolt.tres",
	"res://resources/spells/lightning.tres",
	"res://resources/spells/heal.tres",
	"res://resources/spells/arcane_shield.tres",
]

## HUD layout: the keyboard rows, top to bottom.
const ROW_TOP: Array[Key] = [KEY_Q, KEY_W, KEY_E, KEY_R, KEY_T]
const ROW_BOTTOM: Array[Key] = [KEY_A, KEY_S, KEY_D, KEY_F]
## These keys are also WASD movement keys; see Player.wasd_movement.
const MOVEMENT_CLASH_KEYS: Array[Key] = [KEY_W, KEY_A, KEY_S, KEY_D]

static var _cache: Array[Spell] = []


static func all() -> Array[Spell]:
	if _cache.is_empty():
		for path in PATHS:
			_cache.append(load(path) as Spell)
	return _cache


static func for_key(key: Key) -> Spell:
	for s in all():
		if s.keyboard_key == key:
			return s
	return null


static func for_id(spell_id: StringName) -> Spell:
	for s in all():
		if s.id == spell_id:
			return s
	return null
