# The zone in 3D, Magicka style: the design's diorama (ZoneModel) under a tilted orthographic
# camera that follows the wizard (clamped to the map), lit by a key light with shadows and a
# fill in the zone's glow colour. The wizard, thralls and boss are the design's 3D models (WizardModel), placed from
# the 2D logic positions every frame. Logic stays 2D (ZonePlay, pixels); this maps between
# logic pixels and world space and back (mouse picking, overlays).
extends Node3D

const ZoneModel = preload("res://scripts/view3d/zone_model.gd")
const WizardModel = preload("res://scripts/view3d/wizard_model.gd")
const SpellBook = preload("res://scripts/core/spell_book.gd")

const PITCH_DEG := 50.0  # camera tilt below the horizon
const VIEW_TILES := 14.0  # tiles across the window
const DESIGN_SIZE := Vector2(832, 700)  # the window the layout is drawn for
const MAP_SCREEN := Rect2(0, 0, 832, 576)  # where the world shows (at DESIGN_SIZE); below is the spell UI
const FOLLOW_RATE := 6.0
const WIZARD_SCALE := 0.36
const THRALL_SCALE := 0.32
const BOSS_SCALE := 0.62
const RUN_SPEED := 200.0  # px/s at which a model plays its full run
const TURN_RATE := 14.0
const FLASH_TIME := 0.4

var play = null
var camera: Camera3D
var key_light: DirectionalLight3D
var zone_model
var wizard_model = null
var enemy_models: Array = []
var boss_model = null
var orbs: Array = []  # MeshInstance3D per queue slot, orbiting the wizard
var _signature := ""
var _actors: Array = []  # {model, logic, last, dead_t}
var _flashes: Array = []  # {light, t, energy}
var _seen_effects: Array = []
var _time := 0.0
var _focus := Vector3.ZERO  # world point the camera centres on (in the map area)


func setup(p, wizard_id: String) -> void:
	play = p
	var g = p.grid
	var colors: Dictionary = g.colors
	var env := WorldEnvironment.new()
	env.environment = _environment(colors)
	add_child(env)
	key_light = DirectionalLight3D.new()
	key_light.rotation_degrees = Vector3(-52, -38, 0)
	key_light.light_color = Color(1.0, 0.95, 0.86)
	key_light.light_energy = 0.72
	key_light.shadow_enabled = true
	key_light.directional_shadow_max_distance = 30.0
	add_child(key_light)
	var fill := DirectionalLight3D.new()
	fill.rotation_degrees = Vector3(-35, 140, 0)
	fill.light_color = Color(colors["glow"])
	fill.light_energy = 0.2
	add_child(fill)
	camera = Camera3D.new()
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.near = 0.1
	camera.far = 100.0
	add_child(camera)
	camera.size = VIEW_TILES * ZoneModel.T * _viewport_size().y / _viewport_size().x
	camera.rotation_degrees = Vector3(-PITCH_DEG, 0, 0)
	_focus = _clamped_focus(to_world(p.wizard.position))
	_place_camera()
	zone_model = ZoneModel.new()
	add_child(zone_model)
	_rebuild_zone()
	wizard_model = _spawn(WizardModel.wizard_spec(wizard_id), WIZARD_SCALE, p.wizard)
	var glow := OmniLight3D.new()
	glow.light_color = p.wizard.color
	glow.light_energy = 0.8
	glow.omni_range = 1.4
	glow.position = Vector3(0, 1.6, 0.3)
	wizard_model.add_child(glow)
	for e in p.enemies:
		enemy_models.append(_spawn(WizardModel.thrall_spec(), THRALL_SCALE, e))
	if p.boss != null:
		var look: Dictionary = WizardModel.boss_spec(g.id)
		boss_model = _spawn(look if not look.is_empty() else WizardModel.thrall_spec(), BOSS_SCALE, p.boss)
	for i in 5:
		var orb := MeshInstance3D.new()
		var sm := SphereMesh.new()
		sm.radius = 0.05
		sm.height = 0.1
		orb.mesh = sm
		var m := StandardMaterial3D.new()
		m.emission_enabled = true
		m.emission_energy_multiplier = 2.0
		orb.material_override = m
		orb.visible = false
		orb.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		add_child(orb)
		orbs.append(orb)
	sync(0.0)


