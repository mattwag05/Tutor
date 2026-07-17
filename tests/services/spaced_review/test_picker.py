"""Tests for the spaced-review picker."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
import time
from typing import Any

import pytest
import pytest_asyncio

from deeptutor.services.quiz.models import QuizAttemptCreate
from deeptutor.services.quiz.sqlite_store import SQLiteQuizStore
import deeptutor.services.spaced_review.picker as picker_mod
from deeptutor.services.spaced_review.picker import pick_review_set


@dataclass
class FakeBlock:
    id: str
    title: str = ""
    payload: dict[str, Any] = field(default_factory=dict)


@dataclass
class FakePage:
    id: str
    blocks: list[FakeBlock]

    def block_by_id(self, block_id: str) -> FakeBlock | None:
        for block in self.blocks:
            if block.id == block_id:
                return block
        return None


class FakeBookEngine:
    def __init__(self, pages: dict[tuple[str, str], FakePage]) -> None:
        self._pages = pages

    def load_page(self, book_id: str, page_id: str) -> FakePage | None:
        return self._pages.get((book_id, page_id))


def _quiz_payload(qid: str, *, question: str = "Original Q?", correct: str = "42") -> dict:
    return {
        "questions": [
            {
                "question_id": qid,
                "question": question,
                "question_type": "written",
                "options": {},
                "correct_answer": correct,
                "explanation": "because",
                "difficulty": "medium",
                "concentration": "math",
            }
        ]
    }


def _web_payload(
    *,
    question: str = "Web Q?",
    correct: str = "B",
    qtype: str = "multiple-choice",
    concentration: str = "scene title",
) -> dict:
    """Mirrors the shape of `web/app/api/spaced-review/block/route.ts`."""
    return {
        "question": question,
        "options": {"A": "alpha", "B": "beta", "C": "gamma"},
        "correct_answer": correct,
        "explanation": "see scene",
        "question_type": qtype,
        "difficulty": "medium",
        "concentration": concentration,
    }


async def _seed(
    store: SQLiteQuizStore,
    *,
    qid: str,
    source_id: str,
    is_correct: bool,
    age_h: float,
    source: str = "book",
) -> None:
    now_ms = int(time.time() * 1000)
    h = 3_600_000
    await store.record_attempt(
        QuizAttemptCreate(
            source=source,
            source_id=source_id,
            question_id=qid,
            user_answer="wrong",
            is_correct=is_correct,
            earned=0.0 if not is_correct else 1.0,
            ts_ms=now_ms - int(age_h * h),
        )
    )


@pytest_asyncio.fixture
async def seeded(tmp_path: Path, monkeypatch):
    """Quiz store seeded with book attempts; book engine resolves them."""
    store = SQLiteQuizStore(db_path=tmp_path / "quiz.db")

    # 3 wrong attempts >24h old, 1 wrong but <24h, 1 correct >24h.
    await _seed(store, qid="qA", source_id="bookX::page1::blkA", is_correct=False, age_h=48)
    await _seed(store, qid="qA", source_id="bookX::page1::blkA", is_correct=False, age_h=72)
    await _seed(store, qid="qB", source_id="bookX::page1::blkB", is_correct=False, age_h=30)
    await _seed(store, qid="qC", source_id="bookX::page1::blkC", is_correct=False, age_h=2)
    await _seed(store, qid="qD", source_id="bookX::page1::blkD", is_correct=True, age_h=48)

    pages = {
        ("bookX", "page1"): FakePage(
            id="page1",
            blocks=[
                FakeBlock(id="blkA", title="Block A", payload=_quiz_payload("qA")),
                FakeBlock(id="blkB", title="Block B", payload=_quiz_payload("qB")),
                FakeBlock(id="blkC", title="Block C", payload=_quiz_payload("qC")),
                FakeBlock(id="blkD", title="Block D", payload=_quiz_payload("qD")),
            ],
        )
    }

    monkeypatch.setattr(picker_mod, "get_quiz_store", lambda: store)
    monkeypatch.setattr(picker_mod, "get_book_engine", lambda: FakeBookEngine(pages))
    return store


@pytest.mark.asyncio
async def test_filters_to_wrong_old_attempts(seeded) -> None:
    candidates = await pick_review_set()
    qids = [c.question_id for c in candidates]
    # qA (wrong, old, 2x) and qB (wrong, old, 1x) only. qC too recent, qD correct.
    assert set(qids) == {"qA", "qB"}


@pytest.mark.asyncio
async def test_failure_count_drives_ranking(seeded) -> None:
    candidates = await pick_review_set()
    # qA failed twice, qB once -> qA scored higher and ranked first.
    assert candidates[0].question_id == "qA"
    assert candidates[0].failure_count == 2
    assert candidates[1].question_id == "qB"
    assert candidates[1].failure_count == 1


@pytest.mark.asyncio
async def test_payload_resolution_populates_original_fields(seeded) -> None:
    candidates = await pick_review_set()
    qa = next(c for c in candidates if c.question_id == "qA")
    assert qa.original_question == "Original Q?"
    assert qa.original_correct_answer == "42"
    assert qa.original_question_type == "written"
    assert qa.original_concentration == "math"
    assert qa.book_id == "bookX"
    assert qa.page_id == "page1"
    assert qa.block_id == "blkA"
    assert qa.source == "book"
    assert qa.source_id == "bookX::page1::blkA"


@pytest.mark.asyncio
async def test_limit_caps_returned_set(seeded) -> None:
    candidates = await pick_review_set(limit=1)
    assert len(candidates) == 1
    assert candidates[0].question_id == "qA"  # highest-ranked


@pytest.mark.asyncio
async def test_skips_when_block_missing(tmp_path: Path, monkeypatch) -> None:
    """If the block can no longer be loaded, the candidate is dropped silently."""
    store = SQLiteQuizStore(db_path=tmp_path / "quiz.db")
    await _seed(store, qid="qZ", source_id="bookY::page1::blkGONE", is_correct=False, age_h=48)
    monkeypatch.setattr(picker_mod, "get_quiz_store", lambda: store)
    monkeypatch.setattr(picker_mod, "get_book_engine", lambda: FakeBookEngine({}))

    assert await pick_review_set() == []


@pytest.mark.asyncio
async def test_malformed_source_id_skipped(tmp_path: Path, monkeypatch) -> None:
    store = SQLiteQuizStore(db_path=tmp_path / "quiz.db")
    await _seed(store, qid="qZ", source_id="not-properly-shaped", is_correct=False, age_h=48)
    monkeypatch.setattr(picker_mod, "get_quiz_store", lambda: store)
    monkeypatch.setattr(picker_mod, "get_book_engine", lambda: FakeBookEngine({}))

    assert await pick_review_set() == []


@pytest.mark.asyncio
async def test_question_id_falls_back_to_first_in_block(tmp_path: Path, monkeypatch) -> None:
    """Engine writes attempts with question_id == block_id when no specific qid is set.
    The picker should still resolve the block's first question payload."""
    store = SQLiteQuizStore(db_path=tmp_path / "quiz.db")
    await _seed(
        store,
        qid="blkA",  # equals block_id, no per-question id was set
        source_id="bookX::page1::blkA",
        is_correct=False,
        age_h=48,
    )
    pages = {
        ("bookX", "page1"): FakePage(
            id="page1",
            blocks=[FakeBlock(id="blkA", payload=_quiz_payload("qInner"))],
        )
    }
    monkeypatch.setattr(picker_mod, "get_quiz_store", lambda: store)
    monkeypatch.setattr(picker_mod, "get_book_engine", lambda: FakeBookEngine(pages))

    candidates = await pick_review_set()
    assert len(candidates) == 1
    assert candidates[0].original_question == "Original Q?"


