extends RefCounted

signal died

var max_health := 100
var current := 100
var shield := 0
var _dead := false
var _shield_time := 0.0
var _regen_rate := 0.0
var _regen_time := 0.0
var _invulnerable_time := 0.0


func take_damage(amount: int) -> void:
	if _dead or amount <= 0 or _invulnerable_time > 0.0:
		return
	if shield > 0:
		var absorbed := mini(shield, amount)
		shield -= absorbed
		amount -= absorbed
		if amount == 0:
			return
	current = maxi(0, current - amount)
	if current == 0:
		_dead = true
		died.emit()


func is_dead() -> bool:
	return _dead


func heal(amount: int) -> void:
	if _dead or amount <= 0:
		return
	current = mini(max_health, current + amount)


# Absorbs `amount` damage for up to `seconds`.
func add_shield(amount: int, seconds: float) -> void:
	shield += amount
	_shield_time = maxf(_shield_time, seconds)


func add_regen(rate_per_second: float, seconds: float) -> void:
	_regen_rate = rate_per_second
	_regen_time = seconds


func make_invulnerable(seconds: float) -> void:
	_invulnerable_time = maxf(_invulnerable_time, seconds)


# Advances shield, regeneration and invulnerability timers.
func update(delta: float) -> void:
	if _invulnerable_time > 0.0:
		_invulnerable_time -= delta
	if _shield_time > 0.0:
		_shield_time -= delta
		if _shield_time <= 0.0:
			shield = 0
	if _regen_time > 0.0:
		heal(int(round(_regen_rate * minf(delta, _regen_time))))
		_regen_time -= delta
