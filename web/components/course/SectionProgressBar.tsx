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
}

/** Rendered height in px. AdvanceBar uses this to clear the bar. */
export const SECTION_PROGRESS_BAR_HEIGHT = 32;

/** Sticky bottom progress bar for the active section. Tracks scroll progress
 *  through the active card and surfaces course-level position. */
export function SectionProgressBar({
  scrollRef,
  sectionNumber,
  sectionCount,
  sectionTitle,
  resetKey,
}: Props) {
  const [pct, setPct] = useState(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const compute = () => {
      const max = el.scrollHeight - el.clientHeight;
      const next = max <= 0 ? 0 : Math.round(Math.min(1, Math.max(0, el.scrollTop / max)) * 100);
      setPct((prev) => (prev === next ? prev : next));
    };

    compute();
    el.addEventListener('scroll', compute, { passive: true });
    const ro = new ResizeObserver(compute);
    ro.observe(el);

    return () => {
      el.removeEventListener('scroll', compute);
      ro.disconnect();
    };
  }, [scrollRef, resetKey]);

  return (
    <div
      className="pointer-events-none fixed bottom-0 left-0 right-0 z-20 px-0"
      role="progressbar"
      aria-label={`Reading progress for ${sectionTitle}`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
    >
      <div className="pointer-events-auto border-t border-neutral-200/80 bg-white/85 backdrop-blur dark:border-neutral-800/80 dark:bg-neutral-950/85">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-1.5 text-[10px] font-mono uppercase tracking-wider text-neutral-500 sm:px-6 dark:text-neutral-400">
          <span>
            Section {sectionNumber} / {sectionCount}
          </span>
          <span className="truncate text-neutral-400 dark:text-neutral-500">{sectionTitle}</span>
          <span aria-hidden>{pct}%</span>
        </div>
        <div className="h-[3px] w-full bg-neutral-200/70 dark:bg-neutral-800/70">
          <div
            className="h-full bg-neutral-900 transition-[width] duration-150 ease-out dark:bg-neutral-100"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
