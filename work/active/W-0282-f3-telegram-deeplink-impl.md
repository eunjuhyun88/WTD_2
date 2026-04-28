# W-0282 — F-3 Telegram verdict deep link 주입 구현

> Wave: Wave4/B | Priority: P1 | Effort: M
> Charter: In-Scope L7 (Refinement — verdict loop)
> Status: 🟡 Design Draft
> Created: 2026-04-28 by Agent A073
> Issue: #546
> Related: Issue #414 (F-3 기존 이슈)

## Goal (1줄)
Telegram 패턴 진입 alert 메시지에 `/verdict?token=XXX` deep link URL이 포함되어, 사용자가 앱 로그인 없이 1-click으로 verdict를 제출할 수 있다.

## Scope
- 포함:
  - `engine/scanner/alerts_pattern.py`: `send_pattern_entry_alert()` — deep link URL 주입
  - `engine/api/routes/captures.py`: 토큰 생성 로직을 `_sign_verdict_token()` 내부 함수로 분리 (직접 호출 가능)
  - `engine/scanner/alerts_pattern.py`: `format_entry_alert()` 또는 메시지 append로 URL 추가
- 파일/모듈: `engine/scanner/`, `engine/api/routes/`
- API surface: 없음 (내부 함수 분리)

## Non-Goals
- `/verdict` landing page 수정 없음 (이미 완성 — `app/src/routes/verdict/+page.svelte`)
- Telegram bot API 변경 없음
- capture_id 없는 alert에는 URL 없이 그냥 전송 (graceful degrade)
- 버튼 keyboard 레이아웃 변경 없음

## CTO 관점 (Engineering)

### 현재 상태 분석
- `POST /captures/{id}/verdict-link` 엔진 엔드포인트 존재 (captures.py:707)
- `/verdict?token=...` landing page 존재 (app/src/routes/verdict/)
- **GAP**: `send_pattern_entry_alert()` 가 deep link URL을 메시지에 포함하지 않음
- capture_id는 `record.get("capture_id")` 또는 `record.get("transition_id")` 로 접근 가능

### Risk Matrix
| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| capture_id가 record에 없는 경우 | 중 | 중 | AC4: capture_id 없으면 URL 없이 전송 |
| 토큰 생성 실패 | 저 | 중 | try/except → URL 없이 전송 |
| APP_ORIGIN env var 미설정 | 중 | 중 | 환경 검증 + fallback |
| 72h 만료 후 링크 클릭 | 중 | 저 | landing page가 expired 표시 |

### Dependencies
- 선행 없음 — 독립적으로 구현 가능
- `engine/api/routes/captures.py:707` 토큰 생성 로직 참조

### Rollback Plan
- `alerts_pattern.py` 변경 revert — URL 없이 기존 alert 동작으로 복귀

### Files Touched (예상)
- `engine/api/routes/captures.py` (+20줄 — `_sign_verdict_token()` 분리)
- `engine/scanner/alerts_pattern.py` (+15줄 — URL 주입)
- `engine/scanner/test_alerts_pattern.py` (+20줄)

## AI Researcher 관점 (Data/Model)

### Data Impact
- verdict 제출 경로 다양화 (앱 직접 + Telegram deep link)
- verdict 데이터 품질 영향 없음 (동일 API endpoint 사용)

### Statistical Validation
- 목표: Telegram alert 발송 후 verdict 제출률 측정 (현재 vs 개선 후)
- PRIORITIES.md: "NSM(WVPL) 병목 해소" — verdict 속도가 LightGBM 학습 속도 결정

### Failure Modes
- deep link URL이 너무 길어 Telegram 표시 문제 → URL 단축 고려 (P2)

## Decisions

- [D-001] 토큰 생성 로직을 `_sign_verdict_token(capture_id)` 내부 함수로 분리
  - 거절: HTTP self-call (`POST /captures/{id}/verdict-link`) → 내부 circular call + 속도 문제
- [D-002] URL을 메시지 텍스트 마지막에 `\n\n📊 [Verdict 제출]({url})` 형태로 추가
  - 거절: inline keyboard 버튼으로 추가 → callback_data 방식과 혼재

## Open Questions

없음 — 구현 경로 명확

## Implementation Plan

1. `captures.py`에서 토큰 서명 로직을 `_sign_verdict_token(capture_id: str) -> str` 로 분리
2. `alerts_pattern.py`: `send_pattern_entry_alert()`에서 `capture_id` 추출 후 `_sign_verdict_token()` 호출
3. `format_entry_alert()` 반환 텍스트에 URL 라인 append
4. capture_id 없거나 토큰 생성 실패 시 URL 없이 전송 (graceful degrade)
5. `test_alerts_pattern.py`: URL 포함 여부 단위 테스트 추가

## Exit Criteria

- [ ] AC1: Telegram entry alert 메시지에 `/verdict?token=...` URL 포함
- [ ] AC2: token 72h 유효, expired 시 `/verdict` 페이지가 만료 표시
- [ ] AC3: verdict 제출 성공 → `PATCH /outcomes/{id}/verdict` 기록 확인
- [ ] AC4: capture_id 없거나 토큰 생성 실패 시 URL 없이 alert 전송 (graceful degrade)
- [ ] AC5: pytest green
- [ ] CI green
- [ ] PR merged + CURRENT.md SHA 업데이트

## References

- `engine/api/routes/captures.py:707` — 토큰 생성 엔드포인트
- `app/src/routes/verdict/+page.svelte` — landing page (완성)
- `engine/scanner/alerts_pattern.py:213` — `send_pattern_entry_alert()`
- `engine/scanner/alerts_pattern.py:132` — `format_entry_alert()`
- Issue #414 (기존 F-3 이슈)
- spec/PRIORITIES.md D15: Telegram → 1-click verdict deep link (확정)
