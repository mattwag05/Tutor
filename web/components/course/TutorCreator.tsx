'use client';

import { Suspense, useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { nanoid } from 'nanoid';
import { useTranslation } from 'react-i18next';
import {
  ArrowUp,
  BookOpen,
  CircleHelp,
  FileText,
  GitBranch,
  Headphones,
  Layers,
  Paperclip,
  Settings,
  SlidersHorizontal,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { CourseSummary } from '@/lib/server/course-storage';
import type {
  CourseFormat,
  CourseGenerationPreferences,
  CourseOutlineStreamEvent,
  CoursePersonalization,
  CourseSection,
  Language,
} from '@/lib/types/course';
import { cn } from '@/lib/utils/cn';

type StreamState =
  | { phase: 'idle' }
  | { phase: 'streaming'; sections: CourseSection[]; courseTitle: string }
  | { phase: 'error'; message: string };

type FormatDef = {
  value: CourseFormat;
  labelKey: string;
  icon: LucideIcon;
};

const FORMAT_DEFS: FormatDef[] = [
  { value: 'lesson', labelKey: 'course.lesson', icon: BookOpen },
  { value: 'podcast', labelKey: 'course.podcast', icon: Headphones },
  { value: 'flashcards', labelKey: 'course.flashcards', icon: Layers },
  { value: 'studyGuide', labelKey: 'course.studyGuide', icon: FileText },
  { value: 'quiz', labelKey: 'course.quiz', icon: CircleHelp },
  { value: 'diagram', labelKey: 'course.diagram', icon: GitBranch },
];

const SUGGESTIONS = [
  'The science of sleep',
  'Dark matter vs. dark energy',
  'What is the Fibonacci sequence?',
  'Principles of Microeconomics',
  'The physics of sailing',
];

function mapPreferencesToPersonalization(
  prefs: Pick<CourseGenerationPreferences, 'complexity' | 'focus'>,
): CoursePersonalization {
  return {
    depth:
      prefs.complexity === 'beginner'
        ? 'introductory'
        : prefs.complexity === 'advanced'
          ? 'advanced'
          : 'intermediate',
    audience: 'student',
    style: prefs.focus === 'reviewing' ? 'conversational' : 'narrative',
  };
}

function TutorCreatorInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useTranslation();
  const [topic, setTopic] = useState(() => searchParams.get('topic') ?? '');
  const [language] = useState<Language>('en-US');
  const [focus, setFocus] = useState<CourseGenerationPreferences['focus']>('learning');
  const [length, setLength] = useState<CourseGenerationPreferences['length']>('medium');
  const [complexity, setComplexity] =
    useState<CourseGenerationPreferences['complexity']>('intermediate');
  const [format, setFormat] = useState<CourseFormat>('lesson');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [state, setState] = useState<StreamState>({ phase: 'idle' });
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [files, setFiles] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetch('/api/course')
      .then((r) => r.json())
      .then((data: CourseSummary[]) => setCourses(data.slice(0, 6)))
      .catch(() => setCourses([]));
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  const disabled = state.phase === 'streaming';

  const handleFileInputChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setFiles(Array.from(event.currentTarget.files || []).map((file) => file.name));
  }, []);

  const removeFileAt = useCallback((indexToRemove: number) => {
    setFiles((current) => current.filter((_, index) => index !== indexToRemove));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const runGeneration = useCallback(
    async (nextTopic: string) => {
      const trimmed = nextTopic.trim();
      if (!trimmed || disabled) return;

      const generationPreferences: CourseGenerationPreferences = {
        focus,
        length,
        complexity,
        initialFormat: format,
        selectedFormats: [format],
      };
      const personalization = mapPreferencesToPersonalization({ focus, complexity });

      setState({ phase: 'streaming', sections: [], courseTitle: trimmed });
      abortRef.current?.abort();
      const abort = new AbortController();
      abortRef.current = abort;

      try {
        const res = await fetch('/api/generate/course-outline-stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topic: trimmed,
            language,
            personalization,
            generationPreferences,
          }),
          signal: abort.signal,
        });

        if (!res.ok || !res.body) {
          setState({ phase: 'error', message: `Request failed: ${res.status}` });
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        const sections: CourseSection[] = [];
        let courseTitle = trimmed;

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const frames = buffer.split(/\n\n/);
          buffer = frames.pop() || '';
          for (const frame of frames) {
            const line = frame.split('\n').find((l) => l.startsWith('data:'));
            if (!line) continue;
            const payload = line.slice(5).trim();
            if (!payload) continue;
            try {
              const ev = JSON.parse(payload) as CourseOutlineStreamEvent;
              if (ev.type === 'section') {
                sections.push(ev.data);
                setState({ phase: 'streaming', sections: [...sections], courseTitle });
              } else if (ev.type === 'done') {
                courseTitle = ev.title || courseTitle;
                const id = nanoid();
                const createRes = await fetch('/api/course', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    id,
                    title: courseTitle,
                    topic: trimmed,
                    language,
                    personalization,
                    generationPreferences,
                    sections: ev.sections,
                  }),
                });
                if (createRes.ok) {
                  router.push(`/course/${id}`);
                  return;
                }
                setState({ phase: 'error', message: t('course.creatorFailedCreate') });
                return;
              } else if (ev.type === 'error') {
                setState({ phase: 'error', message: ev.error });
                return;
              }
            } catch {
              // Ignore malformed SSE frames.
            }
          }
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        setState({
          phase: 'error',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [complexity, disabled, focus, format, language, length, router, t],
  );

  const historyItems =
    courses.length > 0
      ? courses
      : SUGGESTIONS.map((title, i) => ({ id: `s-${i}`, title, topic: title } as CourseSummary));
  const selectedFormatLabel = t(
    FORMAT_DEFS.find((item) => item.value === format)?.labelKey ?? 'course.lesson',
  );
  const focusLabel = focus === 'reviewing' ? t('course.reviewing') : t('course.learning');
  const lengthLabel =
    length === 'short'
      ? t('course.short')
      : length === 'long'
        ? t('course.long')
        : t('course.medium');
  const complexityLabel =
    complexity === 'beginner'
      ? t('course.beginner')
      : complexity === 'advanced'
        ? t('course.advanced')
        : t('course.intermediate');
  const setupRows = [
    [t('course.planFormat'), selectedFormatLabel],
    [t('course.planLength'), lengthLabel],
    [t('course.planComplexity'), complexityLabel],
    [t('course.planFocus'), focusLabel],
    [
      t('course.planSources'),
      files.length > 0
        ? t('course.filesAttachedCount', { count: files.length })
        : t('course.noSourcesAttached'),
    ],
  ];

  return (
    <div className="h-dvh overflow-y-auto bg-[#f8f6f1] text-[#171512]">
      <div className="mx-auto grid min-h-dvh max-w-[1440px] lg:grid-cols-[180px_minmax(0,1fr)]">
        <aside className="hidden border-r border-[#ded8cc] bg-[#f3f0e8] px-3 py-4 lg:flex lg:flex-col">
          <Link
            href="/"
            className="mb-7 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-semibold text-[#171512]"
            aria-label={t('course.creatorHome')}
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#171512] text-xs text-white">
              T
            </span>
            {t('course.brandName')}
          </Link>
          <nav className="space-y-1 text-sm text-[#4f4a42]" aria-label={t('course.creatorWorkspaceNav')}>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md bg-[#e8e2d6] px-3 py-2 text-left font-medium text-[#171512]"
            >
              <BookOpen size={15} strokeWidth={1.8} />
              {t('course.newCourse')}
            </button>
            <Link
              href="/course"
              className="flex items-center gap-2 rounded-md px-3 py-2 transition hover:bg-white/55 hover:text-[#171512]"
            >
              <Layers size={15} strokeWidth={1.8} />
              {t('course.yourCourses')}
            </Link>
            <Link
              href="/settings"
              className="flex items-center gap-2 rounded-md px-3 py-2 transition hover:bg-white/55 hover:text-[#171512]"
            >
              <Settings size={15} strokeWidth={1.8} />
              {t('Settings')}
            </Link>
          </nav>
          <div className="mt-8 border-t border-[#ded8cc] pt-5">
            <div className="px-3 text-[11px] font-medium text-[#746d61]">
              {courses.length > 0 ? t('course.recentCourses') : t('course.startingPoints')}
            </div>
            <div className="mt-3 space-y-1">
              {historyItems.slice(0, 5).map((item) => {
                const title = item.title || item.topic;
                const isSuggestion = item.id.startsWith('s-');
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-label={
                      isSuggestion
                        ? t('course.useStartingPromptAria', { title })
                        : t('course.openCourseAria', { title })
                    }
                    onClick={() =>
                      isSuggestion ? setTopic(item.topic) : router.push(`/course/${item.id}`)
                    }
                    className="group w-full rounded-md px-3 py-2 text-left transition hover:bg-white/60"
                  >
                    <div className="line-clamp-2 text-xs font-medium leading-5 text-[#2d2923]">
                      {title}
                    </div>
                    <div className="mt-0.5 text-[10px] text-[#81786b]">
                      {isSuggestion ? t('course.prompt') : t('Course')}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="mt-auto rounded-md border border-[#ded8cc] bg-white/55 p-3 text-xs text-[#5f574d]">
            <div className="font-medium text-[#171512]">{t('course.openSource')}</div>
            <div className="mt-1 leading-5">{t('course.creatorOpenSourceHint')}</div>
          </div>
        </aside>

        <div>
          <header className="sticky top-0 z-30 border-b border-[#ded8cc] bg-[#f8f6f1]/92 px-4 py-3 backdrop-blur sm:px-6 lg:hidden">
            <div className="flex items-center gap-3">
              <Link
                href="/"
                className="flex h-9 w-9 items-center justify-center rounded-md bg-[#171512] text-sm font-semibold text-white"
                aria-label={t('course.creatorHome')}
              >
                T
              </Link>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-[#171512]">
                  {t('course.brandName')}
                </div>
                <div className="text-[11px] text-[#746d61]">{t('course.creatorSubtitle')}</div>
              </div>
              <Link
                href="/settings"
                className="flex h-9 w-9 items-center justify-center rounded-md border border-[#d8d1c3] bg-white/75 text-[#4f4a42] transition hover:bg-white"
                aria-label={t('Settings')}
                title={t('Settings')}
              >
                <Settings className="h-4 w-4" />
              </Link>
            </div>
          </header>

          <main className="grid gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,640px)_minmax(280px,360px)] lg:gap-12 lg:px-10 lg:py-10 xl:px-16">
            <section className="max-w-[640px]">
              <div className="mb-9 flex items-start justify-between gap-4">
                <div>
                  <h1 className="text-4xl font-semibold leading-tight text-[#171512] sm:text-5xl">
                    {t('course.creatorTitle')}
                  </h1>
                  <p className="mt-4 max-w-lg text-[15px] leading-7 text-[#5f574d]">
                    {t('course.creatorDescription')}
                  </p>
                </div>
                <button
                  type="button"
                  aria-controls="course-advanced-settings"
                  aria-expanded={settingsOpen}
                  onClick={() => setSettingsOpen((v) => !v)}
                  className="hidden h-9 shrink-0 items-center gap-2 rounded-md border border-[#d8d1c3] bg-white/75 px-3 text-xs font-medium text-[#3b362f] transition hover:bg-white sm:inline-flex"
                >
                  <SlidersHorizontal size={14} strokeWidth={1.8} />
                  {t('course.setupOptions')}
                </button>
              </div>

              <form
            onSubmit={(e) => {
              e.preventDefault();
              void runGeneration(topic);
            }}
            aria-busy={disabled}
            className="space-y-8"
          >
            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                  <div className="text-sm font-semibold text-[#171512]">
                    1. {t('course.creatorQuestionLabel')}
                  </div>
                  <div className="mt-1 text-xs text-[#746d61]">{t('course.creatorShortHint')}</div>
                </div>
              <button
                type="submit"
                aria-label={t('course.generateCourse')}
                disabled={disabled || !topic.trim()}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#171512] text-white transition hover:bg-[#2c2924] active:translate-y-px disabled:opacity-30"
              >
                <ArrowUp size={17} strokeWidth={1.8} />
              </button>
            </div>

              <div className="rounded-lg border border-[#d8d1c3] bg-white">
              <textarea
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                disabled={disabled}
                rows={5}
                placeholder={t('course.creatorPlaceholder')}
                  className="min-h-44 w-full resize-none rounded-t-lg bg-transparent px-4 py-4 text-base leading-7 text-[#171512] outline-none placeholder:text-[#9c9488] disabled:opacity-60"
              />
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#e6e0d6] px-3 py-3">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                      className="flex h-9 items-center gap-2 rounded-md px-2.5 text-xs text-[#5f574d] transition hover:bg-[#f3f0e8] hover:text-[#171512]"
                  >
                    <Paperclip size={16} strokeWidth={1.8} />
                      {t('course.attachShort')}
                  </button>
                  <button
                    type="button"
                    aria-controls="course-advanced-settings"
                    aria-expanded={settingsOpen}
                    onClick={() => setSettingsOpen((v) => !v)}
                    className={cn(
                        'flex h-9 items-center gap-2 rounded-md px-2.5 text-xs transition',
                      settingsOpen
                          ? 'bg-[#171512] text-white'
                          : 'text-[#5f574d] hover:bg-[#f3f0e8] hover:text-[#171512]',
                    )}
                  >
                    <SlidersHorizontal size={16} strokeWidth={1.8} />
                      {t('course.advancedSettings')}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="sr-only"
                    onChange={handleFileInputChange}
                  />
                </div>
                {files.length > 0 && (
                  <div className="rounded-md bg-[#f3f0e8] px-2 py-1 text-xs font-medium text-[#5f574d]">
                    {t('course.filesAttachedCount', { count: files.length })}
                  </div>
                )}
              </div>
            </div>
            </div>

            {settingsOpen && (
                <div
                  id="course-advanced-settings"
                  className="rounded-lg border border-[#d8d1c3] bg-white p-4"
                >
                <SegmentedRow
                  label={t('course.primaryFocus')}
                  value={focus}
                  options={[
                    ['learning', t('course.learning')],
                    ['reviewing', t('course.reviewing')],
                  ]}
                  onChange={(value) => setFocus(value as CourseGenerationPreferences['focus'])}
                />
                <SegmentedRow
                  label={t('course.length')}
                  value={length}
                  options={[
                    ['short', t('course.short')],
                    ['medium', t('course.medium')],
                    ['long', t('course.long')],
                  ]}
                  onChange={(value) => setLength(value as CourseGenerationPreferences['length'])}
                />
                <SegmentedRow
                  label={t('course.complexity')}
                  value={complexity}
                  options={[
                    ['beginner', t('course.beginner')],
                    ['intermediate', t('course.intermediate')],
                    ['advanced', t('course.advanced')],
                  ]}
                  onChange={(value) =>
                    setComplexity(value as CourseGenerationPreferences['complexity'])
                  }
                />
              </div>
            )}

              <div>
                <div className="mb-3 flex items-end justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-[#171512]">
                      2. {t('course.chooseFormats')}
                    </div>
                    <div className="mt-1 text-xs text-[#746d61]">{t('course.chooseFormatsHint')}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {FORMAT_DEFS.map((item) => (
                    <FormatButton
                      key={item.value}
                      item={item}
                      label={t(item.labelKey)}
                      selected={format === item.value}
                      disabled={disabled}
                      onClick={() => setFormat(item.value)}
                    />
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-3 text-sm font-semibold text-[#171512]">
                  3. {t('course.addSources')}
                </div>
                <div
                  className={cn(
                    'overflow-hidden rounded-lg border transition',
                    files.length > 0
                      ? 'border-[#b8c9b2] bg-[#f4f8f1]'
                      : 'border-dashed border-[#cfc5b4] bg-white/70',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex min-h-32 w-full flex-col items-center justify-center px-4 py-6 text-center transition hover:bg-white/70"
                  >
                    <Paperclip size={18} strokeWidth={1.8} className="text-[#3f6f46]" />
                    <span className="mt-3 text-sm font-medium text-[#171512]">
                      {files.length > 0
                        ? t('course.sourcesAttached', { count: files.length })
                        : t('course.dropSources')}
                    </span>
                    <span className="mt-1 max-w-sm text-xs leading-5 text-[#746d61]">
                      {files.length > 0
                        ? t('course.sourcesAttachedHint')
                        : t('course.dropSourcesHint')}
                    </span>
                  </button>
                  {files.length > 0 && (
                    <ul
                      className="space-y-2 border-t border-[#dbe8d6] bg-white/70 p-3"
                      aria-label={t('course.attachedSources')}
                    >
                      {files.map((file, index) => (
                        <li
                          key={`${file}-${index}`}
                          className="flex min-h-10 items-center gap-3 rounded-md border border-[#dbe8d6] bg-white px-3 py-2 text-left"
                        >
                          <FileText
                            size={15}
                            strokeWidth={1.8}
                            className="shrink-0 text-[#3f6f46]"
                          />
                          <span className="min-w-0 flex-1 truncate text-xs font-medium text-[#2d2923]">
                            {file}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeFileAt(index)}
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#746d61] transition hover:bg-[#f3f0e8] hover:text-[#171512]"
                            aria-label={t('course.removeSourceFile', { name: file })}
                            title={t('course.removeSourceFile', { name: file })}
                          >
                            <X size={14} strokeWidth={1.8} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={disabled || !topic.trim()}
                  className="inline-flex h-12 items-center gap-2 rounded-md bg-[#171512] px-5 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(40,32,24,0.18)] transition hover:bg-[#2c2924] active:translate-y-px disabled:opacity-30"
                >
                  {t('course.generateCourse')}
                  <ArrowUp size={16} strokeWidth={1.8} />
                </button>
              </div>
          </form>

          {state.phase === 'streaming' && (
                <div className="mt-6 rounded-lg border border-[#d8d1c3] bg-white/80 p-5">
                  <div className="mb-4 text-xs font-medium text-[#5f574d]">
                {t('course.building', { title: state.courseTitle })}
              </div>
              <ol className="space-y-3">
                {state.sections.map((section) => (
                      <li key={section.id} className="rounded-md bg-[#f8f6f1] px-3 py-2">
                        <div className="font-medium text-[#171512]">{section.title}</div>
                    {section.description && (
                          <div className="mt-1 text-sm text-[#746d61]">{section.description}</div>
                    )}
                  </li>
                ))}
                    <li className="text-sm text-[#746d61]">{t('Thinking...')}</li>
              </ol>
            </div>
          )}

          {state.phase === 'error' && (
            <div className="mt-6 rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
              {state.message}
            </div>
          )}
            </section>

            <aside className="space-y-4 lg:pt-[108px]">
              <div className="rounded-lg border border-[#d8d1c3] bg-white/75 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#171512] text-white">
                    <FileText size={16} strokeWidth={1.8} />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-[#171512]">
                      {t('course.coursePlan')}
                    </div>
                    <p className="mt-1 text-xs leading-5 text-[#746d61]">
                      {t('course.coursePlanHint')}
                    </p>
                  </div>
                </div>
                <dl className="mt-4 divide-y divide-[#e6e0d6]">
                  {setupRows.map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between gap-4 py-2.5">
                      <dt className="text-xs text-[#746d61]">{label}</dt>
                      <dd className="max-w-[12rem] truncate text-right text-xs font-medium text-[#2d2923]">
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-4 border-t border-[#e6e0d6] pt-4">
                  <div className="text-xs font-semibold text-[#2f5736]">
                    {t('course.creatorReaderPromise')}
                  </div>
                  <p className="mt-1 text-xs leading-5 text-[#5a6f5d]">
                    {t('course.creatorReaderPromiseBody')}
                  </p>
                </div>
              </div>
            </aside>
          </main>
        </div>
      </div>
    </div>
  );
}

function FormatButton({
  item,
  label,
  selected,
  disabled,
  onClick,
}: {
  item: FormatDef;
  label: string;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'inline-flex min-h-14 items-center gap-2 rounded-md border px-3 text-left text-xs transition active:translate-y-px disabled:opacity-50',
        selected
          ? 'border-[#171512] bg-[#171512] text-white shadow-[0_10px_24px_rgba(40,32,24,0.16)]'
          : 'border-[#d8d1c3] bg-white/75 text-[#4f4a42] hover:border-[#bcb09d] hover:bg-white',
      )}
    >
      <Icon size={14} strokeWidth={1.8} />
      {label}
    </button>
  );
}

function SegmentedRow({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="mb-4 last:mb-0">
      <div className="mb-2 text-xs font-medium text-[#5f574d]">{label}</div>
      <div className="flex rounded-md border border-[#d8d1c3] bg-[#f8f6f1] p-1">
        {options.map(([optionValue, optionLabel]) => (
          <button
            key={optionValue}
            type="button"
            onClick={() => onChange(optionValue)}
            className={cn(
              'flex-1 rounded px-2 py-1.5 text-xs transition',
              value === optionValue
                ? 'bg-white text-[#171512] shadow-sm'
                : 'text-[#746d61] hover:text-[#171512]',
            )}
          >
            {optionLabel}
          </button>
        ))}
      </div>
    </div>
  );
}

export function TutorCreator() {
  return (
    <Suspense>
      <TutorCreatorInner />
    </Suspense>
  );
}

export { FORMAT_DEFS };
