# Court of Waves: the whole arena fight as pure logic (no scene tree), ported from the
# prototype's sim.js (story/design/court_of_waves/reference/game/sim.js).
#
# step(input, dt) advances one fixed 60 Hz tick and returns events (Dictionaries with a
# "type") for the 3D view and HUD; gameplay never reads the view. Positions are
# Vector2(x, z) on the ground plane; a facing angle `face` points along (sin, cos).
# input = {move: Vector2, aim: Vector2 (ground point), actions: ["el:fire", "cast", ...]}.
#
# All element reactions live in apply_payload(). Keep them there.
extends RefCounted

const SpellBook := preload("res://scripts/core/spell_book.gd")
const EnemyTypes := preload("res://scripts/core/enemy_types.gd")

const ARENA_R := 15.0
const BOUND := ARENA_R - 0.9
const TUNING := {
	"r": 0.42, "speed": 5.4, "hp": 100.0, "energy": 100.0, "regen": 18.0, "dodge_speed": 13.5,
	"dodge_time": 0.26, "dodge_cd": 1.0, "nova_cd": 3.0, "self_cd": 1.4, "nova_r": 3.4,
	"aim_range": 10.0, "wall_dist": 2.4,
}
# Payloads the arena itself deals.
const ENV := {
	"charged": {"parts": {"lightning": 5.0}, "shock": 0.2, "els": ["lightning"], "knock": 0.0},
	"frost": {"parts": {}, "chill": 1.0, "els": ["ice"], "knock": 0.0},
	"brush": {"parts": {"fire": 3.0}, "burn": 2.5, "burnDps": 5.0, "els": ["fire"], "knock": 0.0},
	"barrel": {"parts": {"fire": 22.0, "earth": 14.0}, "burn": 3.0, "burnDps": 6.0, "knock": 11.0, "els": ["fire", "earth"]},
	"rime": {"parts": {"ice": 3.0}, "chill": 1.0, "els": ["ice"], "knock": 0.0},
}


class Status:
	var burn := 0.0
	var burn_dps := 0.0
	var wet := 0.0
	var chill := 0.0
	var chill_t := 0.0
	var frozen := 0.0
	var shock := 0.0
	var slow := 0.0
	var stoneskin := 0.0
	var ward := 0.0
	var ward_t := 0.0
	var haste := 0.0
	var root := 0.0 # cannot move
	var blind := 0.0 # cannot start an attack
	var curse := 0.0 # takes x1.25 damage
	var regen := 0.0 # heals regen_hp per second while > 0 (player)
	var regen_hp := 0.0


# The player and every enemy. Player-only fields sit unused on enemies.
class Body:
	var id := 0
	var kind := "" # "player", "thrall", "bulwark", "hexcaller"
	var T := {} # enemy type data
	var pos := Vector2.ZERO
	var vel := Vector2.ZERO
	var kvel := Vector2.ZERO # knockback, decays
	var r := 0.4
	var mass := 1.0
	var hp := 0.0
	var max_hp := 0.0
	var speed := 0.0
	var resist := {}
	var face := 0.0
	var st := Status.new()
	var state := "chase" # spawn, chase, windup, strike, charge, recover
	var state_t := 0.0
	var atk_cd := 0.0
	var flash := 0.0
	var dot_acc := 0.0
	var strafe := 1.0
	var aim := Vector2(0, 1)
	var slam := Vector2.ZERO
	var hit_done := false
	# player
	var wizard := ""
	var alive := true
	var energy := 0.0
	var max_energy := 0.0
	var f := Vector2(0, -1) # facing
	var queue: Array = []
	var last: Array = []
	var cd := {"cast": 0.0, "nova": 0.0, "self": 0.0, "dodge": 0.0}
	var cd_max := {"cast": 0.3, "nova": 3.0, "self": 1.4, "dodge": 1.0}
	var shape_cd := {}
	var shape_max := {}
	var dodge := 0.0
	var dd := Vector2.ZERO
	var cast_t := 0.0
	var hurt_t := 0.0
	var cur_speed := 0.0
	var dead_t := 0.0


class Shot:
	var id := 0
	var kind := "bolt" # bolt, boulder, orb
	var owner := "player"
	var pos := Vector2.ZERO
	var vel := Vector2.ZERO
	var r := 0.24
	var life := 1.2
	var pierce := 0
	var hits: Array = []
	var sp := {}
	var color := Color.WHITE
	var els: Array = []
	var dmg := 0.0
	var evaded := false


class Area:
	var id := 0
	var pos := Vector2.ZERO
	var r := 3.0
	var life := 3.0
	var max_life := 3.0
	var tick := 0.5
	var tick_t := 0.0
	var delay := 0.0
	var delay_max := 0.0
	var pull := 0.0
	var burst := false
	var hits_all := false
	var els: Array = []
	var color := Color.WHITE
	var key := ""
	var name := ""
	var sp := {}
	var heal := 0.0 # heals the player standing inside, per tick
	var swallow := false # eats enemy shots inside
	var repeat := 0 # more bursts still to fall (Meteor Shower)
	var interval := 0.0
	var scatter := 0.0
	var center := Vector2.ZERO


class Wall:
	var id := 0
	var pos := Vector2.ZERO
	var r := 0.5
	var hp := 100.0
	var max_hp := 100.0
	var life := 9.0
	var max_life := 9.0
	var mat := "stone"
	var chill := false
	var touch_t := 0.0
	var regen := 0.0 # living walls grow back (hp/s)
	var reflect := false # crystal walls throw enemy shots back


# Pillars, puddles (water/charged/frozen), brush (dry/burning/ash) and rune barrels.
class Prop:
	var id := ""
	var type := ""
	var pos := Vector2.ZERO
	var r := 1.0
	var state := ""
	var t := 0.0
	var tick_t := 0.0
	var spread_t := 0.0
	var alive := true
	var fuse := 0.0


var mode := "menu" # menu, play, paused, dead
var t := 0.0
var wave := 0
var kills := 0
var score := 0
var wave_t := 2.2
var spawn_q: Array = []
var spawn_t := 0.0
var wave_info := {}
var hitstop := 0.0
var nid := 1
var remaining := 0
var player: Body
var enemies: Array = []
var shots: Array = []
var areas: Array = []
var walls: Array = []
var pillars: Array = []
var puddles: Array = []
var brush: Array = []
var barrels: Array = []
var events: Array = []
var stats := {"casts": 0, "dealt": 0.0, "taken": 0.0, "self_dmg": 0.0, "found": {}}
var rng := RandomNumberGenerator.new()

var _zap: Dictionary


static func gates() -> Array:
	var out := []
	for k in [0.0, 0.5, 1.0, 1.5]:
		out.append(Vector2(sin(k * PI) * 13.2, -cos(k * PI) * 13.2))
	return out


func _init(wizard_id := "ember_pyromancer", seed_value := -1) -> void:
	if seed_value >= 0:
		rng.seed = seed_value
	else:
		rng.randomize()
	_zap = SpellBook.make_spell(["lightning"], {"name": "Discharge", "shape": "chain", "mult": 0.9})
	player = Body.new()
	player.id = 0
	player.kind = "player"
	player.wizard = wizard_id
	player.pos = Vector2(0, 3.5)
	player.r = TUNING["r"]
	player.mass = 1.2
	player.hp = TUNING["hp"]
	player.max_hp = TUNING["hp"]
	player.energy = TUNING["energy"]
	player.max_energy = TUNING["energy"]
	player.cd_max = {"cast": 0.3, "nova": TUNING["nova_cd"], "self": TUNING["self_cd"], "dodge": TUNING["dodge_cd"]}
	_make_props()


