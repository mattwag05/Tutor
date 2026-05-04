"""Unit tests for the RAGRetrieverService façade (Phase A.1)."""

from __future__ import annotations

import pytest

from deeptutor.services.rag.retriever_service import (
    Passage,
    RAGRetrieverService,
    RetrievalResult,
)


class _FakePipeline:
    """Pipeline stub that records calls and returns a scripted payload."""

    def __init__(self, payload: dict | None = None, raise_exc: Exception | None = None):
        self.payload = payload or {
            "query": "",
            "passages": [],
            "provider": "llamaindex",
        }
        self.raise_exc = raise_exc
        self.calls: list[dict] = []

    async def retrieve_passages(self, query: str, kb_name: str, *, top_k: int = 8):
        self.calls.append({"query": query, "kb_name": kb_name, "top_k": top_k})
        if self.raise_exc:
            raise self.raise_exc
        return self.payload


def _build_service(pipeline: _FakePipeline) -> RAGRetrieverService:
    service = RAGRetrieverService(kb_base_dir="/tmp/_test_unused")
    service._pipeline = pipeline  # bypass factory cache
    return service


@pytest.mark.asyncio
async def test_retrieve_returns_normalized_passages() -> None:
    pipeline = _FakePipeline(
        payload={
            "query": "diabetes",
            "provider": "llamaindex",
            "passages": [
                {
                    "text": "Long passage about diabetic retinopathy treatment.",
                    "score": 0.9123,
                    "source": "/data/nejm-paper.pdf",
                    "page": "12",
                    "title": "nejm-paper.pdf",
                    "chunk_id": "node-abc",
                },
                {
                    "text": "Second passage with no page metadata.",
                    "score": 0.81,
                    "source": "guideline.pdf",
                    "page": None,
                    "title": "guideline.pdf",
                    "chunk_id": "node-def",
                },
            ],
        }
    )

    service = _build_service(pipeline)
    result = await service.retrieve(
        query="diabetes treatment", kb_name="abfm-boards", top_k=5
    )

    assert isinstance(result, RetrievalResult)
    assert result.kb_name == "abfm-boards"
    assert result.provider == "llamaindex"
    assert result.error is None
    assert result.needs_reindex is False
    assert len(result.passages) == 2
    assert all(isinstance(p, Passage) for p in result.passages)
    assert result.passages[0].text.startswith("Long passage")
    assert result.passages[0].score == pytest.approx(0.9123)
    assert result.passages[0].source == "/data/nejm-paper.pdf"
    assert result.passages[0].page == "12"
    assert result.passages[1].page is None
    assert pipeline.calls == [
        {"query": "diabetes treatment", "kb_name": "abfm-boards", "top_k": 5}
    ]


@pytest.mark.asyncio
async def test_retrieve_rejects_empty_query() -> None:
    service = _build_service(_FakePipeline())
    result = await service.retrieve(query="   ", kb_name="kb-x")
    assert result.error_type == "empty_query"
    assert result.passages == []


@pytest.mark.asyncio
async def test_retrieve_rejects_zero_top_k() -> None:
    service = _build_service(_FakePipeline())
    result = await service.retrieve(query="hello", kb_name="kb-x", top_k=0)
    assert result.error_type == "invalid_top_k"


@pytest.mark.asyncio
async def test_retrieve_propagates_needs_reindex() -> None:
    pipeline = _FakePipeline(
        payload={
            "query": "x",
            "passages": [],
            "provider": "llamaindex",
            "needs_reindex": True,
        }
    )
    service = _build_service(pipeline)
    result = await service.retrieve(query="anything", kb_name="kb-x")
    assert result.needs_reindex is True
    assert result.passages == []


@pytest.mark.asyncio
async def test_retrieve_propagates_warning() -> None:
    pipeline = _FakePipeline(
        payload={
            "query": "q",
            "passages": [],
            "provider": "llamaindex",
            "warning": "embedding model mismatch",
        }
    )
    service = _build_service(pipeline)
    result = await service.retrieve(query="q", kb_name="kb-x")
    assert result.warning == "embedding model mismatch"


@pytest.mark.asyncio
async def test_retrieve_propagates_error_from_pipeline_payload() -> None:
    pipeline = _FakePipeline(
        payload={
            "query": "q",
            "passages": [],
            "provider": "llamaindex",
            "error": "boom",
            "error_type": "invalid_embedding_index",
        }
    )
    service = _build_service(pipeline)
    result = await service.retrieve(query="q", kb_name="kb-x")
    assert result.error == "boom"
    assert result.error_type == "invalid_embedding_index"


def test_passage_round_trip() -> None:
    p = Passage(
        text="full text",
        score=0.42,
        source="/foo.pdf",
        page="3",
        title="foo.pdf",
        chunk_id="abc",
    )
    assert Passage.from_dict(p.as_dict()) == p


@pytest.mark.asyncio
async def test_unknown_provider_is_logged_but_does_not_fail(caplog) -> None:
    service = _build_service(_FakePipeline())
    with caplog.at_level("INFO"):
        await service.retrieve(query="q", kb_name="kb-x", provider="weaviate")
    assert any(
        "Provider override" in record.message and "weaviate" in record.message
        for record in caplog.records
    )
