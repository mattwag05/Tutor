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
  Paperclip,
  Plus,
  RotateCcw,
  type LucideIcon,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Mermaid } from '@/components/Mermaid';
import { recordCourseAttempt } from '@/lib/quiz/api-client';
import { useCourseStore } from '@/lib/course/store';
import { AdvanceBar } from './AdvanceBar';
import { CourseTOCDrawer } from './CourseTOCDrawer';
import { SectionProgressBar, SECTION_PROGRESS_BAR_HEIGHT } from './SectionProgressBar';
import type {
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
  label: string;
  icon: LucideIcon;
}> = [
  { value: 'lesson', label: 'Lesson', icon: BookOpen },
  { value: 'podcast', label: 'Podcast', icon: Headphones },
  { value: 'flashcards', label: 'Flash Cards', icon: Layers },
  { value: 'studyGuide', label: 'Study Guide', icon: FileText },
  { value: 'quiz', label: 'Quiz', icon: CircleHelp },
  { value: 'diagram', label: 'Diagram', icon: GitBranch },
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
      className="h-dvh overflow-y-auto bg-[#f7f4ee] text-neutral-950 dark:bg-neutral-950 dark:text-neutral-100"
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

      <main className="mx-auto max-w-2xl px-4 pb-72 pt-8 sm:px-6">
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
  return (
    <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-neutral-200 bg-[#f7f4ee]/90 px-4 py-3 backdrop-blur sm:gap-3 dark:border-neutral-800 dark:bg-neutral-950/90">
      <button
        type="button"
        onClick={onOpenToc}
        aria-label="Open table of contents"
        className="flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-md transition hover:bg-white/70 sm:h-8 sm:w-8 dark:hover:bg-neutral-900"
      >
        <Menu size={18} strokeWidth={1.8} />
      </button>
      <span className="hidden shrink-0 items-center rounded-md border border-neutral-200 bg-white/70 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-neutral-500 sm:inline-flex dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-400">
        {sectionNumber} / {sectionCount}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate font-serif text-lg text-neutral-900 dark:text-neutral-50">{title}</div>
      </div>
      <button
        type="button"
        onClick={onOpenSources}
        className="rounded-md px-2 py-2 text-xs text-neutral-700 transition hover:bg-white/70 sm:px-3 dark:text-neutral-300 dark:hover:bg-neutral-900"
      >
        {sourceCount} Sources
      </button>
      <button
        type="button"
        onClick={onNewFormat}
        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-neutral-300 bg-white/70 px-3 text-xs font-medium text-neutral-800 transition hover:bg-white"
      >
        <Plus size={14} strokeWidth={1.8} />
        New Format
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
  return (
    <div className="fixed inset-0 z-50 bg-neutral-950/25 p-4" role="presentation" onClick={onClose}>
      <div
        className="ml-auto max-h-full w-full max-w-md overflow-y-auto rounded-lg border border-neutral-200 bg-[#fbfaf7] p-5 shadow-[0_24px_80px_rgba(40,32,24,0.18)]"
        role="dialog"
        aria-modal
        aria-label="Sources"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-serif text-xl">Sources</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-neutral-100"
          >
            <X size={16} />
          </button>
        </div>
        {items.length === 0 ? (
          <p className="text-sm text-neutral-500">Sources will appear as lessons finish generating.</p>
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
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/25 p-4">
      <div className="w-full max-w-xl rounded-lg border border-neutral-200 bg-[#fbfaf7] p-5 shadow-[0_24px_80px_rgba(40,32,24,0.18)]">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-serif text-xl">Add format</h2>
            <p className="mt-1 text-sm text-neutral-500">
              Choose a new course format and optionally add a prompt.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-neutral-100"
          >
            <X size={16} />
          </button>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white/70">
          <textarea
            value={prompt}
            onChange={(e) => onPromptChange(e.target.value)}
            placeholder="Focus the next format on..."
            rows={2}
            className="min-h-16 w-full resize-none rounded-t-lg bg-transparent px-4 py-3 outline-none placeholder:text-neutral-400"
          />
          <div className="flex items-center justify-between border-t border-neutral-100 px-3 py-2">
            <button
              type="button"
              aria-label="Attach supporting files"
              className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100"
            >
              <Paperclip size={16} strokeWidth={1.8} />
            </button>
            <span className="font-mono text-[10px] uppercase tracking-wider text-neutral-400">
              Format prompt
            </span>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {FORMAT_OPTIONS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => onSelect(item.value)}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-neutral-200 bg-white/70 px-3 text-xs text-neutral-700 transition hover:border-neutral-300 hover:bg-white"
              >
                <Icon size={14} strokeWidth={1.8} />
                {item.label}
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
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="fixed left-0 right-0 z-20 border-t border-neutral-200 bg-[#f7f4ee]/95 px-3 py-2 backdrop-blur sm:px-4 sm:py-4"
      style={{ bottom: `${bottomOffset}px` }}
    >
      <div className="mx-auto flex max-w-2xl items-center gap-2 rounded-lg border border-neutral-200 bg-white/95 px-3 py-2 shadow-[0_12px_32px_rgba(85,67,43,0.10)] sm:rounded-xl sm:px-4 sm:py-3">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Ask a question..."
          className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-neutral-400 sm:text-sm"
        />
        <button
          type="submit"
          aria-label="Send question"
          disabled={!value.trim()}
          className="flex h-9 w-9 items-center justify-center rounded-md bg-neutral-900 text-white transition active:translate-y-px disabled:opacity-30 sm:rounded-lg"
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
  const label = kind === 'finalExam' ? 'Quiz' : artifactLabel(kind);

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
        <ArtifactGenerating label={`Generating ${label.toLowerCase()}...`} />
      ) : artifact.status === 'error' ? (
        <ArtifactError message={artifact.error ?? 'Generation failed'} onRetry={onRetry} />
      ) : kind === 'flashcards' && 'cards' in artifact && artifact.cards ? (
        <FlashcardDeck cards={artifact.cards} />
      ) : kind === 'studyGuide' && 'content' in artifact && artifact.content ? (
        <StudyGuideView content={artifact.content} />
      ) : kind === 'finalExam' && 'questions' in artifact && artifact.questions ? (
        <FinalExamView questions={artifact.questions} />
      ) : kind === 'diagram' && 'mermaid' in artifact && artifact.mermaid ? (
        <DiagramView
          title={artifact.title || 'Course Diagram'}
          mermaid={artifact.mermaid}
          explanation={artifact.explanation}
        />
      ) : (
        <ArtifactGenerating label={`Generating ${label.toLowerCase()}...`} />
      )}
    </ArtifactModal>
  );
}

function artifactLabel(kind: ArtifactKind) {
  if (kind === 'flashcards') return 'Flash Cards';
  if (kind === 'studyGuide') return 'Study Guide';
  if (kind === 'finalExam') return 'Quiz';
  if (kind === 'diagram') return 'Diagram';
  return 'Podcast';
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
    <section data-section-index={index} className="py-8">
      <h1 className="mb-5 font-serif text-4xl text-neutral-950 sm:text-5xl">{section.title}</h1>

      {status === 'ready' && section.blocks.length > 0 ? (
        <>
          <SectionAudio section={section} />
          {blockList}
          <GoDeeperStrip prompts={section.goDeeperPrompts} onAsk={onAsk} />
          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={() => void regenerateSection(section.id)}
              aria-label={`Regenerate section: ${section.title}`}
              className="inline-flex items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-xs text-neutral-500 transition hover:border-neutral-400 hover:bg-neutral-50 hover:text-neutral-700"
            >
              <RotateCcw size={12} strokeWidth={1.8} />
              Regenerate section
            </button>
          </div>
        </>
      ) : status === 'error' ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-rose-800">
          <div className="mb-2">{section.error || 'Failed to generate this section.'}</div>
          <button
            type="button"
            onClick={() => void regenerateSection(section.id)}
            className="inline-flex items-center gap-1.5 rounded-md border border-rose-300 bg-white px-2.5 py-1 text-xs text-rose-700 transition hover:bg-rose-50"
          >
            <RotateCcw size={12} strokeWidth={1.8} />
            Try again
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
        className="inline-flex items-center gap-2 rounded-md border border-neutral-300 bg-white px-4 py-1.5 text-sm text-neutral-700 transition hover:bg-neutral-50 disabled:cursor-progress disabled:opacity-60"
      >
        <Headphones size={15} strokeWidth={1.8} />
        {generating ? 'Synthesizing...' : 'Listen'}
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
      <div className="h-4 w-full rounded bg-neutral-200" />
      <div className="h-4 w-[90%] rounded bg-neutral-200" />
      <div className="h-4 w-[85%] rounded bg-neutral-200" />
      <div className="h-4 w-[92%] rounded bg-neutral-200" />
      <div className="h-4 w-[70%] rounded bg-neutral-200" />
    </div>
  );
}

function ReaderSkeleton() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <div className="h-10 w-2/3 animate-pulse rounded bg-neutral-200" />
      <div className="mt-8 space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-4 w-full animate-pulse rounded bg-neutral-200" />
        ))}
      </div>
    </div>
  );
}
