'use client';

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  content: string;
}

type Token =
  | { kind: 'h2'; text: string }
  | { kind: 'h3'; text: string }
  | { kind: 'bullet'; text: string }
  | { kind: 'para'; text: string }
  | { kind: 'hr' };

function tokenize(markdown: string): Token[] {
  const tokens: Token[] = [];
  const lines = markdown.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === '') { i++; continue; }
    if (trimmed === '---' || trimmed === '***' || trimmed === '___') {
      tokens.push({ kind: 'hr' });
      i++;
      continue;
    }
    if (trimmed.startsWith('### ')) {
      tokens.push({ kind: 'h3', text: trimmed.slice(4) });
      i++;
      continue;
    }
    if (trimmed.startsWith('## ')) {
      tokens.push({ kind: 'h2', text: trimmed.slice(3) });
      i++;
      continue;
    }
    if (trimmed.startsWith('# ')) {
      tokens.push({ kind: 'h2', text: trimmed.slice(2) });
      i++;
      continue;
    }
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      tokens.push({ kind: 'bullet', text: trimmed.slice(2) });
      i++;
      continue;
    }
    // Numbered list items collapse to bullets for simplicity
    if (/^\d+\.\s/.test(trimmed)) {
      tokens.push({ kind: 'bullet', text: trimmed.replace(/^\d+\.\s/, '') });
      i++;
      continue;
    }
    tokens.push({ kind: 'para', text: trimmed });
    i++;
  }

  return tokens;
}

/** Render inline markdown: **bold**, *italic*, `code` */
function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i} className="rounded bg-neutral-100 px-1 text-sm dark:bg-neutral-800">{part.slice(1, -1)}</code>;
    }
    return part;
  });
}

export function StudyGuideView({ content }: Props) {
  const { t } = useTranslation('app');
  const tokens = useMemo(() => tokenize(content), [content]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex justify-end">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-md border border-neutral-200 px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-900"
        >
          {t('Print')}
        </button>
      </div>

      <div className="space-y-3 print:space-y-2">
        {tokens.map((token, i) => {
          if (token.kind === 'hr') {
            return <hr key={i} className="my-6 border-neutral-200 dark:border-neutral-800" />;
          }
          if (token.kind === 'h2') {
            return (
              <h2 key={i} className="mt-8 font-serif text-2xl text-neutral-900 first:mt-0 dark:text-neutral-50">
                {renderInline(token.text)}
              </h2>
            );
          }
          if (token.kind === 'h3') {
            return (
              <h3 key={i} className="mt-5 text-base font-semibold text-neutral-800 dark:text-neutral-200">
                {renderInline(token.text)}
              </h3>
            );
          }
          if (token.kind === 'bullet') {
            return (
              <div key={i} className="flex gap-2 text-neutral-700 dark:text-neutral-300">
                <span className="mt-0.5 shrink-0 text-neutral-400">•</span>
                <span className="text-sm leading-relaxed">{renderInline(token.text)}</span>
              </div>
            );
          }
          return (
            <p key={i} className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
              {renderInline(token.text)}
            </p>
          );
        })}
      </div>
    </div>
  );
}
