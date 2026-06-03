'use client';

import { create } from 'zustand';
import { nanoid } from 'nanoid';
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
  setBlockSrc: (blockId: string, src: string) => void;
  setTitle: (title: string) => void;
  addFollowUpSection: (afterSectionId: string, prompt: string) => string | null;

  loadCourse: (id: string) => Promise<void>;
  generateSection: (sectionId: string) => Promise<void>;
  regenerateSection: (sectionId: string) => Promise<void>;
  generateArtifact: (
    kind: 'flashcards' | 'studyGuide' | 'finalExam' | 'podcast' | 'diagram',
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

async function readFailureMessage(res: Response, fallback: string): Promise<string> {
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      const data = (await res.json()) as { error?: unknown; message?: unknown };
      const message = typeof data.error === 'string' ? data.error : data.message;
      if (typeof message === 'string' && message.trim()) return message.trim();
    } catch {
      return fallback;
    }
  }

  let text = '';
  try {
    text = await res.text();
  } catch {
    return fallback;
  }
  const trimmed = text.trim();
  if (!trimmed) return fallback;
  if (contentType.includes('text/html') || /^<!doctype html/i.test(trimmed) || /<html[\s>]/i.test(trimmed)) {
    return fallback;
  }
  return trimmed.slice(0, 500);
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
    if (status === 'error') schedulePersist(() => get().course);
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

  setBlockSrc: (blockId, src) => {
    const course = get().course;
    if (!course) return;
    set({
      course: {
        ...course,
        sections: course.sections.map((section) => ({
          ...section,
          blocks: section.blocks.map((block) =>
            block.id === blockId && block.type === 'illustration'
              ? { ...block, src, pending: false }
              : block,
          ),
        })),
      },
    });
    schedulePersist(() => get().course);
  },

  setTitle: (title) => {
    const course = get().course;
    if (!course) return;
    const trimmed = title.trim();
    if (!trimmed || trimmed === course.title) return;
    set({ course: { ...course, title: trimmed } });
    schedulePersist(() => get().course);
  },

  addFollowUpSection: (afterSectionId, prompt) => {
    const course = get().course;
    const trimmed = prompt.trim();
    if (!course || !trimmed) return null;
    const afterIndex = course.sections.findIndex((section) => section.id === afterSectionId);
    if (afterIndex < 0) return null;
    const sectionId = `follow_${nanoid(8)}`;
    const nextSection: CourseSection = {
      id: sectionId,
      order: afterIndex + 2,
      title: trimmed.replace(/[?.!]+$/, '').slice(0, 80),
      description: `A focused follow-up lesson prompted by: ${trimmed}`,
      blocks: [],
      goDeeperPrompts: [],
      status: 'pending',
    };
    const sections = [...course.sections];
    sections.splice(afterIndex + 1, 0, nextSection);
    set({
      course: {
        ...course,
        sections: sections.map((section, index) => ({ ...section, order: index + 1 })),
      },
    });
    schedulePersist(() => get().course);
    void get().generateSection(sectionId);
    return sectionId;
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

  regenerateSection: async (sectionId) => {
    // Reset blocks + status so generateSection's "already ready" short-circuit
    // (load-bearing for prefetch + IntersectionObserver) doesn't no-op us.
    const course = get().course;
    if (!course) return;
    set({
      course: updateSection(course, sectionId, (s) => ({
        ...s,
        blocks: [],
        status: 'pending',
        error: undefined,
      })),
    });
    await get().generateSection(sectionId);
  },

  generateSection: async (sectionId) => {
    const course = get().course;
    if (!course) return;
    const section = course.sections.find((s) => s.id === sectionId);
    if (!section) return;
    // Skip if already generating or ready — dedupes races between the
    // IntersectionObserver and the prefetch effect.
    if (section.status === 'generating' || section.status === 'ready' || section.status === 'error') return;

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
          generationPreferences: course.generationPreferences,
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
        const err = await readFailureMessage(res, 'Generation failed');
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
          const err = await readFailureMessage(res, 'Generation failed');
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
      diagram: '/api/generate/course-diagram',
    };

    try {
      const res = await fetch(endpointMap[kind], {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId: course.id }),
      });

      if (!res.ok) {
        const err = await readFailureMessage(res, 'Generation failed');
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
      } else if (kind === 'diagram') {
        get().applyArtifact({
          diagram: {
            status: 'ready',
            title: data.title as string,
            mermaid: data.mermaid as string,
            explanation: data.explanation as string,
          },
        });
      }
    } catch (error) {
      get().applyArtifact({ [kind]: { status: 'error', error: error instanceof Error ? error.message : String(error) } });
    }
  },
}));

export const useCourseStore = createSelectors(useCourseStoreBase);
