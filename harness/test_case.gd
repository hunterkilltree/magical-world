# Base class for tests. Extend by path (class_name needs an editor import):
#   extends "res://harness/test_case.gd"
# Methods named test_* are run; before_each() runs ahead of each one.
extends RefCounted

var tree: SceneTree
var failures: Array[String] = []


func before_each() -> void:
	pass


func assert_true(cond: bool, msg := "expected true") -> void:
	if not cond:
		failures.append(msg)


func assert_eq(actual, expected, msg := "") -> void:
	if actual != expected:
		failures.append("%s expected %s, got %s" % [msg, str(expected), str(actual)])


func assert_not_null(value, msg := "expected non-null") -> void:
	if value == null:
		failures.append(msg)
