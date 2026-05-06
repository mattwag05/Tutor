'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { useCourseStore } from '@/lib/course/store';
import type { CourseArtifacts, CourseBlock, CourseCitation, CourseSection } from '@/lib/types/course';
import { triggerBlobDownload } from '@/lib/utils/blob-download';
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
import { ArtifactModal, ArtifactGenerating, ArtifactError } from './artifacts/ArtifactModal';
import { FlashcardDeck } from './artifacts/FlashcardDeck';
import { StudyGuideView } from './artifacts/StudyGuideView';
import { FinalExamView } from './artifacts/FinalExamView';
import { PodcastPlayer } from './artifacts/PodcastPlayer';
import { CompletionPage } from '@/components/completion/CompletionPage';

interface Props {
  courseId: string;
}

export function CourseReader({ courseId }: Props) {
  const router = useRouter();
  const course = useCourseStore.use.course();
  const loadCourse = useCourseStore.use.loadCourse();
  const generateSection = useCourseStore.use.generateSection();
  const markSectionComplete = useCourseStore.use.markSectionComplete();
  const generateArtifact = useCourseStore.use.generateArtifact();

  const [tocOpen, setTocOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [activeArtifact, setActiveArtifact] = useState<
    'podcast' | 'flashcards' | 'studyGuide' | 'finalExam' | null
  >(null);
  const [projecting, setProjecting] = useState(false);
  const projectingRef = useRef(false);
  const sectionRefs = useRef<Array<HTMLElement | null>>([]);

  const openAsClassroom = useCallback(async () => {
    if (projectingRef.current) return;
    projectingRef.current = true;
    setProjecting(true);
    try {
      const res = await fetch('/api/project/course-to-classroom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId }),
      });
      if (!res.ok) throw new Error('Projection failed');
      const { id } = (await res.json()) as { id: string };
      router.push(`/classroom/${id}`);
    } catch {
      toast.error('Could not open as classroom. Try again.');
      projectingRef.current = false;
      setProjecting(false);
    }
  }, [courseId, router]);

  useEffect(() => {
    void loadCourse(courseId);
  }, [courseId, loadCourse]);

  // Hydrate the active section and pre-fetch the next one.
  // Small delay on the next-section fetch to avoid racing the current
  // section for LLM bandwidth.
  useEffect(() => {
    if (!course) return;
    const current = course.sections[activeIndex];
    const next = course.sections[activeIndex + 1];
    if (current) void generateSection(current.id);
    if (next) {
      const t = setTimeout(() => void generateSection(next.id), 800);
      return () => clearTimeout(t);
    }
  }, [course, activeIndex, generateSection]);

  // Observer only needs to rebuild when the section count changes, not on
  // every in-place section hydration (which replaces the course object).
  const sectionCount = course?.sections.length ?? 0;
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const idx = Number(entry.target.getAttribute('data-section-index'));
            if (!Number.isNaN(idx)) setActiveIndex(idx);
          }
        }
      },
      { threshold: 0.4 },
    );
    sectionRefs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [sectionCount]);

  const scrollToSection = useCallback(
    (sectionId: string) => {
      const idx = course?.sections.findIndex((s) => s.id === sectionId) ?? -1;
      if (idx < 0) return;
      sectionRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    [course],
  );

  const onAdvance = useCallback(() => {
    const current = course?.sections[activeIndex];
    const next = course?.sections[activeIndex + 1];
    if (!current || !next) return;
    markSectionComplete(current.id);
    scrollToSection(next.id);
  }, [course, activeIndex, markSectionComplete, scrollToSection]);

  const onGoDeeper = useCallback((prompt: string) => {
    toast('Go deeper coming soon', {
      description: prompt,
    });
  }, []);

  const courseArtifacts = course?.artifacts;
  const onOpenArtifact = useCallback(
    (kind: 'podcast' | 'flashcards' | 'studyGuide' | 'finalExam') => {
      setActiveArtifact(kind);
      // Podcast modal shows mode tabs and lets the user trigger generation
      // explicitly per mode — don't auto-generate on open.
      if (kind === 'podcast') return;
      const existing = courseArtifacts?.[kind];
      if (!existing || existing.status === 'error') {
        void generateArtifact(kind);
      }
    },
    [courseArtifacts, generateArtifact],
  );

  if (!course) {
    return <ReaderSkeleton />;
  }

  const currentSection = course.sections[activeIndex];
  const nextSection = course.sections[activeIndex + 1];

  return (
    <div className="min-h-screen bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <ReaderHeader
        courseId={courseId}
        title={course.title}
        projecting={projecting}
        onOpenToc={() => setTocOpen(true)}
        onOpenAsClassroom={() => void openAsClassroom()}
      />

      <CourseTOCDrawer
        course={course}
        open={tocOpen}
        activeSectionId={currentSection?.id}
        onClose={() => setTocOpen(false)}
        onSelectSection={scrollToSection}
        onOpenArtifact={onOpenArtifact}
      />

      <main className="mx-auto max-w-2xl px-4 pb-40 pt-8 sm:px-6">
        {course.sections.map((section, i) => (
          <SectionView
            key={section.id}
            index={i}
            section={section}
            citations={course.citations}
            onAsk={onGoDeeper}
            registerRef={(el) => {
              sectionRefs.current[i] = el;
            }}
          />
        ))}
        {!nextSection && (
          <CompletionPage
            title={course.title}
            type="course"
            sourceId={courseId}
            onProjection={() => void openAsClassroom()}
          />
        )}
      </main>

      <AdvanceBar nextTitle={nextSection?.title} onAdvance={onAdvance} />

      {activeArtifact && course && (
        <ArtifactOverlay
          kind={activeArtifact}
          artifacts={course.artifacts}
          onClose={() => setActiveArtifact(null)}
          onRetry={() => void generateArtifact(activeArtifact)}
        />
      )}
    </div>
  );
}

