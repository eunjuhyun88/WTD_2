---
name: Architecture Improvements Session — 2026-04-25
description: CTO 아키텍처 감사 + 개선 내역. jobs.py conflict 수정, Layer A weighted L1, JWT structured logging, cloud build hardening.
type: project
---

# 아키텍처 개선 세션 (2026-04-25)

## main SHA
`e2fba18b` — PR #252 #253 #254 #256 모두 머지됨

## 완료된 변경

### 인프라
- `cloudbuild.yaml`: `--min-instances 1` 추가 → API cold start 제거
- `cloudbuild.worker.yaml`: `--concurrency 1 --timeout 900s` 추가 → 15분 job 중복 방지
- `docs/runbooks/cloud-scheduler-setup.md`: gcloud 명령어로 Cloud Scheduler 2개 job 등록 방법 문서화

### 검색 품질 (W-0162 strangler)
`engine/search/similar.py` 세 가지 변경:
1. `_extract_reference_sig()`: `feature_snapshot` 우선 사용 (3차원 → 40+ 차원 reference)
2. `_fetch_feature_signals_batch()`: 검색 시 FeatureWindowStore SQLite 조회 → corpus window signature enrichment
3. `_layer_a()`: uniform L1 → weighted L1 (OI/funding 2x, positioning 1.5-1.8x)
4. `_SIGNAL_WEIGHTS` dict 추가: 35개 신호 가중치 테이블

### JWT 관측성
`engine/api/auth/jwt_validator.py`:
- structured JSON logging: `{"event": "circuit_state_change", "from": "open", "to": "half_open", "ts": ...}`
- JWKS fetch latency_ms 측정 및 기록

### Bug fix
`engine/api/routes/jobs.py`: git conflict marker 3곳 + 중복 `feature_windows_build` endpoint 제거
- `_MIN_INTERVAL` dict conflict 해결
- `_LOCK_TTL` dict conflict 해결
- `jobs_status` list conflict 해결

## 사람이 해야 할 인프라 (미완)
- [ ] GCP Cloud Build: `cogotchi-worker` trigger 있는지 확인 (없으면 추가)
- [ ] Cloud Scheduler: `docs/runbooks/cloud-scheduler-setup.md` 참조해서 2개 job 등록
- [ ] Vercel: `EXCHANGE_ENCRYPTION_KEY` 프로덕션 환경변수 설정

## 에이전트 다음 작업 순서
1. W-0162 나머지: SearchCorpusStore를 FeatureWindowStore 기반으로 완전 전환
2. W-0160: JSON ledger → Supabase 영속성
3. W-0151: Pattern ML active 전환 경로
4. W-0124: engine-api JWT 게이팅
5. W-0157: similar-live feature ranking 강화

**Why:** W-0200 core loop 완성 후 검색 품질 + 인프라 안정성이 다음 우선순위.
**How to apply:** 새 세션 시작 시 이 파일로 컨텍스트 복원 가능.
