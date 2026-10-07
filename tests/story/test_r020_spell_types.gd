extends "res://harness/test_case.gd"

const Caster = preload("res://scripts/core/caster.gd")
const SpellBook = preload("res://scripts/core/spell_book.gd")
const Health = preload("res://scripts/core/health.gd")
const Enemy = preload("res://scripts/core/enemy.gd")
const Boss = preload("res://scripts/core/boss.gd")
const Player = preload("res://scripts/player.gd")
const ZoneGrid = preload("res://scripts/core/zone_grid.gd")
const ZonePlay = preload("res://scripts/core/zone_play.gd")
const Inventory = preload("res://scripts/core/inventory.gd")


class Dummy:
	extends RefCounted
	var position := Vector2.ZERO
	var hp := 5000
	var rooted := 0.0
	func take_damage(n: int) -> void:
		hp -= n
	func root(seconds: float) -> void:
		rooted = seconds


class Actor:
	extends RefCounted
	var health = load("res://scripts/core/health.gd").new()


var nodes: Array = []
var plays: Array = []


func after_test() -> void:
	for n in nodes:
		n.free()
	for p in plays:
		p.free_nodes()


func _spell(a: String, b: String) -> Dictionary:
	return SpellBook.find([a, b])


func _dummy(x: float, y: float) -> Dummy:
	var d := Dummy.new()
	d.position = Vector2(x, y)
	return d


# ---- Health: shield, regen, invulnerability --------------------------------

func test_health_shield_absorbs_then_expires() -> void:
	var h = Health.new()
	h.add_shield(300, 8.0)
	h.take_damage(250)
	assert_eq(h.current, 100, "fully absorbed")
	h.take_damage(100)
	assert_eq(h.current, 50, "50 absorbed, 50 through")
	var h2 = Health.new()
	h2.add_shield(300, 8.0)
	h2.update(9.0)
	h2.take_damage(40)
	assert_eq(h2.current, 60, "shield expired")


func test_health_regen_heals_and_is_capped() -> void:
	var h = Health.new()
	h.current = 20
	h.add_regen(30.0, 4.0)
	h.update(1.0)
	assert_eq(h.current, 50, "30 per second")
	h.update(5.0)
	assert_eq(h.current, 100, "capped at max")
	h.take_damage(10)
	h.update(1.0)
	assert_eq(h.current, 90, "regen ended")


func test_health_invulnerability_and_heal() -> void:
	var h = Health.new()
	h.make_invulnerable(5.0)
	h.take_damage(999)
	assert_eq(h.current, 100, "ignored")
	h.update(6.0)
	h.take_damage(30)
	assert_eq(h.current, 70, "mortal again")
	h.heal(1000)
	assert_eq(h.current, 100, "heal capped")
	var dead = Health.new()
	dead.take_damage(999)
	dead.heal(50)
	assert_eq(dead.current, 0, "the dead stay dead")


# ---- projectile / beam / vortex -------------------------------------------

func test_projectile_hits_the_nearest_target_with_half_splash() -> void:
	var near := _dummy(200, 0)
	var mate := _dummy(240, 0)
	var far := _dummy(900, 0)
	var hits: int = Caster.new().cast(_spell("fire", "dark"), Vector2.ZERO, [far, mate, near], Vector2.RIGHT, Actor.new())
	assert_eq(hits, 2, "impact plus splash")
	assert_eq(near.hp, 5000 - 880, "full damage")
	assert_eq(mate.hp, 5000 - 440, "half damage within the radius")
	assert_eq(far.hp, 5000, "out of range")


func test_projectile_with_nothing_in_range_hits_nothing() -> void:
	assert_eq(Caster.new().cast(_spell("fire", "dark"), Vector2.ZERO, [_dummy(900, 0)], Vector2.RIGHT, Actor.new()), 0, "no hits")


func test_beam_pierces_everything_along_the_facing() -> void:
	var a := _dummy(100, 0)
	var b := _dummy(300, 10)
	var off := _dummy(200, 200)
	var behind := _dummy(-100, 0)
	var beyond := _dummy(700, 0)
	var hits: int = Caster.new().cast(_spell("fire", "lightning"), Vector2.ZERO, [a, b, off, behind, beyond], Vector2.RIGHT, Actor.new())
	assert_eq(hits, 2, "two in the line")
	assert_eq(a.hp, 5000 - 920, "first")
	assert_eq(b.hp, 5000 - 920, "second (pierced)")
	assert_true(off.hp == 5000 and behind.hp == 5000 and beyond.hp == 5000, "off-axis, behind and too far are untouched")


func test_beam_follows_the_aim_direction() -> void:
	var up := _dummy(0, -200)
	var right := _dummy(200, 0)
	Caster.new().cast(_spell("fire", "lightning"), Vector2.ZERO, [up, right], Vector2.UP, Actor.new())
	assert_eq(up.hp, 5000 - 920, "hit above")
	assert_eq(right.hp, 5000, "not to the right")


func test_vortex_pulls_targets_in_then_damages() -> void:
	var t := _dummy(100, 0)
	var close := _dummy(30, 0)
	var out := _dummy(400, 0)
	var hits: int = Caster.new().cast(_spell("fire", "wind"), Vector2.ZERO, [t, close, out], Vector2.RIGHT, Actor.new())
	assert_eq(hits, 2, "two inside")
	assert_eq(t.position, Vector2(36, 0), "pulled 64 px toward the centre")
	assert_eq(close.position, Vector2.ZERO, "pulled no further than the centre")
	assert_eq(t.hp, 5000 - 700, "damaged")
	assert_true(out.position == Vector2(400, 0) and out.hp == 5000, "outside untouched")


