'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCourseStore } from '@/lib/course/store';
import type { CourseArtifacts, PodcastModeArtifact } from '@/lib/types/course';
import type { PodcastMode } from '@/lib/server/course-storage';

interface Props {
  podcast: NonNullable<CourseArtifacts['podcast']> | undefined;
}

export function PodcastPlayer({ podcast }: Props) {
  const { t } = useTranslation();
  const generateArtifact = useCourseStore.use.generateArtifact();
  const [mode, setMode] = useState<PodcastMode>(() => {
    if (podcast?.solo?.status === 'ready') return 'solo';
    if (podcast?.conversational?.status === 'ready') return 'conversational';
    return 'solo';
  });
  const [showTranscript, setShowTranscript] = useState(false);

  const current: PodcastModeArtifact | undefined = podcast?.[mode];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <ModeTabs mode={mode} onChange={setMode} />

      <ModeBody
        mode={mode}
        artifact={current}
        showTranscript={showTranscript}
        onToggleTranscript={() => setShowTranscript((v) => !v)}
        onGenerate={() => void generateArtifact('podcast', mode)}
      />

      <p className="text-center text-xs text-neutral-500 dark:text-neutral-500">
        {t('course.podcastModeHelp')}
      </p>
    </div>
  );
}

function ModeTabs({
  mode,
  onChange,
}: {
  mode: PodcastMode;
  onChange: (m: PodcastMode) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex justify-center">
      <div className="inline-flex rounded-full border border-neutral-300 bg-white p-1 text-sm dark:border-neutral-700 dark:bg-neutral-900">
        <ModeTab active={mode === 'solo'} onClick={() => onChange('solo')}>
          {t('course.podcastSoloNarration')}
        </ModeTab>
        <ModeTab active={mode === 'conversational'} onClick={() => onChange('conversational')}>
          {t('course.podcastConversational')}
        </ModeTab>
      </div>
    </div>
  );
}

function ModeTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'rounded-full px-4 py-1.5 transition ' +
        (active
          ? 'bg-neutral-900 text-white dark:bg-neutral-50 dark:text-neutral-900'
          : 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800')
      }
    >
      {children}
    </button>
  );
}

function ModeBody({
  mode,
  artifact,
  showTranscript,
  onToggleTranscript,
  onGenerate,
}: {
  mode: PodcastMode;
  artifact: PodcastModeArtifact | undefined;
  showTranscript: boolean;
  onToggleTranscript: () => void;
  onGenerate: () => void;
}) {
  const { t } = useTranslation();

  if (!artifact || artifact.status === 'pending') {
    return <GeneratePrompt mode={mode} onGenerate={onGenerate} />;
  }

  if (artifact.status === 'generating') {
    return <Generating />;
  }

  if (artifact.status === 'error') {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <p className="text-sm text-rose-600 dark:text-rose-400">
          {artifact.error || t('course.podcastGenerationFailed')}
        </p>
        <PrimaryButton onClick={onGenerate}>{t('course.tryAgain')}</PrimaryButton>
      </div>
    );
  }

  if (!artifact.audioUrl) {
    return <GeneratePrompt mode={mode} onGenerate={onGenerate} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <audio
        controls
        preload="metadata"
        src={artifact.audioUrl}
        className="w-full"
        aria-label={t('course.podcastAudioAria', {
          mode:
            mode === 'solo'
              ? t('course.podcastSoloNarration')
              : t('course.podcastConversational'),
        })}
      />
      <div className="flex items-center justify-between text-sm">
        <button
          type="button"
          onClick={onToggleTranscript}
          className="text-neutral-700 underline-offset-4 hover:underline dark:text-neutral-300"
        >
          {showTranscript ? t('course.hideTranscript') : t('course.showTranscript')}
        </button>
        <button
          type="button"
          onClick={onGenerate}
          className="text-neutral-500 underline-offset-4 hover:underline hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
        >
          {t('course.regenerateArtifact')}
        </button>
      </div>
      {showTranscript && artifact.transcript ? (
        <div className="max-h-[50vh] overflow-y-auto whitespace-pre-wrap rounded-md border border-neutral-200 bg-neutral-50 p-4 text-sm leading-relaxed text-neutral-800 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200">
          {artifact.transcript}
        </div>
      ) : null}
    </div>
  );
}

function GeneratePrompt({ mode, onGenerate }: { mode: PodcastMode; onGenerate: () => void }) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        {mode === 'solo' ? t('course.podcastSoloPrompt') : t('course.podcastConversationPrompt')}
      </p>
      <PrimaryButton onClick={onGenerate}>{t('course.generatePodcast')}</PrimaryButton>
    </div>
  );
}

function Generating() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <div
        aria-hidden
        className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900 dark:border-neutral-700 dark:border-t-neutral-50"
      />
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        {t('course.synthesizingPodcast')}
      </p>
    </div>
  );
}

function PrimaryButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full bg-neutral-900 px-5 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 dark:bg-neutral-50 dark:text-neutral-900 dark:hover:bg-neutral-200"
    >
      {children}
    </button>
  );
}
