"""
Settings API Router
===================

UI preferences, configuration catalog management, and detailed streamed tests.
"""

from __future__ import annotations

import asyncio
import json
import time
from typing import Any, Dict, List, Literal, Optional

import yaml
from dotenv import set_key, unset_key
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from deeptutor.services.config import get_config_test_runner, get_model_catalog_service
from deeptutor.services.embedding.client import reset_embedding_client
from deeptutor.services.llm.client import reset_llm_client
from deeptutor.services.llm.config import clear_llm_config_cache
from deeptutor.services.model_selection import list_llm_options
from deeptutor.services.path_service import get_path_service

router = APIRouter()

_path_service = get_path_service()
SETTINGS_FILE = _path_service.get_settings_file("interface")
AUTH_FILE = _path_service.get_settings_file("auth")

# OpenMAIC reads `process.env.ACCESS_CODE` at request time. We keep both
# write targets in sync so docker-compose runs (project-root `.env.openmaic`)
# and local `pnpm dev` runs (`services/openmaic/.env.local`) both pick up
# changes after their respective Next.js process restarts.
_OPENMAIC_ENV_PATHS = (
    _path_service.project_root / ".env.openmaic",
    _path_service.project_root / "services" / "openmaic" / ".env.local",
)

DEFAULT_SIDEBAR_NAV_ORDER = {
    "start": ["/", "/history", "/knowledge", "/notebook"],
    "learnResearch": ["/question", "/solver", "/research", "/co_writer"],
}

DEFAULT_FEATURE_FLAGS = {
    # Course illustrations cost 1 image generation per block — gate keeps the
    # Image catalog optional for users who don't need it.
    "course_illustrations": False,
}

DEFAULT_UI_SETTINGS = {
    "theme": "light",
    "language": "en",
    "sidebar_description": "✨ Data Intelligence Lab @ HKU",
    "sidebar_nav_order": DEFAULT_SIDEBAR_NAV_ORDER,
    "features": DEFAULT_FEATURE_FLAGS,
}


class SidebarNavOrder(BaseModel):
    start: List[str]
    learnResearch: List[str]


class FeatureFlags(BaseModel):
    course_illustrations: bool = False


class UISettings(BaseModel):
    theme: Literal["light", "dark", "glass", "snow"] = "light"
    language: Literal["zh", "en"] = "en"
    sidebar_description: Optional[str] = None
    sidebar_nav_order: Optional[SidebarNavOrder] = None
    features: Optional[FeatureFlags] = None


class ThemeUpdate(BaseModel):
    theme: Literal["light", "dark", "glass", "snow"]


class LanguageUpdate(BaseModel):
    language: Literal["zh", "en"]


class SidebarDescriptionUpdate(BaseModel):
    description: str


class SidebarNavOrderUpdate(BaseModel):
    nav_order: SidebarNavOrder


class CatalogPayload(BaseModel):
    catalog: dict[str, Any]


class AuthSettings(BaseModel):
    access_code: str = ""


def _invalidate_runtime_caches() -> None:
    """Force runtime clients/config to pick up the latest saved catalog."""
    clear_llm_config_cache()
    reset_llm_client()
    reset_embedding_client()


def load_ui_settings() -> dict[str, Any]:
    if SETTINGS_FILE.exists():
        try:
            with open(SETTINGS_FILE, encoding="utf-8") as handle:
                saved = json.load(handle)
                return {**DEFAULT_UI_SETTINGS, **saved}
        except Exception:
            pass
    return DEFAULT_UI_SETTINGS.copy()


def save_ui_settings(settings: dict[str, Any]) -> None:
    SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(SETTINGS_FILE, "w", encoding="utf-8") as handle:
        json.dump(settings, handle, ensure_ascii=False, indent=2)


def load_auth_settings() -> dict[str, Any]:
    if AUTH_FILE.exists():
        try:
            with open(AUTH_FILE, encoding="utf-8") as handle:
                payload = json.load(handle)
                if isinstance(payload, dict):
                    return {"access_code": str(payload.get("access_code", ""))}
        except Exception:
            pass
    return {"access_code": ""}


def save_auth_settings(settings: dict[str, Any]) -> None:
    AUTH_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(AUTH_FILE, "w", encoding="utf-8") as handle:
        json.dump(settings, handle, ensure_ascii=False, indent=2)


def _write_access_code_to_openmaic_env(access_code: str) -> list[str]:
    """Sync ACCESS_CODE to OpenMAIC's env-file targets. Empty value removes
    the line so OpenMAIC's ``if (!accessCode)`` check disables the gate.
    """
    written: list[str] = []
    for path in _OPENMAIC_ENV_PATHS:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.touch(exist_ok=True)
        if access_code:
            set_key(str(path), "ACCESS_CODE", access_code, quote_mode="never")
        else:
            unset_key(str(path), "ACCESS_CODE")
        written.append(str(path))
    return written


