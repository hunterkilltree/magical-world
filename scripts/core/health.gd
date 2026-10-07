extends RefCounted

signal died

var max_health := 100
var current := 100
var _dead := false


func take_damage(amount: int) -> void:
	if _dead or amount <= 0:
		return
	current = maxi(0, current - amount)
	if current == 0:
		_dead = true
		died.emit()


func is_dead() -> bool:
	return _dead