func _make_props() -> void:
	var i := 0
	for d in [[-6.2, -5.4, 0.75], [6.4, -5.0, 0.75], [-6.6, 5.2, 0.75], [6.0, 5.8, 0.75], [0, -7, 0.6]]:
		pillars.append(_prop("pil%d" % i, "pillar", d[0], d[1], d[2], ""))
		i += 1
	i = 0
	for d in [[-4.2, 1.6, 1.9], [4.4, -1.8, 2.0], [1.0, 8.4, 1.6], [-1.5, -10.2, 1.7]]:
		puddles.append(_prop("pud%d" % i, "puddle", d[0], d[1], d[2], "water"))
		i += 1
	i = 0
	for d in [[4.8, 3.2, 1.6], [-5.0, -2.2, 1.5], [-9.4, 2.2, 1.6], [9.6, -1.4, 1.5], [2.4, -9.6, 1.4]]:
		brush.append(_prop("bru%d" % i, "brush", d[0], d[1], d[2], "dry"))
		i += 1
	i = 0
	for d in [[2.6, -3.6], [-3.2, -6.8], [-9.0, -6.0], [9.4, 6.0], [-2.2, 10.6]]:
		barrels.append(_prop("bar%d" % i, "barrel", d[0], d[1], 0.42, ""))
		i += 1


func _prop(id: String, type: String, x: float, z: float, r: float, state: String) -> Prop:
	var o := Prop.new()
	o.id = id
	o.type = type
	o.pos = Vector2(x, z)
	o.r = r
	o.state = state
	return o


func step(inp: Dictionary, dt: float) -> Array:
	events = []
	for a in inp.get("actions", []):
		_act(a, inp)
	if mode != "play" and mode != "dead":
		return events
	if hitstop > 0:
		hitstop -= dt
		dt *= 0.2
	t += dt
	var p := player
	if p.alive:
		_update_player(inp, dt)
	else:
		p.dead_t += dt
	if mode == "play":
		_update_waves(dt)
	for e in enemies:
		_update_enemy(e, dt)
	_separate()
	_update_shots(dt)
	_update_areas(dt)
	_update_walls(dt)
	_update_props(dt)
	var keep := []
	for e in enemies:
		if e.hp > 0:
			keep.append(e)
		else:
			_kill(e)
	enemies = keep
	if p.alive and p.hp <= 0:
		p.alive = false
		p.hp = 0
		mode = "dead"
		_ev("playerDeath", {"pos": p.pos})
	remaining = spawn_q.size() + enemies.size()
	return events


func live() -> Array:
	var out := []
	for e in enemies:
		if e.state != "spawn" and e.hp > 0:
			out.append(e)
	return out


func _ev(type: String, o := {}) -> void:
	o["type"] = type
	events.append(o)


# ---------------------------------------------------------------- actions
func _act(a: String, inp: Dictionary) -> void:
	if a == "pause":
		if mode == "play":
			mode = "paused"
		elif mode == "paused":
			mode = "play"
		return
	if mode != "play" or not player.alive:
		return
	if a.begins_with("el:"):
		queue_el(a.substr(3))
	elif a == "clear":
		if not player.queue.is_empty():
			player.queue = []
			_ev("clear")
	elif a == "cast":
		_cast(inp, "aim", false)
	elif a == "recast":
		_cast(inp, "aim", true)
	elif a == "nova":
		_cast(inp, "nova", false)
	elif a == "self":
		_cast(inp, "self", false)
	elif a == "dodge":
		_dodge(inp)


func queue_el(el: String) -> void:
	var p := player
	if SpellBook.element(el).is_empty():
		return
	var opp := SpellBook.cancels(el)
	var res := SpellBook.queue_element(p.queue, el)
	if res == "cancel":
		_ev("cancel", {"a": el, "b": opp, "pos": p.pos})
	elif res == "full":
		_ev("queueFull")
	else:
		_ev("queue", {"el": el})


func _cast(inp: Dictionary, cmode: String, held: bool) -> void:
	var p := player
	if p.st.frozen > 0:
		return
	var q: Array = p.queue
	if held and not q.is_empty():
		return
	if q.is_empty():
		if cmode == "aim" and not p.last.is_empty():
			q = p.last
		else:
			if not held:
				_ev("fizzle", {"pos": p.pos})
			return
	var slot := "cast" if cmode == "aim" else cmode
	if p.cd[slot] > 0:
		return
	var sp := SpellBook.resolve(q)
	if sp.is_empty():
		p.queue = []
		_ev("fizzle", {"pos": p.pos})
		return
	var shape: String = sp["def"]["shape"]
	if cmode == "aim" and p.shape_cd.get(shape, 0.0) > 0:
		if not held:
			_ev("cooldown", {"shape": shape, "t": p.shape_cd[shape]})
		return
	var cost := roundi(sp["cost"] * (1.3 if cmode == "nova" else 0.5 if cmode == "self" else 1.0))
	if p.energy < cost:
		if not held:
			_ev("noEnergy", {"cost": cost})
		return
	p.energy -= cost
	# Fast shapes share a short global cooldown; slow shapes (areas, walls) recharge on their own timer.
	var cdv: float = minf(sp["cd"], 0.45) if cmode == "aim" else TUNING["nova_cd"] if cmode == "nova" else TUNING["self_cd"]
	p.cd[slot] = cdv
	p.cd_max[slot] = cdv
	if cmode == "aim" and sp["cd"] > 0.45:
		p.shape_cd[shape] = sp["cd"]
		p.shape_max[shape] = sp["cd"]
	if not p.queue.is_empty():
		p.last = p.queue.duplicate()
	p.queue = []
	p.cast_t = 0.3
	stats["casts"] += 1
	stats["found"][sp["key"]] = true
	var aim: Vector2 = inp.get("aim", p.pos + p.f)
	var av := aim - p.pos
	var aim_dist := av.length()
	if aim_dist > 0.05:
		p.f = av / aim_dist
	var d := p.f
	_ev("cast", {"mode": cmode, "shape": shape, "name": sp["name"], "key": sp["key"], "els": sp["els"],
		"color": sp["color"], "pos": p.pos, "dir": d})
	if sp["counts"].has("lightning") and p.st.wet > 0 and cmode != "self":
		_hurt(p, 7 * sp["counts"]["lightning"], "lightning", {"self": true, "reason": "Cast lightning while wet"})
		p.st.shock = maxf(p.st.shock, 0.35)
	if cmode == "self":
		_self_cast(sp)
	elif cmode == "nova":
		_nova(sp)
	else:
		call("_cast_" + shape, sp, p, d, maxf(1.2, aim_dist))


func _cast_cone(sp: Dictionary, p: Body, d: Vector2, _aim_dist: float) -> void:
	var def: Dictionary = sp["def"]
	var rng_ := float(def.get("range", 5.0))
	var arc := float(def.get("arc", 50.0))
	var c := cos(arc * PI / 360.0)
	for e in live():
		if _in_cone(e, e.r, p.pos, d, rng_, c):
			var L: float = e.pos.distance_to(p.pos)
			if L == 0:
				L = 1.0
			_apply_payload(e, sp["payload"], {"k": (e.pos - p.pos) / L,
				"scale": 1.0 - 0.35 * minf(1.0, L / rng_), "block": 0.5 if _shield_blocks(e, p.pos) else 1.0})
	for w in walls:
		if _in_cone(w, w.r, p.pos, d, rng_, c):
			_wall_hit(w, sp["payload"], 0.5)
	for o in _env_list():
		if _in_cone(o, o.r, p.pos, d, rng_, c):
			_env_hit(o, sp["els"], false)
	_ev("cone", {"pos": p.pos, "dir": d, "range": rng_, "arc": arc, "els": sp["els"], "color": sp["color"], "key": sp["key"]})


func _in_cone(o, pad: float, origin: Vector2, d: Vector2, rng_: float, c: float) -> bool:
	var v: Vector2 = o.pos - origin
	var L := v.length()
	if L > rng_ + pad:
		return false
	return L < pad + 0.4 or v.dot(d) / L >= c


