# The spell book (data/spells.json): six elements, six shapes, and the combos that turn a
# queue of up to three elements into one spell. Port of the prototype's spells.js.
#
# Resolve order: the exact key with repeats (earth+earth), else a repeated pair that covers
# every element (fire, fire, fire is Supernova at +30%), else the distinct elements' key with
# +30% power per repeat, else (three distinct, no entry) the highest-ranked pair with the third
# element riding along at x1.15. Fire and ice, and light and dark, cancel when queued.
#
# Books (R-071): spells.json is the court book. Each wizard casts as one of five roles
# (data/roles.json): singles, doubles and triples are shared, but every pair of two different
# elements makes the role's own spell (45 pairs x 5 roles = 225). A role spell's key is
# "mix@role" so it is found, recharged and drawn as its own spell. Every combo in a wizard's
# book leans toward their colour (data/schools.json: the wizard's look, R-070). Opposites
# cancel in the queue unless the role has a spell for the clash.
extends RefCounted

const DATA_PATH := "res://data/spells.json"
const SCHOOLS_PATH := "res://data/schools.json"
const ROLES_PATH := "res://data/roles.json"
const ORDER := ["fire", "water", "ice", "lightning", "earth", "arcane", "nature", "wind", "light", "dark"]
const RANK := ["wall", "area", "beam", "boulder", "chain", "bolt", "cone", "swap", "dash", "blink", "decoy", "guard"]
const TIER3_POWER := 1.5 # an unnamed triple of three different elements rides its best pair (role books)
# Combo keys that pass straight into the payload (status effects a spell adds on top of its elements).
const TINT := 0.35 # how far a wizard's combos lean toward their school's tint (R-070)
const DEF_PAYLOAD := ["slow", "root", "blind", "freeze", "trueDamage", "stun", "silence", "weaken", "inaccurate",
	"confuse", "slowPct", "energyDrain", "drainPct", "curse", "burnMult"]

static var _data: Dictionary = {}
static var _book: Dictionary = {} # sorted "a+b" key -> combo def
static var _schools = null
static var _roles = null # data/roles.json, parsed once
static var _books: Dictionary = {} # wizard id -> its whole book (court book with its school's combos over it)


static func data() -> Dictionary:
	if _data.is_empty():
		var parsed = JSON.parse_string(FileAccess.get_file_as_string(DATA_PATH))
		if parsed is Dictionary:
			_data = parsed
			for k in _data["combos"]:
				_book[norm(k)] = _data["combos"][k]
	return _data


static func max_queue() -> int:
	return int(data()["max_queue"])


static func element(el: String) -> Dictionary:
	return data()["elements"].get(el, {})


static func shape(id: String) -> Dictionary:
	return data()["shapes"].get(id, data()["shapes"]["bolt"])


static func color(el: String) -> Color:
	return Color.hex((int(element(el).get("color", 0xffffff)) << 8) | 0xff)


static func cancels(el: String) -> String:
	return data()["cancels"].get(el, "")


static func norm(key: String) -> String:
	var parts := Array(key.split("+"))
	parts.sort()
	return "+".join(PackedStringArray(parts))


# wizard id -> {name, motto, combos: {mix: def}} from data/schools.json.
static func schools() -> Dictionary:
	if _schools == null:
		_schools = {}
		var parsed = JSON.parse_string(FileAccess.get_file_as_string(SCHOOLS_PATH))
		if parsed is Dictionary:
			_schools = parsed["schools"]
	return _schools


static func school(id: String) -> Dictionary:
	return schools().get(id, {})


# data/roles.json: {roles, styles, shape_weight, wizard_role, archetypes, spells}.
static func roles_data() -> Dictionary:
	if _roles == null:
		_roles = {}
		var parsed = JSON.parse_string(FileAccess.get_file_as_string(ROLES_PATH))
		if parsed is Dictionary:
			_roles = parsed
	return _roles


# The role a wizard casts as ("" for the court book or an unknown id).
static func role_of(wizard_id: String) -> String:
	return String(roles_data().get("wizard_role", {}).get(wizard_id, ""))


static func role(id: String) -> Dictionary:
	return roles_data().get("roles", {}).get(id, {})