static func _environment(colors: Dictionary) -> Environment:
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(colors["rock"]).darkened(0.82)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(colors["ground"]).lerp(Color(colors["glow"]), 0.35)
	env.ambient_light_energy = 0.3
	# lights stay low enough that bright tiles (snow, lava) do not clip in the 8-bit output
	# no glow: on the Compatibility renderer it bleeds the emissive parts over the whole frame
	return env


# Keeps the camera's view of the map area inside the grid (centred when the grid is smaller).
func _clamped_focus(w: Vector3) -> Vector3:
	var g = play.grid
	var vp := _viewport_size()
	var ppu := vp.x / (VIEW_TILES * ZoneModel.T)  # screen pixels per world unit
	var half_w := vp.x / ppu / 2.0
	var half_d := map_rect().size.y / ppu / sin(deg_to_rad(PITCH_DEG)) / 2.0
	var map_w: float = g.width * ZoneModel.T / 2.0
	var map_d: float = g.height * ZoneModel.T / 2.0
	var x := 0.0 if half_w >= map_w else clampf(w.x, -map_w + half_w, map_w - half_w)
	var z := 0.0 if half_d >= map_d else clampf(w.z, -map_d + half_d, map_d - half_d)
	return Vector3(x, ZoneModel.HEIGHT["."], z)


# Centres `_focus` in the map area above the spell UI.
func _place_camera() -> void:
	var vp := _viewport_size()
	camera.position = _focus + camera.transform.basis.z * 30.0
	camera.v_offset = -(vp.y / 2.0 - map_rect().get_center().y) * camera.size / vp.y


# The map area in the current viewport (MAP_SCREEN scaled from the design window).
func map_rect() -> Rect2:
	var k := _viewport_size() / DESIGN_SIZE
	return Rect2(MAP_SCREEN.position * k, MAP_SCREEN.size * k)


func _viewport_size() -> Vector2:
	if is_inside_tree():
		return get_viewport().get_visible_rect().size
	return Vector2(ProjectSettings.get_setting("display/window/size/viewport_width"),
		ProjectSettings.get_setting("display/window/size/viewport_height"))


func _spawn(look: Dictionary, scale_: float, logic) -> Node3D:
	var m = WizardModel.create(look)
	m.scale = Vector3.ONE * scale_
	add_child(m)
	_actors.append({"model": m, "logic": logic, "last": logic.position, "dead_t": 0.0, "y": ground_height(logic.position)})
	return m


func _rebuild_zone() -> void:
	_signature = ZoneModel.signature(play.grid)
	zone_model.build(play.grid)


# ---- logic <-> world -----------------------------------------------------------

func to_world(p: Vector2, y := 0.0) -> Vector3:
	var g = play.grid
	return Vector3((p.x / g.TILE - g.width / 2.0) * ZoneModel.T, y, (p.y / g.TILE - g.height / 2.0) * ZoneModel.T)


func to_logic(w: Vector3) -> Vector2:
	var g = play.grid
	return Vector2((w.x / ZoneModel.T + g.width / 2.0) * g.TILE, (w.z / ZoneModel.T + g.height / 2.0) * g.TILE)


# Top of the tile under a logic position (what a character stands on).
func ground_height(p: Vector2) -> float:
	var t: String = play.grid.tile_at(play.grid.world_to_cell(p))
	return ZoneModel.cell_height(t if t in ["#", "~", "^", ",", "w"] else ".")


# The logic point under a screen position (on the floor plane), or null if the ray misses.
func screen_to_logic(screen: Vector2):
	var hit = Plane(Vector3.UP, ZoneModel.HEIGHT["."]).intersects_ray(
		camera.project_ray_origin(screen), camera.project_ray_normal(screen))
	return null if hit == null else to_logic(hit)


func logic_to_screen(p: Vector2, y := -1.0) -> Vector2:
	return camera.unproject_position(to_world(p, ZoneModel.HEIGHT["."] if y < 0.0 else y))


# Logic pixels -> screen pixels on the floor plane (exact: the camera is orthographic).
func ground_transform() -> Transform2D:
	var o := logic_to_screen(Vector2.ZERO)
	return Transform2D((logic_to_screen(Vector2(100, 0)) - o) / 100.0, (logic_to_screen(Vector2(0, 100)) - o) / 100.0, o)


