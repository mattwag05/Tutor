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
- Closed drawers and dialogs must not expose hidden links or artifact actions
  in body text, accessibility traversal, or Playwright text snapshots.
- `Go Deeper` prompts and the sticky question composer both create follow-up
  lesson sections through `addFollowUpSection`.
- The sources control reads from `course.citations`.

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
npm exec eslint -- components/course/TutorCreator.tsx components/course/CourseReader.tsx components/course/CourseTOCDrawer.tsx components/course/AdvanceBar.tsx components/course/SectionProgressBar.tsx
npm exec vitest run tests/course-format.test.ts tests/prompts/course-diagram.test.ts
npm audit --omit=dev --json
```

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
concepts. Tutor retains OpenMAIC (`THU-MAIC/OpenMAIC`) under
`services/openmaic/` as a classroom-generation, export, media, and visualization
progenitor/archive. Keep these attributions present in project documentation
while keeping the primary UI focused on Tutor's course workflow.