@pytest.mark.asyncio
async def test_empty_when_no_wrong_attempts(tmp_path: Path, monkeypatch) -> None:
    store = SQLiteQuizStore(db_path=tmp_path / "quiz.db")
    monkeypatch.setattr(picker_mod, "get_quiz_store", lambda: store)
    monkeypatch.setattr(picker_mod, "get_book_engine", lambda: FakeBookEngine({}))
    assert await pick_review_set() == []


# ---------- Multi-source dispatch (book + course) ----------


def _patch_web_lookup(monkeypatch, responses: dict[tuple[str, str], dict | None]):
    """Monkeypatch picker_mod.fetch_block_content to return canned dicts
    keyed on (source, source_id). Missing keys return None (mirrors the
    real client's HTTP-error fallback)."""

    async def _fake(source, source_id, *, client=None):
        return responses.get((source, source_id))

    monkeypatch.setattr(picker_mod, "fetch_block_content", _fake)


@pytest.mark.asyncio
async def test_legacy_classroom_rows_are_never_picked(tmp_path: Path, monkeypatch) -> None:
    """Classroom was retired; leftover review_state rows with that source
    must be ignored by the picker (it only queries ReviewSource values)."""
    store = SQLiteQuizStore(db_path=tmp_path / "quiz.db")
    await _seed(
        store,
        qid="q1",
        source_id="classA::scene1::q1",
        is_correct=False,
        age_h=48,
        source="classroom",
    )
    monkeypatch.setattr(picker_mod, "get_quiz_store", lambda: store)
    monkeypatch.setattr(picker_mod, "get_book_engine", lambda: FakeBookEngine({}))
    _patch_web_lookup(
        monkeypatch,
        {
            ("classroom", "classA::scene1::q1"): _web_payload(
                question="What is alpha?", concentration="Scene 1"
            )
        },
    )

    assert await pick_review_set() == []


