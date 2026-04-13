# DeepTutor CLAUDE.md

AI tutoring platform — multi-agent RAG architecture, Python/FastAPI backend, Next.js frontend.

**Status:** 🔨 In Development (synced from upstream 2026-04-10)
**Repo:** https://forgejo.tail6e035b.ts.net/matthewwagner/DeepTutor.git
**Upstream:** https://github.com/HKUDS/DeepTutor (main at 445e762)
**OpenMAIC Upstream:** https://github.com/THU-MAIC/OpenMAIC
**Deployed:** https://deeptutor.tail6e035b.ts.net (Pironman — 100.75.2.44)

---

## Quick Start

```bash
# Activate venv (always required before Python commands)
source .venv/bin/activate

# Start everything (backend + frontend)
.venv/bin/python scripts/start_web.py

# Or run separately:
.venv/bin/python -m uvicorn src.main:app --reload --port 8001   # backend
cd web && npm run dev                                            # frontend
```

**URLs:**
- Backend API docs: http://localhost:8001/docs
- Frontend: http://localhost:3782

---

## Configuration

**Current setup (`.env`):**
- **LLM:** OpenRouter → `anthropic/claude-sonnet-4`
- **Embeddings:** Ollama → `nomic-embed-text` (768 dims, local, free)
- **TTS:** Disabled
- **Web search:** Disabled

**Config loading priority (highest to lowest):**
1. UI settings (runtime, stored in DB via unified config service)
2. `.env` (local secrets, gitignored)
3. Defaults

> The Settings UI allows switching LLM/embedding providers without restarting or editing `.env`.

---

## Architecture

### Backend (`src/`)

```
src/
├── main.py                  # FastAPI app entry point
├── agents/                  # Multi-agent system
│   ├── base_agent.py        # Abstract agent base class
│   ├── chat/                # Conversational QA agent
│   ├── solve/               # Problem-solving agent
│   ├── research/            # Deep research agent
│   ├── guide/               # Learning guidance agent
│   ├── question/            # Question generation agent
│   ├── ideagen/             # Idea generation agent
│   ├── co_writer/           # Co-writing assistant agent
│   └── course/              # Course generation agent (Phase 1)
├── services/
│   ├── llm/                 # LLM abstraction layer
│   │   ├── factory.py       # Provider routing (cloud vs local)
│   │   ├── config.py        # Config loader (.env + unified service)
│   │   └── providers/       # Per-provider implementations
│   ├── embedding/           # Embedding abstraction layer
│   │   ├── config.py        # Embedding config loader
│   │   └── adapters/        # ollama.py, openai_compatible.py, jina.py, cohere.py
│   └── config/              # Unified config service (runtime settings DB)
└── ...
```

### Frontend (`web/`)

Next.js 16 app. Configured via environment variables at build time for API URL.

### Config files (`config/`)

- `main.yaml` — Agent behavior, RAG settings, tool configuration
- `agents.yaml` — Per-agent temperature/max_tokens
- `README.md` — Detailed config docs

---

## Development

### Python

```bash
# Venv is at .venv/ — always activate before working
source .venv/bin/activate

# Run tests
.venv/bin/python -m pytest tests/

# Lint (Ruff)
.venv/bin/ruff check src/
.venv/bin/ruff format src/

# Type checking
.venv/bin/mypy src/
```

**Runtime:** Python 3.11 (pinned via `.venv`)

### Frontend

```bash
cd web
npm run dev       # dev server
npm run build     # production build
npm run lint      # eslint
npx tsc --noEmit  # TypeScript type check (run from web/ dir)
```

---

## Known Gotchas

1. **Ollama embedding URL** — The Ollama adapter uses the native `/api/embed` endpoint, NOT the OpenAI-compatible `/v1/embeddings`. Set `EMBEDDING_HOST=http://localhost:11434` (no `/v1` suffix).

2. **Dimension mismatch** — `nomic-embed-text` outputs 768 dims. If you switch models, update `EMBEDDING_DIMENSION` to match or the vector DB will reject documents.

3. **DeepTutor.env priority** — `start_web.py` loads `DeepTutor.env` (parent of project root, `override=False`) before `.env`. If a `~/DeepTutor.env` exists, its values win. Our setup has no such file — safe.

