'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUp,
  BookOpen,
  CircleHelp,
  FileText,
  GitBranch,
  Headphones,
  Layers,
  Menu,
  Plus,
  RotateCcw,
  type LucideIcon,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Mermaid } from '@/components/Mermaid';
import { recordCourseAttempt } from '@/lib/quiz/api-client';
import { useCourseStore } from '@/lib/course/store';
import { AdvanceBar } from './AdvanceBar';
import { CourseTOCDrawer } from './CourseTOCDrawer';
import { SectionProgressBar, SECTION_PROGRESS_BAR_HEIGHT } from './SectionProgressBar';
import type {
  Course,
  CourseArtifacts,
  CourseBlock,
  CourseCitation,
  CourseFormat,
  CourseSection,
} from '@/lib/types/course';
import { cn } from '@/lib/utils/cn';
import { ArtifactError, ArtifactGenerating, ArtifactModal } from './artifacts/ArtifactModal';
import { FinalExamView } from './artifacts/FinalExamView';
import { FlashcardDeck } from './artifacts/FlashcardDeck';
import { PodcastPlayer } from './artifacts/PodcastPlayer';
import { StudyGuideView } from './artifacts/StudyGuideView';
import { FillBlankQuizBlockView } from './blocks/FillBlankQuizBlock';
import { HeadingBlockView } from './blocks/HeadingBlock';
import { IllustrationBlockView } from './blocks/IllustrationBlock';
import { MathBlockView } from './blocks/MathBlock';
import { MultipleChoiceQuizBlockView } from './blocks/MultipleChoiceQuizBlock';
import { ProseBlockView } from './blocks/ProseBlock';
import { PullQuoteBlockView } from './blocks/PullQuoteBlock';
import { GoDeeperStrip } from './GoDeeperStrip';

interface Props {
  courseId: string;
}

type ArtifactKind = 'podcast' | 'flashcards' | 'studyGuide' | 'finalExam' | 'diagram';

const QUESTION_COMPOSER_HEIGHT = 84;

const FORMAT_TO_ARTIFACT: Partial<Record<CourseFormat, ArtifactKind>> = {
  podcast: 'podcast',
  flashcards: 'flashcards',
  studyGuide: 'studyGuide',
  quiz: 'finalExam',
  diagram: 'diagram',
};

const FORMAT_OPTIONS: Array<{
  value: CourseFormat;
  labelKey: string;
  descriptionKey: string;
  icon: LucideIcon;
}> = [
  {
    value: 'lesson',
    labelKey: 'course.lesson',
    descriptionKey: 'course.formatLessonDescription',
    icon: BookOpen,
  },
  {
    value: 'podcast',
    labelKey: 'course.podcast',
    descriptionKey: 'course.formatPodcastDescription',
    icon: Headphones,
  },
  {
    value: 'flashcards',
    labelKey: 'course.flashcards',
    descriptionKey: 'course.formatFlashcardsDescription',
    icon: Layers,
  },
  {
    value: 'studyGuide',
    labelKey: 'course.studyGuide',
    descriptionKey: 'course.formatStudyGuideDescription',
    icon: FileText,
  },
  {
    value: 'quiz',
    labelKey: 'course.quiz',
    descriptionKey: 'course.formatQuizDescription',
    icon: CircleHelp,
  },
  {
    value: 'diagram',
    labelKey: 'course.diagram',
    descriptionKey: 'course.formatDiagramDescription',
    icon: GitBranch,
  },
];

