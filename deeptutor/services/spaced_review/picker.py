"""Pick wrong attempts from the unified QuizAttempt store and join with
the original BookEngine block payload to build review candidates.

v1 scope: ``source="book"`` only. classroom/course attempts have their
content in OpenMAIC and need a separate lookup path; deferred to a
follow-up bead.

Source-id format for book attempts (set in ``BookEngine.record_quiz_attempt``):
    ``"{book_id}::{page_id}::{block_id}"``
"""

from __future__ import annotations

from collections import Counter
import logging
import math
import time

from deeptutor.book import get_book_engine
from deeptutor.services.quiz import QuizAttempt, get_quiz_store
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
        source="book",
        is_correct=False,
        older_than_ms=cutoff_ms,
        limit=candidate_pool,
    )
    if not raw:
        return []

    # Latest wrong attempt per question_id (the list is already ts_ms DESC).
    latest_by_question: dict[str, QuizAttempt] = {}
    for attempt in raw:
        latest_by_question.setdefault(attempt.question_id, attempt)

    failure_counts = Counter(a.question_id for a in raw)

    scored: list[tuple[float, QuizAttempt]] = []
    for question_id, attempt in latest_by_question.items():
        age_hours = (now_ms - attempt.ts_ms) / 3_600_000
        scored.append(
            (_score(failure_counts[question_id], age_hours), attempt)
        )
    scored.sort(key=lambda pair: pair[0], reverse=True)

    engine = get_book_engine()
    candidates: list[ReviewCandidate] = []
    for _score_value, attempt in scored:
        if len(candidates) >= limit:
            break
        parsed = _parse_source_id(attempt.source_id)
        if parsed is None:
            logger.debug("skip malformed source_id %s", attempt.source_id)
            continue
        book_id, page_id, block_id = parsed
        page = engine.load_page(book_id, page_id)
        if page is None:
            continue
        block = page.block_by_id(block_id)
        if block is None or not block.payload:
            continue
        payload = _resolve_question_payload(block.payload, attempt.question_id)
        if not payload or not payload.get("question"):
            continue

        options_raw = payload.get("options") or {}
        options = (
            {str(k): str(v) for k, v in options_raw.items()}
            if isinstance(options_raw, dict)
            else {}
        )

        candidates.append(
            ReviewCandidate(
                book_id=book_id,
                page_id=page_id,
                block_id=block_id,
                question_id=attempt.question_id,
                last_user_answer=attempt.user_answer,
                failure_count=failure_counts[attempt.question_id],
                last_attempt_ts_ms=attempt.ts_ms,
                original_question=str(payload.get("question", "")),
                original_options=options,
                original_correct_answer=str(payload.get("correct_answer", "")),
                original_explanation=str(payload.get("explanation", "")),
                original_question_type=str(payload.get("question_type") or "written"),
                original_difficulty=str(payload.get("difficulty") or "medium"),
                original_concentration=str(payload.get("concentration") or block.title or ""),
            )
        )
    return candidates