func _cast_bolt(sp: Dictionary, p: Body, d: Vector2, _aim_dist: float) -> void:
	var def: Dictionary = sp["def"]
	var n := int(def.get("count", 1))
	var spread := float(def.get("spread", 0.0)) * PI / 180.0
	var speed := float(def.get("speed", 20.0))
	for i in n:
		var a := (i - (n - 1) / 2.0) * spread if n > 1 else 0.0
		var c := cos(a)
		var sn := sin(a)
		var v := Vector2(d.x * c + d.y * sn, -d.x * sn + d.y * c)
		var b := Shot.new()
		b.id = _next_id()
		b.kind = "bolt"
		b.pos = p.pos + v * 0.6
		b.vel = v * speed
		b.r = float(def.get("radius", 0.24))
		b.life = float(def.get("life", 1.2))
		b.pierce = int(def.get("pierce", 0))
		b.sp = sp
		b.color = sp["color"]
		b.els = sp["els"]
		shots.append(b)


func _cast_boulder(sp: Dictionary, p: Body, d: Vector2, _aim_dist: float) -> void:
	var b := Shot.new()
	b.id = _next_id()
	b.kind = "boulder"
	b.pos = p.pos + d * 0.7
	b.vel = d * float(sp["def"].get("speed", 11.0))
	b.r = 0.4
	b.life = 1.5
	b.sp = sp
	b.color = sp["color"]
	b.els = sp["els"]
	shots.append(b)


func _cast_chain(sp: Dictionary, p: Body, d: Vector2, aim_dist: float) -> void:
	var def: Dictionary = sp["def"]
	var rng_ := float(def.get("range", 7.5))
	var first: Body = null
	var best := INF
	for e in live():
		var v: Vector2 = e.pos - p.pos
		var L := v.length()
		if L > rng_ + e.r:
			continue
		var dot := v.dot(d) / (L if L > 0 else 1.0)
		if dot < 0.72:
			continue
		var score_ := L * (2.2 - dot)
		if score_ < best:
			best = score_
			first = e
	var pts := [p.pos + d * 0.5]
	if first:
		_chain_walk(sp, first, int(def.get("jumps", 2)), pts, 1.0, {})
	else:
		var end := p.pos + d * minf(rng_, aim_dist)
		pts.append(end)
		_env_at(end, 0.9, sp["els"], false)
	_ev("chain", {"pts": pts, "els": sp["els"], "color": sp["color"]})


# An instant line: everything within width/2 of it is hit; a pillar stops it.
func _cast_beam(sp: Dictionary, p: Body, d: Vector2, _aim_dist: float) -> void:
	var def: Dictionary = sp["def"]
	var a := p.pos + d * 0.5
	var L := float(def.get("range", 10.0))
	var half := float(def.get("width", 0.5)) / 2.0
	for o in pillars:
		var t_: float = (o.pos - a).dot(d)
		if t_ > 0 and t_ < L and absf((o.pos - a).cross(d)) < o.r:
			L = t_ - sqrt(maxf(0.0, o.r * o.r - pow((o.pos - a).cross(d), 2)))
	var b := a + d * L
	for e in live():
		var t_: float = (e.pos - a).dot(d)
		if t_ < -e.r or t_ > L + e.r:
			continue
		if absf((e.pos - a).cross(d)) < half + e.r:
			_apply_payload(e, sp["payload"], {"k": d, "scale": 1.0})
	for w in walls:
		var t_: float = (w.pos - a).dot(d)
		if t_ > 0 and t_ < L and absf((w.pos - a).cross(d)) < half + w.r:
			_wall_hit(w, sp["payload"], 0.5)
	var k := 0.0
	while k <= L:
		_env_at(a + d * k, half + 0.2, sp["els"], false)
		k += 1.0
	_ev("beam", {"from": a, "to": b, "width": half * 2, "els": sp["els"], "color": sp["color"], "key": sp["key"]})


func _cast_area(sp: Dictionary, p: Body, d: Vector2, aim_dist: float) -> void:
	var L := minf(aim_dist, float(sp["def"].get("range", TUNING["aim_range"])))
	_spawn_area(sp, p.pos + d * L)


func _cast_wall(sp: Dictionary, p: Body, d: Vector2, _aim_dist: float) -> void:
	var n := int(sp["def"].get("segments", 5))
	var c: Vector2 = p.pos + d * TUNING["wall_dist"]
	for i in n:
		var o := (i - (n - 1) / 2.0) * 0.95
		_add_wall(c + Vector2(-d.y, d.x) * o, sp)
	_ev("wall", {"pos": c, "mat": sp["def"].get("mat", "stone")})


func _chain_walk(sp: Dictionary, cur: Body, jumps: int, pts: Array, k: float, hit: Dictionary) -> void:
	while cur != null:
		hit[cur.id] = true
		var prev: Vector2 = pts[pts.size() - 1]
		pts.append(cur.pos)
		var L: float = cur.pos.distance_to(prev)
		if L == 0:
			L = 1.0
		_apply_payload(cur, sp["payload"], {"scale": k, "k": (cur.pos - prev) / L})
		_env_at(cur.pos, cur.r + 0.2, sp["els"], false)
		if jumps <= 0:
			break
		jumps -= 1
		k *= 0.85
		var nx: Body = null
		var nb := 4.8
		for e in live():
			if not hit.has(e.id):
				var dd: float = e.pos.distance_to(cur.pos)
				if dd < nb:
					nb = dd
					nx = e
		cur = nx


func _spawn_area(sp: Dictionary, at: Vector2) -> Area:
	var def: Dictionary = sp["def"]
	var L := at.length()
	if L > BOUND - 0.5:
		at *= (BOUND - 0.5) / L
	var a := Area.new()
	a.id = _next_id()
	a.pos = at
	a.r = float(def.get("radius", 3.0))
	a.life = float(def.get("life", 3.0))
	a.max_life = a.life
	a.tick = float(def.get("tick", 0.5))
	a.delay = float(def.get("delay", 0.0))
	a.delay_max = a.delay
	a.pull = float(def.get("pull", 0.0))
	a.burst = bool(def.get("burst", false))
	a.hits_all = bool(def.get("hitsAll", false))
	a.els = sp["els"]
	a.color = sp["color"]
	a.key = sp["key"]
	a.name = sp["name"]
	a.sp = sp
	a.heal = float(def.get("heal", 0.0))
	a.swallow = bool(def.get("swallow", false))
	a.repeat = int(def.get("repeat", 1)) - 1
	a.interval = float(def.get("interval", 0.3))
	a.scatter = float(def.get("scatter", 0.0))
	a.center = at
	areas.append(a)
	return a


func _add_wall(at: Vector2, sp: Dictionary) -> void:
	if at.length() > BOUND - 0.3:
		return
	for o in pillars:
		if o.pos.distance_to(at) < o.r + 0.3:
			return
	var def: Dictionary = sp["def"]
	var w := Wall.new()
	w.id = _next_id()
	w.pos = at
	w.hp = float(def.get("hp", 100.0)) * sp["power"]
	w.max_hp = w.hp
	w.life = float(def.get("life", 9.0))
	w.max_life = w.life
	w.mat = def.get("mat", "stone")
	w.chill = bool(def.get("touchChill", false))
	w.regen = float(def.get("regen", 0.0))
	w.reflect = bool(def.get("reflect", false))
	walls.append(w)
	for e in live():
		_push_out(e, w)
	if player.alive:
		_push_out(player, w)


func _nova(sp: Dictionary) -> void:
	var p := player
	var def: Dictionary = sp["def"]
	var shape: String = def["shape"]
	var nova_r: float = TUNING["nova_r"]
	var r := float(def.get("radius", 3.0)) if shape == "area" else 2.2 if shape == "wall" else nova_r
	_ev("nova", {"pos": p.pos, "r": r, "els": sp["els"], "color": sp["color"], "shape": shape})
	if shape == "wall":
		for i in 9:
			var a := i / 9.0 * TAU
			_add_wall(p.pos + Vector2(sin(a), cos(a)) * 2.2, sp)
		return
	if shape == "area":
		_spawn_area(sp, p.pos)
		return
	var pl: Dictionary = sp["payload"].duplicate()
	pl["knock"] = pl.get("knock", 0.0) + 5.0
	for e in live():
		var L: float = e.pos.distance_to(p.pos)
		if L < nova_r + e.r:
			_apply_payload(e, pl, {"scale": 0.85, "k": (e.pos - p.pos) / (L if L > 0 else 1.0), "knock_mul": 1.4})
	for w in walls:
		if w.pos.distance_to(p.pos) < nova_r + w.r:
			_wall_hit(w, sp["payload"], 0.5)
	_env_at(p.pos, nova_r, sp["els"], def.has("explode"))
	if def.has("explode"):
		_apply_payload(p, sp["payload"], {"scale": 0.25, "reason": "Point-blank " + sp["name"]})


