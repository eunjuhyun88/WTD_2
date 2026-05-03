#!/usr/bin/env bash
# Weekly rotation: archive MEMORY.md entries older than 7 days to _archive/
# Usage: ./tools/memory-rotate.sh [--dry-run]

set -euo pipefail

MEMORY_DIR="$HOME/.claude/projects/-Users-ej-Projects-wtd-v2/memory"
MEMORY_FILE="$MEMORY_DIR/MEMORY.md"
ARCHIVE_DIR="$MEMORY_DIR/_archive"
DRY_RUN="${1:-}"
CUTOFF=$(date -v-7d +%Y-%m-%d 2>/dev/null || date -d "-7 days" +%Y-%m-%d)

if [[ ! -f "$MEMORY_FILE" ]]; then
  echo "❌ $MEMORY_FILE not found"
  exit 1
fi

# Find ## Current State sections older than cutoff
sections_to_archive=()
while IFS= read -r line; do
  if [[ "$line" =~ ^##\ Current\ State\ \(([0-9]{4}-[0-9]{2}-[0-9]{2}) ]]; then
    section_date="${BASH_REMATCH[1]}"
    if [[ "$section_date" < "$CUTOFF" ]]; then
      sections_to_archive+=("$section_date")
    fi
  fi
done < "$MEMORY_FILE"

if [[ ${#sections_to_archive[@]} -eq 0 ]]; then
  echo "✅ Nothing to archive (all entries newer than $CUTOFF)"
  exit 0
fi

echo "📦 Sections to archive: ${sections_to_archive[*]}"

if [[ "$DRY_RUN" == "--dry-run" ]]; then
  echo "(dry-run mode — no changes made)"
  exit 0
fi

# Delegate to Python for reliable multi-section extraction
python3 - <<'PYEOF'
import re, sys, os
from datetime import datetime, timedelta

memory_dir = os.path.expanduser("~/.claude/projects/-Users-ej-Projects-wtd-v2/memory")
memory_file = os.path.join(memory_dir, "MEMORY.md")
archive_dir = os.path.join(memory_dir, "_archive")

cutoff = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")

with open(memory_file, "r") as f:
    content = f.read()

# Split into sections by ## headings
sections = re.split(r'(?=^## )', content, flags=re.MULTILINE)

keep = []
archive_by_date = {}

for section in sections:
    m = re.match(r'^## Current State \((\d{4}-\d{2}-\d{2})', section)
    if m:
        date = m.group(1)
        if date < cutoff:
            archive_by_date.setdefault(date[:7], []).append((date, section))
            continue
    keep.append(section)

if not archive_by_date:
    print("✅ Nothing to archive")
    sys.exit(0)

# Write archive file(s)
for month, entries in archive_by_date.items():
    dates = sorted(e[0] for e in entries)
    archive_name = f"{dates[0]}_{dates[-1]}.md" if len(dates) > 1 else f"{dates[0]}.md"
    archive_path = os.path.join(archive_dir, archive_name)
    with open(archive_path, "w") as f:
        f.write(f"# Archive: {dates[0]} ~ {dates[-1]} Session Logs\n\n")
        f.write("> Auto-rotated by tools/memory-rotate.sh\n")
        f.write(f"> 검색: grep -r '키워드' {archive_dir}/\n\n")
        for _, section in entries:
            f.write(section)
    print(f"📦 Archived → {archive_name}")

    # Insert pointer into keep sections (after User Profile block)
    pointer = f"> [📦 {dates[0]}~{dates[-1]} archive](_archive/{archive_name}) — auto-rotated {datetime.now().strftime('%Y-%m-%d')}\n"
    for i, s in enumerate(keep):
        if s.startswith("## User Profile") or "archive" in s.lower():
            # Find last archive pointer line and insert after
            pass
    # Insert pointer after last existing archive pointer
    new_sections = []
    inserted = False
    for s in keep:
        new_sections.append(s)
        if not inserted and re.search(r'^\[📦.*archive\]', s, re.MULTILINE):
            # Will append at end of that block
            pass
    # Simpler: inject pointer right before first ## Current State that's kept
    result = "".join(keep)
    result = re.sub(
        r'(\n## Current State)',
        f"\n{pointer}\\1",
        result,
        count=1
    )
    keep_str = result

with open(memory_file, "w") as f:
    f.write(keep_str if 'keep_str' in dir() else "".join(keep))

print(f"✅ MEMORY.md updated — {sum(len(e) for e in archive_by_date.values())} section(s) archived")
PYEOF
