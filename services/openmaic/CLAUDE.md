# OpenMAIC CLAUDE.md

AI-directed classroom/presentation layer — Next.js full-stack app with scene/outline generation, roundtable discussions, quiz grading, PBL, and PPTX export.

**Status:** Integrated with DeepTutor (RAG-enhanced outlines)
**Runtime:** Next.js 16, pnpm, Docker (multi-stage build)
**Internal Port:** 3101 (external via Tailscale Serve: 3100)

---

## Quick Start

```bash
# Local dev
pnpm install
pnpm dev

# Docker (on Pi)
docker build -t openmaic:latest .
cd ~/Projects/DeepTutor && docker compose up -d openmaic
```

---

## DeepTutor Integration

### Architecture

OpenMAIC connects to DeepTutor's FastAPI backend over the shared Tailscale network namespace (both containers use `network_mode: service:tailscale-deeptutor`).

**Integration files:**
- `lib/integrations/types.ts` — Type definitions, error classes, config interface
- `lib/integrations/deeptutor-client.ts` — API client (health, KB listing, RAG queries via WebSocket)
- `lib/integrations/index.ts` — Barrel exports
- `lib/generation/pipeline-types.ts` — `DeepTutorOptions` type
- `lib/generation/outline-generator.ts` — RAG context injection into outline generation
- `app/api/generate/scene-outlines-stream/route.ts` — RAG enrichment in scene outline streaming
- `app/api/knowledge-bases/route.ts` — KB listing endpoint
- `app/api/health/route.ts` — Health endpoint with DeepTutor status

### Config

Env vars in `.env.openmaic` (project root, NOT this directory):
- `DEEPTUTOR_API_URL=http://127.0.0.1:8002` — DeepTutor internal port
- `DEEPTUTOR_ENABLED=true`

### Graceful Degradation

All integration functions return empty/null when DeepTutor is unavailable. OpenMAIC works fully standalone — DeepTutor enrichment is additive.

---

## Known Gotchas

1. **Port 3101, not 3100** — Tailscale Serve binds 3100 externally. OpenMAIC listens on 3101 internally. Changing this back to 3100 will cause EADDRINUSE.

2. **DEEPTUTOR_API_URL is port 8002** — DeepTutor backend listens on 8002 internally. Port 8001 is the external TS Serve port. Using 8001 here will fail with connection refused.

3. **docker compose up -d, not restart** — `restart` does not re-read compose file changes. Always use `up -d` to pick up env/config changes.

4. **WebSocket client uses `any` type** — The `ws` package in `deeptutor-client.ts` is typed as `any` with eslint-disable to avoid Next.js build type conflicts. Use `ws.on('event', ...)` pattern (Node EventEmitter), not `ws.onmessage =`.

5. **PORT override in docker-compose.yml** — The compose file sets `PORT=3101` in `environment:`, which takes precedence over `.env.openmaic`. Both must agree.

6. **pnpm lockfile** — After adding deps to package.json, run `pnpm install --no-frozen-lockfile` locally or in a temp container to regenerate the lockfile before building the Docker image.

---

## Development

```bash
pnpm dev          # dev server
pnpm build        # production build
pnpm lint         # eslint
pnpm tsc --noEmit # type check
```

**Dependencies added for integration:**
- `ws` ^8.18.0 (WebSocket client for DeepTutor RAG queries)
- `@types/ws` ^8.5.0 (dev)
