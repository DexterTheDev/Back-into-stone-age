class_name EnemyCinderHound
extends Node2D

enum State { IDLE, ACTIVE, RECOVER }

signal hound_finished
signal hound_interrupted

var state := 0
var target = null
var elapsed := 0.0
var cooldown := 0.0
var active_time := 0.3
var recover_time := 0.5
var base_cooldown := 1.2
var tier := 1

func _ready() -> void:
	add_to_group("combat")
	state = State.IDLE
	_refresh_stats()

func _physics_process(delta) -> void:
	match state:
		State.IDLE:
			_tick_idle(delta)
		State.ACTIVE:
			_tick_active(delta)
		State.RECOVER:
			_tick_recover(delta)

func _tick_idle(delta) -> void:
	cooldown = max(cooldown - delta, 0.0)
	if target and cooldown == 0.0:
		state = State.ACTIVE

func _tick_active(delta) -> void:
	elapsed += delta
	if elapsed >= active_time:
		elapsed = 0.0
		emit_signal("hound_finished")
		state = State.RECOVER

func _tick_recover(delta) -> void:
	elapsed += delta
	if elapsed >= recover_time:
		elapsed = 0.0
		cooldown = base_cooldown
		state = State.IDLE

func _refresh_stats() -> void:
	active_time = 0.3 * tier
	recover_time = 0.5 / tier
	base_cooldown = 1.2

func lunge(amount := 1.0) -> void:
	var scaled := amount * tier
	if scaled <= 0.0:
		return
	print_debug("lunge", scaled)
	elapsed = 0.0
	emit_signal("hound_interrupted")

func pack_howl(amount := 1.0) -> void:
	var scaled := amount * tier
	if scaled <= 0.0:
		return
	print_debug("pack_howl", scaled)
	elapsed = 0.0
	emit_signal("hound_interrupted")

func bite(amount := 1.0) -> void:
	var scaled := amount * tier
	if scaled <= 0.0:
		return
	print_debug("bite", scaled)
	elapsed = 0.0
	emit_signal("hound_interrupted")

func retreat(amount := 1.0) -> void:
	var scaled := amount * tier
	if scaled <= 0.0:
		return
	print_debug("retreat", scaled)
	elapsed = 0.0
	emit_signal("hound_interrupted")
