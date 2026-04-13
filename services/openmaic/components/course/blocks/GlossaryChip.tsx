'use client';

import { useState } from 'react';

/**
 * Glossary term chip — inline pill with a tappable popover definition.
 * Renders the 𝔯-style icon before the term, matching Oboe.
 *
 * For the MVP the definition is looked up via a best-effort on-demand
 * fetch (Phase 3 will wire this to a real "define" endpoint). Until
 * then, taps show a "coming soon" placeholder so the UX is intact.
 */
interface GlossaryChipProps {
  term: string;
  /** Optional pre-fetched definition. */
  definition?: string;
}

export function GlossaryChip({ term, definition }: GlossaryChipProps) {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-baseline gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 font-sans text-[0.9em] text-amber-900 transition hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-950/60"
      >
        <span
          aria-hidden
          className="font-serif text-[0.85em] opacity-60"
          style={{ fontStyle: 'italic' }}
        >
          𝔯
        </span>
        <span>{term}</span>
      </button>
      {open && (
        <span className="absolute left-0 top-full z-30 mt-1 block w-64 rounded-lg border border-amber-200 bg-white p-3 text-sm text-neutral-700 shadow-lg dark:border-amber-900 dark:bg-neutral-900 dark:text-neutral-200">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
            {term}
          </span>
          <span className="block leading-snug">
            {definition ?? 'Definition loading… (glossary lookup arrives in Phase 3)'}
          </span>
        </span>
      )}
    </span>
  );
}
