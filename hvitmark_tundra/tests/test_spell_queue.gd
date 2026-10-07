extends "res://harness/test_case.gd"

var caster: SpellCaster


func before_each() -> void:
	caster = SpellCaster.new()


func after_test() -> void:
	caster.free()


func _action(name: String) -> InputEventAction:
	var ev := InputEventAction.new()
	ev.action = name
	ev.pressed = true
	return ev


func _key(code: Key, shift := false, echo := false) -> InputEventKey:
	var ev := InputEventKey.new()
	ev.physical_keycode = code
	ev.pressed = true
	ev.shift_pressed = shift
	ev.echo = echo
	return ev


func _ids() -> Array:
	return caster.queue.to_array().map(func(s: Spell) -> StringName: return s.id)


# ---- the queue data structure ------------------------------------------------------------------

func test_the_queue_holds_four_and_rejects_the_fifth() -> void:
	var q := SpellQueue.new()
	assert_eq(q.max_size, 4, "default maximum is 4")
	var rejected := [0]
	q.rejected_full.connect(func(_s: Spell) -> void: rejected[0] += 1)
	for k in [KEY_Q, KEY_W, KEY_E, KEY_R]:
		assert_true(q.push(SpellDatabase.for_key(k)), "accepted")
	assert_true(q.is_full(), "full")
	assert_true(not q.push(SpellDatabase.for_key(KEY_T)), "fifth refused")
	assert_eq(rejected[0], 1, "rejection signalled")
	assert_eq(q.size(), 4, "still four")


func test_the_queue_is_first_in_first_out() -> void:
	var q := SpellQueue.new()
	q.push(SpellDatabase.for_key(KEY_F))
	q.push(SpellDatabase.for_key(KEY_Q))
	assert_eq(q.peek().id, &"arcane_shield", "oldest is next")
	assert_eq(q.pop_next().id, &"arcane_shield", "pops oldest")
	assert_eq(q.pop_next().id, &"frost_bolt", "then the next")
	assert_true(q.pop_next() == null and q.peek() == null, "empty gives null")


func test_changes_are_signalled() -> void:
	var q := SpellQueue.new()
	var n := [0]
	q.changed.connect(func() -> void: n[0] += 1)
	q.push(SpellDatabase.for_key(KEY_Q))
	q.pop_next()
	q.clear()  # already empty: no signal
	q.push(SpellDatabase.for_key(KEY_W))
	q.clear()
	assert_eq(n[0], 4, "push, pop, push, clear")


# ---- keyboard input ----------------------------------------------------------------------------

func test_spell_keys_queue_their_spells_in_order() -> void:
	for a in ["spell_q", "spell_w", "spell_f", "spell_t"]:
		assert_true(caster.handle_event(_action(a)), a)
	assert_eq(_ids(), [&"frost_bolt", &"ice_lance", &"arcane_shield", &"glacial_burst"], "Q W F T")


func test_every_spell_key_works_through_a_real_key_event() -> void:
	for s in SpellDatabase.all():
		caster.queue.clear()
		assert_true(caster.handle_event(_key(s.keyboard_key)), "%s key" % s.get_key_label())
		assert_eq(_ids(), [s.id], "queued %s" % s.id)


func test_a_fifth_spell_is_rejected_and_announced() -> void:
	var rejected := []
	caster.queue_rejected.connect(func(s: Spell) -> void: rejected.append(s.id))
	for a in ["spell_q", "spell_w", "spell_e", "spell_r", "spell_t"]:
		caster.handle_event(_action(a))
	assert_eq(caster.queue.size(), 4, "four kept")
	assert_eq(rejected, [&"glacial_burst"], "T was refused")


func test_key_repeat_does_not_queue_extra_spells() -> void:
	caster.handle_event(_key(KEY_Q))
	assert_true(not caster.handle_event(_key(KEY_Q, false, true)), "echo ignored")
	assert_eq(caster.queue.size(), 1, "one spell")


func test_space_casts_the_next_spell_and_removes_it() -> void:
	var cast := []
	caster.spell_cast.connect(func(s: Spell) -> void: cast.append(s.id))
	caster.handle_event(_action("spell_q"))
	caster.handle_event(_action("spell_a"))
	assert_true(caster.handle_event(_action("cast_spell")), "space handled")
	assert_eq(cast, [&"frost_bolt"], "the first queued spell is cast")
	assert_eq(_ids(), [&"fire_bolt"], "and removed")


func test_space_on_an_empty_queue_says_so() -> void:
	var empty := [0]
	caster.cast_failed_empty.connect(func() -> void: empty[0] += 1)
	caster.handle_event(_action("cast_spell"))
	assert_eq(empty[0], 1, "told it was empty")


func test_escape_clears_the_queue() -> void:
	var cleared := [0]
	caster.queue_cleared.connect(func() -> void: cleared[0] += 1)
	caster.handle_event(_action("spell_q"))
	caster.handle_event(_action("spell_w"))
	caster.handle_event(_action("clear_queue"))
	assert_eq(caster.queue.size(), 0, "emptied")
	assert_eq(cleared[0], 1, "signalled")


func test_queue_changed_carries_the_current_queue() -> void:
	var last := [[]]  # a lambda cannot reassign a captured variable, so write into a container
	caster.queue_changed.connect(func(spells: Array[Spell]) -> void: last[0] = spells.map(func(s: Spell) -> StringName: return s.id))
	caster.handle_event(_action("spell_d"))
	caster.handle_event(_action("spell_s"))
	assert_eq(last[0], [&"heal", &"lightning"], "payload mirrors the queue")


# ---- WASD does not clash with movement ---------------------------------------------------------

func test_when_wasd_moves_those_four_spells_need_shift() -> void:
	caster.wasd_needs_shift = true
	assert_true(not caster.handle_event(_key(KEY_W)), "plain W moves, queues nothing")
	assert_true(not caster.handle_event(_key(KEY_A)), "plain A")
	assert_eq(caster.queue.size(), 0, "nothing queued")
	assert_true(caster.handle_event(_key(KEY_W, true)), "Shift+W casts Ice Lance")
	assert_true(caster.handle_event(_key(KEY_D, true)), "Shift+D")
	assert_eq(_ids(), [&"ice_lance", &"heal"], "queued with shift")


func test_other_spell_keys_are_unaffected_by_the_wasd_mode() -> void:
	caster.wasd_needs_shift = true
	for k in [KEY_Q, KEY_E, KEY_R, KEY_T, KEY_F]:
		assert_true(caster.handle_event(_key(k)), OS.get_keycode_string(k))
	assert_eq(caster.queue.size(), 4, "capped at four")


func test_by_default_wasd_keys_queue_spells() -> void:
	assert_true(not caster.wasd_needs_shift, "default: arrows move")
	assert_true(caster.handle_event(_key(KEY_W)), "W queues Ice Lance")
	assert_eq(_ids(), [&"ice_lance"], "queued")
