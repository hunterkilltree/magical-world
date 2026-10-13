extends "res://harness/test_case.gd"

const SpellBook := preload("res://scripts/core/spell_book.gd")
const Controls := preload("res://scripts/core/controls.gd")
const F := preload("res://tests/support/arena_fixture.gd")


func test_ten_elements_on_keys_one_to_zero() -> void:
	var keys := []
	for el in SpellBook.ORDER:
		assert_true(not SpellBook.element(el).is_empty(), el)
		keys.append(SpellBook.element(el)["key"])
		assert_true(Controls.ELEMENT_KEYS.has(el), "%s has a key" % el)
	assert_eq(keys, ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"])


func test_light_and_dark_cancel() -> void:
	var q := ["light", "water"]
	assert_eq(SpellBook.queue_element(q, "dark"), "cancel")
	assert_eq(q, ["water"])


func test_every_pair_and_double_has_a_spell() -> void:
	var els: Array = SpellBook.ORDER
	for i in els.size():
		assert_true(SpellBook.book().has(els[i] + "+" + els[i]), "double %s" % els[i])
		for j in range(i + 1, els.size()):
			if SpellBook.cancels(els[i]) == els[j]:
				continue
			var k := SpellBook.norm(els[i] + "+" + els[j])
			assert_true(SpellBook.book().has(k), "pair %s" % k)
	assert_eq(SpellBook.grimoire().size(), 74)


func test_the_original_recipes_come_back_by_name() -> void:
	var want := {
		["fire", "fire"]: "Supernova", ["water", "water"]: "Tsunami", ["dark", "dark"]: "Black Hole",
		["nature", "nature"]: "World Tree", ["light", "light"]: "Divine Judgement", ["fire", "nature"]: "Wildfire",
		["fire", "wind"]: "Fire Tornado", ["fire", "light"]: "Solar Flare", ["fire", "dark"]: "Hellfire",
		["water", "nature"]: "Living Vines", ["water", "wind"]: "Whirlpool", ["water", "light"]: "Rainbow Mist",
		["water", "dark"]: "Abyss Water", ["earth", "nature"]: "Forest Fortress", ["earth", "wind"]: "Sandstorm",
		["earth", "light"]: "Crystal Garden", ["earth", "dark"]: "Graveyard", ["light", "lightning"]: "Photon Railgun",
		["dark", "wind"]: "Shadow Storm", ["dark", "nature"]: "Death Forest", ["ice", "ice"]: "Glacier Prison",
	}
	for els in want:
		assert_eq(SpellBook.resolve(els)["name"], want[els], str(els))


func test_three_element_spells() -> void:
	var want := {
		["fire", "lightning", "wind"]: "Firestorm", ["earth", "fire", "lightning"]: "Meteor Shower",
		["ice", "water", "wind"]: "Absolute Zero", ["lightning", "arcane", "light"]: "Heaven's Lance",
		["water", "dark", "arcane"]: "Maelstrom", ["water", "nature", "light"]: "World Bloom",
		["nature", "water", "earth"]: "Ancient Grove", ["dark", "earth", "nature"]: "Necropolis",
		["wind", "fire", "nature"]: "Inferno Gale", ["wind", "lightning", "dark"]: "Night Tempest",
		["arcane", "fire", "lightning"]: "Starfall",
	}
	for els in want:
		assert_eq(SpellBook.resolve(els)["name"], want[els], str(els))


func test_the_new_elements_carry_their_effects() -> void:
	assert_true(SpellBook.resolve(["nature"])["payload"]["root"] > 0, "nature roots")
	assert_true(SpellBook.resolve(["wind"])["payload"]["gust"] > 0, "wind gusts")
	assert_true(SpellBook.resolve(["light"])["payload"]["blind"] > 0, "light blinds")
	var dark: Dictionary = SpellBook.resolve(["dark"])["payload"]
	assert_true(dark["curse"] > 0 and dark["drain"] > 0, "dark curses and drains")


func test_blind_enemies_cannot_attack_and_rooted_ones_cannot_move() -> void:
	var s := F.make()
	s.player.pos = Vector2.ZERO
	var th = s.spawn("thrall", Vector2(0, -1.4))
	th.atk_cd = 0
	th.st.blind = 2.0
	F.run(s, 1.0)
	assert_eq(s.player.hp, 100.0, "a blinded thrall never swings")
	var far = s.spawn("thrall", Vector2(3, 6))
	far.st.root = 1.0
	var at: Vector2 = far.pos
	F.run(s, 0.5)
	assert_true(far.pos.distance_to(at) < 0.05, "rooted")


func test_curse_and_drain() -> void:
	var s := F.make()
	var e = s.spawn("bulwark", Vector2(0, -8))
	s.player.hp = 50
	var pl: Dictionary = SpellBook.resolve(["dark"])["payload"]
	var hp0: float = e.hp
	s._apply_payload(e, pl)
	assert_true(is_equal_approx(hp0 - e.hp, pl["parts"]["dark"]), "first hit: not yet cursed")
	assert_true(e.st.curse > 0, "cursed")
	assert_true(s.player.hp > 50.0, "drained life back")
	hp0 = e.hp
	s._apply_payload(e, {"parts": {"fire": 10.0}, "els": ["fire"], "knock": 0.0})
	assert_true(is_equal_approx(hp0 - e.hp, 12.5), "cursed targets take x1.25: %s" % (hp0 - e.hp))