func _self_cast(sp: Dictionary) -> void:
	var p := player
	var st := p.st
	for el in sp["counts"]:
		var n: int = sp["counts"][el]
		var f: Dictionary = SpellBook.element(el)["self"]
		if f.has("thaw"):
			st.frozen = 0
			st.chill = 0
			st.wet = 0
		if f.has("burn"):
			st.burn = maxf(st.burn, f["burn"])
			st.burn_dps = maxf(st.burn_dps, 5.0 * n)
		if f.has("cool"):
			st.burn = 0
		if f.has("chill"):
			st.chill += f["chill"] * n
			st.chill_t = 2.5
			if st.chill >= 3:
				_freeze(p, 1.5)
		if f.has("haste"):
			st.haste = f["haste"] * n
		if f.has("zap"):
			_hurt(p, f["zap"] * n * (3 if st.wet > 0 else 1), "lightning", {"self": true, "reason": "Lightning self-cast"})
		if f.has("stoneskin"):
			st.stoneskin = f["stoneskin"] * n
		if f.has("ward"):
			st.ward = f["ward"] * n
			st.ward_t = 6.0
		if f.has("cleanse"):
			st.burn = 0
			st.chill = 0
			st.slow = 0
			st.frozen = 0
		if f.has("wet"):
			st.wet = maxf(st.wet, f["wet"])
		if f.has("regen"):
			st.regen = 4.0
			st.regen_hp = f["regen"] * n
		if f.has("gust"):
			for e in live():
				var L: float = e.pos.distance_to(p.pos)
				if L < 2.6 + e.r:
					e.kvel += (e.pos - p.pos) / (L if L > 0 else 1.0) * 10.0 * n / e.mass
		if f.has("heal"):
			heal(f["heal"] * n, "Light")
		if f.has("sacrifice"):
			_hurt(p, f["sacrifice"] * n, "dark", {"self": true, "reason": "Dark pact"})
			p.energy = minf(p.max_energy, p.energy + 50.0 * n)
	_ev("selfcast", {"els": sp["els"], "color": sp["color"], "pos": p.pos})


# Heals the player (capped at max health) and reports it.
func heal(amount: float, source := "") -> float:
	var p := player
	if not p.alive or amount <= 0:
		return 0.0
	var h := minf(amount, p.max_hp - p.hp)
	if h <= 0:
		return 0.0
	p.hp += h
	stats["healed"] = stats.get("healed", 0.0) + h
	_ev("heal", {"pos": p.pos, "amt": h, "source": source})
	return h


func _dodge(inp: Dictionary) -> void:
	var p := player
	if p.cd["dodge"] > 0 or p.st.frozen > 0:
		return
	var d: Vector2 = inp.get("move", Vector2.ZERO)
	if d == Vector2.ZERO:
		d = p.f
	p.dd = d.normalized()
	p.dodge = TUNING["dodge_time"]
	p.cd["dodge"] = TUNING["dodge_cd"]
	p.cd_max["dodge"] = TUNING["dodge_cd"]
	if p.st.burn > 0:
		p.st.burn = maxf(0.0, p.st.burn - 1.2)
	_ev("dodge", {"pos": p.pos, "dir": p.dd})


# ---------------------------------------------------------------- damage
func _freeze(b: Body, dur: float) -> void:
	var st := b.st
	st.frozen = maxf(st.frozen, dur)
	st.chill = 0
	st.wet = 0
	st.burn = 0


func _hurt(b: Body, dmg: float, el: String, o := {}) -> float:
	if dmg <= 0 or b.hp <= 0:
		return 0.0
	var is_p := b == player
	var dot: bool = o.get("dot", false)
	if is_p:
		if not b.alive:
			return 0.0
		if b.dodge > 0 and not dot:
			_ev("tag", {"tag": "evade", "pos": b.pos})
			return 0.0
		if b.st.stoneskin > 0:
			dmg *= 0.5
		if b.st.ward > 0:
			var a := minf(b.st.ward, dmg)
			b.st.ward -= a
			dmg -= a
			if not dot:
				_ev("ward", {"pos": b.pos, "amt": a})
		if dmg <= 0:
			return 0.0
		stats["taken"] += dmg
		if o.get("self", false):
			stats["self_dmg"] += dmg
		if not dot:
			b.hurt_t = 0.3
	else:
		if not dot:
			b.flash = 0.14
		stats["dealt"] += dmg
	b.hp -= dmg
	var shown := dmg
	if dot:
		b.dot_acc += dmg
		if b.dot_acc < 4:
			return dmg
		shown = b.dot_acc
		b.dot_acc = 0
	_ev("hurt" if is_p else "hit", {"id": b.id, "pos": b.pos, "dmg": shown, "el": el, "dot": dot,
		"self": o.get("self", false), "reason": o.get("reason", "")})
	return dmg


# The one place elements meet bodies. Order matters: water, fire, ice, then damage.
# c: {scale, k (knockback direction), block, knock_mul, area (a damage-over-time tick), reason}.
func _apply_payload(b: Body, pl: Dictionary, c := {}) -> float:
	var is_p := b == player
	if is_p and (not b.alive or (b.dodge > 0 and not c.get("area", false))):
		return 0.0
	if b.hp <= 0:
		return 0.0
	var st := b.st
	var k: float = c.get("scale", 1.0)
	var tags := []
	var was_wet := st.wet > 0
	var was_frozen := st.frozen > 0
	if pl.get("wet", 0) > 0:
		if st.burn > 0:
			st.burn = 0
			tags.append("steam")
		if not was_frozen:
			st.wet = maxf(st.wet, pl["wet"])
	if pl.get("burn", 0) > 0:
		if st.wet > 0:
			st.wet = 0
			tags.append("steam")
		elif st.frozen > 0:
			st.frozen = 0
			st.chill = 0
			tags.append("thaw")
		else:
			st.burn = maxf(st.burn, pl["burn"])
			st.burn_dps = maxf(st.burn_dps, pl["burnDps"])
			if st.root > 0:
				st.burn_dps *= 1.5 # rooted in brambles: they catch
				tags.append("kindled")
	if pl.get("chill", 0) > 0:
		if st.burn > 0:
			st.burn = 0
			tags.append("steam")
		elif st.wet > 0:
			_freeze(b, 2.4)
			tags.append("freeze")
		elif st.frozen <= 0:
			st.chill += pl["chill"]
			st.chill_t = 2.5
			if st.chill >= 3:
				_freeze(b, 1.8)
				tags.append("freeze")
		else:
			st.frozen = maxf(st.frozen, 0.6)
	if pl.get("root", 0) > 0 and st.frozen <= 0:
		if was_wet:
			st.root = maxf(st.root, maxf(2.0, pl["root"]))
			tags.append("entangled")
		else:
			st.root = maxf(st.root, pl["root"])
	if pl.get("gust", 0) > 0:
		if st.burn > 0 and not is_p:
			for o in live():
				if o != b and o.pos.distance_to(b.pos) < 2.5 + o.r and o.st.burn <= 0 and o.st.wet <= 0:
					o.st.burn = st.burn
					o.st.burn_dps = st.burn_dps
			tags.append("fanned")
		elif was_wet and st.frozen <= 0:
			st.chill += pl["gust"]
			st.chill_t = 2.5
			tags.append("windchill")
			if st.chill >= 3:
				_freeze(b, 1.8)
				tags.append("freeze")
	if pl.get("freeze", 0) > 0:
		_freeze(b, pl["freeze"])
		tags.append("freeze")
	if pl.get("blind", 0) > 0 and not is_p:
		st.blind = maxf(st.blind, pl["blind"])
	var purged := false
	if pl["parts"].has("light") and st.curse > 0:
		st.curse = 0
		purged = true
		tags.append("purged")
	var cursed := st.curse > 0
	if pl.get("curse", 0) > 0:
		st.curse = maxf(st.curse, pl["curse"])
	var dmg := 0.0
	var top: String = pl["els"][0] if not pl["els"].is_empty() else ""
	var top_v := -1.0
	for el in pl["parts"]:
		var d: float = pl["parts"][el] * k * (1.0 if pl.get("trueDamage", false) else float(b.resist.get(el, 1.0)))
		if el == "light" and purged:
			d *= 1.5
		if el == "lightning" and was_wet:
			d *= 2
			tags.append("conduct")
		if el == "earth" and was_frozen:
			d *= 2.2
			tags.append("shatter")
		if d > top_v:
			top_v = d
			top = el
		dmg += d
	if tags.has("shatter"):
		st.frozen = 0
		st.chill = 0
	if cursed:
		dmg *= 1.25
	if pl.get("shock", 0) > 0 and st.frozen <= 0:
		st.shock = maxf(st.shock, pl["shock"] * (2 if was_wet else 1))
	if pl.get("slow", 0) > 0:
		st.slow = maxf(st.slow, pl["slow"])
	var block: float = c.get("block", 1.0)
	dmg *= block
	var kn: float = pl.get("knock", 0.0) * k * c.get("knock_mul", 1.0) * block
	if kn > 0 and c.has("k"):
		b.kvel += c["k"] * kn / b.mass
	if dmg > 0.05:
		var dealt := _hurt(b, dmg, top, {"self": is_p, "reason": c.get("reason", ""), "dot": c.get("area", false)})
		if not is_p and pl.get("drain", 0) > 0 and pl["parts"].has("dark") and dealt > 0:
			heal(dealt * pl["drain"] * pl["parts"]["dark"] / maxf(0.001, _sum_parts(pl)), "Drain")
	var seen := {}
	for tag in tags:
		if not seen.has(tag):
			seen[tag] = true
			_ev("tag", {"tag": tag, "pos": b.pos, "id": b.id})
	return dmg


