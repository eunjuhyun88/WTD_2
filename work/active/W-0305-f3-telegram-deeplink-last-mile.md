# W-0305 — F-3 last mile: Telegram alert에 verdict deeplink URL 포함 (alerts.py)

> Wave: 4 | Priority: P1 | Effort: XS
> Charter: In-Scope L0
> Status: 🟡 Design Draft
> Created: 2026-04-29
> Issue: #633

## Goal

Jin이 Telegram에서 "🚨 BTCUSDT ACCUMULATION" 알림을 받으면 메시지 안에 한 번 클릭으로 앱 verdict 페이지로 들어가 hit/miss/void을 30초 안에 제출할 수 있다 (legacy `send_telegram_alert` 경로 포함).

## Owner

engine

## Scope

### 포함

**갭 정정 (실측 후)**: F-3은 `engine/scanner/alerts_pattern.py:316-319`에서 이미 구현되어 있다 (`_build_verdict_url` + verdict_deeplink_url append). 진짜 갭은 `engine/scanner/alerts.py:108 send_telegram_alert` (legacy signal alert path) 와 `engine/scanner/alerts.py:202 send_pattern_engine_alert` 두 함수에서 verdict URL을 메시지에 포함하지 않는 점이다.

**파일 변경**:
- `engine/scanner/alerts.py` — `send_telegram_alert()`, `send_pattern_engine_alert()`에 verdict URL append 로직 추가
- `engine/scanner/alerts.py` — capture lookup helper (alerts_pattern.py의 `_build_verdict_url` 패턴 재사용 또는 공용 함수로 리팩토링)
- `engine/scanner/_verdict_link.py` (신규, 선택) — `_build_verdict_url` 공통화 (alerts.py + alerts_pattern.py 둘 다 import)

**메시지 포맷**:
```
🚨 BTCUSDT ACCUMULATION
패턴: wyckoff-spring-v1
Phase: BASE_FORMATION (2h 경과)
ML P(win): 68%

→ Verdict 제출: <a href="https://app.wtd.io/verdict?token=...">제출</a> (72h 만료)
```

**갱신 사항**:
- 기존 alerts_pattern.py 메시지에 "(72h 만료)" hint 추가 (사용자 행동 유도)
- 만료 임박 (≤ 12h) 메시지에는 ⚠️ 표기

### Non-Goals

- **다른 채널 (Discord, FCM)**: F-3 last mile은 Telegram만. Discord adapter는 F-?? 별 work item.
- **메시지 retract on verdict 제출**: callback button이 이미 hit/miss/void 처리 — deeplink는 백업 채널. retract는 UX 복잡도 증가.
- **verdict 제출 후 confirm 메시지**: 별도 W-item (UX 후속).
- **Token refresh on expiry**: 72h TTL은 design constraint. 만료 후 새 alert 발송 시 새 token.

## CTO 관점

### Risk Matrix
| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| capture 미존재 → URL 생성 실패 → 알림 자체 실패 | M | M | graceful degrade (alerts_pattern.py 패턴 동일: try/except → URL 없이 발송) |
| HTML parse_mode mismatch (legacy alerts.py는 MarkdownV2) | H | L | `<a href>` 대신 plain URL append 또는 parse_mode를 HTML로 통일 |
| 72h TTL 만료 후 클릭 → 앱 에러 페이지 | M | L | `/verdict?token=` 페이지에서 expired token 처리 (이미 구현되어 있을 가능성, 검증 필요) |
| URL 길이로 Telegram 4096자 제한 초과 | L | L | message length 검증 + URL 단축 (선택사항) |
| verdict_deeplink_url base host = production hardcode | M | M | env var `VERDICT_LINK_BASE_URL` 통일 (이미 존재하는지 grep 필요) |

### Dependencies
- 선행: `engine/api/routes/captures.py POST /{id}/verdict-link` ✅
- 선행: `app/src/routes/verdict/+page.svelte` ✅ (확인 필요)
- 선행: `capture/token.py sign_verdict_token + verdict_deeplink_url` ✅

### Rollback Plan
- alerts.py 변경은 isolated function. 환경 변수 `INCLUDE_VERDICT_LINK=false`로 disable (feature flag)
- 또는 git revert single commit (1 file change)

### Files Touched
- `engine/scanner/alerts.py`
- `engine/scanner/_verdict_link.py` (선택, 신규)
- `engine/scanner/alerts_pattern.py` (refactor — 공통 함수 사용)
- `engine/tests/scanner/test_alerts_verdict_link.py` (신규)

## AI Researcher 관점

### Data Impact
- verdict 제출 funnel: alert sent → URL clicked → verdict submitted 3단계 측정
- baseline (현재): callback button click rate. URL click rate는 새 데이터 → A/B 비교 가능 (button vs link)
- F-16 Layer C 학습용 verdict 50+ 도달 시간 단축 (가설)

### Statistical Validation
- 가설: deeplink URL 포함 → verdict 제출률 +X% 상승 (callback button only 대비)
- 측정: alert_sent_count vs verdict_submitted_count (token 매칭)
- N=50 verdicts까지의 도달 시간 비교 (Layer C 게이트와 연결)

### Failure Modes
- 사용자가 link click 후 앱에서 로그아웃 상태 → JWT redirect loop → verdict 제출 실패
  - mitigation: `/verdict?token=` 페이지가 unauthenticated 상태에서도 token 기반 verdict 허용 (이미 그렇게 설계됨, 확인 필요)
