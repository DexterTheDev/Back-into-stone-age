class_name Kiln
extends Node2D

# TODO: firing animation
func fire(pot: Dictionary) -> Dictionary:
	pot["fired"] = true
	return pot

func on_trapdoor_pressed() -> void:
	get_tree().change_scene_to_file("res://scenes/dungeon/floor_01.tscn")