@pytest.mark.asyncio
async def test_picks_course_attempts(tmp_path: Path, monkeypatch) -> None:
    store = SQLiteQuizStore(db_path=tmp_path / "quiz.db")
    await _seed(
        store,
        qid="blk7",
        source_id="courseZ::sec3::blk7",
        is_correct=False,
        age_h=72,
        source="course",
    )
    monkeypatch.setattr(picker_mod, "get_quiz_store", lambda: store)
    monkeypatch.setattr(picker_mod, "get_book_engine", lambda: FakeBookEngine({}))
    _patch_web_lookup(
        monkeypatch,
        {
            ("course", "courseZ::sec3::blk7"): _web_payload(
                question="Fill the blank: ___",
                qtype="fill-in-the-blank",
                concentration="Section 3",
            )
        },
    )

    candidates = await pick_review_set()
    assert len(candidates) == 1
    c = candidates[0]
    assert c.source == "course"
    assert c.source_id == "courseZ::sec3::blk7"
    assert c.book_id == "courseZ"
    assert c.page_id == "sec3"
    assert c.block_id == "blk7"
    assert c.original_question_type == "fill-in-the-blank"
    assert c.original_concentration == "Section 3"


@pytest.mark.asyncio
async def test_mixed_sources_ranked_together(tmp_path: Path, monkeypatch) -> None:
    """Book + course both feed the same picker; ordering is by
    next_due_ms (most-overdue first), independent of source."""
    store = SQLiteQuizStore(db_path=tmp_path / "quiz.db")
    # Book attempt 30h old → next_due ~ 6h overdue.
    await _seed(store, qid="qB", source_id="bookX::page1::blkB", is_correct=False, age_h=30)
    # Course attempt 50h old → next_due ~ 26h overdue (most overdue).
    await _seed(
        store,
        qid="qD",
        source_id="courseZ::sec1::qD",
        is_correct=False,
        age_h=50,
        source="course",
    )

    pages = {
        ("bookX", "page1"): FakePage(
            id="page1",
            blocks=[FakeBlock(id="blkB", payload=_quiz_payload("qB"))],
        )
    }
    monkeypatch.setattr(picker_mod, "get_quiz_store", lambda: store)
    monkeypatch.setattr(picker_mod, "get_book_engine", lambda: FakeBookEngine(pages))
    _patch_web_lookup(
        monkeypatch,
        {
            ("course", "courseZ::sec1::qD"): _web_payload(question="crs"),
        },
    )

    candidates = await pick_review_set()
    assert [c.question_id for c in candidates] == ["qD", "qB"]
    assert [c.source for c in candidates] == ["course", "book"]


@pytest.mark.asyncio
async def test_non_book_drops_when_web_lookup_returns_none(tmp_path: Path, monkeypatch) -> None:
    """Web lookup miss (deleted course, web/ unreachable) → silent drop."""
    store = SQLiteQuizStore(db_path=tmp_path / "quiz.db")
    await _seed(
        store,
        qid="qX",
        source_id="courseZ::secGONE::qX",
        is_correct=False,
        age_h=48,
        source="course",
    )
    monkeypatch.setattr(picker_mod, "get_quiz_store", lambda: store)
    monkeypatch.setattr(picker_mod, "get_book_engine", lambda: FakeBookEngine({}))
    _patch_web_lookup(monkeypatch, {})  # any lookup returns None

    assert await pick_review_set() == []
