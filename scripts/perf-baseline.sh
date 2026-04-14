#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${ROOT_DIR}/docs/baselines"
mkdir -p "${OUT_DIR}"

APP_URL="${APP_URL:-http://localhost:3000}"
ENGINE_URL="${ENGINE_URL:-http://localhost:8000}"
SYMBOL="${SYMBOL:-BTCUSDT}"
TF="${TF:-1h}"
RUNS="${RUNS:-5}"

timestamp="$(date -u +"%Y%m%d_%H%M%S")"
outfile="${OUT_DIR}/perf-baseline-${timestamp}.json"

measure_ms() {
  local url="$1"
  local total="0"
  local arr=()
  for _ in $(seq 1 "$RUNS"); do
    ms=$(curl -s -o /dev/null -w '%{time_total}' "$url")
    ms_int=$(python - <<PY
v=float("${ms}")*1000
print(int(v))
PY
)
    arr+=("$ms_int")
    total=$((total + ms_int))
  done
  avg=$((total / RUNS))
  IFS=$'\n' sorted=($(printf "%s\n" "${arr[@]}" | sort -n))
  p95_index=$(( (95 * RUNS + 99) / 100 - 1 ))
  if (( p95_index < 0 )); then p95_index=0; fi
  if (( p95_index >= RUNS )); then p95_index=$((RUNS - 1)); fi
  p95="${sorted[$p95_index]}"
  printf '{"avg_ms": %s, "p95_ms": %s, "runs": %s}' "$avg" "$p95" "$RUNS"
}

analyze_metrics=$(measure_ms "${APP_URL}/api/cogochi/analyze?symbol=${SYMBOL}&tf=${TF}")
score_metrics=$(measure_ms "${ENGINE_URL}/score")
deep_metrics=$(measure_ms "${ENGINE_URL}/deep")

cat > "$outfile" <<JSON
{
  "generated_at_utc": "${timestamp}",
  "app_url": "${APP_URL}",
  "engine_url": "${ENGINE_URL}",
  "symbol": "${SYMBOL}",
  "timeframe": "${TF}",
  "metrics": {
    "analyze_get": ${analyze_metrics},
    "score_endpoint_probe": ${score_metrics},
    "deep_endpoint_probe": ${deep_metrics}
  }
}
JSON

echo "Wrote baseline: ${outfile}"

