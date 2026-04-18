# W-0092 — User Overlay: Live Signal Verdict

## Goal

코어 루프의 마지막 열린 조각을 닫는다.
라이브 스캔 신호(ACCUMULATION / REAL_DUMP)를 /terminal 표면에 올리고, 유저가 `valid / invalid / late / noisy` 판정을 남길 수 있게 한다.
판정은 `verdicts.jsonl`에 영구 저장되어 미래 threshold/policy 보정의 입력 데이터가 된다.

## Owner

engine → app (두 단계로 분리 실행)

## Scope

### Slice 1 — 엔진 API (engine change)
- `engine/api/routes/live_signals.py` 신규 라우터
  - `GET /live-signals` → `scan_universe_live()` 호출, `list[LiveScanResult]` 반환
  - 캐시: 마지막 스캔 결과를 60분간 인메모리 캐시 (재스캔 비용 방지)
  - `POST /live-signals/verdict` body: `{signal_id, symbol, phase, verdict, note?}` → `verdicts.jsonl`에 append
- `engine/api/main.py`에 라우터 등록 (`prefix="/live-signals"`)
- 유닛 테스트 3개 (GET 응답 구조, POST 저장 확인, 캐시 히트 확인)

### Slice 2 — 앱 오버레이 (product surface change)
- `app/src/lib/components/live/LiveSignalPanel.svelte` 신규 컴포넌트
  - ACCUMULATION 심볼 목록 + fwd_peak_pct + phase_fidelity 표시
  - 판정 버튼: `✓ valid` / `✗ invalid` / `⏰ late` / `~ noisy`
  - 판정 시 `POST /api/engine/live-signals/verdict` 호출
- `/terminal` 페이지에 LiveSignalPanel 통합 (ACCUMULATION 신호 있을 때만 표시)
- `fetchLiveSignals()` 함수 추가 (`terminalDataOrchestrator.ts`)

## Non-Goals

- 자동 threshold 보정 (판정 데이터 축적 후 W-0093 별도 슬라이스)
- 복수 패턴 지원 (W-0091)
- 4h 자동 스케줄 (W-0089 Phase 2)
- 알림 / 푸시 (별도)

## Canonical Files

- `engine/research/live_monitor.py` — scan_universe_live() 소스
- `engine/api/routes/live_signals.py` — 신규 (이번 W에서 생성)
- `engine/api/main.py` — 라우터 등록
- `app/src/lib/components/live/LiveSignalPanel.svelte` — 신규 (이번 W에서 생성)
- `app/src/lib/terminal/terminalDataOrchestrator.ts` — fetchLiveSignals() 추가
- `app/src/routes/terminal/+page.svelte` — LiveSignalPanel 통합
- `research/experiments/verdicts.jsonl` — 판정 저장소 (append-only)

## Facts

- `/api/engine/[...path]` 프록시가 이미 모든 엔진 라우팅을 처리함 — 앱 전용 API 라우트 불필요.
- `scan_universe_live()` 호출 시 30개 심볼 × Binance API → ~30-60초 소요. 캐시 필수.
- `live_monitor.py`는 결과를 `experiment_log.jsonl`에 이미 기록함 — verdict는 별도 파일로 분리.
- 엔진 `verdict.router`(`/verdict`)는 이미 존재하나 market_engine verdict 용도 — live signal verdict는 별도 라우터가 명확.

## Assumptions

- 첫 스캔은 요청 시 on-demand (서버 시작 시 pre-warm 없음). 60초 타임아웃 허용.
- verdict는 지금은 파일 저장으로 충분 (DB 마이그레이션 없음).
- ACCUMULATION이 없으면 LiveSignalPanel은 표시 안 함 (빈 UI 노출 금지).

## Open Questions

- 없음. 구현 시작 가능.

## Decisions

- 캐시: 모듈 레벨 변수 (`_cache_result`, `_cache_ts`) — 단순 TTL 캐시, Redis 불필요.
- verdict 저장: `verdicts.jsonl` append-only (experiment_log와 동일 패턴).
- 앱 통합: 기존 terminalDataOrchestrator 패턴 따름 (fetch → store → template).

## Next Steps

1. Slice 1: `engine/api/routes/live_signals.py` 구현 + main.py 등록 + 테스트
2. Slice 2: `LiveSignalPanel.svelte` + terminalDataOrchestrator 연결 + 터미널 통합

## Exit Criteria

- [ ] `GET /live-signals` 응답: `{signals: [...], cached: bool, scanned_at: str}`
- [ ] `POST /live-signals/verdict` 응답: `{ok: true}` + `verdicts.jsonl`에 기록됨
- [ ] 터미널에서 ACCUMULATION 신호가 있을 때 LiveSignalPanel 렌더링됨
- [ ] 판정 버튼 클릭 → POST 호출 → 버튼 disabled (중복 제출 방지)
- [ ] 기존 엔진 테스트 전부 통과 (회귀 없음)

## Handoff Checklist

- 엔진 라우터 구현 → 앱 컴포넌트 순서로 진행
- verdicts.jsonl 경로: `research/experiments/verdicts.jsonl`
- 캐시 TTL: 3600초 (1h) default, env var `LIVE_SIGNAL_CACHE_TTL_SECONDS`로 오버라이드 가능
