'use client';

import { ChevronLeft } from 'lucide-react';

interface Props {
  nextTitle?: string;
  onAdvance: () => void;
  onPrevious?: () => void;
  hasPrevious?: boolean;
  /** Extra bottom offset (px) to clear the sticky section progress bar. */
  bottomOffset?: number;
}

export function AdvanceBar({
  nextTitle,
  onAdvance,
  onPrevious,
  hasPrevious,
  bottomOffset = 0,
}: Props) {
  if (!nextTitle && !hasPrevious) return null;
  return (
    <div
      className="pointer-events-none fixed left-0 right-0 z-30 px-4"
      style={{
        bottom: `${bottomOffset}px`,
        paddingBottom: `calc(1rem + env(safe-area-inset-bottom))`,
      }}
    >
      <div className="pointer-events-auto mx-auto flex max-w-2xl items-center gap-3 rounded-xl border border-neutral-200 bg-white/95 px-3 py-3 shadow-lg backdrop-blur sm:px-4 dark:border-neutral-800 dark:bg-neutral-950/95">
        {hasPrevious && onPrevious ? (
          <button
            type="button"
            onClick={onPrevious}
            aria-label="Previous section"
            className="flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-lg border border-neutral-200 text-neutral-700 transition hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-900"
          >
            <ChevronLeft size={18} strokeWidth={2} />
          </button>
        ) : null}
        {nextTitle ? (
          <>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                Next section
              </span>
              <span className="truncate text-sm text-neutral-800 dark:text-neutral-200">
                {nextTitle}
              </span>
            </div>
            <button
              type="button"
              onClick={onAdvance}
              className="flex h-11 shrink-0 touch-manipulation items-center justify-center rounded-lg bg-neutral-900 px-4 text-sm font-medium text-white transition hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white"
            >
              Advance
            </button>
          </>
        ) : (
          <div className="flex min-w-0 flex-1 flex-col text-sm text-neutral-500 dark:text-neutral-400">
            You&rsquo;re on the last section.
          </div>
        )}
      </div>
    </div>
  );
}
