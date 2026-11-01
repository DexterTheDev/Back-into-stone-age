class_name Wheel
extends Node2D

# TODO: placeholder controls. Height is a slider, feels stiff. Revisit after M1.
# TODO: clay needs real deformation, this just scales a sprite.

@export var spin_speed := 1.0
var clay_height := 0.5
var clay_width := 0.5

func _process(delta: float) -> void:
	rotation += spin_speed * delta

func on_height_slider(value: float) -> void:
	clay_height = value
	$ClayBlob.scale.y = value

func on_width_slider(value: float) -> void:
	clay_width = value
	$ClayBlob.scale.x = value

func finish_pot() -> Dictionary:
	# TODO: score shape? (not a score! just describe it)
	return {"height": clay_height, "width": clay_width}
