/**
 * Course Builder client-side store.
 *
 * Holds the current course being viewed, per-section generation state, and
 * progress. Persists back to the server via PUT /api/course/[id] whenever
 * meaningful state changes.
 *
 * Intentionally minimal — no IndexedDB layer yet. The server is the source
 * of truth; the store is a hydrated cache for the active session.
 */

'use client';

import { create } from 'zustand';
import type {
  Course,
  CourseBlock,
  CourseCitation,
  CourseSection,
  Language,
} from '@/lib/types/course';

interface SectionGenState {
  status: 'pending' | 'generating' | 'ready' | 'error';
  error?: string;
}

interface CourseStoreState {
  course: Course | null;
  /** Per-section hydration state, keyed by section id. */
  sectionState: Record<string, SectionGenState>;
  /** Index of the currently visible section (for AdvanceBar + AutoHydrate). */
  activeSectionIndex: number;
  hydrating: boolean;

  // ==================== Mutations ====================

  setCourse: (course: Course) => void;
  setHydrating: (v: boolean) => void;
  setActiveSectionIndex: (i: number) => void;

  /** Replace a section's blocks (called after generation success). */
  applySectionBlocks: (sectionId: string, blocks: CourseBlock[], citations: CourseCitation[]) => void;

  /** Mark a section as generating / error / ready. */
  setSectionStatus: (sectionId: string, state: SectionGenState) => void;

  /** Mark section progress (completed / in-progress). */
  markSectionComplete: (sectionId: string) => void;

  // ==================== Server sync ====================

  /** Fetch course from server and replace local state. */
  loadCourse: (id: string) => Promise<void>;

  /**
   * Persist current course to server (debounced by the caller — the store
   * performs the raw fetch only). Silent on failure; returns ok flag.
   */
  persist: () => Promise<boolean>;

  /**
   * Generate a section on-demand. POSTs to /api/generate/course-section
   * with the full course outline context, then applies the resulting
   * blocks and citations to the store.
   */
  generateSection: (sectionId: string) => Promise<void>;
}

export const useCourseStore = create<CourseStoreState>((set, get) => ({
  course: null,
  sectionState: {},
  activeSectionIndex: 0,
  hydrating: false,

  setCourse: (course) => {
    // Seed sectionState from course.sections so blocks arrays already
    // populated count as 'ready'.
    const sectionState: Record<string, SectionGenState> = {};
    for (const section of course.sections) {
      sectionState[section.id] = {
        status: section.blocks.length > 0 ? 'ready' : section.status || 'pending',
      };
    }
    set({ course, sectionState, activeSectionIndex: 0 });
  },

  setHydrating: (v) => set({ hydrating: v }),
  setActiveSectionIndex: (i) => set({ activeSectionIndex: i }),

  applySectionBlocks: (sectionId, blocks, citations) => {
    const course = get().course;
    if (!course) return;
    const newSections = course.sections.map((s) =>
      s.id === sectionId ? { ...s, blocks, status: 'ready' as const } : s,
    );
    const newCitations = { ...course.citations };
    for (const c of citations) {
      newCitations[c.id] = c;
    }
    set({
      course: { ...course, sections: newSections, citations: newCitations },
      sectionState: {
        ...get().sectionState,
        [sectionId]: { status: 'ready' },
      },
    });
  },

  setSectionStatus: (sectionId, state) =>
    set({
      sectionState: { ...get().sectionState, [sectionId]: state },
    }),

  markSectionComplete: (sectionId) => {
    const course = get().course;
    if (!course) return;
    const progress = course.progress || { sections: {} };
    const newProgress = {
      ...progress,
      sections: { ...progress.sections, [sectionId]: 'completed' as const },
    };
    set({ course: { ...course, progress: newProgress } });
  },

  loadCourse: async (id) => {
    set({ hydrating: true });
    try {
      const res = await fetch(`/api/course/${id}`);
      if (!res.ok) {
        set({ hydrating: false });
        return;
      }
      const course = (await res.json()) as Course;
      get().setCourse(course);
    } finally {
      set({ hydrating: false });
    }
  },

  persist: async () => {
    const course = get().course;
    if (!course) return false;
    try {
      const res = await fetch(`/api/course/${course.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(course),
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  generateSection: async (sectionId) => {
    const course = get().course;
    if (!course) return;
    const section = course.sections.find((s) => s.id === sectionId);
    if (!section) return;

    // Already generating or ready? Skip.
    const existing = get().sectionState[sectionId];
    if (existing?.status === 'generating' || existing?.status === 'ready') return;

    get().setSectionStatus(sectionId, { status: 'generating' });

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
        get().setSectionStatus(sectionId, { status: 'error', error: err || 'Generation failed' });
        return;
      }

      const data = (await res.json()) as {
        section: CourseSection;
        citations: CourseCitation[];
      };

      get().applySectionBlocks(sectionId, data.section.blocks, data.citations || []);
      void get().persist();
    } catch (error) {
      get().setSectionStatus(sectionId, {
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
}));

// Convenience selector for a section by id
export function useCourseSection(sectionId: string): CourseSection | undefined {
  return useCourseStore((s) => s.course?.sections.find((sec) => sec.id === sectionId));
}

// Helper to build a minimal Course from an outline stream result, used by
// the landing page after the stream finishes.
export function seedCourseFromOutline(params: {
  id: string;
  title: string;
  topic: string;
  language: Language;
  knowledgeBase?: string;
  sections: CourseSection[];
}): Course {
  return {
    id: params.id,
    title: params.title,
    topic: params.topic,
    language: params.language,
    knowledgeBase: params.knowledgeBase,
    createdAt: new Date().toISOString(),
    sections: params.sections.map((s) => ({
      ...s,
      blocks: s.blocks || [],
      goDeeperPrompts: s.goDeeperPrompts || [],
      status: s.status || 'pending',
    })),
    citations: {},
    progress: { sections: {} },
  };
}
