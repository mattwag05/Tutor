#!/usr/bin/env bash
set -euo pipefail
# Match the native CI smoke subset using isolated dependencies and synthetic config.
python3 -m venv "$HOME/venv"
"$HOME/venv/bin/pip" install -r requirements/server.txt pytest pytest-asyncio
mkdir -p data/user/settings
printf 'system:\n  language: en\nlogging:\n  level: WARNING\n' > data/user/settings/main.yaml
export PYTHONPATH="$PWD"
"$HOME/venv/bin/python" -c 'from deeptutor.runtime.orchestrator import ChatOrchestrator; from deeptutor.runtime.registry.tool_registry import get_tool_registry; from deeptutor.runtime.registry.capability_registry import get_capability_registry; from deeptutor.services.config.env_store import EnvStore; from deeptutor.api.routers.unified_ws import unified_websocket; from deeptutor.services.prompt.manager import PromptManager; from deeptutor.logging import configure_logging, bind_log_context, capture_process_logs, ProcessLogEvent'
"$HOME/venv/bin/pytest" -q --import-mode=importlib tests/api tests/cli tests/services/test_model_catalog.py tests/services/test_path_service.py tests/services/memory tests/services/session tests/tools
