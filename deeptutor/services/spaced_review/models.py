"""Pydantic models for the spaced-review picker."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

ReviewStatus = Literal["generating", "ready", "empty"]


class ReviewCandidate(BaseModel):
    """A wrong attempt picked for variant generation, joined with its
    original block payload from BookEngine."""

    book_id: str
    page_id: str
    block_id: str
    question_id: str
    last_user_answer: str = ""
    failure_count: int = 1
    last_attempt_ts_ms: int
    original_question: str
    original_options: dict[str, str] = Field(default_factory=dict)
    original_correct_answer: str = ""
    original_explanation: str = ""
    original_question_type: str = "written"
    original_difficulty: str = "medium"
    original_concentration: str = ""


class VariantQuestion(BaseModel):
    """A freshly generated variant surfaced to the user."""

    question_id: str
    source_question_id: str
    source_id: str = ""  # originating QuizAttempt source_id (book::page::block)
    question: str
    question_type: str = "written"
    options: dict[str, str] = Field(default_factory=dict)
    correct_answer: str = ""
    explanation: str = ""
    difficulty: str = "medium"


class SpacedReviewResponse(BaseModel):
    """Wire shape for ``GET /api/v1/spaced-review/today``."""

    date: str  # YYYY-MM-DD UTC
    status: ReviewStatus
    items: list[VariantQuestion] = Field(default_factory=list)
