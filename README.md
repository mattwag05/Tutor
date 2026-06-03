# Tutor

Tutor is an open-source learning app for turning a topic or supporting material
into a polished study experience: lesson, podcast, flash cards, study guide,
quiz, or diagram.

The product goal is intentionally narrow: one creation loop, one reader, and a
small set of useful learning formats. Tutor keeps the open-source foundations
that matter, especially RAG, provider routing, typed course generation, and
classroom-generation code retained as a progenitor/archive rather than the
primary UI.

## Product Shape

The default web experience is:

1. Enter what you want to learn.
2. Optionally attach supporting files and tune focus, length, and complexity.
3. Choose a format: Lesson, Podcast, Flash Cards, Study Guide, Quiz, or Diagram.
4. Read a generated course with sources, inline knowledge checks, follow-up
   prompts, and an always-available question box.
5. Add another format from inside the reader.

The UI is deliberately simple: warm neutral surfaces, ink text, compact
controls, serif lesson typography, a sticky bottom reading-progress bar, and no
visible multi-agent dashboard chrome.

## Attribution

Tutor builds on two open-source progenitors:

- **DeepTutor** (`HKUDS/DeepTutor`) for the agent-native backend, RAG tooling,
  provider abstractions, CLI/API compatibility, and learning-runtime concepts.
- **OpenMAIC** (`THU-MAIC/OpenMAIC`) for classroom-generation, export,
  media-generation, and visualization ideas retained under `services/openmaic/`.

The user-facing product is **Tutor**. Internal names such as `deeptutor` remain
for compatibility, and OpenMAIC classroom surfaces are archived or feature-gated
unless they directly support the simplified Tutor course workflow.

## Naming

User-facing project name: **Tutor**.

Compatibility names retained for now:

- Python package and CLI command: `deeptutor`
- Backend module path: `deeptutor/`
- Web app source path: `web/`
- Vendored OpenMAIC archive: `services/openmaic/`

Those internal names are kept to avoid breaking upstream sync, Docker files,
existing data paths, and CLI installs.

## Key Directories

| Path | Purpose |
| --- | --- |
| `web/app/(workspace)/page.tsx` | Default Tutor creator entrypoint |
| `web/components/course/TutorCreator.tsx` | Prompt/settings/format creation UI |
| `web/components/course/CourseReader.tsx` | Primary lesson reader and format surface |
| `web/app/api/generate/course-*` | Course section and artifact generation routes |
| `web/lib/types/course.ts` | Course, format, artifact, and preference types |
| `deeptutor/` | Python backend, CLI, RAG, session, and agent runtime |
| `services/openmaic/` | OpenMAIC archive/progenitor code |
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

## Docker Image

Tutor publishes a multi-platform production image to GitHub Container Registry:

```bash
docker pull ghcr.io/mattwag05/tutor:latest
```

Use `docker-compose.ghcr.yml` for a pull-based deployment. Release tags, the
`main` tag, and short SHA tags are produced by `.github/workflows/docker-release.yml`.

For the production Pironman deployment, use the guarded deploy script and
runbook in [`docs/deployment.md`](docs/deployment.md):

```bash
scripts/deploy_pironman.sh
```

## Validation

Run these before shipping product changes:

```bash
cd web
npm run lint
npm run test
```

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
- `THU-MAIC/OpenMAIC` for classroom generation, export, and media-generation
  ideas.

Do not blindly merge upstream heads into Tutor. Fetch them, inspect the diff,
and port only fixes that improve the simplified Tutor product or close concrete
security/compatibility gaps.

## License

Apache-2.0. See [LICENSE](LICENSE).
