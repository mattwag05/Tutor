'use client';

import { useEffect, useState, type RefObject } from 'react';

interface Props {
  /** Scroll container whose progress we track. */
  scrollRef: RefObject<HTMLElement | null>;
  /** 1-indexed position of the active section. */
  sectionNumber: number;
  /** Total number of sections. */
  sectionCount: number;
  /** Current section title (for screen readers + small label). */
  sectionTitle: string;
  /** Re-measure when this changes (e.g. activeIndex flips, content hydrates). */
  resetKey?: string | number;
  /** Optional parent hook for controls that should react to reading progress. */
  onProgressChange?: (progress: number) => void;
}

/** Rendered height in px. AdvanceBar uses this to clear the bar. */
export const SECTION_PROGRESS_BAR_HEIGHT = 44;

/** Sticky bottom progress bar for the active section. Tracks scroll progress
 *  through the active card and surfaces course-level position. */
export function SectionProgressBar({
  scrollRef,
  sectionNumber,
  sectionCount,
  sectionTitle,
  resetKey,
  onProgressChange,
}: Props) {
  const [pct, setPct] = useState(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const compute = () => {
      const max = el.scrollHeight - el.clientHeight;
      const next = max <= 0 ? 100 : Math.round(Math.min(1, Math.max(0, el.scrollTop / max)) * 100);
      setPct((prev) => (prev === next ? prev : next));
      onProgressChange?.(next);
    };

    compute();
    el.addEventListener('scroll', compute, { passive: true });
    const ro = new ResizeObserver(compute);
    ro.observe(el);

    return () => {
      el.removeEventListener('scroll', compute);
      ro.disconnect();
    };
  }, [onProgressChange, scrollRef, resetKey]);

  return (
    <div
      className="pointer-events-none fixed bottom-0 left-0 right-0 z-20"
      role="progressbar"
      aria-label={`Reading progress for ${sectionTitle}`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
    >
      <div className="pointer-events-auto border-t border-neutral-300 bg-white shadow-[0_-4px_12px_-4px_rgba(0,0,0,0.08)] dark:border-neutral-700 dark:bg-neutral-950 dark:shadow-[0_-4px_12px_-4px_rgba(0,0,0,0.5)]">
        {/* Track + fill — sits at the top of the strip so the eye lands on it first. */}
        <div className="relative h-2 w-full bg-neutral-200 dark:bg-neutral-800">
          <div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-neutral-700 to-neutral-900 shadow-[0_0_8px_rgba(0,0,0,0.15)] transition-[width] duration-200 ease-out dark:from-neutral-200 dark:to-white dark:shadow-[0_0_8px_rgba(255,255,255,0.2)]"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-2.5 text-xs sm:px-6">
          <span className="font-mono font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-300">
            Section {sectionNumber} / {sectionCount}
          </span>
          <span className="hidden min-w-0 flex-1 truncate text-center text-neutral-500 sm:block dark:text-neutral-400">
            {sectionTitle}
          </span>
          <span
            className="font-mono font-semibold tabular-nums text-neutral-900 dark:text-neutral-50"
            aria-hidden
          >
            {pct}%
          </span>
        </div>
      </div>
    </div>
  );
}