4. **Unified config service wins** — If you configured LLM/embedding via the UI Settings page, those DB values override `.env`. To reset, use the Settings UI or clear the DB.

5. **`npm audit` warnings** — 24 known vulnerabilities in frontend deps (moderate/high). Not blocking for local dev. Track via a bd task when addressing.

6. **Sidebar refactored to directory** — Upstream refactored `Sidebar.tsx` into `sidebar/SidebarShell.tsx`, `WorkspaceSidebar.tsx`, and `UtilitySidebar.tsx`. The Classroom nav item is in `SidebarShell.tsx` using an `external` field on `NavEntry` for the OpenMAIC link (`https://deeptutor.tail6e035b.ts.net:3100`).

7. **i18n system** — Upstream replaced the old per-file `.ts` translation approach with i18next + JSON locale files at `lib/i18n/locales/{en-US,zh-CN,ja-JP,ru-RU}.json`. All KB toolbar strings are under the `toolbar` namespace. When adding new UI strings, add keys to ALL four locale files.

8. **WebSocket disconnect handling** — Course router's `except` block tries to `send_json` on a closed WebSocket, causing `RuntimeError: Cannot call "send" once a close message has been sent`. Wrap sends in the error handler with a `WebSocketDisconnect` catch.

9. **`response_format` not supported on OpenRouter** — OpenRouter/Anthropic models don't support `response_format={"type": "json_object"}`. Agents that need structured output (CurriculumAgent, EnrichmentAgent) must include JSON formatting instructions in the prompt and parse the response.

10. **Docker: Ollama host** — Inside Docker containers, `EMBEDDING_HOST` must be `http://host.docker.internal:11434` (not `localhost`). `localhost` inside a container is the container itself. The `.env` already has the correct value for Docker runs.

11. **Tailscale sidecar** — `docker-compose.yml` includes `tailscale-deeptutor` sidecar (ScaleTail/coder pattern). `deeptutor` uses `network_mode: service:tailscale-deeptutor` — remove `ports:` and `networks:` directives as they conflict. Auth key in Vaultwarden: `get-secret "Tailscale Auth Key"`. Serve config: `tailscale/ts-serve.json`.

12. **Tailscale sidecar port collision** — `BACKEND_PORT` must NOT be `8001`. Tailscale Serve binds `[tailscale-ip]:8001` in the shared network namespace, so uvicorn's `0.0.0.0:8001` collides and the backend fails to start. Current config: `BACKEND_PORT=8002` (internal); `tailscale/ts-serve.json` proxies `{HOST}:8001 → localhost:8002`; `NEXT_PUBLIC_API_BASE_EXTERNAL=https://deeptutor.tail6e035b.ts.net:8001` unchanged.

---

## Course Builder

The Course Builder feature lives **entirely in `services/openmaic/`** (Oboe.com-style reader), NOT in `src/agents/course/` which does not exist. Entry points:
- `services/openmaic/app/course/page.tsx` — landing (topic input + outline streaming)
- `services/openmaic/app/course/[id]/page.tsx` — article-reader viewer
- `services/openmaic/lib/generation/prompts/templates/course-{outline,section}/` — prompts
- `services/openmaic/lib/server/course-storage.ts` — file-based CRUD under `data/courses/<id>.json`
- `services/openmaic/lib/course/store.ts` — zustand client store

Parallel to the slide-based classroom (NOT a replacement).

---

## Dropbox Conflict Artifacts

The working tree periodically accumulates `* 2.{py,ts,tsx,md,...}` duplicate files from iCloud/Dropbox sync. Verify they're byte-identical to their non-`2` counterparts (`diff -q`), then bulk-move to `~/.Trash/deeptutor-dupes-<date>/` BEFORE any `git merge` or `git pull` — they otherwise pollute merge commits. Python faster than shell for the bulk move: loop `git status --porcelain`, filter `' 2\.[A-Za-z0-9]+$'`, `shutil.move`.

---

## Upstream Sync Procedure

**DeepTutor upstream:** `git fetch upstream && git merge upstream/main` — accept upstream deletion of `docs/roadmap.md` and `docs/guide/docker-start.md` (fork customization notes live in `AGENTS.md` / `CLAUDE.md` instead, not in the docs tree).

