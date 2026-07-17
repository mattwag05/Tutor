"""Reasoning-content handling for the OpenAI-compatible provider."""

from __future__ import annotations

from types import SimpleNamespace

from deeptutor.services.llm.provider_core.openai_compat_provider import (
    OpenAICompatProvider,
)


def _response_with_reasoning_only():
    message = SimpleNamespace(
        content=None,
        reasoning_content="internal reasoning",
        reasoning=None,
        tool_calls=None,
    )
    return SimpleNamespace(
        choices=[SimpleNamespace(message=message, finish_reason="stop")],
    )


def _reasoning_only_chunk():
    delta = SimpleNamespace(
        content=None,
        reasoning_content="internal reasoning",
        reasoning=None,
        tool_calls=[],
    )
    return SimpleNamespace(
        choices=[SimpleNamespace(delta=delta, finish_reason="stop")],
    )


def test_parse_keeps_reasoning_content_out_of_visible_content() -> None:
    provider = OpenAICompatProvider.__new__(OpenAICompatProvider)

    response = provider._parse(_response_with_reasoning_only())

    assert response.content is None
    assert response.reasoning_content == "internal reasoning"


def test_parse_chunks_keeps_reasoning_content_out_of_visible_content() -> None:
    response = OpenAICompatProvider._parse_chunks([_reasoning_only_chunk()])

    assert response.content is None
    assert response.reasoning_content == "internal reasoning"
