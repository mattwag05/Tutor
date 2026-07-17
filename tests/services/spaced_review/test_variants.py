"""Tests for variant generation."""

from __future__ import annotations

import asyncio

import pytest

from deeptutor.agents.question.models import QAPair, QuestionTemplate
from deeptutor.services.spaced_review.models import ReviewCandidate
from deeptutor.services.spaced_review.variants import generate_variants


def _candidate(qid: str = "q-orig", **overrides) -> ReviewCandidate:
    base = dict(
        book_id="bookX",
        page_id="page1",
        block_id="blkA",
        question_id=qid,
        last_user_answer="42",
        failure_count=2,
        last_attempt_ts_ms=1000,
        original_question="What is the capital of France?",
        original_options={"A": "Paris", "B": "London"},
        original_correct_answer="A",
        original_explanation="Paris has been the capital since 987 AD.",
        original_question_type="choice",
        original_difficulty="easy",
        original_concentration="European geography",
    )
    base.update(overrides)
    return ReviewCandidate(**base)


@pytest.mark.asyncio
async def test_template_metadata_carries_variant_context() -> None:
    captured: list[QuestionTemplate] = []
    captured_previous: list[list[str]] = []

    async def fake_process(generator, template, previous):
        captured.append(template)
        captured_previous.append(previous)
        return QAPair(
            question_id=template.question_id,
            question="What is the capital of Germany?",
            correct_answer="Berlin",
            explanation="Berlin became the unified capital in 1990.",
            question_type="choice",
            options={"A": "Berlin", "B": "Munich"},
            concentration=template.concentration,
            difficulty=template.difficulty,
        )

    candidate = _candidate()
    variants = await generate_variants(
        [candidate],
        generator_factory=lambda: object(),
        process_override=fake_process,
    )

    assert len(captured) == 1
    template = captured[0]
    assert template.source == "spaced-review"
    assert template.reference_question == "What is the capital of France?"
    assert template.reference_answer == "A"
    assert template.metadata["variant_of"] == "q-orig"
    assert template.metadata["user_prior_answer"] == "42"
    assert template.metadata["block_id"] == "blkA"
    assert template.question_type == "choice"
    assert template.difficulty == "easy"
    # Diversity slot carries the original question text.
    assert captured_previous[0] == ["What is the capital of France?"]

    assert len(variants) == 1
    assert variants[0].source_question_id == "q-orig"
    assert variants[0].source_id == "bookX::page1::blkA"
    assert variants[0].question == "What is the capital of Germany?"
    assert variants[0].options == {"A": "Berlin", "B": "Munich"}


@pytest.mark.asyncio
async def test_failed_generation_dropped_silently() -> None:
    async def boom(generator, template, previous):
        raise RuntimeError("LLM offline")

    variants = await generate_variants(
        [_candidate()],
        generator_factory=lambda: object(),
        process_override=boom,
    )
    assert variants == []


@pytest.mark.asyncio
async def test_empty_question_dropped() -> None:
    async def empty(generator, template, previous):
        return QAPair(
            question_id=template.question_id,
            question="",  # empty -> drop
            correct_answer="x",
            explanation="x",
            question_type="written",
        )

    variants = await generate_variants(
        [_candidate()],
        generator_factory=lambda: object(),
        process_override=empty,
    )
    assert variants == []


@pytest.mark.asyncio
async def test_multiple_candidates_each_get_a_variant() -> None:
    async def mirror(generator, template, previous):
        return QAPair(
            question_id=template.question_id,
            question=f"Variant of {template.metadata['variant_of']}",
            correct_answer="ok",
            explanation="ok",
            question_type=template.question_type,
            difficulty=template.difficulty,
        )

    candidates = [
        _candidate("q1"),
        _candidate("q2", original_question="Q2 prompt"),
        _candidate("q3", original_question="Q3 prompt"),
    ]
    variants = await generate_variants(
        candidates,
        generator_factory=lambda: object(),
        process_override=mirror,
    )
    assert {v.source_question_id for v in variants} == {"q1", "q2", "q3"}


