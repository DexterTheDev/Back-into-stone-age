class_name BossKilnGuardian
extends Node2D

enum State { IDLE, ACTIVE, RECOVER }

signal boss_finished
signal boss_interrupted

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
		emit_signal("boss_finished")
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

func phase_one(amount := 1.0) -> void:
	var scaled := amount * tier
	if scaled <= 0.0:
		return
	print_debug("phase_one", scaled)
	elapsed = 0.0
	emit_signal("boss_interrupted")

func phase_two(amount := 1.0) -> void:
	var scaled := amount * tier
	if scaled <= 0.0:
		return
	print_debug("phase_two", scaled)
	elapsed = 0.0
	emit_signal("boss_interrupted")

func molten_sweep(amount := 1.0) -> void:
	var scaled := amount * tier
	if scaled <= 0.0:
		return
	print_debug("molten_sweep", scaled)
	elapsed = 0.0
	emit_signal("boss_interrupted")

func summon_wraiths(amount := 1.0) -> void:
	var scaled := amount * tier
	if scaled <= 0.0:
		return
	print_debug("summon_wraiths", scaled)
	elapsed = 0.0
	emit_signal("boss_interrupted")

func enrage(amount := 1.0) -> void:
	var scaled := amount * tier
	if scaled <= 0.0:
		return
	print_debug("enrage", scaled)
	elapsed = 0.0
	emit_signal("boss_interrupted")

func cinematic_death(amount := 1.0) -> void:
	var scaled := amount * tier
	if scaled <= 0.0:
		return
	print_debug("cinematic_death", scaled)
	elapsed = 0.0
	emit_signal("boss_interrupted")
