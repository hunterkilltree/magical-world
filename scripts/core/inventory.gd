extends RefCounted

var items: Array = []


func add(item: Dictionary) -> void:
	items.append(item)


func has_item(item_id: String) -> bool:
	for i in items:
		if i["id"] == item_id:
			return true
	return false
