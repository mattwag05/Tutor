'use client';

interface Props {
  nextTitle?: string;
  onAdvance: () => void;
}

export function AdvanceBar({ nextTitle, onAdvance }: Props) {
  if (!nextTitle) return null;
  return (
    <div className="pointer-events-none fixed bottom-0 left-0 right-0 z-30 px-4 pb-4">
      <div className="pointer-events-auto mx-auto flex max-w-2xl items-center justify-between gap-4 rounded-xl border border-neutral-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95">
        <div className="flex min-w-0 flex-col">
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
          className="shrink-0 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white"
        >
          Advance
        </button>
      </div>
    </div>
  );
}
