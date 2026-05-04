"""Tests for the unified QuizAttempt SQLite store."""

from __future__ import annotations

from pathlib import Path

import pytest

from deeptutor.services.quiz.models import QuizAttemptCreate
from deeptutor.services.quiz.sqlite_store import SQLiteQuizStore


@pytest.fixture
def store(tmp_path: Path) -> SQLiteQuizStore:
    return SQLiteQuizStore(db_path=tmp_path / "quiz.db")


def _payload(**overrides) -> QuizAttemptCreate:
    base = {
        "source": "classroom",
        "source_id": "scene-1",
        "question_id": "q1",
        "user_answer": "A",
        "is_correct": True,
        "earned": 1.0,
        "ai_comment": "",
        "ts_ms": 1_000,
    }
    base.update(overrides)
    return QuizAttemptCreate(**base)


@pytest.mark.asyncio
async def test_record_assigns_id_and_persists_fields(store: SQLiteQuizStore) -> None:
    attempt = await store.record_attempt(_payload(user_answer="hello"))
    assert attempt.id and len(attempt.id) == 32
    assert attempt.user_answer == "hello"
    assert attempt.is_correct is True

    retrieved = await store.list_attempts(source="classroom")
    assert len(retrieved) == 1
    assert retrieved[0].id == attempt.id
    assert retrieved[0].user_answer == "hello"


@pytest.mark.asyncio
async def test_list_filters_by_correctness_and_source(store: SQLiteQuizStore) -> None:
    await store.record_attempt(_payload(question_id="q1", is_correct=True, ts_ms=100))
    await store.record_attempt(_payload(question_id="q2", is_correct=False, ts_ms=200))
    await store.record_attempt(
        _payload(source="book", source_id="b::p::blk", question_id="q3", is_correct=False, ts_ms=300)
    )

    incorrect_classroom = await store.list_attempts(source="classroom", is_correct=False)
    assert len(incorrect_classroom) == 1
    assert incorrect_classroom[0].question_id == "q2"

    book_only = await store.list_attempts(source="book")
    assert len(book_only) == 1
    assert book_only[0].source_id == "b::p::blk"


@pytest.mark.asyncio
async def test_list_orders_by_ts_desc_and_respects_limit(store: SQLiteQuizStore) -> None:
    for ts in (100, 300, 200):
        await store.record_attempt(_payload(question_id=f"q{ts}", ts_ms=ts))

    rows = await store.list_attempts(limit=2)
    assert [r.ts_ms for r in rows] == [300, 200]


@pytest.mark.asyncio
async def test_older_than_filter(store: SQLiteQuizStore) -> None:
    await store.record_attempt(_payload(question_id="recent", ts_ms=1_000_000))
    await store.record_attempt(_payload(question_id="old", ts_ms=1_000))

    old = await store.list_attempts(older_than_ms=500_000)
    assert len(old) == 1
    assert old[0].question_id == "old"


@pytest.mark.asyncio
async def test_ungraded_attempts_round_trip_as_none(store: SQLiteQuizStore) -> None:
    await store.record_attempt(_payload(question_id="ungraded", is_correct=None))
    rows = await store.list_attempts(source="classroom")
    assert rows[0].is_correct is None


@pytest.mark.asyncio
async def test_count_by_status(store: SQLiteQuizStore) -> None:
    await store.record_attempt(_payload(question_id="q1", is_correct=True))
    await store.record_attempt(_payload(question_id="q2", is_correct=True))
    await store.record_attempt(_payload(question_id="q3", is_correct=False))
    await store.record_attempt(_payload(question_id="q4", is_correct=None))

    stats = await store.count_by_status()
    assert stats == {"correct": 2, "incorrect": 1, "ungraded": 1}


def test_initialize_creates_indexes(tmp_path: Path) -> None:
    import sqlite3

    store = SQLiteQuizStore(db_path=tmp_path / "quiz.db")
    with sqlite3.connect(store.db_path) as conn:
        rows = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='quiz_attempts'"
        ).fetchall()
    names = {row[0] for row in rows}
    assert {
        "idx_qa_source",
        "idx_qa_ts",
        "idx_qa_correctness",
        "idx_qa_source_correct",
    } <= names
