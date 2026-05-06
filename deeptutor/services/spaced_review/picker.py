"""Pick due review items from the Leitner ``review_state`` table and
join with the original BookEngine block payload to build review
candidates.

v1 scope: ``source="book"`` only. classroom/course attempts have their
content in OpenMAIC and need a separate lookup path; deferred to a
follow-up bead.

Source-id format for book attempts (set in ``BookEngine.record_quiz_attempt``):
    ``"{book_id}::{page_id}::{block_id}"``

The picker queries ``review_state`` for rows where ``next_due_ms <= now``
(in priority of most-overdue first, capped by ``candidate_pool``) and
hydrates each into a ``ReviewCandidate`` by joining with the original
block payload via ``BookEngine``. Rows whose source block is no longer
resolvable (book deleted, page rewritten, block removed) are silently
dropped — the user shouldn't see ghost questions whose context is gone.
"""

from __future__ import annotations

import logging
import time

from deeptutor.book import get_book_engine
from deeptutor.services.quiz import get_quiz_store
from deeptutor.services.spaced_review.models import ReviewCandidate

logger = logging.getLogger(__name__)


def _parse_source_id(source_id: str) -> tuple[str, str, str] | None:
    parts = source_id.split("::", 2)
    if len(parts) != 3 or not all(parts):
        return None
    return parts[0], parts[1], parts[2]


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
    candidate_pool: int = 50,
) -> list[ReviewCandidate]:
    """Return up to ``limit`` due review candidates whose original block
    payload is still resolvable. Candidates without a resolvable block
    are dropped — the user shouldn't see ghost questions."""
    if limit <= 0:
        return []

    now_ms = int(time.time() * 1000)

    store = get_quiz_store()
    due_rows = await store.list_due_review(
        source="book",
        now_ms=now_ms,
        limit=candidate_pool,
    )
    if not due_rows:
        return []

    engine = get_book_engine()
    page_cache: dict[tuple[str, str], object] = {}
    candidates: list[ReviewCandidate] = []
    for row in due_rows:
        if len(candidates) >= limit:
            break
        parsed = _parse_source_id(row["source_id"])
        if parsed is None:
            logger.debug("skip malformed source_id %s", row["source_id"])
            continue
        book_id, page_id, block_id = parsed
        cache_key = (book_id, page_id)
        if cache_key not in page_cache:
            page_cache[cache_key] = engine.load_page(book_id, page_id)
        page = page_cache[cache_key]
        if page is None:
            continue
        block = page.block_by_id(block_id)
        if block is None or not block.payload:
            continue
        payload = _resolve_question_payload(block.payload, row["question_id"])
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
                question_id=row["question_id"],
                last_user_answer=row["last_user_answer"],
                failure_count=row["failure_count"],
                last_attempt_ts_ms=row["last_attempt_ts_ms"],
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
