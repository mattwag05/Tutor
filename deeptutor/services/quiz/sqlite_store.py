"""SQLite-backed quiz attempt store.

Holds two tables:

- ``quiz_attempts``: every individual attempt (one row per submit)
- ``review_state``: one row per (source, source_id, question_id) triple
  carrying the Leitner box (1-5) and ``next_due_ms`` for spaced review.
  Updated atomically with each ``record_attempt`` so the picker can
  query "what's due now" without re-deriving from raw attempts.

Inherits from :class:`AsyncSQLiteStore` for the lock + to_thread shape.
"""

from __future__ import annotations

from pathlib import Path
import sqlite3
import uuid

from deeptutor.services.path_service import get_path_service
from deeptutor.services.quiz.models import (
    QuizAttempt,
    QuizAttemptCreate,
    QuizSource,
)
from deeptutor.services.sqlite_base import AsyncSQLiteStore

# Leitner box → days until next review. Box 1 is "missed recently, see
# again tomorrow"; box 5 is "well-mastered, monthly refresh". Tuned for
# study-flow semantics: a single wrong attempt drops you back to box 1
# regardless of prior progress (the standard Leitner penalty).
_BOX_INTERVAL_DAYS = {1: 1, 2: 3, 3: 7, 4: 14, 5: 30}
_MS_PER_DAY = 24 * 60 * 60 * 1000


def _next_due_for_box(box: int, now_ms: int) -> int:
    days = _BOX_INTERVAL_DAYS.get(box, _BOX_INTERVAL_DAYS[1])
    return now_ms + days * _MS_PER_DAY


