#!/usr/bin/env bash
# refresh_inventory.sh — state/inventory.md 자동 생성
# Usage: tools/refresh_inventory.sh [--check]
#   --check: 실제 파일 vs 생성 결과 diff 출력 (CI 용, exit 1 if diff)

set -euo pipefail

CHECK_MODE=0
if [ "${1:-}" = "--check" ]; then
  CHECK_MODE=1
fi

REPO_ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
COMMANDS_DIR="$REPO_ROOT/.claude/commands"
TOOLS_DIR="$REPO_ROOT/tools"
ROUTES_DIR="$REPO_ROOT/engine/api/routes"
APP_ROUTES_DIR="$REPO_ROOT/app/src/routes/api"
ENGINE_MAIN="$REPO_ROOT/engine/api/main.py"
OUTPUT_FILE="$REPO_ROOT/state/inventory.md"
TODAY="$(date +%Y-%m-%d)"

# ---- build output in a temp file ----
TMP="$(mktemp /tmp/inventory_XXXXXX.md)"
trap 'rm -f "$TMP"' EXIT

{
cat <<HEADER
# Inventory — 자동 생성 (tools/refresh_inventory.sh)
# 마지막 갱신: $TODAY
# 이 파일을 직접 편집하지 말 것 — 다음 갱신 시 덮어씌워짐

HEADER

# ---- Section 1: Slash Commands ----
echo "## Slash Commands"
echo ""
echo "| Command | Model | Context | Description |"
echo "|---|---|---|---|"

for f in "$COMMANDS_DIR"/*.md; do
  [ -f "$f" ] || continue
  filename="$(basename "$f" .md)"
  cmd="/$filename"

  # Extract frontmatter fields (between first and second ---)
  in_front=0
  model_val=""
  context_val=""
  desc_val=""

  while IFS= read -r line; do
    if [ "$line" = "---" ]; then
      if [ "$in_front" = "0" ]; then
        in_front=1
        continue
      else
        break
      fi
    fi
    if [ "$in_front" = "1" ]; then
      case "$line" in
        model:*)   model_val="${line#model: }"   ; model_val="${line#model:}"; model_val="$(echo "$model_val" | sed 's/^ *//')" ;;
        context:*) context_val="${line#context: }"; context_val="${line#context:}"; context_val="$(echo "$context_val" | sed 's/^ *//')" ;;
        description:*) desc_val="${line#description: }"; desc_val="${line#description:}"; desc_val="$(echo "$desc_val" | sed 's/^ *//')" ;;
      esac
    fi
  done < "$f"

  # Truncate description to 60 chars
  if [ "${#desc_val}" -gt 60 ]; then
    desc_val="${desc_val:0:57}..."
  fi

  echo "| $cmd | ${model_val:--} | ${context_val:--} | ${desc_val:--} |"
done

echo ""

# ---- Section 2: Tools ----
echo "## Tools"
echo ""
echo "| Script | Description |"
echo "|---|---|"

for f in "$TOOLS_DIR"/*.sh "$TOOLS_DIR"/*.py; do
  [ -f "$f" ] || continue
  filename="$(basename "$f")"

  # Skip __pycache__ and hidden
  case "$filename" in
    _*|.*) continue ;;
  esac

  # Read first non-empty, non-shebang comment or docstring line
  desc=""
  while IFS= read -r line; do
    case "$line" in
      "#!"*) continue ;;
      '"""'*)
        # Python docstring on same line as opening quotes
        inner="${line#\"\"\"}"
        inner="$(echo "$inner" | sed 's/^ *//' | sed 's/"""$//')"
        # Strip leading "filename — " pattern
        inner="$(echo "$inner" | sed 's/^[a-zA-Z0-9_.-]* — //')"
        if [ -n "$inner" ]; then desc="$inner"; fi
        break
        ;;
      "# "*)
        desc="${line#\# }"
        # Strip leading script name pattern "foo.sh — "
        desc="$(echo "$desc" | sed 's/^[a-zA-Z0-9_.-]* — //')"
        break
        ;;
      "#"*)
        trimmed="${line#\#}"
        trimmed="$(echo "$trimmed" | sed 's/^ *//')"
        if [ -n "$trimmed" ]; then
          desc="$trimmed"
          desc="$(echo "$desc" | sed 's/^[a-zA-Z0-9_.-]* — //')"
          break
        fi
        ;;
      "") continue ;;
      *) break ;;
    esac
  done < "$f"

  if [ -z "$desc" ]; then
    desc="-"
  fi

  # Truncate to 70 chars
  if [ "${#desc}" -gt 70 ]; then
    desc="${desc:0:67}..."
  fi

  echo "| $filename | $desc |"
done

# Also list items in tools/verify/ subdirectory
if [ -d "$TOOLS_DIR/verify" ]; then
  for f in "$TOOLS_DIR/verify"/*.py; do
    [ -f "$f" ] || continue
    filename="verify/$(basename "$f")"
    case "$(basename "$f")" in _*|.*) continue ;; esac

    desc=""
    while IFS= read -r line; do
      case "$line" in
        "#!"*) continue ;;
        '"""'*|"'''"*)
          inner="${line#\"\"\"}"
          inner="${inner#\'\'\'}"
          inner="$(echo "$inner" | sed 's/"""$//;s/'"'''"'$//' | sed 's/^ *//')"
          if [ -n "$inner" ] && [ "$inner" != '"""' ] && [ "$inner" != "'''" ]; then
            desc="$inner"
          fi
          break
          ;;
        "# "*)
          desc="${line#\# }"
          break
          ;;
        "") continue ;;
        *) break ;;
      esac
    done < "$f"
    [ -z "$desc" ] && desc="-"
    if [ "${#desc}" -gt 70 ]; then desc="${desc:0:67}..."; fi
    echo "| $filename | $desc |"
  done
