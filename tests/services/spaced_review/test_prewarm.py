"""Tests for the spaced-review pre-warm loop (DeepTutor-ybu)."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest

from deeptutor.services.spaced_review import prewarm


def test_seconds_until_next_prewarm_before_target() -> None:
    """At 03:00 UTC, the next 04:00 UTC fire is 60 minutes out."""
    now = datetime(2026, 5, 5, 3, 0, 0, tzinfo=timezone.utc)
    assert prewarm._seconds_until_next_prewarm(now) == 60 * 60


def test_seconds_until_next_prewarm_after_target_rolls_to_next_day() -> None:
    """At 05:00 UTC, the next 04:00 UTC fire is 23 hours out (tomorrow)."""
    now = datetime(2026, 5, 5, 5, 0, 0, tzinfo=timezone.utc)
    assert prewarm._seconds_until_next_prewarm(now) == 23 * 60 * 60


def test_seconds_until_next_prewarm_exactly_at_target_rolls_forward() -> None:
    """At exactly 04:00:00 UTC, target <= now, so we roll to tomorrow's
    04:00. Locks in the >= boundary — without it, the loop could fire
    twice in immediate succession when started at 04:00 sharp."""
    now = datetime(2026, 5, 5, 4, 0, 0, tzinfo=timezone.utc)
    assert prewarm._seconds_until_next_prewarm(now) == 24 * 60 * 60


@pytest.mark.asyncio
async def test_prewarm_today_skips_when_already_claimed() -> None:
    """If the route handler already claimed today's slot (claim_generating
    returns False for the second caller), pre-warm exits early without
    calling pick_review_set or generate_variants."""
    fake_store = AsyncMock()
    fake_store.claim_generating.return_value = False

    with patch("deeptutor.services.spaced_review.prewarm.get_cache_store", return_value=fake_store), \
         patch("deeptutor.services.spaced_review.prewarm.pick_review_set", new=AsyncMock()) as picker, \
         patch("deeptutor.services.spaced_review.prewarm.generate_variants", new=AsyncMock()) as gen:
        await prewarm._prewarm_today()

    fake_store.claim_generating.assert_called_once()
    picker.assert_not_called()
    gen.assert_not_called()
    fake_store.upsert.assert_not_called()


@pytest.mark.asyncio
async def test_prewarm_today_finalizes_empty_when_no_candidates() -> None:
    fake_store = AsyncMock()
    fake_store.claim_generating.return_value = True

    with patch("deeptutor.services.spaced_review.prewarm.get_cache_store", return_value=fake_store), \
         patch("deeptutor.services.spaced_review.prewarm.pick_review_set", new=AsyncMock(return_value=[])), \
         patch("deeptutor.services.spaced_review.prewarm.generate_variants", new=AsyncMock()) as gen:
        await prewarm._prewarm_today()

    gen.assert_not_called()  # short-circuit: no candidates → no LLM calls
    fake_store.upsert.assert_called_once()
    kwargs = fake_store.upsert.call_args.kwargs
    assert kwargs["status"] == "empty"
    assert kwargs["items"] == []


@pytest.mark.asyncio
async def test_prewarm_today_finalizes_ready_when_variants_generated() -> None:
    fake_store = AsyncMock()
    fake_store.claim_generating.return_value = True

    fake_candidates = [object()]
    fake_variants = [object(), object()]

    with patch("deeptutor.services.spaced_review.prewarm.get_cache_store", return_value=fake_store), \
         patch("deeptutor.services.spaced_review.prewarm.pick_review_set", new=AsyncMock(return_value=fake_candidates)), \
         patch("deeptutor.services.spaced_review.prewarm.generate_variants", new=AsyncMock(return_value=fake_variants)):
        await prewarm._prewarm_today()

    fake_store.upsert.assert_called_once()
    kwargs = fake_store.upsert.call_args.kwargs
    assert kwargs["status"] == "ready"
    assert kwargs["items"] is fake_variants


@pytest.mark.asyncio
async def test_prewarm_today_marks_empty_on_picker_exception() -> None:
    """If pick_review_set raises, the pre-warm path catches it and marks
    the cache row 'empty' rather than leaving 'generating' stuck. Locks
    in that the recovery path matches the route handler's contract."""
    fake_store = AsyncMock()
    fake_store.claim_generating.return_value = True

    with patch("deeptutor.services.spaced_review.prewarm.get_cache_store", return_value=fake_store), \
         patch("deeptutor.services.spaced_review.prewarm.pick_review_set", new=AsyncMock(side_effect=RuntimeError("DB exploded"))), \
         patch("deeptutor.services.spaced_review.prewarm.generate_variants", new=AsyncMock()):
        await prewarm._prewarm_today()

    fake_store.upsert.assert_called_once()
    kwargs = fake_store.upsert.call_args.kwargs
    assert kwargs["status"] == "empty"


@pytest.mark.asyncio
async def test_prewarm_loop_cancellable_during_sleep() -> None:
    """The lifespan shutdown path cancels the prewarm task. The loop
    must propagate the CancelledError out of asyncio.sleep so the
    cancellation is observable to lifespan's `await prewarm_task`."""
    # Set a long sleep so we're guaranteed to cancel during sleep.
    original = prewarm._TEST_OVERRIDE_DELAY_SECONDS
    prewarm._TEST_OVERRIDE_DELAY_SECONDS = 60.0
    try:
        task = asyncio.create_task(prewarm.prewarm_loop())
        await asyncio.sleep(0.01)  # let the task enter sleep()
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
    finally:
        prewarm._TEST_OVERRIDE_DELAY_SECONDS = original
