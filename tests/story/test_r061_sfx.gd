extends "res://harness/test_case.gd"

const M := preload("res://tests/support/main_fixture.gd")
const Sfx := preload("res://scripts/audio/sfx.gd")
const Controls := preload("res://scripts/core/controls.gd")

const AT := Vector2(2, -5)

var main
var sfx


func before_each() -> void:
	main = M.make(tree)
	main.sim.player.pos = Vector2.ZERO
	sfx = main.sfx
	sfx.settings_path = "user://test_settings.cfg"
	sfx.set_muted(false)
	sfx.trace = []


func after_test() -> void:
	main.free()
	DirAccess.remove_absolute(ProjectSettings.globalize_path("user://test_settings.cfg"))


func _keys() -> Array:
	return sfx.trace.map(func(p): return p["key"])


# Every event type ArenaSim can emit, read from its source.
func _sim_event_types() -> Array:
	var src := FileAccess.get_file_as_string("res://scripts/core/arena_sim.gd")
	var re := RegEx.new()
	re.compile("_ev\\(\"([a-zA-Z]+)\"")
	var out := ["hit"] # emitted as _ev("hurt" if is_p else "hit")
	for m in re.search_all(src):
		if not out.has(m.get_string(1)):
			out.append(m.get_string(1))
	return out


func test_every_event_type_has_a_sound_or_is_silent() -> void:
	var silent: Array = sfx.manifest["silent"]
	for t in _sim_event_types():
		assert_true(Sfx.ROUTED.has(t) or silent.has(t), "event %s has a sound or is listed silent" % t)


func test_every_sound_has_files_that_exist() -> void:
	var sounds: Dictionary = sfx.manifest["sounds"]
	assert_true(sounds.size() >= 40, "a full set of sounds")
	for k in sounds:
		assert_true(sounds[k]["files"].size() >= 1, "%s has a clip" % k)
		for f in sounds[k]["files"]:
			assert_true(ResourceLoader.exists(f), "%s exists" % f)
		assert_true(sfx.streams(k).size() == sounds[k]["files"].size(), "%s clips load" % k)


func test_casting_queues_and_blasts_play_their_sounds() -> void:
	main.sim.spawn("hexcaller", Vector2(0, -6)).atk_cd = 99
	M.frames(main, 1, {"aim": Vector2(0, -6), "actions": ["el:fire"]})
	var chime: Array = sfx.trace.filter(func(p): return p["key"] == "chime")
	assert_eq(chime.size(), 1, "queueing chimes once")
	assert_true(absf(chime[0]["pitch"] - Sfx.NOTE["fire"] / Sfx.BASE_NOTE) < 0.001, "on fire's note")
	sfx.trace = []
	M.frames(main, 1, {"aim": Vector2(0, -6), "actions": ["cast"]})
	assert_true(_keys().has("cast_fire"), "the cast sounds its element")
	for k in _keys():
		assert_true(sfx.manifest["sounds"].has(k), "%s is in the manifest" % k)
	sfx.trace = []
	sfx.consume([{"type": "explode", "pos": AT, "r": 2.4, "els": ["fire"], "big": true, "color": Color.WHITE, "key": "fire"}], main.sim)
	var boom: Array = sfx.trace.filter(func(p): return p["key"] == "explode_big")
	assert_eq(boom.size(), 1, "a big explosion booms")
	assert_true(boom[0]["pos"] is Vector3 and Vector2(boom[0]["pos"].x, boom[0]["pos"].z).distance_to(AT) < 0.01, "where it happened")


func test_combos_ring_a_chord_and_new_spells_a_fanfare() -> void:
	sfx.consume([{"type": "cast", "els": ["fire", "lightning"], "key": "fire+lightning", "name": "Thunderflare", "color": Color.WHITE,
		"pos": Vector2.ZERO, "dir": Vector2(0, -1), "shape": "bolt", "mode": "aim", "from_queue": true, "is_new": true}], main.sim)
	var notes: Array = sfx.trace.filter(func(p): return p["key"] == "chime")
	assert_eq(notes.size(), 2, "one chord note per element")
	assert_true(notes[1]["delay"] > notes[0]["delay"], "notes roll in one after another")
	assert_true(_keys().has("combo_thump") and _keys().has("fanfare"), "a thump, and a fanfare for a new spell")


func test_swarms_are_throttled() -> void:
	var ev := {"type": "explode", "pos": AT, "r": 2.4, "els": ["fire"], "big": false, "color": Color.WHITE, "key": "fire"}
	sfx.consume([ev, ev, ev], main.sim)
	assert_eq(_keys().filter(func(k): return k == "explode_small").size(), 1, "three blasts in one frame boom once")
	sfx.update(0.2)
	sfx.consume([ev], main.sim)
	assert_eq(_keys().filter(func(k): return k == "explode_small").size(), 2, "later ones boom again")


func test_a_missing_clip_plays_nothing_without_an_error() -> void:
	sfx.add_sound("ghost", {"files": ["res://audio/sfx/does_not_exist.ogg"], "db": 0, "pitch": [1, 1], "throttle": 0, "bus": "SFX", "positional": false})
	assert_true(not sfx.play("ghost"), "nothing to play")
	assert_true(not sfx.play("no_such_key"), "unknown keys are ignored")


func test_m_mutes_and_the_volume_is_kept() -> void:
	var key := InputEventKey.new()
	key.physical_keycode = KEY_M
	key.pressed = true
	assert_eq(Controls.action_for(key), "mute", "M is the mute key")
	main._unhandled_input(key)
	assert_true(sfx.muted, "M mutes")
	assert_true(not sfx.play("impact", AT), "muted sounds don't play")
	main._unhandled_input(key)
	assert_true(not sfx.muted, "M again unmutes")
	sfx.set_volume(0.3)
	var cfg := ConfigFile.new()
	assert_eq(cfg.load("user://test_settings.cfg"), OK, "settings saved")
	assert_true(absf(cfg.get_value("audio", "volume", 1.0) - 0.3) < 0.001, "volume saved")
	assert_true(absf(AudioServer.get_bus_volume_db(AudioServer.get_bus_index("SFX")) - linear_to_db(0.3)) < 0.01, "SFX bus follows the volume")


func test_the_pause_screen_sets_the_volume() -> void:
	main.sim.mode = "paused"
	main.tick(1.0 / 60.0)
	var slider: HSlider = main.hud.volume_slider
	assert_true(slider != null and slider.is_visible_in_tree(), "a volume slider on the pause screen")
	slider.value = 0.5
	assert_true(absf(sfx.volume - 0.5) < 0.001, "it sets the sound volume")


func test_the_sfx_bus_is_compressed() -> void:
	var i := AudioServer.get_bus_index("SFX")
	assert_true(i > 0, "an SFX bus")
	var has_comp := false
	for k in AudioServer.get_bus_effect_count(i):
		has_comp = has_comp or AudioServer.get_bus_effect(i, k) is AudioEffectCompressor
	assert_true(has_comp, "with a compressor")
	assert_true(AudioServer.get_bus_index("UI") > 0, "and a UI bus")
