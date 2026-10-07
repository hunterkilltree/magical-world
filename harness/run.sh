#!/usr/bin/env bash
# Dev harness entry point.
#   harness/run.sh check          parse every .gd file
#   harness/run.sh boot           boot the project headlessly, fail on engine errors
#   harness/run.sh test [filter]  run tests/test_*.gd
#   harness/run.sh reqs           every active/done requirement in story/STORY.md has a test
#   harness/run.sh story          run tests, regenerate story/progress.md
#   harness/run.sh shot WHAT OUT render a frame to a PNG (needs xvfb-run); WHAT = menu | overworld | zone:<id>  [WIZARD_ID [cast]]
#   harness/run.sh all            check + boot + reqs + story
# Set GODOT=/path/to/godot if it is not on PATH as godot or godot4.
set -u
cd "$(dirname "$0")/.."

# reqs only reads files, so it works without Godot.
if [ "${1:-}" = reqs ]; then source harness/reqs.sh; cmd_reqs; exit $?; fi

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

# Every engine call is time-limited (a hung engine must not stall the harness).
TIMEOUT_S="${HARNESS_TIMEOUT:-120}"
godot() { timeout "$TIMEOUT_S" "$GODOT_BIN" "$@"; }

# First run on a fresh checkout needs an import pass to build the class/resource cache.
if [ ! -d .godot ]; then
  godot --headless --path . --import >/dev/null 2>&1 || true
fi

cmd_check() { godot --headless --path . --script res://harness/check_all.gd; }

cmd_boot() {
  local out
  out="$(godot --headless --path . --quit-after 60 2>&1)"
  local rc=$?
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

source harness/reqs.sh

cmd_shot() {
  command -v xvfb-run >/dev/null 2>&1 || { echo "shot: xvfb-run not found" >&2; return 127; }
  xvfb-run -a -s "-screen 0 832x700x24" timeout "$TIMEOUT_S" "$GODOT_BIN" --path . --rendering-driver opengl3 \
    --script res://harness/screenshot.gd -- "${1:-menu}" "${2:-/tmp/shot.png}" "${3:-}" "${4:-}" 2>&1 | grep -E "saved|ERROR"
}

case "${1:-all}" in
  check) cmd_check ;;
  boot)  cmd_boot ;;
  test)  shift; cmd_test "$@" ;;
  reqs)  cmd_reqs ;;
  story) cmd_story ;;
  shot)  shift; cmd_shot "$@" ;;
  all)   cmd_check && cmd_boot && cmd_reqs && cmd_story ;;
  *) echo "usage: $0 {check|boot|test [filter]|reqs|story|shot WHAT OUT|all}" >&2; exit 2 ;;
esac
