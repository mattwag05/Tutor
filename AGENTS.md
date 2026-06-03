# Tutor — Agent-Native Learning Architecture

## Overview

Tutor is an open-source learning companion focused on one polished creation
loop: prompt -> choose format -> generate a course -> read, review sources,
ask questions, and add another format.

Internal compatibility names remain in place. The Python package, CLI command,
and backend module path are still `deeptutor`; do not rename those paths unless
the migration is explicitly in scope.

## Architecture

```
Entry Points:  Web Creator  |  CLI (Typer)  |  WebSocket /api/v1/ws
                    ↓                   ↓                   ↓
              ┌─────────────────────────────────────────────────┐
              │              ChatOrchestrator                    │
              │   routes to ChatCapability (default)             │
              │   or a selected deep Capability                  │
              └──────────┬──────────────┬───────────────────────┘
                         │              │
              ┌──────────▼──┐  ┌────────▼──────────┐
              │ ToolRegistry │  │ CapabilityRegistry │
              │  (Level 1)   │  │   (Level 2)        │
              └──────────────┘  └────────────────────┘
```

### Level 1 — Tools

Lightweight single-function tools the LLM calls on demand:

| Tool                | Description                                    |
| ------------------- | ---------------------------------------------- |
| `rag`               | Knowledge base retrieval (RAG)                 |
| `web_search`        | Web search with citations                      |
| `code_execution`    | Sandboxed Python execution                     |
| `reason`            | Dedicated deep-reasoning LLM call              |
| `brainstorm`        | Breadth-first idea exploration with rationale  |
| `paper_search`      | arXiv academic paper search                    |
| `geogebra_analysis` | Image → GeoGebra commands (4-stage vision pipeline) |

### Level 2 — Capabilities

Multi-step agent pipelines that take over the conversation:

| Capability       | Stages                                         |
| ---------------- | ---------------------------------------------- |
| `chat`           | responding (default, tool-augmented)           |
| `deep_solve`     | planning → reasoning → writing                 |
| `deep_question`  | ideation → evaluation → generation → validation |

### Primary Product Surface

Tutor's default web surface is a Tutor-native course creator and reader:

| Surface | Purpose |
| --- | --- |
| `web/components/course/TutorCreator.tsx` | Prompt, settings, format selection |
| `web/components/course/CourseReader.tsx` | Lesson reader, sources, formats, questions |
| `web/app/api/generate/course-*` | Course sections and artifacts |

First-class formats are `lesson`, `podcast`, `flashcards`, `studyGuide`,
`quiz`, and `diagram`.

### Deployment Image

The durable production image is `ghcr.io/mattwag05/tutor`. Keep compatibility
service names such as `deeptutor` only where they preserve existing volumes,
compose state, or integrations.

### Attribution

Tutor builds on DeepTutor (`HKUDS/DeepTutor`) for the agent-native backend,
RAG tooling, provider routing, CLI/API compatibility, and learning-runtime
concepts. Tutor also retains OpenMAIC (`THU-MAIC/OpenMAIC`) under
`services/openmaic/` as a classroom-generation, export, media, and visualization
progenitor/archive. Keep those attributions present in user-facing project
docs, but keep the primary UI focused on Tutor's course workflow.

### Playground Plugins

Extended features in `deeptutor/plugins/`:

| Plugin            | Type       | Description                          |
| ----------------- | ---------- | ------------------------------------ |
| `deep_research`   | playground | Multi-agent research + reporting     |

## CLI Usage

```bash
# Install CLI
pip install -e ".[cli]"

# Run any capability (agent-first entry point)
deeptutor run chat "Explain Fourier transform"
deeptutor run deep_solve "Solve x^2=4" -t rag --kb my-kb
deeptutor run deep_question "Linear algebra" --config num_questions=5

# Interactive REPL
deeptutor chat
# (inside the REPL: /regenerate or /retry re-runs the last user message)

# Knowledge bases
deeptutor kb list
deeptutor kb create my-kb --doc textbook.pdf

# Plugins & memory
deeptutor plugin list
deeptutor memory show

# API server (requires .[server])
deeptutor serve --port 8001
```

## Key Files

