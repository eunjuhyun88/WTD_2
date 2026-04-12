#!/usr/bin/env bash
#
# scripts/swarm/cost-check.sh — CLAUDE_API_DAILY_CEILING_USD guard
#
# Reads the env var CLAUDE_API_DAILY_CEILING_USD. If set, computes
# today's accumulated cost from .agent-context/digest/YYYY-MM-DD.md
# cost lines (format: `- HH:MM:SSZ cost: $N.NN`) and emits one of:
#
#   OK     — spend < 80% of ceiling
#   NEAR   — spend >= 80% and < 100%
#   OVER   — spend >= 100%
#   DISABLED — env var unset or empty (no guard)
#
# Exit code is always 0. Consumers (auto-spawn.sh) read stdout.
#
# The cost lines are human-appended or cron-appended — this script
# does NOT auto-poll the Claude API. The value is the short-circuit:
# when OVER, auto-spawn.sh stops picking new slices.
#
# Design: docs/exec-plans/active/swarm-v1-design-2026-04-11.md §10
# Slice: Z3-cost-ceiling-guard in trunk-plan.dag.json

set -euo pipefail

CEILING="${CLAUDE_API_DAILY_CEILING_USD:-}"

if [ -z "$CEILING" ]; then
	echo "DISABLED"
	exit 0
fi

# Locate today's digest file.
if ! ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null)"; then
	echo "DISABLED"
	exit 0
fi

DIGEST_FILE="$ROOT_DIR/.agent-context/digest/$(date +%Y-%m-%d).md"

if [ ! -f "$DIGEST_FILE" ]; then
	# No digest today → no spend recorded → OK
	echo "OK 0.00/$CEILING"
	exit 0
fi

# Sum all `cost: $N.NN` lines in today's digest.
# Format: `- HH:MM:SSZ cost: $12.34` or `- HH:MM:SSZ cost: $0.50 (reason)`
# Extract the number after `cost: $`.
# Both greps may find zero matches → exit 1 under set -eo pipefail.
# Wrap each in `(... || true)` so the pipe always reaches awk.
# awk with empty input prints "0.00" via the END block.
TOTAL="$( (grep -oE 'cost: \$[0-9]+(\.[0-9]+)?' "$DIGEST_FILE" 2>/dev/null || true) \
	| (grep -oE '[0-9]+(\.[0-9]+)?' || true) \
	| awk '{s+=$1} END {printf "%.2f", s+0}')"

# Compare with ceiling using awk (no bc dependency).
# ceiling=0 → OVER always (user explicitly set zero budget).
# DISABLED is only emitted above when env var is empty/unset.
STATUS="$(awk -v total="$TOTAL" -v ceiling="$CEILING" 'BEGIN {
	if (ceiling+0 <= 0) { print "OVER"; exit }
	pct = (total / ceiling) * 100
	if (pct >= 100) print "OVER"
	else if (pct >= 80) print "NEAR"
	else print "OK"
}')"

echo "$STATUS $TOTAL/$CEILING"
exit 0
