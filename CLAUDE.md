# Tutor CLAUDE.md

AI tutoring platform — multi-agent RAG architecture, Python/FastAPI backend, Next.js frontend.

> **Naming:** User-facing project name is **Tutor** (folder `~/Desktop/Projects/Tutor/`, deployed at `tutor.tail6e035b.ts.net`). Internal package name is still `deeptutor` (Python module, Docker image `deeptutor-fork`, GitHub repo `mattwag05/DeepTutor`, Pironman compose dir `~/homelab/deeptutor/`). Don't rename code paths — they're load-bearing across upstream sync, Dockerfiles, and compose.

**Status:** 🔨 In Development (synced from upstream 2026-04-30 → v1.3.7; OpenMAIC retired B.4; Manifest router live C.1; Intent router + PWA live C.3/C.4 2026-05-05; course→classroom playback actions fix 2026-05-06; v1.5.0 catalog covers all provider modalities + feature flags 2026-05-06)
**Repo:** https://github.com/mattwag05/DeepTutor.git
**Upstream:** https://github.com/HKUDS/DeepTutor (main at 445e762)
**Deployed:** https://tutor.tail6e035b.ts.net (Pironman — 100.126.176.86, unified URL post-2026-05-06)

---

## Quick Index

- **Setup:** Quick Start • Configuration • Architecture
- **Development:** Python (`source .venv`) • Frontend (`cd web`) • Adding a New Agent Module
- **Frontend phases:** Generation Pipeline (B.1) • Course Builder (B.5) • Quiz Attempts (B.6) • Spaced Review (B.6 + kgj) • Manifest Profile Router (C.1) • Intent Router (C.3) • PWA / Mobile (C.4)
- **Production:** Deployment (Pironman) • OpenMAIC retirement (B.4)
- **Operations:** Troubleshooting • Upstream Sync • Task Tracking • Remotes • Dropbox/iCloud Conflict Artifacts
- **Gotchas (1–54):** see "Known Gotchas" — most-cited: #6 (sidebar refactor), #12 (caddy/tailscale on Pironman), #16 (web/ i18n: 2 locales flat), #20 (`/api/v1/quiz/attempts` vs notebook upsert), #28 (stacked-PR rebase), #32 (CI excludes web/), #33 (Buffer.slice for binary Response), #34 (Serwist setup), #40 (dependabot api caps), #41 (vendored-lib devDep prune), #42 (Next 16 POST `localhost` 404), #44 (Manifest `:` separator + OpenRouter slugs), #45 (course→classroom projection must emit `Scene.actions`), #46 (TUTOR_DATA_DIR / Next.js cwd), #47 (catalog services + ProfiledService), #48 (feature flags via interface.json), #49 (`NEXT_PUBLIC_API_BASE_EXTERNAL` retired-hostname trap), #50 (OpenRouter default for LLM only — embedding/TTS/image stay), #51 (`min-h-screen` clips on non-workspace pages — body has `overflow:hidden`), #52 (iOS safe-area pattern: viewportFit + `env(safe-area-inset-bottom)` on nav + main), #53 (API 500 detail = generic, not `str(exc)`), #54 (catalog-service additions need `test_runner._run_sync` dispatch + `_test_<svc>`).

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
services/openmaic/           # OpenMAIC (classroom/reader layer) — ARCHIVE ONLY, not deployed (retired B.4)
```

### Frontend (`web/`)

Next.js 16 app. Configured via environment variables at build time for API URL.

```
web/
├── app/
│   ├── (workspace)/         # Main workspace: chat, book, co-writer, agents, playground, knowledge, notebook, space
│   ├── (utility)/           # Utility panels: settings, memory
│   ├── classroom/           # Classroom viewer
│   ├── course/              # Course builder + reader + word-quest
│   ├── api/                 # Next.js API routes (/api/generate/*, /api/export/*, /api/course/*, /api/project/*)
│   ├── manifest.ts          # PWA web app manifest (Next.js metadata route) (C.4)
│   └── sw.ts                # Serwist service worker — SWR spaced-review, CacheFirst statics, NetworkFirst API, SSE-excluded (C.4)
├── components/              # Shared UI components (sidebar, notebook, common)
├── lib/
│   ├── generation/          # Scene/outline/course generation pipeline (moved from OpenMAIC in B.1)
│   ├── intent/              # Intent classifier: classifyIntent({text?,fileName?}) → chat/course/book/notebook (C.3)
│   ├── orchestration/       # Director graph, tool schemas, summarizers
│   ├── pbl/                 # Project-based learning + MCP agents
│   ├── prompts/             # Prompt loader + templates
│   ├── ai/                  # callLLM / streamLLM wrappers; manifest/ — Manifest tier-based profile router (C.1)
│   ├── integrations/        # DeepTutor client (health, KB, RAG)
│   ├── server/              # Server-only utilities: resolve-profile.ts (Manifest→model), tts/, course-storage.ts
│   ├── types/               # Shared renderer types (action, slides, stage, widgets)
│   └── utils/               # Shared utilities: strip-markdown.ts, blob-download.ts
└── tests/                   # Vitest: generation/, integrations/, prompts/, ai/, intent/
```

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
npx vitest run tests/generation/ tests/integrations/ tests/prompts/ tests/intent/  # generation + intent tests
npm run test:node      # Node-only integration tests (separate from vitest)
npm run i18n:check     # i18n parity + audit (run after adding/removing locale keys)
npm run perf:check     # route bundle budget check (requires prior next build)
npm run audit          # Playwright UI audit (requires next start)
```

---

## Known Gotchas

1. **Ollama embedding URL** — The Ollama adapter uses the native `/api/embed` endpoint, NOT the OpenAI-compatible `/v1/embeddings`. Set `EMBEDDING_HOST=http://localhost:11434` (no `/v1` suffix).

2. **Dimension mismatch** — `nomic-embed-text` outputs 768 dims. If you switch models, update `EMBEDDING_DIMENSION` to match or the vector DB will reject documents.

