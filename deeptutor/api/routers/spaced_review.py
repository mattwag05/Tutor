"""Spaced-review HTTP route (PRD §6.5).

``GET /api/v1/spaced-review/today`` is the only endpoint. First hit per
UTC day kicks off background generation and returns ``status="generating"``
immediately; subsequent hits return the cached result.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
import logging
import time

from fastapi import APIRouter

from deeptutor.services.spaced_review import (
    generate_variants,
    get_cache_store,
    pick_review_set,
)
from deeptutor.services.spaced_review.models import SpacedReviewResponse, VariantQuestion

logger = logging.getLogger(__name__)

router = APIRouter()


def _today_utc() -> str:
    return datetime.now(tz=timezone.utc).strftime("%Y-%m-%d")


async def _generate_and_cache(date: str) -> None:
    store = get_cache_store()
    try:
        candidates = await pick_review_set()
        if not candidates:
            await store.upsert(
                date=date,
                status="empty",
                items=[],
                generated_ms=int(time.time() * 1000),
            )
            return
        variants = await generate_variants(candidates)
        status = "ready" if variants else "empty"
        await store.upsert(
            date=date,
            status=status,
            items=variants,
            generated_ms=int(time.time() * 1000),
        )
    except Exception as exc:
        logger.exception("spaced-review generation failed: %s", exc)
        # Mark empty so the next request retries by claiming again only
        # on a later UTC date. Recovery on demand is acceptable for v1.
        await store.upsert(
            date=date,
            status="empty",
            items=[],
            generated_ms=int(time.time() * 1000),
        )


@router.get("/today", response_model=SpacedReviewResponse)
async def get_todays_review() -> SpacedReviewResponse:
    date = _today_utc()
    store = get_cache_store()

    cached = await store.get(date)
    if cached is not None:
        return cached.to_response()

    claimed = await store.claim_generating(date, int(time.time() * 1000))
    if claimed:
        asyncio.create_task(_generate_and_cache(date))

    return SpacedReviewResponse(date=date, status="generating", items=[])


# Re-exported for tests that need to seed the cache directly.
__all__ = ["router", "VariantQuestion", "_generate_and_cache", "_today_utc"]
