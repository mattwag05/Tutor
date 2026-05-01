'use client';

import { create } from 'zustand';
import { createSelectors } from '@/lib/utils/create-selectors';
import type {
  Course,
  CourseArtifacts,
  CourseBlock,
  CourseCitation,
  CourseSection,
} from '@/lib/types/course';

const PERSIST_DEBOUNCE_MS = 500;

interface CourseStoreState {
  course: Course | null;

  setCourse: (course: Course) => void;

  applySectionBlocks: (
    sectionId: string,
    blocks: CourseBlock[],
    citations: CourseCitation[],
  ) => void;
  setSectionStatus: (
    sectionId: string,
    status: NonNullable<CourseSection['status']>,
    error?: string,
  ) => void;
  setSectionAudio: (sectionId: string, audio: NonNullable<CourseSection['audio']>) => void;
  markSectionComplete: (sectionId: string) => void;

  loadCourse: (id: string) => Promise<void>;
  generateSection: (sectionId: string) => Promise<void>;
  generateArtifact: (
    kind: 'flashcards' | 'studyGuide' | 'finalExam' | 'podcast',
    mode?: 'solo' | 'conversational',
  ) => Promise<void>;
  applyArtifact: (patch: Partial<CourseArtifacts>) => void;
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;
let persistInFlight: Promise<unknown> | null = null;
let persistPending = false;

/** Trailing-edge debounced PUT of the current course to /api/course/[id]. */
function schedulePersist(getCourse: () => Course | null) {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void runPersist(getCourse);
  }, PERSIST_DEBOUNCE_MS);
}