# Screen point above a character's head (for health bars).
func head_screen(model: Node3D) -> Vector2:
	return camera.unproject_position(model.position + Vector3(0, 2.3 * model.scale.y, 0))


# ---- per frame -----------------------------------------------------------------

func sync(delta: float) -> void:
	if play == null:
		return
	_time += delta
	if ZoneModel.signature(play.grid) != _signature:
		_rebuild_zone()
	for a in _actors:
		_sync_actor(a, delta)
	var want := _clamped_focus(to_world(play.wizard.position))
	_focus = want if delta == 0.0 else _focus.lerp(want, clampf(delta * FOLLOW_RATE, 0.0, 1.0))
	_place_camera()
	_sync_orbs()
	_sync_flashes(delta)


func _sync_actor(a: Dictionary, delta: float) -> void:
	var m: Node3D = a["model"]
	var logic = a["logic"]
	var pos: Vector2 = logic.position
	var moved: Vector2 = pos - a["last"]
	a["last"] = pos
	if logic.health.is_dead():
		# sink into the ground, then hide
		a["dead_t"] += delta
		m.visible = a["dead_t"] < 0.6
		m.position.y = a["y"] - a["dead_t"] * 0.5
		return
	a["dead_t"] = 0.0
	m.visible = true
	a["y"] = lerpf(a["y"], ground_height(pos), clampf(delta * 12.0, 0.0, 1.0)) if delta > 0.0 else ground_height(pos)
	m.position = to_world(pos, a["y"])
	var dir := Vector2.ZERO
	if logic == play.wizard:
		dir = play.wizard.facing
	elif moved.length() > 0.01:
		dir = moved
	elif play.wizard != null:
		dir = play.wizard.position - pos
	if dir.length() > 0.001:
		var yaw := atan2(dir.x, dir.y)
		m.rotation.y = yaw if delta == 0.0 else lerp_angle(m.rotation.y, yaw, clampf(delta * TURN_RATE, 0.0, 1.0))
	var speed := moved.length() / delta if delta > 0.0 else 0.0
	m.animate(delta, clampf(speed / RUN_SPEED, 0.0, 1.0))


func _sync_orbs() -> void:
	var queued: Array = play.queue.queue
	var center: Vector3 = wizard_model.position + Vector3(0, 0.42, 0)
	for i in orbs.size():
		var orb: MeshInstance3D = orbs[i]
		orb.visible = i < queued.size() and not play.wizard.health.is_dead()
		if not orb.visible:
			continue
		var c := SpellBook.element_color(queued[i])
		var mat: StandardMaterial3D = orb.material_override
		mat.albedo_color = c
		mat.emission = c
		var ang := _time * 2.4 + i * TAU / queued.size()
		orb.position = center + Vector3(cos(ang) * 0.24, sin(_time * 3.0 + i) * 0.03, sin(ang) * 0.24)


# Each new spell effect throws a short burst of coloured light onto the scene.
func _sync_flashes(delta: float) -> void:
	_seen_effects = _seen_effects.filter(func(e): return play.effects.any(func(x): return is_same(x, e)))
	for e in play.effects:
		if _seen_effects.any(func(x): return is_same(x, e)):
			continue
		_seen_effects.append(e)
		var light := OmniLight3D.new()
		light.light_color = e["color"]
		var r: float = e.get("radius", 24.0) / play.grid.TILE * ZoneModel.T
		light.omni_range = maxf(0.8, r * 2.5)
		light.light_energy = 3.0
		var at: Vector2 = e["pos"]
		if e.get("kind", "circle") == "beam":
			at += Vector2(e["dir"]).normalized() * float(e["length"]) * 0.5
			light.omni_range = maxf(light.omni_range, float(e["length"]) / play.grid.TILE * ZoneModel.T * 0.6)
		light.position = to_world(at, 0.45)
		add_child(light)
		_flashes.append({"light": light, "t": 0.0})
	for f in _flashes:
		f["t"] += delta
		(f["light"] as OmniLight3D).light_energy = 3.0 * maxf(0.0, 1.0 - f["t"] / FLASH_TIME)
	for f in _flashes.filter(func(f): return f["t"] >= FLASH_TIME):
		f["light"].free()
	_flashes = _flashes.filter(func(f): return is_instance_valid(f["light"]))
