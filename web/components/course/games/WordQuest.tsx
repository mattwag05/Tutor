'use client';

import { useState, useMemo } from 'react';
import { stripMarkdown } from '@/lib/utils/strip-markdown';
import type { Course, ProseBlock } from '@/lib/types/course';

export interface GlossaryEntry {
  term: string;
  clue: string;
}

export function extractGlossary(course: Course): GlossaryEntry[] {
  const seen = new Set<string>();
  const entries: GlossaryEntry[] = [];

  for (const section of course.sections) {
    for (const block of section.blocks) {
      if (block.type !== 'prose') continue;
      const prose = block as ProseBlock;
      for (const m of prose.markdown.matchAll(/\{\{term:([^}]+)\}\}/g)) {
        const term = m[1].trim();
        if (seen.has(term.toLowerCase())) continue;
        seen.add(term.toLowerCase());

        // Use the sentence containing the term as the definition clue.
        const plain = stripMarkdown(prose.markdown);
        const sentences = plain.split(/(?<=[.!?])\s+/);
        const clue =
          sentences.find((s) => s.toLowerCase().includes(term.toLowerCase()))?.replace(
            new RegExp(term, 'gi'),
            '___',
          ) ?? plain.slice(0, 120);

        if (clue) entries.push({ term, clue });
      }
    }
  }

  return entries;
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

interface Props {
  course: Course;
}

export function WordQuest({ course }: Props) {
  const glossary = useMemo(() => extractGlossary(course).slice(0, 10), [course]);
  const shuffledClues = useMemo(() => shuffle(glossary), [glossary]);

  const [selectedTerm, setSelectedTerm] = useState<string | null>(null);
  const [matched, setMatched] = useState<Record<string, string>>({});
  const [wrong, setWrong] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const score = Object.keys(matched).length;
  const matchedClues = useMemo(() => new Set(Object.values(matched)), [matched]);

  function handleTermClick(term: string) {
    if (matched[term] || done) return;
    setSelectedTerm((prev) => (prev === term ? null : term));
    setWrong(null);
  }

  function handleClueClick(clue: string) {
    if (!selectedTerm || done) return;
    const correct = glossary.find((e) => e.term === selectedTerm);
    if (!correct) return;

    if (correct.clue === clue) {
      const next = { ...matched, [selectedTerm]: clue };
      setMatched(next);
      setSelectedTerm(null);
      setWrong(null);
      if (Object.keys(next).length === glossary.length) setDone(true);
    } else {
      setWrong(selectedTerm);
      setTimeout(() => setWrong(null), 800);
    }
  }

  function reset() {
    setSelectedTerm(null);
    setMatched({});
    setWrong(null);
    setDone(false);
  }

  if (glossary.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-neutral-500">
        <p className="text-lg">No vocabulary terms found in this course.</p>
        <p className="text-sm">Terms appear in course sections as highlighted words.</p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-6 py-16">
        <div className="text-6xl">🎉</div>
        <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">
          Word Quest Complete!
        </h2>
        <p className="text-lg text-neutral-600 dark:text-neutral-400">
          {score} / {glossary.length} matched
        </p>
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-blue-600 px-6 py-2 text-white hover:bg-blue-700"
        >
          Play again
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-50">Word Quest</h2>
        <span className="text-sm text-neutral-500">
          {score} / {glossary.length} matched
        </span>
      </div>
      <p className="text-sm text-neutral-500">
        Select a term, then select its matching definition clue.
      </p>

      <div className="grid grid-cols-2 gap-4">
        {/* Terms column */}
        <div className="space-y-2">
          {glossary.map(({ term }) => {
            const isMatched = Boolean(matched[term]);
            const isSelected = selectedTerm === term;
            const isWrong = wrong === term;
            return (
              <button
                key={term}
                type="button"
                onClick={() => handleTermClick(term)}
                disabled={isMatched}
                className={[
                  'w-full rounded-lg border px-4 py-3 text-left text-sm font-medium transition',
                  isMatched
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                    : isWrong
                      ? 'border-rose-400 bg-rose-50 text-rose-700 dark:border-rose-600 dark:bg-rose-950 dark:text-rose-300'
                      : isSelected
                        ? 'border-blue-500 bg-blue-50 text-blue-800 ring-2 ring-blue-300 dark:border-blue-400 dark:bg-blue-950 dark:text-blue-200'
                        : 'border-neutral-200 bg-white text-neutral-800 hover:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200',
                ].join(' ')}
              >
                {term}
              </button>
            );
          })}
        </div>

        {/* Clues column */}
        <div className="space-y-2">
          {shuffledClues.map(({ clue }) => {
            const isMatched = matchedClues.has(clue);
            return (
              <button
                key={clue}
                type="button"
                onClick={() => handleClueClick(clue)}
                disabled={isMatched || !selectedTerm}
                className={[
                  'w-full rounded-lg border px-4 py-3 text-left text-sm transition',
                  isMatched
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                    : selectedTerm
                      ? 'border-neutral-200 bg-white text-neutral-700 hover:border-blue-400 hover:bg-blue-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-blue-950'
                      : 'border-neutral-200 bg-white text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900',
                ].join(' ')}
              >
                {clue}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
