extends "res://harness/test_case.gd"

const F := preload("res://tests/support/arena_fixture.gd")
const SpellBook := preload("res://scripts/core/spell_book.gd")
const ArenaSim := preload("res://scripts/core/arena_sim.gd")

const ROLES := ["destroyer", "controller", "guardian", "trickster", "arcanist"]


func _sim() -> ArenaSim:
	return F.make()


# The pick-th spell of `shape` in a role's book, as a cast-ready spell.
func _spell(role: String, shape: String, pick := 0) -> Dictionary:
	var n := 0
	var own := SpellBook.role_spells(role)
	for k in own:
		if own[k]["shape"] == shape:
			if n == pick:
				return SpellBook.make_spell(k.split("+"), own[k], 1.0, k + "@" + role)
			n += 1
	return {}


# Casts `sp` now (no windup), in mode "aim", "nova" or "self"; returns the events.
func _cast_spell(s: ArenaSim, sp: Dictionary, aim := Vector2(0, -6), how := "aim") -> Array:
	s.player.energy = s.player.max_energy
	s.player.cd["cast"] = 0.0
	s.player.shape_cd.clear()
	s.events = []
	s.cast_resolved(sp, {"aim": aim, "move": Vector2.ZERO, "actions": []}, how)
	return s.events


func test_blink_teleports_toward_the_aim_and_is_briefly_invulnerable() -> void:
	var s := _sim()
	var sp := _spell("trickster", "blink")
	assert_true(not sp.is_empty())
	s.player.pos = Vector2(0, 5)
	var ev := _cast_spell(s, sp, Vector2(0, -3))
	assert_true(s.player.pos.y < 3.0, "moved toward the aim: %s" % s.player.pos)
	assert_true(s.player.st.invuln >= 0.29, "0.3 s invuln")
	assert_eq(F.of_type(ev, "blink").size(), 1)
	assert_true(s.player.pos.length() <= ArenaSim.BOUND, "inside the court")


func test_blink_is_clamped_to_the_court() -> void:
	var s := _sim()
	var sp := _spell("trickster", "blink")
	s.player.pos = Vector2(0, 13)
	_cast_spell(s, sp, Vector2(0, 40))
	assert_true(s.player.pos.length() <= ArenaSim.BOUND + 0.01, str(s.player.pos))


func test_dash_moves_the_caster_and_hits_what_it_passes() -> void:
	var s := _sim()
	var sp := _spell("destroyer", "dash")
	assert_true(not sp.is_empty())
	var e := s.spawn("thrall", Vector2(0, 1.5), 3.0, 0.0)
	e.atk_cd = 99
	s.player.pos = Vector2(0, 5)
	_cast_spell(s, sp, Vector2(0, -3))
	var hp0 := e.hp
	F.run(s, 0.3)
	assert_true(s.player.pos.y < 3.5, "dashed: %s" % s.player.pos)
	assert_true(e.hp < hp0 or e.hp <= 0, "the thrall in the path was hit")


func test_decoys_draw_the_enemies_and_end() -> void:
	var s := _sim()
	var sp := _spell("trickster", "decoy")
	assert_true(not sp.is_empty())
	s.player.pos = Vector2(0, 6)
	var e := s.spawn("thrall", Vector2(0, 0), 100.0, 1.0)
	e.state = "chase"
	var ev := _cast_spell(s, sp, Vector2(0, -3))
	assert_true(s.decoys.size() >= 1, "a double stands")
	assert_true(F.of_type(ev, "decoy").size() >= 1)
	var D = s.decoys[0]
	assert_true(s.decoys.has(s._target_of(e)), "the enemy goes for a double")
	var life: float = D.life
	F.run(s, life + 0.5)
	assert_eq(s.decoys.size(), 0, "doubles end")