**OpenMAIC upstream** (vendored, NOT a submodule):
1. Once-only: `git remote add upstream-openmaic https://github.com/THU-MAIC/OpenMAIC.git`
2. Sync: worktree-overlay 3-way merge. Create worktree of `upstream-openmaic/main` at `/tmp/openmaic-upstream`, `rsync -a --exclude=.git --exclude=node_modules --exclude=.next --exclude='.env*'` into `services/openmaic/`. Back up the protected customization files first. Then for each protected file, run `git merge-file --marker-size=7 <backup> <d797e42:path> <rsynced>` — `d797e42` is the initial vendor commit and serves as the natural merge base.
3. **Protected files list** (3-way merge these, never blind-overwrite):
   - `CLAUDE.md`, `Dockerfile`
   - `app/api/generate/scene-outlines-stream/route.ts`
   - `app/api/health/route.ts`, `app/api/knowledge-bases/route.ts`
   - `app/generation-preview/{page,types}.tsx`, `app/page.tsx`
   - `components/generation/generation-toolbar.tsx`
   - `lib/generation/{generation-pipeline,outline-generator,pipeline-types}.ts`
   - `lib/integrations/*`, `lib/i18n/locales/*.json`, `package.json`
4. **Never** use `git subtree pull` on OpenMAIC — it was added via plain file copy (not `git subtree add`), so subtree tooling produces 60+ spurious add/add conflicts.

---

## Remotes

```
origin    https://forgejo.tail6e035b.ts.net/matthewwagner/DeepTutor.git  (Forgejo, private)
upstream  https://github.com/HKUDS/DeepTutor.git                        (HKUDS original)
```

**Branches:**
- `main` — latest upstream + all local customizations (synced 2026-04-10)
- `backup-pre-upstream-sync` — snapshot of old codebase before upstream sync

To sync upstream changes:
```bash
git fetch upstream
git merge upstream/main
# Re-apply customizations if conflicts arise
```

---

## Task Tracking

> Remote sessions: `BEADS_DIR=/Users/matthewwagner/Projects/DeepTutor/.beads bd <cmd>`

---

## Adding a New Agent Module

Five places must be updated to wire in a new module (e.g. `mymodule`):

1. **`src/agents/mymodule/`** — Create agent files inheriting from `BaseAgent(module_name="mymodule", ...)`
2. **`config/agents.yaml`** — Add `mymodule:` section with `temperature` and `max_tokens`; section key MUST match `module_name` exactly or params silently default
3. **`src/api/routers/mymodule.py`** — Create router; inject LLM config via `get_llm_config()`
4. **`src/api/main.py`** — Add import + `app.include_router(mymodule.router, prefix="/api/v1/mymodule", tags=["mymodule"])`
5. **Frontend nav** — Add entry to `ALL_NAV_ITEMS` in `web/components/Sidebar.tsx` (import icon) AND add path to `DEFAULT_NAV_ORDER.learnResearch` in `web/context/GlobalContext.tsx`. Existing users' saved nav orders auto-merge new defaults on page load.

**Verify wiring:** `source .venv/bin/activate && python -c "from src.api.routers import mymodule; print('OK')"`

**Storage:** New modules must call `mkdir(parents=True, exist_ok=True)` on their own data dirs — `init_user_directories()` only creates pre-declared dirs.

---

## Troubleshooting

| Issue | Diagnosis | Fix |
|-------|-----------|-----|
| **Backend won't start** | Port conflict or missing venv | `lsof -i :8001` to check; ensure `source .venv/bin/activate` first |
| **"No module named X"** | Running outside venv | `source .venv/bin/activate`, then retry command |
| **Embedding errors** | Ollama not running or model missing | `open -a Ollama && ollama pull nomic-embed-text` |
| **LLM calls fail** | OpenRouter key missing/expired | Check `OPENROUTER_API_KEY` in `.env`; test at openrouter.ai |
| **Settings don't apply** | UI config DB overriding `.env` | Change values via Settings UI, or clear the unified config DB |
| **Frontend can't reach backend** | Wrong API URL | Backend must be on port `8001`; check `web/.env.local` for `NEXT_PUBLIC_API_URL` |

---

## Production Deployment (Pironman)

The full stack runs on the Pironman (100.75.2.44) via Docker Compose with a Tailscale sidecar.