func _sum_parts(pl: Dictionary) -> float:
	var t := 0.0
	for el in pl["parts"]:
		t += pl["parts"][el]
	return t


# A blast of radius R. o: {self_mul, big, color, els, reason}.
func _explode(at: Vector2, R: float, pl: Dictionary, o := {}) -> void:
	for e in live():
		var L: float = e.pos.distance_to(at)
		if L > R + e.r:
			continue
		_apply_payload(e, pl, {"scale": 1.0 - 0.5 * maxf(0.0, L - e.r) / R, "k": (e.pos - at) / (L if L > 0 else 1.0)})
	var p := player
	var self_mul: float = o.get("self_mul", 0.0)
	if self_mul > 0 and p.alive:
		var L := p.pos.distance_to(at)
		if L < R + p.r:
			var reason: String = o.get("reason", "")
			_apply_payload(p, pl, {"scale": (1.0 - 0.5 * maxf(0.0, L - p.r) / R) * self_mul,
				"k": (p.pos - at) / (L if L > 0 else 1.0), "reason": reason if reason != "" else "Caught in your own blast"})
	for w in walls:
		if w.pos.distance_to(at) < R + w.r:
			_wall_hit(w, pl, 0.8)
	_env_at(at, R, pl["els"], true)
	_ev("explode", {"pos": at, "r": R, "els": o.get("els", pl["els"]), "color": o.get("color", Color("#ffa040")),
		"big": o.get("big", false)})
	if o.get("big", false):
		hitstop = maxf(hitstop, 0.05)


func _shield_blocks(e: Body, src: Vector2) -> bool:
	if not e.T.has("shield") or e.st.frozen > 0 or e.st.shock > 0 or e.state == "windup":
		return false
	var v := src - e.pos
	var L := v.length()
	if L == 0:
		L = 1.0
	return (v.x * sin(e.face) + v.y * cos(e.face)) / L > cos(float(e.T["shield"]) * PI / 180.0)


func _wall_hit(w: Wall, pl: Dictionary, k: float) -> void:
	var d := 0.0
	for el in pl["parts"]:
		d += pl["parts"][el] * k
	if w.mat == "ice" and pl.get("burn", 0) > 0:
		d *= 3
	w.hp -= d


# ---------------------------------------------------------------- environment
func _env_list() -> Array:
	var out := puddles + brush
	for b in barrels:
		if b.alive:
			out.append(b)
	return out


func _env_at(at: Vector2, R: float, els: Array, blast: bool) -> void:
	for o in _env_list():
		if o.pos.distance_to(at) < R + o.r * 0.9:
			_env_hit(o, els, blast)


func _ignite(br: Prop) -> void:
	if br.state != "dry":
		return
	br.state = "burning"
	br.t = 5.0
	br.tick_t = 0
	br.spread_t = 1.2
	_ev("ignite", {"pos": br.pos, "r": br.r})


func _env_hit(o: Prop, els: Array, blast: bool) -> void:
	if o.type == "barrel":
		if o.alive and o.fuse == 0 and (blast or els.has("fire") or els.has("lightning") or els.has("arcane")):
			o.fuse = 0.15 if blast else 0.05
		return
	if o.type == "brush":
		if els.has("wind") and o.state == "burning":
			for other in brush:
				if other.state == "dry" and other.pos.distance_to(o.pos) < other.r + o.r + 4.0:
					_ignite(other)
			return
		if els.has("nature") and o.state == "ash":
			o.state = "dry"
			o.t = 0
			_ev("tag", {"tag": "regrown", "pos": o.pos})
			return
		if (els.has("water") or els.has("ice")) and o.state == "burning":
			o.state = "dry"
			o.t = 0
			_ev("steam", {"pos": o.pos, "r": o.r})
		elif els.has("fire") or (els.has("lightning") and blast):
			_ignite(o)
		return
	if els.has("ice"):
		if o.state != "frozen":
			_ev("tag", {"tag": "freeze", "pos": o.pos})
		o.state = "frozen"
		o.t = 10.0
		o.tick_t = 1.2
		return
	if els.has("lightning") and o.state != "frozen":
		if o.state != "charged":
			_ev("charge", {"pos": o.pos, "r": o.r})
		o.state = "charged"
		o.t = 2.6
		o.tick_t = minf(o.tick_t, 0.1)
		return
	if els.has("fire"):
		if o.state == "frozen":
			o.state = "water"
		_ev("steam", {"pos": o.pos, "r": o.r * 0.8})


func _update_props(dt: float) -> void:
	var ents := live()
	if player.alive:
		ents.append(player)
	for pd in puddles:
		if pd.state == "water":
			for e in ents:
				if _inside(pd, e) and e.st.frozen <= 0:
					if e.st.burn > 0:
						e.st.burn = 0
						_ev("tag", {"tag": "steam", "pos": e.pos})
					e.st.wet = maxf(e.st.wet, 1.2)
			continue
		pd.t -= dt
		pd.tick_t -= dt
		if pd.state == "charged" and pd.tick_t <= 0:
			pd.tick_t = 0.45
			for e in ents:
				if _inside(pd, e):
					e.st.wet = maxf(e.st.wet, 1.2)
					_apply_payload(e, ENV["charged"], {"area": true, "reason": "Standing in charged water"})
		if pd.state == "frozen" and pd.tick_t <= 0:
			pd.tick_t = 1.2
			for e in ents:
				if _inside(pd, e):
					_apply_payload(e, ENV["frost"], {"area": true})
		if pd.t <= 0:
			pd.state = "water"
	for br in brush:
		if br.state == "dry":
			for e in ents:
				if _inside(br, e) and e.st.burn > 0:
					_ignite(br)
					break
		elif br.state == "burning":
			br.t -= dt
			br.tick_t -= dt
			br.spread_t -= dt
			if br.tick_t <= 0:
				br.tick_t = 0.5
				for e in ents:
					if _inside(br, e):
						_apply_payload(e, ENV["brush"], {"area": true, "reason": "Walked through burning brush"})
			if br.spread_t <= 0:
				br.spread_t = 99.0
				for o in brush:
					if o.state == "dry" and o.pos.distance_to(br.pos) < o.r + br.r + 2.5:
						_ignite(o)
			if br.t <= 0:
				br.state = "ash"
				br.t = 25.0
		else:
			br.t -= dt
			if br.t <= 0:
				br.state = "dry"
	for b in barrels:
		if b.alive and b.fuse > 0:
			b.fuse -= dt
			if b.fuse <= 0:
				b.alive = false
				b.fuse = 0
				_explode(b.pos, 2.8, ENV["barrel"], {"self_mul": 0.7, "big": true, "color": Color("#ff7a2f"),
					"els": ["fire", "earth"], "reason": "Too close to a rune barrel"})


