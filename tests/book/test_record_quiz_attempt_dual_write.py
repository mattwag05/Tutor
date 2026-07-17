"""Confirm BookEngine.record_quiz_attempt writes to the unified store.

The unified deeptutor/services/quiz SQLite store is the single source of truth
for individual attempts (read via /api/v1/quiz/attempts; powers the spaced-review
picker, PRD §6.5). Progress no longer stores per-attempt rows — only the derived
weak_chapters/score (DeepTutor-dd1). This test mocks BookStorage and verifies a
row lands in the unified store with the expected source / source_id / ts_ms shape
and that Progress still tracks score, even when the unified write fails.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from deeptutor.book.engine import BookEngine
from deeptutor.book.models import Progress
from deeptutor.services.quiz import sqlite_store as quiz_store_mod
from deeptutor.services.quiz.sqlite_store import SQLiteQuizStore


class _StubStorage:
    def __init__(self) -> None:
        self.saved: list[Progress] = []
        self._progress = Progress(book_id="bk1")

    def load_progress(self, book_id: str) -> Progress:
        return self._progress

    def save_progress(self, progress: Progress) -> None:
        self.saved.append(progress)

    def load_page(self, book_id: str, page_id: str):
        return None

    def list_book_ids(self):
        return []

    def append_log(self, *args, **kwargs) -> None:
        return None


@pytest.fixture
def patched_quiz_store(tmp_path: Path) -> SQLiteQuizStore:
    quiz_store_mod.reset_quiz_store()
    store = SQLiteQuizStore(db_path=tmp_path / "quiz.db")
    quiz_store_mod._singleton = store
    yield store
    quiz_store_mod.reset_quiz_store()


@pytest.mark.asyncio
async def test_dual_write_records_unified_attempt(patched_quiz_store: SQLiteQuizStore) -> None:
    engine = BookEngine.__new__(BookEngine)
    engine.storage = _StubStorage()

    progress = await engine.record_quiz_attempt(
        book_id="bk1",
        page_id="pg1",
        block_id="blk1",
        question_id="q1",
        user_answer="A",
        is_correct=True,
    )

    # Individual attempts are no longer stored on Progress — only score/weak_chapters.
    assert not hasattr(progress, "quiz_attempts")
    assert progress.score == 1

    rows = await patched_quiz_store.list_attempts(source="book")
    assert len(rows) == 1
    row = rows[0]
    assert row.source == "book"
    assert row.source_id == "bk1::pg1::blk1"
    assert row.question_id == "q1"
    assert row.is_correct is True
    assert row.earned == 1.0
    assert row.ts_ms > 0


@pytest.mark.asyncio
async def test_dual_write_falls_back_to_block_id_when_question_id_blank(
    patched_quiz_store: SQLiteQuizStore,
) -> None:
    engine = BookEngine.__new__(BookEngine)
    engine.storage = _StubStorage()

    await engine.record_quiz_attempt(
        book_id="bk1",
        page_id="pg1",
        block_id="blk-fallback",
        question_id="",
        user_answer="",
        is_correct=False,
    )

    rows = await patched_quiz_store.list_attempts(source="book")
    assert rows[0].question_id == "blk-fallback"
    assert rows[0].is_correct is False
    assert rows[0].earned == 0.0


@pytest.mark.asyncio
async def test_progress_score_succeeds_when_unified_store_raises(
    patched_quiz_store: SQLiteQuizStore, monkeypatch
) -> None:
    async def _boom(payload):
        raise RuntimeError("simulated unified-store failure")

    monkeypatch.setattr(patched_quiz_store, "record_attempt", _boom)

    engine = BookEngine.__new__(BookEngine)
    engine.storage = _StubStorage()

    progress = await engine.record_quiz_attempt(
        book_id="bk1",
        page_id="pg1",
        block_id="blk1",
        question_id="q1",
        user_answer="A",
        is_correct=True,
    )

    # The Progress score update must survive a unified-store failure.
    assert progress.score == 1
    assert not hasattr(progress, "quiz_attempts")
