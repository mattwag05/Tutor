"""Pick wrong attempts from the unified QuizAttempt store and join with
the original block payload to build review candidates.

Supports three sources, each with a 3-part ``::``-separated source_id:
    book      : ``"{book_id}::{page_id}::{block_id}"`` -- resolved
                in-process via ``BookEngine.load_page``.
    classroom : ``"{classroom_id}::{scene_id}::{question_id}"`` --
                resolved over HTTP via ``web_lookup.fetch_block_content``.
    course    : ``"{course_id}::{section_id}::{block_id}"`` -- same.

The classroom/course content lives in ``web/data/{classrooms,courses}/``
which Python can't read natively; the lookup route in
``web/app/api/spaced-review/block/`` normalizes both shapes into the
same question-payload dict.
"""

from __future__ import annotations

import asyncio
from collections import Counter
import logging
import math
import time

import httpx

from deeptutor.book import get_book_engine
from deeptutor.services.quiz import QuizAttempt, get_quiz_store
from deeptutor.services.spaced_review import web_lookup
from deeptutor.services.spaced_review.models import ReviewCandidate

logger = logging.getLogger(__name__)


def _parse_source_id(source_id: str) -> tuple[str, str, str] | None:
    parts = source_id.split("::", 2)
    if len(parts) != 3 or not all(parts):
        return None
    return parts[0], parts[1], parts[2]


def _score(failure_count: int, age_hours: float) -> float:
    """Leitner-style heuristic: longer-ago + more-failed wins."""
    return failure_count * math.log(max(age_hours, 1.0) + 1.0)


def _resolve_question_payload(
    block_payload: dict, target_question_id: str
) -> dict | None:
    """A QUIZ block holds ``payload["questions"]: [...]``. Match by
    question_id, falling back to the first question if the attempt was
    written with question_id == block_id (the engine's default)."""
    questions = block_payload.get("questions") or []
    if not isinstance(questions, list) or not questions:
        return None
    for q in questions:
        if isinstance(q, dict) and q.get("question_id") == target_question_id:
            return q
    first = questions[0]
    return first if isinstance(first, dict) else None


def _options_to_dict(raw: object) -> dict[str, str]:
    if isinstance(raw, dict):
        return {str(k): str(v) for k, v in raw.items()}
    return {}


def _candidate_from_payload(
    *,
    parsed: tuple[str, str, str],
    attempt: QuizAttempt,
    failure_count: int,
    payload: dict,
    fallback_concentration: str = "",
) -> ReviewCandidate | None:
    if not payload.get("question"):
        return None
    one, two, three = parsed
    return ReviewCandidate(
        source=attempt.source,
        source_id=attempt.source_id,
        book_id=one,
        page_id=two,
        block_id=three,
        question_id=attempt.question_id,
        last_user_answer=attempt.user_answer,
        failure_count=failure_count,
        last_attempt_ts_ms=attempt.ts_ms,
        original_question=str(payload.get("question", "")),
        original_options=_options_to_dict(payload.get("options")),
        original_correct_answer=str(payload.get("correct_answer", "")),
        original_explanation=str(payload.get("explanation", "")),
        original_question_type=str(payload.get("question_type") or "written"),
        original_difficulty=str(payload.get("difficulty") or "medium"),
        original_concentration=str(
            payload.get("concentration") or fallback_concentration
        ),
    )


def _resolve_book(
    *,
    parsed: tuple[str, str, str],
    attempt: QuizAttempt,
    failure_count: int,
    page_cache: dict[tuple[str, str], object],
) -> ReviewCandidate | None:
    book_id, page_id, block_id = parsed
    cache_key = (book_id, page_id)
    if cache_key not in page_cache:
        page_cache[cache_key] = get_book_engine().load_page(book_id, page_id)
    page = page_cache[cache_key]
    if page is None:
        return None
    block = page.block_by_id(block_id)
    if block is None or not block.payload:
        return None
    payload = _resolve_question_payload(block.payload, attempt.question_id)
    if not payload:
        return None
    return _candidate_from_payload(
        parsed=parsed,
        attempt=attempt,
        failure_count=failure_count,
        payload=payload,
        fallback_concentration=block.title or "",
    )


async def _resolve_via_web(
    *,
    parsed: tuple[str, str, str],
    attempt: QuizAttempt,
    failure_count: int,
    client: httpx.AsyncClient,
) -> ReviewCandidate | None:
    payload = await web_lookup.fetch_block_content(
        attempt.source, attempt.source_id, client=client
    )
    if payload is None:
        return None
    return _candidate_from_payload(
        parsed=parsed,
        attempt=attempt,
        failure_count=failure_count,
        payload=payload,
    )


async def pick_review_set(
    *,
    limit: int = 8,
    hours: int = 24,
    candidate_pool: int = 50,
) -> list[ReviewCandidate]:
    """Return up to ``limit`` ranked candidates whose original block payload
    is still resolvable. Candidates without a resolvable block are dropped."""
    if limit <= 0:
        return []

    now_ms = int(time.time() * 1000)
    cutoff_ms = now_ms - hours * 3600 * 1000

    store = get_quiz_store()
    raw = await store.list_attempts(
        is_correct=False,
        older_than_ms=cutoff_ms,
        limit=candidate_pool,
    )
    if not raw:
        return []

    # Latest wrong attempt per (source, question_id). Source is in the
    # key so a question_id collision across sources doesn't drop rows.
    latest: dict[tuple[str, str], QuizAttempt] = {}
    for attempt in raw:
        latest.setdefault((attempt.source, attempt.question_id), attempt)

    failure_counts = Counter((a.source, a.question_id) for a in raw)

    scored: list[tuple[float, QuizAttempt]] = []
    for key, attempt in latest.items():
        age_hours = (now_ms - attempt.ts_ms) / 3_600_000
        scored.append((_score(failure_counts[key], age_hours), attempt))
    scored.sort(key=lambda pair: pair[0], reverse=True)

    # Resolve book candidates in-process; gather classroom/course
    # candidates concurrently against a shared client. Worst-case wall
    # time drops from O(N * timeout) to O(timeout).
    page_cache: dict[tuple[str, str], object] = {}
    resolved: list[ReviewCandidate | None] = [None] * len(scored)
    web_tasks: list[tuple[int, asyncio.Future[ReviewCandidate | None]]] = []

    async with httpx.AsyncClient(timeout=web_lookup.LOOKUP_TIMEOUT_S) as client:
        for i, (_, attempt) in enumerate(scored):
            parsed = _parse_source_id(attempt.source_id)
            if parsed is None:
                logger.debug("skip malformed source_id %s", attempt.source_id)
                continue
            failure_count = failure_counts[(attempt.source, attempt.question_id)]
            if attempt.source == "book":
                resolved[i] = _resolve_book(
                    parsed=parsed,
                    attempt=attempt,
                    failure_count=failure_count,
                    page_cache=page_cache,
                )
            elif attempt.source in ("classroom", "course"):
                web_tasks.append(
                    (
                        i,
                        asyncio.ensure_future(
                            _resolve_via_web(
                                parsed=parsed,
                                attempt=attempt,
                                failure_count=failure_count,
                                client=client,
                            )
                        ),
                    )
                )
            else:
                logger.debug("skip unknown source %s", attempt.source)

        for i, task in web_tasks:
            resolved[i] = await task

    return [c for c in resolved if c is not None][:limit]