async function runPersist(getCourse: () => Course | null) {
  if (persistInFlight) {
    persistPending = true;
    return;
  }
  const course = getCourse();
  if (!course) return;
  persistInFlight = fetch(`/api/course/${course.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(course),
  }).catch(() => undefined);
  await persistInFlight;
  persistInFlight = null;
  if (persistPending) {
    persistPending = false;
    schedulePersist(getCourse);
  }
}

function updateSection(
  course: Course,
  sectionId: string,
  patch: (section: CourseSection) => CourseSection,
): Course {
  return {
    ...course,
    sections: course.sections.map((s) => (s.id === sectionId ? patch(s) : s)),
  };
}

const useCourseStoreBase = create<CourseStoreState>((set, get) => ({
  course: null,

  setCourse: (course) => set({ course }),

  applySectionBlocks: (sectionId, blocks, citations) => {
    const course = get().course;
    if (!course) return;
    const newCitations = { ...course.citations };
    for (const c of citations) newCitations[c.id] = c;
    set({
      course: {
        ...updateSection(course, sectionId, (s) => ({
          ...s,
          blocks,
          status: 'ready',
          error: undefined,
        })),
        citations: newCitations,
      },
    });
    schedulePersist(() => get().course);
  },

  setSectionStatus: (sectionId, status, error) => {
    const course = get().course;
    if (!course) return;
    set({
      course: updateSection(course, sectionId, (s) => ({ ...s, status, error })),
    });
  },

  setSectionAudio: (sectionId, audio) => {
    const course = get().course;
    if (!course) return;
    set({
      course: updateSection(course, sectionId, (s) => ({ ...s, audio })),
    });
    schedulePersist(() => get().course);
  },

  markSectionComplete: (sectionId) => {
    const course = get().course;
    if (!course) return;
    const progress = course.progress || { sections: {} };
    set({
      course: {
        ...course,
        progress: {
          ...progress,
          sections: { ...progress.sections, [sectionId]: 'completed' },
        },
      },
    });
    schedulePersist(() => get().course);
  },

  loadCourse: async (id) => {
    const res = await fetch(`/api/course/${id}`);
    if (!res.ok) return;
    const course = (await res.json()) as Course;
    // Any sections with blocks already populated are implicitly 'ready'
    course.sections = course.sections.map((s) => ({
      ...s,
      status: s.blocks.length > 0 ? 'ready' : s.status || 'pending',
    }));
    set({ course });
  },

  generateSection: async (sectionId) => {
    const course = get().course;
    if (!course) return;
    const section = course.sections.find((s) => s.id === sectionId);
    if (!section) return;
    // Skip if already generating or ready — dedupes races between the
    // IntersectionObserver and the prefetch effect.
    if (section.status === 'generating' || section.status === 'ready') return;

    get().setSectionStatus(sectionId, 'generating');

    try {
      const res = await fetch('/api/generate/course-section', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseTitle: course.title,
          topic: course.topic,
          language: course.language,
          knowledgeBase: course.knowledgeBase,
          personalization: course.personalization,
          courseOutline: course.sections.map((s) => ({
            id: s.id,
            order: s.order,
            title: s.title,
            description: s.description,
          })),
          section: {
            id: section.id,
            order: section.order,
            title: section.title,
            description: section.description,
          },
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        get().setSectionStatus(sectionId, 'error', err || 'Generation failed');
        return;
      }

      const data = (await res.json()) as {
        section: CourseSection;
        citations: CourseCitation[];
      };
      get().applySectionBlocks(sectionId, data.section.blocks, data.citations || []);
    } catch (error) {
      get().setSectionStatus(
        sectionId,
        'error',
        error instanceof Error ? error.message : String(error),
      );
    }
  },
  applyArtifact: (patch) => {
    const course = get().course;
    if (!course) return;
    set({ course: { ...course, artifacts: { ...(course.artifacts || {}), ...patch } } });
    schedulePersist(() => get().course);
  },

  generateArtifact: async (kind, mode) => {
    const course = get().course;
    if (!course) return;

    type FlashcardItem = NonNullable<NonNullable<CourseArtifacts['flashcards']>['cards']>[number];
    type ExamQuestion = NonNullable<NonNullable<CourseArtifacts['finalExam']>['questions']>[number];

    if (kind === 'podcast') {
      const podcastMode = mode ?? 'solo';
      const endpoint =
        podcastMode === 'conversational'
          ? '/api/generate/course-podcast-conversational'
          : '/api/generate/course-podcast-solo';

      const existingPodcast = course.artifacts?.podcast || {};
      get().applyArtifact({
        podcast: { ...existingPodcast, [podcastMode]: { status: 'generating' } },
      });

      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ courseId: course.id }),
        });
        if (!res.ok) {
          const err = await res.text();
          const cur = get().course?.artifacts?.podcast || {};
          get().applyArtifact({
            podcast: {
              ...cur,
              [podcastMode]: { status: 'error', error: err || 'Generation failed' },
            },
          });
          return;
        }
        const data = (await res.json()) as {
          audioUrl?: string;
          transcript?: string;
        };
        const cur = get().course?.artifacts?.podcast || {};
        get().applyArtifact({
          podcast: {
            ...cur,
            [podcastMode]: {
              status: 'ready',
              audioUrl: data.audioUrl,
              transcript: data.transcript,
              generatedAt: new Date().toISOString(),
            },
          },
        });
      } catch (error) {
        const cur = get().course?.artifacts?.podcast || {};
        get().applyArtifact({
          podcast: {
            ...cur,
            [podcastMode]: {
              status: 'error',
              error: error instanceof Error ? error.message : String(error),
            },
          },
        });
      }
      return;
    }

    // Optimistic status update — no persist, artifact data not yet available
    set({
      course: {
        ...course,
        artifacts: { ...(course.artifacts || {}), [kind]: { status: 'generating' } },
      },
    });

    const endpointMap = {
      flashcards: '/api/generate/course-flashcards',
      studyGuide: '/api/generate/course-study-guide',
      finalExam: '/api/generate/course-final-exam',
    };

    try {
      const res = await fetch(endpointMap[kind], {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId: course.id }),
      });

      if (!res.ok) {
        const err = await res.text();
        get().applyArtifact({ [kind]: { status: 'error', error: err || 'Generation failed' } });
        return;
      }

      const data = (await res.json()) as Record<string, unknown>;
      if (kind === 'flashcards') {
        get().applyArtifact({ flashcards: { status: 'ready', cards: data.cards as FlashcardItem[] } });
      } else if (kind === 'studyGuide') {
        get().applyArtifact({ studyGuide: { status: 'ready', content: data.content as string } });
      } else if (kind === 'finalExam') {
        get().applyArtifact({ finalExam: { status: 'ready', questions: data.questions as ExamQuestion[] } });
      }
    } catch (error) {
      get().applyArtifact({ [kind]: { status: 'error', error: error instanceof Error ? error.message : String(error) } });
    }
  },
}));

export const useCourseStore = createSelectors(useCourseStoreBase);
