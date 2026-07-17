"""Tests for POST/GET /api/v1/quiz/attempts (Phase B.6)."""

from __future__ import annotations

import importlib
from pathlib import Path

import pytest

try:
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
except Exception:  # pragma: no cover - lightweight test env
    FastAPI = None
    TestClient = None

pytestmark = pytest.mark.skipif(
    FastAPI is None or TestClient is None, reason="fastapi not installed"
)


@pytest.fixture
def client(tmp_path: Path) -> TestClient:
    quiz_module = importlib.import_module("deeptutor.api.routers.quiz")
    sqlite_module = importlib.import_module("deeptutor.services.quiz.sqlite_store")

    sqlite_module.reset_quiz_store()
    sqlite_module._singleton = sqlite_module.SQLiteQuizStore(db_path=tmp_path / "quiz.db")

    app = FastAPI()
    app.include_router(quiz_module.router, prefix="/api/v1/quiz")
    try:
        yield TestClient(app)
    finally:
        sqlite_module.reset_quiz_store()


def _attempt(**overrides):
    base = {
        "source": "classroom",
        "source_id": "scene-1",
        "question_id": "q1",
        "user_answer": "A",
        "is_correct": True,
        "earned": 1.0,
        "ts_ms": 1_000,
    }
    base.update(overrides)
    return base


def test_post_returns_id_and_persists(client: TestClient) -> None:
    response = client.post("/api/v1/quiz/attempts", json=_attempt())
    assert response.status_code == 200
    body = response.json()
    assert body["id"] and len(body["id"]) == 32
    assert body["source"] == "classroom"

    listed = client.get("/api/v1/quiz/attempts").json()
    assert len(listed) == 1
    assert listed[0]["id"] == body["id"]


def test_get_filters_combine(client: TestClient) -> None:
    client.post("/api/v1/quiz/attempts", json=_attempt(question_id="q1", is_correct=True))
    client.post("/api/v1/quiz/attempts", json=_attempt(question_id="q2", is_correct=False))
    client.post(
        "/api/v1/quiz/attempts",
        json=_attempt(source="book", source_id="b::p::blk", question_id="q3", is_correct=False),
    )

    resp = client.get(
        "/api/v1/quiz/attempts",
        params={"source": "classroom", "is_correct": "false"},
    )
    assert resp.status_code == 200
    rows = resp.json()
    assert len(rows) == 1
    assert rows[0]["question_id"] == "q2"


def test_post_rejects_invalid_source(client: TestClient) -> None:
    response = client.post(
        "/api/v1/quiz/attempts", json=_attempt(source="not-a-source")
    )
    assert response.status_code == 422


def test_post_rejects_empty_source_id(client: TestClient) -> None:
    response = client.post("/api/v1/quiz/attempts", json=_attempt(source_id=""))
    assert response.status_code == 422


def test_get_limit_clamps_to_max(client: TestClient) -> None:
    response = client.get("/api/v1/quiz/attempts", params={"limit": 9999})
    assert response.status_code == 422


def test_get_older_than_filter(client: TestClient) -> None:
    client.post("/api/v1/quiz/attempts", json=_attempt(question_id="old", ts_ms=100))
    client.post("/api/v1/quiz/attempts", json=_attempt(question_id="new", ts_ms=10_000))

    rows = client.get(
        "/api/v1/quiz/attempts", params={"older_than_ms": 1_000}
    ).json()
    assert len(rows) == 1
    assert rows[0]["question_id"] == "old"


def test_stats_endpoint(client: TestClient) -> None:
    client.post("/api/v1/quiz/attempts", json=_attempt(question_id="a", is_correct=True))
    client.post("/api/v1/quiz/attempts", json=_attempt(question_id="b", is_correct=False))

    stats = client.get("/api/v1/quiz/stats").json()
    assert stats == {"correct": 1, "incorrect": 1, "ungraded": 0}
