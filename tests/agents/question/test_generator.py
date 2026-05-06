from __future__ import annotations

import pytest

from deeptutor.agents.question.agents.generator import Generator
from deeptutor.agents.question.models import QuestionTemplate


class StubGenerator(Generator):
    def __init__(self, repaired_payload: dict | None = None) -> None:
        self._repaired_payload = repaired_payload or {}

    async def _repair_payload(self, **kwargs):  # type: ignore[override]
        return self._repaired_payload


@pytest.mark.asyncio
async def test_generator_repairs_coding_question_that_looks_like_multiple_choice() -> None:
    generator = StubGenerator(
        repaired_payload={
            "question_type": "coding",
            "question": "Write pseudocode that alternates answer order across iterations to mitigate positional bias.",
            "options": None,
            "correct_answer": 'for i in range(total_iterations):\n    if i % 2 == 0:\n        prompt = f"{query} Answer 1: {answer1} Answer 2: {answer2}"\n    else:\n        prompt = f"{query} Answer 1: {answer2} Answer 2: {answer1}"\n    evaluate(prompt)',
            "explanation": "Alternate the two answers deterministically so each appears in each position equally often.",
        }
    )
    template = QuestionTemplate(
        question_id="q_3",
        concentration="win-rate comparison positional bias mitigation",
        question_type="coding",
        difficulty="hard",
    )
    invalid_payload = {
        "question_type": "coding",
        "question": "Select the code logic that best mitigates positional bias across iterations.",
        "options": {
            "A": "fixed order",
            "B": "alternate order every iteration",
            "C": "randomize order",
            "D": "always reverse order",
        },
        "correct_answer": "B",
        "explanation": "B is correct.",
    }

    normalized, validation = await generator._validate_and_repair_payload(
        template=template,
        payload=invalid_payload,
        user_topic="win-rate comparison",
        preference="",
        history_context="",
        knowledge_context="",
        available_tools="(no tools available)",
    )

    assert normalized["question_type"] == "coding"
    assert normalized["options"] is None
    assert normalized["correct_answer"].startswith("for i in range")
    assert validation["repaired"] is True
    assert validation["schema_ok"] is True
    assert validation["issues"] == []


def test_generator_normalizes_choice_answer_from_option_text() -> None:
    payload = Generator._normalize_payload_shape(
        "choice",
        {
            "question_type": "choice",
            "question": "Which option is correct?",
            "options": {
                "a": "Alpha",
                "b": "Beta",
                "c": "Gamma",
                "d": "Delta",
            },
            "correct_answer": "Gamma",
            "explanation": "Because gamma matches the requirement.",
        },
    )

    assert payload["options"] == {
        "A": "Alpha",
        "B": "Beta",
        "C": "Gamma",
        "D": "Delta",
    }
    assert payload["correct_answer"] == "C"


@pytest.mark.asyncio
async def test_generator_passes_temperature_override_through_to_llm_stages() -> None:
    """Locks in the DeepTutor-3k5 contract: a per-call temperature passed to
    Generator.process must propagate to both ``_generate_payload`` (initial
    draft) AND ``_validate_and_repair_payload`` (validation/repair). Without
    this, spaced-review's high-temperature retry would diversify the draft
    only to have any subsequent repair call fall back to the agents.yaml
    default — defeating the divergence."""

    captured: dict[str, float | None] = {}

    class CaptureGenerator(Generator):
        def __init__(self) -> None:
            # Skip BaseAgent's full init (config loading); set just what
            # process() touches before it hits our override stages.
            self.kb_name = None
            self.tool_flags = {}
            self._tool_registry = None  # type: ignore[assignment]

        def _build_available_tools_text(self) -> str:  # type: ignore[override]
            return ""

        async def _generate_payload(self, **kwargs):  # type: ignore[override]
            captured["generate"] = kwargs.get("temperature")
            return {
                "question_type": "written",
                "question": "ok",
                "correct_answer": "ok",
                "explanation": "ok",
            }

        async def _validate_and_repair_payload(self, **kwargs):  # type: ignore[override]
            captured["validate"] = kwargs.get("temperature")
            return kwargs["payload"], {"repaired": False, "schema_ok": True, "issues": []}

    template = QuestionTemplate(
        question_id="q_temp",
        concentration="anything",
        question_type="written",
        difficulty="easy",
    )
    await CaptureGenerator().process(template=template, temperature=0.95)

    assert captured["generate"] == 0.95, "override must reach _generate_payload"
    assert captured["validate"] == 0.95, "override must reach _validate_and_repair_payload"


@pytest.mark.asyncio
async def test_generator_temperature_defaults_to_none_when_unspecified() -> None:
    """When no override is passed, the value flowing through is None — which
    BaseAgent.stream_llm interprets as 'use agents.yaml default'. Locks in
    that this is an opt-in, not a behavior change for existing callers."""

    captured: dict[str, object] = {"generate": "unset", "validate": "unset"}

    class CaptureGenerator(Generator):
        def __init__(self) -> None:
            # Skip BaseAgent's full init (config loading); set just what
            # process() touches before it hits our override stages.
            self.kb_name = None
            self.tool_flags = {}
            self._tool_registry = None  # type: ignore[assignment]

        def _build_available_tools_text(self) -> str:  # type: ignore[override]
            return ""

        async def _generate_payload(self, **kwargs):  # type: ignore[override]
            captured["generate"] = kwargs.get("temperature")
            return {
                "question_type": "written",
                "question": "ok",
                "correct_answer": "ok",
                "explanation": "ok",
            }

        async def _validate_and_repair_payload(self, **kwargs):  # type: ignore[override]
            captured["validate"] = kwargs.get("temperature")
            return kwargs["payload"], {"repaired": False, "schema_ok": True, "issues": []}

    template = QuestionTemplate(
        question_id="q_temp_none",
        concentration="anything",
        question_type="written",
        difficulty="easy",
    )
    await CaptureGenerator().process(template=template)

    assert captured["generate"] is None
    assert captured["validate"] is None
