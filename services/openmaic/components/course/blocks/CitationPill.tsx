'use client';

import { useState } from 'react';
import type { CourseCitation } from '@/lib/types/course';

interface CitationPillProps {
  citation: CourseCitation;
  /** Compact pill style for inline use, vs block source line for pull quotes. */
  variant?: 'inline' | 'source';
}

/**
 * Small tappable citation pill. Shows the source name (e.g. "Beuke.org")
 * as a rounded chip. On tap, expands to reveal the full attribution text
 * and link, matching Oboe's behavior.
 */
export function CitationPill({ citation, variant = 'inline' }: CitationPillProps) {
  const [open, setOpen] = useState(false);

  const label = citation.source || 'Source';

  return (
    <span className="relative inline-block align-baseline">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={
          variant === 'inline'
            ? 'mx-0.5 inline-flex items-center rounded-md bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.78em] text-neutral-700 transition hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700'
            : 'inline-flex items-center rounded-md bg-neutral-100 px-2 py-0.5 font-mono text-xs text-neutral-700 transition hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700'
        }
      >
        {label}
      </button>
      {open && (
        <span className="absolute left-0 top-full z-30 mt-1 block w-72 rounded-lg border border-neutral-200 bg-white p-3 text-sm text-neutral-700 shadow-lg dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-500">
            {citation.source || 'Source'}
          </span>
          <span className="block leading-snug">{citation.text}</span>
          {citation.url && (
            <a
              href={citation.url}
              target="_blank"
              rel="noreferrer"
              className="mt-2 block text-xs text-blue-600 hover:underline dark:text-blue-400"
            >
              Open source ↗
            </a>
          )}
        </span>
      )}
    </span>
  );
}
