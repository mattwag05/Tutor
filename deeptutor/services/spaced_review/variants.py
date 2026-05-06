"""Generate fresh micro-quiz variants from review candidates by reusing
the existing question Generator agent. No new agent, no agents.yaml
change — Generator's ``previous_questions`` slot keeps variants from
duplicating the original."""

from __future__ import annotations

import asyncio
import logging
from typing import Awaitable, Callable
import uuid

from deeptutor.agents.question.agents.generator import Generator
from deeptutor.agents.question.models import QAPair, QuestionTemplate
from deeptutor.services.spaced_review.models import ReviewCandidate, VariantQuestion

logger = logging.getLogger(__name__)

# Concurrency cap on simultaneous Generator.process() calls. Each call is one
# LLM round-trip; OpenRouter / Anthropic enforce per-key rate limits, and
# blowing past them returns 429s that surface as failed variants. 4 is the
# tested ceiling that holds under Pi-class hardware on the default key.
_MAX_CONCURRENCY = 4


def _build_template(candidate: ReviewCandidate) -> QuestionTemplate:
    concentration = (
        candidate.original_concentration
        or candidate.original_question[:200]
    )
    return QuestionTemplate(
        question_id=f"sr_{uuid.uuid4().hex[:10]}",
        concentration=concentration,
        question_type=candidate.original_question_type,
        difficulty=candidate.original_difficulty,
        source="spaced-review",
        reference_question=candidate.original_question,
        reference_answer=candidate.original_correct_answer or None,  # coerce "" → None so Generator treats it as absent
        metadata={
            "variant_of": candidate.question_id,
            "user_prior_answer": candidate.last_user_answer,
            "book_id": candidate.book_id,
            "page_id": candidate.page_id,
            "block_id": candidate.block_id,
        },
    )


def _qa_to_variant(
    pair: QAPair,
    *,
    source_question_id: str,
    source_id: str,
    fallback_difficulty: str,
) -> VariantQuestion:
    options = pair.options if isinstance(pair.options, dict) else {}
    return VariantQuestion(
        question_id=pair.question_id,
        source_question_id=source_question_id,
        source_id=source_id,
        question=pair.question,
        question_type=pair.question_type or "written",
        options={str(k): str(v) for k, v in options.items()},
        correct_answer=pair.correct_answer or "",
        explanation=pair.explanation or "",
        difficulty=pair.difficulty or fallback_difficulty,
    )


# Type alias: a callable that returns a fresh Generator instance. Tests
# inject a stub; production uses the default factory below.
GeneratorFactory = Callable[[], Generator]


def _default_generator_factory() -> Generator:
    return Generator(language="en")


async def generate_variants(
    candidates: list[ReviewCandidate],
    *,
    generator_factory: GeneratorFactory | None = None,
    process_override: (
        Callable[[Generator, QuestionTemplate, list[str]], Awaitable[QAPair]] | None
    ) = None,
) -> list[VariantQuestion]:
    if not candidates:
        return []

    factory = generator_factory or _default_generator_factory
    generator = factory()
    semaphore = asyncio.Semaphore(_MAX_CONCURRENCY)

    async def _generate_one(candidate: ReviewCandidate) -> VariantQuestion | None:
        template = _build_template(candidate)
        previous = (
            [candidate.original_question] if candidate.original_question else None
        )
        async with semaphore:
            try:
                if process_override is not None:
                    pair = await process_override(generator, template, previous or [])
                else:
                    pair = await generator.process(
                        template=template,
                        user_topic=candidate.original_concentration or "",
                        preference="",
                        history_context="",
                        previous_questions=previous,
                    )
            except Exception as exc:
                logger.warning(
                    "variant generation failed for %s: %s",
                    candidate.question_id,
                    exc,
                )
                return None
        if not pair.question:
            return None
        candidate_source_id = (
            f"{candidate.book_id}::{candidate.page_id}::{candidate.block_id}"
        )
        return _qa_to_variant(
            pair,
            source_question_id=candidate.question_id,
            source_id=candidate_source_id,
            fallback_difficulty=candidate.original_difficulty,
        )

    results = await asyncio.gather(*(_generate_one(c) for c in candidates))
    return [v for v in results if v is not None]