export function CourseReader({ courseId }: Props) {
  const course = useCourseStore.use.course();
  const loadCourse = useCourseStore.use.loadCourse();
  const generateSection = useCourseStore.use.generateSection();
  const markSectionComplete = useCourseStore.use.markSectionComplete();
  const generateArtifact = useCourseStore.use.generateArtifact();
  const addFollowUpSection = useCourseStore.use.addFollowUpSection();

  const [activeIndex, setActiveIndex] = useState(0);
  const [activeArtifact, setActiveArtifact] = useState<ArtifactKind | null>(null);
  const [tocOpen, setTocOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [formatDialogOpen, setFormatDialogOpen] = useState(false);
  const [formatPrompt, setFormatPrompt] = useState('');
  const [question, setQuestion] = useState('');
  const [sectionProgress, setSectionProgress] = useState(0);
  const scrollRootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void loadCourse(courseId);
  }, [courseId, loadCourse]);

  useEffect(() => {
    if (!course) return;
    const current = course.sections[activeIndex];
    const next = course.sections[activeIndex + 1];
    if (current) void generateSection(current.id);
    if (next) {
      const timer = window.setTimeout(() => void generateSection(next.id), 800);
      return () => window.clearTimeout(timer);
    }
  }, [activeIndex, course, generateSection]);

  const currentSection = course?.sections[activeIndex];
  const totalSections = course?.sections.length ?? 0;
  const sourceCount = course ? Object.keys(course.citations || {}).length : 0;
  const nextSection = course?.sections[activeIndex + 1];

  const goToIndex = useCallback(
    (idx: number) => {
      if (!course || idx < 0 || idx >= course.sections.length) return;
      setActiveIndex(idx);
      setSectionProgress(0);
      scrollRootRef.current?.scrollTo({ top: 0, behavior: 'instant' });
    },
    [course],
  );

  const addLessonFromPrompt = useCallback(
    (prompt: string) => {
      const base = course?.sections[activeIndex];
      if (!base) return;
      const id = addFollowUpSection(base.id, prompt);
      if (!id) return;
      const nextIndex = activeIndex + 1;
      setActiveIndex(nextIndex);
      setSectionProgress(0);
      setFormatDialogOpen(false);
      setFormatPrompt('');
      setQuestion('');
      scrollRootRef.current?.scrollTo({ top: 0, behavior: 'instant' });
    },
    [activeIndex, addFollowUpSection, course],
  );

  const goToSectionId = useCallback(
    (sectionId: string) => {
      const idx = course?.sections.findIndex((section) => section.id === sectionId) ?? -1;
      if (idx < 0) return;
      goToIndex(idx);
    },
    [course, goToIndex],
  );

  const onAdvance = useCallback(() => {
    const current = course?.sections[activeIndex];
    if (!current) return;
    markSectionComplete(current.id);
    goToIndex(activeIndex + 1);
  }, [activeIndex, course, goToIndex, markSectionComplete]);

  const onPrevious = useCallback(() => {
    goToIndex(activeIndex - 1);
  }, [activeIndex, goToIndex]);

  const openArtifact = useCallback(
    (kind: ArtifactKind) => {
      setActiveArtifact(kind);
      if (kind === 'podcast') return;
      const existing = course?.artifacts?.[kind];
      if (!existing || existing.status === 'error') void generateArtifact(kind);
    },
    [course?.artifacts, generateArtifact],
  );

  const handleAddFormat = useCallback(
    (format: CourseFormat) => {
      if (format === 'lesson') {
        addLessonFromPrompt(formatPrompt || 'Go deeper on this topic');
        return;
      }
      const artifact = FORMAT_TO_ARTIFACT[format];
      if (!artifact) return;
      setFormatDialogOpen(false);
      setFormatPrompt('');
      openArtifact(artifact);
    },
    [addLessonFromPrompt, formatPrompt, openArtifact],
  );

  const handleQuestionSubmit = useCallback(() => {
    const trimmed = question.trim();
    if (!trimmed) return;
    addLessonFromPrompt(trimmed);
  }, [addLessonFromPrompt, question]);

  if (!course) return <ReaderSkeleton />;

  return (
    <div
      ref={scrollRootRef}
      className="h-dvh overflow-y-auto bg-[#f8f6f1] text-[#171512] dark:bg-neutral-950 dark:text-neutral-100"
    >
      <ReaderHeader
        title={course.title}
        sectionNumber={activeIndex + 1}
        sectionCount={totalSections}
        sourceCount={sourceCount}
        onOpenToc={() => setTocOpen(true)}
        onOpenSources={() => setSourcesOpen(true)}
        onNewFormat={() => setFormatDialogOpen(true)}
      />

      <CourseTOCDrawer
        course={course}
        open={tocOpen}
        activeSectionId={currentSection?.id}
        onClose={() => setTocOpen(false)}
        onSelectSection={goToSectionId}
        onOpenArtifact={openArtifact}
      />

      <main className="mx-auto grid max-w-[1440px] grid-cols-1 px-4 pb-64 pt-6 sm:px-6 lg:grid-cols-[260px_minmax(0,760px)_300px] lg:gap-0 lg:px-8 lg:pt-0 xl:px-10">
        <CourseWorkspaceToc
          course={course}
          activeSectionId={currentSection?.id}
          onSelectSection={goToSectionId}
        />

        <div className="mx-auto w-full max-w-[760px] lg:px-10">
          {currentSection ? (
            <SectionCard
              key={currentSection.id}
              index={activeIndex}
              section={currentSection}
              citations={course.citations}
              courseId={courseId}
              onAsk={addLessonFromPrompt}
            />
          ) : null}
        </div>

        <SourcesRail
          citations={course.citations}
          sourceCount={sourceCount}
          onOpenSources={() => setSourcesOpen(true)}
          onAsk={addLessonFromPrompt}
        />
      </main>

      {sectionProgress >= 70 ? (
        <AdvanceBar
          nextTitle={nextSection?.title}
          onAdvance={onAdvance}
          onPrevious={onPrevious}
          hasPrevious={activeIndex > 0}
          bottomOffset={SECTION_PROGRESS_BAR_HEIGHT + QUESTION_COMPOSER_HEIGHT}
        />
      ) : null}

      <QuestionComposer
        value={question}
        onChange={setQuestion}
        onSubmit={handleQuestionSubmit}
        bottomOffset={SECTION_PROGRESS_BAR_HEIGHT}
      />

      {currentSection ? (
        <SectionProgressBar
          scrollRef={scrollRootRef}
          sectionNumber={activeIndex + 1}
          sectionCount={totalSections}
          sectionTitle={currentSection.title}
          resetKey={currentSection.id}
          onProgressChange={setSectionProgress}
        />
      ) : null}

      {sourcesOpen && (
        <SourcesDialog citations={course.citations} onClose={() => setSourcesOpen(false)} />
      )}

      {formatDialogOpen && (
        <AddFormatDialog
          prompt={formatPrompt}
          onPromptChange={setFormatPrompt}
          onClose={() => setFormatDialogOpen(false)}
          onSelect={handleAddFormat}
        />
      )}

      {activeArtifact && (
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

function CourseWorkspaceToc({
  course,
  activeSectionId,
  onSelectSection,
}: {
  course: Course;
  activeSectionId: string | undefined;
  onSelectSection: (sectionId: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <aside className="sticky top-[57px] hidden h-[calc(100dvh-57px)] overflow-y-auto border-r border-[#ded8cc] bg-[#f3f0e8] px-3 py-6 lg:block">
      <div className="mb-4 flex items-center justify-between px-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#746d61]">
          {t('course.contents')}
        </h2>
        <span className="text-[11px] text-[#9c9488]">{course.sections.length}</span>
      </div>
      <nav className="space-y-1" aria-label={t('course.contents')}>
        {course.sections.map((section, index) => {
          const active = section.id === activeSectionId;
          return (
            <button
              key={section.id}
              type="button"
              aria-label={t('course.openSectionAria', {
                index: index + 1,
                title: section.title,
              })}
              onClick={() => onSelectSection(section.id)}
              className={cn(
                'group flex w-full items-start gap-2 rounded-md px-3 py-2 text-left text-sm transition',
                active
                  ? 'bg-[#e6dfd2] text-[#171512]'
                  : 'text-[#4f4a42] hover:bg-white/60 hover:text-[#171512]',
              )}
            >
              <span className="mt-0.5 w-5 shrink-0 text-[11px] text-[#81786b]">{index + 1}.</span>
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 font-medium leading-5">{section.title}</span>
                {section.status === 'ready' ? (
                  <span className="mt-1 block text-[11px] text-[#3f6f46]">{t('Ready')}</span>
                ) : null}
              </span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

function SourcesRail({
  citations,
  sourceCount,
  onOpenSources,
  onAsk,
}: {
  citations: Record<string, CourseCitation>;
  sourceCount: number;
  onOpenSources: () => void;
  onAsk: (prompt: string) => void;
}) {
  const { t } = useTranslation();
  const items = Object.values(citations).slice(0, 5);
  const prompts = [
    t('course.promptExplainCurrentSection'),
    t('course.promptWhyMatters'),
    t('course.promptCommonMisconceptions'),
  ];

  return (
    <aside className="sticky top-[57px] hidden h-[calc(100dvh-57px)] overflow-y-auto border-l border-[#ded8cc] bg-[#f8f6f1] px-4 py-6 lg:block">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[#171512]">{t('course.sources')}</h2>
        <span className="rounded bg-white px-1.5 py-0.5 text-[11px] text-[#746d61]">{sourceCount}</span>
      </div>
      <div className="rounded-lg border border-[#d8d1c3] bg-white/75 p-4">
        <div className="text-xs font-semibold text-[#171512]">{t('course.sourcesSummary')}</div>
        <p className="mt-2 text-xs leading-5 text-[#5f574d]">
          {sourceCount > 0
            ? t('course.sourcesSummaryWithCount', { count: sourceCount })
            : t('course.sourcesEmpty')}
        </p>
        <button
          type="button"
          onClick={onOpenSources}
          className="mt-4 h-9 w-full rounded-md border border-[#d8d1c3] bg-[#f8f6f1] text-xs font-medium text-[#2d2923] transition hover:bg-white"
        >
          {t('course.viewAllSources')}
        </button>
      </div>

      {items.length > 0 ? (
        <ol className="mt-4 space-y-2">
          {items.map((citation, index) => (
            <li
              key={citation.id}
              className="rounded-md border border-[#e0d8cb] bg-white/65 p-3 text-xs text-[#4f4a42]"
            >
              <div className="flex gap-2">
                <span className="text-[#9c9488]">{index + 1}</span>
                <span className="min-w-0">
                  <span className="line-clamp-2 font-medium text-[#171512]">
                    {citation.source || t('course.source')}
                  </span>
                  <span className="mt-1 block truncate text-[#746d61]">
                    {sourceHostLabel(citation.url) || t('course.source')}
                  </span>
                </span>
              </div>
            </li>
          ))}
        </ol>
      ) : null}

      <div className="mt-6 border-t border-[#ded8cc] pt-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#171512]">{t('course.askTutor')}</h2>
        </div>
        <div className="space-y-2">
          {prompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => onAsk(prompt)}
              className="w-full rounded-md border border-[#e0d8cb] bg-white/65 px-3 py-2 text-left text-xs leading-5 text-[#4f4a42] transition hover:border-[#bcae98] hover:bg-white hover:text-[#171512]"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}

function sourceHostLabel(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function ReaderHeader({
  title,
  sectionNumber,
  sectionCount,
  sourceCount,
  onOpenToc,
  onOpenSources,
  onNewFormat,
}: {
  title: string;
  sectionNumber: number;
  sectionCount: number;
  sourceCount: number;
  onOpenToc: () => void;
  onOpenSources: () => void;
  onNewFormat: () => void;
}) {
  const { t } = useTranslation();
  return (
    <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-[#ded8cc] bg-[#f8f6f1]/92 px-4 py-3 backdrop-blur sm:gap-3 dark:border-neutral-800 dark:bg-neutral-950/90">
      <button
        type="button"
        onClick={onOpenToc}
        aria-label={t('course.openTableOfContents')}
        className="flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-md text-[#4f4a42] transition hover:bg-white/70 sm:h-8 sm:w-8 dark:hover:bg-neutral-900"
      >
        <Menu size={18} strokeWidth={1.8} />
      </button>
      <span className="hidden shrink-0 items-center rounded-md border border-[#d8d1c3] bg-white/70 px-2 py-0.5 text-[11px] text-[#746d61] sm:inline-flex dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-400">
        {sectionNumber} / {sectionCount}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-[#171512] sm:text-base dark:text-neutral-50">
          {title}
        </div>
      </div>
      <button
        type="button"
        onClick={onOpenSources}
        className="rounded-md px-2 py-2 text-xs text-[#4f4a42] transition hover:bg-white/70 sm:px-3 dark:text-neutral-300 dark:hover:bg-neutral-900"
      >
        {t('course.sourcesCount', { count: sourceCount })}
      </button>
      <button
        type="button"
        onClick={onNewFormat}
        aria-label={t('course.newFormat')}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center gap-1.5 rounded-md border border-[#d8d1c3] bg-white/70 text-xs font-medium text-[#2d2923] transition hover:bg-white sm:w-auto sm:px-3"
      >
        <Plus size={14} strokeWidth={1.8} />
        <span className="hidden sm:inline">{t('course.newFormat')}</span>
      </button>
    </header>
  );
}

function SourcesDialog({
  citations,
  onClose,
}: {
  citations: Record<string, CourseCitation>;
  onClose: () => void;
}) {
  const items = Object.values(citations);
  const { t } = useTranslation();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-neutral-950/25 p-4" role="presentation" onClick={onClose}>
      <div
        className="ml-auto max-h-full w-full max-w-md overflow-y-auto rounded-lg border border-neutral-200 bg-[#fbfaf7] p-5 shadow-[0_24px_80px_rgba(40,32,24,0.18)]"
        role="dialog"
        aria-modal
        aria-labelledby="course-sources-title"
        aria-describedby="course-sources-description"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 id="course-sources-title" className="font-serif text-xl">
              {t('course.sources')}
            </h2>
            <p id="course-sources-description" className="mt-1 text-sm leading-6 text-neutral-500">
              {items.length > 0
                ? t('course.sourcesSummaryWithCount', { count: items.length })
                : t('course.sourcesEmpty')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-neutral-100"
          >
            <X size={16} />
          </button>
        </div>
        {items.length === 0 ? (
          <p className="text-sm text-neutral-500">{t('course.sourcesEmpty')}</p>
        ) : (
          <ul className="space-y-3">
            {items.map((citation) => (
              <li key={citation.id} className="rounded-md border border-neutral-200 bg-white/70 p-3 text-sm">
                <div className="font-medium text-neutral-900">{citation.text}</div>
                {citation.url ? (
                  <a
                    href={citation.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 block truncate text-xs text-neutral-500 underline-offset-4 hover:underline"
                  >
                    {citation.source || citation.url}
                  </a>
                ) : citation.source ? (
                  <div className="mt-1 text-xs text-neutral-500">{citation.source}</div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function AddFormatDialog({
  prompt,
  onPromptChange,
  onClose,
  onSelect,
}: {
  prompt: string;
  onPromptChange: (value: string) => void;
  onClose: () => void;
  onSelect: (format: CourseFormat) => void;
}) {
  const { t } = useTranslation();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/25 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-lg border border-[#d8d1c3] bg-[#fbfaf7] p-5 shadow-[0_24px_80px_rgba(40,32,24,0.18)]"
        role="dialog"
        aria-modal
        aria-labelledby="course-add-format-title"
        aria-describedby="course-add-format-description"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 id="course-add-format-title" className="font-serif text-xl text-[#171512]">
              {t('course.addFormat')}
            </h2>
            <p id="course-add-format-description" className="mt-1 text-sm leading-6 text-[#5f574d]">
              {t('course.addFormatDescription')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#746d61] hover:bg-[#f3f0e8] hover:text-[#171512]"
          >
            <X size={16} />
          </button>
        </div>
        <div className="rounded-lg border border-[#d8d1c3] bg-white/75">
          <textarea
            value={prompt}
            onChange={(e) => onPromptChange(e.target.value)}
            placeholder={t('course.formatPromptPlaceholder')}
            rows={2}
            autoFocus
            className="min-h-16 w-full resize-none rounded-t-lg bg-transparent px-4 py-3 text-sm leading-6 text-[#171512] outline-none placeholder:text-[#9c9488]"
          />
          <div className="flex items-center justify-end border-t border-[#e6e0d6] px-3 py-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#81786b]">
              {t('course.formatPrompt')}
            </span>
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {FORMAT_OPTIONS.map((item) => {
            const Icon = item.icon;
            const label = t(item.labelKey);
            return (
              <button
                key={item.value}
                type="button"
                aria-label={label}
                onClick={() => onSelect(item.value)}
                className="group flex min-h-20 items-start gap-3 rounded-lg border border-[#d8d1c3] bg-white/70 p-3 text-left transition hover:border-[#bcae98] hover:bg-white"
              >
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#f3f0e8] text-[#4f4a42] transition group-hover:bg-[#171512] group-hover:text-white">
                  <Icon size={15} strokeWidth={1.8} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-[#171512]">{label}</span>
                  <span
                    className="mt-1 block text-xs leading-5 text-[#746d61]"
                    aria-hidden="true"
                  >
                    {t(item.descriptionKey)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function QuestionComposer({
  value,
  onChange,
  onSubmit,
  bottomOffset,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  bottomOffset: number;
}) {
  const { t } = useTranslation();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="fixed left-0 right-0 z-20 border-t border-[#ded8cc] bg-[#f8f6f1]/95 px-3 py-2 backdrop-blur sm:px-4 sm:py-4"
      style={{ bottom: `${bottomOffset}px` }}
    >
      <div className="mx-auto flex max-w-[720px] items-center gap-2 rounded-lg border border-[#d8d1c3] bg-white/95 px-3 py-2 shadow-[0_12px_32px_rgba(85,67,43,0.10)] sm:px-4 sm:py-3">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={t('course.askQuestionInput')}
          placeholder={t('course.askQuestionPlaceholder')}
          className="min-w-0 flex-1 bg-transparent text-base text-[#171512] outline-none placeholder:text-[#9c9488] sm:text-sm"
        />
        <button
          type="submit"
          aria-label={t('course.sendQuestion')}
          disabled={!value.trim()}
          className="flex h-9 w-9 items-center justify-center rounded-md bg-[#171512] text-white transition active:translate-y-px disabled:opacity-30"
        >
          <ArrowUp size={17} strokeWidth={1.8} />
        </button>
      </div>
    </form>
  );
}

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
  const { t } = useTranslation();
  const label = kind === 'finalExam' ? t('course.quiz') : artifactLabel(kind, t);

  if (kind === 'podcast') {
    return (
      <ArtifactModal title={label} onClose={onClose}>
        <PodcastPlayer podcast={artifacts?.podcast} />
      </ArtifactModal>
    );
  }

  const artifact = artifacts?.[kind];

  return (
    <ArtifactModal title={label} onClose={onClose}>
      {!artifact || artifact.status === 'generating' || artifact.status === 'pending' ? (
        <ArtifactGenerating label={t('course.generatingArtifact', { artifact: label.toLowerCase() })} />
      ) : artifact.status === 'error' ? (
        <ArtifactError message={artifact.error ?? t('course.generationFailed')} onRetry={onRetry} />
      ) : kind === 'flashcards' && 'cards' in artifact && artifact.cards ? (
        <FlashcardDeck cards={artifact.cards} />
      ) : kind === 'studyGuide' && 'content' in artifact && artifact.content ? (
        <StudyGuideView content={artifact.content} />
      ) : kind === 'finalExam' && 'questions' in artifact && artifact.questions ? (
        <FinalExamView questions={artifact.questions} />
      ) : kind === 'diagram' && 'mermaid' in artifact && artifact.mermaid ? (
        <DiagramView
          title={artifact.title || t('course.courseDiagram')}
          mermaid={artifact.mermaid}
          explanation={artifact.explanation}
        />
      ) : (
        <ArtifactGenerating label={t('course.generatingArtifact', { artifact: label.toLowerCase() })} />
      )}
    </ArtifactModal>
  );
}

function artifactLabel(kind: ArtifactKind, t: (key: string, options?: Record<string, unknown>) => string) {
  if (kind === 'flashcards') return t('course.flashcards');
  if (kind === 'studyGuide') return t('course.studyGuide');
  if (kind === 'finalExam') return t('course.quiz');
  if (kind === 'diagram') return t('course.diagram');
  return t('course.podcast');
}

function DiagramView({
  title,
  mermaid,
  explanation,
}: {
  title: string;
  mermaid: string;
  explanation?: string;
}) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h2 className="font-serif text-2xl text-neutral-950">{title}</h2>
      {explanation ? <p className="mt-2 text-sm leading-6 text-neutral-600">{explanation}</p> : null}
      <div className="mt-6 rounded-md border border-neutral-200 bg-[#fbfaf7] p-4">
        <Mermaid chart={mermaid} />
      </div>
    </div>
  );
}

interface SectionCardProps {
  index: number;
  section: CourseSection;
  citations: Record<string, CourseCitation>;
  courseId: string;
  onAsk: (prompt: string) => void;
}

function SectionCard({ index, section, citations, courseId, onAsk }: SectionCardProps) {
  const status = section.status || 'pending';
  const regenerateSection = useCourseStore.use.regenerateSection();
  const { t } = useTranslation();
  const blockList = useMemo(
    () =>
      section.blocks.map((block) => (
        <BlockView
          key={block.id}
          block={block}
          citations={citations}
          courseId={courseId}
          sectionId={section.id}
        />
      )),
    [citations, courseId, section.blocks, section.id],
  );

  return (
    <section data-section-index={index} className="py-8 lg:py-12">
      <div className="mb-4 flex items-center justify-between gap-4">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#5f574d]">
          <BookOpen size={14} strokeWidth={1.8} />
          {t('course.lesson')}
        </span>
        <span className="text-[11px] text-[#9c9488]">{String(index + 1).padStart(2, '0')}</span>
      </div>
      <h1 className="mb-6 max-w-[16ch] font-serif text-[2.35rem] leading-[1.02] text-[#171512] sm:max-w-none sm:text-5xl lg:text-[3.35rem]">
        {section.title}
      </h1>

      {status === 'ready' && section.blocks.length > 0 ? (
        <>
          <SectionAudio section={section} />
          <div className="rounded-lg border border-[#ded8cc] bg-white px-5 py-6 shadow-[0_18px_55px_rgba(85,67,43,0.06)] sm:px-7 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
            {blockList}
          </div>
          <GoDeeperStrip prompts={section.goDeeperPrompts} onAsk={onAsk} />
          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={() => void regenerateSection(section.id)}
              aria-label={t('course.regenerateSectionAria', { title: section.title })}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#d8d1c3] bg-white px-2.5 py-1 text-xs text-[#746d61] transition hover:border-[#bcae98] hover:bg-[#f8f6f1] hover:text-[#2d2923]"
            >
              <RotateCcw size={12} strokeWidth={1.8} />
              {t('course.regenerateSection')}
            </button>
          </div>
        </>
      ) : status === 'error' ? (
        <div
          className="rounded-md border border-rose-200 bg-rose-50 p-4 text-rose-900"
          role="alert"
        >
          <div className="font-mono text-[10px] uppercase tracking-wider text-rose-500">
            {t('course.sectionDidNotGenerate')}
          </div>
          <div className="mt-2 text-sm font-medium">{t('course.sectionCouldNotBuild')}</div>
          <div className="mt-1 break-words text-sm text-rose-700">
            {section.error || t('course.generationFailed')}
          </div>
          <button
            type="button"
            onClick={() => void regenerateSection(section.id)}
            className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-rose-300 bg-white px-2.5 py-1 text-xs text-rose-700 transition hover:bg-rose-50"
          >
            <RotateCcw size={12} strokeWidth={1.8} />
            {t('course.tryAgain')}
          </button>
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
  const { t } = useTranslation();

  const onListen = useCallback(async () => {
    if (!courseId || audioUrl) return;
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
        throw new Error(data.error || t('course.synthesisFailedWithStatus', { status: res.status }));
      }
      setSectionAudio(section.id, { status: 'ready', url: data.audioUrl });
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('course.synthesisFailed');
      setError(msg);
      toast.error(msg);
    } finally {
      setGenerating(false);
    }
  }, [audioUrl, courseId, section.id, setSectionAudio, t]);

  if (audioUrl) {
    return (
      <audio
        controls
        preload="metadata"
        src={audioUrl}
        className="mb-6 w-full"
        aria-label={t('course.sectionAudioAria', { title: section.title })}
      />
    );
  }

  return (
    <div className="mb-6 flex items-center gap-3">
      <button
        type="button"
        onClick={onListen}
        disabled={generating}
        className="inline-flex items-center gap-2 rounded-md border border-[#d8d1c3] bg-white px-4 py-1.5 text-sm text-[#4f4a42] transition hover:border-[#bcae98] hover:bg-[#f8f6f1] hover:text-[#171512] disabled:cursor-progress disabled:opacity-60"
      >
        <Headphones size={15} strokeWidth={1.8} />
        {generating ? t('course.synthesizing') : t('course.listen')}
      </button>
      {error ? <span className="text-sm text-rose-600">{error}</span> : null}
    </div>
  );
}

function BlockView({
  block,
  citations,
  courseId,
  sectionId,
}: {
  block: CourseBlock;
  citations: Record<string, CourseCitation>;
  courseId: string;
  sectionId: string;
}) {
  const onQuizAttempt = useCallback(
    (args: { isCorrect: boolean; userAnswer: string }) => {
      void recordCourseAttempt({
        courseId,
        sectionId,
        blockId: block.id,
        isCorrect: args.isCorrect,
        userAnswer: args.userAnswer,
      });
    },
    [block.id, courseId, sectionId],
  );
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
      return <FillBlankQuizBlockView block={block} onAttempt={onQuizAttempt} />;
    case 'multipleChoiceQuiz':
      return <MultipleChoiceQuizBlockView block={block} onAttempt={onQuizAttempt} />;
    default:
      return null;
  }
}

function GenerationSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-4 w-full rounded bg-[#ded8cc]" />
      <div className="h-4 w-[90%] rounded bg-[#ded8cc]" />
      <div className="h-4 w-[85%] rounded bg-[#ded8cc]" />
      <div className="h-4 w-[92%] rounded bg-[#ded8cc]" />
      <div className="h-4 w-[70%] rounded bg-[#ded8cc]" />
    </div>
  );
}

function ReaderSkeleton() {
  return (
    <div className="min-h-dvh bg-[#f8f6f1] text-[#171512]">
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
        <div className="h-10 w-2/3 animate-pulse rounded bg-[#ded8cc]" />
        <div className="mt-8 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-4 w-full animate-pulse rounded bg-[#ded8cc]" />
          ))}
        </div>
      </div>
    </div>
  );
}
