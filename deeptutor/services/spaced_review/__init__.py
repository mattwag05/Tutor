"""Daily spaced-review picker (PRD §6.5).

Pulls wrong quiz attempts older than 24h from the unified ``QuizAttempt``
store, scores them with a simple Leitner-style heuristic, generates fresh
micro-quiz variants via the existing question Generator agent, and caches
the day's variant set in SQLite so the Notebook UI can surface it without
re-generating on every visit.
"""

from deeptutor.services.spaced_review.cache import (
    ReviewCache,
    SpacedReviewCacheStore,
    get_cache_store,
)
from deeptutor.services.spaced_review.models import (
    ReviewCandidate,
    SpacedReviewResponse,
    VariantQuestion,
)
from deeptutor.services.spaced_review.picker import pick_review_set
from deeptutor.services.spaced_review.variants import generate_variants

__all__ = [
    "ReviewCache",
    "ReviewCandidate",
    "SpacedReviewCacheStore",
    "SpacedReviewResponse",
    "VariantQuestion",
    "generate_variants",
    "get_cache_store",
    "pick_review_set",
]
