'use client';

import { ChevronLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();

  if (!nextTitle && !hasPrevious) return null;
  return (
    <div
      className="pointer-events-none fixed left-0 right-0 z-30 px-3 sm:px-4"
      style={{
        bottom: `${bottomOffset}px`,
        paddingBottom: `calc(0.5rem + env(safe-area-inset-bottom))`,
      }}
    >
      <div className="pointer-events-auto mx-auto flex max-w-2xl items-center gap-2 rounded-lg border border-neutral-200 bg-white/95 px-3 py-2 shadow-[0_14px_40px_rgba(85,67,43,0.12)] backdrop-blur sm:gap-3 sm:rounded-xl sm:py-3 sm:px-4 dark:border-neutral-800 dark:bg-neutral-950/95">
        {hasPrevious && onPrevious ? (
          <button
            type="button"
            onClick={onPrevious}
            aria-label={t('course.previousSection')}
            className="flex h-10 w-10 shrink-0 touch-manipulation items-center justify-center rounded-md border border-neutral-200 text-neutral-700 transition hover:bg-neutral-50 sm:h-11 sm:w-11 sm:rounded-lg dark:border-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-900"
          >
            <ChevronLeft size={18} strokeWidth={2} />
          </button>
        ) : null}
        {nextTitle ? (
          <>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                {t('course.nextSection')}
              </span>
              <span className="truncate text-sm text-neutral-800 dark:text-neutral-200">
                {nextTitle}
              </span>
            </div>
            <button
              type="button"
              onClick={onAdvance}
              className="flex h-10 shrink-0 touch-manipulation items-center justify-center rounded-md bg-neutral-900 px-3 text-sm font-medium text-white transition hover:bg-neutral-800 sm:h-11 sm:rounded-lg sm:px-4 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white"
            >
              {t('course.advance')}
            </button>
          </>
        ) : (
          <div className="flex min-w-0 flex-1 flex-col text-sm text-neutral-500 dark:text-neutral-400">
            {t('course.lastSection')}
          </div>
        )}
      </div>
    </div>
  );
}
