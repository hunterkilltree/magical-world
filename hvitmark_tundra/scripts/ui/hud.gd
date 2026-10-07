class_name Hud
extends Control
## The heads-up display. It only shows state and listens to signals; it makes no gameplay
## decisions. Main calls bind_player(), set_objective() and set_enemy_count().
##
## Top-left: title, info line, objective, HP bar.  Bottom: spell buttons (Q W E R T / A S D F),
## the queue (max 4), the staff, and the SPACE / ESC reminder.

const SPELL_BUTTON := preload("res://scenes/ui/SpellButton.tscn")
const QUEUE_SLOT := preload("res://scenes/ui/QueueSlot.tscn")

var buttons: Dictionary = {}  # StringName spell id -> SpellButton
var slots: Array[Control] = []

var _player: Player
var _enemy_count := 0
var _objective_title := ""
var _objective_detail := ""
var _toast_tween: Tween

@onready var title_label: Label = %TitleLabel
@onready var info_label: Label = %InfoLabel
@onready var objective_title_label: Label = %ObjectiveTitleLabel
@onready var objective_detail_label: Label = %ObjectiveDetailLabel
@onready var hp_bar: ProgressBar = %HPBar
@onready var hp_label: Label = %HPLabel
@onready var top_row: HBoxContainer = %TopRow
@onready var bottom_row: HBoxContainer = %BottomRow
@onready var queue_slots: HBoxContainer = %QueueSlots
@onready var queue_title: Label = %QueueTitle
@onready var hint_label: Label = %HintLabel
@onready var move_hint_label: Label = %MoveHintLabel
@onready var toast_label: Label = %ToastLabel


func _ready() -> void:
	_build_spell_buttons()
	_build_queue_slots(SpellQueue.new().max_size)
	toast_label.modulate.a = 0.0
	hint_label.text = "SPACE = CAST    ESC = CLEAR"
	_refresh_info()
	_refresh_queue([])


func bind_player(player: Player) -> void:
	_player = player
	player.health_changed.connect(_on_health_changed)
	player.move_scheme_changed.connect(func(_wasd: bool) -> void: _refresh_move_hint())
	var c := player.caster
	_build_queue_slots(c.queue.max_size)
	c.queue_changed.connect(_refresh_queue)
	c.spell_queued.connect(_on_spell_queued)
	c.queue_rejected.connect(_on_queue_rejected)
	c.spell_cast.connect(_on_spell_cast)
	c.cast_failed_empty.connect(func() -> void: show_toast("Queue is empty", Color("#ffb4a8")))
	c.queue_cleared.connect(func() -> void: show_toast("Queue cleared", Color("#cbd5e1")))
	_on_health_changed(player.hp, player.max_hp)
	_refresh_move_hint()
	_refresh_queue(c.queue.to_array())


func set_objective(title: String, detail: String) -> void:
	_objective_title = title
	_objective_detail = detail
	objective_title_label.text = title
	objective_detail_label.text = detail
	_refresh_info()


func set_enemy_count(n: int) -> void:
	_enemy_count = n
	_refresh_info()


func show_toast(text: String, color := Color.WHITE) -> void:
	toast_label.text = text
	toast_label.add_theme_color_override("font_color", color)
	if _toast_tween != null and _toast_tween.is_valid():
		_toast_tween.kill()
	toast_label.modulate.a = 1.0
	_toast_tween = create_tween()
	_toast_tween.tween_interval(0.9)
	_toast_tween.tween_property(toast_label, "modulate:a", 0.0, 0.5)


# ---- building ----------------------------------------------------------------------------------

func _build_spell_buttons() -> void:
	for key in SpellDatabase.ROW_TOP:
		_add_button(top_row, SpellDatabase.for_key(key))
	for key in SpellDatabase.ROW_BOTTOM:
		_add_button(bottom_row, SpellDatabase.for_key(key))


func _add_button(row: HBoxContainer, spell: Spell) -> void:
	var b := SPELL_BUTTON.instantiate()
	row.add_child(b)
	b.setup(spell)
	buttons[spell.id] = b


func _build_queue_slots(count: int) -> void:
	if slots.size() == count:
		return
	for s in slots:
		s.queue_free()
		queue_slots.remove_child(s)
	slots.clear()
	for i in count:
		var s := QUEUE_SLOT.instantiate()
		queue_slots.add_child(s)
		slots.append(s)


# ---- reacting to the game --------------------------------------------------------------------

func _refresh_queue(spells: Array) -> void:
	for i in slots.size():
		slots[i].set_spell(spells[i] if i < spells.size() else null, i == 0)
	if spells.is_empty():
		queue_title.text = "QUEUE   (empty)"
	else:
		queue_title.text = "QUEUE   next: %s" % (spells[0] as Spell).display_name


func _on_spell_queued(spell: Spell) -> void:
	if buttons.has(spell.id):
		buttons[spell.id].flash()


func _on_queue_rejected(_spell: Spell) -> void:
	show_toast("Queue full (%d)" % slots.size(), Color("#ffb4a8"))


func _on_spell_cast(spell: Spell) -> void:
	show_toast("Cast: %s   (effects arrive in the next milestone)" % spell.display_name, spell.icon_color.lightened(0.3))


func _on_health_changed(hp: float, max_hp: float) -> void:
	hp_bar.max_value = max_hp
	hp_bar.value = hp
	hp_label.text = "HP %d / %d" % [roundi(hp), roundi(max_hp)]
	_refresh_info()


func _refresh_info() -> void:
	var hp_text := "HP --"
	if _player != null:
		hp_text = "HP %d/%d" % [roundi(_player.hp), roundi(_player.max_hp)]
	info_label.text = "Mage  %s     Enemies: %d     Objective: %s" % [hp_text, _enemy_count, "not started"]


func _refresh_move_hint() -> void:
	if _player != null and _player.wasd_movement:
		move_hint_label.text = "Move: WASD  (Shift+W/A/S/D casts those spells)   TAB: arrows"
	else:
		move_hint_label.text = "Move: ARROWS   TAB: switch to WASD movement"
