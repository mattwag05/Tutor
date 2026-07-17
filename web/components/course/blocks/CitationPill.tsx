'use client';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils/cn';
import type { CourseCitation } from '@/lib/types/course';
import { useTranslation } from 'react-i18next';

interface CitationPillProps {
  citation: CourseCitation;
  variant?: 'inline' | 'source';
}

export function CitationPill({ citation, variant = 'inline' }: CitationPillProps) {
  const { t } = useTranslation();
  const label = citation.source || t('Source');
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex items-center rounded-md bg-neutral-100 font-mono text-neutral-700 transition hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700',
            variant === 'inline' ? 'mx-0.5 px-1.5 py-0.5 text-[0.78em]' : 'px-2 py-0.5 text-xs',
          )}
        >
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
          {label}
        </div>
        <div className="text-sm leading-snug">{citation.text}</div>
        {citation.url && (
          <a
            href={citation.url}
            target="_blank"
            rel="noreferrer"
            className="mt-2 block text-xs text-blue-600 hover:underline dark:text-blue-400"
          >
            {t('course.openSource')}
          </a>
        )}
      </PopoverContent>
    </Popover>
  );
}