# ---- summon ----------------------------------------------------------------

func test_summon_damages_and_roots() -> void:
	var t := _dummy(60, 0)
	var out := _dummy(500, 0)
	Caster.new().cast(_spell("water", "nature"), Vector2.ZERO, [t, out], Vector2.RIGHT, Actor.new())
	assert_eq(t.hp, 5000 - 380, "damaged")
	assert_eq(t.rooted, 5.0, "rooted for the spell's duration")
	assert_true(out.hp == 5000 and out.rooted == 0.0, "outside untouched")


func test_a_rooted_thrall_cannot_move_until_it_wears_off() -> void:
	var e = Enemy.new()
	nodes.append(e)
	var w = Player.new()
	nodes.append(w)
	w.position = Vector2(200, 0)
	e.root(2.0)
	e.step(1.0, w)
	assert_eq(e.position, Vector2.ZERO, "rooted")
	e.step(1.0, w)
	assert_true(e.position.x > 0.0, "free again")


func test_bosses_cannot_be_rooted_but_still_take_damage() -> void:
	var g = ZoneGrid.load_zone("keep")
	var b = Boss.spawn_for(g)
	nodes.append(b)
	b.position = Vector2(60, 0)
	assert_true(not b.has_method("root"), "no root on bosses")
	var hits: int = Caster.new().cast(_spell("water", "nature"), Vector2.ZERO, [b], Vector2.RIGHT, Actor.new())
	assert_eq(hits, 1, "still hit")
	assert_eq(b.health.current, b.health.max_health - 380, "took damage")


func test_death_forest_steals_health() -> void:
	var actor := Actor.new()
	actor.health.max_health = 1000
	actor.health.current = 1
	var t := _dummy(60, 0)
	Caster.new().cast(_spell("dark", "nature"), Vector2.ZERO, [t], Vector2.RIGHT, actor)
	assert_eq(t.hp, 5000 - 650, "damaged")
	assert_eq(actor.health.current, 1 + 195, "30% of 650 stolen")


# ---- barrier / buff --------------------------------------------------------

func test_barrier_shields_the_wizard() -> void:
	var actor := Actor.new()
	var t := _dummy(60, 0)
	assert_eq(Caster.new().cast(_spell("earth", "water"), Vector2.ZERO, [t], Vector2.RIGHT, actor), 0, "cast, no target hit")
	assert_eq(t.hp, 5000, "barriers do not hurt")
	actor.health.take_damage(250)
	assert_eq(actor.health.current, 100, "mountain_rise absorbs 300")


func test_rainbow_mist_regenerates() -> void:
	var actor := Actor.new()
	actor.health.current = 20
	Caster.new().cast(_spell("water", "light"), Vector2.ZERO, [], Vector2.RIGHT, actor)
	actor.health.update(1.0)
	assert_eq(actor.health.current, 100, "120 per second, capped")


func test_crystal_garden_shields() -> void:
	var actor := Actor.new()
	Caster.new().cast(_spell("earth", "light"), Vector2.ZERO, [], Vector2.RIGHT, actor)
	actor.health.take_damage(300)
	assert_eq(actor.health.current, 100, "absorbs 350")


func test_world_tree_makes_the_wizard_invulnerable_for_its_duration() -> void:
	var actor := Actor.new()
	Caster.new().cast(_spell("nature", "nature"), Vector2.ZERO, [], Vector2.RIGHT, actor)
	actor.health.take_damage(999)
	assert_eq(actor.health.current, 100, "invulnerable")
	actor.health.update(13.0)
	actor.health.take_damage(999)
	assert_true(actor.health.is_dead(), "12 seconds later he is not")


# ---- whole book + boost ----------------------------------------------------

func test_every_spell_in_the_book_casts_cleanly() -> void:
	assert_eq(SpellBook.all().size(), 29, "29 spells")
	for s in SpellBook.all():
		var r: int = Caster.new().cast(s, Vector2.ZERO, [_dummy(50, 0)], Vector2.RIGHT, Actor.new())
		assert_true(r >= 0, "%s casts" % s["id"])


func test_damage_boost_scales_every_type() -> void:
	var t := _dummy(50, 0)
	Caster.new().cast(_spell("fire", "fire"), Vector2.ZERO, [t], Vector2.RIGHT, Actor.new(), 1.5)
	assert_eq(t.hp, 5000 - 1275, "aoe 850 x 1.5")
	var u := _dummy(50, 0)
	Caster.new().cast(_spell("fire", "dark"), Vector2.ZERO, [u], Vector2.RIGHT, Actor.new(), 1.5)
	assert_eq(u.hp, 5000 - 1320, "projectile 880 x 1.5")
	var actor := Actor.new()
	Caster.new().cast(_spell("earth", "water"), Vector2.ZERO, [], Vector2.RIGHT, actor, 2.0)
	actor.health.take_damage(500)
	assert_eq(actor.health.current, 100, "shield 300 x 2 absorbs 500, with 100 left over")


func test_zone_play_aims_beams_along_the_wizards_facing() -> void:
	var p = ZonePlay.create(ZoneGrid.load_zone("tundra"), Inventory.new())
	plays.append(p)
	var thrall = p.enemies[0]
	p.wizard.facing = Vector2.UP
	thrall.position = p.wizard.position + Vector2(0, -150)
	p.enemies[1].position = p.wizard.position + Vector2(300, 0)
	p.queue_element("fire")
	p.queue_element("lightning")
	assert_true(p.cast() >= 1, "beam fires")
	assert_true(thrall.health.is_dead(), "thrall above is hit")
	assert_true(not p.enemies[1].health.is_dead(), "thrall to the right is not")
