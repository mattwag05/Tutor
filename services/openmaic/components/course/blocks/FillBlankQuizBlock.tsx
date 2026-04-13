'use client';

import { useState } from 'react';
import type { FillBlankQuizBlock } from '@/lib/types/course';
import { cn } from '@/lib/utils/cn';

interface Props {
  block: FillBlankQuizBlock;
}

/**
 * Fill-in-the-blank quiz renderer. Shows the question with the ___ marker
 * replaced by a visible blank underline. When `choices` is present, we
 * render A/B/C/D letter-circles below the question (mirroring the Oboe UX
 * observed in the recording).
 */
export function FillBlankQuizBlockView({ block }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);

  const onChoose = (letter: string) => {
    if (revealed) return;
    setSelected(letter);
    setRevealed(true);
  };

  const correct = revealed && selected === block.correctAnswer;

  // Split question on ___ so we can render the blank as a real React element.
  const parts = block.question.split(/_{3,}/);

  return (
    <div className="my-10 rounded-xl border border-neutral-200 bg-neutral-50 p-5 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="mb-4 inline-block rounded-sm bg-neutral-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
        Fill in the blank
      </div>
      <p className="text-lg leading-relaxed text-neutral-800 dark:text-neutral-100">
        {parts.map((part, i) => (
          <span key={i}>
            {part}
            {i < parts.length - 1 && (
              <span className="mx-1 inline-block min-w-20 border-b-2 border-neutral-400 align-baseline">
                &nbsp;
              </span>
            )}
          </span>
        ))}
      </p>
      {block.choices && (
        <ul className="mt-5 space-y-2">
          {block.choices.map((choice, i) => {
            const letter = String.fromCharCode(65 + i);
            const isSelected = selected === letter;
            const isCorrectChoice = letter === block.correctAnswer;
            return (
              <li key={letter}>
                <button
                  type="button"
                  onClick={() => onChoose(letter)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-md border px-4 py-3 text-left transition',
                    !revealed &&
                      'border-neutral-200 hover:bg-white dark:border-neutral-800 dark:hover:bg-neutral-950',
                    revealed &&
                      isSelected &&
                      correct &&
                      'border-emerald-400 bg-emerald-50 dark:border-emerald-600 dark:bg-emerald-950/40',
                    revealed &&
                      isSelected &&
                      !correct &&
                      'border-rose-400 bg-rose-50 dark:border-rose-600 dark:bg-rose-950/40',
                    revealed &&
                      !isSelected &&
                      isCorrectChoice &&
                      'border-emerald-200 bg-emerald-50/60 dark:border-emerald-700 dark:bg-emerald-950/20',
                    revealed && !isSelected && !isCorrectChoice && 'opacity-60',
                  )}
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-neutral-300 text-xs font-semibold dark:border-neutral-700">
                    {letter}
                  </span>
                  <span className="text-sm text-neutral-800 dark:text-neutral-200">
                    {choice}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {revealed && (
        <div className="mt-5 border-t border-neutral-200 pt-4 dark:border-neutral-800">
          <div
            className={cn(
              'mb-2 inline-block rounded-sm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
              correct
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
                : 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200',
            )}
          >
            {correct ? 'Correct' : 'Incorrect'}
          </div>
          <p className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
            {block.explanation}
          </p>
        </div>
      )}
    </div>
  );
}