| Path                          | Purpose                              |
| ----------------------------- | ------------------------------------ |
| `deeptutor/runtime/orchestrator.py` | ChatOrchestrator — unified entry     |
| `deeptutor/core/stream.py`          | StreamEvent protocol                 |
| `deeptutor/core/stream_bus.py`      | Async event fan-out                  |
| `deeptutor/core/tool_protocol.py`   | BaseTool abstract class              |
| `deeptutor/core/capability_protocol.py` | BaseCapability abstract class    |
| `deeptutor/core/context.py`         | UnifiedContext dataclass             |
| `deeptutor/runtime/registry/tool_registry.py` | Tool discovery & registration |
| `deeptutor/runtime/registry/capability_registry.py` | Capability discovery & registration |
| `deeptutor/runtime/mode.py`         | RunMode (CLI vs SERVER)              |
| `deeptutor/capabilities/`           | Built-in capability wrappers         |
| `deeptutor/tools/builtin/`          | Built-in tool wrappers               |
| `deeptutor/plugins/`                | Playground plugins                   |
| `deeptutor/plugins/loader.py`       | Plugin discovery from manifest.yaml  |
| `deeptutor_cli/main.py`             | Typer CLI entry point                |
| `deeptutor/api/routers/unified_ws.py` | Unified WebSocket endpoint         |

## OpenMAIC Archive / Progenitor

OpenMAIC (THU-MAIC) is retained under `services/openmaic/` as archive and
progenitor code. Do not expose classroom as the primary Tutor UI. Port only
course-generation, security, provider, export, or media fixes that directly
serve the simplified Tutor product.

**Integration points:**
- `services/openmaic/lib/integrations/deeptutor-client.ts` — WebSocket RAG client
- `services/openmaic/app/api/knowledge-bases/route.ts` — KB listing endpoint (legacy proxy)
- `services/openmaic/app/api/generate/scene-outlines-stream/route.ts` — RAG-enriched outline generation
- `services/openmaic/components/generation/generation-toolbar.tsx` — KB selector dropdown UI

**Data flow:** User selects KB in toolbar -> FormState -> sessionStorage ->
GenerationSessionState -> fetch body -> API route ->
`getRAGContextForGeneration()` -> enriched prompt -> scene outlines.

---

## Plugin Development

Create a directory under `deeptutor/plugins/<name>/` with:

```
manifest.yaml     # name, version, type, description, stages
capability.py     # class extending BaseCapability
```

Minimal `manifest.yaml`:
```yaml
name: my_plugin
version: 0.1.0
type: playground
description: "My custom plugin"
stages: [step1, step2]
```

Minimal `capability.py`:
```python
from deeptutor.core.capability_protocol import BaseCapability, CapabilityManifest
from deeptutor.core.context import UnifiedContext
from deeptutor.core.stream_bus import StreamBus

class MyPlugin(BaseCapability):
    manifest = CapabilityManifest(
        name="my_plugin",
        description="My custom plugin",
        stages=["step1", "step2"],
    )

    async def run(self, context: UnifiedContext, stream: StreamBus) -> None:
        async with stream.stage("step1", source=self.name):
            await stream.content("Working on step 1...", source=self.name)
        await stream.result({"response": "Done!"}, source=self.name)
```

## Dependency Layers

Defined in `pyproject.toml` `[project.optional-dependencies]`. Mirrored as flat
lists in `requirements/*.txt` for Docker/CI installs without source code.

```
.[cli]            — CLI full (LLM + RAG + providers + document parsing)
.[server]         — .[cli] + FastAPI/uvicorn (for Web/API)
.[tutorbot]       — .[server] + TutorBot agent engine + channel SDKs
.[matrix]         — Matrix channel for TutorBot (matrix-nio[e2e]; needs libolm)
.[math-animator]  — Manim addon (for `deeptutor animate`)
.[dev]            — .[server] + test/lint tools
.[all]            — Everything above
```

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- ALWAYS read graphify-out/GRAPH_REPORT.md before reading any source files, running grep/glob searches, or answering codebase questions. The graph is your primary map of the codebase.
- IF graphify-out/wiki/index.md EXISTS, navigate it instead of reading raw files
- For cross-module "how does X relate to Y" questions, prefer `graphify query "<question>"`, `graphify path "<A>" "<B>"`, or `graphify explain "<concept>"` over grep — these traverse the graph's EXTRACTED + INFERRED edges instead of scanning files
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