def _provider_choices() -> dict[str, list[dict[str, str]]]:
    """Build dropdown options for provider selection, keyed by service type."""
    from deeptutor.services.config.provider_runtime import EMBEDDING_PROVIDERS
    from deeptutor.services.provider_registry import PROVIDERS

    llm = sorted(
        [
            {
                "value": s.name,
                "label": (
                    "Custom (OpenAI API)"
                    if s.name == "custom"
                    else "Custom (Anthropic API)"
                    if s.name == "custom_anthropic"
                    else s.label
                ),
                "base_url": s.default_api_base,
            }
            for s in PROVIDERS
        ],
        key=lambda p: p["label"].lower(),
    )
    embedding = sorted(
        [
            {
                "value": name,
                "label": spec.label,
                "base_url": spec.default_api_base,
                "default_dim": str(spec.default_dim) if spec.default_dim else "",
            }
            for name, spec in EMBEDDING_PROVIDERS.items()
            if name != "custom_openai_sdk"
        ],
        key=lambda p: p["label"].lower(),
    )
    search = [
        {"value": "bocha", "label": "Bocha", "base_url": ""},
        {"value": "brave", "label": "Brave", "base_url": ""},
        {"value": "duckduckgo", "label": "DuckDuckGo", "base_url": ""},
        {"value": "jina", "label": "Jina", "base_url": ""},
        {"value": "ollama", "label": "Ollama", "base_url": ""},
        {"value": "perplexity", "label": "Perplexity", "base_url": ""},
        {"value": "searxng", "label": "SearXNG", "base_url": ""},
        {"value": "serper", "label": "Serper", "base_url": ""},
        {"value": "tavily", "label": "Tavily", "base_url": ""},
    ]
    tts = [
        {"value": "openai-tts", "label": "OpenAI TTS", "base_url": "https://api.openai.com/v1"},
        {"value": "azure-tts", "label": "Azure TTS", "base_url": ""},
        {"value": "elevenlabs-tts", "label": "ElevenLabs", "base_url": "https://api.elevenlabs.io/v1"},
        {"value": "glm-tts", "label": "GLM TTS", "base_url": ""},
        {"value": "qwen-tts", "label": "Qwen TTS", "base_url": ""},
        {"value": "doubao-tts", "label": "Doubao TTS", "base_url": ""},
        {"value": "minimax-tts", "label": "MiniMax TTS", "base_url": ""},
        {"value": "openrouter-tts", "label": "OpenRouter TTS", "base_url": "https://openrouter.ai/api/v1"},
        {"value": "voxcpm-tts", "label": "VoxCPM (local)", "base_url": ""},
    ]
    asr = [
        {"value": "openai-whisper", "label": "OpenAI Whisper", "base_url": "https://api.openai.com/v1"},
        {"value": "qwen-asr", "label": "Qwen ASR", "base_url": ""},
        {"value": "openrouter-asr", "label": "OpenRouter ASR", "base_url": "https://openrouter.ai/api/v1"},
        {"value": "browser-native", "label": "Browser Web Speech (no key)", "base_url": ""},
    ]
    image = [
        {"value": "openai-image", "label": "OpenAI Images", "base_url": "https://api.openai.com/v1"},
        {"value": "grok-image", "label": "xAI Grok Image", "base_url": ""},
        {"value": "minimax-image", "label": "MiniMax Image", "base_url": ""},
        {"value": "nano-banana", "label": "Nano Banana", "base_url": ""},
        {"value": "openrouter-image", "label": "OpenRouter Image", "base_url": "https://openrouter.ai/api/v1"},
        {"value": "qwen-image", "label": "Qwen Image", "base_url": ""},
        {"value": "seedream", "label": "Seedream", "base_url": ""},
    ]
    video = [
        {"value": "kling", "label": "Kling", "base_url": ""},
        {"value": "minimax-video", "label": "MiniMax Video", "base_url": ""},
        {"value": "seedance", "label": "Seedance", "base_url": ""},
        {"value": "sora", "label": "Sora", "base_url": ""},
        {"value": "veo", "label": "Veo", "base_url": ""},
        {"value": "grok-video", "label": "xAI Grok Video", "base_url": ""},
    ]
    return {
        "llm": llm,
        "embedding": embedding,
        "search": search,
        "tts": tts,
        "asr": asr,
        "image": image,
        "video": video,
    }


@router.get("")
async def get_settings():
    return {
        "ui": load_ui_settings(),
        "catalog": get_model_catalog_service().load(),
        "providers": _provider_choices(),
    }