# A role spell: its archetype's fields under its own (name, shape, mult...), as the book holds it.
static func role_spells(role_id: String) -> Dictionary:
	var out := {}
	var rd := roles_data()
	for s in rd.get("spells", []):
		if s["role"] != role_id:
			continue
		var def: Dictionary = rd["archetypes"][s["arch"]].duplicate(true)
		def.merge(s, true)
		def["_key"] = String(s["key"]) + "@" + role_id
		out[s["key"]] = def
	return out


static func _is_pair(k: String) -> bool:
	var p := k.split("+")
	return p.size() == 2 and p[0] != p[1]


# The combos `id` casts from: sorted mix -> def. "" (or an unknown id) is the court book.
static func book(id := "") -> Dictionary:
	data()
	var role_id := role_of(id)
	if role_id == "":
		return _book
	if not _books.has(id):
		var b := {}
		for k in _book:
			if not _is_pair(k):
				b[k] = _book[k]
		var own := role_spells(role_id)
		for k in own:
			b[norm(k)] = own[k]
		var tint: String = schools().get(id, {}).get("look", {}).get("tint", "")
		if tint != "":
			for k in b:
				if "+" in k:
					b[k] = b[k].duplicate()
					b[k]["tint"] = tint
		_books[id] = b
	return _books[id]


# The key a book's entry casts under: the mix for court spells, "mix@wizard" for school spells.
static func key_of(b: Dictionary, mix: String) -> String:
	return b[mix].get("_key", mix)


# Every combo of a book once, for the pause screen's grimoire: {key, mix, els, def, own}.
static func grimoire(id := "") -> Array:
	var out := []
	var b := book(id)
	for k in b:
		out.append({"key": key_of(b, k), "mix": k, "els": Array(k.split("+")), "def": b[k], "own": b[k].has("_key")})
	return out


# Adds `el` to `queue` in place. Returns "queued", "cancel" (it removed its opposite) or "full".
static func queue_element(queue: Array, el: String, book_id := "") -> String:
	var opp := cancels(el)
	if opp != "" and not book(book_id).has(norm(el + "+" + opp)):
		var i := queue.rfind(opp)
		if i >= 0:
			queue.remove_at(i)
			return "cancel"
	if queue.size() >= max_queue():
		return "full"
	queue.append(el)
	return "queued"


static func mix_color(counts: Dictionary) -> Color:
	var r := 0.0
	var g := 0.0
	var b := 0.0
	var n := 0
	for el in counts:
		var h := int(element(el)["color"])
		r += ((h >> 16) & 255) * counts[el]
		g += ((h >> 8) & 255) * counts[el]
		b += (h & 255) * counts[el]
		n += counts[el]
	return Color8(roundi(r / n), roundi(g / n), roundi(b / n))


# A spell: {key, def, name, els (sorted), counts, power, payload, cost, cd, color}.
# The payload is what a hit carries: {parts: {el: damage}, knock, els, burn, burnDps, wet, chill, shock,
# root, gust, blind, curse, drain, slow, freeze, trueDamage}.
static func make_spell(els: Array, def: Dictionary, power := 1.0, key := "", spell_name := "") -> Dictionary:
	var sorted_els := els.duplicate()
	sorted_els.sort()
	if key == "":
		key = norm("+".join(PackedStringArray(sorted_els)))
	if spell_name == "":
		spell_name = def.get("name", "")
	var counts := {}
	for e in sorted_els:
		counts[e] = counts.get(e, 0) + 1
	var m: float = float(def.get("mult", 1.0)) * power
	var pl := {"parts": {}, "knock": float(def.get("knock", 0.0)), "els": counts.keys()}
	for el in counts:
		var n: int = counts[el]
		var h: Dictionary = element(el)["hit"]
		if h.get("dmg", 0) > 0:
			pl["parts"][el] = h["dmg"] * n * m
		if h.get("knock", 0) > 0:
			pl["knock"] += h["knock"] * n
		if h.has("burn"):
			pl["burn"] = h["burn"] * (1.0 + 0.3 * (n - 1))
			pl["burnDps"] = h["burnDps"] * n * power
		if h.has("wet"):
			pl["wet"] = float(h["wet"])
		if h.has("chill"):
			pl["chill"] = float(h["chill"] * n)
		if h.has("shock"):
			pl["shock"] = float(h["shock"])
		if h.has("root"):
			pl["root"] = h["root"] * (1.0 + 0.3 * (n - 1))
		if h.has("gust"):
			pl["gust"] = float(n)
		if h.has("blind"):
			pl["blind"] = float(h["blind"])
		if h.has("curse"):
			pl["curse"] = float(h["curse"])
			pl["drain"] = float(h["drain"])
	for k in DEF_PAYLOAD:
		if def.has(k):
			pl[k] = def[k] if k == "trueDamage" else maxf(float(def[k]), pl.get(k, 0.0))
	if def.has("burnMult") and pl.has("burnDps"):
		pl["burnDps"] *= float(def["burnMult"])
	var sh := shape(def.get("shape", "bolt"))
	return {
		"key": key, "def": def, "name": spell_name, "els": sorted_els, "tier": counts.size(), "counts": counts, "power": power,
		"payload": pl, "cost": roundi(sorted_els.size() * 8 * float(sh["cost"])),
		"cd": float(def.get("cd", sh["cd"])),
		"color": mix_color(counts).lerp(Color(def["tint"]), TINT) if def.has("tint") else mix_color(counts),
	}


