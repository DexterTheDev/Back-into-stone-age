class_name StoryManager
extends Node

# TODO: only Mara exists. Add the other 11 villagers.
var stories := {"mara": "res://data/stories/mara_01.json"}

func next_part(villager: String) -> String:
	return stories.get(villager, "")
