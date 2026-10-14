# Sound effects (R-061): recorded clips from data/sfx.json, played for the sim's events. Like the VFX
# it only reads events. Each key has several takes (one picked at random), a pitch range, a
# throttle (so swarms don't stack) and a bus: SFX (compressed) or UI. Positional sounds play at the
# event on the ground. Long clips are cut at `len` with a short fade. Queue pings and combo chords
# keep the handoff's notes (audio.js) by pitching one bell clip. Missing clips play nothing.
extends Node3D

const MANIFEST := "res://data/sfx.json"
const POOL_3D := 24
const POOL_UI := 12
const FADE := 0.08
# Every sim event type with a sound; data/sfx.json lists the silent ones.
const ROUTED := ["queue", "cast", "nova", "selfcast", "heal", "ward", "explode", "impact", "chain", "charge", "beam",
	"hit", "hurt", "tag", "block", "steam", "ignite", "slam", "claw", "spawn", "death", "dodge", "wall", "wallBreak",
	"cancel", "clear", "wave", "waveClear", "playerDeath", "noEnergy", "fizzle", "queueFull", "cooldown"]
# Element notes in Hz (the handoff's six from audio.js, plus ours) and the bell clip's own note.
const NOTE := {"earth": 261.6, "fire": 392.0, "arcane": 523.3, "water": 587.3, "ice": 659.3, "lightning": 880.0,
	"nature": 349.2, "wind": 493.9, "light": 1046.5, "dark": 220.0}
const BASE_NOTE := 523.3

var manifest: Dictionary = {}
var muted := false
var volume := 0.8
var clock := 0.0
var settings_path := "user://settings.cfg"
var trace = null # tests: set to [] to log every play as {key, pos, pitch, delay, t}
var _sounds := {} # key -> {streams, db, pitch, throttle, bus, positional, len, offset}
var _last := {}
var _p3: Array = []
var _pui: Array = []
var _i3 := 0
var _iui := 0
var _pending: Array = [] # delayed plays: {due, key, pos, pitch, S}
var _stops := {} # player -> {end, db}
var _warned := {}
var _ready_done := false


func setup() -> void:
	if _ready_done:
		return
	_ready_done = true
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(MANIFEST))
	manifest = parsed if parsed is Dictionary else {"silent": [], "sounds": {}}
	for k in manifest["sounds"]:
		add_sound(k, manifest["sounds"][k])
	_ensure_bus("SFX", true)
	_ensure_bus("UI", false)
	for i in POOL_3D:
		var p := AudioStreamPlayer3D.new()
		p.unit_size = 9.0
		p.max_distance = 70.0
		p.bus = "SFX"
		add_child(p)
		_p3.append(p)
	for i in POOL_UI:
		var p := AudioStreamPlayer.new()
		add_child(p)
		_pui.append(p)
	var cfg := ConfigFile.new()
	if cfg.load(settings_path) == OK:
		volume = clampf(cfg.get_value("audio", "volume", volume), 0.0, 1.0)
		muted = cfg.get_value("audio", "muted", muted)
	_apply()


# Registers a sound; clips that don't exist are skipped (a warning, never an error).
func add_sound(key: String, d: Dictionary) -> void:
	var streams := []
	for f in d.get("files", []):
		if ResourceLoader.exists(f):
			var s = load(f)
			if s is AudioStream:
				streams.append(s)
	_sounds[key] = {"streams": streams, "db": float(d.get("db", 0.0)), "pitch": d.get("pitch", [1.0, 1.0]),
		"throttle": float(d.get("throttle", 0.0)), "bus": d.get("bus", "SFX"), "positional": d.get("positional", false),
		"len": float(d.get("len", 0.0)), "offset": d.get("offset", false)}


func streams(key: String) -> Array:
	return _sounds.get(key, {}).get("streams", [])


static func _ensure_bus(name: String, compress: bool) -> int:
	var i := AudioServer.get_bus_index(name)
	if i != -1:
		return i
	AudioServer.add_bus()
	i = AudioServer.bus_count - 1
	AudioServer.set_bus_name(i, name)
	AudioServer.set_bus_send(i, "Master")
	if compress:
		var c := AudioEffectCompressor.new()
		c.threshold = -18.0
		c.ratio = 5.0
		c.attack_us = 3000.0
		c.release_ms = 200.0
		AudioServer.add_bus_effect(i, c)
	return i


# ---------------------------------------------------------------- settings
func set_volume(v: float) -> void:
	volume = clampf(v, 0.0, 1.0)
	_apply()
	_save()


func set_muted(m: bool) -> void:
	muted = m
	_apply()
	_save()


func _apply() -> void:
	for name in ["SFX", "UI"]:
		var i := AudioServer.get_bus_index(name)
		if i != -1:
			AudioServer.set_bus_volume_db(i, linear_to_db(maxf(volume, 0.0001)))
			AudioServer.set_bus_mute(i, muted)


func _save() -> void:
	var cfg := ConfigFile.new()
	cfg.load(settings_path)
	cfg.set_value("audio", "volume", volume)
	cfg.set_value("audio", "muted", muted)
	cfg.save(settings_path)


