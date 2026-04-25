#!/bin/bash
# 📁 문서 폴더 정리 자동 실행 스크립트
# 86개 파일 → 정본 11개 + live 12개 + archive 53개 구조

set -e

cd /Users/ej/Projects/wtd-v2

echo "🚀 문서 폴더 정리 시작..."
echo ""

# ─────────────────────────────────────────────────────────
# STEP 1: ROOT 폴더에 9-Doc 복사 + 리네임
# ─────────────────────────────────────────────────────────

echo "📝 STEP 1: Root에 9-Doc 복사..."

cp docs/product/brief.md -1_PRODUCT_PRD.md && echo "  ✅ -1_PRODUCT_PRD.md"
cp docs/architecture.md 00_MASTER_ARCHITECTURE.md && echo "  ✅ 00_MASTER_ARCHITECTURE.md"
cp docs/domains/core-loop-object-contracts.md 01_PATTERN_OBJECT_MODEL.md && echo "  ✅ 01_PATTERN_OBJECT_MODEL.md"
cp docs/domains/pattern-engine-runtime.md 02_ENGINE_RUNTIME.md && echo "  ✅ 02_ENGINE_RUNTIME.md"
cp docs/domains/autoresearch-ml.md 03_SEARCH_ENGINE.md && echo "  ✅ 03_SEARCH_ENGINE.md"
cp docs/domains/multi-agent-execution-control-plane.md 04_AI_AGENT_LAYER.md && echo "  ✅ 04_AI_AGENT_LAYER.md"
cp docs/domains/indicator-visual-design.md 05_VISUALIZATION_ENGINE.md && echo "  ✅ 05_VISUALIZATION_ENGINE.md"
cp docs/domains/contracts.md 06_DATA_CONTRACTS.md && echo "  ✅ 06_DATA_CONTRACTS.md"
cp docs/runbooks/release-checklist.md 07_IMPLEMENTATION_ROADMAP.md && echo "  ✅ 07_IMPLEMENTATION_ROADMAP.md"

echo ""

# ─────────────────────────────────────────────────────────
# STEP 2: docs/live/ 생성 (코드 직결 12개)
# ─────────────────────────────────────────────────────────

echo "📝 STEP 2: docs/live/ 생성..."

mkdir -p docs/live

# Move 12 files to live/
mv docs/domains/contracts.md docs/live/ && echo "  ✅ contracts.md"
mv docs/domains/app-route-inventory.md docs/live/ && echo "  ✅ app-route-inventory.md"
mv docs/architecture.md docs/live/ 2>/dev/null && echo "  ✅ architecture.md" || echo "  ⚠️  architecture.md (already copied to root)"
mv docs/domains/indicator-registry.md docs/live/ && echo "  ✅ indicator-registry.md"
mv docs/domains/indicator-visual-design.md docs/live/ 2>/dev/null && echo "  ⚠️  indicator-visual-design.md (already copied)" || true
mv docs/domains/scanner-alerts.md docs/live/ && echo "  ✅ scanner-alerts.md"
mv docs/domains/autoresearch-ml.md docs/live/ 2>/dev/null && echo "  ⚠️  autoresearch-ml.md (already copied)" || true

# Handle flywheel file (could be in domains or product)
if [ -f docs/domains/flywheel-closure-design.md ]; then
  mv docs/domains/flywheel-closure-design.md docs/live/ && echo "  ✅ flywheel-closure-design.md"
elif [ -f docs/product/flywheel-closure-design.md ]; then
  mv docs/product/flywheel-closure-design.md docs/live/ && echo "  ✅ flywheel-closure-design.md"
fi

mv docs/domains/refinement-methodology.md docs/live/ && echo "  ✅ refinement-methodology.md"
mv docs/domains/engine-pipeline.md docs/live/ && echo "  ✅ engine-pipeline.md"
mv docs/domains/pattern-engine-runtime.md docs/live/ 2>/dev/null && echo "  ⚠️  pattern-engine-runtime.md (already copied)" || true
mv docs/domains/multi-agent-execution-control-plane.md docs/live/ 2>/dev/null && echo "  ⚠️  multi-agent-execution-control-plane.md (already copied)" || true

