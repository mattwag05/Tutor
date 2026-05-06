"""Async SQLite store base.

Three stores in the codebase had grown the same shape — an
``asyncio.Lock`` field, an ``asyncio.to_thread`` wrapper named ``_run``,
a ``_connect()`` returning ``sqlite3.Connection`` with ``Row`` factory,
and a constructor that ``mkdir(parents=True, exist_ok=True)`` on the
DB path's parent before calling a subclass-defined ``_initialize()``.
The duplication was flagged by the /simplify pass on DeepTutor-bcd.

The lock looks redundant because SQLite is thread-safe via WAL +
``check_same_thread`` — and on the quiz store it largely is. But on
the session store, removing it (DeepTutor-1tx, PR #23) broke
``test_turn_runtime_replays_events_and_materializes_messages``: the
lock was providing implicit ordering between turn-event writes and
their subsequent reads in the WS subscribe stream. PR #23 was closed
without merge.

So this base class keeps the lock by default. Subclasses that have
verifiably no ordering dependency (e.g. the spaced-review cache, where
each row is a UTC-date snapshot and reads/writes never interleave at
sub-millisecond resolution) can opt out with ``serialize=False`` per
construction. Default is on — conservative — to preserve the contract
that bit us in 1tx.
"""

from __future__ import annotations

import asyncio
from pathlib import Path
import sqlite3
from typing import Any, Callable


class AsyncSQLiteStore:
    """Base for SQLite-backed stores driven from asyncio code.

    Subclasses must implement ``_initialize(self) -> None`` to declare
    schema (CREATE TABLE / CREATE INDEX). ``_initialize`` runs in the
    constructor; do not raise if the schema already exists.
    """

    def __init__(self, db_path: Path, *, serialize: bool = True) -> None:
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = asyncio.Lock() if serialize else None
        self._initialize()

    def _initialize(self) -> None:
        """Override in subclass to create schema. Default is a no-op so
        instantiation in tests doesn't require schema setup."""

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    async def _run(self, fn: Callable[..., Any], *args: Any, **kwargs: Any) -> Any:
        if self._lock is None:
            return await asyncio.to_thread(fn, *args, **kwargs)
        async with self._lock:
            return await asyncio.to_thread(fn, *args, **kwargs)
