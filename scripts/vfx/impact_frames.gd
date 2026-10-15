# Impact frames (R-074, port of wow.js): two frames of high contrast on the biggest hits, the first
# inverted and the second hard black and white, at most one burst every 0.4 s. A full-screen
# ColorRect on a CanvasLayer above the 3D view and below the HUD; the director steps it with
# update(dt), so tick() drives it like everything else.
# Triggers: a slam release of weight >= 0.85, a combo's first cast, a big explosion, a crit,
# the player's death (forced).
extends CanvasLayer

const SHADER := preload("res://shaders/impact_frame.gdshader")
const COOLDOWN := 0.4

var rect: ColorRect
var frames_left := 0
var cooldown := 0.0
var bursts := 0 # tests: how many bursts have fired
var mode := 0.0
var strength := 0.0
var reduced_motion := false


func _init() -> void:
	layer = 6
	rect = ColorRect.new()
	rect.set_anchors_preset(Control.PRESET_FULL_RECT)
	rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var m := ShaderMaterial.new()
	m.shader = SHADER
	m.set_shader_parameter("strength", 0.0)
	rect.material = m
	rect.visible = false
	add_child(rect)


func trigger(color: Color, force := false) -> void:
	if reduced_motion or (cooldown > 0.0 and not force):
		return
	frames_left = 2
	cooldown = COOLDOWN
	bursts += 1
	(rect.material as ShaderMaterial).set_shader_parameter("tint", Color(color.r, color.g, color.b))


func update(dt: float) -> void:
	cooldown -= dt
	var m := rect.material as ShaderMaterial
	if frames_left > 0:
		strength = 1.0
		mode = 0.0 if frames_left == 2 else 1.0
		frames_left -= 1
	else:
		strength = 0.0
	m.set_shader_parameter("strength", strength)
	m.set_shader_parameter("mode", mode)
	rect.visible = strength > 0.0
