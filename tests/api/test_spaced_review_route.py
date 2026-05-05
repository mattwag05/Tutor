"""Tests for GET /api/v1/spaced-review/today."""

from __future__ import annotations

import asyncio
import importlib
from pathlib import Path
import time

import pytest

try:
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
except Exception:  # pragma: no cover - lightweight test env
    FastAPI = None
    TestClient = None

from deeptutor.services.spaced_review.models import ReviewCandidate, VariantQuestion

pytestmark = pytest.mark.skipif(
    FastAPI is None or TestClient is None, reason="fastapi not installed"
)


@pytest.fixture
def client(tmp_path: Path, monkeypatch):
    cache_module = importlib.import_module("deeptutor.services.spaced_review.cache")
    route_module = importlib.import_module("deeptutor.api.routers.spaced_review")

    cache_module.reset_cache_store()
    cache_module._singleton = cache_module.SpacedReviewCacheStore(db_path=tmp_path / "cache.db")

    app = FastAPI()
    app.include_router(route_module.router, prefix="/api/v1/spaced-review")
    try:
        yield TestClient(app), route_module
    finally:
        cache_module.reset_cache_store()


def _candidate(qid: str = "qA") -> ReviewCandidate:
    return ReviewCandidate(
        book_id="bookX",
        page_id="page1",
        block_id="blkA",
        question_id=qid,
        last_user_answer="wrong",
        failure_count=1,
        last_attempt_ts_ms=1000,
        original_question="Original?",
        original_correct_answer="A",
        original_explanation="because",
        original_question_type="written",
        original_difficulty="medium",
        original_concentration="topic",
    )


def _variant(qid: str = "v1", source_question_id: str = "qA") -> VariantQuestion:
    return VariantQuestion(
        question_id=qid,
        source_question_id=source_question_id,
        question="Variant?",
        question_type="written",
        correct_answer="B",
        explanation="ok",
        difficulty="medium",
    )


def test_first_call_returns_generating_immediately(client, monkeypatch) -> None:
    test_client, route_module = client

    started = asyncio.Event()
    finish = asyncio.Event()

    async def slow_pick():
        started.set()
        await finish.wait()
        return [_candidate()]

    async def slow_variants(candidates):
        return [_variant()]

    monkeypatch.setattr(route_module, "pick_review_set", slow_pick)
    monkeypatch.setattr(route_module, "generate_variants", slow_variants)

    response = test_client.get("/api/v1/spaced-review/today")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "generating"
    assert body["items"] == []
    assert body["date"]
    finish.set()


def test_full_lifecycle_to_ready(client, monkeypatch) -> None:
    test_client, route_module = client

    async def fake_pick():
        return [_candidate("qA"), _candidate("qB")]

    async def fake_variants(candidates):
        return [
            _variant(f"v-{c.question_id}", source_question_id=c.question_id)
            for c in candidates
        ]

    monkeypatch.setattr(route_module, "pick_review_set", fake_pick)
    monkeypatch.setattr(route_module, "generate_variants", fake_variants)

    test_client.get("/api/v1/spaced-review/today")

    # Drain the background task. Polling for up to 2s.
    async def _poll():
        for _ in range(40):
            response = test_client.get("/api/v1/spaced-review/today")
            body = response.json()
            if body["status"] == "ready":
                return body
            await asyncio.sleep(0.05)
        return body

    body = asyncio.run(_poll())
    assert body["status"] == "ready"
    assert len(body["items"]) == 2
    assert {item["source_question_id"] for item in body["items"]} == {"qA", "qB"}


def test_empty_when_no_candidates(client, monkeypatch) -> None:
    test_client, route_module = client

    async def empty_pick():
        return []

    async def boom_variants(candidates):
        raise AssertionError("should not be called when no candidates")

    monkeypatch.setattr(route_module, "pick_review_set", empty_pick)
    monkeypatch.setattr(route_module, "generate_variants", boom_variants)

    test_client.get("/api/v1/spaced-review/today")

    async def _poll():
        for _ in range(40):
            response = test_client.get("/api/v1/spaced-review/today")
            body = response.json()
            if body["status"] == "empty":
                return body
            await asyncio.sleep(0.05)
        return body

    body = asyncio.run(_poll())
    assert body["status"] == "empty"
    assert body["items"] == []


def test_ready_response_is_cached(client, monkeypatch) -> None:
    test_client, route_module = client

    pick_count = {"n": 0}

    async def counting_pick():
        pick_count["n"] += 1
        return [_candidate()]

    async def fake_variants(candidates):
        return [_variant()]

    monkeypatch.setattr(route_module, "pick_review_set", counting_pick)
    monkeypatch.setattr(route_module, "generate_variants", fake_variants)

    test_client.get("/api/v1/spaced-review/today")

    async def _wait_ready():
        for _ in range(40):
            response = test_client.get("/api/v1/spaced-review/today")
            if response.json()["status"] == "ready":
                return
            await asyncio.sleep(0.05)

    asyncio.run(_wait_ready())
    # Cached: subsequent calls do not re-pick.
    test_client.get("/api/v1/spaced-review/today")
    test_client.get("/api/v1/spaced-review/today")
    assert pick_count["n"] == 1


def test_failure_during_generation_marks_empty(client, monkeypatch) -> None:
    test_client, route_module = client

    async def boom_pick():
        raise RuntimeError("DB exploded")

    monkeypatch.setattr(route_module, "pick_review_set", boom_pick)

    test_client.get("/api/v1/spaced-review/today")

    # Use synchronous polling so time.sleep yields the GIL to TestClient's
    # internal loop where the background task runs. asyncio.run(_poll()) creates
    # a separate event loop whose asyncio.sleep never yields to TestClient's loop.
    body: dict = {"status": "generating"}
    for _ in range(40):
        time.sleep(0.05)
        response = test_client.get("/api/v1/spaced-review/today")
        body = response.json()
        if body["status"] in {"empty", "ready"}:
            break

    assert body["status"] == "empty"
