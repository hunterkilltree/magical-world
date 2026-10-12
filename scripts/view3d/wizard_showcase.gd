# The chosen wizard on a pedestal for the overworld screen: the design's 3D model idling
# and slowly turning, lit with a rim light in its glow colour, framed on the right so the
# zone list stays readable on the left.
extends Node3D

const WizardModel = preload("res://scripts/view3d/wizard_model.gd")
const MeshKit = preload("res://scripts/view3d/mesh_kit.gd")

var model = null
var camera: Camera3D
var _rim: OmniLight3D
var _ring: MeshInstance3D


func _init() -> void:
	var env := WorldEnvironment.new()
	var e := Environment.new()
	e.background_mode = Environment.BG_COLOR
	e.background_color = Color("#0d0b14")
	e.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	e.ambient_light_color = Color("#3a3550")
	e.ambient_light_energy = 0.6
	env.environment = e
	add_child(env)
	var key := DirectionalLight3D.new()
	key.rotation_degrees = Vector3(-28, 22, 0)  # from the camera side, so the hat brim does not hide the face
	key.light_energy = 1.2
	key.shadow_enabled = true
	add_child(key)
	_rim = OmniLight3D.new()
	_rim.position = Vector3(-0.8, 2.0, -1.2)
	_rim.omni_range = 4.0
	_rim.light_energy = 2.5
	add_child(_rim)
	var batch := MeshKit.Batch.new()
	batch.add(MeshKit.cylinder(0.75, 0.85, 0.2, 40), MeshKit.mat("pedestal", {"color": "#3a3442", "roughness": 0.9}),
		MeshKit.xform(Vector3(0, -0.1, 0)))
	var pedestal := MeshInstance3D.new()
	pedestal.mesh = batch.commit()
	add_child(pedestal)
	_ring = MeshInstance3D.new()
	var tm := TorusMesh.new()
	tm.inner_radius = 0.76
	tm.outer_radius = 0.8
	_ring.mesh = tm
	_ring.position = Vector3(0, 0.0, 0)
	var rm := StandardMaterial3D.new()
	rm.emission_enabled = true
	rm.emission_energy_multiplier = 2.0
	_ring.material_override = rm
	add_child(_ring)
	camera = Camera3D.new()
	camera.fov = 40.0
	camera.position = Vector3(0, 1.25, 6.2)
	camera.rotation_degrees = Vector3(-5, 0, 0)
	camera.h_offset = -1.75  # the wizard stands right of centre
	add_child(camera)


func show_wizard(id: String) -> void:
	if model != null:
		model.free()
	model = WizardModel.create(WizardModel.wizard_spec(id))
	model.rotation.y = -0.5
	add_child(model)
	var glow := Color(model.spec["glow"])
	_rim.light_color = glow
	(_ring.material_override as StandardMaterial3D).albedo_color = glow
	(_ring.material_override as StandardMaterial3D).emission = glow


func _process(delta: float) -> void:
	if model != null:
		model.rotation.y += delta * 0.35
		model.animate(delta, 0.0)
