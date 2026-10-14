extends "res://harness/test_case.gd"

const SpellBook := preload("res://scripts/core/spell_book.gd")
const ArenaSim := preload("res://scripts/core/arena_sim.gd")
const F := preload("res://tests/support/arena_fixture.gd")

# Matrix row -> our recipe. Rows 2, 4, 6, 13, 18, 20 live on doubled three-element recipes
# because their pairs keep the handoff's spells; row 9 (Thermal Shock) is a reaction (R-058).
const ROWS := {
	1: ["fire", "fire"], 2: ["fire", "water", "water"], 3: ["fire", "nature"], 4: ["earth", "earth", "fire"],
	5: ["fire", "wind"], 6: ["fire", "lightning", "lightning"], 7: ["fire", "dark"], 8: ["fire", "light"],
	10: ["water", "water"], 11: ["water", "wind"], 12: ["water", "nature"], 13: ["earth", "water", "water"],
	15: ["water", "dark"], 16: ["water", "light"], 17: ["ice", "ice"], 18: ["earth", "earth", "water"],
	19: ["earth", "nature"], 20: ["earth", "earth", "lightning"], 21: ["earth", "dark"], 22: ["earth", "light"],
	23: ["earth", "wind"], 24: ["light", "light"], 25: ["light", "lightning"], 26: ["dark", "dark"],
	27: ["dark", "wind"], 28: ["dark", "nature"], 29: ["nature", "nature"],
}
const NAMES := {
	1: "Supernova", 2: "Steam Bomb", 3: "Wildfire", 4: "Magma Burst", 5: "Fire Tornado", 6: "Plasma Spear",
	7: "Hellfire", 8: "Solar Flare", 10: "Tsunami", 11: "Whirlpool", 12: "Living Vines", 13: "Mud Prison",
	15: "Abyss Water", 16: "Rainbow Mist", 17: "Glacier Prison", 18: "Mountain Rise", 19: "Forest Fortress",
	20: "Magnetic Field", 21: "Graveyard", 22: "Crystal Garden", 23: "Sandstorm", 24: "Divine Judgement",
	25: "Photon Railgun", 26: "Black Hole", 27: "Shadow Storm", 28: "Death Forest", 29: "World Tree",
}


func test_every_matrix_spell_has_a_recipe() -> void:
	for row in ROWS:
		var sp := SpellBook.resolve(ROWS[row])
		assert_eq(sp["name"], NAMES[row], "row %d" % row)
		assert_eq(int(sp["def"].get("matrix", 0)), row, "row %d is tagged" % row)


func test_the_handoff_keeps_its_pairs() -> void:
	var keep := {["fire", "water"]: "Scalding Steam", ["earth", "fire"]: "Molten Core", ["fire", "lightning"]: "Thunderflare",
		["lightning", "water"]: "Storm Pool", ["ice", "water"]: "Hoarfrost Field", ["earth", "lightning"]: "Lodestone",
		["earth", "water"]: "Mudslide"}
	for els in keep:
		assert_eq(SpellBook.resolve(els)["name"], keep[els], str(els))
	assert_eq(SpellBook.resolve(["fire", "water"])["def"]["shape"], "cone", "Scalding Steam is unchanged")


func test_radii_durations_and_cooldowns_follow_the_matrix() -> void:
	# 50 px = 1 m; durations in seconds; cooldowns x0.3.
	var want := {1: [180, 8], 3: [200, 7], 5: [150, 8], 11: [170, 7], 12: [130, 6], 16: [160, 10], 17: [150, 8],
		21: [110, 9], 23: [190, 7], 26: [200, 15], 27: [170, 7], 28: [180, 9], 29: [250, 20]}
	for row in want:
		var def: Dictionary = SpellBook.resolve(ROWS[row])["def"]
		assert_true(is_equal_approx(float(def["radius"]), want[row][0] / 50.0), "row %d radius %s" % [row, def["radius"]])
		assert_true(is_equal_approx(float(def["cd"]), want[row][1] * 0.3), "row %d cooldown %s" % [row, def["cd"]])
	assert_eq(SpellBook.resolve(ROWS[29])["def"]["life"], 12, "World Tree lasts 12 s")
	assert_eq(SpellBook.resolve(ROWS[26])["def"]["life"], 6, "Black Hole lasts 6 s")


func test_matrix_spells_recharge_on_their_own_timer() -> void:
	var s := F.make()
	F.cast(s, ["dark", "dark"], Vector2(0, -6))
	assert_true(s.player.shape_cd.has("dark+dark"), "Black Hole has its own recharge")
	assert_true(absf(s.player.shape_cd["dark+dark"] - 4.5) < 0.05, "15 s x 0.3")
	s.player.cd["cast"] = 0
	F.cast(s, ["lightning", "water"], Vector2(4, 0))
	assert_eq(s.areas.filter(func(a): return a.key == "lightning+water").size(), 1, "other areas are not blocked by it")
