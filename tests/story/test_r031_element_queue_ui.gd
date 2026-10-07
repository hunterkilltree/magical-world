extends "res://harness/test_case.gd"

const Scene = preload("res://ui/element_queue.tscn")
const SpellBook = preload("res://scripts/core/spell_book.gd")

const FRAME := "UIBottomCenter/BackgroundFrame"
const SLOTS := "UIBottomCenter/BackgroundFrame/SlotContainer"

var ui = null
var in_tree := false


func _make(parent_to_tree := false):
	ui = Scene.instantiate()
	if parent_to_tree:
		tree.root.add_child(ui)
		in_tree = true
	ui.setup()
	return ui


func after_test() -> void:
	if ui != null and is_instance_valid(ui):
		if in_tree:
			tree.root.remove_child(ui)
		ui.free()
	ui = null
	in_tree = false


func _slot(i: int) -> TextureRect:
	return ui.get_node("%s/Slot%d" % [SLOTS, i])


func _icon(i: int) -> TextureRect:
	return ui.get_node("%s/Slot%d/ElementIcon" % [SLOTS, i])


# ---- scene structure -------------------------------------------------------

func test_the_node_tree_is_exactly_as_specified() -> void:
	_make()
	assert_true(ui is CanvasLayer, "root is a CanvasLayer")
	assert_true(ui.get_node("UIBottomCenter") is MarginContainer, "UIBottomCenter")
	assert_true(ui.get_node(FRAME) is TextureRect, "BackgroundFrame")
	assert_true(ui.get_node(SLOTS) is HBoxContainer, "SlotContainer")
	for i in range(1, 6):
		assert_true(_slot(i) is TextureRect, "Slot%d" % i)
		assert_true(_icon(i) is TextureRect, "Slot%d/ElementIcon" % i)
	assert_eq(ui.get_node(SLOTS).get_child_count(), 5, "five slots, no more")
	assert_eq(ui.get_node("UIBottomCenter").get_child_count(), 1, "frame is the only child")


func test_the_bar_is_anchored_bottom_centre_with_bottom_padding() -> void:
	_make()
	var m: MarginContainer = ui.get_node("UIBottomCenter")
	assert_eq(m.anchor_left, 0.5, "left anchor")
	assert_eq(m.anchor_right, 0.5, "right anchor")
	assert_eq(m.anchor_top, 1.0, "top anchor")
	assert_eq(m.anchor_bottom, 1.0, "bottom anchor")
	assert_eq(m.grow_horizontal, Control.GROW_DIRECTION_BOTH, "grows both ways horizontally")
	assert_eq(m.grow_vertical, Control.GROW_DIRECTION_BEGIN, "grows upward")
	assert_true(m.get_theme_constant("margin_bottom") > 0, "bottom padding")


func test_the_slot_container_is_centred_in_the_frame() -> void:
	_make()
	var box: HBoxContainer = ui.get_node(SLOTS)
	assert_eq(box.alignment, BoxContainer.ALIGNMENT_CENTER, "centre alignment")
	assert_eq(box.anchor_right, 1.0, "fills the frame horizontally")
	assert_eq(box.anchor_bottom, 1.0, "fills the frame vertically")


func test_icons_scale_to_fit_their_slots() -> void:
	_make()
	for i in range(1, 6):
		var icon := _icon(i)
		assert_eq(icon.expand_mode, TextureRect.EXPAND_IGNORE_SIZE, "slot %d ignores texture size" % i)
		assert_eq(icon.stretch_mode, TextureRect.STRETCH_KEEP_ASPECT_CENTERED, "slot %d keeps aspect, centred" % i)
		assert_eq(icon.anchor_right, 1.0, "slot %d icon fills its slot" % i)
		assert_eq(icon.mouse_filter, Control.MOUSE_FILTER_IGNORE, "icons do not eat clicks")
		assert_true(_slot(i).texture != null, "slot %d has its frame texture" % i)
	assert_true(ui.get_node(FRAME).texture != null, "frame texture")


func test_every_placeholder_texture_exists() -> void:
	_make()
	assert_true(ResourceLoader.exists(ui.SLOT_FRAME), ui.SLOT_FRAME)
	assert_true(ResourceLoader.exists(ui.BACKGROUND_FRAME), ui.BACKGROUND_FRAME)
	for name in ui.ELEMENT_TEXTURES:
		assert_true(ResourceLoader.exists(ui.ELEMENT_TEXTURES[name]), "%s: %s" % [name, ui.ELEMENT_TEXTURES[name]])


