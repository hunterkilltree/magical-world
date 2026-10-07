# A zone's tile grid plus its mutable run state (gates, destructibles, loot).
# Pure logic: no nodes, so it can be tested headlessly.
extends RefCounted

const TILE := 32
const DATA_PATH := "res://data/zones.json"
const BLOCKING := ["#", " ", "o"]
const DESTRUCTIBLE_HP := 30
const GATE_RADIUS := 3
# Per-zone '~' tile behaviour: speed multiplier, damage per second, seconds until it breaks.
const HAZARDS := {
	"tundra": {"break_after": 1.0},
	"pine": {"speed": 0.5},
	"keep": {"dps": 5.0},
	"volcano": {"dps": 15.0},
	"bog": {"speed": 0.4},
	"cavern": {"dps": 8.0},
}
const ROUGH_SPEED := 0.7
const BROKEN_ICE := {"speed": 0.5, "dps": 10.0}
# Seconds the party must hold the gate area before gates open (zones without an entry stay shut).
const GATE_HOLD := {"tundra": 10.0}

static var _cache: Dictionary = {}

var id := ""
var width := 0
var height := 0
var colors: Dictionary = {}
var objective := ""
var gates_open := false
var _tiles: Array = []  # Array of Array[String], one per row
var _destructible_hp: Dictionary = {}
var _looted: Dictionary = {}
var _ice_time: Dictionary = {}
var _gate_hold_time := 0.0


static func load_zone(zone_id: String):
	if _cache.is_empty():
		var parsed = JSON.parse_string(FileAccess.get_file_as_string(DATA_PATH))
		if parsed is Dictionary:
			_cache = parsed
	for z in _cache.get("zones", []):
		if z["id"] == zone_id:
			var g = new()
			g._init_from(z, int(_cache["width"]), int(_cache["height"]))
			return g
	return null


func _init_from(z: Dictionary, w: int, h: int) -> void:
	id = z["id"]
	width = w
	height = h
	colors = z["colors"]
	objective = z["objective"]
	for row in z["rows"]:
		var r := []
		for i in row.length():
			r.append(row[i])
		_tiles.append(r)


func tile_at(c: Vector2i) -> String:
	if c.x < 0 or c.y < 0 or c.x >= width or c.y >= height:
		return " "
	return _tiles[c.y][c.x]


func is_walkable(c: Vector2i) -> bool:
	var t := tile_at(c)
	if t in BLOCKING or t == "D":
		return false
	if t == "G" and not gates_open:
		return false
	return true


func cells_of(ch: String) -> Array:
	var out := []
	for y in height:
		for x in width:
			if _tiles[y][x] == ch:
				out.append(Vector2i(x, y))
	return out


func cell_center(c: Vector2i) -> Vector2:
	return Vector2(c.x * TILE + TILE / 2.0, c.y * TILE + TILE / 2.0)


func world_to_cell(p: Vector2) -> Vector2i:
	return Vector2i(floori(p.x / TILE), floori(p.y / TILE))


# True if a circle of `radius` centred on p overlaps only walkable cells.
func can_stand(p: Vector2, radius: float) -> bool:
	for dx in [-radius, radius]:
		for dy in [-radius, radius]:
			if not is_walkable(world_to_cell(p + Vector2(dx, dy))):
				return false
	return true


# Breadth-first set of cells reachable from `start` over walkable cells.
func reachable_from(start: Vector2i, avoid: Array = []) -> Dictionary:
	var seen := {start: true}
	var queue := [start]
	while not queue.is_empty():
		var c: Vector2i = queue.pop_front()
		for d in [Vector2i.RIGHT, Vector2i.LEFT, Vector2i.DOWN, Vector2i.UP]:
			var n: Vector2i = c + d
			if seen.has(n) or not is_walkable(n) or tile_at(n) in avoid:
				continue
			seen[n] = true
			queue.append(n)
	return seen


# Shortest walkable path (list of cells, start included) or [] if none.
func find_path(from: Vector2i, to: Vector2i, avoid: Array = []) -> Array:
	var prev := {from: from}
	var queue := [from]
	while not queue.is_empty():
		var c: Vector2i = queue.pop_front()
		if c == to:
			var path := [c]
			while c != from:
				c = prev[c]
				path.push_front(c)
			return path
		for d in [Vector2i.RIGHT, Vector2i.LEFT, Vector2i.DOWN, Vector2i.UP]:
			var n: Vector2i = c + d
			if prev.has(n) or not is_walkable(n) or tile_at(n) in avoid:
				continue
			prev[n] = c
			queue.append(n)
	return []


# ---- gates (R-010) ---------------------------------------------------------

func open_gates() -> void:
	gates_open = true


# The hold area is around the northern gates only ("hold the north bridge").
func in_hold_area(c: Vector2i) -> bool:
	for g in cells_of("G"):
		if g.y >= height / 2:
			continue
		if maxi(absi(g.x - c.x), absi(g.y - c.y)) <= GATE_RADIUS:
			return true
	return false


# Accumulates time spent holding the gate area; opens gates once the zone's
# hold requirement is met. Zones with no requirement never open this way.
func update_gate_hold(party_cell: Vector2i, delta: float) -> void:
	if gates_open or not GATE_HOLD.has(id):
		return
	if in_hold_area(party_cell):
		_gate_hold_time += delta
		if _gate_hold_time >= GATE_HOLD[id]:
			open_gates()


# ---- destructibles (R-011) -------------------------------------------------

# Returns true when the tile at c was destroyed by this hit.
func damage_tile(c: Vector2i, amount: int, element := "") -> bool:
	if tile_at(c) != "D":
		return false
	var hp: int = _destructible_hp.get(c, DESTRUCTIBLE_HP)
	hp = 0 if element == "fire" else hp - amount
	if hp <= 0:
		_tiles[c.y][c.x] = "."
		_destructible_hp.erase(c)
		return true
	_destructible_hp[c] = hp
	return false


# ---- loot (R-012) ----------------------------------------------------------

# Opens a cache once; returns {} if it is not a cache or already looted.
func open_loot(c: Vector2i, inventory = null) -> Dictionary:
	if tile_at(c) != "C" or _looted.has(c):
		return {}
	_looted[c] = true
	var item := {"id": "%s_cache_%d_%d" % [id, c.x, c.y], "kind": "item"}
	if inventory != null:
		inventory.add(item)
	return item


func is_looted(c: Vector2i) -> bool:
	return _looted.has(c)


# ---- terrain effects (R-009) -----------------------------------------------

# Effect of standing on cell c for `delta` seconds: {"speed": mult, "dps": n}.
# Time-based effects (thin ice breaking) advance here.
func stand_on(c: Vector2i, delta: float) -> Dictionary:
	var t := tile_at(c)
	var effect := {"speed": 1.0, "dps": 0.0}
	if t == ",":
		effect["speed"] = ROUGH_SPEED
	elif t == "w":
		effect.merge(BROKEN_ICE, true)
	elif t == "~":
		var h: Dictionary = HAZARDS.get(id, {})
		if h.has("break_after"):
			_ice_time[c] = _ice_time.get(c, 0.0) + delta
			if _ice_time[c] >= h["break_after"]:
				_tiles[c.y][c.x] = "w"
		else:
			effect.merge(h, true)
	return effect


# ---- persistence (R-017) ---------------------------------------------------

func looted_cells() -> Array:
	return _looted.keys()


# Marks caches as looted; cells that are not caches are ignored.
func restore_loot(cells: Array) -> void:
	for c in cells:
		if tile_at(c) == "C":
			_looted[c] = true
