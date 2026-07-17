# Tutor Product Runbook

Tutor's primary product is the course creation and reader loop:

1. Start with a topic, question, or supporting file.
2. Choose one of the six v1 formats: lesson, podcast, flashcards, study guide,
   quiz, or diagram.
3. Generate a course.
4. Read the lesson, review sources, answer inline checks, and ask follow-up
   questions.
5. Add a new format or generate a deeper follow-up section from the reader.

The default UI should feel like a focused educational workspace: restrained
typography, warm neutral surfaces, clear controls, and durable reading
ergonomics. Do not reintroduce a multi-surface workspace feel into the primary
course flow.

The current reader shell uses rails as quiet orientation, not as a dashboard:
the article column should stay visually open, avoid stacked duplicate divider
lines, keep lesson titles readable across desktop and mobile, and preserve a
compact mobile header so the course title remains the primary signal.

The creator's left rail owns recent courses and starting prompts. The right rail
should summarize the current course plan: selected format, length, complexity,
focus, source attachment state, and a concise reader promise. Keep that right
rail as one quiet plan surface; avoid separate helper panels that compete with
the live setup summary. Avoid repeating the same prompt/history list in both
rails.

## Core Surfaces

| Surface | Path | Primary files |
| --- | --- | --- |
| Course creator | `/course` | `web/components/course/TutorCreator.tsx` |
| Course reader | `/course/[id]` | `web/components/course/CourseReader.tsx` |
| Reader navigation | `/course/[id]` | `CourseTOCDrawer.tsx`, `AdvanceBar.tsx`, `SectionProgressBar.tsx` |
| Course persistence | `/api/course`, `/api/course/[id]` | `web/app/api/course/*` |
| Artifacts | `/api/generate/course-*` | `web/app/api/generate/course-*` |

## Reader Interaction Rules

- Keep `SectionProgressBar` sticky at the bottom of the viewport.
- Keep `AdvanceBar` offset above both the question composer and the progress
  bar.
- Do not show `AdvanceBar` before the reader has made meaningful progress
  through the current section.
- Keep the question composer available, but compact enough on mobile that it
  does not dominate the article body.
- Keep mobile header actions compact while preserving accessible names for
  Sources and New Format; do not let toolbar text crowd the course title.
- The table of contents drawer should behave like a standard named dialog:
  visible title, section summary, close button, Escape/backdrop dismissal, and
  no hidden artifact actions after close.
- Sources should open in a named dialog with a source-count summary and standard
  Escape/backdrop dismissal.
- The Add Format dialog should present only working actions: localized format
  choices, optional focus prompt, no placeholder upload controls, named dialog
  semantics, and standard Escape/backdrop dismissal.
- Generated artifact overlays should be named fullscreen dialogs with a visible
  title, icon close control, and Escape dismissal. Opening an artifact from the
  table of contents must close the contents drawer first.
- Avoid duplicate vertical rules around the article column. The left contents
  rail and right sources rail can carry the structural borders.
- Closed drawers and dialogs must not expose hidden links or artifact actions
  in body text, accessibility traversal, or Playwright text snapshots.
- `Go Deeper` prompts and the sticky question composer both create follow-up
  lesson sections through `addFollowUpSection`.
- Reader text inputs should have localized accessible names in addition to
  visible placeholders, and media controls should not contain hardcoded English
  labels.
- Compound visual controls, such as section rows and quiz answer choices, should
  have explicit localized accessible names instead of relying on concatenated
  fragments like section number + title + status.
- The sources control reads from `course.citations`.

## Creator Interaction Rules

- Keep recent courses and starting prompts in one place: the left rail on
  desktop, or the main flow on smaller screens.
- Use the right rail for live setup context, not duplicate navigation.
- The course plan summary should update when format, length, complexity, focus,
  or attached files change.
- The source upload panel should visibly reflect attached files as scannable
  rows with per-file remove controls, not only the toolbar chip or right-rail
  summary.
- Keep advanced setup controls adjacent to the prompt composer when expanded,
  before the format and source steps, so mobile learners are not jumped down the
  flow to change length, complexity, or focus.
- Keep the next-step explanation inside the course plan card instead of a
  separate attention-grabbing helper card.
- Keep visible text and accessible names aligned for creator controls; text
  buttons should not announce a different action than they display.
- Do not add fake metrics, badges, or dashboard-style progress widgets to the
  creator.

## Design Guidance

Use the prior Tutor course reader as the visual anchor. Apply the audit-first
guidance from `Leonxlnx/taste-skill` as a critique lens only:

- audit the rendered UI before changing code,
- prefer hierarchy, density, and spacing fixes over decorative styling,
- keep one radius and shadow language per surface,
- use Lucide icons already present in the project,
- avoid generic hero/landing-page composition for product surfaces.

The product direction is "Tutor-native educational workspace." It should not
look like a clone of another product.

## QA Checklist

Run a browser-backed QA pass for any creator or reader change:

1. Open `/course` on desktop and mobile.
2. Verify the creator renders meaningful content and has no framework overlay.
3. Create or load a deterministic test course.
4. Open `/course/[id]` on desktop and mobile.
5. Verify the progress bar starts at 0%, changes while scrolling, and remains
   visible.
6. Verify the Advance button is not visible at the top of a long section and
   appears after the reader has progressed through the section.
7. Open and close the table of contents drawer.
8. Open sources.
9. Open Add Format and confirm all six v1 formats are available.
10. Exercise one inline quiz/check and one follow-up prompt.

Useful commands:

```bash
cd web
npm exec tsc -- --noEmit --pretty false
npm run lint
npm run test
npm run i18n:check
npm exec eslint -- components/course/TutorCreator.tsx components/course/CourseReader.tsx components/course/CourseTOCDrawer.tsx components/course/AdvanceBar.tsx components/course/SectionProgressBar.tsx
npm exec vitest run tests/course-format.test.ts tests/prompts/course-diagram.test.ts
npm run test:course-flow
npm audit --omit=dev --json
```
Test ownership:

- Vitest owns files that import from `vitest`.
- Node's built-in test runner owns files that import `node:test`.
- `npm run test` runs both groups; keep new tests in the correct group so the
  full test gate stays trustworthy.

Current lint policy:

- Conventional ESLint errors should block changes.
- React compiler migration findings are warnings while the legacy patterns are
  being cleaned up incrementally.
- `npm run i18n:check` is expected to pass cleanly. The primary course creator,
  reader controls, artifacts, Word Quest, Settings controls, shared workspace
  controls, and accessibility labels should stay localized through
  `web/locales/{en,zh}/app.json`.

After code changes:

```bash
graphify update .
```

## Dependency Note

Do not force all `brace-expansion` consumers to v5. Older CommonJS
`minimatch@3` needs the v1 API shape. Modern `minimatch@10` can use v5, while
old minimatch should resolve its own patched nested `brace-expansion@1.x`.

## Attribution

Tutor builds on DeepTutor (`HKUDS/DeepTutor`) for the agent-native backend,
RAG tooling, provider routing, CLI/API compatibility, and learning-runtime
concepts. Tutor also descends from OpenMAIC (`THU-MAIC/OpenMAIC`) for
classroom-generation, export, media, and visualization concepts; the classroom
surfaces built on them were retired in the 2026-06 refactor (Course is the
single learning surface; code recoverable via git history). Keep these
attributions present in project documentation.
