'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { nanoid } from 'nanoid';
import type {
  CourseSection,
  CourseOutlineStreamEvent,
  Language,
} from '@/lib/types/course';

type StreamState =
  | { phase: 'idle' }
  | { phase: 'streaming'; sections: CourseSection[]; courseTitle: string }
  | { phase: 'error'; message: string };

export default function CourseLandingPage() {
  const router = useRouter();
  const [topic, setTopic] = useState('');
  const [language, setLanguage] = useState<Language>('en-US');
  const [state, setState] = useState<StreamState>({ phase: 'idle' });
  const abortRef = useRef<AbortController | null>(null);

  const generate = async () => {
    const trimmed = topic.trim();
    if (!trimmed) return;

    setState({ phase: 'streaming', sections: [], courseTitle: trimmed });

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const res = await fetch('/api/generate/course-outline-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: trimmed, language }),
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

        // SSE framing: events separated by \n\n, each prefixed with "data: "
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
              // Finalize: create server-side course and redirect
              const id = nanoid();
              const createRes = await fetch('/api/course', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  id,
                  title: courseTitle,
                  topic: trimmed,
                  language,
                  sections: ev.sections,
                }),
              });
              if (createRes.ok) {
                router.push(`/course/${id}`);
              } else {
                setState({ phase: 'error', message: 'Failed to create course' });
              }
              return;
            } else if (ev.type === 'error') {
              setState({ phase: 'error', message: ev.error });
              return;
            }
          } catch {
            // Ignore malformed frames
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
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col px-4 py-16 sm:px-6">
      <div className="mb-10">
        <h1 className="font-serif text-4xl text-neutral-900 dark:text-neutral-50">
          Course Builder
        </h1>
        <p className="mt-2 text-neutral-600 dark:text-neutral-400">
          Enriched, personalized, scrollable courses. Type a topic — you&rsquo;ll get a clean
          article-reader with inline quizzes, glossary chips, and citations.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void generate();
        }}
        className="space-y-3"
      >
        <textarea
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Teach me about the Standard Model…"
          rows={3}
          disabled={state.phase === 'streaming'}
          className="w-full resize-none rounded-xl border border-neutral-300 bg-white px-4 py-3 text-base text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100 dark:focus:border-neutral-300"
        />

        <div className="flex items-center justify-between gap-3">
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as Language)}
            disabled={state.phase === 'streaming'}
            className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-200"
          >
            <option value="en-US">English</option>
            <option value="zh-CN">中文</option>
            <option value="ja-JP">日本語</option>
            <option value="ru-RU">Русский</option>
          </select>
          <button
            type="submit"
            disabled={state.phase === 'streaming' || !topic.trim()}
            className="rounded-lg bg-neutral-900 px-5 py-2 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:opacity-40 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white"
          >
            {state.phase === 'streaming' ? 'Generating…' : 'Generate course'}
          </button>
        </div>
      </form>

      {state.phase === 'streaming' && (
        <div className="mt-12">
          <div className="mb-4 inline-block rounded-sm bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400">
            Outline streaming
          </div>
          <ol className="space-y-3">
            {state.sections.map((section, i) => (
              <li key={section.id} className="border-l-2 border-neutral-200 pl-4 dark:border-neutral-800">
                <div className="text-[10px] font-mono text-neutral-400">
                  {String(i + 1).padStart(2, '0')}
                </div>
                <div className="font-serif text-lg text-neutral-900 dark:text-neutral-50">
                  {section.title}
                </div>
                {section.description && (
                  <div className="text-sm text-neutral-500">{section.description}</div>
                )}
              </li>
            ))}
            <li className="flex items-center gap-3 pl-4">
              <div className="h-2 w-2 animate-pulse rounded-full bg-neutral-400" />
              <div className="text-sm text-neutral-500">Generating next section…</div>
            </li>
          </ol>
        </div>
      )}

      {state.phase === 'error' && (
        <div className="mt-8 rounded-md border border-rose-200 bg-rose-50 p-4 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
          <div className="mb-1 font-semibold">Something went wrong</div>
          <div className="text-sm">{state.message}</div>
          <button
            type="button"
            onClick={() => setState({ phase: 'idle' })}
            className="mt-3 text-sm underline"
          >
            Try again
          </button>
        </div>
      )}
    </main>
  );
}
