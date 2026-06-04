'use client';

import { useEffect } from 'react';
import { useI18n } from '@/lib/hooks/use-i18n';

interface Props {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

export function ArtifactModal({ title, onClose, children }: Props) {
  const { t } = useI18n();
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-neutral-950" role="dialog" aria-modal>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <div className="font-serif text-lg text-neutral-900 dark:text-neutral-50">{title}</div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close')}
          className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-900"
        >
          ✕
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}

/** Shown while the artifact is being generated. */
export function ArtifactGenerating({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-700 dark:border-neutral-700 dark:border-t-neutral-300" />
      <div className="text-sm text-neutral-500">{label}</div>
    </div>
  );
}

/** Shown on generation error. */
export function ArtifactError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div className="mx-auto max-w-md px-6 py-16 text-center" role="alert">
      <div className="mb-2 text-sm font-semibold text-rose-600 dark:text-rose-400">
        {t('course.generationFailed')}
      </div>
      <div className="mb-6 break-words text-sm text-neutral-500">{message}</div>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900"
      >
        {t('course.tryAgain')}
      </button>
    </div>
  );
}
