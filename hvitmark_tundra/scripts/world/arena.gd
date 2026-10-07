class_name Arena
extends Node2D
## The frozen arena: builds the tile layers, the bridge zone and the gate from an ASCII layout.
##
##   #  stone wall (solid)        o  boulder (solid cover)     ~  deep water (solid)
##   .  snow                      ,  ice                       B  north bridge (yellow shelf)
##   G  north gate (solid until opened)                         S  player start
##   E  enemy spawn marker (used in a later milestone)         (space) nothing

signal built

const TILE := TundraTiles.TILE
const ROWS: Array[String] = [
	"         ########         ",
	"        ##GGGGGG##        ",
	"       ##BBBBBBBB##       ",
	"     ##~~BBBBBBBB~~##     ",
	"     ##~~BBBBBBBB~~##     ",
	"    ##~~~~......~~~~##    ",
	"   ##,~~~~......~~~~,##   ",
	"   ##,,..~.,..,.~..,,##   ",
	"  ##,,..o........o..,,##  ",
	"  ##,,.....E..E.....,,##  ",
	"  ##,,..............,,##  ",
	"   ##,..~~~....~~~..,##   ",
	"   ##,,.~~~~..~~~~.,,##   ",
	"    ##,,...o..o...,,##    ",
	"    ##,,..........,,##    ",
	"     ##,,........,,##     ",
	"       ###..SS..###       ",
	"         ########         "
]

var grid_size := Vector2i.ZERO
var player_start := Vector2.ZERO
var enemy_spawns: Array[Vector2] = []
var bridge_rect := Rect2()
var gate_rect := Rect2()

var _built := false

@onready var ground: TileMapLayer = $Ground
@onready var obstacles: TileMapLayer = $Obstacles
@onready var bridge: Area2D = $Bridge
@onready var gate: StaticBody2D = $Gate


func _ready() -> void:
	build()


## Fills the layers. Idempotent, so Main (or a test) can call it explicitly.
func build() -> void:
	if _built:
		return
	_built = true
	var tiles := TundraTiles.build()
	ground.tile_set = tiles
	obstacles.tile_set = tiles
	grid_size = Vector2i(ROWS[0].length(), ROWS.size())
	var starts: Array[Vector2i] = []
	var bridges: Array[Vector2i] = []
	var gates: Array[Vector2i] = []
	for y in ROWS.size():
		for x in ROWS[y].length():
			var c := Vector2i(x, y)
			match ROWS[y][x]:
				"#":
					_put(obstacles, c, TundraTiles.T.WALL)
				"o":
					_put(ground, c, TundraTiles.T.SNOW)
					_put(obstacles, c, TundraTiles.T.BOULDER)
				"~":
					_put(ground, c, TundraTiles.T.WATER)
				",":
					_put(ground, c, TundraTiles.T.ICE)
				"B":
					_put(ground, c, TundraTiles.T.BRIDGE)
					bridges.append(c)
				"G":
					_put(ground, c, TundraTiles.T.ICE)
					gates.append(c)
				"S":
					_put(ground, c, TundraTiles.T.SNOW)
					starts.append(c)
				"E":
					_put(ground, c, TundraTiles.T.SNOW)
					enemy_spawns.append(cell_center(c))
				".":
					_put(ground, c, TundraTiles.T.SNOW)
	var sum := Vector2.ZERO
	for c in starts:
		sum += cell_center(c)
	player_start = sum / maxf(1.0, starts.size())
	bridge_rect = _rect_of(bridges)
	gate_rect = _rect_of(gates)
	bridge.position = bridge_rect.get_center()
	($Bridge/CollisionShape2D.shape as RectangleShape2D).size = bridge_rect.size
	gate.call("setup", gate_rect)
	built.emit()


func cell_center(c: Vector2i) -> Vector2:
	return (Vector2(c) + Vector2(0.5, 0.5)) * TILE


## The whole playable area in world pixels.
func world_rect() -> Rect2:
	return Rect2(Vector2.ZERO, Vector2(grid_size * TILE))


func _put(layer: TileMapLayer, c: Vector2i, tile: int) -> void:
	layer.set_cell(c, 0, Vector2i(tile, 0))


func _rect_of(cells: Array[Vector2i]) -> Rect2:
	if cells.is_empty():
		return Rect2()
	var lo := cells[0]
	var hi := cells[0]
	for c in cells:
		lo = Vector2i(mini(lo.x, c.x), mini(lo.y, c.y))
		hi = Vector2i(maxi(hi.x, c.x), maxi(hi.y, c.y))
	return Rect2(Vector2(lo * TILE), Vector2((hi - lo + Vector2i.ONE) * TILE))