type ArtifactKind = 'podcast' | 'flashcards' | 'studyGuide' | 'finalExam';

const ARTIFACT_LABELS: Record<ArtifactKind, string> = {
  podcast: 'Podcast',
  flashcards: 'Flash Cards',
  studyGuide: 'Study Guide',
  finalExam: 'Final Exam',
};

function ArtifactOverlay({
  kind,
  artifacts,
  onClose,
  onRetry,
}: {
  kind: ArtifactKind;
  artifacts: CourseArtifacts | undefined;
  onClose: () => void;
  onRetry: () => void;
}) {
  const label = ARTIFACT_LABELS[kind];

  if (kind === 'podcast') {
    return (
      <ArtifactModal title={label} onClose={onClose}>
        <PodcastPlayer podcast={artifacts?.podcast} />
      </ArtifactModal>
    );
  }

  const a = artifacts?.[kind];

  return (
    <ArtifactModal title={label} onClose={onClose}>
      {!a || a.status === 'generating' || a.status === 'pending' ? (
        <ArtifactGenerating label={`Generating ${label.toLowerCase()}…`} />
      ) : a.status === 'error' ? (
        <ArtifactError message={a.error ?? 'Generation failed'} onRetry={onRetry} />
      ) : kind === 'flashcards' && 'cards' in a && a.cards ? (
        <FlashcardDeck cards={a.cards} />
      ) : kind === 'studyGuide' && 'content' in a && a.content ? (
        <StudyGuideView content={a.content} />
      ) : kind === 'finalExam' && 'questions' in a && a.questions ? (
        <FinalExamView questions={a.questions} />
      ) : (
        <ArtifactGenerating label={`Generating ${label.toLowerCase()}…`} />
      )}
    </ArtifactModal>
  );
}

