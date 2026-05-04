"""Tool call / result pydantic models for the agent conversation engine."""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel


class ToolCall(BaseModel):
    tool_name: str
    tool_input: dict[str, Any]
    tool_use_id: str


class ToolResult(BaseModel):
    tool_use_id: str
    content: str  # JSON-serialised result
    is_error: bool = False


class ConversationMessage(BaseModel):
    role: str  # "user" | "assistant" | "tool_result"
    content: str | list[Any]  # str for user/assistant, list for tool blocks
