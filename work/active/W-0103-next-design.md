# W-0103 — 다음 세션 설계 (2026-04-19 checkpoint)

## 현재 상태

### 브랜치 / PR
| 브랜치 | 내용 | 상태 |
|--------|------|------|
| `claude/w-0103-var-pattern` | VAR Slice 1 (building blocks + pattern) | PR #100 MERGED → main |
| `claude/w-0103-alert-system` | per-symbol 상세 알림 + p_win gate | PUSHED, PR 미생성 |

### 완성된 것
1. **VAR 패턴** (`volume-absorption-reversal-v1`) — 5번째 패턴, 968 tests pass
   - `volume_spike_down` + `delta_flip_positive` 신규 블록
   - SELLING_CLIMAX → ABSORPTION → BASE_FORMATION → BREAKOUT
2. **per-symbol 진입 알림** (`alerts_pattern.py`)
   - 현재가 / 진입존 / 목표가 / 손절가 / ML P(win) / BTC regime
   - p_win gate (≥ 0.55), 인라인 버튼 [✓ 진입] [✗ 패스] [👀 워치]
3. **live_monitor** — WHALE 추가, VAR 페이즈, is_entry_candidate 5패턴 지원

---

## 다음 우선순위

### P0 — `claude/w-0103-alert-system` PR 생성 + 머지
```bash
gh pr create --title "feat(W-0103): per-symbol entry alert — price/target/stop/p_win gate" \
  --base main --head claude/w-0103-alert-system
```

### P1 — VAR Slice 2: 벤치마크 실증
목적: 실제 Binance 데이터로 패턴 발화 + score ≥ 0.85 → promote_candidate

```bash
cd engine
source .venv/bin/activate
python3 -m research.pattern_search.pattern_discovery \
  --pattern volume-absorption-reversal-v1 \
  --symbols FARTCOINUSDT POPCATUSDT 1000PEPEUSDT \
  --timeframe 1h \
  --start 2024-10-01
```

주요 확인:
- 셀링 클라이맥스 → 흡수 → 베이스 → 브레이크아웃 사례가 실제로 존재하는가?
- `delta_flip_positive` / `volume_spike_down` 발화 시점이 의미있는가?
- 벤치마크 score ≥ 0.85이면 → promote_candidate
- score < 0.70이면 → 파라미터 조정 (multiple, flip_window)

### P2 — Compression onset dedup
현재: `compression` 114K 이벤트 (per-bar 발화) → 실용 불가
목표: 구간 시작점(onset)만 기록 → ~1K로 줄임

```python
# ExtremeEventDetector에 onset_only=True 옵션 추가
# 동일 압축 구간 내 min_gap=12 bars 이내 중복 억제
```

### P3 — 알림 실전 검증
`TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` 환경변수 설정 후:
```bash
# 수동 테스트: 알림 포맷 확인
python3 -c "
from scanner.alerts_pattern import format_entry_alert
record = {
  'symbol': 'FARTCOINUSDT', 'slug': 'volume-absorption-reversal-v1',
  'phase_label': 'BASE_FORMATION', 'bars_in_phase': 6,
  'entry_p_win': 0.68, 'confidence': 0.72,
  'blocks_triggered': ['delta_flip_positive', 'higher_lows_sequence'],
  'feature_snapshot': {'price': 0.1234, 'regime': 'neutral'},
  'transition_id': 'test-123',
}
print(format_entry_alert(record))
"
```

---

## 아키텍처 결정 사항 (CTO)

### Decision A: 알림 → 결정 → 포지션 순서
현재까지: Layer 1(신호) + Layer 3(알림) 완성.
다음: Layer 2(게이트 명시화), Layer 4(포지션 사이징)는 VAR 벤치마크 완료 후.
이유: 벤치마크 없이는 VAR의 avg_gain_pct가 불확실 → target_pct 기본값(20%)이 추정값.

### Decision B: per-symbol alert의 target/stop은 현재 hardcoded
→ Slice 2 벤치마크 결과로 패턴별 실증치로 교체 예정.
- TRADOOR: avg +36% → target 35% 유지
- VAR: TBD (벤치마크 후)

### Decision C: WHALE pattern PROMOTED_PATTERNS 등록 완료
whale-accumulation-reversal-v1이 live_monitor에 추가됨.
별도 variant 벤치마크 없이 canonical로 등록.
→ 실전 데이터가 쌓이면 variant 튜닝.

---

## 파일 체크리스트

### Engine
- `engine/patterns/library.py` — 5 patterns
- `engine/building_blocks/triggers/volume_spike_down.py` ✅
- `engine/building_blocks/confirmations/delta_flip_positive.py` ✅
- `engine/scanner/alerts_pattern.py` ✅ (미머지)
- `engine/scanner/jobs/pattern_scan.py` ✅ (미머지)
- `engine/research/live_monitor.py` ✅ (미머지)

### 환경변수 (실전 필요)
- `TELEGRAM_BOT_TOKEN` — BotFather 토큰
- `TELEGRAM_CHAT_ID` — 알림 수신 채널
- `PATTERN_ALERT_P_WIN_GATE` — 기본 0.55 (선택)
