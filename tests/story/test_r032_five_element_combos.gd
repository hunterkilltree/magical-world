extends "res://harness/test_case.gd"

const ElementQueue = preload("res://scripts/core/element_queue.gd")
const SpellBook = preload("res://scripts/core/spell_book.gd")
const Caster = preload("res://scripts/core/caster.gd")
const ZonePlay = preload("res://scripts/core/zone_play.gd")
const ZoneGrid = preload("res://scripts/core/zone_grid.gd")
const Inventory = preload("res://scripts/core/inventory.gd")


class Dummy:
	var position := Vector2.ZERO
	var taken := 0
	func take_damage(n: int) -> void:
		taken += n


func _queue(elements: Array):
	var q = ElementQueue.new()
	for e in elements:
		q.push(e)
	return q


func test_the_queue_holds_five_and_refuses_a_sixth() -> void:
	var q = ElementQueue.new()
	for e in ["fire", "fire", "ice", "water", "dark"]:
		assert_true(q.push(e), "%s fits" % e)
	assert_true(not q.push("light"), "sixth refused")
	assert_eq(q.queue.size(), ElementQueue.MAX, "five held")
	assert_eq(ElementQueue.MAX, 5, "max five")


func test_a_pair_is_the_plain_recipe() -> void:
	var s: Dictionary = _queue(["fire", "fire"]).resolve()
	var base := SpellBook.find(["fire", "fire"])
	assert_eq(s["id"], "supernova", "supernova")
	assert_eq(s["infusions"], 0, "no infusions")
	assert_eq(int(s["damage"]), int(base["damage"]), "base damage")
	assert_eq(float(s["radius"]), float(base["radius"]), "base radius")


func test_matching_infusions_add_damage_radius_and_cooldown() -> void:
	var base := SpellBook.find(["fire", "fire"])
	var s: Dictionary = _queue(["fire", "fire", "fire"]).resolve()
	assert_eq(s["id"], "supernova", "still supernova")
	assert_eq(s["infusions"], 1, "one infusion")
	assert_eq(int(s["damage"]), int(round(float(base["damage"]) * 1.25)), "+25% damage")
	assert_true(absf(float(s["radius"]) - float(base["radius"]) * 1.15) < 0.01, "+15% radius")
	assert_true(absf(float(s["cooldown"]) - (float(base["cooldown"]) + 0.5)) < 0.01, "+0.5 s cooldown")
	var five: Dictionary = _queue(["fire", "fire", "fire", "fire", "fire"]).resolve()
	assert_eq(five["infusions"], 3, "three infusions")
	assert_eq(int(five["damage"]), int(round(float(base["damage"]) * 1.75)), "+75% damage")


func test_off_recipe_infusions_add_damage_but_not_radius() -> void:
	var base := SpellBook.find(["fire", "ice"])
	var s: Dictionary = _queue(["fire", "ice", "dark", "dark"]).resolve()
	assert_eq(s["id"], "thermal_shock", "thermal shock")
	assert_eq(s["infusions"], 2, "two infusions")
	assert_eq(int(s["damage"]), int(round(float(base["damage"]) * 1.5)), "+50% damage")
	assert_eq(float(s["radius"]), float(base["radius"]), "radius unchanged")


func test_resolving_does_not_change_the_spell_book() -> void:
	_queue(["fire", "fire", "fire", "fire"]).resolve()
	assert_eq(int(SpellBook.find(["fire", "fire"])["damage"]), 850, "data untouched")


func test_a_single_element_repeated_is_a_stronger_bolt() -> void:
	var s: Dictionary = _queue(["earth", "earth", "earth"]).resolve()
	assert_eq(s["id"], "bolt_earth", "earth bolt")
	assert_eq(s["infusions"], 1, "the third earth infuses")
	assert_eq(int(s["damage"]), 75, "60 * 1.25")


func test_the_reversed_pair_is_used_when_only_it_is_a_recipe() -> void:
	assert_eq(_queue(["nature", "water"]).resolve()["id"], "living_vines", "nature+water = water+nature")
	assert_eq(_queue(["earth", "water"]).resolve()["id"], "mountain_rise", "exact order wins")


func test_an_infused_spell_hits_harder_through_the_caster() -> void:
	var plain := Dummy.new()
	var infused := Dummy.new()
	Caster.new().cast(_queue(["fire", "fire"]).resolve(), Vector2.ZERO, [plain])
	Caster.new().cast(_queue(["fire", "fire", "fire", "fire"]).resolve(), Vector2.ZERO, [infused])
	assert_eq(infused.taken, int(round(plain.taken * 1.5)), "two infusions: +50%")


func test_an_infusion_reaches_further() -> void:
	var t := Dummy.new()
	t.position = Vector2(195, 0)  # supernova radius 180; +15% is 207
	assert_eq(Caster.new().cast(_queue(["fire", "fire"]).resolve(), Vector2.ZERO, [t]), 0, "out of reach")
	assert_eq(Caster.new().cast(_queue(["fire", "fire", "fire"]).resolve(), Vector2.ZERO, [t]), 1, "in reach")


func test_the_infused_cooldown_is_kept_against_the_base_spell() -> void:
	var c = Caster.new()
	c.cast(_queue(["fire", "fire", "fire"]).resolve(), Vector2.ZERO, [])
	assert_true(absf(c.cooldown_left(SpellBook.find(["fire", "fire"])) - 8.5) < 0.01, "8.5 s on supernova")


func test_zone_play_queues_five_and_previews_infusions() -> void:
	var play = ZonePlay.create(ZoneGrid.load_zone("tundra"), Inventory.new())
	for i in 3:
		assert_true(play.queue_element("fire"), "fire %d" % i)
	var p: Dictionary = play.queue_preview()
	assert_eq(p["name"], "Supernova +1", "preview names the infusion")
	assert_eq(p["infusions"], 1, "count exposed")
	assert_true(p["complete"], "castable")
	play.queue_element("ice")
	play.queue_element("ice")
	assert_true(not play.queue_element("ice"), "sixth refused")
	assert_eq(play.queue_preview()["name"], "Supernova +3", "three infusions")
	assert_eq(play.wizard.queued_colors.size(), 5, "five orbs on the wizard")
	play.free_nodes()