@router.get("/catalog")
async def get_catalog():
    return {"catalog": get_model_catalog_service().load()}


@router.get("/llm-options")
async def get_llm_options():
    return list_llm_options(get_model_catalog_service().load())


@router.put("/catalog")
async def update_catalog(payload: CatalogPayload):
    catalog = get_model_catalog_service().save(payload.catalog)
    _invalidate_runtime_caches()
    return {"catalog": catalog}


@router.post("/apply")
async def apply_catalog(payload: CatalogPayload | None = None):
    catalog = payload.catalog if payload is not None else get_model_catalog_service().load()
    rendered = get_model_catalog_service().apply(catalog)
    _invalidate_runtime_caches()
    return {
        "message": "Catalog applied to the active .env configuration.",
        "catalog": get_model_catalog_service().load(),
        "env": rendered,
    }


@router.get("/auth")
async def get_auth():
    """Return the unified ACCESS_CODE used to gate OpenMAIC routes.

    PRD §11.8 (single-secret auth, recommended). Stored in
    ``data/user/settings/auth.json`` and synced to OpenMAIC's env files on
    write so the Next.js middleware reads it from ``process.env``.
    """
    return load_auth_settings()


@router.put("/auth")
async def update_auth(update: AuthSettings):
    settings = update.model_dump()
    save_auth_settings(settings)
    written = _write_access_code_to_openmaic_env(settings["access_code"])
    return {
        "access_code": settings["access_code"],
        "env_files_written": written,
        "message": (
            "ACCESS_CODE saved. Restart the OpenMAIC container "
            "(or `pnpm dev` server) to pick up the new value."
        ),
    }


@router.put("/theme")
async def update_theme(update: ThemeUpdate):
    current_ui = load_ui_settings()
    current_ui["theme"] = update.theme
    save_ui_settings(current_ui)
    return {"theme": update.theme}


@router.put("/language")
async def update_language(update: LanguageUpdate):
    current_ui = load_ui_settings()
    current_ui["language"] = update.language
    save_ui_settings(current_ui)
    return {"language": update.language}


@router.put("/ui")
async def update_ui_settings(update: UISettings):
    current_ui = load_ui_settings()
    current_ui.update(update.model_dump(exclude_none=True))
    save_ui_settings(current_ui)
    return current_ui


@router.post("/reset")
async def reset_settings():
    save_ui_settings(DEFAULT_UI_SETTINGS)
    return DEFAULT_UI_SETTINGS


@router.get("/themes")
async def get_themes():
    return {
        "themes": [
            {"id": "snow", "name": "Snow"},
            {"id": "light", "name": "Light"},
            {"id": "dark", "name": "Dark"},
            {"id": "glass", "name": "Glass"},
        ]
    }


@router.get("/sidebar")
async def get_sidebar_settings():
    current_ui = load_ui_settings()
    return {
        "description": current_ui.get(
            "sidebar_description", DEFAULT_UI_SETTINGS["sidebar_description"]
        ),
        "nav_order": current_ui.get("sidebar_nav_order", DEFAULT_UI_SETTINGS["sidebar_nav_order"]),
    }


@router.put("/sidebar/description")
async def update_sidebar_description(update: SidebarDescriptionUpdate):
    current_ui = load_ui_settings()
    current_ui["sidebar_description"] = update.description
    save_ui_settings(current_ui)
    return {"description": update.description}


@router.put("/sidebar/nav-order")
async def update_sidebar_nav_order(update: SidebarNavOrderUpdate):
    current_ui = load_ui_settings()
    current_ui["sidebar_nav_order"] = update.nav_order.model_dump()
    save_ui_settings(current_ui)
    return {"nav_order": update.nav_order.model_dump()}


@router.post("/tests/{service}/start")
async def start_service_test(service: str, payload: CatalogPayload | None = None):
    run = get_config_test_runner().start(service, payload.catalog if payload else None)
    return {"run_id": run.id}


@router.get("/tests/{service}/{run_id}/events")
async def stream_service_test_events(service: str, run_id: str, request: Request):
    runner = get_config_test_runner()
    run = runner.get(run_id)

    async def event_stream():
        sent = 0
        while True:
            if await request.is_disconnected():
                return
            events = run.snapshot(sent)
            if events:
                for event in events:
                    yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
                sent += len(events)
                if events[-1]["type"] in {"completed", "failed"}:
                    return
            else:
                yield "event: heartbeat\ndata: {}\n\n"
            await asyncio.sleep(0.35)

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/tests/{service}/{run_id}/cancel")
async def cancel_service_test(service: str, run_id: str):
    get_config_test_runner().cancel(run_id)
    return {"message": "Cancelled"}


TOUR_CACHE = _path_service.get_settings_dir() / ".tour_cache.json"


