# Opus-Design → Sonnet-Impl → Haiku-Repeat 3-Tier Model Runbook

> W-1003 | 에이전트 모델 선택 가이드 + 핸드오프 프로토콜

## 왜 3-Tier인가

| 모델 | 상대 비용 | 용도 |
|---|---|---|
| Opus | ~75× | 설계, 트레이드오프 판단, Risk matrix, 거절 옵션 |
| Sonnet | ~3× | 코드 작성, 리팩토링, 테스트 작성 |
| Haiku | 1× | rename, fixture 초안, 상수 추출, 패턴 치환 |

**Opus로 설계 → Sonnet으로 구현 → Haiku로 반복**: 전통적 "Opus 혼자 다 하기" 대비 60-70% 비용 절감 추정.

---

## 커맨드 → 모델 매핑

| 슬래시 커맨드 | 모델 | 트리거 조건 |
|---|---|---|
| `/설계` | Opus | 트레이드오프·Risk·거절옵션 필요 |
| `/구현` | Sonnet | spec-readiness ≥8 확인 후 |
| `/반복` | Haiku | 판단 불필요한 기계적 bulk 작업 |
| `/검증` | Sonnet | 변경 범위 종합 검증 |
| `/빠른검증` | Sonnet | pytest + svelte-check only |

---

## 핸드오프 프로토콜

### Opus → Sonnet (설계 → 구현)

1. Opus가 Work Item 파일 저장 (`work/active/W-XXXX-slug.md`)
2. Spec readiness gate: `bash tools/spec-readiness.sh W-XXXX`
   - score ≥8 → `/구현 W-XXXX` 실행
   - score <8 → Opus에게 Open Questions 해소 요청
3. Sonnet이 Canonical Files 목록 기준으로만 수정
4. 판단 필요 시 Sonnet → parent 반환 (에스컬레이션 금지)

### Sonnet → Haiku (구현 중 반복 작업 분리)

Sonnet이 구현 도중 반복성 하위 작업 발견 시:
- 판단 불필요 + 파일 10개+ 동일 패턴 → `/반복` 위임
- 그 외 → Sonnet이 직접 처리

### Haiku 제약

- 추가 서브에이전트 spawn 금지
- 판단 필요 시 즉시 parent 반환 (자체 결정 금지)
- 최대 spawn depth: parent → Sonnet → Haiku (여기서 stop)

---

## Spec Readiness 체크리스트

```bash
bash tools/spec-readiness.sh W-XXXX
```

| 항목 | 배점 | 체크 기준 |
|---|---|---|
| Required 7 sections 존재 | 7점 | Goal/Scope/Non-Goals/Canonical Files/Exit Criteria/Handoff Checklist/Decisions |
| Exit Criteria 수치화 | 1점 | AC#, ≥/≤, % 또는 p50/ms 포함 |
| Canonical Files 비어있지 않음 | 1점 | 파일 경로 목록 존재 |
| TBD/TODO 없음 | 1점 | 리스트 항목에 TBD/TODO 미존재 |

score ≥8 → `/구현` 가능. score <8 → `/설계`로 보완.

---

## 비용 추정 (W-1003 기준)

실측 전 추정치:

| 단계 | 이전 방식 | 3-tier 방식 | 절감 |
|---|---|---|---|
| 설계 (1회) | Opus 150k tok | Opus 40k tok | 73% |
| 구현 (3-5 PR) | Opus 500k tok | Sonnet 300k tok | 40% |
| 반복 작업 | Opus 100k tok | Haiku 100k tok | 98% |
| **합계** | ~750k tok Opus | 40k Opus + 400k Sonnet | **~65% 절감** |

실측: PR 3 이후 `work/log/token-usage/` 참조.

---

## 실패 패턴 + 대응

| 증상 | 원인 | 대응 |
|---|---|---|
| Sonnet이 설계 결정을 스스로 내림 | spec 불완전 | spec-readiness 재실행, score 확인 |
| Haiku가 에스컬레이션 없이 판단 | 작업 분류 오류 | `/구현`으로 재위임 |
| Opus가 구현 코드까지 작성 | `/설계` 범위 초과 | 설계 초안만 작성하도록 프롬프트 수정 |
| 결과물 불일치 | 핸드오프 사실 누락 | Facts-First 프롬프트 패턴 적용 |
