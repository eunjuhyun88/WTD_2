---
name: W-0103 VAR + Alert System 완료 (2026-04-19)
description: 5번째 패턴 VAR promote + 패턴별 텔레그램 진입 알림 시스템 완료. PR #101.
type: project
---

## W-0103 완료 (PR #101)

**브랜치:** `claude/w-0103-alert-system`
**테스트:** 968 passed, 4 skipped

### 완료된 작업

#### 1. VAR 5번째 패턴 promote_candidate (Slice 1 + 2)
- Score = 0.925 → PROMOTED_PATTERNS 등록
- benchmark pack: 1000RATS(+156%), SUI(+128%), ALCH(+221%), 1000BONK(+199%)
- `volume-absorption-reversal-v1__canonical` 배리언트

#### 2. 패턴별 진입 알림 시스템 (`alerts_pattern.py`)
- `compute_entry_levels(price, slug)` — 패턴별 진입존/목표가/손절가
- `_pwin_passes_gate(p_win)` — ML 게이트 (≥0.55, None=패스)
- `format_entry_alert(record)` — HTML 텔레그램 메시지
- `send_pattern_entry_alert(record)` — 단건 발송
- `send_pattern_entry_alerts(new_keys, scan_result)` — 배치 발송
- `pattern_scan_job`: 신규 진입 캔디데이트 → 상세 알림 먼저 → 채널 요약

#### 3. 패턴별 목표가/손절가 (alerts_pattern._PATTERN_LEVELS)
| 패턴 | 진입밴드 | 목표 | 손절 |
|------|---------|------|------|
| tradoor-oi-reversal-v1 | ±3% | +35% | -12% |
| funding-flip-reversal-v1 | ±2% | +25% | -10% |
| wyckoff-spring-reversal-v1 | ±2% | +18% | -8% |
| whale-accumulation-reversal-v1 | ±3% | +30% | -12% |
| volume-absorption-reversal-v1 | ±2% | +20% | -10% |

#### 4. WHALE 패턴 수정
- WHALE_ACCUMULATION: required_blocks=[] → required_any_groups=[["oi_spike_with_dump","funding_extreme_short"]]
- smart_money_accumulation → soft_blocks (OKX 라이브 전용)
- ENTRY_CONFIRM: coinbase_premium_positive → optional (과거 데이터 없음)

### 다음 슬라이스

- **P1 (다음):** Compression detector onset dedup (ExtremeEventDetector onset_only=True) — 114K→~1K 이벤트
- **P2:** TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID 환경변수 검증 (프로덕션 연동)
- **Long-term:** VAR target_pct 20%→현실적 조정 (벤치마크 avg가 너무 크므로 보수적 유지)

**Why:** alerts_pattern.py는 패턴 신호 발화 → 트레이더 노티피케이션 루프를 닫는 핵심 컴포넌트.
**How to apply:** PR #101 머지 후 TELEGRAM 환경변수 확인 + 실제 신호 발화 확인 필요.
