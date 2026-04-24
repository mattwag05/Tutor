# DeepTutor (mattwag05 fork)

Fork of [HKUDS/DeepTutor](https://github.com/HKUDS/DeepTutor) that adds an
[OpenMAIC](https://github.com/THU-MAIC/OpenMAIC) classroom/presentation layer
as a vendored service, a pragmatic DeepTutor-RAG adapter that feeds knowledge-base
metadata into OpenMAIC's outline generation, and a single-host Docker Compose
deployment behind a Tailscale sidecar.

Upstream tracking: DeepTutor **v1.2.3** · OpenMAIC **v0.2.0 + 21 commits** (synced 2026-04-24).

For the original HKUDS feature tour, release notes, CLI command reference, and
provider catalog, see the [upstream README](https://github.com/HKUDS/DeepTutor/blob/main/README.md).
This document covers only what's different in this fork.

---

## Live deployment

Running on a single Raspberry Pi 5 (`pironman`, 100.75.2.44) via Docker Compose.

| Surface | URL | Internal port |
|---|---|---|
| Frontend (DeepTutor web) | https://deeptutor.tail6e035b.ts.net | 3782 |
| Backend (FastAPI) | https://deeptutor-api.tail6e035b.ts.net | 8001 |
| OpenMAIC (Classroom / Course Builder) | https://openmaic.tail6e035b.ts.net | 3101 |

Each service is fronted by [caddy-tailscale](https://github.com/tailscale/caddy-tailscale)
running on Pironman — the Caddyfile uses `bind tailscale/<hostname>` to create
a tsnet node per service and reverse-proxy to the local Docker container.
The containers themselves bind to `127.0.0.1` on the host and are only
reachable through Caddy. Compose file for the running stack is
`docker-compose.pironman.yml` (Pi-local, not in this repo — bridge-network
topology with an env-file per service). See the Deployment section below.

---

## Architecture

```
DeepTutor/
├── deeptutor/                    FastAPI backend (Python 3.11+)
│   ├── agents/                   chat · solve · research · guide · question · visualize · math_animator · notebook · vision_solver
│   ├── book/                     Book capability (spine → pages → typed blocks) — from upstream v1.2.0
│   ├── co_writer/                Multi-doc Co-Writer workspace — from upstream v1.2.0
│   ├── capabilities/             Answer-now primitive, chat, deep_solve, deep_research, visualize, math_animator
│   ├── tutorbot/                 Persistent autonomous agents (discord · slack · telegram · email · matrix · ...)
│   ├── api/routers/              FastAPI routers (book · chat · co_writer · knowledge · memory · notebook · skills · solve · tutorbot · unified_ws · ...)
│   ├── knowledge/                RAG ingestion + retrieval
│   └── services/                 llm · embedding · rag · session · memory · skill · ...
├── deeptutor_cli/                Agent-native CLI (bot · kb · memory · session · notebook · book · config · plugin)
├── web/                          Next.js 16 frontend (React 19, i18next)
├── services/openmaic/            Vendored OpenMAIC — classroom + Course Builder (Next.js 16, pnpm)
│   ├── app/                      classroom · course · generation-preview · api
│   ├── lib/integrations/         ← fork-only: DeepTutor RAG client
│   └── lib/generation/           Outline + scene pipelines (LangChain + AI SDK)
├── config/                       main.yaml · agents.yaml
├── tailscale/ts-serve.json       Tailscale-sidecar reverse-proxy config (reference topology — NOT used in production, see below)
├── docker-compose.yml            Reference Tailscale-sidecar stack (committed, not the deployed compose file)
└── scripts/start_web.py          Local dev entry point
```

`services/openmaic/` is a **plain file copy, not a git submodule or subtree** —
sync via the procedure below, never via `git subtree pull`.

---

## Fork additions

Changes in this fork that aren't in upstream:

**OpenMAIC integration** (`services/openmaic/`)
- **Classroom ↔ Course Builder switcher** on the OpenMAIC home page — labeled
  pills (`GraduationCap` · `BookOpen`) that toggle between the generative
  classroom (stays on OpenMAIC) and a longform Oboe-style Course Builder at
  [services/openmaic/app/course](services/openmaic/app/course) / [services/openmaic/app/course/[id]](services/openmaic/app/course/%5Bid%5D).
- **DeepTutor RAG adapter** at [services/openmaic/lib/integrations/deeptutor-client.ts](services/openmaic/lib/integrations/deeptutor-client.ts):
  `checkHealth` · `listKnowledgeBases` · `queryKnowledgeBase` · `getRAGContextForGeneration`.
  Currently metadata-only (description, document count, recency) — a weak form of
  RAG that ships today, to be replaced once DeepTutor exposes a
  `/api/v1/knowledge/{kb}/query` retrieval endpoint. Payload truncation at
  `MAX_RAG_CONTEXT_CHARS` (~4k tokens) prevents prompt overflow.
- **Knowledge-base selector pill** in the generation toolbar
  ([services/openmaic/components/generation/generation-toolbar.tsx](services/openmaic/components/generation/generation-toolbar.tsx))
  with loading / available / unavailable states. When DeepTutor is down the
  pill renders as a disabled tooltip; OpenMAIC degrades gracefully to
  standalone generation.
- **Knowledge-base listing endpoint** at
  [services/openmaic/app/api/knowledge-bases/route.ts](services/openmaic/app/api/knowledge-bases/route.ts)
  normalizes DeepTutor's `statistics.raw_documents` payload to OpenMAIC's
  `{ name, documentCount, isDefault }` shape.
- **Health endpoint** at
  [services/openmaic/app/api/health/route.ts](services/openmaic/app/api/health/route.ts)
  surfaces `integrations.deepTutor.status` so the UI can hide affordances when
  DeepTutor isn't reachable.

**Frontend sidebar**
- External-link support on `NavEntry` in
  [web/components/sidebar/SidebarShell.tsx](web/components/sidebar/SidebarShell.tsx)
  so the Classroom item deep-links to OpenMAIC.

**Deployment**
- Three-service [docker-compose.yml](docker-compose.yml) with a Tailscale
  sidecar sharing its network namespace with both `deeptutor` and `openmaic`.
- [tailscale/ts-serve.json](tailscale/ts-serve.json) proxies
  `:443 → 3782`, `:3100 → 3101`, `:8001 → 8002`. All internal ports were
  shifted to avoid collision with Tailscale Serve in the shared namespace.

---

## Local development

```bash
# Python 3.11+ — one-time setup
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"

# Backend + frontend, single command (starts uvicorn + next dev)
python scripts/start_web.py

# Or run them separately:
uvicorn deeptutor.api.main:app --reload --port 8001   # backend
cd web && npm run dev                                  # frontend on 3782

# OpenMAIC (separate process, separate port)
cd services/openmaic
pnpm install
pnpm dev                                               # → 3101
```

**Where things live locally:**

| Port | Service | URL |
|---|---|---|
| 8001 | DeepTutor backend (OpenAPI at `/docs`) | http://localhost:8001/docs |
| 3782 | DeepTutor frontend | http://localhost:3782 |
| 3101 | OpenMAIC | http://localhost:3101 |

**CLI:** `deeptutor --help` (after `pip install -e .`). Full command reference is in the [upstream README](https://github.com/HKUDS/DeepTutor/blob/main/README.md#%EF%B8%8F-deeptutor-cli--agent-native-interface).

**Type check / lint:**
- `ruff check deeptutor/` · `mypy deeptutor/` · `pytest tests/`
- `cd web && npx tsc --noEmit && npm run lint`
- `cd services/openmaic && pnpm tsc --noEmit && pnpm lint`

---

## Configuration

The runtime this fork is tuned for:

| Concern | Value |
|---|---|
| LLM | OpenRouter → `anthropic/claude-sonnet-4` |
| Embeddings | Ollama → `nomic-embed-text` (768 dims, local) |
| Web search | off |
| TTS | off |

Copy [.env.example](.env.example) to `.env` and fill in. Config priority is
**UI Settings (DB) > `.env` > code defaults** — the Settings page writes to a
runtime config store that overrides `.env`, so "why isn't my `.env` change
taking effect?" almost always means there's a stale DB value.

OpenRouter key lives in Vaultwarden: `get-secret "OpenRouter API - Pi"`.

**OpenMAIC** reads `.env.openmaic` (separate file at repo root, gitignored):

```bash
OPENAI_API_KEY=<OpenRouter key>
OPENAI_BASE_URL=https://openrouter.ai/api/v1
DEFAULT_MODEL=openai:anthropic/claude-sonnet-4-5
DEEPTUTOR_API_URL=http://127.0.0.1:8002   # internal port, NOT 8001
DEEPTUTOR_ENABLED=true
```

**Ollama URLs — two gotchas:**
1. The adapter uses the native `/api/embed` endpoint (not OpenAI's `/v1/embeddings`) — `EMBEDDING_HOST=http://localhost:11434`, no `/v1` suffix.
2. Inside Docker containers, use `http://host.docker.internal:11434` instead of `localhost`.

---

## Deployment

### Pironman (production)

Deployed path: `/home/matthewwagner/homelab/deeptutor/`. SSH as `matthewwagner`
(`ssh pironman` with the configured alias).

The production compose is `docker-compose.pironman.yml` — a **Pi-local file not
in this repo's git history** — using `ghcr.io/hkuds/deeptutor:latest` (upstream's
prebuilt image, mounted with `./data/{user,knowledge_bases}`) and a locally-built
`openmaic:latest`. Both containers sit on a bridge network named
`deeptutor-network`; external access is via `caddy-tailscale` on Pironman
(separate container), which owns the three tsnet nodes `deeptutor`,
`deeptutor-api`, and `openmaic`.

The committed [docker-compose.yml](docker-compose.yml) in this repo is a
reference topology (Tailscale sidecar + shared network namespace). It's not
what runs on Pironman — don't be confused by the port gymnastics in it.

**Deploy the fork:**

```bash
ssh pironman
cd /home/matthewwagner/homelab/deeptutor

# Pull latest (or, during preview, apply via git-bundle instead of `git pull`)
git pull origin main

# Rebuild OpenMAIC from fork source
cd services/openmaic
sudo docker build -t openmaic:latest .
cd ../..

# (optional) pull a newer upstream DeepTutor image
sudo docker pull ghcr.io/hkuds/deeptutor:latest

# Recreate stack
sudo docker compose -f docker-compose.pironman.yml up -d

sudo docker ps --filter name=deeptutor --filter name=openmaic
```

**pnpm lockfile gotcha:** an upstream OpenMAIC sync will almost always bump
enough deps to invalidate `services/openmaic/pnpm-lock.yaml`, and the Dockerfile
runs `pnpm install --frozen-lockfile` — so the build will fail until the
lockfile is regenerated:

```bash
cd services/openmaic
sudo docker run --rm -v "$(pwd):/app" -w /app node:22-alpine \
  sh -c 'corepack enable && corepack prepare pnpm@10.28.0 --activate && pnpm install --no-frozen-lockfile'
# commit the regenerated pnpm-lock.yaml back on M4 before shipping
```

---

## Upstream sync

Both upstreams are already configured as remotes:

```
origin            https://github.com/mattwag05/DeepTutor.git     (canonical)
upstream          https://github.com/HKUDS/DeepTutor.git         (DeepTutor)
upstream-openmaic https://github.com/THU-MAIC/OpenMAIC.git       (OpenMAIC)
```

**DeepTutor:** `git fetch upstream && git merge upstream/main`. Accept upstream
deletion of `docs/roadmap.md` and `docs/guide/docker-start.md` — fork
customization notes live in [CLAUDE.md](CLAUDE.md) and [AGENTS.md](AGENTS.md),
not in the docs tree.

**OpenMAIC:** vendored copy, never use `git subtree pull` (produces 60+ spurious
conflicts — OpenMAIC was added via plain file copy, not `git subtree add`).
Full procedure including the protected-file list and 3-way merge invocation is
in [CLAUDE.md § Upstream Sync Procedure](CLAUDE.md). In short: `git worktree add`
upstream-openmaic, back up the protected files, `rsync -a --exclude=.git
--exclude=node_modules --exclude=.next --exclude='.env*'` over
`services/openmaic/`, then `git merge-file --marker-size=7` each protected file
with base `d797e42` (the initial vendor commit).

---

## Task tracking

[Beads](https://github.com/steveyegge/beads) is the source of truth — `bd ready`
for open work, `bd update <id> --claim` to start, `bd close <id>` on completion.
Don't use TODO comments, TaskCreate, or markdown for project-level tracking.

---

## License

Apache-2.0, inherited from upstream. See [LICENSE](LICENSE).
