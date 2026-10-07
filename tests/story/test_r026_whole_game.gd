extends "res://harness/test_case.gd"

const GameSession = preload("res://scripts/core/game_session.gd")
const Bot = preload("res://tests/support/bot.gd")

const PATH := "user://test_r026_session.json"
const ORDER := ["tundra", "pine", "keep", "volcano", "bog", "cavern"]

var plays: Array = []


func after_test() -> void:
	for p in plays:
		p.free_nodes()
	if FileAccess.file_exists(PATH):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(PATH))


func test_a_bot_beats_the_whole_game_through_the_real_loop() -> void:
	var s = GameSession.new(PATH)
	s.new_game()
	s.select_wizard("ember_pyromancer")  # fire affinity: +30% on the bot's fire spells
	var log := []
	for id in ORDER:
		assert_true(s.campaign.is_unlocked(id), "%s is open when the bot gets there" % id)
		var r: Dictionary = Bot.play_zone(s, id)
		if r["play"] == null:
			assert_true(false, "%s was locked: %s" % [id, str(log)])
			break
		plays.append(r["play"])
		log.append("%s %s %.0fs hp%d casts%d" % [id, r["state"], r["seconds"], r["play"].wizard.health.current, r["casts"]])
		assert_eq(r["state"], "complete", "%s -> %s" % [id, str(log)])
		assert_true(s.campaign.is_complete(id), "%s recorded" % id)
	assert_true(s.campaign.all_complete(), "all six zones: " + str(log))
	assert_true(s.ending_played(), "the ending played")
	for f in ["rune_fragment_1", "rune_fragment_2", "rune_fragment_3"]:
		assert_true(s.inventory.has_item(f), "holding " + f)
	print("BOT ", log)

	var again = GameSession.new(PATH)
	assert_true(again.continue_game(), "the finished game can be continued")
	assert_true(again.campaign.all_complete() and again.ending_played(), "and is still finished")
	assert_eq(again.available_wizards().size(), 6, "the shade is unlocked after the ending")