fi

echo ""

# ---- Section 3: Engine API Endpoints ----
echo "## Engine Endpoints"
echo ""
echo "| Method | Path | File |"
echo "|---|---|---|"

# Build prefix map from main.py include_router calls
# Format: routes/<file>.router, prefix="<prefix>"
declare_prefix() {
  local route_file="$1"
  # grep the include_router line for this route file
  local prefix=""
  prefix="$(grep "include_router($route_file\.router" "$ENGINE_MAIN" 2>/dev/null | grep -o 'prefix="[^"]*"' | head -1 | sed 's/prefix="//;s/"//')" || true
  echo "$prefix"
}

for f in "$ROUTES_DIR"/*.py; do
  [ -f "$f" ] || continue
  filename="$(basename "$f")"
  case "$filename" in __init__*|_*) continue ;; esac
  module="${filename%.py}"

  # Get router prefix from main.py
  prefix="$(grep "include_router($module\.router\b\|include_router(${module}_routes\.router" "$ENGINE_MAIN" 2>/dev/null | grep -o 'prefix="[^"]*"' | head -1 | sed 's/prefix="//;s/"//')" || true

  # Also handle alias patterns (auth_routes)
  if [ -z "$prefix" ] && [ "$module" = "auth" ]; then
    prefix="$(grep 'include_router(auth_routes\.router' "$ENGINE_MAIN" 2>/dev/null | grep -o 'prefix="[^"]*"' | head -1 | sed 's/prefix="//;s/"//')" || true
  fi

  # Check for inline prefix on APIRouter
  if [ -z "$prefix" ]; then
    inline="$(grep 'router = APIRouter(prefix=' "$f" 2>/dev/null | head -1 | grep -o 'prefix="[^"]*"' | sed 's/prefix="//;s/"//')" || true
    prefix="$inline"
  fi

  # Parse @router.<method>("path") lines — use grep -n for line numbers
  while IFS=: read -r linenum line; do
    method="$(echo "$line" | grep -o '@router\.\(get\|post\|put\|delete\|patch\)' | sed 's/@router\.//' | tr '[:lower:]' '[:upper:]')" || true
    [ -z "$method" ] && continue

    path="$(echo "$line" | grep -o '"[^"]*"' | head -1 | tr -d '"')" || true
    [ -z "$path" ] && path="$(echo "$line" | grep -o "'[^']*'" | head -1 | tr -d "'")" || true

    full_path="${prefix}${path}"
    echo "| $method | $full_path | routes/${filename}:${linenum} |"
  done < <(grep -n '@router\.\(get\|post\|put\|delete\|patch\)' "$f" 2>/dev/null || true)
done

echo ""

# ---- Section 4: App API Routes ----
echo "## App API Routes"
echo ""

find "$APP_ROUTES_DIR" -name "+server.ts" 2>/dev/null | \
  sed "s|$APP_ROUTES_DIR||" | \
  sed 's|/+server\.ts$||' | \
  sort | \
  while read -r route; do
    echo "$route"
  done

echo ""
} > "$TMP"

LINE_COUNT="$(wc -l < "$TMP" | tr -d ' ')"

if [ "$CHECK_MODE" = "1" ]; then
  if [ -f "$OUTPUT_FILE" ]; then
    if diff -u "$OUTPUT_FILE" "$TMP" > /dev/null 2>&1; then
      echo "state/inventory.md: up to date (no diff)"
      exit 0
    else
      echo "state/inventory.md: DIFF DETECTED"
      diff -u "$OUTPUT_FILE" "$TMP" || true
      exit 1
    fi
  else
    echo "state/inventory.md: does not exist (run without --check to create)"
    exit 1
  fi
else
  cp "$TMP" "$OUTPUT_FILE"
  echo "state/inventory.md 갱신됨 (${LINE_COUNT}줄)"
fi
