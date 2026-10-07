extends "res://harness/test_case.gd"

const MainScene := preload("res://scenes/Main.tscn")

var main: Node2D
var hud: Hud
var player: Player


func before_each() -> void:
	main = MainScene.instantiate()
	tree.root.add_child(main)
	hud = main.get_node("UI/HUD")
	player = main.get_node("Actors/Player")
	await tree.process_frame
	await tree.process_frame


func after_test() -> void:
	tree.root.remove_child(main)
	main.free()


func _letters(row: HBoxContainer) -> Array:
	return row.get_children().map(func(b: Node) -> String: return b.spell.get_key_label())


func _queued_ids() -> Array:
	return hud.slots.filter(func(s: Control) -> bool: return s.spell != null).map(func(s: Control) -> StringName: return s.spell.id)


func test_the_top_of_the_screen_shows_title_objective_and_info() -> void:
	assert_eq(hud.title_label.text, "Hvitmark Tundra", "title")
	assert_eq(hud.objective_title_label.text, "CROSS THE SHELF", "objective")
	assert_true(hud.objective_detail_label.text.contains("North Bridge"), "objective detail")
	assert_true(hud.info_label.text.contains("HP 100/100") and hud.info_label.text.contains("Enemies: 0"), "info line: " + hud.info_label.text)


func test_the_hp_bar_tracks_the_player() -> void:
	assert_eq(hud.hp_bar.value, 100.0, "full")
	player.take_damage(35.0)
	assert_eq(hud.hp_bar.value, 65.0, "bar")
	assert_eq(hud.hp_label.text, "HP 65 / 100", "label")
	assert_true(hud.info_label.text.contains("HP 65/100"), "info line follows too")
	player.heal(10.0)
	assert_eq(hud.hp_bar.value, 75.0, "heal")


func test_the_spell_panel_has_both_keyboard_rows_in_order() -> void:
	assert_eq(_letters(hud.top_row), ["Q", "W", "E", "R", "T"], "top row")
	assert_eq(_letters(hud.bottom_row), ["A", "S", "D", "F"], "bottom row")
	assert_eq(hud.buttons.size(), 9, "nine buttons")


func test_the_queue_area_has_four_empty_slots_at_first() -> void:
	assert_eq(hud.slots.size(), 4, "four slots")
	assert_eq(_queued_ids(), [], "all empty")
	assert_true(hud.queue_title.text.contains("empty"), "title says empty")
	assert_eq(hud.hint_label.text, "SPACE = CAST    ESC = CLEAR", "key hints")


func test_queued_spells_appear_in_the_queue_area_in_order() -> void:
	for k in [KEY_Q, KEY_W, KEY_F, KEY_T]:
		player.caster.queue_spell(SpellDatabase.for_key(k))
	assert_eq(_queued_ids(), [&"frost_bolt", &"ice_lance", &"arcane_shield", &"glacial_burst"], "Q W F T")
	assert_true(hud.slots[0].is_next, "the first slot is marked next")
	assert_true(not hud.slots[1].is_next, "only the first")
	assert_true(hud.queue_title.text.contains("Frost Bolt"), "title names the next spell: " + hud.queue_title.text)


func test_casting_and_clearing_update_the_queue_area() -> void:
	player.caster.queue_spell(SpellDatabase.for_key(KEY_Q))
	player.caster.queue_spell(SpellDatabase.for_key(KEY_A))
	player.caster.cast_next()
	assert_eq(_queued_ids(), [&"fire_bolt"], "the cast spell left the queue")
	assert_true(hud.slots[0].is_next, "the next one moved up")
	player.caster.clear_queue()
	assert_eq(_queued_ids(), [], "cleared")


func test_a_pressed_spell_button_flashes() -> void:
	var button = hud.buttons[&"frost_nova"]
	assert_eq(button._flash, 0.0, "idle")
	player.caster.queue_spell(SpellDatabase.for_key(KEY_E))
	assert_eq(button._flash, 1.0, "pulsed")


func test_messages_for_full_empty_and_cast() -> void:
	player.caster.cast_next()
	assert_true(hud.toast_label.text.contains("empty"), "empty: " + hud.toast_label.text)
	for k in [KEY_Q, KEY_W, KEY_E, KEY_R, KEY_T]:
		player.caster.queue_spell(SpellDatabase.for_key(k))
	assert_true(hud.toast_label.text.contains("full"), "full: " + hud.toast_label.text)
	player.caster.cast_next()
	assert_true(hud.toast_label.text.contains("Frost Bolt"), "cast: " + hud.toast_label.text)
	assert_true(hud.toast_label.modulate.a > 0.5, "visible")


func test_the_movement_hint_follows_the_scheme() -> void:
	assert_true(hud.move_hint_label.text.contains("ARROWS"), "arrows by default")
	player.set_wasd_movement(true)
	assert_true(hud.move_hint_label.text.contains("WASD") and hud.move_hint_label.text.contains("Shift"), "wasd: " + hud.move_hint_label.text)


func test_the_bottom_panel_is_centred_at_the_bottom_and_fits_the_screen() -> void:
	var panel: PanelContainer = hud.get_node("BottomPanel")
	assert_eq(panel.anchor_left, 0.5, "bottom-centre anchors")
	assert_eq(panel.anchor_top, 1.0, "bottom-centre anchors")
	var screen := hud.get_viewport_rect()
	var r := panel.get_global_rect()
	assert_true(absf(r.get_center().x - screen.get_center().x) < 2.0, "horizontally centred")
	assert_true(r.end.y <= screen.end.y and r.position.x >= 0.0 and r.end.x <= screen.end.x, "fully on screen")
	assert_true(r.size.y >= 100.0, "tall enough for two rows of buttons")
	var rows_height: float = hud.top_row.size.y + hud.bottom_row.size.y
	assert_true(rows_height <= r.size.y, "buttons fit inside the panel")
