extends "res://harness/test_case.gd"

const ArenaSim := preload("res://scripts/core/arena_sim.gd")
const Bot := preload("res://tests/support/arena_bot.gd")
const DT := 1.0 / 60.0


func test_the_bot_clears_wave_three() -> void:
	var cleared := 0
	var s := ArenaSim.new("ember_pyromancer", 11)
	s.mode = "play"
	var bot := Bot.new(s)
	var t := 0.0
	while t < 300.0 and s.mode == "play":
		for ev in s.step(bot.input(), DT):
			if ev["type"] == "waveClear":
				cleared = ev["n"]
		if cleared >= 3:
			break
		t += DT
	print("bot: cleared wave %d at %.0f s, hp %.0f, kills %d, self-inflicted %.0f" % [cleared, t, s.player.hp, s.kills, s.stats["self_dmg"]])
	assert_true(cleared >= 3, "cleared wave %d before %s" % [cleared, s.mode])
