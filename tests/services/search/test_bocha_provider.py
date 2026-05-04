"""Tests for the Bocha web-search provider adapter."""

from __future__ import annotations

from typing import Any

import pytest

from deeptutor.services.search.providers.bocha import BochaProvider


class _FakeResponse:
    def __init__(self, status_code: int, payload: dict[str, Any]) -> None:
        self.status_code = status_code
        self._payload = payload
        self.text = ""

    def json(self) -> dict[str, Any]:
        return self._payload


def _success_payload() -> dict[str, Any]:
    return {
        "code": 200,
        "msg": None,
        "log_id": "abc123",
        "data": {
            "queryContext": {"originalQuery": "ai drug discovery"},
            "webPages": {
                "value": [
                    {
                        "name": "Result One",
                        "url": "https://example.com/one",
                        "snippet": "First snippet",
                        "summary": "First long-form summary",
                        "siteName": "Example",
                    },
                    {
                        "name": "Result Two",
                        "url": "https://example.com/two",
                        "snippet": "Second snippet",
                    },
                ]
            },
        },
    }


def test_bocha_happy_path(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, Any] = {}

    def fake_post(url: str, **kwargs: Any) -> _FakeResponse:
        captured["url"] = url
        captured["json"] = kwargs.get("json")
        captured["headers"] = kwargs.get("headers")
        captured["timeout"] = kwargs.get("timeout")
        return _FakeResponse(200, _success_payload())

    monkeypatch.setattr(
        "deeptutor.services.search.providers.bocha.requests.post",
        fake_post,
    )

    provider = BochaProvider(api_key="test-key")
    response = provider.search("ai drug discovery", count=2)

    assert captured["url"] == "https://api.bocha.cn/v1/web-search"
    assert captured["headers"]["Authorization"] == "Bearer test-key"
    assert captured["headers"]["Content-Type"] == "application/json"
    assert captured["json"] == {
        "query": "ai drug discovery",
        "freshness": "noLimit",
        "summary": True,
        "count": 2,
    }
    assert "api_key" not in captured["json"]

    assert response.provider == "bocha"
    assert response.answer == ""
    assert response.model == "bocha"
    assert len(response.search_results) == 2
    first = response.search_results[0]
    assert first.title == "Result One"
    assert first.url == "https://example.com/one"
    assert first.snippet == "First long-form summary"
    assert first.source == "Example"
    second = response.search_results[1]
    assert second.snippet == "Second snippet"
    assert response.metadata["log_id"] == "abc123"
    assert response.metadata["original_query"] == "ai drug discovery"
    assert response.metadata["freshness"] == "noLimit"
    assert len(response.citations) == 2


def test_bocha_count_clamped(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, Any] = {}

    def fake_post(url: str, **kwargs: Any) -> _FakeResponse:
        captured["json"] = kwargs.get("json")
        return _FakeResponse(200, _success_payload())

    monkeypatch.setattr(
        "deeptutor.services.search.providers.bocha.requests.post",
        fake_post,
    )
    provider = BochaProvider(api_key="test-key")
    provider.search("hello", count=999)
    assert captured["json"]["count"] == 50
    provider.search("hello", count=0)
    assert captured["json"]["count"] == 1


def test_bocha_skips_results_without_url(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = {
        "code": 200,
        "data": {
            "webPages": {
                "value": [
                    {"name": "no url here"},
                    {"name": "Has URL", "url": "https://example.com/x"},
                ]
            }
        },
    }
    monkeypatch.setattr(
        "deeptutor.services.search.providers.bocha.requests.post",
        lambda *_a, **_kw: _FakeResponse(200, payload),
    )
    provider = BochaProvider(api_key="test-key")
    response = provider.search("hello")
    assert len(response.search_results) == 1
    assert response.search_results[0].url == "https://example.com/x"


def test_bocha_api_error_in_body(monkeypatch: pytest.MonkeyPatch) -> None:
    error_payload = {
        "code": "401",
        "message": "invalid api key",
        "log_id": "trace-xyz",
    }
    monkeypatch.setattr(
        "deeptutor.services.search.providers.bocha.requests.post",
        lambda *_a, **_kw: _FakeResponse(200, error_payload),
    )
    provider = BochaProvider(api_key="bad-key")
    with pytest.raises(Exception) as exc_info:
        provider.search("hello")
    msg = str(exc_info.value)
    assert "401" in msg
    assert "invalid api key" in msg
    assert "trace-xyz" in msg


def test_bocha_http_error(monkeypatch: pytest.MonkeyPatch) -> None:
    error_payload = {"code": 429, "message": "rate limited", "log_id": "lim-1"}
    monkeypatch.setattr(
        "deeptutor.services.search.providers.bocha.requests.post",
        lambda *_a, **_kw: _FakeResponse(429, error_payload),
    )
    provider = BochaProvider(api_key="test-key")
    with pytest.raises(Exception) as exc_info:
        provider.search("hello")
    msg = str(exc_info.value)
    assert "429" in msg
    assert "rate limited" in msg
    assert "lim-1" in msg


def test_bocha_registered_in_provider_registry() -> None:
    from deeptutor.services.search.providers import get_provider, list_providers

    assert "bocha" in list_providers()
    instance = get_provider("bocha", api_key="test-key")
    assert instance.name == "bocha"
    assert instance.display_name == "Bocha"
    assert instance.supports_answer is False


def test_bocha_listed_in_settings_choices() -> None:
    from deeptutor.api.routers.settings import _provider_choices

    choices = _provider_choices()
    search_values = [p["value"] for p in choices["search"]]
    assert "bocha" in search_values


def test_bocha_in_runtime_supported_set() -> None:
    from deeptutor.services.config.provider_runtime import (
        SEARCH_ENV_FALLBACK,
        SUPPORTED_SEARCH_PROVIDERS,
    )

    assert "bocha" in SUPPORTED_SEARCH_PROVIDERS
    assert SEARCH_ENV_FALLBACK["bocha"] == ("BOCHA_API_KEY",)
