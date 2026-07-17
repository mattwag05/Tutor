"""LlamaIndex-backed RAG pipeline orchestration."""

from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path
import traceback
from typing import Any, Callable, Dict, List, Optional

from deeptutor.services.embedding import get_embedding_config
from deeptutor.services.rag.embedding_signature import signature_from_embedding_config
from deeptutor.services.rag.index_versioning import (
    EmbeddingSignature,
    resolve_storage_dir_for_read,
    resolve_storage_dir_for_rebuild,
    write_version_meta,
)

from . import storage
from .document_loader import LlamaIndexDocumentLoader
from .embedding_adapter import (
    configure_llamaindex_settings,
    set_progress_callback,
    verify_embedding_connectivity,
)
from .errors import search_error_result

DEFAULT_KB_BASE_DIR = str(
    Path(__file__).resolve().parent.parent.parent.parent.parent.parent / "data" / "knowledge_bases"
)

SignatureProvider = Callable[[], EmbeddingSignature | None]


class LlamaIndexPipeline:
    """Pipeline that indexes and retrieves KB content via LlamaIndex."""

    def __init__(
        self,
        kb_base_dir: Optional[str] = None,
        *,
        signature_provider: SignatureProvider | None = None,
        document_loader: LlamaIndexDocumentLoader | None = None,
    ):
        self.logger = logging.getLogger(__name__)
        self.kb_base_dir = kb_base_dir or DEFAULT_KB_BASE_DIR
        self._signature_provider = signature_provider or signature_from_embedding_config
        self.document_loader = document_loader or LlamaIndexDocumentLoader(self.logger)
        self._configure_settings()

    def _configure_settings(self) -> None:
        configure_llamaindex_settings(self.logger)

    async def _verify_embedding_connectivity(self) -> None:
        await verify_embedding_connectivity(self.logger)

    def _current_signature(self) -> EmbeddingSignature | None:
        return self._signature_provider()

    def _cleanup_failed_version_dir(self, storage_dir: Path, signature: Optional[Any]) -> None:
        _ = signature
        try:
            if storage.cleanup_failed_version_dir(storage_dir):
                self.logger.info(
                    f"Removed empty version dir after failed pipeline run: {storage_dir}"
                )
        except Exception as cleanup_exc:  # pragma: no cover - best-effort
            self.logger.warning(
                f"Could not clean up failed version dir for {storage_dir}: {cleanup_exc}"
            )

    async def initialize(self, kb_name: str, file_paths: List[str], **kwargs) -> bool:
        progress_callback = kwargs.get("progress_callback")
        self._configure_settings()

        self.logger.info(
            f"Initializing KB '{kb_name}' with {len(file_paths)} files using LlamaIndex"
        )

        kb_dir = Path(self.kb_base_dir) / kb_name
        signature = self._current_signature()
        storage_dir = resolve_storage_dir_for_rebuild(kb_dir, signature)

        try:
            await self._verify_embedding_connectivity()
            documents = await self.document_loader.load(file_paths)
            if not documents:
                self.logger.error("No valid documents found")
                return False

            self.logger.info(
                f"Creating VectorStoreIndex with {len(documents)} documents "
                f"(chunking + embedding)..."
            )

            if progress_callback:
                set_progress_callback(progress_callback)

            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None,
                lambda: storage.create_index(documents, storage_dir, show_progress=True),
            )

            self.logger.info(f"Index persisted to {storage_dir}")
            if signature is not None:
                write_version_meta(kb_dir, signature, storage_dir=storage_dir)

            self.logger.info(f"KB '{kb_name}' initialized successfully with LlamaIndex")
            return True

        except Exception as exc:
            self.logger.error(f"Failed to initialize KB: {exc}")
            self.logger.error(traceback.format_exc())
            self._cleanup_failed_version_dir(storage_dir, signature)
            raise
        finally:
            set_progress_callback(None)

    async def _retrieve_nodes(
        self,
        kb_name: str,
        query: str,
        top_k: int,
    ) -> tuple[list[Any] | None, str]:
        """Return ``(nodes, warning)``. ``nodes is None`` signals missing index."""
        self._configure_settings()
        kb_dir = Path(self.kb_base_dir) / kb_name
        signature = self._current_signature()
        storage_dir = resolve_storage_dir_for_read(kb_dir, signature)

        if storage_dir is None or not (storage_dir / "docstore.json").exists():
            self.logger.warning(
                f"No matching index found for KB '{kb_name}' at signature "
                f"{signature.hash() if signature else 'n/a'}"
            )
            return None, ""

        warning = self._embedding_mismatch_warning(kb_name)

        loop = asyncio.get_event_loop()
        nodes = await loop.run_in_executor(
            None,
            lambda: storage.retrieve_nodes(storage_dir, query, top_k=top_k),
        )
        return nodes, warning

    async def search(
        self,
        query: str,
        kb_name: str,
        **kwargs,
    ) -> Dict[str, Any]:
        kwargs.pop("mode", None)
        self.logger.info(f"Searching KB '{kb_name}' with query: {query[:50]}...")
        top_k = kwargs.get("top_k", 5)

        try:
            nodes, warning = await self._retrieve_nodes(kb_name, query, top_k)
        except Exception as exc:
            result = search_error_result(query, exc)
            if result.get("error_type"):
                log_message = result.get("log_message") or str(exc)
                self.logger.warning(f"Search failed ({result['error_type']}): {log_message}")
            else:
                self.logger.error(f"Search failed: {exc}")
                self.logger.error(traceback.format_exc())
            return result

        if nodes is None:
            return {
                "query": query,
                "answer": (
                    "This knowledge base has no index for the active embedding "
                    "model. Re-index it (or switch back to a previously-used "
                    "embedding model) before querying."
                ),
                "content": "",
                "provider": "llamaindex",
                "needs_reindex": True,
            }

        result = self._nodes_to_result(query, nodes)
        if warning:
            result["warning"] = warning
        return result

    # Mtime-keyed cache for the warning string per (kb_name, current_model).
    # Without this, every retrieval re-opens kb_config.json — under per-section
    # grounding loops that's one JSON parse per chunk. Cache invalidates when
    # the config file's mtime changes (UI Settings edits write the file).
    # Class-level intentionally so all pipeline instances share invalidation.
    _MISMATCH_WARN_CACHE: dict[tuple[str, str, str, float], str] = {}

    def _embedding_mismatch_warning(self, kb_name: str) -> str:
        try:
            cfg_path = Path(self.kb_base_dir) / "kb_config.json"
            try:
                st = cfg_path.stat()
            except OSError:
                return ""
            current = get_embedding_config().model
            cache_key = (str(cfg_path), kb_name, current, st.st_mtime)
            cached = self._MISMATCH_WARN_CACHE.get(cache_key)
            if cached is not None:
                return cached

            with open(cfg_path, encoding="utf-8") as handle:
                kb_entry = json.load(handle).get("knowledge_bases", {}).get(kb_name, {})
            if not kb_entry.get("embedding_mismatch"):
                self._MISMATCH_WARN_CACHE[cache_key] = ""
                return ""
            stored = kb_entry.get("embedding_model", "unknown")
            warning = (
                f"Warning: KB '{kb_name}' was indexed with '{stored}' "
                f"but current model is '{current}'. Re-index recommended."
            )
            self.logger.warning(warning)

            # Bound memory: drop stale entries for this same (path, kb_name, model)
            # tuple from prior mtimes when we insert a fresh one.
            stale_prefix = (str(cfg_path), kb_name, current)
            for stale_key in [k for k in self._MISMATCH_WARN_CACHE if k[:3] == stale_prefix and k != cache_key]:
                self._MISMATCH_WARN_CACHE.pop(stale_key, None)
            self._MISMATCH_WARN_CACHE[cache_key] = warning
            return warning
        except Exception:
            return ""

    def _nodes_to_result(self, query: str, nodes: list[Any]) -> Dict[str, Any]:
        context_parts: list[str] = []
        sources: list[dict[str, Any]] = []
        for i, node in enumerate(nodes):
            context_parts.append(node.node.text)
            meta = node.node.metadata or {}
            sources.append(
                {
                    "title": meta.get("file_name", meta.get("title", f"Document {i + 1}")),
                    "content": node.node.text[:200],
                    "source": meta.get("file_path", meta.get("file_name", "")),
                    "page": meta.get("page_label", meta.get("page", "")),
                    "chunk_id": node.node.node_id or str(i),
                    "score": round(node.score, 4) if node.score is not None else "",
                }
            )

        content = "\n\n".join(context_parts) if context_parts else ""
        return {
            "query": query,
            "answer": content,
            "content": content,
            "sources": sources,
            "provider": "llamaindex",
        }

    async def retrieve_passages(
        self,
        query: str,
        kb_name: str,
        *,
        top_k: int = 8,
    ) -> Dict[str, Any]:
        """Return raw, untruncated passages for ``query`` against ``kb_name``.

        Distinct from :meth:`search`, which concatenates and truncates passage
        text for in-context LLM grounding.
        """
        self.logger.info(f"Retrieving passages from KB '{kb_name}' for query: {query[:50]}...")

        try:
            nodes, warning = await self._retrieve_nodes(kb_name, query, top_k)
        except Exception as exc:
            error = search_error_result(query, exc)
            error["passages"] = []
            error.pop("answer", None)
            error.pop("content", None)
            if error.get("error_type"):
                self.logger.warning(
                    f"Retrieval failed ({error['error_type']}): "
                    f"{error.get('log_message') or str(exc)}"
                )
            else:
                self.logger.error(f"Retrieval failed: {exc}")
                self.logger.error(traceback.format_exc())
            return error

        if nodes is None:
            return {
                "query": query,
                "passages": [],
                "provider": "llamaindex",
                "needs_reindex": True,
            }

        passages: list[dict[str, Any]] = []
        for i, node in enumerate(nodes):
            meta = node.node.metadata or {}
            page_value = meta.get("page_label", meta.get("page", ""))
            passages.append(
                {
                    "text": node.node.text,
                    "score": float(node.score) if node.score is not None else 0.0,
                    "source": (meta.get("file_path") or meta.get("file_name") or ""),
                    "page": str(page_value) if page_value not in (None, "") else None,
                    "title": meta.get("file_name", meta.get("title", f"Document {i + 1}")),
                    "chunk_id": node.node.node_id or str(i),
                }
            )

        result: Dict[str, Any] = {
            "query": query,
            "passages": passages,
            "provider": "llamaindex",
        }
        if warning:
            result["warning"] = warning
        return result

    async def add_documents(self, kb_name: str, file_paths: List[str], **kwargs) -> bool:
        progress_callback = kwargs.get("progress_callback")
        self._configure_settings()

        self.logger.info(f"Adding {len(file_paths)} documents to KB '{kb_name}' using LlamaIndex")

        kb_dir = Path(self.kb_base_dir) / kb_name
        signature = self._current_signature()
        plan = storage.resolve_add_storage_plan(kb_dir, signature)

        try:
            await self._verify_embedding_connectivity()
            if progress_callback:
                set_progress_callback(progress_callback)

            documents = await self.document_loader.load(file_paths)
            if not documents:
                self.logger.warning("No valid documents to add")
                return False

            loop = asyncio.get_event_loop()

            if plan.existing_storage is not None:
                self.logger.info(f"Loading existing index from {plan.existing_storage}...")
                num_added = await loop.run_in_executor(
                    None,
                    lambda: storage.insert_documents(
                        plan.existing_storage, plan.storage_dir, documents
                    ),
                )
                self.logger.info(f"Added {num_added} documents to existing index")
                if signature is not None and plan.storage_dir != plan.existing_storage:
                    write_version_meta(kb_dir, signature, storage_dir=plan.storage_dir)
            else:
                self.logger.info(f"Creating new index with {len(documents)} documents...")
                plan.storage_dir.mkdir(parents=True, exist_ok=True)
                num_added = await loop.run_in_executor(
                    None,
                    lambda: storage.create_index(documents, plan.storage_dir, show_progress=True),
                )
                self.logger.info(f"Created new index with {num_added} documents")
                if signature is not None:
                    write_version_meta(kb_dir, signature, storage_dir=plan.storage_dir)

            self.logger.info(f"Successfully added documents to KB '{kb_name}'")
            return True

        except Exception as exc:
            self.logger.error(f"Failed to add documents: {exc}")
            self.logger.error(traceback.format_exc())
            if plan.existing_storage is None or plan.storage_dir != plan.existing_storage:
                self._cleanup_failed_version_dir(plan.storage_dir, signature)
            raise
        finally:
            set_progress_callback(None)

    async def delete(self, kb_name: str) -> bool:
        kb_dir = Path(self.kb_base_dir) / kb_name
        deleted = storage.delete_kb_dir(kb_dir)
        if deleted:
            self.logger.info(f"Deleted KB '{kb_name}'")
        return deleted
