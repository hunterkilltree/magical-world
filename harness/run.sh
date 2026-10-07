#!/usr/bin/env bash
# Dev harness entry point.
#   harness/run.sh check          parse every .gd file
#   harness/run.sh boot           boot the project headlessly, fail on engine errors
#   harness/run.sh test [filter]  run tests/test_*.gd
#   harness/run.sh all            check + boot + test
# Set GODOT=/path/to/godot if it is not on PATH as godot or godot4.
set -u
cd "$(dirname "$0")/.."

GODOT_BIN="${GODOT:-}"
if [ -z "$GODOT_BIN" ]; then
  for c in godot4 godot godot-headless; do
    if command -v "$c" >/dev/null 2>&1; then GODOT_BIN="$c"; break; fi
  done
fi
if [ -z "$GODOT_BIN" ]; then
  echo "Godot not found. Install Godot 4.x or set GODOT=/path/to/godot" >&2
  exit 127
fi

# First run on a fresh checkout needs an import pass to build the class/resource cache.
if [ ! -d .godot ]; then
  "$GODOT_BIN" --headless --path . --import >/dev/null 2>&1 || true
fi

cmd_check() { "$GODOT_BIN" --headless --path . --script res://harness/check_all.gd; }

cmd_boot() {
  local out
  out="$("$GODOT_BIN" --headless --path . --quit-after 60 2>&1)"
  local rc=$?
  echo "$out"
  if [ $rc -ne 0 ] || echo "$out" | grep -qE "SCRIPT ERROR|^ERROR:|Parse Error"; then
    echo "boot: FAILED" >&2
    return 1
  fi
  echo "boot: ok"
}

cmd_test() { "$GODOT_BIN" --headless --path . --script res://harness/run_tests.gd -- "$@"; }

case "${1:-all}" in
  check) cmd_check ;;
  boot)  cmd_boot ;;
  test)  shift; cmd_test "$@" ;;
  all)   cmd_check && cmd_boot && cmd_test ;;
  *) echo "usage: $0 {check|boot|test [filter]|all}" >&2; exit 2 ;;
esac
