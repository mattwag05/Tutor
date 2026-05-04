"""Unified quiz-attempt persistence.

Provides a SQLite-backed store and Pydantic models shared by the book
(Notebook) and OpenMAIC (classroom / course) quiz surfaces, so the
spaced-review picker (PRD §6.5) can query a single source.
"""

from deeptutor.services.quiz.models import (
    QuizAttempt,
    QuizAttemptCreate,
    QuizSource,
)
from deeptutor.services.quiz.sqlite_store import SQLiteQuizStore, get_quiz_store

__all__ = [
    "QuizAttempt",
    "QuizAttemptCreate",
    "QuizSource",
    "SQLiteQuizStore",
    "get_quiz_store",
]
