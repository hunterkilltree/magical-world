extends "res://harness/test_case.gd"

const WizardModel = preload("res://scripts/view3d/wizard_model.gd")
const Roster = preload("res://scripts/core/wizard_roster.gd")

const PATH := "user://test_r036_main.json"

var main = null
var models: Array = []


func after_test() -> void:
	for m in models:
		if is_instance_valid(m):
			m.free()
	models.clear()
	if main != null and is_instance_valid(main):
		main.free()
	main = null
	if FileAccess.file_exists(PATH):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(PATH))


func _model(look: Dictionary):
	var m = WizardModel.create(look)
	models.append(m)
	return m


func _boot() -> void:
	main = load("res://scenes/main.tscn").instantiate()
	main.save_path = PATH
	tree.root.add_child(main)
	main.start()
	main.new_game()


func test_every_wizard_is_the_design_model_with_its_rig() -> void:
	for w in Roster.all():
		var look: Dictionary = WizardModel.wizard_spec(w["id"])
		assert_eq(look["id"], w["id"], "%s has a look in data/wizard_models.json" % w["id"])
		var m = _model(look)
		var box: AABB = m.local_aabb()
		assert_true(box.size.y > 1.5 and box.size.y < 2.5, "%s about two units tall, got %.2f" % [w["id"], box.size.y])
		for g in ["root", "head", "hip_0", "hip_1", "knee_0", "knee_1", "ankle_0", "ankle_1",
				"shoulder_0", "shoulder_1", "panel_front", "panel_back"]:
			assert_true(m.groups.has(g), "%s rig has %s" % [w["id"], g])


func test_thralls_and_bosses_use_the_same_rig_with_their_own_looks() -> void:
	var thrall = _model(WizardModel.thrall_spec())
	assert_true(thrall.groups.has("hip_0"), "thrall rigged")
	for zone in ["keep", "volcano", "cavern"]:
		var look: Dictionary = WizardModel.boss_spec(zone)
		assert_true(not look.is_empty(), "%s boss has a look" % zone)
		assert_true(_model(look).groups.has("head"), "%s boss rigged" % zone)


func test_walking_swings_the_legs_and_keeps_the_feet_planted() -> void:
	var m = _model(WizardModel.wizard_spec("ember_pyromancer"))
	var rest: Basis = m.groups["hip_0"].transform.basis
	var swung := false
	for i in 40:
		m.animate(1.0 / 30.0, 0.5)
		if not m.groups["hip_0"].transform.basis.is_equal_approx(rest):
			swung = true
		assert_true(absf(m.lowest_sole()) < 0.03, "sole on the ground (frame %d: %.3f)" % [i, m.lowest_sole()])
	assert_true(swung, "the hips move")
	assert_true(m.stride > 0.4, "walking stride reached")


func test_the_zone_shows_the_chosen_wizard_thralls_and_boss() -> void:
	_boot()
	main.session.select_wizard("rime_cryomancer")
	main.session.campaign.restore(["tundra", "pine", "keep", "volcano", "bog"])
	main.enter_zone("keep")
	var view = main.zone_view
	assert_eq(view.wizard_model.spec["id"], "rime_cryomancer", "Sister Vela's model")
	assert_eq(view.enemy_models.size(), main.play.enemies.size(), "a model per thrall")
	assert_eq(view.enemy_models[0].spec["id"], "thrall", "thrall look")
	assert_not_null(view.boss_model, "boss model")
	assert_eq(view.boss_model.spec["id"], "boss_keep", "the keep's boss look")
	var w = main.play.wizard
	assert_true(view.wizard_model.position.distance_to(view.to_world(w.position, view.wizard_model.position.y)) < 0.001,
		"model stands where the logic wizard is")


func test_the_wizard_faces_where_it_aims() -> void:
	_boot()
	main.enter_zone("tundra")
	var view = main.zone_view
	main.play.wizard.facing = Vector2.RIGHT
	view.sync(0.0)
	assert_true(absf(angle_difference(view.wizard_model.rotation.y, PI / 2.0)) < 0.01, "faces east")
	main.play.wizard.facing = Vector2.DOWN
	view.sync(0.0)
	assert_true(absf(angle_difference(view.wizard_model.rotation.y, 0.0)) < 0.01, "faces the camera (south)")


func test_queued_elements_orbit_the_wizard() -> void:
	_boot()
	main.enter_zone("tundra")
	for e in ["fire", "ice", "fire"]:
		main.play.queue_element(e)
	main.tick(0.016, Vector2.ZERO)
	var shown: Array = main.zone_view.orbs.filter(func(o): return o.visible)
	assert_eq(shown.size(), 3, "three orbs")
	for o in shown:
		assert_true(o.position.distance_to(main.zone_view.wizard_model.position) < 0.8, "orb near the wizard")


func test_fallen_thralls_sink_and_vanish() -> void:
	_boot()
	main.enter_zone("tundra")
	var e = main.play.enemies[0]
	e.health.take_damage(10000)
	var model = main.zone_view.enemy_models[0]
	var y: float = model.position.y
	main.zone_view.sync(0.2)
	assert_true(model.position.y < y, "sinks")
	for i in 10:
		main.zone_view.sync(0.1)
	assert_true(not model.visible, "gone")


func test_the_overworld_shows_the_chosen_wizard() -> void:
	_boot()
	assert_not_null(main.showcase, "showcase on the overworld")
	assert_eq(main.showcase.model.spec["id"], main.session.wizard()["id"], "the chosen wizard")
	main.cycle_wizard()
	assert_eq(main.showcase.model.spec["id"], main.session.wizard()["id"], "follows the change")
	main.enter_zone("tundra")
	assert_true(main.showcase == null, "showcase leaves with the overworld")
