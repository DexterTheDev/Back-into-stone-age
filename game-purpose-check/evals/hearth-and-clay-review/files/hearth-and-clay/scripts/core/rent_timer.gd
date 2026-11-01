extends Node

# Weekly rent. Miss a payment and the shop is gone.
const SECONDS_PER_WEEK := 900.0
const RENT := 120

var time_left := SECONDS_PER_WEEK

func _process(delta: float) -> void:
	time_left -= delta
	if time_left <= 0.0:
		time_left = SECONDS_PER_WEEK
		if GameState.coins >= RENT:
			GameState.coins -= RENT
		else:
			GameState.on_evicted()
