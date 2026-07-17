"""Tests for the spaced-review SQLite cache."""

from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from deeptutor.services.spaced_review.cache import SpacedReviewCacheStore
from deeptutor.services.spaced_review.models import VariantQuestion


@pytest.fixture
def store(tmp_path: Path) -> SpacedReviewCacheStore:
    return SpacedReviewCacheStore(db_path=tmp_path / "cache.db")


def _variant(qid: str = "v1") -> VariantQuestion:
    return VariantQuestion(
        question_id=qid,
        source_question_id="orig",
        question="What is 2+2?",
        question_type="written",
        correct_answer="4",
        explanation="addition",
        difficulty="easy",
    )


@pytest.mark.asyncio
async def test_round_trip_ready(store: SpacedReviewCacheStore) -> None:
    await store.upsert(date="2026-05-04", status="ready", items=[_variant()], generated_ms=1000)
    cached = await store.get("2026-05-04")
    assert cached is not None
    assert cached.status == "ready"
    assert cached.date == "2026-05-04"
    assert len(cached.items) == 1
    assert cached.items[0].question == "What is 2+2?"
    assert cached.generated_ms == 1000


@pytest.mark.asyncio
async def test_round_trip_empty_status(store: SpacedReviewCacheStore) -> None:
    await store.upsert(date="2026-05-04", status="empty", items=[], generated_ms=2000)
    cached = await store.get("2026-05-04")
    assert cached is not None
    assert cached.status == "empty"
    assert cached.items == []


@pytest.mark.asyncio
async def test_get_missing_returns_none(store: SpacedReviewCacheStore) -> None:
    assert await store.get("1999-01-01") is None


@pytest.mark.asyncio
async def test_upsert_replaces_existing_row(store: SpacedReviewCacheStore) -> None:
    await store.upsert(date="2026-05-04", status="generating", items=[], generated_ms=10)
    await store.upsert(
        date="2026-05-04", status="ready", items=[_variant("v2")], generated_ms=20
    )
    cached = await store.get("2026-05-04")
    assert cached is not None
    assert cached.status == "ready"
    assert cached.items[0].question_id == "v2"
    assert cached.generated_ms == 20


@pytest.mark.asyncio
async def test_eviction_keeps_last_seven_days(store: SpacedReviewCacheStore) -> None:
    dates = [f"2026-05-{day:02d}" for day in range(1, 11)]
    for ts, date in enumerate(dates):
        await store.upsert(date=date, status="empty", items=[], generated_ms=ts)
    surviving = []
    for date in dates:
        if await store.get(date) is not None:
            surviving.append(date)
    # Latest 7 dates remain.
    assert surviving == dates[-7:]
    assert await store.get(dates[0]) is None


@pytest.mark.asyncio
async def test_claim_generating_is_first_writer_wins(store: SpacedReviewCacheStore) -> None:
    first = await store.claim_generating("2026-05-04", 100)
    second = await store.claim_generating("2026-05-04", 200)
    assert first is True
    assert second is False
    cached = await store.get("2026-05-04")
    assert cached is not None
    assert cached.status == "generating"
    assert cached.generated_ms == 100  # first writer's timestamp wins


@pytest.mark.asyncio
async def test_claim_then_upsert_finalizes(store: SpacedReviewCacheStore) -> None:
    await store.claim_generating("2026-05-04", 100)
    await store.upsert(
        date="2026-05-04", status="ready", items=[_variant()], generated_ms=200
    )
    cached = await store.get("2026-05-04")
    assert cached is not None
    assert cached.status == "ready"
    assert len(cached.items) == 1


@pytest.mark.asyncio
async def test_concurrent_claims_only_one_wins(store: SpacedReviewCacheStore) -> None:
    results = await asyncio.gather(
        store.claim_generating("2026-05-04", 1),
        store.claim_generating("2026-05-04", 2),
        store.claim_generating("2026-05-04", 3),
    )
    assert sum(1 for r in results if r) == 1
