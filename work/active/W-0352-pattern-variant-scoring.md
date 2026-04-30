---
id: W-0352
title: Pattern variant weights applied in scanner
status: design
wave: 5
priority: P1
effort: M
owner: engine
issue: "#762"
created: 2026-04-30
---

# W-0352 — Pattern variant weights applied in scanner

> Wave: 5 | Priority: P1 | Effort: M
> Owner: engine
> Status: 🟡 Design Draft
> Created: 2026-04-30

## Goal
Jin이 패턴 훈련을 돌리고 새 variant가 promote되면, 다음 스캔부터 스캐너가 그 variant의 가중치/threshold를 즉시 사용하여 점수 계산이 최신 학습 결과를 반영한다.

## Scope
### Files
- `engine/research/pattern_scan/scanner.py` — 점수 계산 단계에서 `ACTIVE_PATTERN_VARIANT_STORE.get_active(pattern_slug)` 호출 후 variant.weights / threshold를 적용하도록 수정 (실측: 현재 미참조)
- `engine/patterns/active_variant_registry.py` — `get_active()` thread-safety + caching 검증, `last_loaded_at` 노출 (171행 store object)
- `engine/research/pattern_scan/score_compose.py` (existing 또는 신규) — variant.weights를 base weights와 머지하는 helper. variant 미존재 시 base
- `engine/tests/test_w0352_variant_scoring.py` (신규) — variant promote → 점수 변화 e2e 1 case + variant 미존재 fallback case
- `engine/scanner/runner.py` (있을 경우) — scanner 호출 사이트에서 cache invalidation 시점 명시

### API Changes
- 없음 (외부 API 표면 불변)

### Schema Changes
- 없음 (`pattern_active_variants/` 디렉토리 구조 그대로)

## Non-Goals
- variant promote 정책 변경 (별도 work item)
- variant rollback UI
- variant scheduler 변경

## CTO 관점

### Risk Matrix
| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| 매 스캔마다 disk read 발생 → I/O 폭증 | H | M | in-memory cache + mtime-based invalidation (`last_loaded_at`) |
| variant 파일 corruption → 스캐너 crash | M | H | try/except + base fallback, sentry alert |
| variant weight schema 미스매치로 KeyError | M | H | pydantic validation at load + base fallback |
| 동시 promote 중 partial-write 읽힘 | L | M | atomic write (tmpfile + rename) 패턴 검증 |

### Dependencies
- 없음 (`ACTIVE_PATTERN_VARIANT_STORE` 이미 존재)

### Rollback
- scanner.py 한 함수 revert → base weights로 즉시 복귀
- 디스크 variant 파일은 보존 (활용 안 됨)

## AI Researcher 관점

### Data Impact
- 학습 → promote → 즉시 사용 루프가 닫힘 (이전: 스캐너가 무시)
- 패턴별 학습 효과 측정 가능 (variant_id 라벨로 후속 outcome 분석)

### Statistical Validation
- variant 적용 전후 30일: pattern hit_rate Δ ≥ 2pp (BH-FDR α=0.10)
- variant_id별 outcome attribution: capture 메타데이터에 variant_id 기록 후 cohort 분석

### Failure Modes
- variant가 base보다 나쁜데 promote됨 → 로깅으로 감지, manual rollback path
- variant cache가 stale → mtime 모니터링 + max_age 60s force reload
- weight 합이 1.0이 아님 → load 시점 normalize warning

## Implementation Plan
1. engine: `score_compose.py`에 `merge_variant_weights(base, variant)` 헬퍼 작성
2. engine: `scanner.py` 점수 계산 직전 `ACTIVE_PATTERN_VARIANT_STORE.get_active(slug)` 호출 + 머지
3. engine: capture 메타데이터에 `variant_id` 필드 기록 (없을 시 추가)
4. engine 단위 테스트: 신규 2 case + 기존 scanner 테스트 0 regression
5. perf: cache hit ratio ≥ 95% 확인 (load fixture 100 회)

## Exit Criteria
- [ ] AC1: variant promote 후 첫 스캔에서 점수 변화 ≥ 1 코인 (n=10 fixture)
- [ ] AC2: variant 파일 부재 시 base 점수와 byte-identical (regression 0)
- [ ] AC3: scanner.py 한 사이클당 variant store read I/O ≤ 1회 (cache hit ratio ≥ 95%)
- [ ] AC4: capture 메타에 variant_id 기록률 ≥ 99% (active variant 존재 시)
- [ ] CI green (pytest + typecheck)
- [ ] PR merged + CURRENT.md SHA 업데이트
