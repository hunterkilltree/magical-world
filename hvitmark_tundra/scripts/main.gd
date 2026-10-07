extends Node2D
## Wires the world, the player and the HUD together. It contains no gameplay rules itself:
## those live in the systems (Player, SpellCaster, later Combat / Objective).

const OBJECTIVE_TITLE := "CROSS THE SHELF"
const OBJECTIVE_DETAIL := "Hold the North Bridge until the gate opens."
## Extra camera room below the arena so the bottom HUD panel never covers the spawn area.
const CAMERA_BOTTOM_MARGIN := 150

@onready var arena: Arena = $World/Arena
@onready var player: Player = $Actors/Player
@onready var enemies: Node2D = $Actors/Enemies
@onready var hud: Hud = $UI/HUD


func _ready() -> void:
	arena.build()
	player.global_position = arena.player_start

	var area := arena.world_rect()
	var cam := player.camera
	cam.limit_left = int(area.position.x)
	cam.limit_top = int(area.position.y)
	cam.limit_right = int(area.end.x)
	cam.limit_bottom = int(area.end.y) + CAMERA_BOTTOM_MARGIN
	cam.reset_smoothing()

	hud.bind_player(player)
	hud.set_objective(OBJECTIVE_TITLE, OBJECTIVE_DETAIL)
	hud.set_enemy_count(enemies.get_child_count())
