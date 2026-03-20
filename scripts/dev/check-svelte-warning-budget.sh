#!/usr/bin/env bash
set -euo pipefail

BUDGET="${WARNING_BUDGET:-49}"
TMP_LOG="$(mktemp)"
trap 'rm -f "$TMP_LOG"' EXIT

echo "[warning-budget] running npm run check"
npm run check --silent 2>&1 | tee "$TMP_LOG"

SUMMARY="$(grep -Eo 'svelte-check found [0-9]+ errors and [0-9]+ warnings' "$TMP_LOG" | tail -n 1 || true)"
if [ -z "$SUMMARY" ]; then
	echo "[warning-budget] failed: could not parse svelte-check summary."
	exit 1
fi

ERROR_COUNT="$(printf '%s\n' "$SUMMARY" | awk '{print $3}')"
WARNING_COUNT="$(printf '%s\n' "$SUMMARY" | awk '{print $6}')"

echo "[warning-budget] summary: errors=$ERROR_COUNT warnings=$WARNING_COUNT budget=$BUDGET"
echo "[warning-budget] warning codes:"
grep -Eo 'https://svelte.dev/e/[A-Za-z0-9_]+' "$TMP_LOG" \
	| sed 's|https://svelte.dev/e/||' \
	| sort | uniq -c | sort -nr || true

echo "[warning-budget] css warnings:"
grep -E 'Warn: .*\(css\)' "$TMP_LOG" \
	| sed -E 's/^.*Warn: (.*) \(css\)$/\1/' \
	| sort | uniq -c | sort -nr || true

if [ "$ERROR_COUNT" -gt 0 ]; then
	echo "[warning-budget] failed: errors must be 0."
	exit 1
fi

if [ "$WARNING_COUNT" -gt "$BUDGET" ]; then
	echo "[warning-budget] failed: warnings ($WARNING_COUNT) exceed budget ($BUDGET)."
	exit 1
fi

echo "[warning-budget] passed."
