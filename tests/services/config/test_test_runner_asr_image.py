"""Validation paths for the ASR + image probes.

Network-touching probes are out of scope here; we only assert that the
preflight ``ValueError`` checks fire on missing config so the Settings UI
gets a useful error instead of a silent hang.
"""

from __future__ import annotations

import asyncio

import pytest

from deeptutor.services.config.test_runner import ConfigTestRunner, TestRun


def _run(service: str) -> TestRun:
    return TestRun(id=f"{service}-1", service=service)


@pytest.mark.parametrize(
    "service, probe_name",
    [("asr", "_test_asr"), ("image", "_test_image")],
)
def test_probe_rejects_empty_profile(service: str, probe_name: str) -> None:
    runner = ConfigTestRunner()
    probe = getattr(runner, probe_name)
    with pytest.raises(ValueError, match=f"(?i)No active {service} profile"):
        asyncio.run(probe(_run(service), {}, {"id": "m"}))


@pytest.mark.parametrize(
    "service, probe_name",
    [("asr", "_test_asr"), ("image", "_test_image")],
)
def test_probe_rejects_empty_model(service: str, probe_name: str) -> None:
    runner = ConfigTestRunner()
    probe = getattr(runner, probe_name)
    with pytest.raises(ValueError, match=f"(?i)No active {service} model"):
        asyncio.run(probe(_run(service), {"binding": "openai"}, {}))


@pytest.mark.parametrize(
    "service, probe_name, missing_field, expected_match",
    [
        ("asr", "_test_asr", "base_url", "missing base_url"),
        ("asr", "_test_asr", "api_key", "missing api_key"),
        ("image", "_test_image", "base_url", "missing base_url"),
        ("image", "_test_image", "api_key", "missing api_key"),
    ],
)
def test_probe_rejects_missing_field(
    service: str, probe_name: str, missing_field: str, expected_match: str
) -> None:
    runner = ConfigTestRunner()
    probe = getattr(runner, probe_name)
    profile = {
        "binding": "openai",
        "base_url": "https://api.example.test/v1",
        "api_key": "sk-fake",
    }
    profile[missing_field] = ""
    model = {"id": "m"}
    with pytest.raises(ValueError, match=expected_match):
        asyncio.run(probe(_run(service), profile, model))


@pytest.mark.parametrize(
    "service, probe_name",
    [("asr", "_test_asr"), ("image", "_test_image")],
)
def test_probe_rejects_model_without_id(service: str, probe_name: str) -> None:
    runner = ConfigTestRunner()
    probe = getattr(runner, probe_name)
    profile = {
        "binding": "openai",
        "base_url": "https://api.example.test/v1",
        "api_key": "sk-fake",
    }
    with pytest.raises(ValueError, match="no model id selected"):
        asyncio.run(probe(_run(service), profile, {"id": ""}))
