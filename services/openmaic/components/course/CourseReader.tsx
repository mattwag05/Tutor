'use client';

import { useEffect, useRef, useState } from 'react';
import { useCourseStore } from '@/lib/course/store';
import type { CourseBlock, CourseSection } from '@/lib/types/course';
import { CourseTOCDrawer } from './CourseTOCDrawer';
import { AdvanceBar } from './AdvanceBar';
import { GoDeeperStrip } from './GoDeeperStrip';
import { ProseBlockView } from './blocks/ProseBlock';
import { HeadingBlockView } from './blocks/HeadingBlock';
import { MathBlockView } from './blocks/MathBlock';
import { PullQuoteBlockView } from './blocks/PullQuoteBlock';
import { IllustrationBlockView } from './blocks/IllustrationBlock';
import { FillBlankQuizBlockView } from './blocks/FillBlankQuizBlock';
import { MultipleChoiceQuizBlockView } from './blocks/MultipleChoiceQuizBlock';

interface Props {
  courseId: string;
}

/**
 * The scrollable article-reader view of a Course.
 *
 * Responsibilities:
 * - Load the course document via the store on mount
 * - Render one section at a time (lazy-hydrates subsequent sections as the
 *   user scrolls toward them via IntersectionObserver)
 * - Host the TOC drawer, AdvanceBar, and GoDeeperStrip
 */
export function CourseReader({ courseId }: Props) {
  const {
    course,
    sectionState,
    activeSectionIndex,
    hydrating,
    loadCourse,
    generateSection,
    setActiveSectionIndex,
    markSectionComplete,
  } = useCourseStore();

  const [tocOpen, setTocOpen] = useState(false);
  const sectionRefs = useRef<Array<HTMLElement | null>>([]);

  // Load the course on mount
  useEffect(() => {
    void loadCourse(courseId);
  }, [courseId, loadCourse]);

  // Kick off generation for the active section + next section
  useEffect(() => {
    if (!course) return;
    const current = course.sections[activeSectionIndex];
    const next = course.sections[activeSectionIndex + 1];
    if (current && sectionState[current.id]?.status !== 'ready' && sectionState[current.id]?.status !== 'generating') {
      void generateSection(current.id);
    }
    if (next && sectionState[next.id]?.status !== 'ready' && sectionState[next.id]?.status !== 'generating') {
      // Small delay to avoid racing the current section for LLM bandwidth
      const t = setTimeout(() => void generateSection(next.id), 800);
      return () => clearTimeout(t);
    }
  }, [course, activeSectionIndex, sectionState, generateSection]);

  // Track which section is in view for the AdvanceBar
  useEffect(() => {
    if (!course) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const idx = Number(entry.target.getAttribute('data-section-index'));
            if (!Number.isNaN(idx)) {
              setActiveSectionIndex(idx);
            }
          }
        }
      },
      { threshold: 0.4 },
    );
    sectionRefs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [course, setActiveSectionIndex]);

  if (hydrating && !course) {
    return <ReaderSkeleton />;
  }
  if (!course) {
    return (
      <div className="flex min-h-screen items-center justify-center text-neutral-500">
        Course not found.
      </div>
    );
  }

  const currentSection = course.sections[activeSectionIndex];
  const nextSection = course.sections[activeSectionIndex + 1];

  const scrollToSection = (sectionId: string) => {
    const idx = course.sections.findIndex((s) => s.id === sectionId);
    if (idx < 0) return;
    const el = sectionRefs.current[idx];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const onAdvance = () => {
    if (!currentSection || !nextSection) return;
    markSectionComplete(currentSection.id);
    scrollToSection(nextSection.id);
  };

  return (
    <div className="min-h-screen bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <ReaderHeader
        title={course.title}
        onOpenToc={() => setTocOpen(true)}
      />

      <CourseTOCDrawer
        course={course}
        open={tocOpen}
        activeSectionId={currentSection?.id}
        onClose={() => setTocOpen(false)}
        onSelectSection={scrollToSection}
        onOpenArtifact={(kind) => {
          // Phase 4 wiring
          alert(`${kind} generation arrives in Phase 4.`);
        }}
      />

      <main className="mx-auto max-w-2xl px-4 pb-40 pt-8 sm:px-6">
        {course.sections.map((section, i) => (
          <SectionView
            key={section.id}
            index={i}
            section={section}
            status={sectionState[section.id]?.status || 'pending'}
            citations={course.citations}
            onAsk={(prompt) => {
              // Phase 3 — stub
              alert(`"Go deeper" arrives in Phase 3:\n\n${prompt}`);
            }}
            registerRef={(el) => {
              sectionRefs.current[i] = el;
            }}
          />
        ))}
      </main>

      <AdvanceBar
        nextTitle={nextSection?.title}
        onAdvance={onAdvance}
      />
    </div>
  );
}

