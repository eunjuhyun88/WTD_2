# W-0213 — Multi-Agent OS Phase 3-4

## Goal

`.gitattributes merge=ours` 설정으로 CURRENT.md / state/state.json 자동 병합 충돌 방지 + design verify CI gate 강화.

## Owner

A009

## Scope

- `.gitattributes` — CURRENT.md, state/state.json에 `merge=ours` 드라이버 등록
- `.github/workflows/contract.yml` — design invariants 검증 스텝 추가 (validate_memkraft_protocol.py)
- `scripts/validate_memkraft_protocol.py` — 신규 invariant 룰 확장

## Non-Goals

- Multi-Agent OS Phase 5+ (자동 task 분배, 에이전트 간 통신)
- MemKraft UI / 대시보드

## Canonical Files

- `work/active/CURRENT.md`
- `work/active/W-0213-multi-agent-os-phase34.md`
- `.gitattributes`
- `scripts/validate_memkraft_protocol.py`
- `.github/workflows/contract.yml`
