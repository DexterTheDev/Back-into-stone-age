class_name DamageNumbers
extends Node2D

enum State { IDLE, ACTIVE, RECOVER }

signal number_finished
signal number_interrupted

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
		emit_signal("number_finished")
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

func spawn_number(amount := 1.0) -> void:
	var scaled := amount * tier
	if scaled <= 0.0:
		return
	print_debug("spawn_number", scaled)
	elapsed = 0.0
	emit_signal("number_interrupted")

func float_up(amount := 1.0) -> void:
	var scaled := amount * tier
	if scaled <= 0.0:
		return
	print_debug("float_up", scaled)
	elapsed = 0.0
	emit_signal("number_interrupted")

func crit_flash(amount := 1.0) -> void:
	var scaled := amount * tier
	if scaled <= 0.0:
		return
	print_debug("crit_flash", scaled)
	elapsed = 0.0
	emit_signal("number_interrupted")

func fade(amount := 1.0) -> void:
	var scaled := amount * tier
	if scaled <= 0.0:
		return
	print_debug("fade", scaled)
	elapsed = 0.0
	emit_signal("number_interrupted")
