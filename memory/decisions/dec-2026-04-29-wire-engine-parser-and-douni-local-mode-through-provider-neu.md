---
tier: core
decided_at: 2026-04-29T21:02:20
id: dec-2026-04-29-wire-engine-parser-and-douni-local-mode-through-provider-neu
linked_incidents: []
recorded_at: 2026-04-29T21:02:20
source: manual
status: accepted
tags: ["w-0310", "local-llm", "huggingface"]
title: Wire engine parser and DOUNI local mode through provider-neutral local LLM runtime instead of Claude-only parser path
type: decision
valid_from: 2026-04-29T21:02:20
valid_to: null
---
# Wire engine parser and DOUNI local mode through provider-neutral local LLM runtime instead of Claude-only parser path

## What
Wire engine parser and DOUNI local mode through provider-neutral local LLM runtime instead of Claude-only parser path

## Why
User wants Hugging Face/Ollama-style local models usable in product; HF URLs are model source refs while app/engine need runnable OpenAI-compatible endpoints or Ollama tags

## How
Use engine generate_llm_text adapter for /patterns/parse, bypass DOUNI tool loop for OLLAMA, restrict local endpoints to loopback, document Gemma/HF runtime paths

## Outcome

## Linked Incidents
