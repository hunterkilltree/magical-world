# A thrall: chases the nearest living target within sight and hurts it on contact.
extends Node2D

const Health = preload("res://scripts/core/health.gd")
const Mover = preload("res://scripts/core/mover.gd")
const DrawUtil = preload("res://scripts/core/draw_util.gd")

const SPEED := 80.0
const SIGHT := 256.0
const CONTACT_RANGE := 20.0
const CONTACT_DAMAGE := 10
const CONTACT_COOLDOWN := 1.0

var health := Health.new()
var grid = null
var _hit_cooldown := 0.0
var _rooted := 0.0


func _init() -> void:
	health.max_health = 40
	health.current = 40


func take_damage(amount: int) -> void:
	health.take_damage(amount)


# Held in place (still able to hit what is in reach) for `seconds`.
func root(seconds: float) -> void:
	_rooted = maxf(_rooted, seconds)


# `target` needs `position` and `health`. Dead enemies and dead targets are ignored.
func step(delta: float, target) -> void:
	_hit_cooldown = maxf(0.0, _hit_cooldown - delta)
	_rooted = maxf(0.0, _rooted - delta)
	if health.is_dead() or target == null or target.health.is_dead():
		return
	var to_target: Vector2 = target.position - position
	var dist := to_target.length()
	if dist > SIGHT:
		return
	if dist <= CONTACT_RANGE:
		if _hit_cooldown == 0.0:
			target.health.take_damage(CONTACT_DAMAGE)
			_hit_cooldown = CONTACT_COOLDOWN
		return
	if _rooted > 0.0:
		return
	position = Mover.move(grid, position, to_target.normalized() * SPEED, delta)


func _draw() -> void:
	DrawUtil.shadow(self, 10.0)
	draw_circle(Vector2.ZERO, 10.0, Color("#ef4444"))
	draw_arc(Vector2.ZERO, 10.0, 0.0, TAU, 20, Color("#7f1d1d"), 2.0)
	draw_circle(Vector2(-3.5, -2), 1.8, Color.WHITE)
	draw_circle(Vector2(3.5, -2), 1.8, Color.WHITE)
	if health.current < health.max_health:
		DrawUtil.bar(self, -20.0, 24.0, float(health.current) / float(health.max_health), Color("#ef4444"))
