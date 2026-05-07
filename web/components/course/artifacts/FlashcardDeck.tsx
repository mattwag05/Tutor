'use client';

import { useState, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils/cn';

interface Card {
  id: string;
  sectionId: string;
  front: string;
  back: string;
}

interface Props {
  cards: Card[];
}

export function FlashcardDeck({ cards: initialCards }: Props) {
  const [cards, setCards] = useState(initialCards);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState<Set<string>>(new Set());

  const current = cards[index];

  const next = useCallback(() => {
    setFlipped(false);
    setIndex((i) => (i + 1) % cards.length);
  }, [cards.length]);

  const prev = useCallback(() => {
    setFlipped(false);
    setIndex((i) => (i - 1 + cards.length) % cards.length);
  }, [cards.length]);

  const shuffle = useCallback(() => {
    setCards((c) => [...c].sort(() => Math.random() - 0.5));
    setIndex(0);
    setFlipped(false);
  }, []);

  const toggleKnown = useCallback(() => {
    if (!current) return;
    setKnown((k) => {
      const next = new Set(k);
      if (next.has(current.id)) next.delete(current.id);
      else next.add(current.id);
      return next;
    });
  }, [current]);

  // Keyboard navigation: Space = flip, Left = prev, Right = next, K = known
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'Space') { e.preventDefault(); setFlipped((f) => !f); }
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'k' || e.key === 'K') toggleKnown();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [next, prev, toggleKnown]);

  if (!current) return <div className="py-16 text-center text-neutral-400">No cards available.</div>;

  const isKnown = known.has(current.id);

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-6 px-4 py-10">
      {/* Progress */}
      <div className="flex w-full items-center justify-between text-xs text-neutral-400">
        <span>{index + 1} / {cards.length}</span>
        <span className="text-emerald-600 dark:text-emerald-400">{known.size} known</span>
      </div>

      {/* Card */}
      <div
        role="button"
        tabIndex={0}
        aria-label={flipped ? 'Show question side' : 'Show answer side'}
        aria-pressed={flipped}
        onClick={() => setFlipped((f) => !f)}
        onKeyDown={(e) => {
          if (e.code === 'Space' || e.key === 'Enter') {
            e.preventDefault();
            setFlipped((f) => !f);
          }
        }}
        className="relative h-64 w-full cursor-pointer"
        style={{ perspective: '1000px' }}
      >
        <div
          className="relative h-full w-full transition-transform duration-500"
          style={{ transformStyle: 'preserve-3d', transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
        >
          {/* Front */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl border border-neutral-200 bg-white px-6 py-6 text-center shadow-sm dark:border-neutral-700 dark:bg-neutral-900"
            style={{ backfaceVisibility: 'hidden' }}
          >
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">Question</div>
            <div className="font-serif text-xl text-neutral-900 dark:text-neutral-50">{current.front}</div>
            <div className="mt-4 text-xs text-neutral-400">Tap or press Space to flip</div>
          </div>
          {/* Back */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl border border-neutral-200 bg-neutral-50 px-6 py-6 text-center shadow-sm dark:border-neutral-700 dark:bg-neutral-900"
            style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
          >
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">Answer</div>
            <div className="text-base text-neutral-800 dark:text-neutral-200">{current.back}</div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={prev}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-900"
          aria-label="Previous card"
        >
          ←
        </button>
        <button
          type="button"
          onClick={toggleKnown}
          className={cn(
            'rounded-full px-4 py-1.5 text-sm font-medium transition',
            isKnown
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
              : 'border border-neutral-200 text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400',
          )}
          aria-pressed={isKnown}
        >
          {isKnown ? 'Known ✓' : 'Mark known'}
        </button>
        <button
          type="button"
          onClick={next}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-900"
          aria-label="Next card"
        >
          →
        </button>
      </div>

      {/* Shuffle */}
      <button
        type="button"
        onClick={shuffle}
        className="text-xs text-neutral-400 underline-offset-2 hover:text-neutral-600 hover:underline dark:hover:text-neutral-200"
      >
        Shuffle
      </button>

      <div className="text-center text-xs text-neutral-300 dark:text-neutral-600">
        ← → to navigate · Space to flip · K to mark known
      </div>
    </div>
  );
}