func test_swap_trades_places_with_the_enemy_ahead_and_stuns_it() -> void:
	var s := _sim()
	var sp := _spell("trickster", "swap")
	assert_true(not sp.is_empty())
	s.player.pos = Vector2(0, 6)
	var e := s.spawn("thrall", Vector2(0, 0), 1000.0, 0.0)
	e.atk_cd = 99
	var ev := _cast_spell(s, sp, Vector2(0, -3))
	assert_true(s.player.pos.y < 2.0, "the caster is where the enemy stood: %s" % s.player.pos)
	assert_true(e.pos.y > 4.0, "the enemy is where the caster stood: %s" % e.pos)
	assert_true(e.st.stun >= 0.85, "stunned 0.9 s")
	assert_eq(F.of_type(ev, "swap").size(), 1)


func test_swap_with_nothing_ahead_blinks() -> void:
	var s := _sim()
	var sp := _spell("trickster", "swap")
	s.player.pos = Vector2(0, 6)
	var ev := _cast_spell(s, sp, Vector2(0, -3))
	assert_true(s.player.pos.y < 6.0)
	assert_eq(F.of_type(ev, "blink").size(), 1)


func test_guard_sets_statuses_on_the_caster() -> void:
	var seen := {}
	for r in ROLES:
		var own := SpellBook.role_spells(r)
		for k in own:
			var d: Dictionary = own[k]
			if d["shape"] != "guard":
				continue
			var s2 := _sim()
			s2.player.hp = 50.0
			var sp := SpellBook.make_spell(k.split("+"), d, 1.0, k + "@" + r)
			_cast_spell(s2, sp)
			for f in ["ward", "armor", "reflect", "invuln", "stoneskin", "haste", "amp", "regen"]:
				if d.has(f):
					assert_true(s2.player.st.get(f) > 0, "%s sets %s" % [k, f])
					seen[f] = true
			if d.has("heal"):
				assert_true(s2.player.hp > 50.0, "%s heals" % k)
				seen["heal"] = true
			if d.has("revive"):
				assert_true(s2.player.revives >= 1, "%s revives" % k)
				seen["revive"] = true
	for f in ["ward", "armor", "invuln", "heal", "regen"]:
		assert_true(seen.has(f), "some guard spell uses " + f)


func test_amp_boosts_the_next_spells() -> void:
	var s := _sim()
	s.player.st.amp = 5.0
	var sp := SpellBook.make_spell(["fire"], {"name": "Test", "shape": "bolt", "mult": 1.0}, 1.0, "fire")
	_cast_spell(s, sp)
	assert_true(absf(s.shots[0].sp["power"] - 1.35) < 0.001, "amped x1.35")


func test_all_225_role_spells_cast_aimed_nova_and_self() -> void:
	var casts := 0
	for r in ROLES:
		var own := SpellBook.role_spells(r)
		for k in own:
			for how in ["aim", "nova", "self"]:
				var s := _sim()
				s.player.pos = Vector2(0, 4)
				var e := s.spawn("thrall", Vector2(1, -1), 200.0, 0.0)
				e.atk_cd = 99
				var sp := SpellBook.make_spell(k.split("+"), own[k], 1.0, k + "@" + r)
				var ev := _cast_spell(s, sp, Vector2(0, -3), how)
				F.run(s, 0.5)
				assert_eq(F.of_type(ev, "cast").size(), 1, "%s %s" % [k + "@" + r, how])
				casts += 1
	assert_eq(casts, 675)


func test_the_view_draws_the_doubles_and_clears_them() -> void:
	var M := preload("res://tests/support/main_fixture.gd")
	var main = M.make(tree)
	var sp := _spell("trickster", "decoy")
	main.sim.player.energy = main.sim.player.max_energy
	main.sim.cast_resolved(sp, {"aim": Vector2(0, -6)}, "aim")
	M.frames(main, 2)
	assert_true(main.view.decoy_views.size() >= 1, "a ghost stands for each double")
	main.sim.decoys.clear()
	M.frames(main, 2)
	assert_eq(main.view.decoy_views.size(), 0)
	main.free()
