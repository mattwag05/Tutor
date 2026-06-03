'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { nanoid } from 'nanoid';
import {
  ArrowUp,
  BookOpen,
  CircleHelp,
  FileText,
  GitBranch,
  Headphones,
  Layers,
  Paperclip,
  SlidersHorizontal,
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
  label: string;
  icon: LucideIcon;
};

const FORMAT_DEFS: FormatDef[] = [
  { value: 'lesson', label: 'Lesson', icon: BookOpen },
  { value: 'podcast', label: 'Podcast', icon: Headphones },
  { value: 'flashcards', label: 'Flash Cards', icon: Layers },
  { value: 'studyGuide', label: 'Study Guide', icon: FileText },
  { value: 'quiz', label: 'Quiz', icon: CircleHelp },
  { value: 'diagram', label: 'Diagram', icon: GitBranch },
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
                setState({ phase: 'error', message: 'Failed to create course' });
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
    [complexity, disabled, focus, format, language, length, router],
  );

  const historyItems =
    courses.length > 0
      ? courses
      : SUGGESTIONS.map((title, i) => ({ id: `s-${i}`, title, topic: title } as CourseSummary));

  return (
    <div className="min-h-dvh overflow-y-auto bg-[#f7f4ee] text-neutral-950">
      <header className="sticky top-0 z-30 border-b border-neutral-200/80 bg-[#f7f4ee]/90 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <Link
            href="/"
            className="flex h-9 w-9 items-center justify-center rounded-md border border-neutral-300 bg-white/80 text-sm font-semibold shadow-[0_1px_0_rgba(120,92,60,0.08)]"
            aria-label="Tutor home"
          >
            T
          </Link>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-neutral-900">Tutor</div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-neutral-500">
              Course builder
            </div>
          </div>
          <button className="hidden rounded-md border border-neutral-300 bg-white/70 px-3 py-2 text-xs text-neutral-700 transition hover:bg-white sm:block">
            Log in
          </button>
          <button className="rounded-md bg-neutral-900 px-3 py-2 text-xs font-medium text-white transition hover:bg-neutral-800">
            Sign up
          </button>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)] lg:py-12">
        <section className="lg:pt-8">
          <div className="mb-4 font-mono text-[10px] uppercase tracking-wider text-neutral-500">
            Open-source course studio
          </div>
          <h1 className="max-w-[11ch] text-balance text-4xl font-semibold leading-[0.98] tracking-[-0.02em] text-neutral-950 sm:text-6xl">
            Build a course
          </h1>
          <p className="mt-5 max-w-md text-[15px] leading-7 text-neutral-700">
            Start with a question, file, or topic. Tutor turns it into a readable course with checks,
            sources, and follow-up lessons.
          </p>

          <div className="mt-10 rounded-lg border border-neutral-200 bg-white/55 p-3 shadow-[0_18px_55px_rgba(85,67,43,0.08)]">
            <div className="mb-2 px-1 font-mono text-[10px] uppercase tracking-wider text-neutral-500">
              {courses.length > 0 ? 'Recent courses' : 'Starting points'}
            </div>
            <div className="grid gap-2">
              {historyItems.slice(0, 5).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() =>
                    item.id.startsWith('s-') ? setTopic(item.topic) : router.push(`/course/${item.id}`)
                  }
                  className="group rounded-md border border-transparent px-3 py-2 text-left transition hover:border-neutral-200 hover:bg-white"
                >
                  <div className="line-clamp-1 text-sm font-medium text-neutral-800 group-hover:text-neutral-950">
                    {item.title || item.topic}
                  </div>
                  <div className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-neutral-400">
                    {item.id.startsWith('s-') ? 'Prompt' : 'Course'}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void runGeneration(topic);
            }}
            aria-busy={disabled}
            className="rounded-xl border border-neutral-200 bg-white/85 p-4 shadow-[0_24px_80px_rgba(85,67,43,0.10)] sm:p-5"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-wider text-neutral-500">
                  New course
                </div>
                <div className="mt-1 text-sm text-neutral-600">Start with a question, file, or topic.</div>
              </div>
              <button
                type="submit"
                aria-label="Generate course"
                disabled={disabled || !topic.trim()}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-neutral-900 text-white transition hover:bg-neutral-800 active:translate-y-px disabled:opacity-30"
              >
                <ArrowUp size={17} strokeWidth={1.8} />
              </button>
            </div>

            <div className="rounded-lg border border-neutral-200 bg-[#fbfaf7]">
              <textarea
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                disabled={disabled}
                rows={5}
                placeholder="Ask Tutor to build a course about..."
                className="min-h-36 w-full resize-none rounded-t-lg bg-transparent px-4 py-4 text-base leading-7 text-neutral-950 outline-none placeholder:text-neutral-400 disabled:opacity-60"
              />
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-200 px-3 py-3">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    aria-label="Attach supporting files"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex h-9 w-9 items-center justify-center rounded-md text-neutral-500 transition hover:bg-white hover:text-neutral-900"
                  >
                    <Paperclip size={16} strokeWidth={1.8} />
                  </button>
                  <button
                    type="button"
                    aria-label={settingsOpen ? 'Close configuration options' : 'Open configuration options'}
                    aria-expanded={settingsOpen}
                    onClick={() => setSettingsOpen((v) => !v)}
                    className={cn(
                      'flex h-9 w-9 items-center justify-center rounded-md transition',
                      settingsOpen
                        ? 'bg-neutral-900 text-white'
                        : 'text-neutral-500 hover:bg-white hover:text-neutral-900',
                    )}
                  >
                    <SlidersHorizontal size={16} strokeWidth={1.8} />
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="sr-only"
                    onChange={(e) =>
                      setFiles(Array.from(e.currentTarget.files || []).map((file) => file.name))
                    }
                  />
                </div>
                {files.length > 0 && (
                  <div className="min-w-0 truncate rounded-md bg-white px-2 py-1 text-xs text-neutral-500">
                    {files.join(', ')}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-5">
              <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-neutral-500">
                Course format
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {FORMAT_DEFS.map((item) => (
                  <FormatButton
                    key={item.value}
                    item={item}
                    selected={format === item.value}
                    disabled={disabled}
                    onClick={() => setFormat(item.value)}
                  />
                ))}
              </div>
            </div>

            {settingsOpen && (
              <div className="mt-5 rounded-lg border border-neutral-200 bg-[#fbfaf7] p-4">
                <SegmentedRow
                  label="Primary focus"
                  value={focus}
                  options={[
                    ['learning', 'Learning'],
                    ['reviewing', 'Reviewing'],
                  ]}
                  onChange={(value) => setFocus(value as CourseGenerationPreferences['focus'])}
                />
                <SegmentedRow
                  label="Length"
                  value={length}
                  options={[
                    ['short', 'Short'],
                    ['medium', 'Medium'],
                    ['long', 'Long'],
                  ]}
                  onChange={(value) => setLength(value as CourseGenerationPreferences['length'])}
                />
                <SegmentedRow
                  label="Complexity"
                  value={complexity}
                  options={[
                    ['beginner', 'Beginner'],
                    ['intermediate', 'Intermediate'],
                    ['advanced', 'Advanced'],
                  ]}
                  onChange={(value) =>
                    setComplexity(value as CourseGenerationPreferences['complexity'])
                  }
                />
              </div>
            )}
          </form>

          {state.phase === 'streaming' && (
            <div className="mt-6 rounded-lg border border-neutral-200 bg-white/70 p-5">
              <div className="mb-4 font-mono text-[10px] uppercase tracking-wider text-neutral-500">
                Building {state.courseTitle}
              </div>
              <ol className="space-y-3">
                {state.sections.map((section) => (
                  <li key={section.id} className="rounded-md bg-[#fbfaf7] px-3 py-2">
                    <div className="font-medium text-neutral-900">{section.title}</div>
                    {section.description && (
                      <div className="mt-1 text-sm text-neutral-500">{section.description}</div>
                    )}
                  </li>
                ))}
                <li className="text-sm text-neutral-500">Thinking...</li>
              </ol>
            </div>
          )}

          {state.phase === 'error' && (
            <div className="mt-6 rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
              {state.message}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function FormatButton({
  item,
  selected,
  disabled,
  onClick,
}: {
  item: FormatDef;
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
        'inline-flex min-h-10 items-center gap-2 rounded-md border px-3 text-left text-xs transition active:translate-y-px disabled:opacity-50',
        selected
          ? 'border-neutral-900 bg-neutral-900 text-white shadow-[0_10px_24px_rgba(40,32,24,0.16)]'
          : 'border-neutral-200 bg-white/70 text-neutral-700 hover:border-neutral-300 hover:bg-white',
      )}
    >
      <Icon size={14} strokeWidth={1.8} />
      {item.label}
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
      <div className="mb-2 text-xs font-medium text-neutral-500">{label}</div>
      <div className="flex rounded-md border border-neutral-200 bg-neutral-50 p-1">
        {options.map(([optionValue, optionLabel]) => (
          <button
            key={optionValue}
            type="button"
            onClick={() => onChange(optionValue)}
            className={cn(
              'flex-1 rounded px-2 py-1.5 text-xs transition',
              value === optionValue
                ? 'bg-white text-neutral-950 shadow-sm'
                : 'text-neutral-500 hover:text-neutral-900',
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
