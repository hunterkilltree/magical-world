# Health bars over the 3D characters, drawn on the canvas at each model's projected head.
extends Node2D

const DrawUtil = preload("res://scripts/core/draw_util.gd")

var view = null  # ZoneView


func _draw() -> void:
	if view == null or view.play == null:
		return
	var play = view.play
	_bar(view.wizard_model, play.wizard, 34.0, Color("#4ade80"), true)
	for i in play.enemies.size():
		_bar(view.enemy_models[i], play.enemies[i], 26.0, Color("#ef4444"), false)
	if play.boss != null:
		_bar(view.boss_model, play.boss, 64.0, Color("#ef4444"), true)


func _bar(model, logic, width: float, color: Color, always: bool) -> void:
	if model == null or not model.visible or logic.health.is_dead():
		return
	if not always and logic.health.current >= logic.health.max_health:
		return
	var at: Vector2 = view.head_screen(model)
	draw_set_transform(at)
	DrawUtil.bar(self, 0.0, width, float(logic.health.current) / float(logic.health.max_health), color)
	draw_set_transform(Vector2.ZERO)