function ReaderHeader({
  courseId,
  title,
  projecting,
  onOpenToc,
  onOpenAsClassroom,
}: {
  courseId: string;
  title: string;
  projecting: boolean;
  onOpenToc: () => void;
  onOpenAsClassroom: () => void;
}) {
  const [downloading, setDownloading] = useState(false);
  const downloadingRef = useRef(false);
  const [exportingSlides, setExportingSlides] = useState(false);
  const exportingSlidesRef = useRef(false);

  const downloadPdf = useCallback(async () => {
    if (downloadingRef.current) return;
    downloadingRef.current = true;
    setDownloading(true);
    try {
      const res = await fetch('/api/export/course-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId }),
      });
      if (!res.ok) { toast.error('PDF export failed'); return; }
      const blob = await res.blob();
      triggerBlobDownload(blob, `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60)}.pdf`);
    } catch {
      toast.error('PDF export failed');
    } finally {
      downloadingRef.current = false;
      setDownloading(false);
    }
  }, [courseId, title]);

  const exportSlides = useCallback(async () => {
    if (exportingSlidesRef.current) return;
    exportingSlidesRef.current = true;
    setExportingSlides(true);
    try {
      const res = await fetch('/api/generate/course-slides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId }),
      });
      if (!res.ok) { toast.error('Slides export failed'); return; }
      const blob = await res.blob();
      triggerBlobDownload(blob, `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60)}.pptx`);
    } catch {
      toast.error('Slides export failed');
    } finally {
      exportingSlidesRef.current = false;
      setExportingSlides(false);
    }
  }, [courseId, title]);

  // Shared button class — used inline on sm+ and inside the mobile overflow menu.
  const inlineActionClass =
    'flex shrink-0 items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-3 py-1 text-xs text-neutral-700 transition hover:bg-neutral-50 disabled:cursor-progress disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800';
  const menuItemClass =
    'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-neutral-700 transition hover:bg-neutral-100 disabled:cursor-progress disabled:opacity-60 dark:text-neutral-200 dark:hover:bg-neutral-900';

  // Close the <details> after a menu action fires so the popover dismisses.
  const closeMenu = (e: { currentTarget: HTMLElement }) => {
    e.currentTarget.closest('details')?.removeAttribute('open');
  };

  return (
    <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-neutral-200 bg-white/90 px-4 py-3 backdrop-blur sm:gap-3 dark:border-neutral-800 dark:bg-neutral-950/90">
      <button
        type="button"
        onClick={onOpenToc}
        aria-label="Open table of contents"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-900"
      >
        <span aria-hidden className="text-lg">
          ≡
        </span>
      </button>
      <div className="min-w-0 flex-1 truncate font-serif text-lg text-neutral-900 dark:text-neutral-50">
        {title}
      </div>

      {/* Inline actions — hidden on mobile, visible from sm: (640px) up. */}
      <button
        type="button"
        onClick={() => void downloadPdf()}
        disabled={downloading}
        aria-label="Download course as PDF"
        className={`hidden sm:flex ${inlineActionClass}`}
      >
        {downloading ? '…' : '⬇ PDF'}
      </button>
      <button
        type="button"
        onClick={() => void exportSlides()}
        disabled={exportingSlides}
        aria-label="Export course as PowerPoint slides"
        className={`hidden sm:flex ${inlineActionClass}`}
      >
        {exportingSlides ? '…' : '⬇ Slides'}
      </button>
      <Link
        href={`/course/${courseId}/word-quest`}
        aria-label="Open Word Quest vocabulary game"
        className={`hidden sm:flex ${inlineActionClass}`}
      >
        🎮 Word Quest
      </Link>
      <button
        type="button"
        onClick={onOpenAsClassroom}
        disabled={projecting}
        aria-label="Open as classroom slide deck"
        className={`hidden sm:flex ${inlineActionClass}`}
      >
        {projecting ? '…' : '▶ Classroom'}
      </button>

      {/* Mobile overflow menu — visible only below sm:. Native <details> avoids
          a click-outside-to-close hook; menu items dismiss the popover on click. */}
      <details className="relative shrink-0 sm:hidden">
        <summary
          aria-label="More actions"
          className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-md hover:bg-neutral-100 [&::-webkit-details-marker]:hidden dark:hover:bg-neutral-900"
        >
          <span aria-hidden className="text-lg leading-none">
            ⋮
          </span>
        </summary>
        <div className="absolute right-0 top-full mt-1 w-44 rounded-md border border-neutral-200 bg-white p-1 shadow-lg dark:border-neutral-800 dark:bg-neutral-950">
          <button
            type="button"
            onClick={(e) => {
              closeMenu(e);
              void downloadPdf();
            }}
            disabled={downloading}
            className={menuItemClass}
          >
            {downloading ? '…' : '⬇ PDF'}
          </button>
          <button
            type="button"
            onClick={(e) => {
              closeMenu(e);
              void exportSlides();
            }}
            disabled={exportingSlides}
            className={menuItemClass}
          >
            {exportingSlides ? '…' : '⬇ Slides'}
          </button>
          <Link
            href={`/course/${courseId}/word-quest`}
            onClick={closeMenu}
            className={menuItemClass}
          >
            🎮 Word Quest
          </Link>
          <button
            type="button"
            onClick={(e) => {
              closeMenu(e);
              onOpenAsClassroom();
            }}
            disabled={projecting}
            className={menuItemClass}
          >
            {projecting ? '…' : '▶ Classroom'}
          </button>
        </div>
      </details>
    </header>
  );
}

