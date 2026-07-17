'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { FillBlankQuizBlock, MultipleChoiceQuizBlock } from '@/lib/types/course';
import { cn } from '@/lib/utils/cn';

type Question = FillBlankQuizBlock | MultipleChoiceQuizBlock;
type ExamAnswer = string | number | null;

interface Props {
  questions: Question[];
}

function isFillBlank(q: Question): q is FillBlankQuizBlock {
  return q.type === 'fillBlankQuiz';
}

function answeredCorrectly(q: Question, answer: ExamAnswer): boolean {
  if (answer === null) return false;
  if (isFillBlank(q)) return answer === q.correctAnswer;
  return answer === (q as MultipleChoiceQuizBlock).correctIndex;
}

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function FinalExamView({ questions }: Props) {
  const { t } = useTranslation();
  const totalTime = questions.length * 90;
  const [secondsLeft, setSecondsLeft] = useState(totalTime);
  const [examAnswers, setExamAnswers] = useState<Record<string, ExamAnswer>>({});
  const [mode, setMode] = useState<'exam' | 'submitted'>('exam');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const submit = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setMode('submitted');
  }, []);

  useEffect(() => {
    if (mode !== 'exam') return;
    timerRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 0) {
          submit();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [mode, submit]);

  const setAnswer = useCallback((id: string, answer: ExamAnswer) => {
    setExamAnswers((prev) => ({ ...prev, [id]: answer }));
  }, []);

  const answeredCount = Object.values(examAnswers).filter((a) => a !== null && a !== undefined).length;
  const score = questions.filter((q) => answeredCorrectly(q, examAnswers[q.id] ?? null)).length;
  const pct = questions.length > 0 ? Math.round((score / questions.length) * 100) : 0;
  const timerUrgent = secondsLeft <= 60;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* Status bar */}
      <div className="mb-6 flex items-center justify-between">
        <div className="text-sm text-neutral-500">
          {mode === 'exam'
            ? t('course.examAnsweredCount', { answered: answeredCount, total: questions.length })
            : t('course.examScore', { score, total: questions.length })}
        </div>
        {mode === 'exam' ? (
          <div
            className={cn(
              'font-mono text-sm font-semibold tabular-nums',
              timerUrgent ? 'text-rose-600 dark:text-rose-400' : 'text-neutral-500',
            )}
          >
            {formatTime(secondsLeft)}
          </div>
        ) : (
          <div
            className={cn(
              'rounded-full px-3 py-1 text-sm font-semibold',
              pct >= 70
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                : 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300',
            )}
          >
            {pct}%
          </div>
        )}
      </div>

      {/* Questions */}
      <div className="space-y-8">
        {questions.map((q, qi) =>
          isFillBlank(q) ? (
            <ExamFillBlank
              key={q.id}
              q={q}
              index={qi}
              answer={examAnswers[q.id] ?? null}
              mode={mode}
              onAnswer={(a) => setAnswer(q.id, a)}
            />
          ) : (
            <ExamMultipleChoice
              key={q.id}
              q={q as MultipleChoiceQuizBlock}
              index={qi}
              answer={examAnswers[q.id] ?? null}
              mode={mode}
              onAnswer={(a) => setAnswer(q.id, a)}
            />
          ),
        )}
      </div>

      {/* Submit */}
      {mode === 'exam' && (
        <div className="mt-10 flex justify-center">
          <button
            type="button"
            onClick={submit}
            className="rounded-lg bg-neutral-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            {t('course.submitExam')}
          </button>
        </div>
      )}

      {mode === 'submitted' && (
        <div className="mt-6 text-center text-sm text-neutral-400">
          {pct >= 70
            ? t('course.examPassedMessage')
            : t('course.examReviewMessage')}
        </div>
      )}
    </div>
  );
}

// ── Question sub-components ───────────────────────────────────────────────────

interface FillBlankProps {
  q: FillBlankQuizBlock;
  index: number;
  answer: ExamAnswer;
  mode: 'exam' | 'submitted';
  onAnswer: (a: string) => void;
}

