extends "res://harness/test_case.gd"

const M := preload("res://tests/support/main_fixture.gd")
const SpellBook := preload("res://scripts/core/spell_book.gd")

var main


func after_test() -> void:
	if main:
		main.free()
		main = null


func _pick(id: String) -> void:
	main = M.make(tree, "menu")
	main.hud.roster_buttons[id].pressed.emit()
	main.hud.start_pressed.emit()
	M.frames(main, 1)


func test_a_windup_ring_closes_on_the_cursor() -> void:
	_pick("stone_druid")
	var v = main.view
	assert_true(not v._wind_ring.visible, "none while idle")
	M.frames(main, 1, {"actions": ["el:earth", "el:earth", "cast"], "aim": Vector2(0, -4)})
	assert_true(not main.sim.player.wind.is_empty())
	assert_true(v._wind_ring.visible, "shown while winding up")
	var s0: float = v._wind_ring.scale.x
	M.frames(main, 4, {"aim": Vector2(0, -4)})
	assert_true(v._wind_ring.scale.x < s0, "it closes: %s -> %s" % [s0, v._wind_ring.scale.x])
	M.frames(main, 60, {"aim": Vector2(0, -4)})
	assert_true(not v._wind_ring.visible, "gone after the release")


func test_cooldown_tiles_show_seconds_left() -> void:
	_pick("ember_pyromancer")
	var p = main.sim.player
	p.cd["dodge"] = 0.8
	p.cd_max["dodge"] = 1.0
	M.frames(main, 1)
	assert_eq(main.hud.tiles["dodge"].remaining_text, "0.8")
	p.cd["dodge"] = 0.0
	M.frames(main, 1)
	assert_eq(main.hud.tiles["dodge"].remaining_text, "")


func test_the_cast_tile_follows_a_role_spells_own_recharge() -> void:
	_pick("stone_druid")
	var p = main.sim.player
	M.frames(main, 1, {"actions": ["el:earth", "el:nature", "cast"]})
	M.frames(main, 40)
	var sp := SpellBook.resolve(["earth", "nature"], "stone_druid")
	var key := ArenaSim_recharge(sp)
	if sp["cd"] > 0.45:
		assert_true(p.shape_cd.get(key, 0.0) > 0.0, "the spell is recharging")
		M.frames(main, 1, {"actions": ["el:earth", "el:nature"]})
		assert_true(main.hud.tiles["cast"].value < 1.0, "and the tile shows it")


func ArenaSim_recharge(sp: Dictionary) -> String:
	return preload("res://scripts/core/arena_sim.gd").recharge_key(sp)


func test_the_grimoire_is_grouped_by_role() -> void:
	_pick("storm_conduit")
	M.frames(main, 1, {"actions": ["pause"]})
	var heads := []
	for c in main.hud.grimoire_box.get_children():
		if c is Label and c.has_meta("group"):
			heads.append(c.text)
	assert_eq(heads.size(), 2, str(heads))
	assert_true(heads[0].contains("Shared"), heads[0])
	assert_true(heads[1].contains("Trickster"), heads[1])
	# the court book (no role) has one list, no headings
	main.free()
	main = M.make(tree)
	main.hud._fill_grimoire({}, "")
	for c in main.hud.grimoire_box.get_children():
		assert_true(not (c is Label and c.has_meta("group")), "no heading in the court book")
