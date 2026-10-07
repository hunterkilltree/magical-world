#!/usr/bin/env bash
# Checks for the Hvitmark Tundra prototype (run from anywhere).
#   harness/run.sh check          parse every .gd file
#   harness/run.sh boot           boot headlessly and fail on engine errors
#   harness/run.sh test [filter]  run tests/ (coroutine tests supported)
#   harness/run.sh shot OUT [KEYS [FRAMES]]   render a real frame (needs xvfb-run)
#   harness/run.sh all            check + boot + test
# Set GODOT=/path/to/godot if it is not on PATH as godot4 / godot.
set -u
cd "$(dirname "$0")/.."

GODOT_BIN="${GODOT:-}"
if [ -z "$GODOT_BIN" ]; then
  for c in godot4 godot godot-headless; do
    if command -v "$c" >/dev/null 2>&1; then GODOT_BIN="$c"; break; fi
  done
fi
if [ -z "$GODOT_BIN" ]; then
  echo "Godot not found. Install Godot 4.3+ or set GODOT=/path/to/godot" >&2
  exit 127
fi
TIMEOUT_S="${HARNESS_TIMEOUT:-120}"
godot() { timeout "$TIMEOUT_S" "$GODOT_BIN" "$@"; }

# Always re-import first: it refreshes the global class (class_name) cache after script changes.
godot --headless --path . --import >/dev/null 2>&1 || true

cmd_check() { godot --headless --path . --script res://harness/check_all.gd; }

cmd_boot() {
  local out rc
  out="$(godot --headless --path . --quit-after 90 2>&1)"
  rc=$?
  echo "$out"
  if [ $rc -ne 0 ] || echo "$out" | grep -qE "SCRIPT ERROR|^ERROR:|Parse Error"; then
    echo "boot: FAILED" >&2
    return 1
  fi
  echo "boot: ok"
}

# A runtime script error inside a test only logs; treat it as a failure.
cmd_test() {
  local out rc
  out="$(godot --headless --path . --script res://harness/run_tests.gd -- "$@" 2>&1)"
  rc=$?
  echo "$out"
  if echo "$out" | grep -q "SCRIPT ERROR"; then
    echo "test: SCRIPT ERROR during tests" >&2
    return 1
  fi
  return $rc
}

cmd_shot() {
  command -v xvfb-run >/dev/null 2>&1 || { echo "shot: xvfb-run not found" >&2; return 127; }
  xvfb-run -a -s "-screen 0 1280x720x24" timeout "$TIMEOUT_S" "$GODOT_BIN" --path . --rendering-driver opengl3 \
    --script res://harness/screenshot.gd -- "${1:-/tmp/shot.png}" "${2:-}" "${3:-0}" 2>&1 | grep -E "saved|ERROR"
}

case "${1:-all}" in
  check) cmd_check ;;
  boot)  cmd_boot ;;
  test)  shift; cmd_test "$@" ;;
  shot)  shift; cmd_shot "$@" ;;
  all)   cmd_check && cmd_boot && cmd_test ;;
  *) echo "usage: $0 {check|boot|test [filter]|shot OUT [KEYS [FRAMES]]|all}" >&2; exit 2 ;;
esac
