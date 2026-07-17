"""Shared QuizAttempt schema.

Fields are deliberately minimal and forward-compatible:

* ``user_id`` is nullable so single-user installs leave it unset; future
  multi-user mode populates it without a schema change.
* ``source`` discriminates between the book/Notebook flow and the course
  flow (plus legacy ``classroom`` rows) so spaced-review can scope its picker.
* ``user_answer`` is JSON-encoded text so the same column can carry both
  scalar choices and array short-answer payloads.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

# "classroom" is a retired surface; the value stays because _row_to_attempt
# re-validates stored rows on read and old attempts must keep loading.
QuizSource = Literal["book", "classroom", "course"]


class QuizAttemptCreate(BaseModel):
    """Inbound payload for ``POST /api/v1/quiz/attempts``."""

    source: QuizSource
    source_id: str = Field(min_length=1, max_length=512)
    question_id: str = Field(min_length=1, max_length=256)
    user_answer: str = Field(default="", max_length=64_000)
    is_correct: bool | None = None
    earned: float = 0.0
    ai_comment: str = Field(default="", max_length=8_000)
    ts_ms: int = Field(ge=0)
    user_id: str | None = None


class QuizAttempt(QuizAttemptCreate):
    """Persisted attempt with assigned id."""

    id: str
