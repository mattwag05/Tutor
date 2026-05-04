"""Generic quiz attempt API.

Mounted at ``/api/v1/quiz``. The ``POST`` endpoint is the unified write
path used by OpenMAIC (classroom / course) and the book route shim;
``GET`` powers the future spaced-review picker (PRD §6.5).
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Query

from deeptutor.services.quiz import (
    QuizAttempt,
    QuizAttemptCreate,
    QuizSource,
    get_quiz_store,
)

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/attempts", response_model=QuizAttempt)
async def create_attempt(payload: QuizAttemptCreate) -> QuizAttempt:
    store = get_quiz_store()
    try:
        return await store.record_attempt(payload)
    except Exception as exc:  # noqa: BLE001
        logger.error("create_attempt failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/attempts", response_model=list[QuizAttempt])
async def list_attempts(
    source: QuizSource | None = Query(default=None),
    source_id: str | None = Query(default=None),
    is_correct: bool | None = Query(default=None),
    older_than_ms: int | None = Query(default=None, ge=0),
    newer_than_ms: int | None = Query(default=None, ge=0),
    limit: int = Query(default=100, ge=1, le=1000),
) -> list[QuizAttempt]:
    store = get_quiz_store()
    return await store.list_attempts(
        source=source,
        source_id=source_id,
        is_correct=is_correct,
        older_than_ms=older_than_ms,
        newer_than_ms=newer_than_ms,
        limit=limit,
    )


@router.get("/stats")
async def stats() -> dict[str, int]:
    store = get_quiz_store()
    return await store.count_by_status()