// ==================== Header ====================

function ReaderHeader({ title, onOpenToc }: { title: string; onOpenToc: () => void }) {
  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-neutral-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/90">
      <button
        type="button"
        onClick={onOpenToc}
        aria-label="Open table of contents"
        className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-900"
      >
        <span aria-hidden className="text-lg">
          ≡
        </span>
      </button>
      <div className="truncate font-serif text-lg text-neutral-900 dark:text-neutral-50">
        {title}
      </div>
    </header>
  );
}

// ==================== Section ====================

interface SectionViewProps {
  index: number;
  section: CourseSection;
  status: 'pending' | 'generating' | 'ready' | 'error';
  citations: Record<string, import('@/lib/types/course').CourseCitation>;
  onAsk: (prompt: string) => void;
  registerRef: (el: HTMLElement | null) => void;
}

function SectionView({ index, section, status, citations, onAsk, registerRef }: SectionViewProps) {
  return (
    <section
      ref={registerRef}
      data-section-index={index}
      className="scroll-mt-20 py-12"
    >
      <h1 className="mb-6 font-serif text-4xl text-neutral-900 dark:text-neutral-50">
        {section.title}
      </h1>

      {status === 'ready' && section.blocks.length > 0 ? (
        <>
          {section.blocks.map((block) => (
            <BlockView key={block.id} block={block} citations={citations} />
          ))}
          <GoDeeperStrip prompts={section.goDeeperPrompts} onAsk={onAsk} />
        </>
      ) : status === 'error' ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
          Failed to generate this section. Pull to retry (coming soon).
        </div>
      ) : (
        <GenerationSkeleton />
      )}
    </section>
  );
}

// ==================== Block dispatcher ====================

function BlockView({
  block,
  citations,
}: {
  block: CourseBlock;
  citations: Record<string, import('@/lib/types/course').CourseCitation>;
}) {
  switch (block.type) {
    case 'prose':
      return <ProseBlockView block={block} citations={citations} />;
    case 'heading':
      return <HeadingBlockView block={block} />;
    case 'math':
      return <MathBlockView block={block} />;
    case 'pullQuote':
      return <PullQuoteBlockView block={block} citations={citations} />;
    case 'illustration':
      return <IllustrationBlockView block={block} />;
    case 'fillBlankQuiz':
      return <FillBlankQuizBlockView block={block} />;
    case 'multipleChoiceQuiz':
      return <MultipleChoiceQuizBlockView block={block} />;
    default:
      return null;
  }
}

// ==================== Skeletons ====================

function GenerationSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-4 w-full rounded bg-neutral-200 dark:bg-neutral-800" />
      <div className="h-4 w-[90%] rounded bg-neutral-200 dark:bg-neutral-800" />
      <div className="h-4 w-[85%] rounded bg-neutral-200 dark:bg-neutral-800" />
      <div className="h-4 w-[92%] rounded bg-neutral-200 dark:bg-neutral-800" />
      <div className="h-4 w-[70%] rounded bg-neutral-200 dark:bg-neutral-800" />
    </div>
  );
}

function ReaderSkeleton() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <div className="h-10 w-2/3 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
      <div className="mt-8 space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-4 w-full animate-pulse rounded bg-neutral-200 dark:bg-neutral-800"
          />
        ))}
      </div>
    </div>
  );
}
