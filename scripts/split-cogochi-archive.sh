#!/usr/bin/env bash
# Regenerate docs/archive/cogochi/*.md from the canonical PRD copy.
# Source of truth: app/docs/COGOCHI.md (full document; edit there only).
# Derived artifacts: split files below (overwrite on each run).
#
# Usage (from repo root): bash scripts/split-cogochi-archive.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${ROOT}/app/docs/COGOCHI.md"
OUT="${ROOT}/docs/archive/cogochi"

if [[ ! -f "$SRC" ]]; then
  echo "missing: $SRC" >&2
  exit 1
fi

mkdir -p "$OUT"

# Section anchors are ## headings in COGOCHI.md (update ranges if structure changes).
sed -n '1,55p'   "$SRC" > "$OUT/00-preface-and-status-patch.md"
sed -n '56,236p' "$SRC" > "$OUT/01-sections-00-through-07.md"
sed -n '237,2178p' "$SRC" > "$OUT/02-section-08-per-surface-spec.md"
sed -n '2179,2425p' "$SRC" > "$OUT/03-sections-09-10-10a.md"
sed -n '2426,2593p' "$SRC" > "$OUT/04-section-11-data-contracts.md"
sed -n '2594,2668p' "$SRC" > "$OUT/05-sections-12-through-15.md"
sed -n '2669,2847p' "$SRC" > "$OUT/06-section-16-home-landing.md"
sed -n '2848,2990p' "$SRC" > "$OUT/07-sections-17-through-20-appendix.md"

# README is hand-maintained; do not overwrite.

sum=0
for f in "$OUT"/0*.md; do
  n=$(wc -l < "$f")
  sum=$((sum + n))
done
src_lines=$(wc -l < "$SRC")

if [[ "$sum" -ne "$src_lines" ]]; then
  echo "warning: split line count ($sum) != source ($src_lines) — check section anchors." >&2
  exit 1
fi

echo "ok: regenerated 8 parts from $SRC ($src_lines lines)"
