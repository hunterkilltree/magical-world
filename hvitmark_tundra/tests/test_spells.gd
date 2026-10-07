extends "res://harness/test_case.gd"

const EXPECTED := {
	KEY_Q: "Frost Bolt", KEY_W: "Ice Lance", KEY_E: "Frost Nova", KEY_R: "Arcane Missile", KEY_T: "Glacial Burst",
	KEY_A: "Fire Bolt", KEY_S: "Lightning", KEY_D: "Heal", KEY_F: "Arcane Shield",
}


func test_there_are_nine_spells_on_the_right_keys() -> void:
	assert_eq(SpellDatabase.all().size(), 9, "nine spells")
	for key in EXPECTED:
		var s := SpellDatabase.for_key(key)
		assert_true(s != null, "a spell for %s" % OS.get_keycode_string(key))
		if s != null:
			assert_eq(s.display_name, EXPECTED[key], "%s is %s" % [OS.get_keycode_string(key), EXPECTED[key]])


func test_keys_ids_and_colours_are_unique() -> void:
	var keys := {}
	var ids := {}
	var colours := {}
	for s in SpellDatabase.all():
		keys[s.keyboard_key] = true
		ids[s.id] = true
		colours[s.icon_color.to_html()] = true
	assert_eq(keys.size(), 9, "unique keys")
	assert_eq(ids.size(), 9, "unique ids")
	assert_eq(colours.size(), 9, "unique colours")


func test_every_spell_has_the_requested_fields() -> void:
	for s in SpellDatabase.all():
		assert_true(s.id != &"" and s.display_name != "", "%s has id and name" % s.id)
		assert_true(s.damage > 0.0, "%s damage" % s.id)
		assert_true(s.cooldown > 0.0, "%s cooldown" % s.id)
		assert_true(s.cast_range >= 0.0 and s.projectile_speed >= 0.0, "%s range / speed" % s.id)


func test_effect_types_match_the_brief() -> void:
	var by := func(k: Key) -> Spell: return SpellDatabase.for_key(k)
	for k in [KEY_Q, KEY_W, KEY_R, KEY_T, KEY_A]:
		assert_eq(by.call(k).effect_type, Spell.EffectType.PROJECTILE, "%s is a projectile" % OS.get_keycode_string(k))
	assert_eq(by.call(KEY_E).effect_type, Spell.EffectType.NOVA, "E is a nova")
	assert_eq(by.call(KEY_S).effect_type, Spell.EffectType.LIGHTNING, "S is lightning")
	assert_eq(by.call(KEY_D).effect_type, Spell.EffectType.HEAL, "D heals")
	assert_eq(by.call(KEY_F).effect_type, Spell.EffectType.SHIELD, "F shields")
	assert_true(by.call(KEY_W).projectile_radius < by.call(KEY_Q).projectile_radius, "Ice Lance is narrower than Frost Bolt")
	assert_true(by.call(KEY_T).projectile_radius > by.call(KEY_Q).projectile_radius * 2.0, "Glacial Burst is large")


func test_each_spell_has_a_matching_input_action() -> void:
	for s in SpellDatabase.all():
		var action := s.get_input_action()
		assert_true(InputMap.has_action(action), "action %s exists" % action)
		var found := false
		for ev in InputMap.action_get_events(action):
			if ev is InputEventKey and (ev as InputEventKey).physical_keycode == s.keyboard_key:
				found = true
		assert_true(found, "%s is bound to its key" % action)


func test_lookups() -> void:
	assert_eq(SpellDatabase.for_id(&"heal").keyboard_key, KEY_D, "by id")
	assert_true(SpellDatabase.for_id(&"nope") == null, "unknown id")
	assert_true(SpellDatabase.for_key(KEY_Z) == null, "unknown key")
	assert_eq(SpellDatabase.ROW_TOP.size() + SpellDatabase.ROW_BOTTOM.size(), 9, "HUD rows cover every spell")
