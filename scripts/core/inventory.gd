extends RefCounted

var items: Array = []


func add(item: Dictionary) -> void:
	items.append(item)


func has_item(item_id: String) -> bool:
	for i in items:
		if i["id"] == item_id:
			return true
	return false


func to_array() -> Array:
	return items.duplicate(true)


# Replaces the contents (does not append), keeping only well-formed items.
func restore(saved: Array) -> void:
	items.clear()
	for i in saved:
		if i is Dictionary and i.has("id") and i.has("kind"):
			items.append({"id": str(i["id"]), "kind": str(i["kind"])})
