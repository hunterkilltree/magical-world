extends "res://harness/test_case.gd"

const SpellBook := preload("res://scripts/core/spell_book.gd")
const F := preload("res://tests/support/arena_fixture.gd")


func test_the_data_loads() -> void:
	assert_eq(SpellBook.max_queue(), 3, "queue size")
	assert_eq(SpellBook.data()["elements"].size(), 6, "elements")
	assert_eq(SpellBook.data()["shapes"].size(), 6, "shapes")
	assert_eq(SpellBook.grimoire().size(), 22, "combos")
	for el in SpellBook.ORDER:
		assert_true(not SpellBook.element(el).is_empty(), el)


func test_the_queue_holds_three_and_fire_cancels_ice() -> void:
	var q := []
	for el in ["water", "earth", "arcane"]:
		assert_eq(SpellBook.queue_element(q, el), "queued", el)
	assert_eq(SpellBook.queue_element(q, "lightning"), "full", "fourth")
	assert_eq(q, ["water", "earth", "arcane"], "queue kept")
	q = ["ice", "water"]
	assert_eq(SpellBook.queue_element(q, "fire"), "cancel", "fire meets ice")
	assert_eq(q, ["water"], "ice removed, fire not added")


func test_an_exact_key_with_repeats_wins() -> void:
	var sp := SpellBook.resolve(["earth", "earth"])
	assert_eq(sp["name"], "Stone Rampart")
	assert_eq(sp["def"]["shape"], "wall")
	assert_eq(sp["power"], 1.0)
	assert_eq(sp["cost"], 24, "2 x 8 x 1.5")


func test_repeats_add_thirty_percent() -> void:
	var sp := SpellBook.resolve(["fire", "fire"])
	assert_eq(sp["name"], "Flame Gout")
	assert_true(is_equal_approx(sp["power"], 1.3), "power")
	var pl: Dictionary = sp["payload"]
	assert_true(is_equal_approx(pl["parts"]["fire"], 6 * 2 * 1.5 * 1.3), "fire damage %s" % pl["parts"]["fire"])
	assert_true(is_equal_approx(pl["burn"], 3.9), "burn seconds")
	assert_true(is_equal_approx(pl["burnDps"], 13.0), "burn dps")


func test_order_does_not_matter() -> void:
	assert_eq(SpellBook.resolve(["lightning", "fire"])["name"], "Thunderflare")
	assert_eq(SpellBook.resolve(["fire", "lightning"])["name"], "Thunderflare")
	assert_eq(SpellBook.resolve(["lightning", "arcane", "fire"])["name"], "Starfall")
	assert_eq(SpellBook.resolve(["fire", "lightning"])["cost"], 16)
	assert_eq(SpellBook.resolve(["arcane", "fire", "lightning"])["cost"], 38, "3 x 8 x 1.6 rounded")


func test_three_distinct_without_an_entry_ride_the_best_pair() -> void:
	var sp := SpellBook.resolve(["fire", "water", "earth"])
	assert_eq(sp["name"], "Molten Core + Water", "boulder outranks the two cones")
	assert_eq(sp["key"], "earth+fire")
	assert_true(is_equal_approx(sp["power"], 1.15), "rider power")
	assert_true(sp["payload"].has("wet"), "the rider still soaks")


func test_payload_and_colour() -> void:
	var torrent := SpellBook.resolve(["water"])
	assert_eq(torrent["payload"]["knock"], 14.0, "Torrent 10 + water 4")
	assert_eq(torrent["payload"]["wet"], 4.0)
	assert_true(not torrent["payload"]["parts"].has("water"), "water does no damage")
	assert_eq(SpellBook.resolve(["fire"])["color"].to_html(false), "ff6a2b")
	assert_eq(SpellBook.resolve(["fire", "lightning"])["color"], Color8(250, 166, 68), "mixed colour")
	assert_eq(SpellBook.resolve([]), {}, "nothing queued")


func test_the_player_queue_follows_the_book() -> void:
	var s := F.make()
	var ev := F.run(s, F.DT, ["el:ice", "el:fire"])
	assert_eq(s.player.queue, [], "cancelled")
	assert_eq(F.of_type(ev, "cancel").size(), 1, "cancel event")
	ev = F.run(s, F.DT, ["el:water", "el:water", "el:earth", "el:arcane"])
	assert_eq(s.player.queue, ["water", "water", "earth"])
	assert_eq(F.of_type(ev, "queueFull").size(), 1, "queue full event")
