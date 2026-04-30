# W-0310 — Local LLM + Hugging Face Model Runtime

> Wave: user-requested | Priority: P1 | Effort: S
> Status: 🟣 PR Open — #638
> Created: 2026-04-29
> Issue: #637

## Goal

사용자가 Hugging Face 모델 URL이나 로컬 Ollama 모델명을 기준으로 DOUNI와 engine parser를 로컬/자체 런타임에서 실행할 수 있게 한다.

## Owner

contract

## Scope

- Engine `/patterns/parse`에서 Claude 고정을 제거하고 `ENGINE_LLM_PROVIDER=ollama|openai-compatible|anthropic` 런타임을 사용한다.
- App DOUNI `OLLAMA` 모드는 Settings의 endpoint/model을 실제 스트리밍 호출에 사용한다.
- Hugging Face 원본 모델과 실행 런타임(Ollama/GGUF/MLX/vLLM/SGLang)을 분리해 runbook에 명확히 적는다.
- 로컬 endpoint는 loopback만 허용해 SSRF를 막는다.

## Non-Goals

- 브라우저에서 임의 shell download/pull 실행.
- 60GB+ 모델 자동 다운로드.
- DeepSeek V4/MiniMax 대형 실험 모델을 기본값으로 설정.
- Ollama tool-calling 구현.

## Canonical Files

- `engine/api/routes/patterns.py`
- `engine/agents/llm_runtime.py`
- `engine/tests/test_parser.py`
- `app/src/routes/api/cogochi/terminal/message/+server.ts`
- `app/src/lib/server/localLlm.ts`
- `app/src/lib/server/localLlm.test.ts`
- `docs/runbooks/local-llm-runtime.md`

## Facts

1. `engine/agents/llm_runtime.py`는 이미 `anthropic`, `ollama`, `openai-compatible` adapter를 제공한다.
2. `engine/api/routes/patterns.py`의 `/patterns/parse`는 아직 `_call_claude()`와 `ANTHROPIC_API_KEY`에 고정되어 있다.
3. App Settings는 `OLLAMA` endpoint/model을 저장하지만 terminal route의 tool loop는 `ollama`를 제외한다.
4. `google/gemma-4-31B-it`는 Hugging Face 원본 모델 repo이며, Ollama model tag 자체가 아니다.

## Assumptions

- M0에서는 사용자 PC에 이미 Ollama/llama.cpp/vLLM/SGLang/MLX 서버가 떠 있다고 가정한다.
- HF gated model/token 수락은 앱 밖에서 사용자가 처리한다.
- 로컬 parser 품질은 작은 모델보다 30B급 이상에서 좋아질 수 있으나, schema validation이 최종 truth다.

## Open Questions

- HF URL을 Settings UI에서 직접 저장할지, M0에서는 runbook/모델명 입력만으로 충분한지.
- GGUF/MLX community quant repo 검색을 자동화할지.

## Decisions

- [D-0310-1] `/patterns/parse`는 provider-neutral adapter를 호출하고 `PatternDraftBody` validation은 유지한다.
- [D-0310-2] DOUNI `OLLAMA`는 tool loop를 우회하고 OpenAI-compatible `/v1/chat/completions`로 직접 스트리밍한다.
- [D-0310-3] HF URL은 실행 가능한 모델명이 아니라 모델 source ref다. 앱은 source를 서버 명령으로 직접 실행하지 않는다.

## Next Steps

1. 실제 앱 서버에서 Settings -> AI -> OLLAMA 테스트 버튼 smoke.
2. HF URL/quant repo를 Settings UI에 저장할지 별도 work item으로 결정.
3. Hosted web app에서 사용자 노트북 Ollama를 쓰는 browser-side bridge 설계.

## Exit Criteria

- `ENGINE_LLM_PROVIDER=ollama|openai-compatible`가 `/patterns/parse` 호출 경로에서 동작한다.
- `OLLAMA` mode가 Settings endpoint/model을 사용해 DOUNI 응답을 스트리밍한다.
- loopback 외 endpoint는 reject된다.
- Gemma 같은 HF model ref를 로컬 런타임에 연결하는 절차가 문서화된다.

## Handoff Checklist

- [x] Engine parser tests pass.
- [x] App local LLM tests pass.
- [x] `npm run check` pass or known pre-existing warnings only.
- [x] 실제 Ollama smoke 결과 기록.
