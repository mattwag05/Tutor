"""Synchronous retrieval façade over the LlamaIndex pipeline.

Phase A.1 of the unified-tutor merge: exposes raw passage retrieval as a
plain async call that callers (the new REST endpoint, the WebSocket turn
runtime, ad-hoc scripts) can share. ``RAGService.search`` remains for
LLM-summary use; this façade returns full passages without the answer-text
concatenation that ``search`` performs.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Optional

from .factory import DEFAULT_PROVIDER, get_pipeline


@dataclass
class Passage:
    text: str
    score: float
    source: str
    page: Optional[str] = None
    title: Optional[str] = None
    chunk_id: Optional[str] = None

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Passage":
        return cls(
            text=str(data.get("text") or ""),
            score=float(data.get("score") or 0.0),
            source=str(data.get("source") or ""),
            page=data.get("page"),
            title=data.get("title"),
            chunk_id=data.get("chunk_id"),
        )

    def as_dict(self) -> dict[str, Any]:
        return {
            "text": self.text,
            "score": self.score,
            "source": self.source,
            "page": self.page,
            "title": self.title,
            "chunk_id": self.chunk_id,
        }


@dataclass
class RetrievalResult:
    query: str
    kb_name: str
    provider: str
    passages: list[Passage] = field(default_factory=list)
    warning: Optional[str] = None
    error: Optional[str] = None
    error_type: Optional[str] = None
    needs_reindex: bool = False


class RAGRetrieverService:
    """Thin façade returning untruncated passages for a query."""

    def __init__(self, kb_base_dir: Optional[str] = None) -> None:
        self.logger = logging.getLogger(__name__)
        self.kb_base_dir = kb_base_dir
        self._pipeline = None

    def _get_pipeline(self):
        if self._pipeline is None:
            self._pipeline = get_pipeline(kb_base_dir=self.kb_base_dir)
        return self._pipeline

    async def retrieve(
        self,
        query: str,
        kb_name: str,
        *,
        top_k: int = 8,
        provider: Optional[str] = None,
    ) -> RetrievalResult:
        """Retrieve top-K passages for ``query`` from ``kb_name``.

        ``provider`` is accepted for forward compatibility; only the
        LlamaIndex pipeline ships today.
        """

        normalized_query = (query or "").strip()
        if not normalized_query:
            return RetrievalResult(
                query=query or "",
                kb_name=kb_name,
                provider=DEFAULT_PROVIDER,
                error="query must not be empty",
                error_type="empty_query",
            )

        if top_k <= 0:
            return RetrievalResult(
                query=normalized_query,
                kb_name=kb_name,
                provider=DEFAULT_PROVIDER,
                error="top_k must be a positive integer",
                error_type="invalid_top_k",
            )

        if provider and provider != DEFAULT_PROVIDER:
            self.logger.info(
                f"Provider override '{provider}' ignored — only "
                f"'{DEFAULT_PROVIDER}' is supported."
            )

        pipeline = self._get_pipeline()
        raw = await pipeline.retrieve_passages(
            query=normalized_query, kb_name=kb_name, top_k=top_k
        )

        passages = [Passage.from_dict(p) for p in raw.get("passages") or []]
        return RetrievalResult(
            query=normalized_query,
            kb_name=kb_name,
            provider=raw.get("provider") or DEFAULT_PROVIDER,
            passages=passages,
            warning=raw.get("warning"),
            error=raw.get("error"),
            error_type=raw.get("error_type"),
            needs_reindex=bool(raw.get("needs_reindex")),
        )


__all__ = ["RAGRetrieverService", "Passage", "RetrievalResult"]
