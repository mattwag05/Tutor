# DeepTutor CLAUDE.md

AI tutoring platform — multi-agent RAG architecture, Python/FastAPI backend, Next.js frontend.

**Status:** 🔨 In Development (synced from upstream 2026-04-30 → v1.3.7; OpenMAIC retired B.4; Manifest router live C.1; Intent router + PWA live C.3/C.4 2026-05-05)
**Repo:** https://github.com/mattwag05/DeepTutor.git
**Upstream:** https://github.com/HKUDS/DeepTutor (main at 445e762)
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

12. **Pironman never adopted the tailscale sidecar pattern** — base `docker-compose.yml` defines a `tailscale-deeptutor` sidecar; Pironman's `docker-compose.pironman.yml` ignores it. The production reverse proxy is `caddy-tailscale` (`~/homelab/caddy/pironman/`) which registers `bind tailscale/{deeptutor, deeptutor-api, tutor}` against host loopback ports `3782 / 8001`. **OpenMAIC (port 3101) was retired 2026-05-05 (B.4)** — classroom + course routes now all proxy to 3782. The `tailscale-deeptutor` orphan container has no production role. For new tailnet hostnames, edit Caddyfile and `docker compose restart caddy`.

13. **TTS for course audio** uses `TTS_OPENAI_API_KEY` from the main `.env`. Route: `web/app/api/generate/course-audio/route.ts`.

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

26. **`npx tsc --noEmit` in `web/` produces iCloud dupe errors in `.next/types/*.d 2.ts`.** Filter with `grep -v " 2\.ts"` (not just `grep -v eval/`). Source code is clean; the `.next/` build dir accumulates `" 2"`-suffix iCloud artifacts.

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

Daily micro-quiz variant system at `deeptutor/services/spaced_review/`. On first Notebook load per UTC day, `GET /api/v1/spaced-review/today` fires a background `asyncio.create_task` that queries wrong book attempts >24h old → joins with `BookEngine.load_page(book_id, page_id).block_by_id(block_id)` to get original question content → generates variants via `Generator(language="en").process()` → caches result in `data/user/spaced_review/cache.db` (WAL, 7-day eviction). Subsequent hits return the cached row immediately. Book block payload shape: `payload["questions"] = [{question_id, question, question_type, options, correct_answer, explanation, difficulty, concentration}]` — matched by `question_id`, falling back to first question. Panel: `web/components/notebook/TodaysReviewPanel.tsx`. Deferred: parallelizing generation (DeepTutor-lze), AsyncSQLiteStore base class (DeepTutor-dif), cron pre-warm.

---

## Dropbox Conflict Artifacts

The working tree periodically accumulates `* 2.{py,ts,tsx,md,...}` duplicate **files** AND `* 2` duplicate **directories** from iCloud sync. In `web/`, the dupes are mostly directories (e.g. `lib/server/tts 2`, `app/(workspace)/agents 2`, `lib/prompts/templates 2`) — 20+ at last count. Directory dupes silently shadow real content and can confuse `tsc`. Verify they're byte-identical to their non-`2` counterparts (`diff -rq`), then bulk-move to `~/.Trash/deeptutor-dupes-<date>/` BEFORE any `git merge` or `git pull` — they otherwise pollute merge commits. Python faster than shell for the bulk move: loop `git status --porcelain`, filter `' 2\b'`, `shutil.move`.

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
- Frontend: https://deeptutor.tail6e035b.ts.net (→ 127.0.0.1:3782)
- API: https://deeptutor-api.tail6e035b.ts.net (→ 127.0.0.1:8001)
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