interface SectionViewProps {
  index: number;
  section: CourseSection;
  citations: Record<string, CourseCitation>;
  onAsk: (prompt: string) => void;
  registerRef: (el: HTMLElement | null) => void;
}

function SectionView({ index, section, citations, onAsk, registerRef }: SectionViewProps) {
  const status = section.status || 'pending';
  const blockList = useMemo(
    () =>
      section.blocks.map((block) => (
        <BlockView key={block.id} block={block} citations={citations} />
      )),
    [section.blocks, citations],
  );

  return (
    <section ref={registerRef} data-section-index={index} className="scroll-mt-20 py-12">
      <h1 className="mb-3 font-serif text-4xl text-neutral-900 dark:text-neutral-50">
        {section.title}
      </h1>

      {status === 'ready' && section.blocks.length > 0 ? (
        <>
          <SectionAudio section={section} />
          {blockList}
          <GoDeeperStrip prompts={section.goDeeperPrompts} onAsk={onAsk} />
        </>
      ) : status === 'error' ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
          {section.error || 'Failed to generate this section.'}
        </div>
      ) : (
        <GenerationSkeleton />
      )}
    </section>
  );
}

function SectionAudio({ section }: { section: CourseSection }) {
  const courseId = useCourseStore.use.course()?.id;
  const setSectionAudio = useCourseStore.use.setSectionAudio();
  const audioUrl = section.audio?.url;
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const onListen = useCallback(async () => {
    if (!courseId) return;
    if (audioUrl) return;
    setGenerating(true);
    setError(undefined);
    try {
      const res = await fetch('/api/generate/course-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId, sectionId: section.id }),
      });
      const data = (await res.json()) as { success?: boolean; audioUrl?: string; error?: string };
      if (!res.ok || !data.success || !data.audioUrl) {
        throw new Error(data.error || `Synthesis failed (${res.status})`);
      }
      setSectionAudio(section.id, { status: 'ready', url: data.audioUrl });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Synthesis failed';
      setError(msg);
      toast.error(msg);
    } finally {
      setGenerating(false);
    }
  }, [audioUrl, courseId, section.id, setSectionAudio]);

  if (audioUrl) {
    return (
      <audio
        controls
        preload="metadata"
        src={audioUrl}
        className="mb-6 w-full"
        aria-label={`Audio for section: ${section.title}`}
      />
    );
  }

  return (
    <div className="mb-6 flex items-center gap-3">
      <button
        type="button"
        onClick={onListen}
        disabled={generating}
        className="inline-flex items-center gap-2 rounded-full border border-neutral-300 bg-white px-4 py-1.5 text-sm text-neutral-700 transition hover:bg-neutral-50 disabled:cursor-progress disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
      >
        <span aria-hidden>▶</span>
        {generating ? 'Synthesizing…' : 'Listen'}
      </button>
      {error ? <span className="text-sm text-rose-600 dark:text-rose-400">{error}</span> : null}
    </div>
  );
}

function BlockView({
  block,
  citations,
}: {
  block: CourseBlock;
  citations: Record<string, CourseCitation>;
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