# The spell `queue` casts from `book_id`'s book, or {} if it makes none.
static func resolve(queue: Array, book_id := "") -> Dictionary:
	if queue.is_empty():
		return {}
	var els := queue.duplicate()
	els.sort()
	var exact := "+".join(PackedStringArray(els))
	var distinct := []
	for e in els:
		if not distinct.has(e):
			distinct.append(e)
	var dkey := "+".join(PackedStringArray(distinct))
	var b := book(book_id)
	if b.has(exact):
		return make_spell(els, b[exact], 1.0, key_of(b, exact))
	if els.size() == 3 and distinct.size() == 1 and b.has(els[0] + "+" + els[0]):
		var pair: String = els[0] + "+" + els[0]
		return make_spell(els, b[pair], 1.3, key_of(b, pair))
	if b.has(dkey):
		return make_spell(els, b[dkey], 1.0 + 0.3 * (els.size() - distinct.size()), key_of(b, dkey))
	var best := ""
	for i in distinct.size():
		for j in range(i + 1, distinct.size()):
			var k: String = distinct[i] + "+" + distinct[j]
			if b.has(k) and (best == "" or RANK.find(b[k]["shape"]) < RANK.find(b[best]["shape"])):
				best = k
	if best == "":
		return {}
	var riders := []
	for e in distinct:
		if not best.split("+").has(e):
			riders.append(element(e)["name"])
	var rider := TIER3_POWER if role_of(book_id) != "" else 1.15
	return make_spell(els, b[best], rider, key_of(b, best), "%s + %s" % [b[best]["name"], ", ".join(PackedStringArray(riders))])


# --- Casting flow (R-073): windup -> hold -> release -> recoil, from the role's style (data/roles.json).
# mode: "aim" | "nova" | "self". Heavier shapes and tiers wind up longer; a self-cast barely at all.
static func cast_timing(sp: Dictionary, role_id: String, mode: String) -> Dictionary:
	var rd := roles_data()
	var style: String = role(role_id).get("style", "thrust")
	var S: Dictionary = rd["styles"][style]
	var shape: String = sp["def"].get("shape", "bolt")
	var tier := int(sp.get("tier", sp["counts"].size() if sp.has("counts") else 1))
	var w := minf(1.3, float(rd["shape_weight"].get(shape, 0.5)) * (0.75 + 0.25 * tier) + (0.3 if mode == "nova" else 0.0))
	var windup := 0.08 if mode == "self" else minf(0.34, float(S["windup"]) * (0.55 + 0.6 * w))
	var hold := 0.0 if mode == "self" else 0.03 + 0.07 * minf(1.0, w)
	return {"style": style, "weight": w, "windup": windup, "hold": hold, "total": windup + hold,
		"recoil": float(S["recoil"]) * (0.7 + 0.5 * w)}


# Seconds of frozen time on release: a combo's first cast stops time longest; a slam always a little.
static func release_hitstop(sp: Dictionary, timing: Dictionary, from_queue: bool, is_new: bool, mode: String) -> float:
	var h := 0.0
	var tier := int(sp.get("tier", 1))
	if from_queue and tier >= 2:
		h = 0.16 if is_new else (0.07 if tier >= 3 else 0.035)
	if timing["style"] == "slam" and mode != "self":
		h = maxf(h, 0.04 + 0.05 * timing["weight"])
	return h

