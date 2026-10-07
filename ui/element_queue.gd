# Magicka-style element queue: a bar of up to five slots at the bottom centre of the screen.
#
# Attach to the root CanvasLayer of ui/element_queue.tscn. Expected tree:
#
#   ElementQueueUI (CanvasLayer)                        <- this script
#     UIBottomCenter (MarginContainer, bottom-centre anchors, bottom padding)
#       BackgroundFrame (TextureRect, heavy stone bar)
#         SlotContainer (HBoxContainer, centred)
#           Slot1 .. Slot5 (TextureRect, circular frame)
#             ElementIcon (TextureRect, ignores texture size, keeps aspect centred)
#
# Usage:  $ElementQueueUI.add_element("Fire")   # fills the next empty slot and pops it
#         $ElementQueueUI.clear_queue()          # empties every slot
extends CanvasLayer

signal element_added(element: String, slot_index: int)
signal queue_cleared

enum Element { FIRE, WATER, EARTH, NATURE, LIGHTNING, ICE, WIND, LIGHT, DARK }

# Placeholder texture paths: replace the PNGs (or these paths) with real art.
const BACKGROUND_FRAME := "res://ui/background_frame.png"
const SLOT_FRAME := "res://ui/slot_frame.png"
const ELEMENT_TEXTURES := {
	"Fire": "res://ui/elements/fire.png",
	"Water": "res://ui/elements/water.png",
	"Earth": "res://ui/elements/earth.png",
	"Nature": "res://ui/elements/nature.png",
	"Lightning": "res://ui/elements/lightning.png",
	"Ice": "res://ui/elements/ice.png",
	"Wind": "res://ui/elements/wind.png",
	"Light": "res://ui/elements/light.png",
	"Dark": "res://ui/elements/dark.png",
}
# Used only if an icon file is missing, so the bar still works before the art exists.
const FALLBACK_COLORS := {
	"Fire": "#f97316", "Water": "#06b6d4", "Earth": "#a16207", "Nature": "#22c55e", "Lightning": "#eab308",
	"Ice": "#38bdf8", "Wind": "#14b8a6", "Light": "#fbbf24", "Dark": "#6b21a8",
}

const SLOT_COUNT := 5
const POP_SCALE := 1.2
const POP_TIME := 0.08  # seconds each way
const SLOT_SIZE := 72.0
const SLOT_GAP := 6.0
const FRAME_PADDING := 44.0

## How many slots are in use (1-5). Unused slots are hidden and the bar narrows to fit.
@export_range(1, 5) var max_slots := 5

## Currently queued element names, in order ("Fire", "Water", ...). At most `max_slots`.
var queue: PackedStringArray = PackedStringArray()

var _slots: Array[TextureRect] = []
var _icons: Array[TextureRect] = []
var _tweens: Dictionary = {}  # slot index -> Tween
var _textures: Dictionary = {}  # element name -> Texture2D
var _ready_done := false


func _ready() -> void:
	setup()


# Finds the slot nodes and applies max_slots. Idempotent; _ready calls it, and tests or code that
# build the scene outside a running tree can call it directly.
func setup() -> void:
	if _ready_done:
		return
	_ready_done = true
	var container: HBoxContainer = get_node("UIBottomCenter/BackgroundFrame/SlotContainer")
	for i in range(1, SLOT_COUNT + 1):
		var slot: TextureRect = container.get_node("Slot%d" % i)
		_slots.append(slot)
		_icons.append(slot.get_node("ElementIcon"))
	_apply_max_slots()
	clear_queue()


## Adds an element (case-insensitive name) to the next empty slot, shows its icon and pops the
## slot. Returns false if the queue is full or the name is not a known element.
func add_element(element_type: String) -> bool:
	setup()
	var name := element_type.strip_edges().capitalize()
	if not ELEMENT_TEXTURES.has(name) or queue.size() >= max_slots:
		return false
	var index := queue.size()  # slots fill left to right, so the next empty one is the next index
	queue.append(name)
	_icons[index].texture = _texture_for(name)
	_icons[index].visible = true
	_slots[index].modulate = Color.WHITE
	_pop(index)
	element_added.emit(name, index)
	return true


## Empties every slot.
func clear_queue() -> void:
	setup()
	queue.clear()
	for i in SLOT_COUNT:
		_kill_tween(i)
		_slots[i].scale = Vector2.ONE
		_slots[i].modulate = Color(1, 1, 1, 0.55)  # empty rings are dimmed
		_icons[i].texture = null
		_icons[i].visible = false
	queue_cleared.emit()


## Mirrors an external queue (an Array of element names). If it only grew, just the new
## elements are added (and pop); anything else rewrites the bar.
func sync_queue(elements: Array) -> void:
	setup()
	var wanted := PackedStringArray()
	for e in elements:
		wanted.append(String(e).strip_edges().capitalize())
	if wanted == queue:
		return
	var grew := wanted.size() >= queue.size() and wanted.slice(0, queue.size()) == queue
	if not grew:
		clear_queue()
	for i in range(queue.size(), wanted.size()):
		add_element(wanted[i])


## The pop Tween of a slot (0-based), or null if none has been started. Handy for tests.
func tween_for(slot_index: int) -> Tween:
	return _tweens.get(slot_index)


func _pop(index: int) -> void:
	_kill_tween(index)
	var slot := _slots[index]
	slot.scale = Vector2.ONE
	if not Engine.get_main_loop() is SceneTree:
		return  # no SceneTree at all (e.g. a plain script run): the slot simply appears
	slot.pivot_offset = (slot.size if slot.size.x > 0.0 else slot.custom_minimum_size) / 2.0
	var tw := create_tween()
	tw.tween_property(slot, "scale", Vector2.ONE * POP_SCALE, POP_TIME).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.tween_property(slot, "scale", Vector2.ONE, POP_TIME).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	_tweens[index] = tw


func _kill_tween(index: int) -> void:
	var tw: Tween = _tweens.get(index)
	if tw != null and tw.is_valid():
		tw.kill()
	_tweens.erase(index)


func _apply_max_slots() -> void:
	max_slots = clampi(max_slots, 1, SLOT_COUNT)
	for i in SLOT_COUNT:
		_slots[i].visible = i < max_slots
	var frame: TextureRect = get_node("UIBottomCenter/BackgroundFrame")
	frame.custom_minimum_size.x = max_slots * SLOT_SIZE + (max_slots - 1) * SLOT_GAP + FRAME_PADDING


func _texture_for(element: String) -> Texture2D:
	if _textures.has(element):
		return _textures[element]
	var path: String = ELEMENT_TEXTURES[element]
	var tex: Texture2D = load(path) if ResourceLoader.exists(path) else _fallback_texture(element)
	_textures[element] = tex
	return tex


func _fallback_texture(element: String) -> Texture2D:
	var grad := Gradient.new()
	grad.colors = PackedColorArray([Color(FALLBACK_COLORS[element]).lightened(0.35), Color(FALLBACK_COLORS[element]).darkened(0.4), Color(0, 0, 0, 0)])
	grad.offsets = PackedFloat32Array([0.0, 0.85, 0.9])
	var tex := GradientTexture2D.new()
	tex.gradient = grad
	tex.fill = GradientTexture2D.FILL_RADIAL
	tex.fill_from = Vector2(0.4, 0.35)
	tex.fill_to = Vector2(1.0, 0.5)
	tex.width = 64
	tex.height = 64
	return tex
