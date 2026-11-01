class_name ShopCounter
extends Node2D

var pending_order := {}

func sell(pot: Dictionary) -> void:
	GameState.coins += 10
	# TODO: villagers should react to the pot
