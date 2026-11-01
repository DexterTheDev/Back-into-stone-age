extends Node

signal game_over(reason)

var coins := 0
var player_health := 100
var carried_loot := []

func on_player_died() -> void:
	carried_loot.clear()
	emit_signal("game_over", "You fell in the dungeon. Your loot is lost.")
	get_tree().change_scene_to_file("res://scenes/ui/game_over.tscn")

func on_evicted() -> void:
	emit_signal("game_over", "You could not pay rent and lost the shop.")
	get_tree().change_scene_to_file("res://scenes/ui/game_over.tscn")