@router.get("/tour/status")
async def tour_status():
    if TOUR_CACHE.exists():
        try:
            cache = json.loads(TOUR_CACHE.read_text(encoding="utf-8"))
            return {
                "active": True,
                "status": cache.get("status", "unknown"),
                "launch_at": cache.get("launch_at"),
                "redirect_at": cache.get("redirect_at"),
            }
        except Exception:
            pass
    return {"active": False, "status": "none", "launch_at": None, "redirect_at": None}


class TourCompletePayload(BaseModel):
    catalog: dict[str, Any] | None = None
    test_results: dict[str, str] | None = None


@router.post("/tour/complete")
async def complete_tour(payload: TourCompletePayload | None = None):
    catalog = payload.catalog if payload and payload.catalog else get_model_catalog_service().load()
    rendered = get_model_catalog_service().apply(catalog)
    _invalidate_runtime_caches()
    now = int(time.time())
    launch_at = now + 3
    redirect_at = now + 5

    if TOUR_CACHE.exists():
        try:
            cache = json.loads(TOUR_CACHE.read_text(encoding="utf-8"))
        except Exception:
            cache = {}
        cache["status"] = "completed"
        cache["launch_at"] = launch_at
        cache["redirect_at"] = redirect_at
        if payload and payload.test_results:
            cache["test_results"] = payload.test_results
        TOUR_CACHE.write_text(json.dumps(cache, indent=2), encoding="utf-8")

    return {
        "status": "completed",
        "message": "Configuration saved. DeepTutor will restart shortly.",
        "launch_at": launch_at,
        "redirect_at": redirect_at,
        "env": rendered,
    }


@router.post("/tour/reopen")
async def reopen_tour():
    return {
        "message": "Run the terminal setup guide from the project root to re-open the guided setup.",
        "command": "python scripts/start_tour.py",
    }


# ---------------------------------------------------------------------------
# Agent Manifest Tier Overrides
# ---------------------------------------------------------------------------

AGENTS_YAML_PATH = _path_service.get_settings_dir() / "agents.yaml"

_MANIFEST_TIERS = {"tutor-cheap", "tutor-balanced", "tutor-premium"}

# Maps agent key → (section, name) in agents.yaml
_AGENT_SECTION_MAP: dict[str, tuple[str, str]] = {
    "solve": ("capabilities", "solve"),
    "research": ("capabilities", "research"),
    "question": ("capabilities", "question"),
    "co_writer": ("capabilities", "co_writer"),
    "chat": ("capabilities", "chat"),
    "brainstorm": ("tools", "brainstorm"),
    "personalization": ("services", "personalization"),
    "vision_solver": ("plugins", "vision_solver"),
    "math_animator": ("plugins", "math_animator"),
}


def _load_agents_yaml() -> dict[str, Any]:
    if AGENTS_YAML_PATH.exists():
        with open(AGENTS_YAML_PATH, encoding="utf-8") as f:
            return yaml.safe_load(f) or {}
    return {}


def _save_agents_yaml(data: dict[str, Any]) -> None:
    AGENTS_YAML_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(AGENTS_YAML_PATH, "w", encoding="utf-8") as f:
        yaml.dump(data, f, default_flow_style=False, allow_unicode=True)


class AgentTierUpdate(BaseModel):
    agents: Dict[str, str]


@router.get("/agents")
async def get_agent_tiers():
    """Return the current Manifest tier assigned to each agent."""
    data = _load_agents_yaml()
    result: dict[str, str] = {}
    for agent_key, (section, name) in _AGENT_SECTION_MAP.items():
        entry = (data.get(section, {}) or {}).get(name, {}) or {}
        result[agent_key] = entry.get("profile", "tutor-balanced")
    return {"agents": result}


@router.put("/agents")
async def update_agent_tiers(update: AgentTierUpdate):
    """Persist per-agent Manifest tier assignments to agents.yaml."""
    unknown_agents = set(update.agents) - set(_AGENT_SECTION_MAP)
    if unknown_agents:
        from fastapi import HTTPException

        raise HTTPException(status_code=422, detail=f"Unknown agents: {sorted(unknown_agents)}")
    invalid_tiers = {t for t in update.agents.values() if t not in _MANIFEST_TIERS}
    if invalid_tiers:
        from fastapi import HTTPException

        raise HTTPException(status_code=422, detail=f"Invalid tiers: {sorted(invalid_tiers)}")

    data = _load_agents_yaml()
    for agent_key, tier in update.agents.items():
        section, name = _AGENT_SECTION_MAP[agent_key]
        if section not in data:
            data[section] = {}
        if name not in data[section]:
            data[section][name] = {}
        data[section][name]["profile"] = tier
    _save_agents_yaml(data)
    return {"agents": update.agents}
