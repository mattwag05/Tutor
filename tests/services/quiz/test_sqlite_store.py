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


# ============================================================================
# Leitner box / review_state tests (DeepTutor-0bo)
# ============================================================================


_DAY_MS = 24 * 60 * 60 * 1000


@pytest.mark.asyncio
async def test_first_wrong_attempt_creates_box_1_state(store: SQLiteQuizStore) -> None:
    """A fresh wrong answer lands at box=1 with next_due 1 day out."""
    await store.record_attempt(_payload(is_correct=False, ts_ms=1_000_000))

    due_now = await store.list_due_review(source="classroom", now_ms=2_000_000, limit=10)
    # Not due yet at +1s; box-1 interval is 1 day.
    assert due_now == []

    due_later = await store.list_due_review(
        source="classroom", now_ms=1_000_000 + _DAY_MS + 1, limit=10
    )
    assert len(due_later) == 1
    assert due_later[0]["box"] == 1
    assert due_later[0]["failure_count"] == 1


@pytest.mark.asyncio
async def test_correct_answer_promotes_box_with_cap_at_5(store: SQLiteQuizStore) -> None:
    """Box advances on each correct answer; caps at 5 — sixth correct
    leaves us at 5, not 6."""
    base_ts = 1_000_000
    await store.record_attempt(_payload(is_correct=False, ts_ms=base_ts))

    times = [base_ts + _DAY_MS + 1, base_ts + 5 * _DAY_MS,
             base_ts + 12 * _DAY_MS, base_ts + 30 * _DAY_MS,
             base_ts + 70 * _DAY_MS]
    for i, ts in enumerate(times, start=2):
        await store.record_attempt(_payload(is_correct=True, ts_ms=ts))
        far_future = ts + 100 * _DAY_MS
        due = await store.list_due_review(source="classroom", now_ms=far_future, limit=10)
        assert due[0]["box"] == min(i, 5), f"step {i}: expected box {min(i, 5)}"


@pytest.mark.asyncio
async def test_wrong_answer_resets_to_box_1(store: SQLiteQuizStore) -> None:
    """Standard Leitner penalty: any wrong drops back to box 1, regardless
    of prior progress."""
    base_ts = 1_000_000
    await store.record_attempt(_payload(is_correct=False, ts_ms=base_ts))
    await store.record_attempt(_payload(is_correct=True, ts_ms=base_ts + _DAY_MS + 1))
    await store.record_attempt(_payload(is_correct=True, ts_ms=base_ts + 5 * _DAY_MS))

    far_future = base_ts + 100 * _DAY_MS
    assert (await store.list_due_review(source="classroom", now_ms=far_future, limit=10))[0]["box"] == 3

    await store.record_attempt(_payload(is_correct=False, ts_ms=base_ts + 30 * _DAY_MS))
    due = await store.list_due_review(source="classroom", now_ms=far_future, limit=10)
    assert due[0]["box"] == 1
    assert due[0]["failure_count"] == 2


@pytest.mark.asyncio
async def test_due_query_filters_by_source(store: SQLiteQuizStore) -> None:
    """Book attempts shouldn't leak into a classroom picker call and vice-versa."""
    base_ts = 1_000_000
    await store.record_attempt(_payload(source="book", is_correct=False, ts_ms=base_ts))
    await store.record_attempt(
        _payload(source="classroom", is_correct=False, ts_ms=base_ts, question_id="q2")
    )

    far_future = base_ts + 100 * _DAY_MS
    book_due = await store.list_due_review(source="book", now_ms=far_future, limit=10)
    classroom_due = await store.list_due_review(source="classroom", now_ms=far_future, limit=10)

    assert {r["question_id"] for r in book_due} == {"q1"}
    assert {r["question_id"] for r in classroom_due} == {"q2"}


@pytest.mark.asyncio
async def test_ungraded_attempt_does_not_change_box(store: SQLiteQuizStore) -> None:
    """is_correct=None (e.g. a written answer awaiting AI judgment) refreshes
    last_attempt_ts_ms + last_user_answer but leaves the box unchanged."""
    base_ts = 1_000_000
    await store.record_attempt(_payload(is_correct=False, ts_ms=base_ts))
    await store.record_attempt(_payload(is_correct=True, ts_ms=base_ts + _DAY_MS + 1))

    far_future = base_ts + 100 * _DAY_MS
    box_before = (await store.list_due_review(source="classroom", now_ms=far_future, limit=10))[0]["box"]

    await store.record_attempt(
        _payload(is_correct=None, ts_ms=base_ts + 5 * _DAY_MS, user_answer="thinking...")
    )

    due = await store.list_due_review(source="classroom", now_ms=far_future, limit=10)
    assert due[0]["box"] == box_before, "ungraded attempt must not change box"
    assert due[0]["last_user_answer"] == "thinking..."