- 모바일에서 Telegram 앱 → 외부 브라우저 전환 시 token 전달 누락
  - mitigation: deeplink URL은 query param으로 token 전달 → 표준 동작 (위험 낮음)

## Decisions

- [D-0305-1] **공통 helper `_build_verdict_url`을 `_verdict_link.py`로 분리**, alerts.py + alerts_pattern.py 둘 다 import.
  - 거절 옵션 (alerts_pattern.py 함수 직접 import): cyclic import 위험 + scanner 모듈 트리 정리.
- [D-0305-2] **legacy alerts.py는 parse_mode='HTML'로 통일** (MarkdownV2 → HTML 변환), `<a href>` 사용.
  - 거절 옵션 (plain URL append): URL 길이 노출 + UX 저하.
  - 위험: 기존 markdown 포맷팅 (\* → <b>) 재검토 필요. mitigation: 변환 utility 작성 + 테스트 fixture로 message 비교.
- [D-0305-3] **72h TTL 표기를 메시지에 명시** (e.g. "(72h 만료)" 또는 만료 임박 ⚠️).
  - 거절 옵션 (표기 X): 사용자가 만료된 링크 클릭 후 혼란.

## Open Questions

- [ ] [Q-0305-1] `VERDICT_LINK_BASE_URL` env var는 이미 정의되어 있는가? (`capture/token.py` grep 필요 — 없으면 신규)
- [ ] [Q-0305-2] `send_pattern_engine_alert`도 동일 처리? (alerts.py:202 — pattern 컨텍스트 있어 capture lookup 가능)
- [ ] [Q-0305-3] 만료 임박 알림은 별도 메시지 (12h 전 reminder)? — 아니면 단순 표기만?

## Implementation Plan

1. `engine/scanner/_verdict_link.py` 신규 — `_build_verdict_url` 함수 이전 + capture lookup
2. `alerts_pattern.py` refactor — local `_build_verdict_url` 제거, import 사용
3. `alerts.py:send_telegram_alert` 수정 — text + verdict URL append (HTML mode)
4. `alerts.py:send_pattern_engine_alert` 수정 — 동일 패턴 적용 (Q-0305-2 결정 후)
5. `alerts.py:format_signal_message` parse_mode HTML 호환 보장
6. **테스트**: `engine/tests/scanner/test_alerts_verdict_link.py`
   - capture 존재 + URL 포함 case
   - capture 없음 + graceful degrade (URL 없이 발송)
   - HTML parse_mode 검증 (special char escape)
   - 72h 만료 표기
7. PR 머지 + CURRENT.md SHA 업데이트

## Exit Criteria

- [ ] **AC1**: Telegram 메시지 클릭 → 앱 `/verdict?token=` 페이지 → VerdictModal 팝업 ≤ 30초 (manual e2e)
- [ ] **AC2**: capture 미존재 시 alert 발송 자체는 성공 (URL 없이 graceful degrade) — pytest
- [ ] **AC3**: 메시지 길이 4096자 이내 (Telegram limit) — pytest fixture
- [ ] **AC4**: alerts.py + alerts_pattern.py 둘 다 동일 helper 사용 (DRY) — code review
- [ ] **AC5**: 72h 만료 표기 메시지에 포함 — pytest assertion
- [ ] CI green (pytest)
- [ ] PR merged + CURRENT.md SHA 업데이트

## Facts

(grep 실측 결과 — 2026-04-29)
1. `engine/scanner/alerts_pattern.py:316-319` — F-3 deeplink 이미 구현 (verdict_url append + 72h 표기 X)
2. `engine/scanner/alerts_pattern.py:205-248` — `_build_verdict_url` 헬퍼 존재 (graceful degrade 포함)
3. `engine/scanner/alerts.py:108 send_telegram_alert` — verdict URL 미포함 (gap)
4. `engine/scanner/alerts.py:202 send_pattern_engine_alert` — verdict URL 미포함 (gap)
5. `engine/api/routes/captures.py:708-729 POST /{capture_id}/verdict-link` — endpoint 존재
6. `engine/scanner/alerts.py:138 parse_mode = "MarkdownV2"` — legacy markdown 포맷
7. `engine/scanner/alerts_pattern.py:319 parse_mode HTML` — 신규 패턴은 HTML

## Assumptions

- `verdict_deeplink_url` 함수는 환경별 base URL을 자동 처리 (env var 또는 hardcode)
- `/verdict?token=` 페이지는 unauthenticated 상태에서 token 검증 후 verdict 제출 허용
- 72h TTL은 `sign_verdict_token`에서 hardcode 또는 env (검증 필요)
- legacy `send_telegram_alert`는 여전히 production에서 호출됨 (W-0289 scheduler hybrid 경로)

## Canonical Files

- 코드 truth: `engine/scanner/alerts.py`, `alerts_pattern.py`, `_verdict_link.py` (신규)
- 도메인 doc: `docs/domains/alerts.md` (있는 경우 갱신)

## Next Steps

1. Q-0305-1~3 답변 (env var 존재 여부 + send_pattern_engine_alert 처리)
2. 사용자 승인 후 1-PR 구현 (XS effort)

## Handoff Checklist

- [ ] alerts_pattern.py 패턴을 그대로 alerts.py에 적용 (DRY)
- [ ] HTML parse_mode 변환 시 기존 markdown 포맷팅 fallback 보존
- [ ] e2e: 실제 Telegram bot으로 발송 테스트 (env: TELEGRAM_BOT_TOKEN)
- [ ] verdict 제출 후 funnel 측정 instrumentation (선택, F-16과 연결)
