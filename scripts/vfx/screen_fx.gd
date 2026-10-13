# Full-screen post effects over the 3D view (port of wow.js's SCREEN pass): up to 6 shockwave
# ripples, 8 heat-haze sources, chromatic aberration and a colour flash capped at 0.18 alpha.
# Sits below the HUD. The director feeds it world points; it projects them every frame.
extends CanvasLayer

const SHADER := preload("res://shaders/screen_fx.gdshader")
const MAX_WAVES := 6
const MAX_HEAT := 8
const FLASH_CAP := 0.18

var rect: ColorRect
var waves: Array = [] # {at: Vector3, s, age 0..1, dur}
var heats: Array = [] # {at: Vector3, r, life, max, s}
var aberration := 0.0
var flash_color := Color.WHITE
var flash_a := 0.0


func _init() -> void:
	layer = 5
	rect = ColorRect.new()
	rect.set_anchors_preset(Control.PRESET_FULL_RECT)
	rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var m := ShaderMaterial.new()
	m.shader = SHADER
	rect.material = m
	add_child(rect)


func wave(at: Vector3, strength: float) -> void:
	var s := minf(1.6, strength)
	waves.append({"at": at, "s": s, "age": 0.0, "dur": 0.45 + s * 0.3})
	while waves.size() > MAX_WAVES:
		waves.pop_front()


func heat(at: Vector3, r: float, life: float, s := 1.0) -> void:
	heats.append({"at": at, "r": r, "life": life, "max": life, "s": s})
	while heats.size() > MAX_HEAT:
		heats.pop_front()


func punch(ab: float) -> void:
	aberration = minf(1.6, aberration + ab)


func screen_flash(c: Color, a: float, cap := FLASH_CAP) -> void:
	flash_color = c
	flash_a = minf(cap, flash_a + a)


func clear() -> void:
	waves.clear()
	heats.clear()
	aberration = 0.0
	flash_a = 0.0


func update(dt: float, cam: Camera3D) -> void:
	for w in waves:
		w["age"] += dt / w["dur"]
	waves = waves.filter(func(w): return w["age"] < 1.0)
	for h in heats:
		h["life"] -= dt
	heats = heats.filter(func(h): return h["life"] > 0)
	aberration *= exp(-5 * dt)
	flash_a *= exp(-9 * dt)
	var m: ShaderMaterial = rect.material
	var vp := rect.get_viewport_rect().size if rect.is_inside_tree() else Vector2(1280, 720)
	var wv := []
	for i in MAX_WAVES:
		if i < waves.size() and cam and cam.is_inside_tree() and not cam.is_position_behind(waves[i]["at"]):
			var uv := cam.unproject_position(waves[i]["at"]) / vp
			wv.append(Vector4(uv.x, uv.y, waves[i]["age"], waves[i]["s"]))
		else:
			wv.append(Vector4(0, 0, -1, 0))
	var hv := []
	for i in MAX_HEAT:
		if i < heats.size() and cam and cam.is_inside_tree() and not cam.is_position_behind(heats[i]["at"]):
			var h: Dictionary = heats[i]
			var uv := cam.unproject_position(h["at"]) / vp
			var edge := cam.unproject_position(h["at"] + cam.global_basis.x * h["r"]) / vp
			hv.append(Vector4(uv.x, uv.y, absf(edge.x - uv.x) * 0.5 * vp.x / vp.y, h["s"] * minf(1.0, h["life"] / (h["max"] * 0.5))))
		else:
			hv.append(Vector4(0, 0, 0, 0))
	m.set_shader_parameter("waves", wv)
	m.set_shader_parameter("heat", hv)
	m.set_shader_parameter("aspect", vp.x / maxf(1.0, vp.y))
	m.set_shader_parameter("aberration", aberration)
	m.set_shader_parameter("flash", Vector4(flash_color.r, flash_color.g, flash_color.b, flash_a))
