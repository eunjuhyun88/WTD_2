# W-0391-C — TV Import → Hypothesis Compiler

> Wave: 5 | Priority: P2 | Effort: L (5-7d)
> Charter: In-Scope (Frozen 전면 해제 2026-05-01)
> Status: 🟡 Design Draft
> Parent: W-0391 #937
> Absorbs: W-0371 Design Draft v2
> Created: 2026-05-03

## Goal

사용자가 TradingView 공개 차트 URL을 붙여넣으면, Hypothesis Card + Constraint Ladder + Evidence Report + Replay Pack 4개 산출물로 변환한다. **"AI가 차트를 맞춘다"가 아닌 트레이더의 차트를 백테스트 가능한 가설로 컴파일.**

## Scope (W-0371 설계 기반 — 그대로 흡수)

### Phase C1 — TV Parser + 엔진 백엔드 (3d)
파일:
- `engine/research/tv_chart_parser.py` (신규)
  - TV 공개 URL → symbol, timeframe, snapshot URL 추출
  - Vision API (claude-sonnet-4-6) → `visible_atoms: VisibleAtom[]`
  - Compiler: `visible_atoms` → `compiled_filters: IndicatorFilter[]` (기존 `feature_catalog.py` 재사용)
- `engine/api/routes/research.py` — `POST /research/tv-import` 엔드포인트
- `engine/tests/test_tv_chart_parser.py` — 5 샘플 URL 테스트

### Phase C2 — Import Workbench UI (2d)
파일:
- `app/src/routes/lab/import/+page.svelte` (신규)

3-Step UX:
```
Step 1: [URL 붙여넣기 _______________] [파싱]
  → symbol: BTC/USDT | TF: 4H | snapshot 표시

Step 2: Hypothesis Card
  [지표 조건 편집 — 사용자 최종 확정]
  bull_flag | RSI < 35 | range breakdown

  Constraint Ladder:
  Strict (n=12) | Base (n=34) | Loose (n=67)
  ↑ n<30 경고

Step 3: [백테스트 실행 →] → /research/top-patterns 결과
```

## Non-Goals (W-0371 §Non-Goals 그대로)

- 가격 레벨 추출 (일반화 불가)
- 비공개 TV 차트
- 실시간 TV 차트 미러링

## Open Questions (OQ-1 블로커)

- [ ] **OQ-1**: TV 공개 URL에서 snapshot이 실제로 접근 가능한가? 5개 URL 실측 후 Phase C1 착수
- [ ] **OQ-2**: Vision API 비용 — 1 import당 ~$0.005 (claude-sonnet-4-6 vision), Pro+ only gate 필요?

## Exit Criteria

- [ ] AC1: TV parser 5 샘플 URL → symbol/TF 파싱 성공 ≥ 4/5
- [ ] AC2: Vision → `visible_atoms` → `compiled_filters` 변환 3 케이스 PASS
- [ ] AC3: Constraint Ladder n≥30 게이트 동작 (n<30 시 경고 표시)
- [ ] AC4: Import Workbench 3-step UI 렌더 (dev server)
- [ ] AC5: `/research/tv-import` endpoint 200 응답
- [ ] CI green

## Files Touched (stream-exclusive)

```
engine/research/tv_chart_parser.py  (신규)
engine/api/routes/research.py  (TV import 엔드포인트 추가)
engine/tests/test_tv_chart_parser.py  (신규)
app/src/routes/lab/import/+page.svelte  (신규)
app/src/routes/lab/import/+page.ts  (신규)
```

⚠️ Phase C1 착수 전 OQ-1 실측 필수 — 불가 시 스코프 축소 가능.
