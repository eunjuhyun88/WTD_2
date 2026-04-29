# Local LLM Runtime

Purpose: let Cogochi run user-facing LLM features without cloud API keys during
local development or self-hosted use.

## Supported Paths

| Path | Best for | Engine provider |
|---|---|---|
| Ollama | simplest local install | `ollama` |
| llama.cpp server | GGUF models, Mac/CPU/GPU mixed setups | `openai-compatible` |
| vLLM / SGLang / MLX OpenAI server | rented GPU or Mac MLX serving | `openai-compatible` |
| Anthropic | hosted production fallback | `anthropic` |

The app already has DOUNI runtime modes (`TERMINAL`, `HEURISTIC`, `OLLAMA`,
`API`). This runbook covers engine-side calls such as `POST /patterns/parse`.

For the DOUNI terminal, use Settings -> AI -> `OLLAMA`, then set:

- endpoint: `http://localhost:11434`
- model: the local model name, for example `qwen3:8b`

The app route only accepts loopback Ollama endpoints (`localhost`, `127.0.0.1`,
or `::1`) so a browser-provided setting cannot make the server fetch arbitrary
network URLs.

## Ollama

```bash
ollama serve
ollama pull qwen3:8b

cd engine
ENGINE_LLM_PROVIDER=ollama \
OLLAMA_BASE_URL=http://localhost:11434 \
OLLAMA_MODEL=qwen3:8b \
uv run uvicorn api.main:app --reload
```

Then call the parser through the app or directly:

```bash
curl -s http://localhost:8000/patterns/parse \
  -H 'content-type: application/json' \
  -d '{"text":"BTC 4h에서 OI가 급등했는데 가격은 고점 돌파 실패. CVD는 약하고 펀비는 양수.", "symbol":"BTCUSDT"}'
```

## llama.cpp

```bash
llama-server -m /path/to/model.gguf --port 8080

cd engine
ENGINE_LLM_PROVIDER=openai-compatible \
ENGINE_LLM_BASE_URL=http://localhost:8080/v1 \
ENGINE_LLM_MODEL=local-model \
uv run uvicorn api.main:app --reload
```

## Production Defaults

If `ENGINE_LLM_PROVIDER` is unset:

- `ANTHROPIC_API_KEY` present -> `anthropic`
- otherwise -> `ollama`

Use explicit env vars in production so deploys do not silently switch provider:

```bash
ENGINE_LLM_PROVIDER=anthropic
ENGINE_LLM_MODEL=claude-sonnet-4-5
ANTHROPIC_API_KEY=...
```

## Guardrails

- The LLM only returns prose/JSON. Engine validation remains the source of truth.
- `/patterns/parse` validates every response as `PatternDraftBody`.
- Local models may emit fenced JSON; the parser strips common wrappers and retries
  up to 3 total attempts.
- Tool calling is not enabled for Ollama in the engine parser path. Keep actions
  deterministic and routed through existing engine endpoints.

## Model Notes

Start with a small local model for parser smoke tests, then move up only when
schema compliance is weak. Good minimum target: a model that can reliably return
valid JSON for Korean trading notes.

For larger models, prefer an OpenAI-compatible server so app/engine code stays
unchanged while the backend moves between llama.cpp, vLLM, SGLang, MLX, or a
rented GPU.
