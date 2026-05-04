"""Tests for GET/PUT /api/v1/settings/auth (Phase A.5)."""

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


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    """Spin up the settings router with auth.json + env writes redirected
    to a tmpdir so we never touch the real `data/user/settings/auth.json`,
    `.env.openmaic`, or `services/openmaic/.env.local`.
    """
    settings_module = importlib.import_module("deeptutor.api.routers.settings")

    auth_file = tmp_path / "settings" / "auth.json"
    openmaic_env = tmp_path / ".env.openmaic"
    openmaic_local = tmp_path / "services" / "openmaic" / ".env.local"

    monkeypatch.setattr(settings_module, "AUTH_FILE", auth_file)
    monkeypatch.setattr(
        settings_module,
        "_OPENMAIC_ENV_PATHS",
        (openmaic_env, openmaic_local),
    )

    app = FastAPI()
    app.include_router(settings_module.router, prefix="/api/v1/settings")
    return TestClient(app)


def test_get_returns_empty_when_unset(client: TestClient) -> None:
    response = client.get("/api/v1/settings/auth")
    assert response.status_code == 200
    assert response.json() == {"access_code": ""}


def test_put_saves_and_writes_env_files(
    client: TestClient, tmp_path: Path
) -> None:
    response = client.put(
        "/api/v1/settings/auth", json={"access_code": "secret-abc"}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["access_code"] == "secret-abc"
    assert len(body["env_files_written"]) == 2

    assert client.get("/api/v1/settings/auth").json() == {
        "access_code": "secret-abc"
    }

    for path_str in body["env_files_written"]:
        contents = Path(path_str).read_text(encoding="utf-8")
        assert "ACCESS_CODE=secret-abc" in contents


def test_put_rotation_does_not_duplicate_lines(
    client: TestClient,
) -> None:
    client.put("/api/v1/settings/auth", json={"access_code": "first"})
    response = client.put(
        "/api/v1/settings/auth", json={"access_code": "second"}
    )
    body = response.json()
    for path_str in body["env_files_written"]:
        contents = Path(path_str).read_text(encoding="utf-8")
        access_lines = [
            line for line in contents.splitlines() if line.startswith("ACCESS_CODE=")
        ]
        assert access_lines == ["ACCESS_CODE=second"]


def test_put_empty_value_clears_env_line(client: TestClient) -> None:
    client.put("/api/v1/settings/auth", json={"access_code": "to-be-cleared"})
    response = client.put("/api/v1/settings/auth", json={"access_code": ""})
    body = response.json()
    for path_str in body["env_files_written"]:
        contents = Path(path_str).read_text(encoding="utf-8")
        assert not any(
            line.startswith("ACCESS_CODE=") for line in contents.splitlines()
        )


def test_put_preserves_other_env_vars(
    client: TestClient, tmp_path: Path
) -> None:
    """A first PUT establishes the env file with one ACCESS_CODE line.
    A subsequent PUT must rotate the value without touching unrelated keys
    we add to the file in between.
    """
    client.put("/api/v1/settings/auth", json={"access_code": "v1"})

    settings_module = importlib.import_module("deeptutor.api.routers.settings")
    for path in settings_module._OPENMAIC_ENV_PATHS:
        text = path.read_text(encoding="utf-8")
        path.write_text(
            "OPENAI_API_KEY=keep-me\n# a comment\n" + text,
            encoding="utf-8",
        )

    client.put("/api/v1/settings/auth", json={"access_code": "v2"})

    for path in settings_module._OPENMAIC_ENV_PATHS:
        text = path.read_text(encoding="utf-8")
        assert "OPENAI_API_KEY=keep-me" in text
        assert "# a comment" in text
        assert "ACCESS_CODE=v2" in text
        assert "ACCESS_CODE=v1" not in text