func test_the_element_map_covers_exactly_the_games_nine_elements() -> void:
	_make()
	var game := SpellBook.elements().map(func(e): return e.capitalize())
	var keys: Array = ui.ELEMENT_TEXTURES.keys()
	keys.sort()
	game.sort()
	assert_eq(keys, game, "same nine names")
	assert_eq(ui.Element.size(), 9, "enum has nine entries")
	assert_eq(ui.Element.keys()[0], "FIRE", "enum starts with FIRE")


# ---- behaviour ---------------------------------------------------------------

func test_add_element_fills_the_next_empty_slot() -> void:
	_make()
	assert_true(ui.add_element("Fire"), "added")
	assert_true(ui.add_element("Water"), "added")
	assert_eq(ui.queue, PackedStringArray(["Fire", "Water"]), "queue contents")
	assert_true(_icon(1).texture != null and _icon(1).visible, "slot 1 shows fire")
	assert_true(_icon(2).texture != null and _icon(2).visible, "slot 2 shows water")
	assert_true(_icon(1).texture != _icon(2).texture, "different icons")
	assert_true(_icon(3).texture == null and not _icon(3).visible, "slot 3 still empty")


func test_names_are_case_insensitive() -> void:
	_make()
	assert_true(ui.add_element("fire"), "lower case")
	assert_true(ui.add_element("LIGHTNING"), "upper case")
	assert_eq(ui.queue, PackedStringArray(["Fire", "Lightning"]), "normalised")


func test_the_queue_holds_at_most_five() -> void:
	_make()
	for e in ["Fire", "Water", "Earth", "Nature", "Ice"]:
		assert_true(ui.add_element(e), e)
	assert_true(not ui.add_element("Wind"), "sixth refused")
	assert_eq(ui.queue.size(), 5, "still five")


func test_unknown_elements_are_refused() -> void:
	_make()
	assert_true(not ui.add_element("Cheese"), "unknown")
	assert_true(not ui.add_element(""), "empty")
	assert_eq(ui.queue.size(), 0, "nothing queued")


func test_clear_queue_empties_every_slot() -> void:
	_make()
	ui.add_element("Fire")
	ui.add_element("Dark")
	ui.clear_queue()
	assert_eq(ui.queue.size(), 0, "queue empty")
	for i in range(1, 6):
		assert_true(_icon(i).texture == null and not _icon(i).visible, "slot %d empty" % i)
		assert_eq(_slot(i).scale, Vector2.ONE, "slot %d scale reset" % i)
	assert_true(ui.add_element("Ice"), "usable again")
	assert_true(_icon(1).texture != null, "refills from slot 1")


func test_a_pop_animation_scales_the_slot_up_and_back() -> void:
	_make(true)
	ui.add_element("Fire")
	assert_eq(_slot(1).scale, Vector2.ONE, "starts at 1")
	var tw: Tween = ui.tween_for(0)
	assert_true(tw != null and tw.is_valid(), "a tween is running")
	tw.custom_step(ui.POP_TIME)
	assert_true(absf(_slot(1).scale.x - 1.2) < 0.001, "up to 1.2 (got %f)" % _slot(1).scale.x)
	tw.custom_step(ui.POP_TIME)
	assert_true(absf(_slot(1).scale.x - 1.0) < 0.001, "back to 1.0 (got %f)" % _slot(1).scale.x)
	assert_eq(_slot(2).scale, Vector2.ONE, "other slots untouched")


func test_fewer_slots_hide_the_rest() -> void:
	ui = Scene.instantiate()
	ui.max_slots = 2
	ui.setup()
	assert_true(_slot(1).visible and _slot(2).visible, "two shown")
	for i in range(3, 6):
		assert_true(not _slot(i).visible, "slot %d hidden" % i)
	assert_true(ui.add_element("Fire") and ui.add_element("Ice"), "two fit")
	assert_true(not ui.add_element("Wind"), "no third")
	var narrow: float = ui.get_node(FRAME).custom_minimum_size.x
	var wide = Scene.instantiate()
	wide.setup()
	assert_true(narrow < wide.get_node(FRAME).custom_minimum_size.x, "the bar shrinks with the slots")
	wide.free()


func test_sync_mirrors_an_external_queue() -> void:
	_make()
	ui.sync_queue(["fire"])
	assert_eq(ui.queue, PackedStringArray(["Fire"]), "one")
	ui.sync_queue(["fire", "ice"])
	assert_eq(ui.queue, PackedStringArray(["Fire", "Ice"]), "extended")
	ui.sync_queue(["water"])
	assert_eq(ui.queue, PackedStringArray(["Water"]), "rewritten, not appended")
	assert_true(_icon(2).texture == null, "old second slot cleared")
	ui.sync_queue([])
	assert_eq(ui.queue.size(), 0, "emptied")
