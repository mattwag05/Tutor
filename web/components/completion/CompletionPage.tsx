'use client';

import { useEffect, useState } from 'react';

interface Props {
  title: string;
  type: 'course' | 'classroom';
  sourceId: string;
  /** Called when the projection button is clicked (already handled upstream). */
  onProjection?: () => void;
}

interface AttemptStats {
  total: number;
  correct: number;
}

export function CompletionPage({ title, type, sourceId, onProjection }: Props) {
  const [stats, setStats] = useState<AttemptStats | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const url = new URL('/api/v1/quiz/attempts', window.location.origin);
    url.searchParams.set('source', 'book');
    url.searchParams.set('source_id', sourceId);
    url.searchParams.set('limit', '200');

    // Best-effort — no error state shown; completion page is always useful.
    fetch(url.toString(), { method: 'GET', signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as Array<{ is_correct: boolean }>;
        const total = data.length;
        const correct = data.reduce((sum, a) => sum + (a.is_correct ? 1 : 0), 0);
        setStats({ total, correct });
      })
      .catch(() => undefined);

    return () => controller.abort();
  }, [sourceId]);

  const altType = type === 'course' ? 'classroom' : 'course';
  const altLabel = type === 'course' ? '▶ Open as Classroom' : '📖 Open as Course';

  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center gap-6 py-16 text-center">
      <div className="text-5xl">🎓</div>
      <div>
        <h2 className="font-serif text-2xl text-neutral-900 dark:text-neutral-50">
          You finished <span className="text-blue-600 dark:text-blue-400">{title}</span>
        </h2>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Great work making it to the end.
        </p>
      </div>

      {stats !== null && stats.total > 0 && (
        <div className="flex gap-6 text-center">
          <Stat label="Questions" value={stats.total} />
          <Stat label="Correct" value={stats.correct} />
          <Stat
            label="Accuracy"
            value={`${Math.round((stats.correct / stats.total) * 100)}%`}
          />
        </div>
      )}

      {onProjection && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-xs text-neutral-400 dark:text-neutral-500">
            Want a different perspective?
          </p>
          <button
            type="button"
            onClick={onProjection}
            className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm text-neutral-700 transition hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            {altLabel}
          </button>
          <p className="text-xs text-neutral-400 dark:text-neutral-500">
            View this {type} as a {altType}
          </p>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">{value}</span>
      <span className="text-xs text-neutral-500 dark:text-neutral-400">{label}</span>
    </div>
  );
}
