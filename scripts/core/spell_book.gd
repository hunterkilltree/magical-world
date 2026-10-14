# The spell book (data/spells.json): six elements, six shapes, and the combos that turn a
# queue of up to three elements into one spell. Port of the prototype's spells.js.
#
# Resolve order: the exact key with repeats (earth+earth), else a repeated pair that covers
# every element (fire, fire, fire is Supernova at +30%), else the distinct elements' key with
# +30% power per repeat, else (three distinct, no entry) the highest-ranked pair with the third
# element riding along at x1.15. Fire and ice, and light and dark, cancel when queued.
extends RefCounted

const DATA_PATH := "res://data/spells.json"
const ORDER := ["fire", "water", "ice", "lightning", "earth", "arcane", "nature", "wind", "light", "dark"]
const RANK := ["wall", "area", "beam", "boulder", "chain", "bolt", "cone"]
# Combo keys that pass straight into the payload (status effects a spell adds on top of its elements).
const DEF_PAYLOAD := ["slow", "root", "blind", "freeze", "trueDamage", "stun", "silence", "weaken", "inaccurate",
	"confuse", "slowPct", "energyDrain", "drainPct"]

static var _data: Dictionary = {}
static var _book: Dictionary = {} # sorted "a+b" key -> combo def


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


static func book() -> Dictionary:
	data()
	return _book


# Every combo once, for the pause screen's grimoire: {key, els, def}.
static func grimoire() -> Array:
	var out := []
	for k in book():
		out.append({"key": k, "els": Array(k.split("+")), "def": book()[k]})
	return out


# Adds `el` to `queue` in place. Returns "queued", "cancel" (it removed its opposite) or "full".
static func queue_element(queue: Array, el: String) -> String:
	var opp := cancels(el)
	if opp != "":
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
		"key": key, "def": def, "name": spell_name, "els": sorted_els, "counts": counts, "power": power,
		"payload": pl, "cost": roundi(sorted_els.size() * 8 * float(sh["cost"])),
		"cd": float(def.get("cd", sh["cd"])), "color": mix_color(counts),
	}


# The spell `queue` casts, or {} if it makes none.
static func resolve(queue: Array) -> Dictionary:
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
	var b := book()
	if b.has(exact):
		return make_spell(els, b[exact], 1.0, exact)
	if els.size() == 3 and distinct.size() == 1 and b.has(els[0] + "+" + els[0]):
		var pair: String = els[0] + "+" + els[0]
		return make_spell(els, b[pair], 1.3, pair)
	if b.has(dkey):
		return make_spell(els, b[dkey], 1.0 + 0.3 * (els.size() - distinct.size()), dkey)
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
	return make_spell(els, b[best], 1.15, best, "%s + %s" % [b[best]["name"], ", ".join(PackedStringArray(riders))])