echo ""

# ─────────────────────────────────────────────────────────
# STEP 3: docs/_archive/ 구조 생성
# ─────────────────────────────────────────────────────────

echo "📝 STEP 3: docs/_archive/ 구조 생성..."

mkdir -p docs/_archive/origins
mkdir -p docs/_archive/split_prd
mkdir -p docs/_archive/superseded_domains

echo "  ✅ _archive/origins/"
echo "  ✅ _archive/split_prd/"
echo "  ✅ _archive/superseded_domains/"

echo ""

# ─────────────────────────────────────────────────────────
# STEP 4: C-1 원본 파일들 → origins/
# ─────────────────────────────────────────────────────────

echo "📝 STEP 4: 원본 파일들 → origins/..."

if [ -d docs/_temp_cogochi ]; then
  mv docs/_temp_cogochi/* docs/_archive/origins/ 2>/dev/null && echo "  ✅ _temp_cogochi 파일들 옮김"
  rmdir docs/_temp_cogochi
fi

mv docs/archive/cogochi/*.md docs/_archive/origins/ 2>/dev/null && echo "  ✅ docs/archive/cogochi/*.md" || true

echo ""

# ─────────────────────────────────────────────────────────
# STEP 5: C-2 Split PRD → split_prd/
# ─────────────────────────────────────────────────────────

echo "📝 STEP 5: Split PRD → split_prd/..."

# Move core-loop files
mv docs/product/core-loop.md docs/_archive/split_prd/ 2>/dev/null && echo "  ✅ core-loop.md" || true
mv docs/product/core-loop-system-spec.md docs/_archive/split_prd/ && echo "  ✅ core-loop-system-spec.md"
mv docs/product/core-loop-agent-execution-blueprint.md docs/_archive/split_prd/ && echo "  ✅ core-loop-agent-execution-blueprint.md"
mv docs/product/core-loop-route-contracts.md docs/_archive/split_prd/ && echo "  ✅ core-loop-route-contracts.md"
mv docs/product/core-loop-state-matrix.md docs/_archive/split_prd/ && echo "  ✅ core-loop-state-matrix.md"
mv docs/product/core-loop-surface-wireframes.md docs/_archive/split_prd/ && echo "  ✅ core-loop-surface-wireframes.md"

# Move surfaces/research
mv docs/product/surfaces.md docs/_archive/split_prd/ 2>/dev/null && echo "  ✅ surfaces.md" || true
mv docs/product/research-thesis.md docs/_archive/split_prd/ && echo "  ✅ research-thesis.md"
mv docs/archive/surfaces.md docs/_archive/split_prd/ 2>/dev/null && echo "  ⚠️  duplicate surfaces.md removed" || true

echo ""

# ─────────────────────────────────────────────────────────
# STEP 6: C-3 Superseded domains → superseded_domains/
# ─────────────────────────────────────────────────────────

echo "📝 STEP 6: 흡수된 도메인 문서들 → superseded_domains/..."

# Move domains
for file in \
  docs/domains/chatops-pattern-review-surface.md \
  docs/domains/cogochi-market-data-plane.md \
  docs/domains/canonical-indicator-materialization.md \
  docs/domains/core-loop-route-contracts.md \
  docs/domains/dashboard.md \
  docs/domains/evaluation.md \
  docs/domains/engine-performance-benchmark-lab.md \
  docs/domains/engine-strengthening-methodology.md \
  docs/domains/lab.md \
  docs/domains/multi-timeframe-autoresearch-search.md \
  docs/domains/pattern-draft-query-transformer.md \
  docs/domains/pattern-ml.md \
  docs/domains/pattern-wiki-compiler.md \
  docs/domains/refinement-operator-control-plane.md \
  docs/domains/refinement-policy-and-reporting.md \
  docs/domains/terminal-ai-scan-architecture.md \
  docs/domains/terminal-backend-mapping.md \
  docs/domains/terminal-html-backend-parity.md \
  docs/domains/terminal.md; do
  if [ -f "$file" ]; then
    mv "$file" docs/_archive/superseded_domains/ && echo "  ✅ $(basename $file)"
  fi
done

# Move product files
for file in \
  docs/product/business-viability-and-positioning.md \
  docs/product/competitive-indicator-analysis-2026-04-21.md \
  docs/product/indicator-visual-design-v2.md \
  docs/product/terminal-attention-workspace.md \
  docs/product/verdict-inbox-ux.md; do
  if [ -f "$file" ]; then
    mv "$file" docs/_archive/superseded_domains/ && echo "  ✅ $(basename $file)"
  fi
done

# Move pages folder
if [ -d docs/product/pages ]; then
  mv docs/product/pages docs/_archive/superseded_domains/ && echo "  ✅ pages/"
fi

# Move legacy-doc-map
mv docs/archive/legacy-doc-map.md docs/_archive/superseded_domains/ 2>/dev/null && echo "  ✅ legacy-doc-map.md" || true

echo ""

# ─────────────────────────────────────────────────────────
# STEP 7: docs/_business/ 생성 (비어있음 — 파일 없음)
# ─────────────────────────────────────────────────────────

echo "📝 STEP 7: docs/_business/ 생성..."

mkdir -p docs/_business && echo "  ✅ _business/"

echo ""

# ─────────────────────────────────────────────────────────
# STEP 8: docs/_scratch/ 생성 (비어있음)
# ─────────────────────────────────────────────────────────

echo "📝 STEP 8: docs/_scratch/ 생성..."

mkdir -p docs/_scratch && echo "  ✅ _scratch/"

echo ""

# ─────────────────────────────────────────────────────────
# STEP 9: 정리 (빈 폴더)
# ─────────────────────────────────────────────────────────

echo "📝 STEP 9: 정리..."

# Remove empty archive/cogochi folder
rmdir docs/archive/cogochi 2>/dev/null && echo "  ✅ docs/archive/cogochi 삭제" || true

# Remove archive folder if empty
rmdir docs/archive 2>/dev/null && echo "  ✅ docs/archive 삭제" || echo "  ⚠️  docs/archive 아직 파일 있음"

echo ""

# ─────────────────────────────────────────────────────────
# VERIFICATION
# ─────────────────────────────────────────────────────────

echo "🔍 검증..."
echo ""

# Count files
ROOT_COUNT=$(ls -1 *.md 2>/dev/null | grep -E "^(-1|00|01|02|03|04|05|06|07|NOW|README)" | wc -l)
LIVE_COUNT=$(ls -1 docs/live/*.md 2>/dev/null | wc -l)
ORIGINS_COUNT=$(ls -1 docs/_archive/origins/*.md 2>/dev/null | wc -l)
SPLIT_COUNT=$(ls -1 docs/_archive/split_prd/*.md 2>/dev/null | wc -l)
SUPERSEDED_COUNT=$(ls -1 docs/_archive/superseded_domains/*.md 2>/dev/null | wc -l)
DECISIONS_COUNT=$(ls -1 docs/decisions/*.md 2>/dev/null | wc -l)
RUNBOOKS_COUNT=$(ls -1 docs/runbooks/*.md 2>/dev/null | wc -l)

echo "Root (9-Doc):          $ROOT_COUNT"
echo "docs/live/:            $LIVE_COUNT"
echo "_archive/origins/:     $ORIGINS_COUNT"
echo "_archive/split_prd/:   $SPLIT_COUNT"
echo "_archive/superseded/:  $SUPERSEDED_COUNT"
echo "decisions/:            $DECISIONS_COUNT"
echo "runbooks/:             $RUNBOOKS_COUNT"
echo ""

TOTAL=$((LIVE_COUNT + ORIGINS_COUNT + SPLIT_COUNT + SUPERSEDED_COUNT + DECISIONS_COUNT + RUNBOOKS_COUNT))
echo "✅ 전체 파일 (docs/내): $TOTAL"
echo ""

# Tree view
echo "📂 최종 구조:"
echo ""
tree -L 2 -d docs/ || find docs/ -maxdepth 2 -type d | sort

echo ""
echo "🎉 문서 폴더 정리 완료!"
