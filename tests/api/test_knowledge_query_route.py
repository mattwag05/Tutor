"""Tests for POST /api/v1/knowledge/{kb_name}/query (Phase A.1)."""

from __future__ import annotations

import importlib
from pathlib import Path

import pytest

try:
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
except Exception:  # pragma: no cover - lightweight test env
    FastAPI = None
    TestClient = None

pytestmark = pytest.mark.skipif(
    FastAPI is None or TestClient is None, reason="fastapi not installed"
)

if FastAPI is not None and TestClient is not None:
    knowledge_router_module = importlib.import_module("deeptutor.api.routers.knowledge")
    router = knowledge_router_module.router
    from deeptutor.services.rag import Passage, RetrievalResult
else:  # pragma: no cover
    knowledge_router_module = None
    router = None


def _build_app() -> FastAPI:
    app = FastAPI()
    app.include_router(router, prefix="/api/v1/knowledge")
    return app


class _FakeKBManager:
    def __init__(self, base_dir: Path, kbs: list[str] | None = None) -> None:
        self.base_dir = base_dir
        self.base_dir.mkdir(parents=True, exist_ok=True)
        self._kbs = list(kbs or ["abfm-boards"])

    def list_knowledge_bases(self) -> list[str]:
        return list(self._kbs)

    def get_default(self) -> str | None:
        return self._kbs[0] if self._kbs else None

    def get_knowledge_base_path(self, name: str) -> Path:
        kb = self.base_dir / name
        kb.mkdir(parents=True, exist_ok=True)
        return kb


class _FakeRetrieverService:
    """Stand-in for RAGService that returns a scripted ``RetrievalResult``."""

    def __init__(self, result: RetrievalResult | None = None, raise_exc: Exception | None = None):
        self._result = result
        self._raise = raise_exc
        self.calls: list[dict] = []

    async def retrieve(
        self, *, query: str, kb_name: str, top_k: int = 8, provider: str | None = None
    ) -> RetrievalResult:
        self.calls.append(
            {"query": query, "kb_name": kb_name, "top_k": top_k, "provider": provider}
        )
        if self._raise is not None:
            raise self._raise
        if self._result is not None:
            return self._result
        return RetrievalResult(query=query, kb_name=kb_name, provider="llamaindex", passages=[])


def _patch_router(monkeypatch, *, manager: _FakeKBManager, service: _FakeRetrieverService) -> None:
    monkeypatch.setattr(knowledge_router_module, "get_kb_manager", lambda: manager)
    monkeypatch.setattr(knowledge_router_module, "get_rag_service", lambda: service)


def test_query_returns_passages(monkeypatch, tmp_path: Path) -> None:
    manager = _FakeKBManager(tmp_path / "kbs")
    result = RetrievalResult(
        query="diabetic retinopathy",
        kb_name="abfm-boards",
        provider="llamaindex",
        passages=[
            Passage(
                text="Anti-VEGF therapy is first-line for diabetic macular edema.",
                score=0.9234,
                source="/data/nejm.pdf",
                page="12",
                title="nejm.pdf",
                chunk_id="node-1",
            ),
            Passage(
                text="Pan-retinal photocoagulation remains standard for proliferative cases.",
                score=0.8412,
                source="/data/aafp.pdf",
                page=None,
                title="aafp.pdf",
                chunk_id="node-2",
            ),
        ],
    )
    service = _FakeRetrieverService(result=result)
    _patch_router(monkeypatch, manager=manager, service=service)

    with TestClient(_build_app()) as client:
        response = client.post(
            "/api/v1/knowledge/abfm-boards/query",
            json={"query": "diabetic retinopathy treatment", "top_k": 5},
        )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["kb_name"] == "abfm-boards"
    assert body["provider"] == "llamaindex"
    assert body["needs_reindex"] is False
    assert len(body["results"]) == 2
    assert body["results"][0]["text"].startswith("Anti-VEGF")
    assert body["results"][0]["score"] == pytest.approx(0.9234)
    assert body["results"][0]["page"] == "12"
    assert body["results"][1]["page"] is None

    assert service.calls == [
        {
            "query": "diabetic retinopathy treatment",
            "kb_name": "abfm-boards",
            "top_k": 5,
            "provider": None,
        }
    ]


def test_query_uses_default_top_k(monkeypatch, tmp_path: Path) -> None:
    manager = _FakeKBManager(tmp_path / "kbs")
    service = _FakeRetrieverService()
    _patch_router(monkeypatch, manager=manager, service=service)

    with TestClient(_build_app()) as client:
        response = client.post(
            "/api/v1/knowledge/abfm-boards/query",
            json={"query": "anything"},
        )

    assert response.status_code == 200
    assert service.calls[0]["top_k"] == 8


