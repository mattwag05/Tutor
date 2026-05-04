"""SQLite-backed day-bucketed cache for spaced-review variant sets.

Mirrors the lock + ``asyncio.to_thread`` shape used by the unified quiz
store at ``deeptutor/services/quiz/sqlite_store.py`` so all SQLite work
in the backend follows the same pattern.

The cache holds at most one row per UTC date. Eviction keeps the last
seven days; older rows are dropped on every write. Status transitions:
``generating`` (placeholder while the background task runs) →
``ready`` (variants available) or ``empty`` (no candidates today).
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
import sqlite3

from deeptutor.services.path_service import get_path_service
from deeptutor.services.spaced_review.models import (
    ReviewStatus,
    SpacedReviewResponse,
    VariantQuestion,
)

_KEEP_DAYS = 7


class ReviewCache:
    """In-memory representation of one cached row."""

    __slots__ = ("date", "status", "items", "generated_ms")

    def __init__(
        self,
        *,
        date: str,
        status: ReviewStatus,
        items: list[VariantQuestion],
        generated_ms: int,
    ) -> None:
        self.date = date
        self.status = status
        self.items = items
        self.generated_ms = generated_ms

    def to_response(self) -> SpacedReviewResponse:
        return SpacedReviewResponse(date=self.date, status=self.status, items=self.items)


class SpacedReviewCacheStore:
    """One row per UTC date. Single-flight via an asyncio lock so two
    concurrent requests on day boundary cannot both mark ``generating``."""

    def __init__(self, db_path: Path | None = None) -> None:
        path_service = get_path_service()
        default_path = path_service.user_data_dir / "spaced_review" / "cache.db"
        self.db_path = db_path or default_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = asyncio.Lock()
        self._initialize()

    def _initialize(self) -> None:
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA foreign_keys = ON")
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS review_cache (
                    date TEXT PRIMARY KEY,
                    status TEXT NOT NULL CHECK(status IN ('generating','ready','empty')),
                    payload TEXT NOT NULL,
                    generated_ms INTEGER NOT NULL
                );
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
    def _row_to_cache(row: sqlite3.Row) -> ReviewCache:
        items_raw = json.loads(row["payload"]) if row["payload"] else []
        items = [VariantQuestion(**item) for item in items_raw]
        return ReviewCache(
            date=row["date"],
            status=row["status"],
            items=items,
            generated_ms=row["generated_ms"],
        )

    def _get_sync(self, date: str) -> ReviewCache | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT date, status, payload, generated_ms FROM review_cache WHERE date = ?",
                (date,),
            ).fetchone()
        return self._row_to_cache(row) if row else None

    async def get(self, date: str) -> ReviewCache | None:
        return await self._run(self._get_sync, date)

    def _upsert_sync(
        self,
        *,
        date: str,
        status: ReviewStatus,
        items: list[VariantQuestion],
        generated_ms: int,
        keep_days: int = _KEEP_DAYS,
    ) -> None:
        payload = json.dumps([item.model_dump() for item in items], ensure_ascii=False)
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO review_cache (date, status, payload, generated_ms)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(date) DO UPDATE SET
                    status = excluded.status,
                    payload = excluded.payload,
                    generated_ms = excluded.generated_ms
                """,
                (date, status, payload, generated_ms),
            )
            conn.execute(
                """
                DELETE FROM review_cache
                WHERE date < (
                    SELECT date FROM review_cache
                    ORDER BY date DESC
                    LIMIT 1 OFFSET ?
                )
                """,
                (keep_days - 1,),
            )
            conn.commit()

    async def upsert(
        self,
        *,
        date: str,
        status: ReviewStatus,
        items: list[VariantQuestion],
        generated_ms: int,
    ) -> None:
        await self._run(
            self._upsert_sync,
            date=date,
            status=status,
            items=items,
            generated_ms=generated_ms,
        )

    def _claim_generating_sync(self, date: str, generated_ms: int) -> bool:
        """Insert a ``generating`` placeholder iff no row exists for ``date``.

        Returns True if this caller now owns the generation slot.
        """
        with self._connect() as conn:
            cur = conn.execute(
                """
                INSERT INTO review_cache (date, status, payload, generated_ms)
                VALUES (?, 'generating', '[]', ?)
                ON CONFLICT(date) DO NOTHING
                """,
                (date, generated_ms),
            )
            conn.commit()
            return cur.rowcount == 1

    async def claim_generating(self, date: str, generated_ms: int) -> bool:
        return await self._run(self._claim_generating_sync, date, generated_ms)


_singleton: SpacedReviewCacheStore | None = None


def get_cache_store() -> SpacedReviewCacheStore:
    global _singleton
    if _singleton is None:
        _singleton = SpacedReviewCacheStore()
    return _singleton


def reset_cache_store() -> None:
    global _singleton
    _singleton = None
