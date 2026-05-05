# DeepTutor CLAUDE.md

AI tutoring platform — multi-agent RAG architecture, Python/FastAPI backend, Next.js frontend.

**Status:** 🔨 In Development (synced from upstream 2026-04-30 → v1.3.7)
**Repo:** https://github.com/mattwag05/DeepTutor.git
**Upstream:** https://github.com/HKUDS/DeepTutor (main at 445e762)
**OpenMAIC Upstream:** https://github.com/THU-MAIC/OpenMAIC
**Deployed:** https://deeptutor.tail6e035b.ts.net (Pironman — 100.126.176.86)

---

## Quick Start

```bash
# Activate venv (always required before Python commands)
source .venv/bin/activate

# Start everything (backend + frontend)
.venv/bin/python scripts/start_web.py

# Or run separately:
.venv/bin/python -m uvicorn deeptutor.api.main:app --reload --port 8001   # backend
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

### Backend (`deeptutor/`)

Python package root is `deeptutor/` (not `src/`). Repo also has top-level `services/` for OpenMAIC and other sidecars.

```
deeptutor/
├── __main__.py              # FastAPI app entry point
├── agents/                  # Multi-agent system (chat, math_animator, notebook, question, research, solve, vision_solver, visualize)
├── api/                     # FastAPI routers + main.py wiring
├── app/
├── capabilities/
├── core/
├── events/
├── knowledge/               # RAG / retrieval / embedding adapters
├── logging/
└── ...
services/openmaic/           # OpenMAIC (classroom/reader layer) — separate container
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
.venv/bin/ruff check deeptutor/
.venv/bin/ruff format deeptutor/

# Type checking
.venv/bin/mypy deeptutor/
```

**Runtime:** Python 3.11 (pinned via `.venv`)

> **`.venv` ships only the lightest deps.** `json_repair`, `loguru`, `uvicorn`, `fastapi`, `ruff`, `mypy` are NOT installed by default — install on first need (`pip install <name>`) or run `pip install -e ".[server]"` for the full server extras. Tests under `tests/book/` and `tests/services/llm/` will collection-error until `json_repair` + `loguru` are present.

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

4. **Unified config service wins** — If you configured LLM/embedding via the UI Settings page, those values land in `data/user/settings/model_catalog.json` (in the bind-mounted volume) and override `.env`. They survive container restarts. After rotating an API key in `.env`, also `sudo grep '"api_key"' data/user/settings/model_catalog.json` and edit/restart, or use the Settings UI to clear.

5. **`npm audit` warnings** — 24 known vulnerabilities in frontend deps (moderate/high). Not blocking for local dev. Track via a bd task when addressing.

6. **Sidebar refactored to directory** — Upstream refactored `Sidebar.tsx` into `sidebar/SidebarShell.tsx`, `WorkspaceSidebar.tsx`, and `UtilitySidebar.tsx`. The Classroom nav item is in `SidebarShell.tsx` using an `external` field on `NavEntry` for the OpenMAIC link (`https://deeptutor.tail6e035b.ts.net:3100`).

7. **i18n system** — Upstream replaced the old per-file `.ts` translation approach with i18next + JSON locale files at `lib/i18n/locales/{en-US,zh-CN,ja-JP,ru-RU}.json`. All KB toolbar strings are under the `toolbar` namespace. When adding new UI strings, add keys to ALL four locale files.

8. **WebSocket disconnect handling** — Course router's `except` block tries to `send_json` on a closed WebSocket, causing `RuntimeError: Cannot call "send" once a close message has been sent`. Wrap sends in the error handler with a `WebSocketDisconnect` catch.

9. **`response_format` not supported on OpenRouter** — OpenRouter/Anthropic models don't support `response_format={"type": "json_object"}`. Agents that need structured output (CurriculumAgent, EnrichmentAgent) must include JSON formatting instructions in the prompt and parse the response.

10. **Docker: Ollama host** — Inside Docker containers, `EMBEDDING_HOST` must be `http://host.docker.internal:11434` (not `localhost`). `localhost` inside a container is the container itself. The `.env` already has the correct value for Docker runs.

