'use client';

import { useMemo } from 'react';
import katex from 'katex';
import { useTranslation } from 'react-i18next';
import type { MathBlock } from '@/lib/types/course';

interface Props {
  block: MathBlock;
  onExplain?: (latex: string) => void;
}

export function MathBlockView({ block, onExplain }: Props) {
  const { t } = useTranslation();
  const html = useMemo(() => {
    try {
      return katex.renderToString(block.latex, {
        displayMode: block.display,
        throwOnError: false,
        strict: 'ignore',
      });
    } catch {
      return `<code>${block.latex}</code>`;
    }
  }, [block.latex, block.display]);

  if (block.display) {
    return (
      <div className="my-8 flex flex-col items-center gap-2">
        <div
          className="w-full max-w-full overflow-x-auto px-1 text-center font-serif text-xl"
          dangerouslySetInnerHTML={{ __html: html }}
        />
        {block.explainable && onExplain && (
          <button
            type="button"
            onClick={() => onExplain(block.latex)}
            className="inline-flex items-center gap-1 rounded-full border border-neutral-300 bg-white px-3 py-1 text-xs text-neutral-700 transition hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            <span aria-hidden>✦</span>
            <span>{t('course.explainThis')}</span>
          </button>
        )}
      </div>
    );
  }

  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}
