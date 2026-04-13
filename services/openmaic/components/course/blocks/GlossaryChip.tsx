'use client';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface GlossaryChipProps {
  term: string;
  /** Optional pre-fetched definition. Phase 3 wires an on-demand lookup. */
  definition?: string;
}

export function GlossaryChip({ term, definition }: GlossaryChipProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-baseline gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 font-sans text-[0.9em] text-amber-900 transition hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-950/60"
        >
          <span aria-hidden className="font-serif text-[0.85em] italic opacity-60">
            𝔯
          </span>
          <span>{term}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
          {term}
        </div>
        <div className="text-sm leading-snug">
          {definition ?? 'Definition loading…'}
        </div>
      </PopoverContent>
    </Popover>
  );
}