# ---------------------------------------------------------------- playing
# Plays `key` (at a ground point `pos` if it is positional), pitched by `pitch`, after `delay` s.
# Returns false when it doesn't play (muted, unknown key, no clip, or throttled).
func play(key: String, pos = null, pitch := 1.0, delay := 0.0) -> bool:
	if muted or not _sounds.has(key):
		return false
	var S: Dictionary = _sounds[key]
	if S["streams"].is_empty():
		if not _warned.has(key):
			_warned[key] = true
			push_warning("sfx: no clip for '%s'" % key)
		return false
	if clock - _last.get(key, -1e9) < S["throttle"]:
		return false
	_last[key] = clock
	var p3 = Vector3(pos.x, 1.0, pos.y) if pos is Vector2 and S["positional"] else null
	var pr: float = pitch * randf_range(S["pitch"][0], S["pitch"][1])
	if trace != null:
		trace.append({"key": key, "pos": p3, "pitch": pr, "delay": delay, "t": clock})
	var job := {"due": clock + delay, "key": key, "pos": p3, "pitch": pr, "S": S}
	if delay > 0:
		_pending.append(job)
	else:
		_start(job)
	return true


func _start(job: Dictionary) -> void:
	var S: Dictionary = job["S"]
	var stream: AudioStream = S["streams"][randi() % S["streams"].size()]
	var p
	if job["pos"] != null:
		p = _p3[_i3 % _p3.size()]
		_i3 += 1
		p.position = job["pos"]
	else:
		p = _pui[_iui % _pui.size()]
		_iui += 1
	p.stream = stream
	p.bus = S["bus"]
	p.volume_db = S["db"]
	p.pitch_scale = maxf(0.05, job["pitch"])
	var from := 0.0
	var L: float = S["len"]
	if S["offset"] and L > 0:
		from = randf() * maxf(0.0, stream.get_length() - L * job["pitch"])
	_stops.erase(p)
	if L > 0:
		_stops[p] = {"end": clock + L, "db": S["db"]}
	p.play(from)


func update(dt: float) -> void:
	clock += dt
	for i in range(_pending.size() - 1, -1, -1):
		if _pending[i]["due"] <= clock:
			_start(_pending[i])
			_pending.remove_at(i)
	for p in _stops.keys():
		var s: Dictionary = _stops[p]
		var left: float = s["end"] - clock
		if left <= 0:
			p.stop()
			_stops.erase(p)
		elif left < FADE:
			p.volume_db = s["db"] + linear_to_db(maxf(left / FADE, 0.001))


# ---------------------------------------------------------------- events
func consume(events: Array, sim) -> void:
	for e in events:
		var at = e.get("pos")
		match e["type"]:
			"queue":
				play("chime", null, NOTE.get(e["el"], BASE_NOTE) / BASE_NOTE)
				var q: Array = sim.player.queue if sim else []
				if _distinct(q).size() >= 2 and q[q.size() - 1] == e["el"]:
					play("combo_ready")
			"cast":
				var els := _distinct(e["els"])
				for el in els:
					play("cast_" + el, at)
				if e.get("from_queue", true) and els.size() >= 2:
					for i in els.size():
						play("chime", null, NOTE.get(els[i], BASE_NOTE) / 2.0 / BASE_NOTE, i * 0.035)
					play("combo_thump")
					if e.get("is_new", false):
						play("fanfare", null, 1.0, 0.12)
			"nova":
				play("nova", at)
			"selfcast":
				play("selfcast", at)
			"heal":
				play("heal", at)
			"ward":
				play("ward", at)
			"explode":
				play("explode_big" if e["big"] else "explode_small", at)
			"impact":
				if e.get("enemy", false):
					play("orb_impact", at)
				else:
					play("boulder" if e.get("kind", "") == "boulder" else "impact", at)
			"chain":
				var pts: Array = e.get("pts", [])
				play("zap", pts[1] if pts.size() > 1 else at)
			"charge":
				play("zap", at)
			"beam":
				play("beam", e.get("from"))
			"hit":
				if not e.get("dot", false):
					play("hit", at)
			"hurt":
				if not e.get("dot", false):
					play("hurt", at)
			"tag":
				play("tag_" + e["tag"], at)
			"block":
				play("tag_blocked", at)
			"steam":
				play("steam", at)
			"ignite":
				play("ignite", at)
			"slam":
				play("slam", at)
			"claw":
				play("claw", at)
			"spawn":
				play("spawn", at)
			"death":
				play("death_frozen" if e.get("frozen", false) else "death", at)
			"dodge":
				play("dodge", at)
			"wall":
				play("wall_raise", at)
			"wallBreak":
				play("wall_break_ice" if e.get("mat", "") == "ice" else "wall_break", at)
			"cancel":
				play("cancel")
			"clear":
				play("clear")
			"wave":
				play("wave")
			"waveClear":
				play("wave_clear")
			"playerDeath":
				play("player_death")
			"noEnergy", "fizzle", "queueFull", "cooldown":
				play("refuse")


static func _distinct(els: Array) -> Array:
	var out := []
	for e in els:
		if not out.has(e):
			out.append(e)
	return out