class SQLiteQuizStore(AsyncSQLiteStore):
    """Persist QuizAttempt rows in a SQLite database."""

    def __init__(self, db_path: Path | None = None) -> None:
        path_service = get_path_service()
        super().__init__(db_path or path_service.get_quiz_db())

    def _initialize(self) -> None:
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA foreign_keys = ON")
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS quiz_attempts (
                    id TEXT PRIMARY KEY,
                    user_id TEXT,
                    source TEXT NOT NULL,
                    source_id TEXT NOT NULL,
                    question_id TEXT NOT NULL,
                    user_answer TEXT NOT NULL DEFAULT '',
                    is_correct INTEGER,
                    earned REAL NOT NULL DEFAULT 0,
                    ai_comment TEXT NOT NULL DEFAULT '',
                    ts_ms INTEGER NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_qa_source
                    ON quiz_attempts(source, source_id);

                CREATE INDEX IF NOT EXISTS idx_qa_ts
                    ON quiz_attempts(ts_ms DESC);

                CREATE INDEX IF NOT EXISTS idx_qa_correctness
                    ON quiz_attempts(is_correct, ts_ms DESC);

                CREATE INDEX IF NOT EXISTS idx_qa_source_correct
                    ON quiz_attempts(source, is_correct, ts_ms DESC);

                CREATE TABLE IF NOT EXISTS review_state (
                    source TEXT NOT NULL,
                    source_id TEXT NOT NULL,
                    question_id TEXT NOT NULL,
                    box INTEGER NOT NULL DEFAULT 1,
                    next_due_ms INTEGER NOT NULL,
                    last_attempt_ts_ms INTEGER NOT NULL,
                    last_user_answer TEXT NOT NULL DEFAULT '',
                    failure_count INTEGER NOT NULL DEFAULT 0,
                    PRIMARY KEY (source, source_id, question_id)
                );

                CREATE INDEX IF NOT EXISTS idx_review_due
                    ON review_state(source, next_due_ms);
                """
            )
            conn.commit()

    @staticmethod
    def _row_to_attempt(row: sqlite3.Row) -> QuizAttempt:
        is_correct = row["is_correct"]
        return QuizAttempt(
            id=row["id"],
            user_id=row["user_id"],
            source=row["source"],
            source_id=row["source_id"],
            question_id=row["question_id"],
            user_answer=row["user_answer"] or "",
            is_correct=None if is_correct is None else bool(is_correct),
            earned=row["earned"] or 0.0,
            ai_comment=row["ai_comment"] or "",
            ts_ms=row["ts_ms"],
        )

    def _record_sync(self, payload: QuizAttemptCreate) -> QuizAttempt:
        attempt_id = uuid.uuid4().hex
        is_correct_int = (
            None if payload.is_correct is None else int(bool(payload.is_correct))
        )
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO quiz_attempts
                    (id, user_id, source, source_id, question_id, user_answer,
                     is_correct, earned, ai_comment, ts_ms)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    attempt_id,
                    payload.user_id,
                    payload.source,
                    payload.source_id,
                    payload.question_id,
                    payload.user_answer,
                    is_correct_int,
                    payload.earned,
                    payload.ai_comment,
                    payload.ts_ms,
                ),
            )
            self._update_review_state(
                conn,
                source=payload.source,
                source_id=payload.source_id,
                question_id=payload.question_id,
                is_correct=payload.is_correct,
                ts_ms=payload.ts_ms,
                user_answer=payload.user_answer,
            )
            conn.commit()
        return QuizAttempt(id=attempt_id, **payload.model_dump())

    @staticmethod
    def _update_review_state(
        conn: sqlite3.Connection,
        *,
        source: str,
        source_id: str,
        question_id: str,
        is_correct: bool | None,
        ts_ms: int,
        user_answer: str,
    ) -> None:
        """Promote (correct), demote-to-1 (wrong), or no-op (ungraded).

        Ungraded attempts (``is_correct is None``) leave the box alone
        but still update last_attempt_ts_ms so the picker has the
        latest answer for context. Insert-on-first-attempt happens
        with box=1, next_due_ms = now + 1 day.
        """
        if is_correct is None:
            # Just touch last_attempt; don't move the box. Inserts a
            # box-1 row if one doesn't exist (so an ungraded first
            # attempt still earns a review_state entry).
            conn.execute(
                """
                INSERT INTO review_state
                    (source, source_id, question_id, box, next_due_ms,
                     last_attempt_ts_ms, last_user_answer, failure_count)
                VALUES (?, ?, ?, 1, ?, ?, ?, 0)
                ON CONFLICT(source, source_id, question_id) DO UPDATE SET
                    last_attempt_ts_ms = excluded.last_attempt_ts_ms,
                    last_user_answer = excluded.last_user_answer
                """,
                (source, source_id, question_id, _next_due_for_box(1, ts_ms),
                 ts_ms, user_answer),
            )
            return

        row = conn.execute(
            "SELECT box, failure_count FROM review_state "
            "WHERE source = ? AND source_id = ? AND question_id = ?",
            (source, source_id, question_id),
        ).fetchone()

        prior_box = row["box"] if row else 1
        prior_failures = row["failure_count"] if row else 0
        if is_correct:
            new_box = min(prior_box + 1, 5)
            new_failures = prior_failures
        else:
            new_box = 1  # standard Leitner penalty: any wrong → box 1
            new_failures = prior_failures + 1
        next_due = _next_due_for_box(new_box, ts_ms)

        conn.execute(
            """
            INSERT INTO review_state
                (source, source_id, question_id, box, next_due_ms,
                 last_attempt_ts_ms, last_user_answer, failure_count)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(source, source_id, question_id) DO UPDATE SET
                box = excluded.box,
                next_due_ms = excluded.next_due_ms,
                last_attempt_ts_ms = excluded.last_attempt_ts_ms,
                last_user_answer = excluded.last_user_answer,
                failure_count = excluded.failure_count
            """,
            (source, source_id, question_id, new_box, next_due,
             ts_ms, user_answer, new_failures),
        )

    def _list_due_review_sync(
        self,
        *,
        source: QuizSource,
        now_ms: int,
        limit: int,
    ) -> list[dict]:
        """Rows in (source) where ``next_due_ms <= now_ms``, ordered by
        most-overdue first. Picker uses this as the candidate set; the
        old "wrong attempts >24h old" heuristic is replaced."""
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT source, source_id, question_id, box, next_due_ms,
                       last_attempt_ts_ms, last_user_answer, failure_count
                FROM review_state
                WHERE source = ? AND next_due_ms <= ?
                ORDER BY next_due_ms ASC
                LIMIT ?
                """,
                (source, now_ms, limit),
            ).fetchall()
        return [dict(row) for row in rows]

    async def list_due_review(
        self,
        *,
        source: QuizSource = "book",
        now_ms: int,
        limit: int = 50,
    ) -> list[dict]:
        return await self._run(
            self._list_due_review_sync,
            source=source,
            now_ms=now_ms,
            limit=limit,
        )

    async def record_attempt(self, payload: QuizAttemptCreate) -> QuizAttempt:
        return await self._run(self._record_sync, payload)

    def _list_sync(
        self,
        *,
        source: QuizSource | None,
        source_id: str | None,
        is_correct: bool | None,
        older_than_ms: int | None,
        newer_than_ms: int | None,
        limit: int,
    ) -> list[QuizAttempt]:
        clauses: list[str] = []
        params: list[object] = []
        if source is not None:
            clauses.append("source = ?")
            params.append(source)
        if source_id is not None:
            clauses.append("source_id = ?")
            params.append(source_id)
        if is_correct is not None:
            clauses.append("is_correct = ?")
            params.append(int(bool(is_correct)))
        if older_than_ms is not None:
            clauses.append("ts_ms < ?")
            params.append(older_than_ms)
        if newer_than_ms is not None:
            clauses.append("ts_ms >= ?")
            params.append(newer_than_ms)
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        params.append(limit)
        with self._connect() as conn:
            rows = conn.execute(
                f"""
                SELECT id, user_id, source, source_id, question_id, user_answer,
                       is_correct, earned, ai_comment, ts_ms
                FROM quiz_attempts
                {where}
                ORDER BY ts_ms DESC
                LIMIT ?
                """,
                params,
            ).fetchall()
        return [self._row_to_attempt(row) for row in rows]

    async def list_attempts(
        self,
        *,
        source: QuizSource | None = None,
        source_id: str | None = None,
        is_correct: bool | None = None,
        older_than_ms: int | None = None,
        newer_than_ms: int | None = None,
        limit: int = 100,
    ) -> list[QuizAttempt]:
        return await self._run(
            self._list_sync,
            source=source,
            source_id=source_id,
            is_correct=is_correct,
            older_than_ms=older_than_ms,
            newer_than_ms=newer_than_ms,
            limit=limit,
        )

    _BUCKET_TO_KEY = {1: "correct", 0: "incorrect", -1: "ungraded"}

    def _count_sync(self) -> dict[str, int]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT COALESCE(is_correct, -1) AS bucket, COUNT(*) AS n
                FROM quiz_attempts
                GROUP BY bucket
                """
            ).fetchall()
        out = {"correct": 0, "incorrect": 0, "ungraded": 0}
        for row in rows:
            out[self._BUCKET_TO_KEY[row["bucket"]]] = row["n"]
        return out

    async def count_by_status(self) -> dict[str, int]:
        return await self._run(self._count_sync)


_singleton: SQLiteQuizStore | None = None


def get_quiz_store() -> SQLiteQuizStore:
    global _singleton
    if _singleton is None:
        _singleton = SQLiteQuizStore()
    return _singleton


def reset_quiz_store() -> None:
    global _singleton
    _singleton = None
