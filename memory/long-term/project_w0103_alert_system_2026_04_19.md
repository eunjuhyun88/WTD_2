---
name: W-0103 Alert System 완료 (2026-04-19)
description: per-symbol 상세 Telegram 알림(가격/진입존/목표가/손절/p_win gate) + live_monitor 5패턴 지원. claude/w-0103-alert-system 브랜치, PR 미생성.
type: project
---

## W-0103 Alert System 체크포인트

**브랜치:** `claude/w-0103-alert-system` (pushed, PR 미생성)
**커밋:** bf8d812 (checkpoint), 0c02915 (alert system)

### 구현

`engine/scanner/alerts_pattern.py` (신규):
- `format_entry_alert(record)` — HTML 알림 포맷
  - 현재가 / 진입존(±band%) / 목표가(+%) / 손절가(-%)
  - ML P(win) / BTC regime / 페이즈 스코어 / 블록 목록
- `compute_entry_levels(price, slug)` — 패턴별 target/stop 하드코딩
  - TRADOOR: +35% / -12%
  - FFR: +25% / -10%
  - WSR: +18% / -8%
  - WHALE: +30% / -12%
  - VAR: +20% / -10% (벤치마크 후 실증치로 교체 예정)
- `send_pattern_entry_alert(record)` — p_win gate(≥0.55) 적용
- 인라인 버튼: [✓ 진입] [✗ 패스] [👀 워치] → transition_id 피드백

`engine/scanner/jobs/pattern_scan.py`:
- 신규 entry candidate → per-symbol 상세 알림 먼저 + summary

`engine/research/live_monitor.py`:
- PHASE_ORDER: VAR 페이즈 추가
- PROMOTED_PATTERNS: WHALE 추가 (4패턴)
- is_entry_candidate: 5패턴 entry phase 지원
- is_watch: 5패턴 watch phase 지원

### 다음 순서
1. `gh pr create` (claude/w-0103-alert-system → main)
2. VAR Slice 2 벤치마크 (FARTCOIN/POPCAT/PEPE)
3. Compression onset dedup (ExtremeEventDetector onset_only=True)

**Why:** 알림이 없으면 패턴이 몇 개든 실전 불가. 이제 기반 완성.
**How to apply:** TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID 환경변수 필요.