func _inside(o: Prop, e: Body) -> bool:
	return e.pos.distance_to(o.pos) < o.r * 0.92


# ---------------------------------------------------------------- player
static func slow_mul(st: Status) -> float:
	return maxf(0.35, 1.0 - st.chill * 0.16) * (0.6 if st.slow > 0 else 1.0)


func _tick_status(b: Body, dt: float) -> void:
	var st := b.st
	if st.burn > 0:
		st.burn -= dt
		_hurt(b, st.burn_dps * dt, "fire", {"dot": true, "self": b == player, "reason": "Burning"})
		if st.burn <= 0:
			st.burn_dps = 0
	if st.wet > 0:
		st.wet -= dt
	if st.chill > 0:
		st.chill_t -= dt
		if st.chill_t <= 0:
			st.chill = maxf(0.0, st.chill - 1)
			st.chill_t = 1.2
	st.frozen = maxf(0.0, st.frozen - dt)
	st.shock = maxf(0.0, st.shock - dt)
	st.slow = maxf(0.0, st.slow - dt)
	st.stoneskin = maxf(0.0, st.stoneskin - dt)
	st.haste = maxf(0.0, st.haste - dt)
	st.root = maxf(0.0, st.root - dt)
	st.blind = maxf(0.0, st.blind - dt)
	st.curse = maxf(0.0, st.curse - dt)
	if st.regen > 0:
		st.regen -= dt
		if b == player:
			b.hp = minf(b.max_hp, b.hp + st.regen_hp * dt)
	if st.ward > 0:
		st.ward_t -= dt
		if st.ward_t <= 0:
			st.ward = 0


func _update_player(inp: Dictionary, dt: float) -> void:
	var p := player
	var st := p.st
	_tick_status(p, dt)
	for k in p.cd:
		p.cd[k] = maxf(0.0, p.cd[k] - dt)
	for k in p.shape_cd:
		p.shape_cd[k] = maxf(0.0, p.shape_cd[k] - dt)
	p.energy = minf(p.max_energy, p.energy + TUNING["regen"] * dt)
	p.cast_t = maxf(0.0, p.cast_t - dt)
	p.hurt_t = maxf(0.0, p.hurt_t - dt)
	var stunned := st.frozen > 0 or st.shock > 0
	var mv: Vector2 = inp.get("move", Vector2.ZERO)
	if p.dodge > 0:
		p.dodge -= dt
		p.vel = p.dd * TUNING["dodge_speed"]
	elif st.root > 0:
		p.vel *= 0.5
	elif not stunned:
		var spd: float = TUNING["speed"] * slow_mul(st) * (1.4 if st.haste > 0 else 1.0)
		var target := mv.normalized() * spd if mv != Vector2.ZERO else Vector2.ZERO
		p.vel += (target - p.vel) * minf(1.0, dt * 14)
	else:
		p.vel *= 0.8
	_move(p, dt)
	p.cur_speed = p.vel.length()
	if not stunned:
		var av: Vector2 = inp.get("aim", p.pos + p.f) - p.pos
		if av.length() > 0.3:
			p.f = av.normalized()


func _move(e, dt: float) -> void:
	e.pos += (e.vel + e.kvel) * dt
	e.kvel *= exp(-6 * dt)
	_collide(e)


func _collide(e) -> void:
	for o in pillars:
		_push_out(e, o)
	for w in walls:
		_push_out(e, w)
	for b in barrels:
		if b.alive:
			_push_out(e, b)
	var d: float = e.pos.length()
	var mx: float = BOUND - e.r
	if d > mx:
		e.pos *= mx / d


func _push_out(e, o) -> void:
	var dv: Vector2 = e.pos - o.pos
	var d := dv.length()
	var m: float = e.r + o.r
	if d >= m:
		return
	if d < 1e-4:
		e.pos.x += m
		return
	e.pos = o.pos + dv / d * m


# ---------------------------------------------------------------- waves
func _update_waves(dt: float) -> void:
	if not spawn_q.is_empty():
		spawn_t -= dt
		if spawn_t <= 0:
			_spawn_enemy(spawn_q.pop_front())
			spawn_t = wave_info["interval"]
		return
	if not enemies.is_empty():
		return
	if wave_t > 0:
		wave_t -= dt
		if wave_t <= 0:
			_start_wave()
		return
	if wave > 0:
		var p := player
		var heal := roundi(p.max_hp * 0.35)
		p.hp = minf(p.max_hp, p.hp + heal)
		p.energy = p.max_energy
		_ev("waveClear", {"n": wave, "heal": heal})
	for b in barrels:
		b.alive = true
		b.fuse = 0
	wave_t = 3.5


func _start_wave() -> void:
	wave += 1
	wave_info = EnemyTypes.wave_roster(wave, rng)
	spawn_q = wave_info["list"].duplicate()
	spawn_t = 0.3
	_ev("wave", {"n": wave, "count": spawn_q.size()})


func _spawn_enemy(kind: String) -> Body:
	var p := player
	var g := gates()
	g.sort_custom(func(a, b): return a.distance_to(p.pos) > b.distance_to(p.pos))
	var gate: Vector2 = g[rng.randi_range(0, 2)]
	var at := gate + Vector2(rng.randf() - 0.5, rng.randf() - 0.5) * 2.4
	var e := spawn(kind, at, wave_info.get("hp_scale", 1.0), wave_info.get("speed_scale", 1.0))
	e.state = "spawn"
	e.state_t = 0.9
	_collide(e)
	_ev("spawn", {"id": e.id, "pos": e.pos, "kind": kind})
	return e


# Adds an enemy straight away (tests and the wave spawner use it). It starts chasing.
func spawn(kind: String, at: Vector2, hp_scale := 1.0, speed_scale := 1.0) -> Body:
	var T := EnemyTypes.type(kind)
	var e := Body.new()
	e.id = _next_id()
	e.kind = kind
	e.T = T
	e.pos = at
	e.r = float(T["r"])
	e.mass = float(T["mass"])
	e.hp = T["hp"] * hp_scale
	e.max_hp = e.hp
	e.speed = T["speed"] * speed_scale
	e.resist = T.get("resist", {})
	e.face = atan2(-at.x, -at.y)
	e.state = "chase"
	e.atk_cd = 0.6 + rng.randf()
	e.strafe = 1.0 if rng.randf() < 0.5 else -1.0
	enemies.append(e)
	return e


func _kill(e: Body) -> void:
	kills += 1
	score += roundi(float(e.T["score"]) * (1.0 + 0.25 * (wave - 1)))
	_ev("death", {"id": e.id, "pos": e.pos, "kind": e.kind, "frozen": e.st.frozen > 0})


# ---------------------------------------------------------------- enemies
func _turn_to(e: Body, ang: float, max_step: float) -> void:
	var d := atan2(sin(ang - e.face), cos(ang - e.face))
	e.face += clampf(d, -max_step, max_step)