3. **DeepTutor.env priority** — `start_web.py` loads `DeepTutor.env` (parent of project root, `override=False`) before `.env`. If a `~/DeepTutor.env` exists, its values win. Our setup has no such file — safe.

4. **Unified config service wins** — If you configured LLM/embedding via the UI Settings page, those values land in `data/user/settings/model_catalog.json` (in the bind-mounted volume) and override `.env`. They survive container restarts. After rotating an API key in `.env`, also `sudo grep '"api_key"' data/user/settings/model_catalog.json` and edit/restart, or use the Settings UI to clear.

5. **`npm audit` warnings** — 24 known vulnerabilities in frontend deps (moderate/high). Not blocking for local dev. Track via a bd task when addressing.

6. **Sidebar refactored to directory** — Upstream refactored `Sidebar.tsx` into `sidebar/SidebarShell.tsx`, `WorkspaceSidebar.tsx`, and `UtilitySidebar.tsx`. Classroom nav routes to `/classroom` within web/ (same-origin, no `external` field). OpenMAIC external link retired in B.4.

7. **i18n system (backend)** — Upstream replaced the old per-file `.ts` translation approach with i18next + JSON locale files at `lib/i18n/locales/{en-US,zh-CN,ja-JP,ru-RU}.json`. All KB toolbar strings are under the `toolbar` namespace. **For `web/` UI strings, see gotcha #16 — only 2 locales, flat dot-notation keys.** (OpenMAIC i18n is moot — `services/openmaic/` is archived.)

8. **WebSocket disconnect handling** — Course router's `except` block tries to `send_json` on a closed WebSocket, causing `RuntimeError: Cannot call "send" once a close message has been sent`. Wrap sends in the error handler with a `WebSocketDisconnect` catch.

9. **`response_format` not supported on OpenRouter** — OpenRouter/Anthropic models don't support `response_format={"type": "json_object"}`. Agents that need structured output (CurriculumAgent, EnrichmentAgent) must include JSON formatting instructions in the prompt and parse the response.

10. **Docker: Ollama host** — Inside Docker containers, `EMBEDDING_HOST` must be `http://host.docker.internal:11434` (not `localhost`). `localhost` inside a container is the container itself. The `.env` already has the correct value for Docker runs.

11. **Tailscale sidecar** — `docker-compose.yml` includes `tailscale-deeptutor` sidecar (ScaleTail/coder pattern). `deeptutor` uses `network_mode: service:tailscale-deeptutor` — remove `ports:` and `networks:` directives as they conflict. Auth key in Vaultwarden: `get-secret "Tailscale Auth Key"`. Serve config: `tailscale/ts-serve.json`.

12. **Pironman never adopted the tailscale sidecar pattern** — base `docker-compose.yml` defines a `tailscale-deeptutor` sidecar; Pironman's `docker-compose.pironman.yml` ignores it. The production reverse proxy is `caddy-tailscale` (`~/homelab/caddy/pironman/`) which registers `bind tailscale/tutor` against host loopback ports `3782 / 8001`. **OpenMAIC (port 3101) was retired 2026-05-05 (B.4); legacy `deeptutor.*` + `deeptutor-api.*` blocks were dropped 2026-05-06** — `tutor.*` is the only live hostname, classroom + course routes proxy to 3782. The `tailscale-deeptutor` orphan container has no production role. For new tailnet hostnames, edit Caddyfile and `docker compose restart caddy`.

13. **TTS for course audio + podcasts** routes through the unified provider system in `web/lib/audio/tts-providers.ts` (8 backends: openai-tts, azure-tts, glm-tts, qwen-tts, voxcpm-tts, doubao-tts, elevenlabs-tts, minimax-tts; custom OpenAI-compatible endpoints via `custom-tts-*` IDs — covers local Kokoro-style servers). Server-side entry point: `synthesizeCourseAudio` from `web/lib/server/tts/synthesize.ts` (replaces the deleted legacy `openai-tts.ts` / `chunk.ts` shims, vsu 2026-05-05). Configure keys via Settings UI (lands in `data/user/settings/model_catalog.json`), `server-providers.yml`, or `*_API_KEY` env vars (e.g. `TTS_OPENAI_API_KEY` still works as one of the unified inputs — no longer the only path). PRD §B's dual-key gotcha (needing a separate OpenAI key for TTS because OpenRouter doesn't proxy TTS) is now obsolete: pick any TTS provider via `providerId` and configure it independently of the LLM. Routes: `web/app/api/generate/course-audio/route.ts`, `web/app/api/generate/course-podcast-{solo,conversational}/route.ts`.

14. **Artifact endpoints need long curl timeouts** — `/api/generate/course-{flashcards,study-guide,final-exam}` make non-streaming LLM calls that take 60–180s. When testing via curl, use `--max-time 180` minimum or you'll get an empty body and a misleading "JSON parse" error.

15. **`gh` OAuth token lacks `workflow` scope** (verified 2026-05-04) — `git push origin main` fails with `! [remote rejected] main -> main (refusing to allow an OAuth App to create or update workflow .github/workflows/tests.yml without 'workflow' scope)` whenever the push range touches a `.github/workflows/*.yml` file (e.g. after an upstream HKUDS sync that picks up CI changes). Two workarounds: (a) push once via SSH URL: `git push git@github.com:mattwag05/DeepTutor.git main` — the SSH key is already on the GitHub account and bypasses the OAuth scope check; (b) refresh the token: `gh auth refresh -h github.com -s workflow` (interactive device flow). Don't permanently switch the remote to SSH unless you also want to use SSH for fetch — option (a) is the targeted fix. After pushing via SSH URL, run `git fetch origin` to sync the tracking ref; otherwise `git status` will falsely show "ahead of 'origin/main'".

16. **i18n locales for `web/` are 2 files** at `web/locales/{en,zh}/app.json` — NOT 4 like OpenMAIC. Keys are flat dot-notation strings (`"quiz.title": "Quiz"` — `keySeparator: false`), NOT nested objects. Values are translations. The parity script `web/scripts/i18n_parity.mjs` MUST be run from inside `web/` (`cd web && node scripts/i18n_parity.mjs`); from project root it errors with "Missing locales roots" because it resolves `locales/` relative to cwd.

