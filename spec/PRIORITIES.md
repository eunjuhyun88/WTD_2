# Active Priorities

> 활성 P0/P1/P2만. 총 ≤ 50 lines. 50 lines 넘으면 archive로 이전.
> 진행중 작업 = 자기 P0 자기가 maintain. 완료 = 다음 priority promotion.

---

## P0 — Multi-Agent OS v2 적용 (Phase 3-4)

**Owner**: A008
**Branch**: feat/multi-agent-os-slash-commands
**Spec**: `design/proposed/multi-agent-os-v2.md`

Status: PR #335에서 구현 중.

- Phase 3: `design/current/invariants.yml` + `tools/verify_design.sh` + CI gate
- Phase 4: `.gitattributes` merge policy + MemKraft wrapper/hook hardening
- Agent boot/end: `Design status` 표시 및 drift 검증

Exit: `./tools/verify_design.sh`, MemKraft health, PR checks 모두 pass.

## P1 — W-0145 Search Corpus 40+차원

**Status**: 완료 — main에 구현됨 (`work/active/CURRENT.md` 기준)
**Next**: 검색 품질 회귀 측정이 필요하면 별도 eval PR로 분리.

---

## P2 — W-0212 Chart UX Polish

**Owner**: 미할당
**Branch**: feat/w-0212-chart-ux-polish

- 패인 드래그 리사이즈 검증
- 크로스헤어 값 업데이트
- KPI 스파크라인 확인

Spec: `work/active/CURRENT.md`

---

## Frozen / Waiting

- PR #285 (W-0114 research compare) — stale branch라 재적용/종료 판단 필요
- 인프라 (사람 작업): GCP worker Cloud Build trigger, Vercel `EXCHANGE_ENCRYPTION_KEY`
