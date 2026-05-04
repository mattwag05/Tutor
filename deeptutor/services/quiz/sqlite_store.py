"""SQLite-backed quiz attempt store.

Mirrors the lock + ``asyncio.to_thread`` shape used by
``deeptutor/services/session/sqlite_store.py`` so all SQLite work in the
backend follows the same pattern.
"""

from __future__ import annotations

import asyncio
from pathlib import Path
import sqlite3
import uuid

from deeptutor.services.path_service import get_path_service
from deeptutor.services.quiz.models import (
    QuizAttempt,
    QuizAttemptCreate,
    QuizSource,
)


class SQLiteQuizStore:
    """Persist QuizAttempt rows in a SQLite database."""

    def __init__(self, db_path: Path | None = None) -> None:
        path_service = get_path_service()
        self.db_path = db_path or path_service.get_quiz_db()
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = asyncio.Lock()
        self._initialize()

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
                """
            )
            conn.commit()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    async def _run(self, fn, *args, **kwargs):
        async with self._lock:
            return await asyncio.to_thread(fn, *args, **kwargs)

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
            conn.commit()
        return QuizAttempt(id=attempt_id, **payload.model_dump())

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
