# Tutor

Tutor is an open-source learning app for turning a topic or supporting material
into a polished study experience: lesson, podcast, flash cards, study guide,
quiz, or diagram.

The product goal is intentionally narrow: one creation loop, one reader, and a
small set of useful learning formats. Tutor keeps the open-source foundations
that matter, especially RAG, provider routing, and typed course generation.
The OpenMAIC classroom-generation lineage lives on in git history and the
attribution section, not in the shipped UI.

## Product Shape

The default web experience is:

1. Enter what you want to learn.
2. Optionally attach supporting files and tune focus, length, and complexity.
3. Choose a format: Lesson, Podcast, Flash Cards, Study Guide, Quiz, or Diagram.
4. Read a generated course with sources, inline knowledge checks, follow-up
   prompts, and an always-available question box.
5. Add another format from inside the reader.

The UI is deliberately simple: warm neutral surfaces, ink text, compact
controls, serif lesson typography, a creator setup summary, a sticky bottom
reading-progress bar, quiet contents/source rails, and no visible multi-agent
dashboard chrome.

## Attribution

Tutor builds on two open-source progenitors:

- **DeepTutor** (`HKUDS/DeepTutor`) for the agent-native backend, RAG tooling,
  provider abstractions, CLI/API compatibility, and learning-runtime concepts.
- **OpenMAIC** (`THU-MAIC/OpenMAIC`) for classroom-generation, export,
  media-generation, and visualization concepts. The classroom surfaces built
  on those concepts were retired in the 2026-06 refactor (Course is the single
  learning surface); the code remains recoverable via git history and the
  attribution stands.

The user-facing product is **Tutor**. Internal names such as `deeptutor` remain
for compatibility.

## Naming

User-facing project name: **Tutor**.

Compatibility names retained for now:

- Python package and CLI command: `deeptutor`
- Backend module path: `deeptutor/`
- Web app source path: `web/`

Those internal names are kept to avoid breaking upstream sync, Docker files,
existing data paths, and CLI installs.

## Key Directories

| Path | Purpose |
| --- | --- |
| `web/app/course/page.tsx` | Canonical Tutor creator route (`/course`; bare `/` redirects here) |
| `web/components/course/TutorCreator.tsx` | Prompt/settings/format creation UI |
| `web/components/course/CourseReader.tsx` | Primary lesson reader and format surface |
| `web/app/api/generate/course-*` | Course section and artifact generation routes |
| `web/lib/types/course.ts` | Course, format, artifact, and preference types |
| `deeptutor/` | Python backend, CLI, RAG, session, and agent runtime |
| `graphify-out/GRAPH_REPORT.md` | Generated code graph report |

## Local Setup

Backend:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -e ".[server]"
python -m uvicorn deeptutor.api.main:app --reload --port 8001
```

Frontend:

```bash
cd web
npm install
npm run dev
```

The development frontend defaults to `http://localhost:3000` unless the start
scripts choose another port.

## Product Workflow

Tutor's primary product loop is documented in
[`docs/product.md`](docs/product.md): create a course, read with sources and
inline checks, ask follow-up questions, and add another format. Use that runbook
for creator and reader QA before shipping product changes.

## Model Settings

Use `/settings` for provider configuration. The panel manages Manifest LLM
profiles plus catalog-backed embedding, search, TTS, ASR, and image profiles.
It provides provider presets, endpoint/model fields, hidden-key status,
save/test feedback, and disabled/running button states without echoing API keys
into visible page text.

Settings are persisted under `data/user/settings/model_catalog.json` and win
over `.env`. Save Draft updates the catalog; Apply syncs compatible values back
to env-backed paths for CLI and non-UI compatibility. Embedding profiles also
support request timeout, batch size, and batch delay controls; search profiles
support max-results and proxy controls.

## Docker Image

Tutor publishes a multi-platform production image to GitHub Container Registry:

```bash
docker pull ghcr.io/mattwag05/tutor:latest
```

Use `docker-compose.ghcr.yml` for a pull-based deployment. Release tags, the
`main` tag, and short SHA tags are produced by `.github/workflows/docker-release.yml`.

For a self-hosted production deployment, pull a published GHCR tag (prefer a
pinned `sha-<short>` tag for rollback-sensitive deploys) and run it behind your
reverse proxy of choice. The root `docker-compose.yml` is a local source-build
compose, not the production compose.

## Validation

Run these before shipping product changes:

```bash
cd web
npm exec tsc -- --noEmit --pretty false
npm run lint
npm run test
npm run i18n:check
npm audit --audit-level=moderate
NEXT_PUBLIC_API_BASE=http://localhost:8001 npm run build
npm run perf:check
npm exec eslint -- components/course/TutorCreator.tsx components/course/CourseReader.tsx components/course/CourseTOCDrawer.tsx components/course/AdvanceBar.tsx components/course/SectionProgressBar.tsx
npm exec vitest run tests/course-format.test.ts tests/prompts/course-diagram.test.ts
npm run test:course-flow
```

`npm run test` runs both Vitest suites and the Node-owned unit tests. Files
importing `node:test` are excluded from Vitest and discovered by
`web/scripts/run-node-tests.mjs`.

`npm run lint` is a repo-wide gate. React compiler migration findings currently
report as warnings so they remain visible without blocking unrelated Tutor
course-flow work. `npm run i18n:check` is expected to pass cleanly; user-facing
labels, including shared workspace controls and accessibility labels, should
stay localized through `web/locales/{en,zh}/app.json`. `npm run perf:check`
expects a completed Next build and reads `.next/server/app` client-reference
manifests; route budgets are full client chunk totals for the current Tutor
routes, including shared shell chunks.
`npm audit --audit-level=moderate` is part of the frontend production-readiness
gate and should report 0 vulnerabilities before publishing a new image.

For Python changes:

```bash
source .venv/bin/activate
python -m pytest tests/services/session tests/services/rag tests/api
```

For graph maintenance:

```bash
graphify update .
```

## Upstreams

Tutor tracks the two upstream progenitors selectively:

- `HKUDS/DeepTutor` for backend, RAG, provider, and security fixes.
- `THU-MAIC/OpenMAIC` for export and media-generation ideas. (The classroom
  surface it seeded was removed in the 2026-06 refactor and is not coming
  back; do not port classroom features.)

Do not blindly merge upstream heads into Tutor. Fetch them, inspect the diff,
and port only fixes that improve the simplified Tutor product or close concrete
security/compatibility gaps.

## License

Apache-2.0. See [LICENSE](LICENSE).
