"""Tests for placeholder-secret sanitization in ``EnvStore``.

Deploy templates use ``__NAME__`` sentinels (e.g. ``IMAGE_API_KEY=__OR_KEY__``)
that are meant to be substituted with a real value at provisioning time. If the
substitution is missed, the literal sentinel must NOT be persisted into the
catalog as a credential — it produces an opaque upstream 401 instead of the
clear "missing api_key" preflight error (DeepTutor-lb0r).

Covers:

* ``_sanitize_secret`` maps any ``__PLACEHOLDER__`` token to ``""`` and leaves
  real keys (and ordinary values) untouched.
* ``EnvStore.as_summary`` applies it to every service's ``api_key``.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from deeptutor.services.config.env_store import EnvStore, _sanitize_secret


@pytest.fixture(autouse=True)
def _clean_secret_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """``EnvStore.load`` setdefaults each key into ``os.environ`` — an existing
    process env value would then win over the tmp ``.env``. Clear the keys this
    suite writes so the file is authoritative."""
    for key in ("IMAGE_API_KEY", "LLM_API_KEY", "TTS_API_KEY"):
        monkeypatch.delenv(key, raising=False)


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("__OR_KEY__", ""),
        ("__IMAGE_API_KEY__", ""),
        ("__ANYTHING_AT_ALL__", ""),
        ("  __OR_KEY__  ", ""),  # padded sentinel still neutralized
        ("", ""),
        (None, ""),
        ("sk-or-v1-realkey", "sk-or-v1-realkey"),
        ("  sk-real  ", "sk-real"),  # ordinary value is just trimmed
        ("__not_upper__", "__not_upper__"),  # lowercase ≠ the __NAME__ convention
        ("OR_KEY", "OR_KEY"),  # no surrounding dunders → real value
    ],
)
def test_sanitize_secret(value: str | None, expected: str) -> None:
    assert _sanitize_secret(value) == expected


def test_as_summary_neutralizes_image_placeholder(tmp_path: Path) -> None:
    env_path = tmp_path / ".env"
    env_path.write_text(
        "\n".join(
            [
                "IMAGE_BINDING=openrouter-image",
                "IMAGE_API_KEY=__OR_KEY__",
                "IMAGE_HOST=https://openrouter.ai/api/v1",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    summary = EnvStore(path=env_path).as_summary()
    # Placeholder dropped so _profile_preflight reports "missing api_key"
    # rather than seeding a broken credential that 401s upstream.
    assert summary.image["api_key"] == ""
    # Non-secret fields are untouched.
    assert summary.image["binding"] == "openrouter-image"
    assert summary.image["host"] == "https://openrouter.ai/api/v1"


def test_as_summary_passes_through_real_key(tmp_path: Path) -> None:
    env_path = tmp_path / ".env"
    env_path.write_text("IMAGE_API_KEY=sk-or-v1-real\n", encoding="utf-8")
    summary = EnvStore(path=env_path).as_summary()
    assert summary.image["api_key"] == "sk-or-v1-real"