def test_query_rejects_empty_string(monkeypatch, tmp_path: Path) -> None:
    manager = _FakeKBManager(tmp_path / "kbs")
    service = _FakeRetrieverService()
    _patch_router(monkeypatch, manager=manager, service=service)

    with TestClient(_build_app()) as client:
        response = client.post("/api/v1/knowledge/abfm-boards/query", json={"query": "   "})

    assert response.status_code == 400
    assert "empty" in response.json()["detail"].lower()
    assert service.calls == []


def test_query_rejects_zero_top_k(monkeypatch, tmp_path: Path) -> None:
    manager = _FakeKBManager(tmp_path / "kbs")
    service = _FakeRetrieverService()
    _patch_router(monkeypatch, manager=manager, service=service)

    with TestClient(_build_app()) as client:
        response = client.post(
            "/api/v1/knowledge/abfm-boards/query",
            json={"query": "valid", "top_k": 0},
        )

    assert response.status_code == 400


def test_query_unknown_kb_returns_404(monkeypatch, tmp_path: Path) -> None:
    manager = _FakeKBManager(tmp_path / "kbs", kbs=["only-this-one"])
    service = _FakeRetrieverService()
    _patch_router(monkeypatch, manager=manager, service=service)

    with TestClient(_build_app()) as client:
        response = client.post("/api/v1/knowledge/missing-kb/query", json={"query": "hello"})

    assert response.status_code == 404
    assert service.calls == []


def test_query_default_alias_resolves_to_default_kb(monkeypatch, tmp_path: Path) -> None:
    manager = _FakeKBManager(tmp_path / "kbs", kbs=["my-default-kb"])
    service = _FakeRetrieverService()
    _patch_router(monkeypatch, manager=manager, service=service)

    with TestClient(_build_app()) as client:
        response = client.post("/api/v1/knowledge/default/query", json={"query": "hello"})

    assert response.status_code == 200
    assert service.calls[0]["kb_name"] == "my-default-kb"


def test_query_returns_409_when_index_needs_rebuild(monkeypatch, tmp_path: Path) -> None:
    manager = _FakeKBManager(tmp_path / "kbs")
    result = RetrievalResult(
        query="q",
        kb_name="abfm-boards",
        provider="llamaindex",
        passages=[],
        needs_reindex=True,
    )
    service = _FakeRetrieverService(result=result)
    _patch_router(monkeypatch, manager=manager, service=service)

    with TestClient(_build_app()) as client:
        response = client.post("/api/v1/knowledge/abfm-boards/query", json={"query": "q"})

    assert response.status_code == 409
    detail = response.json()["detail"]
    assert detail["error_type"] == "needs_reindex"
    assert detail["kb_name"] == "abfm-boards"


def test_query_returns_502_on_pipeline_error_payload(monkeypatch, tmp_path: Path) -> None:
    manager = _FakeKBManager(tmp_path / "kbs")
    result = RetrievalResult(
        query="q",
        kb_name="abfm-boards",
        provider="llamaindex",
        passages=[],
        error="boom",
        error_type="invalid_embedding_provider_response",
    )
    service = _FakeRetrieverService(result=result)
    _patch_router(monkeypatch, manager=manager, service=service)

    with TestClient(_build_app()) as client:
        response = client.post("/api/v1/knowledge/abfm-boards/query", json={"query": "q"})

    assert response.status_code == 502
    detail = response.json()["detail"]
    assert detail["error_type"] == "invalid_embedding_provider_response"


def test_query_returns_500_on_unexpected_exception(monkeypatch, tmp_path: Path) -> None:
    manager = _FakeKBManager(tmp_path / "kbs")
    service = _FakeRetrieverService(raise_exc=RuntimeError("kaboom"))
    _patch_router(monkeypatch, manager=manager, service=service)

    with TestClient(_build_app()) as client:
        response = client.post("/api/v1/knowledge/abfm-boards/query", json={"query": "q"})

    assert response.status_code == 500


def test_query_passes_provider_through(monkeypatch, tmp_path: Path) -> None:
    manager = _FakeKBManager(tmp_path / "kbs")
    service = _FakeRetrieverService()
    _patch_router(monkeypatch, manager=manager, service=service)

    with TestClient(_build_app()) as client:
        response = client.post(
            "/api/v1/knowledge/abfm-boards/query",
            json={"query": "q", "top_k": 3, "provider": "llamaindex"},
        )

    assert response.status_code == 200
    assert service.calls[0]["provider"] == "llamaindex"
