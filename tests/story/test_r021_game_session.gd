extends "res://harness/test_case.gd"

const GameSession = preload("res://scripts/core/game_session.gd")

const PATH := "user://test_r021_session.json"

var plays: Array = []


func after_test() -> void:
	for p in plays:
		p.free_nodes()
	if FileAccess.file_exists(PATH):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(PATH))


func _enter(s, id: String):
	var p = s.enter_zone(id)
	if p != null:
		plays.append(p)
	return p


func test_new_game_starts_at_the_tundra_with_nothing() -> void:
	var s = GameSession.new(PATH)
	s.new_game()
	var choices: Array = s.zone_choices()
	assert_eq(choices.size(), 6, "six zones")
	assert_eq(choices[0]["id"], "tundra", "first zone")
	assert_eq(choices[0]["name"], "Hvítmark Tundra", "name")
	assert_true(choices[0]["unlocked"] and not choices[0]["complete"], "tundra open")
	for i in range(1, 6):
		assert_true(not choices[i]["unlocked"], "%s locked" % choices[i]["id"])
	assert_true(s.inventory.items.is_empty(), "empty inventory")
	assert_true(not s.has_save(), "nothing saved yet")


func test_locked_zones_cannot_be_entered() -> void:
	var s = GameSession.new(PATH)
	s.new_game()
	assert_true(_enter(s, "keep") == null, "keep is locked")
	assert_true(_enter(s, "nowhere") == null, "unknown zone")
	assert_true(_enter(s, "tundra") != null, "tundra opens")


func test_completing_a_zone_autosaves_and_continue_restores_it() -> void:
	var s = GameSession.new(PATH)
	s.new_game()
	s.campaign.complete("tundra")
	var play = _enter(s, "pine")
	var cache: Vector2i = play.grid.cells_of("C")[0]
	play.grid.open_loot(cache, s.inventory)
	play.run.update(play.grid.world_to_cell(play.wizard.position))
	assert_true(play.run.done, "pine objective met")
	assert_true(s.has_save(), "autosaved on completion")

	var s2 = GameSession.new(PATH)
	assert_true(s2.continue_game(), "continues")
	assert_true(s2.campaign.is_complete("pine"), "pine complete")
	assert_true(s2.campaign.is_unlocked("keep") and s2.campaign.is_unlocked("bog"), "next zones open")
	assert_true(s2.inventory.has_item("rune_fragment_1"), "fragment kept")
	var replay = _enter(s2, "pine")
	assert_true(replay.grid.is_looted(cache), "cache still looted on re-entry")


func test_looted_caches_persist_across_re_entry_in_a_session() -> void:
	var s = GameSession.new(PATH)
	s.new_game()
	s.campaign.complete("tundra")
	var first = _enter(s, "pine")
	var cache: Vector2i = first.grid.cells_of("C")[0]
	first.grid.open_loot(cache, s.inventory)
	s.leave_zone(first)
	var again = _enter(s, "pine")
	assert_true(again.grid.is_looted(cache), "still looted")
	assert_eq(again.grid.open_loot(cache, s.inventory), {}, "cannot loot twice")


func test_continue_without_a_save_does_nothing() -> void:
	var s = GameSession.new(PATH)
	assert_true(not s.continue_game(), "no save")
	assert_true(not s.campaign.is_complete("tundra"), "untouched")


func test_finishing_the_game_is_remembered() -> void:
	var s = GameSession.new(PATH)
	s.new_game()
	s.campaign.restore(["tundra", "pine", "keep", "volcano", "bog"])
	for id in ["rune_fragment_1", "rune_fragment_2", "rune_fragment_3"]:
		s.inventory.add({"id": id, "kind": "rune_fragment"})
	assert_true(not s.ending_played(), "not yet")
	var play = _enter(s, "cavern")
	assert_true(play.boss != null, "the Hollow Warden waits")
	play.boss.take_damage(99999)
	assert_true(s.ending_played(), "ending played")
	var s2 = GameSession.new(PATH)
	assert_true(s2.continue_game() and s2.ending_played(), "remembered after reload")
	assert_true(s2.campaign.all_complete(), "all six zones complete")
