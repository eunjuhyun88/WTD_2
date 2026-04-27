#!/usr/bin/env bash
# backfill_work_issue_map.sh — W-0001~W-#### mapping 1회 초기화
#
# Usage:
#   tools/backfill_work_issue_map.sh [--dry-run]
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
exec python3 "${REPO_ROOT}/tools/_backfill_impl.py" "$@"
