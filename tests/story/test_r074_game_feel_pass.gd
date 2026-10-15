extends "res://harness/test_case.gd"

const F := preload("res://tests/support/arena_fixture.gd")
const M := preload("res://tests/support/main_fixture.gd")
const SpellBook := preload("res://scripts/core/spell_book.gd")
const ArenaSim := preload("res://scripts/core/arena_sim.gd")

var main


func after_test() -> void:
	if main:
		main.free()
		main = null


# --- impact frames
func test_an_impact_is_two_frames_inverted_then_black_and_white() -> void:
	main = M.make(tree)
	var im = main.view.director.impact
	assert_not_null(im)
	im.trigger(Color("#ff8040"))
	assert_eq(im.frames_left, 2)
	im.update(1.0 / 60.0)
	assert_eq(im.mode, 0.0, "the first frame is inverted")
	assert_eq(im.strength, 1.0)
	im.update(1.0 / 60.0)
	assert_eq(im.mode, 1.0, "the second is hard black and white")
	im.update(1.0 / 60.0)
	assert_eq(im.strength, 0.0, "then it is gone")
	assert_true(not im.rect.visible)


func test_impact_frames_burst_at_most_once_every_four_tenths() -> void:
	main = M.make(tree)
	var im = main.view.director.impact
	im.trigger(Color.WHITE)
	var shown: int = im.bursts
	im.update(0.1)
	im.trigger(Color.WHITE)
	assert_eq(im.bursts, shown, "inside 0.4 s: ignored")
	im.trigger(Color.WHITE, true)
	assert_eq(im.bursts, shown + 1, "forced: allowed")
	im.update(0.5)
	im.update(0.5)
	im.trigger(Color.WHITE)
	assert_eq(im.bursts, shown + 2, "after 0.4 s: allowed")
	im.reduced_motion = true
	im.update(0.5)
	im.trigger(Color.WHITE, true)
	assert_eq(im.bursts, shown + 2, "reduced motion: never")


func test_a_slam_release_and_a_combos_first_cast_trigger_one() -> void:
	main = M.make(tree)
	var d = main.view.director
	var n: int = d.impact.bursts
	d.on_event({"type": "cast", "mode": "aim", "shape": "area", "name": "X", "key": "fire+fire", "els": ["fire"],
		"color": Color.RED, "pos": Vector2.ZERO, "dir": Vector2(0, -1), "from_queue": true, "is_new": false, "distinct": 1,
		"style": "slam", "weight": 0.9}, main.sim)
	assert_eq(d.impact.bursts, n + 1, "slam weight 0.9")
	d.impact.update(1.0)
	d.on_event({"type": "cast", "mode": "aim", "shape": "bolt", "name": "X", "key": "earth+fire", "els": ["fire", "earth"],
		"color": Color.RED, "pos": Vector2.ZERO, "dir": Vector2(0, -1), "from_queue": true, "is_new": true, "distinct": 2,
		"style": "thrust", "weight": 0.4}, main.sim)
	assert_eq(d.impact.bursts, n + 2, "the first cast of a combo")
	d.impact.update(1.0)
	d.on_event({"type": "cast", "mode": "aim", "shape": "bolt", "name": "X", "key": "earth+fire", "els": ["fire", "earth"],
		"color": Color.RED, "pos": Vector2.ZERO, "dir": Vector2(0, -1), "from_queue": true, "is_new": false, "distinct": 2,
		"style": "thrust", "weight": 0.4}, main.sim)
	assert_eq(d.impact.bursts, n + 2, "a light repeat: none")
	d.on_event({"type": "playerDeath", "pos": Vector2.ZERO}, main.sim)
	assert_eq(d.impact.bursts, n + 3, "the player's death ignores the limit")


