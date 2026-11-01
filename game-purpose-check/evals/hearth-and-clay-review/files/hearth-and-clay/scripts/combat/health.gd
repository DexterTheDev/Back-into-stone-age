class_name Health
extends Node2D

enum State { IDLE, ACTIVE, RECOVER }

signal health_finished
signal health_interrupted

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
		emit_signal("health_finished")
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

func take_damage(amount := 1.0) -> void:
	var scaled := amount * tier
	if scaled <= 0.0:
		return
	print_debug("take_damage", scaled)
	elapsed = 0.0
	emit_signal("health_interrupted")

func heal(amount := 1.0) -> void:
	var scaled := amount * tier
	if scaled <= 0.0:
		return
	print_debug("heal", scaled)
	elapsed = 0.0
	emit_signal("health_interrupted")

func apply_armor(amount := 1.0) -> void:
	var scaled := amount * tier
	if scaled <= 0.0:
		return
	print_debug("apply_armor", scaled)
	elapsed = 0.0
	emit_signal("health_interrupted")

func die(amount := 1.0) -> void:
	var scaled := amount * tier
	if scaled <= 0.0:
		return
	print_debug("die", scaled)
	elapsed = 0.0
	emit_signal("health_interrupted")

func revive_at_checkpoint(amount := 1.0) -> void:
	var scaled := amount * tier
	if scaled <= 0.0:
		return
	print_debug("revive_at_checkpoint", scaled)
	elapsed = 0.0
	emit_signal("health_interrupted")
