"""Background pre-warm loop for spaced-review variant cache.

Without pre-warm, the first Notebook visit each day pays a 15-30s wait
while ``GET /api/v1/spaced-review/today`` runs ``pick_review_set`` and
``generate_variants`` end-to-end. This module schedules that work to
run at 04:00 UTC daily so by the time the user opens Notebook in the
morning, the cache row is already ``ready``.

Wired into FastAPI lifespan in ``deeptutor/api/main.py``. Idempotent
against the existing on-demand path: pre-warm uses the same
``store.claim_generating`` guard so a manual hit at 03:59 UTC won't
race the scheduled hit at 04:00.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
import logging
import time

from deeptutor.services.spaced_review.cache import get_cache_store
from deeptutor.services.spaced_review.picker import pick_review_set
from deeptutor.services.spaced_review.variants import generate_variants

logger = logging.getLogger(__name__)

PREWARM_HOUR_UTC = 4  # 04:00 UTC ≈ 21:00 PT / 24:00 ET — late enough for
# attempts during yesterday's evening study session to land in the
# >24h-old window the picker queries.

# Settable in tests so the loop doesn't actually sleep until 4am UTC.
_TEST_OVERRIDE_DELAY_SECONDS: float | None = None


def _seconds_until_next_prewarm(now: datetime | None = None) -> float:
    now = now or datetime.now(tz=timezone.utc)
    target = now.replace(hour=PREWARM_HOUR_UTC, minute=0, second=0, microsecond=0)
    if target <= now:
        target = target + timedelta(days=1)
    return (target - now).total_seconds()


async def _prewarm_today() -> None:
    """One-shot: claim today's slot and generate if won. Mirrors the
    on-demand path in ``api/routers/spaced_review.py`` but does NOT short-
    circuit on a cache hit — we want to keep firing daily so the row stays
    fresh even if a user already triggered generation."""
    date = datetime.now(tz=timezone.utc).strftime("%Y-%m-%d")
    store = get_cache_store()
    generated_ms = int(time.time() * 1000)

    # Single-flight: only the first claimer for this UTC date proceeds.
    # If the route handler beat us to it, skip — their generation will
    # land in the same row.
    claimed = await store.claim_generating(date, generated_ms)
    if not claimed:
        logger.info("spaced-review pre-warm: %s already claimed; skipping", date)
        return

    async def _finalize(status: str, items: list) -> None:
        await store.upsert(date=date, status=status, items=items, generated_ms=generated_ms)

    try:
        candidates = await pick_review_set()
        if not candidates:
            await _finalize("empty", [])
            logger.info("spaced-review pre-warm: %s has no candidates", date)
            return
        variants = await generate_variants(candidates)
        await _finalize("ready" if variants else "empty", variants)
        logger.info("spaced-review pre-warm: %s ready (%d variants)", date, len(variants))
    except Exception as exc:
        logger.exception("spaced-review pre-warm failed for %s: %s", date, exc)
        await _finalize("empty", [])


async def prewarm_loop() -> None:
    """Run forever: sleep until 04:00 UTC, pre-warm, sleep until next
    04:00 UTC, repeat. Cancelled on lifespan shutdown — asyncio.sleep
    is awaitable-cancellable, so the cancel propagates immediately
    even mid-sleep."""
    while True:
        delay = _TEST_OVERRIDE_DELAY_SECONDS if _TEST_OVERRIDE_DELAY_SECONDS is not None else _seconds_until_next_prewarm()
        try:
            await asyncio.sleep(delay)
        except asyncio.CancelledError:
            logger.info("spaced-review pre-warm loop cancelled during sleep")
            raise
        await _prewarm_today()
