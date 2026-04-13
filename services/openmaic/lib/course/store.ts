'use client';

import { create } from 'zustand';
import { createSelectors } from '@/lib/utils/create-selectors';
import type {
  Course,
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
  markSectionComplete: (sectionId: string) => void;

  loadCourse: (id: string) => Promise<void>;
  generateSection: (sectionId: string) => Promise<void>;
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
}));

export const useCourseStore = createSelectors(useCourseStoreBase);
