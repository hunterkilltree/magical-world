#!/usr/bin/env bash
# Claude Code Stop hook: block "done" while the harness is failing.
# Exit 2 + stderr feeds the failure back to the agent. Never blocks twice in a
# row (stop_hook_active) or when Godot is unavailable, to avoid dead loops.
cd "$(dirname "$0")/.." || exit 0
input="$(cat)"
echo "$input" | grep -q '"stop_hook_active"[[:space:]]*:[[:space:]]*true' && exit 0
[ -f project.godot ] || exit 0

out="$(harness/run.sh all 2>&1)"
rc=$?
[ $rc -eq 0 ] && exit 0
if [ $rc -eq 127 ]; then
  echo "harness: Godot not found, skipping verification" >&2
  exit 0
fi
{
  echo "Harness failed (harness/run.sh all). Fix before finishing:"
  echo "$out" | tail -n 40
} >&2
exit 2
