extends "res://harness/test_case.gd"

const ZonePlay = preload("res://scripts/core/zone_play.gd")
const ZoneGrid = preload("res://scripts/core/zone_grid.gd")
const Inventory = preload("res://scripts/core/inventory.gd")

var plays: Array = []


func after_test() -> void:
	for p in plays:
		p.free_nodes()


func _play(zone: String):
	var p = ZonePlay.create(ZoneGrid.load_zone(zone), Inventory.new())
	plays.append(p)
	return p


func _texts(p) -> Array:
	return p.popups.map(func(x): return x["text"])


func test_a_cast_shows_the_damage_over_each_target() -> void:
	var p = _play("volcano")
	p.wizard.position = p.boss.position + Vector2(40, 0)
	var thrall = p.enemies[0]
	thrall.position = p.wizard.position + Vector2(30, 0)
	p.queue_element("fire")
	p.queue_element("fire")
	p.cast()
	assert_true("850" in _texts(p), "the boss took 850: %s" % str(_texts(p)))
	assert_true("40" in _texts(p), "the thrall lost its 40 hp: %s" % str(_texts(p)))
	var boss_popup: Dictionary = p.popups.filter(func(x): return x["text"] == "850")[0]
	assert_eq(boss_popup["pos"], p.boss.position, "over the boss")


func test_numbers_rise_and_fade_within_a_second() -> void:
	var p = _play("tundra")
	p.enemies[0].position = p.wizard.position + Vector2(40, 0)  # dies to the cast, so it cannot hit back
	p.queue_element("fire")
	p.queue_element("fire")
	p.cast()
	assert_eq(p.popups.size(), 1, "one number")
	var y0: float = p.popups[0]["pos"].y
	p.tick(0.3, Vector2.ZERO)
	assert_true(p.popups[0]["pos"].y < y0, "drifts up")
	p.tick(0.8, Vector2.ZERO)
	assert_eq(p.popups.size(), 0, "gone after a second")


func test_damage_to_the_wizard_is_red() -> void:
	var p = _play("tundra")
	p.enemies[0].position = p.wizard.position + Vector2(5, 0)
	p.tick(0.016, Vector2.ZERO)
	var hits: Array = p.popups.filter(func(x): return x["text"] == "-10")
	assert_eq(hits.size(), 1, "thrall hit shown: %s" % str(_texts(p)))
	var c: Color = hits[0]["color"]
	assert_true(c.r > c.g and c.r > c.b, "red")
	assert_eq(hits[0]["pos"], p.wizard.position, "over the wizard")


func test_health_gained_from_a_cast_is_green() -> void:
	var p = _play("tundra")
	p.wizard.health.max_health = 1000
	p.wizard.health.current = 1
	p.enemies[0].position = p.wizard.position + Vector2(40, 0)
	p.enemies[0].health.max_health = 5000  # survives the 650 so the steal is the full 195
	p.enemies[0].health.current = 5000
	p.queue_element("dark")
	p.queue_element("nature")
	p.cast()
	var heals: Array = p.popups.filter(func(x): return x["text"].begins_with("+"))
	assert_eq(heals.size(), 1, "lifesteal shown: %s" % str(_texts(p)))
	assert_eq(heals[0]["text"], "+195", "30% of 650")
	var c: Color = heals[0]["color"]
	assert_true(c.g > c.r, "green")


func test_nothing_hit_means_no_numbers() -> void:
	var p = _play("tundra")
	p.queue_element("fire")
	p.queue_element("fire")
	p.cast()
	assert_eq(p.popups.size(), 0, "empty air")
