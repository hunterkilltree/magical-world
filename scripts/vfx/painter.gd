# Draws once with a callback (fn(canvas: CanvasItem, size: float)); used to paint procedural
# textures into a SubViewport.
extends Node2D

var fn: Callable
var size := 256.0


func _draw() -> void:
	if fn.is_valid():
		fn.call(self, size)