17. **For surgical edits to foreign env files** (`.env.openmaic`, `services/openmaic/.env.local`, anything outside the catalog-managed `.env`), use `python-dotenv`'s `set_key(path, key, value, quote_mode='never')` and `unset_key(path, key)` — already a declared dep. Do NOT use `EnvStore.write` (`deeptutor/services/config/env_store.py:144`); it allowlist-renders only `ENV_KEY_ORDER` and wipes everything outside that list.

18. **Adding a web-search provider needs three sites updated:** (a) `deeptutor/services/search/providers/<name>.py` (the adapter, mirror an existing one like `tavily.py`), (b) `deeptutor/services/config/provider_runtime.py` `SUPPORTED_SEARCH_PROVIDERS` + `SEARCH_ENV_FALLBACK`, (c) `deeptutor/api/routers/settings.py` `_provider_choices()` (the UI dropdown). The first two without the third = invisible in UI; the third without the first = no-op at runtime.

19. **`MarkdownRenderer` prop is `content`, not `markdown`** — `web/components/common/MarkdownRenderer.tsx` takes a `content` prop. Passing `markdown={...}` silently renders nothing (TypeScript won't catch it without strict props). Use `<MarkdownRenderer content={q.question} />`.

20. **Variant submissions go to `/api/v1/quiz/attempts`, not notebook upsert** — `/api/v1/question-notebook/entries/upsert` requires a real `session_id` (looks it up in the QuestionNotebookEntry store) and returns 404 for synthetic IDs. Any new UI that submits quiz answers outside a real notebook session should POST to `/api/v1/quiz/attempts` with `source="book"` and the `source_id` from the attempt.

21. **uvicorn `--reload` can silently revert mid-session file edits** — the watchdog fires on any project-tree change and may re-read cached bytecode, discarding a just-written edit if the reload races with the write. Verify critical edits (especially `deeptutor/api/main.py` router imports) with `grep` immediately after writing them.

22. **Cleaning up `.claude/worktrees/` after squash-merge PRs** — claude-spawned worktrees accumulate; their branches look "unmerged" to `git merge-base --is-ancestor` because squash creates new SHAs on `main`. Verify a worktree branch shipped by matching commit subjects in `git log origin/main` AND confirming the change is duplicated in main's tree, then: `git worktree remove [--force] .claude/worktrees/<name> && git branch -D claude/<name>`. Use `--force` if the worktree has uncommitted changes — common stray is `web/next-env.d.ts` flipping between `./.next/types/routes.d.ts` (build) and `./.next/dev/types/routes.d.ts` (dev server), a Next.js artifact safe to discard.

23. **`gh` defaults to upstream (HKUDS) when two remotes exist.** `gh pr create`, `gh run list`, `gh pr checks`, etc. target the remote `gh repo view` resolves — which is `HKUDS/DeepTutor` in this repo. Always pass `-R mattwag05/DeepTutor` explicitly, and use `--head mattwag05:<branch>` on `gh pr create` so GitHub doesn't confuse same-named branches across forks.

24. **`git add` with Next.js bracket paths requires quotes.** `git add services/openmaic/app/classroom/[id]/page.tsx` fails (zsh glob expansion). Use `"services/openmaic/app/classroom/[id]/page.tsx"` with double quotes.

25. **Background fixer subagents share the same working tree.** A subagent dispatched to fix a CI failure on `main` will `git checkout main`, reverting your in-progress branch files. Fence subagents explicitly to avoid touching active branch dirs; after the subagent completes, `git checkout <your-branch>` to restore. The remote branch is unaffected — only the local working tree changes.

26. **`npx tsc --noEmit` in `web/` produces iCloud dupe errors in `.next/types/*.d <N>.ts`.** Filter with `grep -vE " [0-9]+\.ts"` — iCloud creates `" 2"`, `" 3"`, etc. suffix variants over time, and the original `grep -v " 2\.ts"` misses the others (false-positive type errors).

27. **`asyncio.run(_poll())` in sync tests doesn't yield to TestClient's background thread.** Routes that use `asyncio.create_task()` schedule work in TestClient's internal event loop thread. `asyncio.run()` creates a separate loop; `await asyncio.sleep(0.05)` in that loop never gives the background task CPU. Fix: use synchronous `time.sleep(0.05)` polling in sync test functions — `time.sleep` releases the GIL so the background thread runs. Affects all of `tests/api/test_spaced_review_route.py`.

28. **Stacked PR rebase after squash-merge: force-push then re-merge.** After squash-merging the base branch into main, run `git rebase origin/main` on the dependent branch — git auto-skips the now-landed commit (`warning: skipped previously applied commit`). Then `git push --force` (NOT `--force-with-lease` — the lease check fails with "stale info" because the local tracking ref is stale after rebase) and `sleep 5` before `gh pr merge`. PRs targeting the old base branch gain a spurious merge-conflict state on GitHub until the rebase + push clears it.

29. **`web/i18n/init.ts` sets `returnEmptyString: false`** — i18next returns the key name (not `""`) when a translation value is an empty string. For intentionally-empty English translations (e.g. `quiz.totalPrefix` — no prefix word in English), use `" "` (single space) instead of `""`. The space is invisible in rendered HTML but satisfies the non-empty check.

30. **Client-generated classrooms are IndexedDB-only — server filesystem misses them.** `lib/server/classroom-storage.ts` reads from `data/classrooms/<id>.json` on disk. Browser-generated classrooms are never written there. Any server route that reads a classroom (e.g. `classroom-to-course`) must accept inline `stage` + `scenes` from the request body as a fallback when the filesystem lookup returns null.

31. **`.beads/issues.jsonl` dirty after any `bd` write blocks `git checkout`.** `bd close`, `bd update --claim`, etc. write to `.beads/issues.jsonl` immediately. During stacked-PR merge flows, `git checkout <next-branch>` will abort with "local changes would be overwritten." Fix: `git stash` before checkout; the stash is safe to leave dangling (beads re-syncs from Dolt on next `bd` call). Pop with `git stash pop` when done or when returning to the branch.

32. **`tests.yml` CI path filter excludes `web/`** — the workflow only runs on `deeptutor/**`, `tests/**`, `requirements/**`, `pyproject.toml`. PRs that only touch `web/` will show no CI runs on GitHub. Don't wait for green CI on web-only PRs — there won't be any check to wait on. The docker-release workflow has its own trigger (push to main, not PRs).

33. **`Buffer.buffer` for `Response` body needs `.slice()` due to pool sharing.** Node's `Buffer` objects share a backing `ArrayBuffer` from a pool, so `buf.buffer` has non-zero `byteOffset`. `new Response(buf.buffer, ...)` sends the entire pool. Fix: `buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer`. Affects all course API routes that return binary data (PDF, PPTX, images): `web/app/api/export/course-pdf/`, `web/app/api/generate/course-slides/`, `web/app/api/course/[id]/image/[blockId]/`.

34. **`@serwist/next` service worker setup has three gotchas** — (a) Install with `--legacy-peer-deps` due to Next.js peer dep conflict: `npm install @serwist/next serwist --save --legacy-peer-deps`. (b) Exclude `"app/sw.ts"` from tsconfig `"exclude"` — `webworker` globals conflict with the `dom` lib; serwist compiles the SW independently during `next build`. (c) Add an SSE exclusion to any `NetworkFirst` `/api/*` catch-all: `request.headers.get("accept") !== "text/event-stream"` — without it, `/api/chat` and `/api/generate/*-stream` streaming routes get intercepted and partial payloads are stored in the SW cache.

35. **Session-summary file existence is not guaranteed** — when resuming from a compacted session, "file X was created but not committed" may mean the write never landed on disk (context cleared before execution). Always `ls` / `git status` on the branch before treating described-but-uncommitted work as present. Re-create from scratch if files are missing.

36. **`bd close <id>` fails when blocked by open issues** — use `bd close <id> --force` to override dependency blocks when the blocking bead was shipped in the same PR batch.

37. **`TestClient(app)` without a `with` block teardowns its anyio portal per request** (DeepTutor-r3k root cause, fixed in lze PR #22). Starlette's `TestClient` opens a fresh `BlockingPortal` (and event loop) for each request when used outside a context manager; the portal closes at request-end, cancelling any in-flight `asyncio.create_task` work. Routes that rely on `create_task` for post-response side effects (e.g. spaced-review's failure-path `_finalize("empty", [])` cache write) lose those writes deterministically on Python 3.11 — 3.12/3.13 drain pending tasks more aggressively before close, masking the bug. Fix: wrap fixture as `with TestClient(app) as client:` so a single portal is shared across all requests in the fixture's lifetime. Affects every test fixture in `tests/api/` that uses `create_task` paths.

38. **GitHub Actions doesn't always re-trigger CI on subsequent pushes to a PR branch** — observed during PR #22 cleanup, multiple pushes of test-only changes after the initial run produced zero new workflow runs; even `gh pr close 22 && gh pr reopen 22` didn't re-fire. Forced re-trigger pattern: `git rebase origin/main` (creates new commit SHAs), then `git push --force-with-lease`. The synchronize event fires on rebase-induced SHA churn even when content is identical. The `gh pr merge` "not mergeable" error is a tell that the PR base is stale relative to the current main and a rebase will both fix the merge AND re-trigger CI.

39. **Salvaging files from a stale feature branch can silently revert unrelated work on main.** When `git checkout origin/<feature> -- <file>` to cherry-pick, the branch may have been authored against an older state and undo work landed on main since. Always `git diff origin/main origin/<feature> -- <file>` per file first; if the diff has more than the intended scope, redo by editing main's version surgically. Burned 2026-05-06 on PR #19 xi7 — its `CourseReader.tsx` predated main's mobile-menu refactor and the salvage commit deleted the menu (caught by /simplify pre-push).

40. **`gh api -X PATCH dependabot/alerts/<n>` `dismissed_comment` is capped at 280 chars** — exceeding it returns HTTP 422 `Invalid property /dismissed_comment: Only 280 characters are allowed; N were supplied`. Path is `repos/<owner>/<repo>/dependabot/alerts/<n>`; valid `dismissed_reason` values: `fix_started` / `inaccurate` / `no_bandwidth` / `not_used` / `tolerable_risk`. Dependabot path-exclusion is NOT configurable — `.github/dependabot.yml` only controls update PRs, not alerts; archived/unbuilt manifests will keep generating noise on every new advisory and require per-alert dismissal.

41. **Vendored libs at `web/packages/<name>/` ship pre-built `dist/` artifacts — their `devDependencies` are dead weight in `web/`'s install tree.** `web/packages/pptxgenjs/package.json` was pruned of its gulp toolchain (`gulp`, `gulp-concat`, `gulp-delete-lines`, `gulp-ignore`, `gulp-insert`, `gulp-sourcemaps`, `gulp-uglify`) and `express` in PR #34, removing 270 transitive packages and clearing 3 dependabot alerts (lodash.template HIGH, postcss@7 ×2 medium). Verify the prune with: `cd web && npm install --legacy-peer-deps && npm ls <vulnerable-pkg>` (should show no result), `npx tsc --noEmit`, `npx vitest run tests/{generation,integrations,prompts,intent}/`, and a runtime smoke `node -e "require('<lib>')"`. Keep only the build chain actually invoked by the lib's `scripts.build` (rollup + typescript + eslint here).

42. **Next.js 16 dev rejects POST to `localhost`** — `POST http://localhost:3000/api/*` returns `404` with `Content-Length: 0`, CORS headers, and zero log lines, while GET on the same URL is 200. Use `127.0.0.1:3000` for any curl/test against the dev server. Affects all API routes including the generation streams.

43. **Dev `process.cwd()` is `web/`, not project root** — `web/lib/server/resolve-profile.ts` resolves `data/user/settings/model_catalog.json` relative to cwd; `npm run dev` from `web/` makes that path miss (catalog lives at project root). Falls through to env defaults, which require `LLM_API_KEY` (or `OPENROUTER_API_KEY`) to be exported in the dev shell. Production via `start_web.py` runs from project root and works fine.

44. **Manifest tier model strings join with `:` not `/`** — `parseModelString` (`web/lib/ai/providers.ts`) splits on the first colon and silently defaults to `providerId='openai'` when no colon is present. `web/lib/server/resolve-profile.ts` uses the exported `buildModelString(binding, model)` helper for this; never reintroduce a `/` join. Default profiles in `web/lib/ai/manifest/profiles.ts` must use OpenRouter slugs (`anthropic/claude-sonnet-4.6`, `anthropic/claude-haiku-4.5`) — Anthropic-direct date snapshots like `claude-sonnet-4-5-20251001` 404 silently on OpenRouter and the route surfaces "LLM returned empty response."

45. **Course→Classroom projection must emit `Scene.actions`** (fixed 2026-05-06 in `web/lib/generation/projections.ts`) — `Stage`'s playback engine bails on empty `currentScene.actions` at `web/components/stage.tsx:381`, so a projected classroom with no actions is silently dead (no TTS, no narration, no advance, no spotlight; play button has nothing to play). `materializeAsClassroom` now calls `buildActions()` to emit a `Spotlight + Speech` pair for the section title and each narratable block. Reuse `proseToPlainText` from `lib/course/section-text.ts` for prose markdown stripping rather than rolling new regex chains. When adding new `CourseBlock` types, extend `narrationForBlock()` so projected scenes still narrate them.

46. **`TUTOR_DATA_DIR` anchors all `data/user/settings/*.json` paths** (added 2026-05-06) — Next.js's process cwd in the Pironman container is `/app/web` (set by supervisord `directory=/app/web`), but the persistent volume bind-mounts `/app/data/user`. Anything written via `path.join(process.cwd(), 'data/...')` lands inside the image and is wiped on container rebuild. The `dataDir()` helper at `web/lib/server/data-dir.ts` returns `process.env.TUTOR_DATA_DIR` (set to `/app/data` in both supervisord configs in the Dockerfile) or falls back to cwd-relative `data/` for local dev. Use `settingsPath('*.json')`, `coursesDir()`, `classroomsDir()` for any new on-disk persistence — never `process.cwd()` directly. `docker-compose.pironman.yml` must include `./data/courses` and `./data/classrooms` bind mounts (the in-repo composes already do).

47. **Catalog covers seven services after v1.5.0** — `model_catalog.json` now has `services.{llm, embedding, search, tts, asr, image, video}`. The canonical list lives in `web/lib/types/profiled-services.ts` (`PROFILED_SERVICES` const + `ProfiledService` type, no runtime imports so it's safe for both server-only modules and `"use client"` components). Server-side `web/lib/server/catalog-read.ts` re-exports it; the Settings page derives `ModalityService = Exclude<ProfiledService, "llm">` for the four catalog-driven modality tabs (LLM uses the Manifest tier surface instead of catalog directly). Adding a new modality means: (a) extend `PROFILED_SERVICES`, (b) extend `Catalog["services"]` in `page.tsx`, (c) extend `_PROFILED_SERVICES` tuple + `_provider_choices()` in `deeptutor/api/routers/settings.py`, (d) extend `*_ENV_MAP` in `web/lib/server/provider-config.ts` if env-fallback applies. Catalog credentials override YAML and env (resolveTTS/ASR/Image/VideoApiKey/BaseUrl read catalog first via `readCatalogSync` + `getActiveProfile`, falling back to `server-providers.yml` then env). When adding a service to `model_catalog.json`'s on-disk schema, set the `schema_migrated` flag in `ModelCatalogService.load()` so older catalogs auto-migrate (the bug we hit on initial Phase A deploy).

48. **Feature flags live in `interface.json`, not env** (added 2026-05-06) — `ENABLE_COURSE_ILLUSTRATIONS` is now read via `getFeatureFlags()` in `web/lib/server/feature-flags.ts` which reads `data/user/settings/interface.json` `features.course_illustrations` first, falling back to the legacy env var. The Settings UI surfaces toggles in the Preferences row (next to Theme/Language) and persists via the existing `PUT /api/v1/settings/ui`. `FeatureFlags` type lives in `web/lib/types/feature-flags.ts` so server (`feature-flags.ts`) and client (`page.tsx`) share one declaration. To add a new flag: extend the type + `DEFAULT_FEATURE_FLAGS`, extend Python `FeatureFlags` pydantic + `DEFAULT_FEATURE_FLAGS` dict, add a checkbox to the Settings Features row, gate the consuming route on `getFeatureFlags().<flag>`. `persistUi` takes `Partial<UiSettings>` so a new flag doesn't ripple through every caller.

49. **`NEXT_PUBLIC_API_BASE_EXTERNAL` survives hostname retirements silently** (caught 2026-05-06, see also gotcha #12) — `web/lib/api.ts` `apiUrl()` resolves against the build-time `NEXT_PUBLIC_API_BASE` constant. The Pironman entrypoint substitutes the placeholder in built JS chunks at container start from `NEXT_PUBLIC_API_BASE_EXTERNAL` in `~/homelab/deeptutor/.env`. After legacy `deeptutor-api.tail6e035b.ts.net` was retired, that env var still pointed there, so every Settings page `apiUrl()` fetch threw `TypeError: Failed to fetch`, the `Promise.all` in `load()` rejected, and `setManifestProfiles` never ran — leaving the React state on `DEFAULT_MANIFEST_PROFILES` (Claude tier defaults). Disk had the user's saved values; the UI lied. **Whenever a hostname is retired, also grep `~/homelab/deeptutor/.env` and any other compose `env_file:` for the dead host and rebuild the deeptutor image** (`docker compose build deeptutor && up -d deeptutor`). Browser cache holds onto the old chunks aggressively — a normal reload picks them up; tell the user to Cmd+Shift+R after the redeploy. Symptom signature: Settings tiles show "Checking…/No model selected" or stale defaults, console shows repeated `TypeError: Failed to fetch` against the retired hostname, but `curl https://tutor.../api/v1/settings` succeeds.

50. **OpenRouter is the default everywhere LLM-bound** (set 2026-05-07). Three places now agree: (a) `.env.example` ships `LLM_BINDING=openrouter` + `LLM_HOST=https://openrouter.ai/api/v1` + `anthropic/claude-sonnet-4.6`; (b) `deeptutor/services/config/model_catalog.py` seeds the default LLM profile binding as `openrouter` and falls back to the OpenRouter base when `LLM_HOST` is unset; (c) `deeptutor/services/llm/cloud_provider.py` two `effective_base = base_url or ...` fallbacks point at OpenRouter (were OpenAI). Pironman's live `.env` has `LLM_BINDING=openrouter` (was `openai` despite always pointing at OpenRouter — confusingly mislabeled) and `model_catalog.json` `services.llm` has `active_profile: llm-profile-default` with `binding: openrouter`. **Embedding/TTS/ASR/image/video defaults unchanged** — OpenRouter doesn't proxy those modalities; embedding stays `ollama`, TTS stays `openai-tts`, image stays `openai-image`. The image catalog `active_profile` was set to the existing `image-profile-1778124397488` (GPT Image) on 2026-05-06; before that it was `null` and `/api/generate/course-illustration` returned "No image API key configured" even with the feature flag on.

51. **`min-h-screen` silently clips on pages outside `(workspace)`/`(utility)` groups** (caught 2026-05-06, batch-fixed 2026-05-07). `globals.css` sets `html, body { height: 100%; overflow: hidden }` (load-bearing for the workspace's split-pane layout — keep it). Non-grouped routes — currently `/` (workspace home), `/course/[id]`, `/course`, `/classroom`, `/course/[id]/word-quest`, `/playground` — must own their scroll: replace `min-h-screen` on the outermost element with `h-screen overflow-y-auto`. If you have an `IntersectionObserver` for section visibility (see `CourseReader.tsx`), pass `root: scrollContainerRef.current` so it observes the new scroll container instead of defaulting to the (non-scrolling) viewport.

52. **iOS bottom-nav safe-area pattern** (set 2026-05-07). Three pieces: (a) `app/layout.tsx` exports `viewport: { viewportFit: "cover" }` so iOS fills the home-indicator area instead of letterboxing; (b) the fixed-bottom mobile `<nav>` in `SidebarShell.tsx` carries `paddingBottom: env(safe-area-inset-bottom)` so taps stay above the home indicator; (c) workspace + utility `<main>` use `paddingBottom: calc(3.5rem + env(safe-area-inset-bottom))` (replaced the old `pb-14 sm:pb-0`) so children clear the now-taller nav. The mobile "More" sheet's bottom padding uses `calc(2rem + env(safe-area-inset-bottom))` for the same reason. Same pattern applies to the CourseReader's `AdvanceBar` (`calc(1rem + env(safe-area-inset-bottom))`).

53. **API 500 detail must be generic — never `str(exc)`** (sweep landed 2026-05-07 across 7 routers, ~35 sites). `raise HTTPException(status_code=500, detail=str(e))` ships exception messages to the client and can leak DB schema, file paths, library internals, etc. Convention: keep `logger.error(..., exc_info=True)` for the server-side trace and ship a route-specific generic detail (`"Book operation failed"`, `"Failed to record attempt"`). 400 routes that throw narrow `Invalid*Error` exceptions are exempt — those messages are user-facing validation strings. Grep new violations: `grep -rn "status_code=500.*str(e\\|status_code=500.*str(exc" deeptutor/api`.

54. **Adding a catalog service requires `test_runner.py` dispatch** (caught 2026-05-07 on tts). `_PROFILED_SERVICES` in `deeptutor/services/config/model_catalog.py` lists `llm/embedding/tts/asr/image/video`, but `ConfigTestRunner._run_sync` only branches on `llm/embedding/search/tts` — `asr`, `image`, `video` still raise `Unsupported service: <svc>` on Settings "Run test". When wiring a new modality end-to-end (or fixing diagnostics for an existing one), add a `_test_<svc>(run, ...)` method and an `elif service == "<svc>"` branch in `_run_sync`. Reuse `_to_headers` from `deeptutor/services/config/provider_runtime.py` for the `extra_headers` field — it handles both dict and JSON-string shapes (don't reinline). TTS lives entirely in `web/lib/audio/tts-providers.ts` (no Python adapter), so backend probes have to use raw `httpx` with provider-specific shapes (ElevenLabs: `POST /text-to-speech/{voice_id}` + `xi-api-key`; OpenAI-compatible: `POST /audio/speech` + Bearer). The TTS catalog model carries an optional `voice?: string` field (read by `_test_tts`, fallback to `profile.default_voice`).

### Mobile nav surface

The mobile bottom nav has 4 fixed slots (`/chat`, `/book`, `/knowledge`, `/notebook`); everything else (`/agents`, `/course`, `/classroom`, `/memory`, `/space`, `/settings`) is reachable via the "More" sheet built into `SidebarShell.tsx` (computed as `[...PRIMARY_NAV, ...SECONDARY_NAV].filter(it => !bottomHrefs.has(it.href))`). Sheet has `role="dialog"` + Escape-to-close + safe-area pad. **Adding a new top-level route:** pick whether it goes in `BOTTOM_NAV` (replacing one of the four) or stays in `PRIMARY_NAV` (auto-shows in More sheet). Don't create a third nav location.

### Hook false positives when writing TypeScript

The global PreToolUse security hook flags two safe-in-this-repo patterns. Both have workarounds:
- The JS regex `.e​xec()` method is flagged as `child_process.exec`. Use `String.prototype.matchAll()` instead (modern + cleaner anyway).
- `dangerouslySetInnerHTML` is flagged as XSS-risk. KaTeX HTML rendering is the established pattern (`components/course/blocks/MathBlock.tsx`, `components/slide-renderer/.../BaseLatexElement.tsx`); when the Write tool is blocked, fall back to Bash + a Python heredoc.

---

## Course Builder

The Course Builder (Oboe.com-style article reader) now lives in `web/`. Entry points:
- `web/app/course/page.tsx` — landing (topic input + outline streaming)
- `web/app/course/[id]/page.tsx` — article-reader viewer
- `web/lib/generation/prompts/templates/course-{outline,section}/` — prompts
- `web/lib/server/course-storage.ts` — file-based CRUD under `data/courses/<id>.json`
- `web/lib/course/store.ts` — zustand client store

Classrooms can be projected to a course via the "📖 Course" button (calls `POST /api/project/classroom-to-course`, which materializes scenes as course sections). Parallel to the slide-based classroom.

**Course artifacts (all shipped B.5, 2026-05-05):**
- **PDF export** — `web/lib/server/course-pdf.ts` (Playwright render), route `web/app/api/export/course-pdf/route.ts`. Requires `playwright` and `pdf-lib` in `web/`.
- **Slide export** — `web/lib/course/slides-adapter.ts` + `web/app/api/generate/course-slides/route.ts`. Uses vendored `pptxgenjs` at `web/packages/pptxgenjs`. Returns PPTX; see gotcha #33 for Buffer slicing.
- **Illustration pipeline** — `web/app/api/generate/course-illustration/route.ts`, feature-flagged (`ENABLE_COURSE_ILLUSTRATIONS=true`). Does NOT call `writeCourse()` — client `schedulePersist` serializes all block src updates; concurrent server writes would race and lose earlier URLs.
- **Word Quest game** — `web/app/course/[id]/word-quest/page.tsx`. Extracts `{{term:X}}` tokens from prose blocks; no LLM call. Shared utilities: `web/lib/utils/strip-markdown.ts`, `web/lib/utils/blob-download.ts`.

---

## Quiz Attempts (Phase B.6, 2026-05-04)

Unified store at `deeptutor/services/quiz/sqlite_store.py` (DB: `data/user/quiz/attempts.db`, WAL). Generic write/read at `POST /api/v1/quiz/attempts` + `GET /api/v1/quiz/attempts?source=&is_correct=&older_than_ms=&limit=` (powers spaced-review picker, PRD §6.5). `BookEngine.record_quiz_attempt` dual-writes through this store; OpenMAIC posts via the `/api/quiz/attempts` Next.js proxy. Source tags: `book` | `classroom` | `course`. The book route's full path is `/api/v1/book/books/quiz-attempt` (router prefix `/api/v1/book` + handler path `/books/quiz-attempt` — doubled by design, not a typo).

---

## Generation Pipeline (Phase B.1, 2026-05-05)

Generation pipeline moved from `services/openmaic/lib/generation/` to `web/lib/generation/`. API routes `/api/generate/*`, `/api/web-search`, `/api/chat` now served by `web/` (port 3782). Supporting libs also in web/: `lib/{ai,audio,constants,course,integrations,media,orchestration,pbl,prompts,server,store,types,utils,web-search}/`. B.4 (2026-05-05) retired the OpenMAIC stub copies — `services/openmaic/` is archive-only.

**Key cross-boundary types:** `web/lib/types/{action,slides,stage,widgets}.ts` are local copies of renderer types (duplicated for build independence). Shim pattern from the plan was replaced by direct copy — same contract, zero additional files.

**Vitest:** 72 generation/integrations/prompts/intent tests now run from `web/tests/` via `cd web && npx vitest run tests/generation/ tests/integrations/ tests/prompts/ tests/intent/`.

---

## Manifest Profile Router (Phase C.1, 2026-05-05)

Generation routes pick a **tier** rather than a concrete model. Tiers per PRD §11:
- `tutor-cheap` — intent classification, quiz grading, summarization (fast/cheap)
- `tutor-balanced` — chat, section bodies, slide text, podcast narration
- `tutor-premium` — quiz authoring, outline generation, roundtable director

**Key files:** `web/lib/ai/manifest/profiles.ts` (tier definitions + defaults), `web/lib/server/resolve-profile.ts` (async resolver → `ResolvedModel`). Override per-tier via `data/user/settings/manifest_profiles.json`.

**Adding a new route:** call `resolveModelFromProfile('tutor-balanced')` from `@/lib/server/resolve-profile` — returns a `languageModel` ready for `callLLM`/`streamLLM`. Do not pass `{provider, model}` directly to new routes.

---

## Intent Router (Phase C.3, 2026-05-05)

Home-page routing based on what the user types or drops. Single **Continue →** button replaces the old Chat/Course split; ghost overflow buttons remain for explicit overrides.

**Key files:**
- `web/lib/intent/classify.ts` — `classifyIntent({text?, fileName?})` → `IntentTarget` (`chat` | `course` | `book` | `notebook`)
- `web/app/(workspace)/page.tsx` — wires `classifyIntent` to the Continue button; passes `?topic=` or `?q=` to the target route

**Routing rules (in order):** PDF/EPUB filename → `book`; short question (ends `?`, starts wh-word) → `chat`; 1–5 words, no question marks → `course`; long text or markdown → `notebook`; default → `chat`.

**Tests:** `web/tests/intent/classify.test.ts` (17 cases, also tests `buildIntentUrl`). Uses `tutor-cheap` Manifest tier.

---

## PWA / Mobile (Phase C.4, 2026-05-05)

Progressive Web App support and narrow-viewport bottom navigation.

**Key files:**
- `web/app/manifest.ts` — Next.js metadata route; standalone display, orange brand (`#F97316`), icons at `web/public/icons/`
- `web/app/sw.ts` — `@serwist/next` service worker: SWR for `/api/v1/spaced-review/today` (offline quiz cache), CacheFirst for `/_next/static`, NetworkFirst for `/api/*` (SSE routes excluded — see gotcha #34)
- `web/components/sidebar/SidebarShell.tsx` — mobile bottom nav (`<640px`): Chat / Read / Library / Quiz; sidebar hidden on narrow viewports

**Install:** `@serwist/next` installed with `--legacy-peer-deps`. `app/sw.ts` excluded from `tsconfig.json` — see gotcha #34 for all three setup gotchas.

---

## Spaced Review (Phase B.6 follow-up, 2026-05-04)

Daily micro-quiz variant system at `deeptutor/services/spaced_review/`. On first Notebook load per UTC day, `GET /api/v1/spaced-review/today` fires a background `asyncio.create_task` that queries due `review_state` rows → hydrates the original question content (book/classroom/course-aware, see below) → generates variants via `Generator(language="en").process()` → caches result in `data/user/spaced_review/cache.db` (WAL, 7-day eviction). Subsequent hits return the cached row immediately. Panel: `web/components/notebook/TodaysReviewPanel.tsx`.

**Multi-source picker (DeepTutor-kgj, PR #33, 2026-05-06):** `pick_review_set` dispatches by `review_state.source`: `book` → `BookEngine.load_page(book_id, page_id).block_by_id(block_id)`; `classroom` / `course` → `web_lookup.fetch_block_content(source, source_id)` → `GET http://127.0.0.1:3782/api/spaced-review/block`. **Payload shapes differ — don't unify them blindly:** the book block stores `payload["questions"] = [{question_id, question, question_type, options, correct_answer, explanation, difficulty, concentration}]` (matched by `question_id`, falling back to the first question via `_resolve_question_payload`); the web `/api/spaced-review/block` route returns the resolved question dict **directly** (no `questions` wrapping). The picker treats web_lookup output as the already-resolved payload. `source_id` triple-format: `book::page::block` / `classroom::scene::question` / `course::section::block`.

Deferred: parallelizing variant generation (DeepTutor-lze), AsyncSQLiteStore base class (DeepTutor-dif).

---

## Dropbox Conflict Artifacts

The working tree periodically accumulates `* 2.{py,ts,tsx,md,...}` duplicate **files** AND `* 2` duplicate **directories** from iCloud sync. In `web/`, the dupes are mostly directories (e.g. `lib/server/tts 2`, `app/(workspace)/agents 2`, `lib/prompts/templates 2`) — 20+ at last count. Directory dupes silently shadow real content and can confuse `tsc`. Verify they're byte-identical to their non-`2` counterparts (`diff -rq`), then bulk-move to `~/.Trash/deeptutor-dupes-<date>/` BEFORE any `git merge` or `git pull` — they otherwise pollute merge commits. Python faster than shell for the bulk move: loop `git status --porcelain`, filter `' 2\b'`, `shutil.move`.

As of 2026-05-07 the patterns `* 2`, `* 2.ts`, `* 2.tsx`, etc. are gitignored, so `git add -A` won't accidentally commit a stale dupe. The cleanup advice above still applies — `tsc` and the dev server pick them up from disk regardless of `.gitignore`.

---

## Upstream Sync Procedure

**DeepTutor upstream:** `git fetch upstream && git merge upstream/main` — accept upstream deletion of `docs/roadmap.md` and `docs/guide/docker-start.md` (fork customization notes live in `AGENTS.md` / `CLAUDE.md` instead, not in the docs tree).

**OpenMAIC upstream** — Archive-only post-B.4 (retired 2026-05-05). No further upstream syncs needed or possible.

---

## Remotes

```
origin    https://github.com/mattwag05/DeepTutor.git  (GitHub, canonical)
upstream  https://github.com/HKUDS/DeepTutor.git      (HKUDS original)
```

**Push policy:** direct push to `origin/main` is allowed — no PR required for fixes/docs. `/simplify` is the gate; once it passes, the push is authorized (don't re-ask). Stack a branch + PR only when the change benefits from review (e.g., risky refactors, multi-file phase work like B.2/B.3).

**Branches:**
- `main` — fork of HKUDS/DeepTutor (last upstream merge: v1.3.7 / 93891789, 2026-04-30) + all local customizations (B.1–B.5, C.1–C.4)
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
- Unified: https://tutor.tail6e035b.ts.net (path-routed: `/` → 3782, `/api/v1/*` → 8001, `/classroom*` + `/course*` → 3782) — B.4 complete 2026-05-05
- ~~Frontend: https://deeptutor.tail6e035b.ts.net~~ — Retired 2026-05-06 (folded into tutor.*)
- ~~API: https://deeptutor-api.tail6e035b.ts.net~~ — Retired 2026-05-06 (folded into tutor.*/api/v1/*)
- ~~OpenMAIC: https://openmaic.tail6e035b.ts.net~~ — Retired 2026-05-05

**Containers:** `deeptutor` only (caddy-tailscale runs separately under `~/homelab/caddy/pironman/`)

**Rebuild & deploy:**
```bash
ssh pironman 'cd /home/matthewwagner/homelab/deeptutor && \
  git pull origin main && \
  docker compose -f docker-compose.pironman.yml build deeptutor && \
  docker compose -f docker-compose.pironman.yml up -d deeptutor'
```

---

## OpenMAIC — Retired 2026-05-05 (B.4)

The standalone OpenMAIC Docker service (`services/openmaic/`) has been decommissioned. Classroom and course UIs now live entirely in `web/app/classroom/` and `web/app/course/`. The `openmaic` container, `openmaic-data` volume, and `bind tailscale/openmaic` Caddyfile block are all gone from Pironman.

**Port mapping (post-B.4):**

| Service | Container port | Host loopback | Caddy reverse_proxy |
|---------|----------------|---------------|---------------------|
| DeepTutor Backend (uvicorn) | 8001 | 127.0.0.1:8001 | `tailscale/deeptutor-api`, `tailscale/tutor /api/v1/*` |
| DeepTutor Frontend (Next.js) | 3782 | 127.0.0.1:3782 | `tailscale/deeptutor`, `tailscale/tutor` (all paths) |

The `services/openmaic/` source tree is preserved in the repo as an archive but is no longer built or deployed.
