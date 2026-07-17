"""Generate fresh micro-quiz variants from review candidates by reusing
the existing question Generator agent. No new agent, no agents.yaml
change — Generator's ``previous_questions`` slot keeps variants from
duplicating the original."""

from __future__ import annotations

import asyncio
import logging
import re
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

# Defense-in-depth against near-duplicates the Generator's previous_questions
# slot misses. Token-set Jaccard above this threshold counts as "too similar
# to the original"; we regenerate once, then drop. 0.85 was tuned to flag
# trivial substitutions ("What is the capital of France?" → "What's the
# capital of France?") while letting genuinely fresh rephrasings through.
_JACCARD_DUPLICATE_THRESHOLD = 0.85
_TOKEN_RE = re.compile(r"\w+", re.UNICODE)

# Temperature override used on the retry path when a variant flags as too
# similar. Above the agents.yaml default (0.7) to encourage divergence on
# regeneration. Generator.process accepts a per-call temperature override
# (DeepTutor-3k5) so this stays scoped to the retry, not the main path.
_RETRY_TEMPERATURE = 0.95


def _tokenize(text: str) -> set[str]:
    return {t.lower() for t in _TOKEN_RE.findall(text)}


def _jaccard_token_similarity(a: str, b: str) -> float:
    """Token-set Jaccard. Cheap, no embedding call needed."""
    ta, tb = _tokenize(a), _tokenize(b)
    if not ta or not tb:
        return 0.0
    intersection = len(ta & tb)
    union = len(ta | tb)
    return intersection / union if union else 0.0


def _is_too_similar(variant: str, original: str) -> bool:
    return _jaccard_token_similarity(variant, original) > _JACCARD_DUPLICATE_THRESHOLD


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

    async def _call_once(
        candidate: ReviewCandidate,
        template: QuestionTemplate,
        previous: list[str] | None,
        temperature: float | None = None,
    ) -> QAPair | None:
        try:
            if process_override is not None:
                return await process_override(generator, template, previous or [])
            return await generator.process(
                template=template,
                user_topic=candidate.original_concentration or "",
                preference="",
                history_context="",
                previous_questions=previous,
                temperature=temperature,
            )
        except Exception as exc:
            logger.warning("variant generation call failed: %s", exc)
            return None

    async def _generate_one(candidate: ReviewCandidate) -> VariantQuestion | None:
        template = _build_template(candidate)
        previous = (
            [candidate.original_question] if candidate.original_question else None
        )
        async with semaphore:
            pair = await _call_once(candidate, template, previous)
            if pair and pair.question and _is_too_similar(pair.question, candidate.original_question):
                # Regenerate once with (a) the offending variant added to the
                # previous_questions slot so the Generator avoids it
                # explicitly, and (b) a higher temperature to encourage
                # divergence in the sampling. Both levers together — prompt
                # steer + sampling spread — beat either alone.
                logger.info(
                    "variant for %s too similar to original (jaccard above %.2f); "
                    "regenerating once with temperature=%.2f",
                    candidate.question_id,
                    _JACCARD_DUPLICATE_THRESHOLD,
                    _RETRY_TEMPERATURE,
                )
                retry_previous = list(previous or [])
                retry_previous.append(pair.question)
                retry = await _call_once(
                    candidate, template, retry_previous, temperature=_RETRY_TEMPERATURE
                )
                if retry and retry.question and not _is_too_similar(
                    retry.question, candidate.original_question
                ):
                    pair = retry
                else:
                    logger.info(
                        "variant for %s remained too similar after retry; dropping",
                        candidate.question_id,
                    )
                    return None
        if not pair or not pair.question:
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
