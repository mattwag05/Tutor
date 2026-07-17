"""Pick due review items from the Leitner ``review_state`` table and
join them with their original block payload to build review candidates.

Sources dispatched:
    book   -> ``BookEngine.load_page(book_id, page_id).block_by_id(block_id)``
    course -> ``GET /api/spaced-review/block`` via ``web_lookup.fetch_block_content``

Source-id format (set at record time):
    book:   ``"{book_id}::{page_id}::{block_id}"``
    course: ``"{course_id}::{section_id}::{block_id}"``

Legacy ``classroom`` rows may still exist in ``review_state``; the
retired source is no longer in ``ReviewSource`` so they are never
queried.

The picker queries ``review_state`` per source for rows where
``next_due_ms <= now`` (most-overdue first), merges them, and hydrates
each into a ``ReviewCandidate``. Rows whose source content is no longer
resolvable (book deleted, course block removed, web/ unreachable)
are silently dropped — the user shouldn't see ghost
questions whose context is gone.
"""

from __future__ import annotations

import logging
import time
from typing import get_args

import httpx

from deeptutor.book import get_book_engine
from deeptutor.services.quiz import get_quiz_store
from deeptutor.services.spaced_review.models import ReviewCandidate, ReviewSource
from deeptutor.services.spaced_review.web_lookup import (
    LOOKUP_TIMEOUT_S,
    fetch_block_content,
)

logger = logging.getLogger(__name__)

_ALL_SOURCES: tuple[str, ...] = get_args(ReviewSource)


def _parse_source_id(source_id: str) -> tuple[str, str, str] | None:
    parts = source_id.split("::", 2)
    if len(parts) != 3 or not all(parts):
        return None
    return parts[0], parts[1], parts[2]


def _resolve_question_payload(block_payload: dict, target_question_id: str) -> dict | None:
    """A book QUIZ block holds ``payload["questions"]: [...]``. Match by
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


def _build_candidate(
    *, row: dict, parsed: tuple[str, str, str], payload: dict, fallback_title: str = ""
) -> ReviewCandidate:
    options_raw = payload.get("options") or {}
    options = (
        {str(k): str(v) for k, v in options_raw.items()} if isinstance(options_raw, dict) else {}
    )
    a_id, b_id, c_id = parsed
    return ReviewCandidate(
        source=row["source"],
        source_id=row["source_id"],
        book_id=a_id,
        page_id=b_id,
        block_id=c_id,
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
        original_concentration=str(payload.get("concentration") or fallback_title),
    )


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
    merged_rows: list[dict] = []
    for src in _ALL_SOURCES:
        merged_rows.extend(
            await store.list_due_review(source=src, now_ms=now_ms, limit=candidate_pool)
        )
    if not merged_rows:
        return []

    # Match per-source ordering (most-overdue first). Ties broken by
    # higher failure_count first so a thrice-failed question outranks a
    # once-failed one with the same next_due_ms.
    merged_rows.sort(key=lambda r: (r["next_due_ms"], -r["failure_count"]))
    merged_rows = merged_rows[:candidate_pool]

    engine = get_book_engine()
    page_cache: dict[tuple[str, str], object] = {}
    candidates: list[ReviewCandidate] = []

    async with httpx.AsyncClient(timeout=LOOKUP_TIMEOUT_S) as http_client:
        for row in merged_rows:
            if len(candidates) >= limit:
                break
            parsed = _parse_source_id(row["source_id"])
            if parsed is None:
                logger.debug("skip malformed source_id %s", row["source_id"])
                continue

            src = row["source"]
            fallback_title = ""
            if src == "book":
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
                fallback_title = getattr(block, "title", "") or ""
            else:
                # web/ returns the question dict directly (no `questions` wrapping).
                payload = await fetch_block_content(src, row["source_id"], client=http_client)

            if not payload or not payload.get("question"):
                continue
            candidates.append(
                _build_candidate(
                    row=row,
                    parsed=parsed,
                    payload=payload,
                    fallback_title=fallback_title,
                )
            )
    return candidates