# --- heavy shots fly an arc
func test_a_bomb_lobs_bounces_once_and_bursts_on_landing() -> void:
	var s := F.make()
	s.player.pos = Vector2(0, 8)
	var def := {"name": "Bomb", "shape": "bolt", "speed": 16, "explode": 2.8, "radius": 0.32, "mult": 1.9}
	var sp := SpellBook.make_spell(["fire", "water"], def, 1.0, "fire+water")
	s.cast_resolved(sp, {"aim": Vector2(0, -6)}, "aim")
	var b = s.shots[0]
	assert_true(b.arc, "heavy: it flies an arc")
	assert_true(b.y >= 1.1 and b.vy > 2.0)
	var bounces := 0
	var exploded := false
	var peak: float = b.y
	for i in 240:
		var ev := s.step(F.input([], Vector2.ZERO, Vector2(0, -6)), F.DT)
		bounces += F.of_type(ev, "bounce").size()
		exploded = exploded or F.of_type(ev, "explode").size() > 0
		if not s.shots.is_empty():
			peak = maxf(peak, s.shots[0].y)
		if exploded:
			break
	assert_eq(bounces, 1, "one bounce")
	assert_true(exploded, "it bursts when it lands the second time")
	assert_true(peak > 1.15, "it rose: %s" % peak)


func test_a_boulder_bounces_twice_then_rolls() -> void:
	var s := F.make()
	s.player.pos = Vector2(0, 8)
	var sp := SpellBook.make_spell(["earth", "fire"], {"name": "Boulder", "shape": "boulder", "speed": 11, "mult": 1.0}, 1.0, "x")
	s.cast_resolved(sp, {"aim": Vector2(0, -6)}, "aim")
	var b = s.shots[0]
	assert_true(b.arc)
	assert_eq(b.bounces, 2)
	var bounces := 0
	for i in 90:
		bounces += F.of_type(s.step(F.input([], Vector2.ZERO, Vector2(0, -6)), F.DT), "bounce").size()
	assert_eq(bounces, 2)


func test_a_light_bolt_flies_flat() -> void:
	var s := F.make()
	var sp := SpellBook.make_spell(["lightning"], {"name": "Zap", "shape": "bolt", "speed": 24, "mult": 1.0}, 1.0, "lightning")
	s.cast_resolved(sp, {"aim": Vector2(0, -6)}, "aim")
	assert_true(not s.shots[0].arc)


# --- the shot's look
func test_a_bolt_squashes_on_launch_and_stretches_along_its_flight() -> void:
	main = M.make(tree)
	var sp := SpellBook.make_spell(["lightning"], {"name": "Zap", "shape": "bolt", "speed": 24, "mult": 1.0, "life": 3.0}, 1.0, "lightning")
	main.sim.player.pos = Vector2(0, 8)
	main.sim.cast_resolved(sp, {"aim": Vector2(0, -6)}, "aim")
	M.frames(main, 1)
	var id: int = main.sim.shots[0].id
	var obj: Node3D = main.view.shot_views[id]["obj"]
	var wide: Vector3 = obj.scale
	assert_true(wide.x > 0.85, "just launched: still wide: %s" % wide)
	M.frames(main, 10)
	assert_true(obj.scale.x < wide.x and obj.scale.z > wide.z, "it narrows and lengthens from the launch squash")
	assert_true(obj.scale.z > obj.scale.x * 2.0, "in flight: long along the path: %s" % obj.scale)
	assert_true(obj.scale.z <= 3.3, "up to about x3.2")
	var vol: float = obj.scale.x * obj.scale.y * obj.scale.z
	assert_true(vol > 0.7 and vol < 1.4, "the volume is kept: %s" % vol)


# --- hit reactions
func test_a_hit_enemy_squashes_wobbles_and_settles() -> void:
	main = M.make(tree)
	var e = main.sim.spawn("thrall", Vector2(0, -3), 100.0, 0.0)
	e.atk_cd = 99
	M.frames(main, 40)
	var v: Dictionary = main.view.enemy_views[e.id]
	assert_true(absf(v["hit"]["sq"]) < 0.01, "at rest")
	e.kvel += Vector2(0, -8)
	e.flash = 0.14
	M.frames(main, 3)
	assert_true(absf(v["hit"]["sq"]) > 0.02 or absf(v["hit"]["lean"]) > 0.02, "it reacts to the shove: %s" % v["hit"])
	assert_true(absf(v["hit"]["lean"]) <= 0.5 + 0.001, "the lean is capped")
	M.frames(main, 120)
	assert_true(absf(v["hit"]["sq"]) < 0.02 and absf(v["hit"]["lean"]) < 0.02, "it settles: %s" % v["hit"])
