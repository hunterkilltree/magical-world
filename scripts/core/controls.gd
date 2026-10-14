# Key and mouse bindings, installed into the InputMap at start-up (README "Input Map"):
# WASD/arrows move, the mouse aims, 1-9 and 0 queue fire/water/ice/lightning/earth/arcane/nature/wind/
# light/dark, left click
# casts (hold to recast), right click or E casts around you, F on yourself, Space or Shift
# dodges, X or Backspace clears, Esc or P pauses, R restarts, M mutes the sound.
extends RefCounted

const ELEMENT_KEYS := {
	"fire": [KEY_1, KEY_KP_1], "water": [KEY_2, KEY_KP_2], "ice": [KEY_3, KEY_KP_3],
	"lightning": [KEY_4, KEY_KP_4], "earth": [KEY_5, KEY_KP_5], "arcane": [KEY_6, KEY_KP_6],
	"nature": [KEY_7, KEY_KP_7], "wind": [KEY_8, KEY_KP_8], "light": [KEY_9, KEY_KP_9], "dark": [KEY_0, KEY_KP_0],
}
const KEYS := {
	"move_left": [KEY_A, KEY_LEFT], "move_right": [KEY_D, KEY_RIGHT],
	"move_up": [KEY_W, KEY_UP], "move_down": [KEY_S, KEY_DOWN],
	"cast_area": [KEY_E], "cast_self": [KEY_F], "dodge": [KEY_SPACE, KEY_SHIFT],
	"clear": [KEY_X, KEY_BACKSPACE], "pause": [KEY_ESCAPE, KEY_P], "restart": [KEY_R],
	"mute": [KEY_M],
}
const MOUSE := {"cast": MOUSE_BUTTON_LEFT, "cast_area": MOUSE_BUTTON_RIGHT}
# What the HUD lists, in order.
const HELP := [
	["W A S D", "Move"], ["Mouse", "Aim"], ["1 - 0", "Queue an element (up to 3)"],
	["Left click", "Cast at cursor, hold to recast"], ["Right click / E", "Cast as an area around you"],
	["F", "Cast on yourself"], ["Space", "Dodge roll (brief invulnerability)"], ["X", "Clear queue"],
	["Esc", "Pause"], ["R", "Restart (paused or fallen)"], ["M", "Mute sound"],
]


static func install() -> void:
	for el in ELEMENT_KEYS:
		_add("el_" + el, ELEMENT_KEYS[el])
	for action in KEYS:
		_add(action, KEYS[action])
	for action in MOUSE:
		if not InputMap.has_action(action):
			InputMap.add_action(action)
		var ev := InputEventMouseButton.new()
		ev.button_index = MOUSE[action]
		if not InputMap.action_has_event(action, ev):
			InputMap.action_add_event(action, ev)


static func _add(action: String, keys: Array) -> void:
	if not InputMap.has_action(action):
		InputMap.add_action(action)
	for k in keys:
		var ev := InputEventKey.new()
		ev.physical_keycode = k
		if not InputMap.action_has_event(action, ev):
			InputMap.action_add_event(action, ev)


# The sim action an input event triggers ("el:fire", "cast", "nova", ...), or "".
static func action_for(event: InputEvent) -> String:
	if event is InputEventKey and (not event.pressed or event.echo):
		return ""
	if event is InputEventMouseButton and not event.pressed:
		return ""
	for el in ELEMENT_KEYS:
		if event.is_action("el_" + el):
			return "el:" + el
	for pair in [["cast", "cast"], ["cast_area", "nova"], ["cast_self", "self"], ["dodge", "dodge"],
			["clear", "clear"], ["pause", "pause"], ["restart", "restart"], ["mute", "mute"]]:
		if event.is_action(pair[0]):
			return pair[1]
	return ""


static func move_vector() -> Vector2:
	return Vector2(Input.get_axis("move_left", "move_right"), Input.get_axis("move_up", "move_down"))
