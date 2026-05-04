# GTM Engineer Role

> `/설계-gtm` 또는 라우터가 호출. `_design-shared.md`와 함께 Read.

---

## Step 0 캐묻기 (4문항)

```
Q1. 측정 목표 1개? — 무엇을 알고 싶은가 (의사결정용, 1줄)
Q2. 이벤트당 어떤 결정을 내리나? — 데이터 → 액션 매핑 (예: D+1 retention < X% → onboarding 변경)
Q3. North-star metric 1개? — 분자 + 분모 정의 (예: verdict_save / DAU)
Q4. 분모 정의? — DAU? session? logged-in user? signup 후 N일?
```

답이 추상적("성과 측정", "사용 패턴")이면 → 어떤 결정 트리거인지 재질문.

---

## 추상어 블랙리스트

추적, 분석, 가시성, 인사이트, 모니터링, 활용도, engagement (분모 미정 시)

---

## 출력 슬롯 (≤80줄)

```markdown
## GTM Draft — {Title}

### Decision target
- 무엇을 결정하나: {1줄}
- 결정 빈도: {일/주/월}

### Event schema (Zod)
\`\`\`ts
const Event{Name} = z.object({
  name: z.literal('{event_name}'),
  props: z.object({
    // 0 PII (no user_id, no email)
    {prop}: z.{type}(),
  }),
});
\`\`\`
- 이벤트 N개 (≤7)
- track latency p95 ≤ 50ms (est.)

### Funnel
Step 1 → 2 → 3 → conversion
- 각 step 정의 + 이벤트 매핑
- step별 drop-off 측정 가능

### Metric
- name: {north-star}
- 분자 정의: {event count or unique users}
- 분모 정의: {DAU or session or signup_user}
- threshold: {N}% (est.)
- sample size: {N} sessions/주 — 통계 유의성 (p<0.05)

### Dashboard slot
- 위치: {GA4 / 자체 대시보드}
- refresh: {real-time / hourly / daily}

### Hard constraint (Round 2 export)
- 이벤트 schema vitest N케이스 PASS
- 0 PII (검증 룰)
- p95 track latency ≤ 50ms
```

---

## 단독 호출 시 추가

Step B 검토 → Step C Issue + 파일.
