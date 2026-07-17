from __future__ import annotations

from copy import deepcopy
from typing import Any


SENSITIVE_FIELD_NAMES = {
    "api_key",
    "api token",
    "api_token",
    "authorization",
    "client_secret",
    "password",
    "secret",
    "token",
}


def redact_secret(value: Any) -> Any:
    if not isinstance(value, str):
        return value
    if not value:
        return value
    if value in {"not-needed", "sk-no-key-required"}:
        return value
    if len(value) <= 8:
        return "****"
    return f"{value[:4]}...{value[-4:]}"


def _is_sensitive_key(key: str) -> bool:
    normalized = key.strip().lower()
    if normalized in SENSITIVE_FIELD_NAMES:
        return True
    return normalized.endswith("_api_key") or normalized.endswith("_token")


def sanitize_mapping_for_response(value: Any) -> Any:
    if isinstance(value, list):
        return [sanitize_mapping_for_response(item) for item in value]
    if isinstance(value, dict):
        return {
            key: redact_secret(item) if _is_sensitive_key(str(key)) else sanitize_mapping_for_response(item)
            for key, item in value.items()
        }
    return value


def sanitize_catalog_for_response(catalog: dict[str, Any]) -> dict[str, Any]:
    return sanitize_mapping_for_response(deepcopy(catalog))


def sanitize_env_for_response(env: dict[str, str]) -> dict[str, str]:
    return {
        key: redact_secret(value) if _is_sensitive_key(key) else value
        for key, value in env.items()
    }
