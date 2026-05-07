"""Admin commands for managing the slimmed-down provider catalog.

Bridges between ``data/user/settings/model_catalog.json`` (active providers) and
``archived_catalog.json`` (everything that was archived during the OpenRouter+
Ollama slim-down). The Settings UI hides the archived bindings entirely; this
CLI is the only way to bring an archived profile back without hand-editing
JSON files.
"""

from __future__ import annotations

import datetime
import json
from pathlib import Path
from typing import Any

import typer

from deeptutor.services.path_service import get_path_service

console = None  # rich console is overkill for this; we print plain text


def _settings_dir() -> Path:
    return get_path_service().get_settings_dir()


def _read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh) or {}


def _write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2, ensure_ascii=False)


def register(app: typer.Typer) -> None:
    @app.command("list-archived")
    def list_archived() -> None:
        """Show every profile in archived_catalog.json grouped by service."""
        archive_path = _settings_dir() / "archived_catalog.json"
        archive = _read_json(archive_path)
        runs = archive.get("archived_runs", [])
        if not runs:
            typer.echo("No archived profiles. archived_catalog.json is empty (or missing).")
            return
        for run in runs:
            ts = run.get("archived_at", "?")
            reason = run.get("reason", "")
            typer.echo(f"\n# Archived {ts}  ({reason})")
            for svc, profiles in (run.get("services") or {}).items():
                for p in profiles:
                    binding = p.get("binding") or p.get("provider") or "?"
                    typer.echo(f"  [{svc:9s}] {p['id']}  binding={binding}  name={p.get('name', '')!r}")

    @app.command("restore-profile")
    def restore_profile(
        profile_id: str = typer.Argument(..., help="Profile id to restore (use list-archived to find)."),
        activate: bool = typer.Option(False, "--activate", help="Make the restored profile active."),
    ) -> None:
        """Move a profile from archived_catalog.json back into model_catalog.json.

        The archived entry is removed in-place. If --activate is set, the
        restored profile becomes the active one for its service.
        """
        catalog_path = _settings_dir() / "model_catalog.json"
        archive_path = _settings_dir() / "archived_catalog.json"
        catalog = _read_json(catalog_path)
        archive = _read_json(archive_path)
        runs = archive.get("archived_runs") or []

        found_in_run: dict[str, Any] | None = None
        found_service: str | None = None
        found_profile: dict[str, Any] | None = None

        for run in runs:
            for svc, profiles in (run.get("services") or {}).items():
                for p in profiles:
                    if p.get("id") == profile_id:
                        found_in_run = run
                        found_service = svc
                        found_profile = p
                        break
                if found_profile:
                    break
            if found_profile:
                break

        if not found_profile or not found_service or not found_in_run:
            typer.echo(f"Profile '{profile_id}' not found in archived_catalog.json", err=True)
            raise typer.Exit(code=1)

        # Move out of archive
        run_services = found_in_run.setdefault("services", {})
        run_services[found_service] = [
            p for p in run_services.get(found_service, []) if p.get("id") != profile_id
        ]
        if not run_services[found_service]:
            del run_services[found_service]

        # Drop empty runs to keep the file tidy
        archive["archived_runs"] = [r for r in runs if r.get("services")]

        # Insert into active catalog
        services = catalog.setdefault("services", {})
        section = services.setdefault(
            found_service,
            {"active_profile_id": None, "active_model_id": None, "profiles": []},
        )
        section.setdefault("profiles", []).append(found_profile)
        if activate:
            section["active_profile_id"] = profile_id
            models = found_profile.get("models") or []
            section["active_model_id"] = models[0]["id"] if models else None

        # Note the restoration in the active catalog so future audits know it
        # came back from archive.
        catalog.setdefault("restoration_log", []).append(
            {
                "profile_id": profile_id,
                "service": found_service,
                "restored_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "activated": bool(activate),
            }
        )

        _write_json(catalog_path, catalog)
        _write_json(archive_path, archive)

        typer.echo(
            f"Restored '{profile_id}' to services.{found_service}.profiles "
            f"(activate={activate})"
        )
