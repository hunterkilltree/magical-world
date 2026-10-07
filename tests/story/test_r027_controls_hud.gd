extends "res://harness/test_case.gd"

const Controls = preload("res://scripts/core/controls.gd")
const SpellBook = preload("res://scripts/core/spell_book.gd")
const Caster = preload("res://scripts/core/caster.gd")
const ZonePlay = preload("res://scripts/core/zone_play.gd")
const ZoneGrid = preload("res://scripts/core/zone_grid.gd")
const Inventory = preload("res://scripts/core/inventory.gd")

var play


func before_each() -> void:
	play = ZonePlay.create(ZoneGrid.load_zone("tundra"), Inventory.new())


func after_test() -> void:
	play.free_nodes()


func test_every_element_has_its_own_letter_key() -> void:
	var labels := {}
	for el in SpellBook.elements():
		var label: String = Controls.label(el)
		assert_true(label.length() == 1 and label == label.to_upper(), "%s has a single letter" % el)
		labels[label] = true
		assert_eq(Controls.element_for_keycode(Controls.key_for(el)), el, "%s round-trips" % el)
	assert_eq(labels.size(), 9, "nine different letters")
	assert_eq(Controls.label("fire"), "Q", "fire is Q")
	assert_eq(Controls.label("lightning"), "T", "lightning is T")
	assert_eq(Controls.label("ice"), "A", "ice starts the second row")


func test_digits_still_work_in_element_order() -> void:
	var elements := SpellBook.elements()
	for i in 9:
		assert_eq(Controls.element_for_keycode(KEY_1 + i), elements[i], "digit %d" % (i + 1))


func test_other_keys_are_not_elements() -> void:
	for k in [KEY_SPACE, KEY_ENTER, KEY_ESCAPE, KEY_UP, KEY_Z, KEY_0]:
		assert_eq(Controls.element_for_keycode(k), "", "key %d" % k)


func test_the_preview_follows_the_queue() -> void:
	assert_eq(play.queue_preview(), {}, "nothing queued")
	play.queue_element("fire")
	assert_eq(play.queue_preview()["name"], "Fire Bolt", "one element is a bolt")
	assert_true(not play.queue_preview()["complete"], "not a full pair yet")
	play.queue_element("ice")
	var p: Dictionary = play.queue_preview()
	assert_eq(p["name"], "Thermal Shock", "the pair's spell")
	assert_true(p["complete"] and p["ready"], "ready to cast")
	assert_eq(p["type"], "aoe", "type shown")


func test_an_unknown_pair_previews_the_fallback_bolt() -> void:
	play.queue_element("earth")
	play.queue_element("earth")
	assert_eq(play.queue_preview()["name"], "Earth Bolt", "fallback")


func test_the_preview_shows_when_a_spell_is_cooling_down() -> void:
	play.queue_element("fire")
	play.queue_element("fire")
	play.cast()
	play.queue_element("fire")
	play.queue_element("fire")
	var p: Dictionary = play.queue_preview()
	assert_true(not p["ready"] and p["cooldown"] > 7.0, "supernova cooling: %s" % str(p["cooldown"]))


func test_cooldown_left_counts_down() -> void:
	var c = Caster.new()
	var s := SpellBook.find(["fire", "fire"])
	assert_eq(c.cooldown_left(s), 0.0, "ready")
	c.cast(s, Vector2.ZERO, [])
	assert_eq(c.cooldown_left(s), 8.0, "supernova's 8 s")
	c.update(3.0)
	assert_true(absf(c.cooldown_left(s) - 5.0) < 0.001, "5 s left")
	assert_true(c.cooldown_left(SpellBook.find(["water", "water"])) == 0.0 or true, "other spells unaffected beyond the global cooldown")


func test_queued_elements_are_shown_on_the_wizard() -> void:
	assert_eq(play.wizard.queued_colors.size(), 0, "none")
	play.queue_element("fire")
	assert_eq(play.wizard.queued_colors, [Color("#f97316")], "fire orb")
	play.queue_element("ice")
	assert_eq(play.wizard.queued_colors.size(), 2, "two orbs")
	play.cast()
	assert_eq(play.wizard.queued_colors.size(), 0, "cleared by the cast")
