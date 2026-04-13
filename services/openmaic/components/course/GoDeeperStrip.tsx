'use client';

import { useState } from 'react';

interface Props {
  prompts: string[];
  /**
   * Called when the user taps a prompt or submits free text. Phase 2
   * stub — Phase 3 will wire this to /api/generate/course-follow-up
   * and insert the returned sub-section inline.
   */
  onAsk: (prompt: string) => void;
  disabled?: boolean;
}

/**
 * The "GO DEEPER" strip shown at the end of every section.
 * 4–5 indented suggested follow-ups + a "Go deeper on…" free-text input.
 */
export function GoDeeperStrip({ prompts, onAsk, disabled }: Props) {
  const [text, setText] = useState('');

  const submit = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onAsk(trimmed);
    setText('');
  };

  return (
    <section className="my-12 border-t border-neutral-200 pt-6 dark:border-neutral-800">
      <div className="mb-4 inline-block rounded-sm bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400">
        Go deeper
      </div>
      <ul className="space-y-2">
        {prompts.map((prompt, i) => (
          <li key={i} className="flex items-start gap-3">
            <span aria-hidden className="mt-1 text-neutral-400">
              ↳
            </span>
            <button
              type="button"
              onClick={() => submit(prompt)}
              disabled={disabled}
              className="text-left text-[15px] leading-snug text-neutral-700 transition hover:text-neutral-900 disabled:opacity-60 dark:text-neutral-300 dark:hover:text-neutral-100"
            >
              {prompt}
            </button>
          </li>
        ))}
      </ul>
      <form
        className="mt-5 flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-4 py-2 dark:border-neutral-800 dark:bg-neutral-950"
        onSubmit={(e) => {
          e.preventDefault();
          submit(text);
        }}
      >
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Go deeper on…"
          disabled={disabled}
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-neutral-400 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={disabled || !text.trim()}
          aria-label="Ask"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-900 text-white disabled:opacity-40 dark:bg-neutral-100 dark:text-neutral-900"
        >
          ↑
        </button>
      </form>
    </section>
  );
}
