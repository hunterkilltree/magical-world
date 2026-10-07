class_name Spell
extends Resource
## Data for one spell. Spells are plain Resources (resources/spells/*.tres), so they can be
## tuned in the Godot inspector without touching code.

enum EffectType {
	PROJECTILE,  ## flies in a line and hits the first enemy (Frost Bolt, Fire Bolt, ...)
	NOVA,        ## instant ring around the caster
	LIGHTNING,   ## instant strike at range
	HEAL,        ## restores the caster's HP
	SHIELD,      ## absorbs damage for a while
}

@export var id: StringName = &""
@export var display_name := ""
@export_multiline var description := ""
## The key that queues this spell (physical key; see the spell_* actions in the Input Map).
@export var keyboard_key: Key = KEY_NONE
## Colour used for the HUD icon and for the projectile / effect.
@export var icon_color := Color.WHITE

@export_group("Combat")
## Damage dealt. For HEAL it is the amount healed, for SHIELD the damage absorbed.
@export var damage := 10.0
@export var projectile_speed := 0.0
@export var cooldown := 0.5
## How far the spell reaches (named cast_range so it does not shadow GDScript's range()).
@export var cast_range := 0.0
@export var effect_type: EffectType = EffectType.PROJECTILE
@export var projectile_radius := 6.0
## Radius of NOVA / SHIELD effects.
@export var area_radius := 0.0


func get_key_label() -> String:
	return OS.get_keycode_string(keyboard_key)


## The Input Map action that queues this spell, e.g. &"spell_q".
func get_input_action() -> StringName:
	return StringName("spell_" + get_key_label().to_lower())