function ExamFillBlank({ q, index, answer, mode, onAnswer }: FillBlankProps) {
  const { t } = useTranslation();
  const parts = q.question.split(/_{3,}/);
  const correct = mode === 'submitted' && answer === q.correctAnswer;
  const wrong = mode === 'submitted' && answer !== null && answer !== q.correctAnswer;

  return (
    <div
      className={cn(
        'rounded-xl border p-5',
        mode === 'exam' && 'border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900',
        mode === 'submitted' &&
          correct &&
          'border-emerald-200 bg-emerald-50/30 dark:border-emerald-800 dark:bg-emerald-950/20',
        mode === 'submitted' &&
          wrong &&
          'border-rose-200 bg-rose-50/30 dark:border-rose-800 dark:bg-rose-950/20',
        mode === 'submitted' &&
          !correct &&
          !wrong &&
          'border-neutral-200 dark:border-neutral-800',
      )}
    >
      <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-400">
        {index + 1}. {t('course.fillBlank')}
      </div>
      <p className="text-base leading-relaxed text-neutral-800 dark:text-neutral-100">
        {parts.map((part, i) => (
          <span key={i}>
            {part}
            {i < parts.length - 1 && (
              <span
                aria-hidden="true"
                className="mx-1 inline-block min-w-16 border-b-2 border-neutral-400 align-baseline"
              />
            )}
          </span>
        ))}
      </p>
      {q.choices && (
        <ul className="mt-4 space-y-2">
          {q.choices.map((choice, ci) => {
            const letter = String.fromCharCode(65 + ci);
            const isSelected = answer === letter;
            const isCorrect = letter === q.correctAnswer;
            return (
              <li key={letter}>
                <button
                  type="button"
                  disabled={mode === 'submitted'}
                  aria-label={t('course.chooseAnswerAria', { letter, choice })}
                  onClick={() => onAnswer(letter)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-md border px-4 py-2.5 text-left text-sm transition',
                    mode === 'exam' &&
                      !isSelected &&
                      'border-neutral-200 hover:bg-white dark:border-neutral-700 dark:hover:bg-neutral-800',
                    mode === 'exam' &&
                      isSelected &&
                      'border-neutral-500 bg-white dark:border-neutral-400 dark:bg-neutral-800',
                    mode === 'submitted' &&
                      isSelected &&
                      isCorrect &&
                      'border-emerald-400 bg-emerald-50 dark:border-emerald-600 dark:bg-emerald-950/40',
                    mode === 'submitted' &&
                      isSelected &&
                      !isCorrect &&
                      'border-rose-400 bg-rose-50 dark:border-rose-600 dark:bg-rose-950/40',
                    mode === 'submitted' &&
                      !isSelected &&
                      isCorrect &&
                      'border-emerald-200 bg-emerald-50/60 dark:border-emerald-700 dark:bg-emerald-950/20',
                    mode === 'submitted' && !isSelected && !isCorrect && 'border-neutral-100 opacity-50',
                  )}
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current text-xs font-semibold">
                    {letter}
                  </span>
                  <span>{choice}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {mode === 'submitted' && (
        <div className="mt-4 border-t border-neutral-200 pt-3 dark:border-neutral-700">
          <span
            className={cn(
              'mb-2 inline-block rounded-sm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
              correct
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
                : 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200',
            )}
          >
            {answer === null ? t('quiz.notAnswered') : correct ? t('Correct') : t('Incorrect')}
          </span>
          <p className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
            {q.explanation}
          </p>
        </div>
      )}
    </div>
  );
}

interface MCProps {
  q: MultipleChoiceQuizBlock;
  index: number;
  answer: ExamAnswer;
  mode: 'exam' | 'submitted';
  onAnswer: (a: number) => void;
}

function ExamMultipleChoice({ q, index, answer, mode, onAnswer }: MCProps) {
  const { t } = useTranslation();
  const correct = mode === 'submitted' && answer === q.correctIndex;
  const wrong = mode === 'submitted' && answer !== null && answer !== q.correctIndex;

  return (
    <div
      className={cn(
        'rounded-xl border p-5',
        mode === 'exam' && 'border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900',
        mode === 'submitted' &&
          correct &&
          'border-emerald-200 bg-emerald-50/30 dark:border-emerald-800 dark:bg-emerald-950/20',
        mode === 'submitted' &&
          wrong &&
          'border-rose-200 bg-rose-50/30 dark:border-rose-800 dark:bg-rose-950/20',
        mode === 'submitted' &&
          !correct &&
          !wrong &&
          'border-neutral-200 dark:border-neutral-800',
      )}
    >
      <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-400">
        {index + 1}. {t('course.multipleChoice')}
      </div>
      <p className="text-base leading-relaxed text-neutral-800 dark:text-neutral-100">{q.question}</p>
      <ul className="mt-4 space-y-2">
        {q.choices.map((choice, ci) => {
          const letter = String.fromCharCode(65 + ci);
          const isSelected = answer === ci;
          const isCorrect = ci === q.correctIndex;
          return (
            <li key={ci}>
              <button
                type="button"
                disabled={mode === 'submitted'}
                aria-label={t('course.chooseAnswerAria', { letter, choice })}
                onClick={() => onAnswer(ci)}
                className={cn(
                  'flex w-full items-start gap-3 rounded-md border px-4 py-2.5 text-left text-sm transition',
                  mode === 'exam' &&
                    !isSelected &&
                    'border-neutral-200 hover:bg-white dark:border-neutral-700 dark:hover:bg-neutral-800',
                  mode === 'exam' &&
                    isSelected &&
                    'border-neutral-500 bg-white dark:border-neutral-400 dark:bg-neutral-800',
                  mode === 'submitted' &&
                    isSelected &&
                    isCorrect &&
                    'border-emerald-400 bg-emerald-50 dark:border-emerald-600 dark:bg-emerald-950/40',
                  mode === 'submitted' &&
                    isSelected &&
                    !isCorrect &&
                    'border-rose-400 bg-rose-50 dark:border-rose-600 dark:bg-rose-950/40',
                  mode === 'submitted' &&
                    !isSelected &&
                    isCorrect &&
                    'border-emerald-200 bg-emerald-50/60 dark:border-emerald-700 dark:bg-emerald-950/20',
                  mode === 'submitted' && !isSelected && !isCorrect && 'border-neutral-100 opacity-50',
                )}
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current text-xs font-semibold">
                  {letter}
                </span>
                <span>{choice}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {mode === 'submitted' && (
        <div className="mt-4 border-t border-neutral-200 pt-3 dark:border-neutral-700">
          <span
            className={cn(
              'mb-2 inline-block rounded-sm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
              correct
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
                : 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200',
            )}
          >
            {answer === null ? t('quiz.notAnswered') : correct ? t('Correct') : t('Incorrect')}
          </span>
          <p className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
            {q.explanation}
          </p>
        </div>
      )}
    </div>
  );
}
