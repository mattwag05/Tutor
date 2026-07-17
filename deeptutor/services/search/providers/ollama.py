"""
Ollama Web Search Provider

API Docs: https://docs.ollama.com (POST /api/web_search)

Features:
- Free-tier web search included with an Ollama account
- Returns title, URL, and content snippet per result
- Max 10 results per query
"""

from datetime import datetime
import json
from typing import Any

import requests

from ..base import BaseSearchProvider
from ..types import Citation, SearchResult, WebSearchResponse
from . import register_provider

_MAX_COUNT = 10


@register_provider("ollama")
class OllamaSearchProvider(BaseSearchProvider):
    """Ollama web search provider (ollama.com cloud API)"""

    name = "ollama"
    display_name = "Ollama"
    description = "Web search via Ollama.com API (free with account)"
    supports_answer = False
    BASE_URL = "https://ollama.com/api/web_search"
    API_KEY_ENV_VARS = ("OLLAMA_API_KEY", "SEARCH_API_KEY")

    def search(
        self,
        query: str,
        count: int = 5,
        timeout: int = 30,
        **kwargs: Any,
    ) -> WebSearchResponse:
        """
        Perform web search using the Ollama web search API.

        Args:
            query: Search query.
            count: Number of results (1-10).
            timeout: Request timeout in seconds.
            **kwargs: Additional options (ignored).

        Returns:
            WebSearchResponse: Standardized search response.
        """
        self.logger.debug(f"Calling Ollama web search API count={count}")
        clamped_count = min(max(int(count), 1), _MAX_COUNT)
        payload: dict[str, Any] = {
            "query": query,
            "max_results": clamped_count,
        }

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }

        request_kwargs: dict[str, Any] = {"json": payload, "headers": headers}
        if self.proxy:
            request_kwargs["proxies"] = {"http": self.proxy, "https": self.proxy}

        response = requests.post(self.BASE_URL, timeout=timeout, **request_kwargs)

        if response.status_code != 200:
            try:
                error_data = response.json()
            except (json.JSONDecodeError, ValueError):
                error_data = {"error": response.text}
            self.logger.error(f"Ollama search API error: {response.status_code} - {error_data}")
            message = error_data.get("error") or error_data.get("message") or response.text
            raise Exception(f"Ollama search API error ({response.status_code}): {message}")

        raw = response.json()
        results_raw = raw.get("results") or []
        self.logger.debug(f"Ollama search returned {len(results_raw)} results")

        citations: list[Citation] = []
        search_results: list[SearchResult] = []

        for i, result in enumerate(results_raw, 1):
            url = result.get("url", "")
            if not url:
                continue
            title = result.get("title") or url
            snippet = result.get("content") or ""

            search_results.append(
                SearchResult(
                    title=title,
                    url=url,
                    snippet=snippet,
                )
            )
            citations.append(
                Citation(
                    id=i,
                    reference=f"[{i}]",
                    url=url,
                    title=title,
                    snippet=snippet,
                )
            )

        return WebSearchResponse(
            query=query,
            answer="",
            provider="ollama",
            timestamp=datetime.now().isoformat(),
            model="ollama",
            citations=citations,
            search_results=search_results,
            usage={},
            metadata={"finish_reason": "stop"},
        )
