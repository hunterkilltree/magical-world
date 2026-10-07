extends "res://harness/test_case.gd"

const Enemy = preload("res://scripts/core/enemy.gd")
const Player = preload("res://scripts/player.gd")
const ZoneGrid = preload("res://scripts/core/zone_grid.gd")

var wizard
var thrall


func before_each() -> void:
	wizard = Player.new()
	thrall = Enemy.new()


func after_test() -> void:
	wizard.free()
	thrall.free()


func test_one_spawn_tile_per_enemy_in_data() -> void:
	assert_eq(ZoneGrid.load_zone("tundra").cells_of("E").size(), 2, "tundra spawns")
	assert_eq(ZoneGrid.load_zone("cavern").cells_of("E").size(), 1, "cavern spawns")


func test_ignores_wizard_beyond_sight() -> void:
	wizard.position = Vector2(1000, 0)
	thrall.step(1.0, wizard)
	assert_eq(thrall.position, Vector2.ZERO, "did not move")


func test_chases_wizard_within_sight() -> void:
	wizard.position = Vector2(200, 0)
	thrall.step(0.5, wizard)
	assert_true(thrall.position.x > 0.0, "moved toward wizard")
	assert_true(thrall.position.distance_to(wizard.position) < 200.0, "closer")


func test_contact_damage_has_cooldown() -> void:
	wizard.position = Vector2(10, 0)
	thrall.step(0.1, wizard)
	assert_eq(wizard.health.current, 90, "first hit")
	thrall.step(0.5, wizard)
	assert_eq(wizard.health.current, 90, "no hit during cooldown")
	thrall.step(0.5, wizard)
	assert_eq(wizard.health.current, 80, "hit after cooldown")


func test_dead_enemy_does_nothing() -> void:
	wizard.position = Vector2(10, 0)
	thrall.take_damage(999)
	thrall.step(1.0, wizard)
	assert_eq(wizard.health.current, 100, "dead thrall deals no damage")
