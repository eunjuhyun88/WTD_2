# W-0103 — CTO 설계문서 (2026-04-19 session end)

## 현재 상태 요약

### 패턴 라이브러리 (4-pattern system)
| 패턴 | 슬러그 | 점수 | 상태 |
|------|--------|------|------|
| TRADOOR OI Reversal | `tradoor-oi-reversal-v1` | promote_candidate | ✅ PROMOTED |
| Funding Flip Reversal | `funding-flip-reversal-v1` | 0.807 | ✅ PROMOTED |
| Wyckoff Spring Reversal | `wyckoff-spring-reversal-v1` | 0.864 | ✅ PROMOTED |
| Whale Accumulation Reversal | `whale-accumulation-reversal-v1` | TBD | promote_candidate |

### Experiment Log (2026-04-19)
- `events.jsonl`: 114,384 이벤트 (compression: 114,304 / funding_extreme: 80)
- `funding_extreme` 예측력 있는 케이스: **3개 (전부 TRADOORUSDT)** — 72h outcome +23~42%
- Compression detector: 바별 발화(per-bar) → **period-onset 중복 제거 필수**

### PR 현황
- **PR #99** (W-0102): w0102-preview 서버 스크린샷 증명 완료, merge 준비

---

## CTO 결정: 다음 세션 우선순위

### P0 — PR #99 merge + 5th Pattern 착수

**Why:** PR #99 이 검증 완료됐으므로 즉시 머지. 그 이후 5번째 패턴 발굴로 시스템 다변화.

**5번째 패턴 후보 (CTO pick: Absorption Signal)**

현재 TRADOOR/FFR/WSR/WHALE의 공통 약점:
- 모두 "이미 움직인 후" 감지 (lagging entry)
- 흡수(absorption) — 대규모 매수가 셀링 프레셔를 소화하는 시점을 포착하면 earlier entry 가능

```
SELLING_PRESSURE_ZONE → ABSORPTION → RECLAIM → MARKUP
```

Building blocks 필요:
- `absorption_signal` (soft_block in WSR COMPRESSION_ZONE — already defined)
- `post_dump_compression` (already exists)
- `volume_dry_up_after_spike` (신규)
- `delta_flip_positive` (신규 — CVD delta 전환)

벤치마크 후보: FARTCOIN (2025-12 absorption), POPCAT (2025-11), PEPE (2025-10)

### P1 — Event Detector 개선: period-onset 중복 제거

**Why:** 현재 compression detector가 114K 이벤트를 생성 → 실용 불가.
바가 새 압축 구간에 처음 진입할 때만 발화하는 "onset" 필터 추가.

```python
# 현재: 바마다 발화
# 목표: compression 구간 시작점(onset)만 기록
#       → 114K → ~1K로 줄여야 패턴 검색에 활용 가능
```

### P2 — Wyckoff Spring 유니버스 스캔 (100 symbols)

**Why:** WSR 벤치마크팩이 ENA(ref) + 3 holdout 밖에 없음. 더 많은 케이스 발굴.

```bash
python3 -m engine.research.pattern_search.pattern_discovery \
  --pattern wyckoff-spring-reversal-v1 \
  --universe full \
  --output benchmark_packs/wsr-universe-scan-v1.json
```

### P3 — Merge PR #99 → 다음 UI 작업

**UI 다음 단계 (W-0103):**
1. 24H 변동률 소스 확인 — CommandBar와 ChartBoard 동일 값 표시 여부 live 검증
2. 모바일 TF 전환 흐름 검증 — ChartBoard 내 TF strip이 모바일에서도 잘 동작하는지
3. `/patterns` Verdict Inbox 개선 — W-0097에서 구현한 inbox에 패턴 4종 전부 표시

---

## 설계: 5번째 패턴 — Volume Absorption Reversal (VAR)

### 가설
"고점/저점 근처에서 대규모 셀링 프레셔를 매수 흡수로 소화한 뒤 급반등"

시장 구조:
1. **SELLING_CLIMAX** — 고거래량 하락 (볼륨 스파이크 + 새 저점)
2. **ABSORPTION** — CVD delta 전환 (매도량 < 매수 반응량), 볼륨 감소
3. **BASE_FORMATION** — higher_lows + 거래량 dry-up
4. **BREAKOUT** — 이전 고점 돌파 + 볼륨 재개

### Building blocks 설계

```python
# 신규 블록 2개 필요:
# 1. volume_spike_down: 하락 방향 볼륨 스파이크 (거래량 > 3σ + 가격 하락)
# 2. delta_flip_positive: CVD delta가 음→양으로 전환 (taker_buy_volume 급증)

# 기존 재사용:
# - post_dump_compression (SPRING 대체)
# - higher_lows_sequence (BASE_FORMATION)
# - breakout_above_high (BREAKOUT)
```

### 구현 순서
- Slice 1: volume_spike_down + delta_flip_positive building block
- Slice 2: VAR PatternObject + 테스트
- Slice 3: FARTCOIN/POPCAT 벤치마크팩 + 0.85+ promote_candidate

---

## 아키텍처 결정 (CTO)

### Decision 1: perp 데이터 없는 순수 OHLCV 패턴 확대
WSR이 성공적으로 증명 → 더 많은 현물 중심 패턴 가능.
VAR도 CVD(taker buy volume) 기반 — perp OI/funding 불필요.
**→ 현물 거래소도 커버 가능한 패턴 시스템으로 확장**

### Decision 2: Pattern #6 후보 보류
현재 P0~P3 우선. Pattern 6 (CME Gap, VWAP Reclaim 등)은 4-5번째 패턴 완성 후.

### Decision 3: Compression detector dedup 전략
per-onset 발화: 구간 시작 bar만 기록 + 동일 구간 내 중복 억제 (min_gap=12 bars).
→ `ExtremeEventDetector` 클래스에 `onset_only=True` 옵션 추가.

---

## 파일 체크리스트

- `engine/patterns/library.py` — 4 patterns (PATTERN_LIBRARY len=4)
- `engine/patterns/building_blocks/` — volume_spike_down, delta_flip_positive (신규 예정)
- `engine/research/pattern_search/benchmark_packs/wyckoff-spring-reversal-v1__wsr-v1.json`
- `app/src/components/layout/Header.svelte` — ticker pill 제거됨 (w-0102 branch)
- `app/src/components/terminal/workspace/TerminalCommandBar.svelte` — TF pill 제거됨

## Next session 시작 체크리스트

1. `gh pr merge 99` — PR #99 머지
2. `git pull` + 테스트 통과 확인
3. Volume Absorption Reversal Slice 1 착수
