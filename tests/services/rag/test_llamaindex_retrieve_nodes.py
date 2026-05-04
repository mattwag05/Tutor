"""Direct unit tests for ``LlamaIndexPipeline._retrieve_nodes`` (Phase B c8q).

Both ``search`` and ``retrieve_passages`` delegate to ``_retrieve_nodes`` for
config / signature / storage-dir lookup / executor dispatch / warning lookup.
These tests exercise the helper directly so a future divergence in either
caller cannot mask a regression in the shared core.
"""

from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

import pytest


def _make_pipeline(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    from deeptutor.services.rag.pipelines.llamaindex.pipeline import LlamaIndexPipeline

    monkeypatch.setattr(LlamaIndexPipeline, "_configure_settings", lambda self: None)
    return LlamaIndexPipeline(
        kb_base_dir=str(tmp_path),
        signature_provider=lambda: None,
    )


@pytest.mark.asyncio
async def test_retrieve_nodes_returns_none_when_no_index(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """No matching storage_dir → callers get a needs_reindex sentinel."""
    pipeline = _make_pipeline(tmp_path, monkeypatch)

    nodes, warning = await pipeline._retrieve_nodes("kb", "q", top_k=5)

    assert nodes is None
    assert warning == ""


@pytest.mark.asyncio
async def test_retrieve_nodes_returns_none_when_docstore_missing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Storage dir resolves but docstore.json absent → still needs_reindex sentinel."""
    from deeptutor.services.rag.pipelines.llamaindex import pipeline as pipeline_module

    storage_dir = tmp_path / "kb" / "version-1"
    storage_dir.mkdir(parents=True)
    # Intentionally do NOT create docstore.json.

    monkeypatch.setattr(
        pipeline_module,
        "resolve_storage_dir_for_read",
        lambda kb_dir, sig: storage_dir,
    )
    pipeline = _make_pipeline(tmp_path, monkeypatch)

    nodes, warning = await pipeline._retrieve_nodes("kb", "q", top_k=3)

    assert nodes is None
    assert warning == ""


@pytest.mark.asyncio
async def test_retrieve_nodes_returns_nodes_and_warning_when_index_present(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Happy path: nodes come back from storage and embedding-mismatch warning surfaces."""
    from deeptutor.services.rag.pipelines.llamaindex import pipeline as pipeline_module
    from deeptutor.services.rag.pipelines.llamaindex import storage as storage_module

    kb_base = tmp_path
    storage_dir = kb_base / "kb" / "version-1"
    storage_dir.mkdir(parents=True)
    (storage_dir / "docstore.json").write_text("{}", encoding="utf-8")

    # Configure embedding-mismatch warning by writing kb_config.json at kb_base.
    (kb_base / "kb_config.json").write_text(
        json.dumps(
            {
                "knowledge_bases": {
                    "kb": {
                        "embedding_mismatch": True,
                        "embedding_model": "old-model",
                    }
                }
            }
        ),
        encoding="utf-8",
    )

    monkeypatch.setattr(
        pipeline_module,
        "resolve_storage_dir_for_read",
        lambda kb_dir, sig: storage_dir,
    )
    monkeypatch.setattr(
        pipeline_module,
        "get_embedding_config",
        lambda: SimpleNamespace(model="new-model"),
    )

    fake_nodes = [SimpleNamespace(node=SimpleNamespace(text="hello"), score=0.5)]
    monkeypatch.setattr(
        storage_module,
        "retrieve_nodes",
        lambda persist_dir, query, top_k=5: fake_nodes,
    )

    pipeline = _make_pipeline(kb_base, monkeypatch)

    nodes, warning = await pipeline._retrieve_nodes("kb", "q", top_k=4)

    assert nodes is fake_nodes
    assert "old-model" in warning and "new-model" in warning


@pytest.mark.asyncio
async def test_retrieve_nodes_propagates_storage_exception(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """``storage.retrieve_nodes`` raising bubbles out — callers wrap into error payloads."""
    from deeptutor.services.rag.pipelines.llamaindex import pipeline as pipeline_module
    from deeptutor.services.rag.pipelines.llamaindex import storage as storage_module

    storage_dir = tmp_path / "kb" / "version-1"
    storage_dir.mkdir(parents=True)
    (storage_dir / "docstore.json").write_text("{}", encoding="utf-8")

    monkeypatch.setattr(
        pipeline_module,
        "resolve_storage_dir_for_read",
        lambda kb_dir, sig: storage_dir,
    )
    monkeypatch.setattr(
        storage_module,
        "retrieve_nodes",
        lambda persist_dir, query, top_k=5: (_ for _ in ()).throw(RuntimeError("storage exploded")),
    )

    pipeline = _make_pipeline(tmp_path, monkeypatch)

    with pytest.raises(RuntimeError, match="storage exploded"):
        await pipeline._retrieve_nodes("kb", "q", top_k=1)