@pytest.mark.asyncio
async def test_concentration_falls_back_to_question_prefix() -> None:
    captured: list[QuestionTemplate] = []

    async def cap(generator, template, previous):
        captured.append(template)
        return QAPair(
            question_id=template.question_id,
            question="ok",
            correct_answer="ok",
            explanation="ok",
            question_type="written",
        )

    candidate = _candidate(
        original_concentration="",
        original_question="A very long question about photosynthesis " * 10,
    )
    await generate_variants(
        [candidate],
        generator_factory=lambda: object(),
        process_override=cap,
    )
    assert captured[0].concentration  # non-empty
    assert len(captured[0].concentration) <= 200


@pytest.mark.asyncio
async def test_empty_input_returns_empty() -> None:
    variants = await generate_variants([])
    assert variants == []


@pytest.mark.asyncio
async def test_near_duplicate_variant_triggers_one_retry() -> None:
    """A variant too similar to the original should regenerate once. If the
    retry produces a fresh question, it ships."""
    call_count = 0

    async def near_duplicate_then_fresh(generator, template, previous):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return QAPair(
                question_id=template.question_id,
                question="What is the capital of France?",
                correct_answer="Paris",
                explanation="ok",
                question_type="choice",
            )
        return QAPair(
            question_id=template.question_id,
            question="Which European city has been the seat of French government since 987 AD?",
            correct_answer="Paris",
            explanation="ok",
            question_type="choice",
        )

    variants = await generate_variants(
        [_candidate()],
        generator_factory=lambda: object(),
        process_override=near_duplicate_then_fresh,
    )
    assert call_count == 2, "guard should retry exactly once on near-duplicate"
    assert len(variants) == 1
    assert "987" in variants[0].question


@pytest.mark.asyncio
async def test_persistent_near_duplicate_dropped_after_retry() -> None:
    """If the retry is still too similar, drop the candidate rather than ship
    a duplicate."""
    call_count = 0

    async def always_duplicate(generator, template, previous):
        nonlocal call_count
        call_count += 1
        return QAPair(
            question_id=template.question_id,
            question="What is the capital of France?",
            correct_answer="Paris",
            explanation="ok",
            question_type="choice",
        )

    variants = await generate_variants(
        [_candidate()],
        generator_factory=lambda: object(),
        process_override=always_duplicate,
    )
    assert call_count == 2, "guard should retry once then give up"
    assert variants == []


@pytest.mark.asyncio
async def test_fresh_variant_skips_retry() -> None:
    """A variant clearly different from the original ships on the first call
    without invoking a retry — guard must not double-call the LLM unnecessarily."""
    call_count = 0

    async def fresh(generator, template, previous):
        nonlocal call_count
        call_count += 1
        return QAPair(
            question_id=template.question_id,
            question="Which city served as the seat of the French monarchy from 987 AD?",
            correct_answer="Paris",
            explanation="ok",
            question_type="choice",
        )

    variants = await generate_variants(
        [_candidate()],
        generator_factory=lambda: object(),
        process_override=fresh,
    )
    assert call_count == 1, "no retry should fire when variant is fresh"
    assert len(variants) == 1


@pytest.mark.asyncio
async def test_candidates_run_concurrently_bounded_by_semaphore() -> None:
    """Locks in the parallelism contract: candidates fan out via asyncio.gather
    and the Semaphore caps in-flight calls at _MAX_CONCURRENCY (4)."""
    in_flight = 0
    in_flight_peak = 0

    async def slow(generator, template, previous):
        nonlocal in_flight, in_flight_peak
        in_flight += 1
        in_flight_peak = max(in_flight_peak, in_flight)
        await asyncio.sleep(0.01)
        in_flight -= 1
        return QAPair(
            question_id=template.question_id,
            question="ok",
            correct_answer="ok",
            explanation="ok",
            question_type="written",
        )

    candidates = [_candidate(f"q{i}") for i in range(8)]
    variants = await generate_variants(
        candidates,
        generator_factory=lambda: object(),
        process_override=slow,
    )

    assert len(variants) == 8
    # Sequential would have peak == 1; capped parallel hits the semaphore limit (4).
    assert in_flight_peak > 1, "candidates should run concurrently"
    assert in_flight_peak <= 4, "concurrency should be bounded by the semaphore"