**Host:** Pironman (Debian 13, ARM64, 16GB RAM, NVMe)
**Path:** `/home/matthewwagner/DeepTutor/`
**Access:** `ssh root@100.75.2.44`

**Live URLs:**
- Frontend: https://deeptutor.tail6e035b.ts.net (→ 127.0.0.1:3782)
- API: https://deeptutor.tail6e035b.ts.net:8001 (→ 127.0.0.1:8002)
- OpenMAIC: https://deeptutor.tail6e035b.ts.net:3100 (→ 127.0.0.1:3101)

**Containers:** `tailscale-deeptutor`, `deeptutor`, `openmaic`

**Rebuild & deploy:**
```bash
ssh root@100.75.2.44
cd /home/matthewwagner/DeepTutor

# Pull latest from Forgejo
git pull origin main

# Rebuild OpenMAIC image (separate build)
cd services/openmaic && docker build -t openmaic:latest . && cd ../..

# Rebuild DeepTutor + restart stack
docker compose build deeptutor
docker compose up -d
```

**pnpm lockfile:** If `services/openmaic/package.json` has new deps, update the lockfile before building:
```bash
cd services/openmaic
docker run --rm -v $(pwd):/app -w /app node:22-alpine \
  sh -c 'corepack enable && corepack prepare pnpm@10.28.0 --activate && pnpm install --no-frozen-lockfile'
```

---

## OpenMAIC Integration (services/openmaic/)

OpenMAIC is a Next.js classroom/presentation layer that runs as a Docker service alongside DeepTutor, sharing the Tailscale network namespace.

### Port Mapping (critical)

| Service | Internal Port | External (TS Serve) Port |
|---------|--------------|-------------------------|
| DeepTutor Backend (uvicorn) | 8002 | 8001 |
| DeepTutor Frontend (Next.js) | 3782 | 443 |
| OpenMAIC (Next.js) | 3101 | 3100 |

> **Port collision gotcha:** All three services share the tailscale-deeptutor network namespace via `network_mode: service:tailscale-deeptutor`. Tailscale Serve binds the *external* ports (443, 3100, 8001) in this namespace, so internal services MUST use different ports. OpenMAIC listens on 3101, NOT 3100. DeepTutor backend listens on 8002, NOT 8001.

### Integration Client

OpenMAIC talks to DeepTutor's backend via `lib/integrations/deeptutor-client.ts`:
- **Health check:** `checkHealth()` — hits `http://127.0.0.1:8002/health`
- **Knowledge bases:** `listKnowledgeBases()`, `getKnowledgeBase()` — lists/gets DeepTutor KBs
- **RAG queries:** `queryKnowledgeBase()` — WebSocket-based RAG query via chat endpoint
- **Outline enrichment:** `getRAGContextForGeneration()` — injects RAG context into scene/outline generation

All functions degrade gracefully when DeepTutor is unavailable (return empty/null).

**Config env vars (in .env.openmaic):**
- `OPENAI_API_KEY` — OpenRouter API key from Vaultwarden (`get-secret "OpenRouter API - Pi"`)
- `OPENAI_BASE_URL=https://openrouter.ai/api/v1`
- `DEFAULT_MODEL=openai:anthropic/claude-sonnet-4-5`
- `DEEPTUTOR_API_URL=http://127.0.0.1:8002` — internal port, NOT the TS Serve port
- `DEEPTUTOR_ENABLED=true`

### New API Endpoints

- `GET /api/health` — Now includes `integrations.deepTutor.status` (healthy/unavailable)
- `GET /api/knowledge-bases` — Lists DeepTutor knowledge bases with graceful degradation

### Docker Build & Restart

OpenMAIC uses a multi-stage pnpm Docker build. The image is built on the Pi:
```bash
cd services/openmaic
docker build -t openmaic:latest .
```

After rebuilding or changing env vars, recreate (not restart) the container to pick up new env/compose changes:
```bash
docker compose up -d openmaic   # recreates if config changed
# NOT: docker compose restart openmaic  (restart doesn't re-read compose file)
```

### Cowork Scheduled Task Limitation

Cowork Desktop scheduled tasks run in sandboxed environments that do **NOT** have Tailscale access. They cannot SSH to Tailscale IPs (e.g., 100.120.127.35). For Pi operations, use Desktop Commander (runs on the Mac host which has Tailscale) or run commands directly from a Dispatch session.
