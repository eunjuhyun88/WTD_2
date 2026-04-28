# Memory Index

## Current State (2026-04-28 — Latest)

- [project_session_a074_w0281_pattern_verification_20260428.md](project_session_a074_w0281_pattern_verification_20260428.md) — **A074 W-0281 Pattern Verification Lane (Paper Trading) design lock-in**. PRD master v2→v3 + § 0.3 신설, CHARTER §Frozen 예외절(paper=검증 도구 허용 / 실자금 ❌ 그대로). PR #543 머지 → main=`d6c81ad7`, PR #550 (W-0282 V-PV-01 design) open. **사용자 결정**: paper trading은 §Frozen 위반 아님 (예외절 명시). **lesson**: 신규 lane 설계 전 grep 실측 의무 — `engine/backtest/` 9 파일 BUILT 발견 → 재사용 우선. CI 가드 `import.*copy_trading` 차단 룰 V-PV-01 PR 시 추가 필요.
- [project_session_a072_pr_cleanup_adr_collision_20260428.md](project_session_a072_pr_cleanup_adr_collision_20260428.md) — **A072 PR cleanup + ADR collision detection + W-0280 design**. PR #530+#537+#538+#545 머지, 5 zombie close, ADR-008 dup 발견 → W-0280 ADR numbering enforcement 설계. main=`f0a89057` (#545 직후) → `d6c81ad7` (다른 에이전트 #543). **lesson**: 검색 도구는 `in:title` scope + first-W-#### owner filter 필수 (issue body false-positive 방지). bash 3.2 호환 dedup 패턴.
- [project_session_a065_drift_reconciliation_20260428.md](project_session_a065_drift_reconciliation_20260428.md) — **A065 docs ↔ code 5-axis drift reconciliation + /닫기 Step 7-B 신설**. PR #511 (drift) → `d4eab4af` + PR #523 (Step 7-B) → `172818b7`. 자료 5건 정정 + 단일 jsonl ≠ cross-session 메모리 인식 → Step 7-B 신설로 영구 메모리 자동 보존 의무화. **사용자 결정**: Copy Trading frozen 위반 아님 (main 보존 OK). lesson: 슬래시 커맨드도 PR로 진화 가능, drift grep 시 spec/docs/live/work/active 전 영역 1차 검사 필수.
- [project_session_local_main_sync_20260428.md](project_session_local_main_sync_20260428.md) — **로컬 main divergence fix**. origin=d6893cb8, 로컬 main=7e9e68e0(4-26)에서 멈춤 → backup 브랜치 `local-main-backup-20260428` 생성 후 `git reset --hard origin/main`. 진단 only, 코드/PR 변경 없음. **근본원인: 로컬 main이 fetch만 됐고 fast-forward 안 됨 → 새 worktree 자동생성이 4-26 main 상속 → stale 무한복제(claude/* 10+개).** 다음 세션 첫 동작: `cd /Users/ej/Projects/wtd-v2 && git worktree add .claude/worktrees/W-0254-h07-h08 main -b feat/W-0254-h07-h08`.

## Current State (2026-04-27)

- [project_session_a035_vtrack_merge_20260427.md](project_session_a035_vtrack_merge_20260427.md) — **A035 V-01/02/04/06 4개 PR 머지 완료** + W-0254 설계. main=276dbc4c. 다음 P0: F-02-fix → W-0254 H-07+H-08 레이블 + V-08 pipeline.
- [feedback_pre_end_acceptance_2026_04.md](feedback_pre_end_acceptance_2026_04.md) — **Pre-end 표준 프로토콜**: engine PR 열고 `/end` 직전 실데이터 acceptance + perf profiling + dependency side-effect 5단 검증. unit pytest green ≠ 성능 OK.
- [project_charter_frozen_w0132_20260427.md](project_charter_frozen_w0132_20260427.md) — **⚠️ W-0132 copy trading = Frozen** (spec/CHARTER.md §Non-Goals). 아래 04-26 entry 중 "다음: W-0132" 표현은 무효. 현재 P0 = W-0215, F-02-fix.
- [project_session_a036_wave2_complete_20260427.md](project_session_a036_wave2_complete_20260427.md) — **A036 Wave 2 UI 4 + W-0230/W-0232 설계 머지**. PR #375/#381/#383/#386/#390/#392 = 6 PR. main 202ea063 → 2834daad (PR #412 W-0222~W-0240 일괄 포함). Wave 2 완료. 다음 P0 = W-0215 V-00 audit.
- [project_session_pr_cleanup_20260427.md](project_session_pr_cleanup_20260427.md) — **PR cleanup + W-0214 v1.3 lock-in 인지**. main=485ea542. PR #355/#363/#395 closed, #368 머지(W-0223~W-0226 → work/completed/). 새 비전: "MM Pattern Hunting OS". V-00이 P0 1순위 (pattern_search.py 3283줄 audit + augment-only 정책).

## Current State (2026-04-26)

- [project_w0145_complete_20260426.md](project_w0145_complete_20260426.md) — **W-0145 완료**: PR #346 머지. corpus seed-search 40+dim weighted L1 (_signals.py 공유 모듈). main=3ce9cf5d. 다음: W-0132(copy trading P1).
- [project_agent_os_launch_20260426.md](project_agent_os_launch_20260426.md) — **Multi-Agent OS v2 런칭**: PR #335 MERGED → main=c0ab48dc. A001~A008 작업 이력. `./tools/start.sh` 운영 시작.
- [project_agent6_session_20260426.md](W-agent6-session-20260426.md) — **에이전트 6**: worktree 50→5개 정리 + PR #308(W-0211) 리베이스+오픈 + App CI 수리 + PR #314 머지. main=ff5282a2. 다음: W-0132(copy trading P1) → W-0145(corpus 40+차원).
- [project_agent5_session_20260426.md](project_agent5_session_20260426.md) — **에이전트 5**: 브랜치 53개 정리 + PR #287~#290 머지 + CI 수리 + 설계문서(PR #311) 저장. main=b942f346.
- [project_session_worktree_cleanup_20260426.md](project_session_worktree_cleanup_20260426.md) — worktree 정리 상세 기록. main=ff5282a2.
- [project_session_20260426_final.md](project_session_20260426_final.md) — 세션 최종 체크포인트: Cloud Scheduler 5 jobs + GCP cogotchi-00013-c7n + App CI 수리 완료. main=30707d34. 다음: W-0145(corpus 107 symbols) → W-0132(copy trading P1).
- [project_w0211_chart_refactor_complete_20260426.md](project_w0211_chart_refactor_complete_20260426.md) — W-0211 완료: native multi-pane chart + KPI strip + Pine Script engine. PR #298+#302. main=87f44b0b.
- [project_next_design_20260426.md](project_next_design_20260426.md) — 설계문서 위치: work/active/W-next-design-20260426.md (W-0145 + W-0132 실행 계획)
- [project_branch_cleanup_final_20260426.md](project_branch_cleanup_final_20260426.md) — 브랜치 전체 정리 완전 완료. 잔여 6개 처리(4개 삭제, 2개 이미 main). main=092a50de. 미처리 브랜치 0개.
- [project_w0203_w0204_w0205_complete_20260426.md](project_w0203_w0204_w0205_complete_20260426.md) — W-0203/W-0204/W-0205 완료 + PR #292 rebase 머지. active_variant_store 자동 연동 + 3-layer 스코어링 + Gate UI. main=cdefda4d.
- [project_supabase_corpus_backfill_20260426.md](project_supabase_corpus_backfill_20260426.md) — Supabase feature_windows 197→138,915행 backfill 완료. GCP /search/similar 작동 확인. main=87f44b0b.
- [project_app_ci_repair_20260426.md](project_app_ci_repair_20260426.md) — App CI 127→0 TS 에러 수리 (PR #293 머지). 19개 파일 수정.
- [project_w0201_w0202_complete_20260426.md](project_w0201_w0202_complete_20260426.md) — W-0201/W-0202 완료 + PR #291 머지. Engine CI 1448 passed.

## Current State (2026-04-25)

- [project_branch_cleanup_phase2_20260425.md](project_branch_cleanup_phase2_20260425.md) — 2차 브랜치 정리 완료: 53개 감사 → 삭제/push/PR머지. PR #287~#290 충돌 수동 rebase 머지. main=87f44b0b. CI 3개 ✅. 미PR 브랜치 6개 잔여.
- [project_branch_cleanup_ci_repair_20260425.md](project_branch_cleanup_ci_repair_20260425.md) — 브랜치 배치 정리(24개 PR머지 #259~#274) + CI 복구 PR #286 (c5e606f9): MarketLiquidationWindowRecord 추가, _filter_candidate 제거, definition_refs re-export.
- [project_w0210_terminal_viz_layers_2026_04_25.md](project_w0210_terminal_viz_layers_2026_04_25.md) — W-0210 완료 (0433ccd7): 터미널 4-layer viz — AlphaOverlayLayer + WhaleWatchCard + BTC Comparison + NewsFlashBar.
- [project_ci_recovery_20260425.md](project_ci_recovery_20260425.md) — CI 복구 완료 (65765205): 3-agent 충돌 39 failures → 1422 passed.
- [project_p0_p2_engine_infra_2026_04_25.md](project_p0_p2_engine_infra_2026_04_25.md) — P0-P2 엔진 인프라 완료 (PR #281, 61e7ce11): migration runner + corpus bridge + stats engine + context assembler + wiki agent.
- [project_data_architecture_design_2026_04_25.md](project_data_architecture_design_2026_04_25.md) — CTO 전체 데이터 아키텍처 재설계 (세션 C): 10개 CTO 결정 + docs/design/ 11파일.
- [project_w0163_main_ci_recovery_2026_04_25.md](project_w0163_main_ci_recovery_2026_04_25.md) — W-0163: feature_windows dual-backend (SQLite+Supabase) + CI 회복. migration 021 완료.
- [project_arch_improvements_2026_04_25.md](project_arch_improvements_2026_04_25.md) — CTO 아키텍처 감사 + 개선: min-instances, worker hardening, JWT structured logging.
- [project_search_layer_a_upgrade_2026_04_25.md](project_search_layer_a_upgrade_2026_04_25.md) — Layer A 3차원→40+차원 업그레이드: feature_snapshot 우선 + FeatureWindowStore enrichment + weighted L1.

## Copy Trading

- [project_copy_trading_prd_2026_04_22.md](project_copy_trading_prd_2026_04_22.md) — 카피트레이딩 PRD + 기능명세서 완성 (2026-04-22): 4-phase 구현 계획, DB 스키마, API surface, JUDGE-first reputation 설계.

## Current State (2026-04-22)

- [project_w0123_indicator_viz_system_complete_2026_04_22.md](project_w0123_indicator_viz_system_complete_2026_04_22.md) — W-0123 완료 (PR #172): 10 archetype(A-J), AI 검색(fuzzy), TV 토글 UX.
- [project_session_checkpoint_2026_04_22_e.md](project_session_checkpoint_2026_04_22_e.md) — 체크포인트 2026-04-22 (E): PR#167+#173 머지. main=0bc77e94.
- [project_session_checkpoint_2026_04_22_d.md](project_session_checkpoint_2026_04_22_d.md) — 체크포인트 2026-04-22 (D): W-0121/W-0122/W-0125/W-0126 전체 완료.
- [project_session_checkpoint_2026_04_22_c.md](project_session_checkpoint_2026_04_22_c.md) — 체크포인트 2026-04-22 (C): CTO audit 14항목 전체 완료. Founder seeding 11→61건.
- [project_capture_chart_annotations_2026_04_21.md](project_capture_chart_annotations_2026_04_21.md) — W-0120 전체 완료 (2026-04-22): cogotchi APP_ORIGIN fix, Supabase migration 실행.
- [project_w0115_slice23_ws_consolidation_2026_04_21.md](project_w0115_slice23_ws_consolidation_2026_04_21.md) — W-0115 Slice 2+3: TradeMode 중복 WS 제거.
- [project_session_checkpoint_2026_04_22_b.md](project_session_checkpoint_2026_04_22_b.md) — 체크포인트 2026-04-22 (2차): Refinement UI + DB cleanup + live-signals TTL.
- [project_coreloop_flywheel_2026_04_21.md](project_coreloop_flywheel_2026_04_21.md) — 플라이휠 완성 (PR #146): Verdict Inbox UI + Refinement API 4-endpoint.
- [project_w0116_cogochi_flywheel_gcp_2026_04_22.md](project_w0116_cogochi_flywheel_gcp_2026_04_22.md) — W-0116 완료: Svelte 5 state_unsafe_mutation 수정 + JUDGE flywheel + GCP ENGINE_URL.
- [project_w0119_live_chart_complete_2026_04_21.md](project_w0119_live_chart_complete_2026_04_21.md) — W-0119 완료 (PR #140): DataFeed(WS+backoff) + liq sub-pane.
- [project_w0121_accessibility_complete_2026_04_21.md](project_w0121_accessibility_complete_2026_04_21.md) — W-0121 완료 (PR #137): WCAG 2.1 AA, ARIA, 키보드 네비게이션.
- [project_w0118_engine_hardening_complete_2026_04_21.md](project_w0118_engine_hardening_complete_2026_04_21.md) — W-0118 완료 (PR #138): pattern-keyed ML / capture plane / JSON registry / typed ledger.

## Security (W-0162 Complete ✅)

- [project_w0162_p1p2_stability_20260425.md](project_w0162_p1p2_stability_20260425.md) — RS256 서명 검증 + 토큰 블랙리스트 + 메트릭. PR #277 main 머지 완료.
- [project_w0162_complete_summary_2026_04_25.md](project_w0162_complete_summary_2026_04_25.md) — 최종 CTO 리뷰: 1000x 성능 개선, 4.5/5별 아키텍처. PR#253 머지 완료.
- [project_w0162_agent_handoff_2026_04_25.md](project_w0162_agent_handoff_2026_04_25.md) — 에이전트 핸드오프: 설정, P1/P2, 긴급 대응 가이드.
- [project_w0162_jwt_p0_hardening_complete_2026_04_25.md](project_w0162_jwt_p0_hardening_complete_2026_04_25.md) — P0 Hardening: JWKS 캐싱(1000x), Circuit breaker, asyncio.Lock.
- [project_w0162_jwt_complete_2026_04_24.md](project_w0162_jwt_complete_2026_04_24.md) — JWT 구현 완료: 15 routes 마이그레이션, N+1 최적화(500ms→50ms).
- [project_security_m2_error_sanitize_2026_04_21.md](project_security_m2_error_sanitize_2026_04_21.md) — 보안감사 완료 (PR #145): C-1/H-1/M-1/M-2. 14개 라우트 err 노출 제거.
- [project_security_llm_keys_2026_04_21.md](project_security_llm_keys_2026_04_21.md) — 보안강화: /api/cogochi/ 인증게이트(PR#142) + Preview 민감키 격리.

## Design

- [project_indicator_visual_design_2026_04_22.md](project_indicator_visual_design_2026_04_22.md) — 지표 시각화 설계 확정: 10 아키타입(A-J), C SIDEBAR, D PEEK.

## Product / Seeding

- [project_founder_seeding_2026_04_21.md](project_founder_seeding_2026_04_21.md) — Founder seeding 완료: 11→61건 (5 패턴×10건).

## Feedback Rules

- [feedback_design_first_2026_04.md](feedback_design_first_2026_04.md) — 비자명 작업은 항상 설계 문서 먼저, 사용자 검토 후 구현.
- [feedback_current_md_staleness.md](feedback_current_md_staleness.md) — PR 완료 후 반드시 CURRENT.md main SHA 업데이트 + mk.log_event() 필수.
- [feedback_code_style_2026_04.md](feedback_code_style_2026_04.md) — 커밋 시 관련 파일만 선택적 add (unstaged 무관 파일 제외).
- [feedback_parallel_verification_2026_04.md](feedback_parallel_verification_2026_04.md) — Atomic single-axis commits. 축 혼합 금지.
- [feedback_assumed_blocked_2026_04.md](feedback_assumed_blocked_2026_04.md) — "Blocked" 주장 전 30초 grep 체크 필수.
- [feedback_worktree_discipline_2026_04.md](feedback_worktree_discipline_2026_04.md) — worktree 작업 시 항상 worktree path 내부에서만 Edit/commit.

## Reference

- [reference_orderbook_flow_repos.md](reference_orderbook_flow_repos.md) — Book Panel/Trade Tape 구현 레퍼런스: flowsurface PR#63, crypto-orderbook 등
