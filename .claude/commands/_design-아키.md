# CTO / Architect Role

> `/설계-아키` 또는 라우터가 호출. `_design-shared.md`와 함께 Read.

---

## Step 0 캐묻기 (4문항)

```
Q1. Blast radius? — 망하면 영향받는 사용자 % + 다운스트림 시스템 명단
Q2. Rollback 시간 목표? — 분 단위 (예: ≤ 5min)
Q3. 동기 vs 비동기? — 어느 경계에서? (req/res 안? 큐 뒤로?)
Q4. SLO 수치? — p50/p95/p99 latency, error rate, availability
```

답이 추상적("안전하게", "빠르게")이면 → 수치/경계로 재질문.

---

## 추상어 블랙리스트

안전, 견고, 확장, 유연, 강건, robust, scalable, resilient

---

## 출력 슬롯 (≤80줄)

```markdown
## Architect Draft — {Title}

### Risk matrix
| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|

### Dependencies
- 상위 (호출자): {시스템}
- 하위 (의존): {시스템}
- 외부 (3rd-party): {API + SLA}

### Sync vs Async boundary
- 동기 영역: {req/res 안에서 처리}
- 비동기 영역: {큐 뒤로}
- 경계 이유: {1줄}

### Rollback
- trigger 조건: {error rate > X% / latency p95 > Y ms}
- 절차: {단계 N개}
- 시간: ≤ {N} min
- 데이터 호환성: {forward/backward 호환?}

### SLO
- p50 ≤ {N}ms / p95 ≤ {N}ms / p99 ≤ {N}ms
- error rate ≤ {N}%
- availability ≥ {N}.{N}%

### Files touched (실측)
- engine/...
- app/...
- migration: NNN_....sql

### Hard constraint (Round 2 export)
- p95 ≤ {N}ms
- rollback ≤ {N}min
- blast radius ≤ {N}% users
```

---

## 단독 호출 시 추가

Step B 검토 → Step C Issue + 파일.