func _wall_ahead(e: Body, u: Vector2) -> Wall:
	for w in walls:
		var v: Vector2 = w.pos - e.pos
		var L := v.length()
		if L < e.r + w.r + 0.45 and v.dot(u) / (L if L > 0 else 1.0) > 0.3:
			return w
	return null


func _steer(e: Body, u: Vector2, spd: float, dt: float) -> void:
	var a := u
	var obs: Array = pillars + walls
	for b in barrels:
		if b.alive:
			obs.append(b)
	for o in obs:
		var ov: Vector2 = o.pos - e.pos
		var d := ov.length()
		var reach: float = e.r + o.r + 1.2
		if d > reach or d < 1e-3:
			continue
		if ov.dot(u) / d < 0.3:
			continue
		var side := -1.0 if ov.x * -u.y + ov.y * u.x > 0 else 1.0
		var w := (1.0 - d / reach) * 1.6
		a += Vector2(-u.y, u.x) * side * w
	var L := a.length()
	if L == 0:
		L = 1.0
	e.vel += (a / L * spd - e.vel) * minf(1.0, dt * 8)


func _ai_thrall(e: Body, dt: float, c: Dictionary) -> void:
	var A: Dictionary = e.T["atk"]
	var p := player
	var u: Vector2 = c["u"]
	if e.state == "chase":
		if not p.alive:
			e.vel *= 0.9
			return
		_steer(e, u, c["spd"], dt)
		_turn_to(e, atan2(u.x, u.y), e.T["turn"] * dt)
		e.atk_cd -= dt
		if e.atk_cd <= 0 and (c["dist"] < A["range"] + p.r or _wall_ahead(e, u) != null):
			e.state = "windup"
			e.state_t = A["windup"]
			e.aim = u
	elif e.state == "windup":
		e.vel *= 0.82
		if e.state_t > 0.12:
			e.aim = u
			_turn_to(e, atan2(u.x, u.y), 8 * dt)
		if e.state_t <= 0:
			e.state = "strike"
			e.state_t = A["dur"]
			e.hit_done = false
	elif e.state == "strike":
		e.vel = e.aim * A["lunge"]
		if not e.hit_done:
			if p.alive and c["dist"] < e.r + p.r + 0.5:
				e.hit_done = true
				if _hurt(p, A["dmg"], "phys") > 0:
					p.kvel += e.aim * 5
					_ev("claw", {"pos": p.pos})
			var w := _wall_ahead(e, e.aim)
			if w:
				e.hit_done = true
				w.hp -= 18
				_ev("claw", {"pos": w.pos})
		if e.state_t <= 0:
			e.state = "recover"
			e.state_t = A["recover"]
	elif e.state == "recover":
		e.vel *= 0.85
		if e.state_t <= 0:
			e.state = "chase"
			e.atk_cd = 0.3 + rng.randf() * 0.5


func _ai_bulwark(e: Body, dt: float, c: Dictionary) -> void:
	var A: Dictionary = e.T["atk"]
	var p := player
	var u: Vector2 = c["u"]
	var fv := Vector2(sin(e.face), cos(e.face))
	if e.state == "chase":
		if not p.alive:
			e.vel *= 0.9
			return
		_turn_to(e, atan2(u.x, u.y), e.T["turn"] * dt)
		var facing := fv.dot(u)
		_steer(e, fv, c["spd"] * maxf(0.2, facing), dt)
		e.atk_cd -= dt
		if e.atk_cd <= 0 and ((c["dist"] < A["range"] + p.r and facing > 0.6) or _wall_ahead(e, fv) != null):
			e.state = "windup"
			e.state_t = A["windup"]
			e.slam = e.pos + fv * A["reach"]
	elif e.state == "windup":
		e.vel *= 0.8
		if e.state_t <= 0:
			var L := p.pos.distance_to(e.slam)
			if p.alive and L < A["radius"] + p.r and _hurt(p, A["dmg"], "phys") > 0:
				p.kvel += (p.pos - e.slam) / (L if L > 0 else 1.0) * A["knock"]
			for w in walls:
				if w.pos.distance_to(e.slam) < A["radius"] + w.r:
					w.hp -= 70
			_ev("slam", {"pos": e.slam, "r": A["radius"]})
			e.state = "recover"
			e.state_t = A["recover"]
	elif e.state == "recover":
		e.vel *= 0.85
		if e.state_t <= 0:
			e.state = "chase"
			e.atk_cd = 0.6 + rng.randf() * 0.6


func _ai_hexcaller(e: Body, dt: float, c: Dictionary) -> void:
	var T := e.T
	var A: Dictionary = T["atk"]
	var p := player
	var u: Vector2 = c["u"]
	_turn_to(e, atan2(u.x, u.y), T["turn"] * dt)
	if e.state == "chase":
		if not p.alive:
			e.vel *= 0.9
			return
		var m := Vector2.ZERO
		if c["dist"] > T["keep"][1]:
			m = u
		elif c["dist"] < T["keep"][0]:
			m = -u
		m += Vector2(-u.y, u.x) * e.strafe * 0.8
		if rng.randf() < dt * 0.4:
			e.strafe *= -1
		_steer(e, m.normalized() if m != Vector2.ZERO else m, c["spd"], dt)
		e.atk_cd -= dt
		if e.atk_cd <= 0 and c["dist"] < A["range"]:
			e.state = "charge"
			e.state_t = A["windup"]
	elif e.state == "charge":
		e.vel *= 0.9
		e.aim = u
		if e.state_t <= 0:
			var b := Shot.new()
			b.id = _next_id()
			b.kind = "orb"
			b.owner = "enemy"
			b.pos = e.pos + u * 0.6
			b.vel = u * A["speed"]
			b.r = 0.3
			b.life = 3.0
			b.dmg = A["dmg"]
			shots.append(b)
			e.state = "recover"
			e.state_t = A["recover"]
			e.atk_cd = A["cd"][0] + rng.randf() * (A["cd"][1] - A["cd"][0])
	elif e.state == "recover":
		e.vel *= 0.9
		if e.state_t <= 0:
			e.state = "chase"


func _update_enemy(e: Body, dt: float) -> void:
	e.flash = maxf(0.0, e.flash - dt)
	if e.state == "spawn":
		e.state_t -= dt
		if e.state_t <= 0:
			e.state = "chase"
		return
	_tick_status(e, dt)
	if e.hp <= 0:
		return
	var p := player
	var st := e.st
	var dv := p.pos - e.pos
	var L := dv.length()
	if L == 0:
		L = 1.0
	var c := {"u": dv / L, "dist": L, "spd": e.speed * slow_mul(st)}
	if st.frozen > 0 or st.shock > 0:
		if e.state == "windup" or e.state == "charge":
			e.state = "recover"
			e.state_t = 0.35
			_ev("tag", {"tag": "interrupt", "pos": e.pos})
		e.vel *= 0.8
	else:
		e.state_t -= dt
		if st.blind > 0 and e.state == "chase":
			e.atk_cd = maxf(e.atk_cd, 0.2) # blinded: cannot line up an attack
		call("_ai_" + e.kind, e, dt, c)
	if st.root > 0:
		e.vel = Vector2.ZERO
	_move(e, dt)


func _separate() -> void:
	var L := live()
	for i in L.size():
		for j in range(i + 1, L.size()):
			var a: Body = L[i]
			var b: Body = L[j]
			var dv := b.pos - a.pos
			var d := dv.length()
			var m := a.r + b.r
			if d >= m or d < 1e-4:
				continue
			var push := m - d
			var n := dv / d
			var wa := b.mass / (a.mass + b.mass)
			a.pos -= n * push * wa
			b.pos += n * push * (1 - wa)
	var p := player
	if not p.alive:
		return
	for e in L:
		var dv: Vector2 = p.pos - e.pos
		var d := dv.length()
		var m: float = p.r + e.r
		if d >= m or d < 1e-4:
			continue
		var push := m - d
		var wp: float = e.mass / (e.mass + p.mass)
		p.pos += dv / d * push * wp
		e.pos -= dv / d * push * (1 - wp)
	_collide(p)