11. **Tailscale sidecar** — `docker-compose.yml` includes `tailscale-deeptutor` sidecar (ScaleTail/coder pattern). `deeptutor` uses `network_mode: service:tailscale-deeptutor` — remove `ports:` and `networks:` directives as they conflict. Auth key in Vaultwarden: `get-secret "Tailscale Auth Key"`. Serve config: `tailscale/ts-serve.json`.

12. **Pironman never adopted the tailscale sidecar pattern** (verified 2026-05-04 during A.2) — base `docker-compose.yml` defines a `tailscale-deeptutor` sidecar with `network_mode: service:tailscale-deeptutor` and `tailscale/ts-serve.json` forwarding external `8001 → internal 8002` / `3100 → internal 3101`. **The deployed Pironman compose (`docker-compose.pironman.yml`) ignores all of that** — it puts `deeptutor` and `openmaic` on a regular `deeptutor-network` bridge with `127.0.0.1:*:*` host loopback bindings, and the production reverse proxy is the homelab-wide `caddy-tailscale` (network_mode: host, embedded tsnet) at `~/homelab/caddy/pironman/`, which registers `bind tailscale/{deeptutor, deeptutor-api, openmaic, tutor, ...}` against host loopback ports `3782 / 8001 / 3101`. The `tailscale-deeptutor` container is an orphan from a prior `docker-compose.yml` invocation; auth state on it doesn't affect production. **For new tailnet hostnames, edit `~/homelab/caddy/pironman/Caddyfile` and `docker compose restart caddy` — no port reconcile or sidecar re-auth needed.** ts-serve.json is M5-dev-clone reference only.

13. **OpenMAIC TTS needs a direct OpenAI key, not OpenRouter** — Course Builder's `/api/generate/course-audio` calls OpenAI's `/v1/audio/speech` endpoint directly. Set `TTS_OPENAI_API_KEY=sk-proj-...` in `.env.openmaic` (separate from `OPENAI_API_KEY` which is the OpenRouter LLM key). Without it the route returns a clear "TTS_OPENAI_API_KEY is not set" error.

14. **Artifact endpoints need long curl timeouts** — `/api/generate/course-{flashcards,study-guide,final-exam}` make non-streaming LLM calls that take 60–180s. When testing via curl, use `--max-time 180` minimum or you'll get an empty body and a misleading "JSON parse" error.

15. **`gh` OAuth token lacks `workflow` scope** (verified 2026-05-04) — `git push origin main` fails with `! [remote rejected] main -> main (refusing to allow an OAuth App to create or update workflow .github/workflows/tests.yml without 'workflow' scope)` whenever the push range touches a `.github/workflows/*.yml` file (e.g. after an upstream HKUDS sync that picks up CI changes). Two workarounds: (a) push once via SSH URL: `git push git@github.com:mattwag05/DeepTutor.git main` — the SSH key is already on the GitHub account and bypasses the OAuth scope check; (b) refresh the token: `gh auth refresh -h github.com -s workflow` (interactive device flow). Don't permanently switch the remote to SSH unless you also want to use SSH for fetch — option (a) is the targeted fix.

16. **i18n locales for `web/` are 2 files** at `web/locales/{en,zh}/app.json` — NOT 4 like OpenMAIC. Keys are English strings (`t("Save Draft")`), values are translations. The parity script `web/scripts/i18n_parity.mjs` MUST be run from inside `web/` (`cd web && node scripts/i18n_parity.mjs`); from project root it errors with "Missing locales roots" because it resolves `locales/` relative to cwd.

17. **For surgical edits to foreign env files** (`.env.openmaic`, `services/openmaic/.env.local`, anything outside the catalog-managed `.env`), use `python-dotenv`'s `set_key(path, key, value, quote_mode='never')` and `unset_key(path, key)` — already a declared dep. Do NOT use `EnvStore.write` (`deeptutor/services/config/env_store.py:144`); it allowlist-renders only `ENV_KEY_ORDER` and wipes everything outside that list.

18. **Adding a web-search provider needs three sites updated:** (a) `deeptutor/services/search/providers/<name>.py` (the adapter, mirror an existing one like `tavily.py`), (b) `deeptutor/services/config/provider_runtime.py` `SUPPORTED_SEARCH_PROVIDERS` + `SEARCH_ENV_FALLBACK`, (c) `deeptutor/api/routers/settings.py` `_provider_choices()` (the UI dropdown). The first two without the third = invisible in UI; the third without the first = no-op at runtime.

