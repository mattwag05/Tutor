'use client';

import { Fragment, memo, useMemo, type ReactNode } from 'react';
import katex from 'katex';
import type { ProseBlock, CourseCitation } from '@/lib/types/course';
import { GlossaryChip } from './GlossaryChip';
import { CitationPill } from './CitationPill';

interface ProseBlockProps {
  block: ProseBlock;
  citations: Record<string, CourseCitation>;
}

function ProseBlockViewInner({ block, citations }: ProseBlockProps) {
  // Tokenizing each paragraph is pure given the markdown string; memo so
  // re-renders (e.g. other sections hydrating) don't re-walk every span.
  const paragraphs = useMemo(
    () => block.markdown.split(/\n\s*\n/).filter((p) => p.trim()).map((p) => tokenize(p.trim())),
    [block.markdown],
  );

  return (
    <div className="prose-block space-y-4 text-[17px] leading-relaxed text-neutral-800 dark:text-neutral-200">
      {paragraphs.map((tokens, i) => (
        <p key={i}>{renderTokens(tokens, citations)}</p>
      ))}
    </div>
  );
}

export const ProseBlockView = memo(ProseBlockViewInner);

function renderTokens(
  tokens: Token[],
  citations: Record<string, CourseCitation>,
): ReactNode {
  return tokens.map((t, i) => {
    if (t.kind === 'text') {
      return <Fragment key={i}>{renderEmphasis(t.value)}</Fragment>;
    }
    if (t.kind === 'term') {
      return <GlossaryChip key={i} term={t.value} />;
    }
    if (t.kind === 'cite') {
      const cit = citations[t.value];
      if (!cit) return null;
      return <CitationPill key={i} citation={cit} />;
    }
    if (t.kind === 'math') {
      // KaTeX output is sanitized internally; input is LLM-generated LaTeX
      // which we further guard with throwOnError: false + strict: ignore.
      const html = safeKatex(t.value, false);
      return (
        <span
          key={i}
          className="inline-katex"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
    }
    return null;
  });
}

type Token =
  | { kind: 'text'; value: string }
  | { kind: 'term'; value: string }
  | { kind: 'cite'; value: string }
  | { kind: 'math'; value: string };

type Match = {
  start: number;
  end: number;
  kind: Exclude<Token['kind'], 'text'>;
  value: string;
};

function tokenize(input: string): Token[] {
  const matches: Match[] = [];

  for (const m of input.matchAll(/\{\{term:([^}]+)\}\}/g)) {
    const idx = m.index ?? 0;
    matches.push({ start: idx, end: idx + m[0].length, kind: 'term', value: m[1] });
  }
  for (const m of input.matchAll(/\{\{cite:([^}]+)\}\}/g)) {
    const idx = m.index ?? 0;
    matches.push({ start: idx, end: idx + m[0].length, kind: 'cite', value: m[1] });
  }
  for (const m of input.matchAll(/\$([^$\n]+)\$/g)) {
    const idx = m.index ?? 0;
    matches.push({ start: idx, end: idx + m[0].length, kind: 'math', value: m[1] });
  }

  matches.sort((a, b) => a.start - b.start);

  const filtered: Match[] = [];
  let cursor = 0;
  for (const m of matches) {
    if (m.start < cursor) continue;
    filtered.push(m);
    cursor = m.end;
  }

  const tokens: Token[] = [];
  let pos = 0;
  for (const m of filtered) {
    if (m.start > pos) {
      tokens.push({ kind: 'text', value: input.slice(pos, m.start) });
    }
    tokens.push({ kind: m.kind, value: m.value });
    pos = m.end;
  }
  if (pos < input.length) {
    tokens.push({ kind: 'text', value: input.slice(pos) });
  }
  return tokens;
}

function renderEmphasis(text: string): ReactNode {
  const parts: ReactNode[] = [];
  let key = 0;
  let lastIdx = 0;
  const matches = Array.from(text.matchAll(/(\*\*[^*]+\*\*|\*[^*]+\*)/g));
  for (const match of matches) {
    const idx = match.index ?? 0;
    if (idx > lastIdx) {
      parts.push(text.slice(lastIdx, idx));
    }
    const token = match[0];
    if (token.startsWith('**')) {
      parts.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    } else {
      parts.push(<em key={key++}>{token.slice(1, -1)}</em>);
    }
    lastIdx = idx + token.length;
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return parts.length > 0 ? parts : text;
}

function safeKatex(latex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(latex, {
      displayMode,
      throwOnError: false,
      strict: 'ignore',
    });
  } catch {
    return `<code>${escapeHtml(latex)}</code>`;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
