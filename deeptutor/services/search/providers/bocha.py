"""
Bocha Web Search Provider

API Docs: https://api.bocha.cn (POST /v1/web-search)

Features:
- Web search with snippet + summary fields
- Freshness filtering (noLimit, oneDay, oneWeek, oneMonth, oneYear)
- Optional summary expansion per result
- Recommended clinical default per unified-tutor PRD §11.9
"""

from datetime import datetime
import json
from typing import Any

import requests

from ..base import BaseSearchProvider
from ..types import Citation, SearchResult, WebSearchResponse
from . import register_provider

_MAX_COUNT = 50


@register_provider("bocha")
class BochaProvider(BaseSearchProvider):
    """Bocha web search provider"""

    name = "bocha"
    display_name = "Bocha"
    description = "Clinical / Chinese-language web search"
    supports_answer = False
    BASE_URL = "https://api.bocha.cn/v1/web-search"
    API_KEY_ENV_VARS = ("BOCHA_API_KEY", "SEARCH_API_KEY")

    def search(
        self,
        query: str,
        freshness: str = "noLimit",  # noLimit, oneDay, oneWeek, oneMonth, oneYear
        count: int = 10,
        summary: bool = True,
        timeout: int = 60,
        **kwargs: Any,
    ) -> WebSearchResponse:
        """
        Perform web search using Bocha API.

        Args:
            query: Search query.
            freshness: Time filter ("noLimit", "oneDay", "oneWeek", "oneMonth", "oneYear").
            count: Number of results (1-50).
            summary: Include per-result summary content.
            timeout: Request timeout in seconds.
            **kwargs: Additional options (ignored by Bocha).

        Returns:
            WebSearchResponse: Standardized search response.
        """
        self.logger.debug(f"Calling Bocha API freshness={freshness}, count={count}")
        clamped_count = min(max(int(count), 1), _MAX_COUNT)
        payload: dict[str, Any] = {
            "query": query,
            "freshness": freshness,
            "summary": summary,
            "count": clamped_count,
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
            self.logger.error(f"Bocha API error: {response.status_code} - {error_data}")
            message = error_data.get("message") or error_data.get("msg") or response.text
            log_id = error_data.get("log_id")
            log_id_suffix = f", log_id: {log_id}" if log_id else ""
            raise Exception(
                f"Bocha API error ({error_data.get('code', response.status_code)}): "
                f"{message}{log_id_suffix}"
            )

        raw = response.json()

        code = raw.get("code")
        if code is not None and str(code) != "200":
            message = raw.get("message") or raw.get("msg") or "Request failed"
            log_id = raw.get("log_id")
            log_id_suffix = f", log_id: {log_id}" if log_id else ""
            self.logger.error(f"Bocha API error: code={code} message={message}")
            raise Exception(f"Bocha API error ({code}): {message}{log_id_suffix}")

        data = raw.get("data") or raw
        web_pages = (data.get("webPages") or {}).get("value") or []
        self.logger.debug(f"Bocha returned {len(web_pages)} results")

        citations: list[Citation] = []
        search_results: list[SearchResult] = []

        for i, page in enumerate(web_pages, 1):
            url = page.get("url", "")
            if not url:
                continue
            title = page.get("name") or url
            snippet = page.get("summary") or page.get("snippet") or ""
            source = page.get("siteName", "")

            search_results.append(
                SearchResult(
                    title=title,
                    url=url,
                    snippet=snippet,
                    source=source,
                )
            )
            citations.append(
                Citation(
                    id=i,
                    reference=f"[{i}]",
                    url=url,
                    title=title,
                    snippet=snippet,
                    source=source,
                )
            )

        metadata: dict[str, Any] = {
            "finish_reason": "stop",
            "freshness": freshness,
        }
        if raw.get("log_id"):
            metadata["log_id"] = raw["log_id"]
        original_query = (data.get("queryContext") or {}).get("originalQuery")
        if original_query:
            metadata["original_query"] = original_query

        return WebSearchResponse(
            query=query,
            answer="",
            provider="bocha",
            timestamp=datetime.now().isoformat(),
            model="bocha",
            citations=citations,
            search_results=search_results,
            usage={},
            metadata=metadata,
        )