19. **Cross-app nav from OpenMAIC components → `/settings` uses `window.location.href`, not `router.push`** — `/settings` is served by the DeepTutor frontend (port 3782), routed at the unified `tutor.tail6e035b.ts.net` Caddy origin. `router.push('/settings')` from inside OpenMAIC's React tree would 404 in standalone OpenMAIC dev. Full page load is correct here. Phase B.4 (drop OpenMAIC service) retires this asymmetry.

20. **`MarkdownRenderer` prop is `content`, not `markdown`** — `web/components/common/MarkdownRenderer.tsx` takes a `content` prop. Passing `markdown={...}` silently renders nothing (TypeScript won't catch it without strict props). Use `<MarkdownRenderer content={q.question} />`.

21. **Variant submissions go to `/api/v1/quiz/attempts`, not notebook upsert** — `/api/v1/question-notebook/entries/upsert` requires a real `session_id` (looks it up in the QuestionNotebookEntry store) and returns 404 for synthetic IDs. Any new UI that submits quiz answers outside a real notebook session should POST to `/api/v1/quiz/attempts` with `source="book"` and the `source_id` from the attempt.

22. **uvicorn `--reload` can silently revert mid-session file edits** — the watchdog fires on any project-tree change and may re-read cached bytecode, discarding a just-written edit if the reload races with the write. Verify critical edits (especially `deeptutor/api/main.py` router imports) with `grep` immediately after writing them.

23. **Cleaning up `.claude/worktrees/` after squash-merge PRs** — claude-spawned worktrees accumulate; their branches look "unmerged" to `git merge-base --is-ancestor` because squash creates new SHAs on `main`. Verify a worktree branch shipped by matching commit subjects in `git log origin/main` AND confirming the change is duplicated in main's tree, then: `git worktree remove [--force] .claude/worktrees/<name> && git branch -D claude/<name>`. Use `--force` if the worktree has uncommitted changes — common stray is `web/next-env.d.ts` flipping between `./.next/types/routes.d.ts` (build) and `./.next/dev/types/routes.d.ts` (dev server), a Next.js artifact safe to discard.

24. **`pnpm tsc --noEmit` in OpenMAIC reports 5–6 known eval-test errors after B.1** — `services/openmaic/tests/eval/` still references `@/eval/shared/*` and `@/eval/outline-language/types` which moved to `web/eval/`. These are expected — B.4 will retire the OpenMAIC service entirely. The production build (`pnpm build`) is clean. Don't treat these as regressions when running verification.

25. **`gh` defaults to upstream (HKUDS) when two remotes exist.** `gh pr create`, `gh run list`, `gh pr checks`, etc. target the remote `gh repo view` resolves — which is `HKUDS/DeepTutor` in this repo. Always pass `-R mattwag05/DeepTutor` explicitly, and use `--head mattwag05:<branch>` on `gh pr create` so GitHub doesn't confuse same-named branches across forks.

26. **`git add` with Next.js bracket paths requires quotes.** `git add services/openmaic/app/classroom/[id]/page.tsx` fails (zsh glob expansion). Use `"services/openmaic/app/classroom/[id]/page.tsx"` with double quotes.

27. **Background fixer subagents share the same working tree.** A subagent dispatched to fix a CI failure on `main` will `git checkout main`, reverting your in-progress branch files. Fence subagents explicitly to avoid touching active branch dirs; after the subagent completes, `git checkout <your-branch>` to restore. The remote branch is unaffected — only the local working tree changes.

28. **`npx tsc --noEmit` in `web/` produces iCloud dupe errors in `.next/types/*.d 2.ts`.** Filter with `grep -v " 2\.ts"` (not just `grep -v eval/`). Source code is clean; the `.next/` build dir accumulates `" 2"`-suffix iCloud artifacts.

---

## Course Builder

The Course Builder feature lives **entirely in `services/openmaic/`** (Oboe.com-style reader), NOT in `deeptutor/agents/course/` which does not exist. Entry points:
- `services/openmaic/app/course/page.tsx` — landing (topic input + outline streaming)
- `services/openmaic/app/course/[id]/page.tsx` — article-reader viewer
- `services/openmaic/lib/generation/prompts/templates/course-{outline,section}/` — prompts
- `services/openmaic/lib/server/course-storage.ts` — file-based CRUD under `data/courses/<id>.json`
- `services/openmaic/lib/course/store.ts` — zustand client store

Parallel to the slide-based classroom (NOT a replacement).

---

## Quiz Attempts (Phase B.6, 2026-05-04)

Unified store at `deeptutor/services/quiz/sqlite_store.py` (DB: `data/user/quiz/attempts.db`, WAL). Generic write/read at `POST /api/v1/quiz/attempts` + `GET /api/v1/quiz/attempts?source=&is_correct=&older_than_ms=&limit=` (powers spaced-review picker, PRD §6.5). `BookEngine.record_quiz_attempt` dual-writes through this store; OpenMAIC posts via the `/api/quiz/attempts` Next.js proxy. Source tags: `book` | `classroom` | `course`. The book route's full path is `/api/v1/book/books/quiz-attempt` (router prefix `/api/v1/book` + handler path `/books/quiz-attempt` — doubled by design, not a typo).

---

## Generation Pipeline (Phase B.1, 2026-05-05)

Generation pipeline moved from `services/openmaic/lib/generation/` to `web/lib/generation/`. API routes `/api/generate/*`, `/api/web-search`, `/api/chat` now served by `web/` (port 3782) — OpenMAIC's copies are stub-replaced (throw or 501). Supporting libs also in web/: `lib/{ai,audio,constants,course,integrations,media,orchestration,pbl,prompts,server,store,types,utils,web-search}/`. Phase B.4 retires the stubs and removes duplicate copies from `services/openmaic/`.

**Key cross-boundary types:** `web/lib/types/{action,slides,stage,widgets}.ts` are local copies of renderer types (duplicated for build independence). Shim pattern from the plan was replaced by direct copy — same contract, zero additional files.

**Vitest:** 55 generation/integrations/prompts tests now run from `web/tests/` via `cd web && npx vitest run tests/generation/ tests/integrations/ tests/prompts/`.

---

## Spaced Review (Phase B.6 follow-up, 2026-05-04)

Daily micro-quiz variant system at `deeptutor/services/spaced_review/`. On first Notebook load per UTC day, `GET /api/v1/spaced-review/today` fires a background `asyncio.create_task` that queries wrong book attempts >24h old → joins with `BookEngine.load_page(book_id, page_id).block_by_id(block_id)` to get original question content → generates variants via `Generator(language="en").process()` → caches result in `data/user/spaced_review/cache.db` (WAL, 7-day eviction). Subsequent hits return the cached row immediately. Book block payload shape: `payload["questions"] = [{question_id, question, question_type, options, correct_answer, explanation, difficulty, concentration}]` — matched by `question_id`, falling back to first question. Panel: `web/components/notebook/TodaysReviewPanel.tsx`. Deferred: parallelizing generation (DeepTutor-lze), AsyncSQLiteStore base class (DeepTutor-dif), cron pre-warm.

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
4. **Course Builder fork-local paths** (entirely fork-only — upstream has no `course/` namespace; restore from backup after `--delete` rsync, do not 3-way merge):
   - `app/course/**`, `app/api/course/**`
   - `app/api/generate/course-outline-stream/**`, `app/api/generate/course-section/**`, `app/api/generate/course-audio/**`
   - `components/course/**`
   - `lib/course/**`, `lib/server/course-storage.ts`, `lib/server/tts/**`, `lib/types/course.ts`
   - `lib/generation/prompts/templates/course-outline/**`, `lib/generation/prompts/templates/course-section/**`
   - After restore, verify `lib/generation/prompts/types.ts` `PromptId` union and `lib/generation/prompts/index.ts` `PROMPT_IDS` still include `course-outline` and `course-section`.
5. **Never** use `git subtree pull` on OpenMAIC — it was added via plain file copy (not `git subtree add`), so subtree tooling produces 60+ spurious add/add conflicts.

---

## Remotes

```
origin    https://github.com/mattwag05/DeepTutor.git  (GitHub, canonical)
upstream  https://github.com/HKUDS/DeepTutor.git      (HKUDS original)
```

**Branches:**
- `main` — latest upstream + all local customizations (DeepTutor synced to v1.3.3 on 2026-04-30; OpenMAIC at 10b1fc83 / v0.2.1+6, no upstream changes since 2026-04-22)
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

1. **`deeptutor/agents/mymodule/`** — Create agent files inheriting from `BaseAgent(module_name="mymodule", ...)`
2. **`config/agents.yaml`** — Add `mymodule:` section with `temperature` and `max_tokens`; section key MUST match `module_name` exactly or params silently default
3. **`deeptutor/api/routers/mymodule.py`** — Create router; inject LLM config via `get_llm_config()`
4. **`deeptutor/api/main.py`** — Add import + `app.include_router(mymodule.router, prefix="/api/v1/mymodule", tags=["mymodule"])`
5. **Frontend nav** — Add entry to `PRIMARY_NAV` (workspace) or `SECONDARY_NAV` (utility) in `web/components/sidebar/SidebarShell.tsx`. Shape: `{ href: "/mymodule", label: "MyModule", icon: <LucideIcon> }` — import the icon at the top. The old `ALL_NAV_ITEMS` / `DEFAULT_NAV_ORDER` indirection in `web/context/GlobalContext.tsx` was removed during the sidebar refactor (gotcha #6).

**Verify wiring:** `source .venv/bin/activate && python -c "from deeptutor.api.routers import mymodule; print('OK')"`

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

The full stack runs on the Pironman (100.126.176.86) via Docker Compose, fronted by the existing `caddy-tailscale` container (no per-service Tailscale sidecar — DeepTutor binds to `127.0.0.1:*` and Caddy proxies HTTPS).

**Host:** Pironman (Debian 13, ARM64, 16GB RAM, NVMe)
**Path:** `/home/matthewwagner/homelab/deeptutor/`
**Active compose:** `docker-compose.pironman.yml` (untracked, local-only override of `docker-compose.yml`)
**Access:** `ssh pironman` (key auth as `matthewwagner`)

**Live URLs** (served by `caddy-tailscale` against host loopback — see gotcha #12):
- Unified: https://tutor.tail6e035b.ts.net (path-routed: `/` → 3782, `/api/v1/*` → 8001, `/classroom*` + `/course*` → 3101) — Phase A.2, 2026-05-04
- Frontend (legacy): https://deeptutor.tail6e035b.ts.net (→ 127.0.0.1:3782)
- API (legacy): https://deeptutor-api.tail6e035b.ts.net (→ 127.0.0.1:8001)
- OpenMAIC (legacy): https://openmaic.tail6e035b.ts.net (→ 127.0.0.1:3101)

**Containers:** `deeptutor`, `openmaic` (caddy-tailscale runs separately under `~/homelab/caddy/pironman/`)

**Rebuild & deploy:**
```bash
ssh pironman "cd /home/matthewwagner/homelab/deeptutor && \
  git pull origin main && \
  cd services/openmaic && docker build -t openmaic:latest . && cd ../.. && \
  docker compose -f docker-compose.pironman.yml build deeptutor && \
  docker compose -f docker-compose.pironman.yml up -d"
```

**pnpm lockfile:** If `services/openmaic/package.json` has new deps, update the lockfile before building:
```bash
cd services/openmaic
docker run --rm -v $(pwd):/app -w /app node:22-alpine \
  sh -c 'corepack enable && corepack prepare pnpm@10.28.0 --activate && pnpm install --no-frozen-lockfile'
```

---

## OpenMAIC Integration (services/openmaic/)

OpenMAIC is a Next.js classroom/presentation layer that runs as a Docker service alongside DeepTutor on a shared `deeptutor-network` bridge.

### Port Mapping (Pironman, as actually deployed 2026-05-04)

| Service | Container port | Host loopback | Caddy reverse_proxy |
|---------|----------------|---------------|---------------------|
| DeepTutor Backend (uvicorn) | 8001 | 127.0.0.1:8001 | `tailscale/deeptutor-api`, `tailscale/tutor /api/v1/*` |
| DeepTutor Frontend (Next.js) | 3782 | 127.0.0.1:3782 | `tailscale/deeptutor`, `tailscale/tutor` (catch-all) |
| OpenMAIC (Next.js) | 3000 | 127.0.0.1:3101 | `tailscale/openmaic`, `tailscale/tutor /classroom*` + `/course*` |

The base `docker-compose.yml`'s sidecar pattern (`network_mode: service:tailscale-deeptutor` + ts-serve.json) is dev-clone reference only — Pironman's `.pironman.yml` overlay drops it. See gotcha #12.

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