# ---------------------------------------------------------------- projectiles
func _update_shots(dt: float) -> void:
	var keep := []
	for b in shots:
		b.life -= dt
		var ok := true
		for i in 3:
			if not ok:
				break
			b.pos += b.vel * dt / 3.0
			ok = _shot_step(b)
		if ok and b.life <= 0:
			if b.owner == "player" and b.kind == "boulder":
				_impact(b, null)
			ok = false
		if ok:
			keep.append(b)
	shots = keep


func _shot_step(b: Shot) -> bool:
	if b.pos.length() > BOUND + 0.4:
		_impact(b, null)
		return false
	for o in pillars:
		if b.pos.distance_to(o.pos) < b.r + o.r:
			_impact(b, null)
			return false
	for o in barrels:
		if o.alive and b.pos.distance_to(o.pos) < b.r + o.r:
			if b.owner == "player" and o.fuse == 0:
				o.fuse = 0.05
			_impact(b, null)
			return false
	if b.owner == "enemy":
		for w in walls:
			if b.pos.distance_to(w.pos) < b.r + w.r:
				if w.reflect:
					# Thrown back as the player's own shot.
					b.owner = "player"
					b.kind = "bolt"
					b.vel = -b.vel * 1.4
					b.life = 2.0
					b.sp = SpellBook.make_spell(["light"], {"name": "Reflected hex", "shape": "bolt", "mult": b.dmg / 8.0 * 1.5})
					b.color = b.sp["color"]
					b.els = b.sp["els"]
					_ev("tag", {"tag": "reflected", "pos": b.pos})
					return true
				w.hp -= b.dmg * 1.5
				_impact(b, null)
				return false
		var p := player
		if p.alive and b.pos.distance_to(p.pos) < b.r + p.r:
			if p.dodge > 0:
				if not b.evaded:
					b.evaded = true
					_ev("tag", {"tag": "evade", "pos": p.pos})
				return true
			_hurt(p, b.dmg, "hex")
			p.kvel += b.vel * 0.3
			_impact(b, null)
			return false
		return true
	for e in enemies:
		if e.state == "spawn" or e.hp <= 0 or b.hits.has(e.id):
			continue
		if b.pos.distance_to(e.pos) >= b.r + e.r:
			continue
		b.hits.append(e.id)
		var sp := b.sp
		var d: Dictionary = sp["def"]
		var kdir := b.vel.normalized() if b.vel != Vector2.ZERO else Vector2(0, 1)
		var shielded := _shield_blocks(e, b.pos - kdir)
		var blasts := d.has("explode") or d.has("splash")
		if shielded and b.kind != "boulder":
			_ev("tag", {"tag": "blocked", "pos": e.pos})
			_ev("block", {"pos": b.pos, "color": sp["color"]})
			if d.has("explode"):
				_impact(b, null)
			else:
				_apply_payload(e, sp["payload"], {"scale": 0.15, "k": kdir, "knock_mul": 0.2})
			return false
		if not blasts:
			_apply_payload(e, sp["payload"], {"k": kdir, "scale": 0.6 if shielded else 1.0})
		if b.pierce > 0 and not blasts:
			b.pierce -= 1
			continue
		_impact(b, e)
		return false
	return true


func _impact(b: Shot, target: Body) -> void:
	if b.owner == "enemy":
		_ev("impact", {"pos": b.pos, "color": Color("#5cffb0"), "els": [], "enemy": true})
		return
	var sp := b.sp
	var d: Dictionary = sp["def"]
	var R := float(d.get("explode", d.get("splash", 0.0)))
	if R > 0:
		_explode(b.pos, R, sp["payload"], {"self_mul": 0.45 if d.has("explode") else 0.3, "big": d.has("explode"),
			"color": sp["color"], "els": sp["els"]})
	else:
		_env_at(b.pos, 0.5, sp["els"], b.kind == "boulder")
	if d.has("chainOnImpact"):
		var hit := {}
		if target:
			hit[target.id] = true
		var nx: Body = null
		var nb := 5.0
		for e in live():
			if not hit.has(e.id):
				var dd: float = e.pos.distance_to(b.pos)
				if dd < nb:
					nb = dd
					nx = e
		if nx:
			var pts := [b.pos]
			_chain_walk(_zap, nx, int(d["chainOnImpact"]) - 1, pts, 0.9, hit)
			_ev("chain", {"pts": pts, "els": ["lightning"], "color": Color("#f4e15c")})
	if d.has("leaves"):
		var l: Dictionary = d["leaves"]
		_spawn_area(SpellBook.make_spell(["fire"], {"name": "burning ground", "shape": "area", "radius": l["radius"],
			"life": l["life"], "tick": l["tick"], "mult": l["mult"], "hitsAll": true}, 1.0, "burning"), b.pos)
	_ev("impact", {"pos": b.pos, "els": sp["els"], "color": sp["color"], "kind": b.kind, "r": R})


# ---------------------------------------------------------------- areas & walls
func _update_areas(dt: float) -> void:
	var p := player
	for a in areas:
		if a.delay > 0:
			a.delay -= dt
			if a.delay <= 0 and a.burst:
				_explode(a.pos, a.r, a.sp["payload"], {"self_mul": 0.6 if a.hits_all else 0.0, "big": true,
					"color": a.color, "els": a.els, "reason": "Stood under your own " + a.name})
				if a.repeat > 0:
					a.repeat -= 1
					a.delay = a.interval
					a.delay_max = a.interval
					a.pos = a.center + Vector2(rng.randf_range(-1, 1), rng.randf_range(-1, 1)) * a.scatter
					continue
				a.life = 0
				if a.sp["def"].has("leaves"):
					var l: Dictionary = a.sp["def"]["leaves"]
					_spawn_area(SpellBook.make_spell(["fire"], {"name": "sea of fire", "shape": "area", "radius": l["radius"],
						"life": l["life"], "tick": l["tick"], "mult": l["mult"], "hitsAll": true}, 1.0, "burning"), a.center)
			continue
		a.life -= dt
		if a.swallow:
			var kept := []
			for b in shots:
				if b.owner == "enemy" and b.pos.distance_to(a.pos) < a.r:
					_ev("tag", {"tag": "swallowed", "pos": b.pos})
				else:
					kept.append(b)
			shots = kept
		if a.pull > 0:
			for e in live():
				var v: Vector2 = a.pos - e.pos
				var L := v.length()
				if L < a.r + e.r and L > 0.3:
					e.kvel += v / L * a.pull * dt * 6 / e.mass
		a.tick_t -= dt
		if a.tick_t <= 0:
			a.tick_t = a.tick
			var pl: Dictionary = a.sp["payload"].duplicate()
			pl["knock"] = 0.0
			for e in live():
				if e.pos.distance_to(a.pos) < a.r + e.r * 0.5:
					_apply_payload(e, pl, {"area": true})
			if a.hits_all and p.alive and p.pos.distance_to(a.pos) < a.r:
				_apply_payload(p, pl, {"area": true, "reason": "Standing in your own " + a.name})
			if a.heal > 0 and p.pos.distance_to(a.pos) < a.r:
				heal(a.heal, a.name)
			_env_at(a.pos, a.r * 0.8, a.els, false)
	var keep := []
	for a in areas:
		if a.life > 0:
			keep.append(a)
	areas = keep


func _update_walls(dt: float) -> void:
	for w in walls:
		w.life -= dt
		if w.regen > 0:
			w.hp = minf(w.max_hp, w.hp + w.regen * dt)
		if w.chill:
			w.touch_t -= dt
			if w.touch_t <= 0:
				w.touch_t = 0.8
				for e in live():
					if e.pos.distance_to(w.pos) < e.r + w.r + 0.2:
						_apply_payload(e, ENV["rime"])
	var out := []
	for w in walls:
		if w.life > 0 and w.hp > 0:
			out.append(w)
		else:
			_ev("wallBreak", {"id": w.id, "pos": w.pos, "mat": w.mat})
	walls = out


func _next_id() -> int:
	nid += 1
	return nid - 1
